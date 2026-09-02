const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const {
    createOrder,
    verifySignature,
    verifyWebhookSignature
} = require('../services/razorpay');
const { sendOrderConfirmationEmail } = require('../services/email');
const { sendOrderConfirmationWhatsApp } = require('../services/whatsapp');
const {
    saveOrder,
    getAllOrders,
    getOrderByPaymentOrOrderId,
    savePendingOrder,
    getPendingOrder,
    removePendingOrder
} = require('../services/orderStore');
const requireAdminKey = require('../middleware/requireAdminKey');

// GET /api/config/razorpay-public-key
// Returns the public Razorpay Key ID (never the secret)
router.get('/config/razorpay-public-key', (req, res) => {
    res.json({
        keyId: process.env.RAZORPAY_KEY_ID || '',
        configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
    });
});

// POST /api/create-order
// Body: { items: [{ id, quantity, selectedSize, unitPrice?, title? }], customer: { name, phone, email, address, city, pincode } }
router.post('/create-order', async (req, res) => {
    try {
        const { items, customer } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty. Please add items to your bag.' });
        }

        if (!customer || !customer.name || !customer.phone || !customer.email || !customer.address) {
            return res.status(400).json({ error: 'Customer name, phone, email, and address are required.' });
        }

        // Verify Razorpay credentials exist before proceeding
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay credentials missing in environment variables (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).');
            return res.status(500).json({
                error: 'Payment gateway is not currently configured on the server. Please contact support.'
            });
        }

        // Validate items and fetch prices securely from MongoDB database
        const itemIds = items.map(function (item) { return item.id; }).filter(Boolean);
        const dbProducts = await Product.find({ id: { $in: itemIds } });
        const dbProductsById = new Map(dbProducts.map(function (p) { return [p.id, p]; }));

        let totalAmount = 0;
        const validatedItems = items.map(function (item) {
            const known = dbProductsById.get(item.id);
            // If product is known in database, use database price. Otherwise sanitize fallback price.
            const unitPrice = known ? Number(known.numericPrice) : Math.max(0, Number(item.unitPrice) || 0);
            const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
            totalAmount += unitPrice * quantity;

            return {
                id: item.id || ('item_' + Math.random().toString(36).substring(2, 7)),
                title: known ? known.title : (item.title || 'Statement Piece'),
                unitPrice,
                quantity,
                selectedSize: item.selectedSize || 'Standard',
                image: item.image || (known ? known.image : '')
            };
        });

        if (totalAmount <= 0) {
            return res.status(400).json({ error: 'Invalid order amount calculated.' });
        }

        const amountInPaise = Math.round(totalAmount * 100);
        const receipt = 'rcpt_' + Date.now();
        const notes = {
            customer_name: String(customer.name).substring(0, 40),
            customer_phone: String(customer.phone).substring(0, 20),
            customer_email: String(customer.email).substring(0, 60),
            customer_city: String(customer.city || '').substring(0, 30),
            customer_pincode: String(customer.pincode || '').substring(0, 10)
        };

        // Create official order with Razorpay
        const razorpayOrder = await createOrder(amountInPaise, receipt, notes);

        // Store pending order in MongoDB
        await savePendingOrder(razorpayOrder.id, {
            items: validatedItems,
            customer: {
                name: customer.name.trim(),
                phone: customer.phone.trim(),
                email: customer.email.trim(),
                address: customer.address.trim(),
                city: (customer.city || '').trim(),
                pincode: (customer.pincode || '').trim()
            },
            amount: totalAmount,
            receipt,
            createdAt: new Date()
        });

        // Return Razorpay order details and public key to frontend (NEVER return secret)
        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency || 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('create-order error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to create payment order.' });
    }
});

// POST /api/verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Missing required payment verification parameters.' });
        }

        // 1. Verify Razorpay cryptographic signature using the secret key
        const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (!isValid) {
            console.warn(`Payment signature verification failed for Order ${razorpay_order_id}, Payment ${razorpay_payment_id}`);
            return res.status(400).json({ success: false, error: 'Payment signature verification failed.' });
        }

        // 2. Idempotency Check: Check if order has already been finalized
        const existingOrder = await getOrderByPaymentOrOrderId(razorpay_payment_id, razorpay_order_id);
        if (existingOrder) {
            return res.json({
                success: true,
                order: existingOrder,
                message: 'Order already verified and confirmed.'
            });
        }

        // 3. Retrieve the pending order details created during /api/create-order
        const pending = await getPendingOrder(razorpay_order_id);
        if (!pending) {
            return res.status(404).json({
                success: false,
                error: 'Order session expired or not found. Please contact support with Payment ID: ' + razorpay_payment_id
            });
        }

        // 4. Create confirmed order record in MongoDB
        const order = {
            id: 'ord_' + Date.now(),
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            items: pending.items,
            customer: pending.customer,
            amount: pending.amount,
            status: 'paid',
            createdAt: new Date()
        };

        await saveOrder(order);

        // 5. Clean up pending order
        await removePendingOrder(razorpay_order_id).catch(function (e) {
            console.warn('Could not remove pending order:', e.message);
        });

        // 6. Asynchronously trigger confirmation emails & WhatsApp
        sendOrderConfirmationEmail(order).catch(function (err) {
            console.error('Order email failed for ' + order.id + ':', err.message);
        });
        sendOrderConfirmationWhatsApp(order).catch(function (err) {
            console.error('Order WhatsApp failed for ' + order.id + ':', err.message);
        });

        res.json({ success: true, order });
    } catch (err) {
        console.error('verify-payment error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Payment verification failed.' });
    }
});

// POST /api/webhook/razorpay
// Handles asynchronous Razorpay webhook events (e.g. payment.captured, order.paid)
router.post('/webhook/razorpay', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        if (!signature) {
            return res.status(400).json({ error: 'Missing X-Razorpay-Signature header' });
        }

        const isValid = verifyWebhookSignature(req.rawBody, signature);
        if (!isValid) {
            console.warn('Razorpay webhook signature verification failed.');
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        const event = req.body;
        const eventType = event.event;

        if (eventType === 'payment.captured' || eventType === 'order.paid') {
            const paymentEntity = (event.payload && event.payload.payment && event.payload.payment.entity) || {};
            const orderEntity = (event.payload && event.payload.order && event.payload.order.entity) || {};

            const razorpayOrderId = paymentEntity.order_id || orderEntity.id;
            const razorpayPaymentId = paymentEntity.id;

            if (razorpayOrderId) {
                const existingOrder = await getOrderByPaymentOrOrderId(razorpayPaymentId, razorpayOrderId);
                if (!existingOrder) {
                    const pending = await getPendingOrder(razorpayOrderId);
                    if (pending) {
                        const order = {
                            id: 'ord_' + Date.now(),
                            razorpayOrderId,
                            razorpayPaymentId: razorpayPaymentId || ('pay_wh_' + Date.now()),
                            items: pending.items,
                            customer: pending.customer,
                            amount: pending.amount,
                            status: 'paid',
                            createdAt: new Date()
                        };

                        await saveOrder(order);
                        await removePendingOrder(razorpayOrderId);

                        sendOrderConfirmationEmail(order).catch(function (err) {
                            console.error('Webhook: Order email failed for ' + order.id + ':', err.message);
                        });
                        sendOrderConfirmationWhatsApp(order).catch(function (err) {
                            console.error('Webhook: Order WhatsApp failed for ' + order.id + ':', err.message);
                        });
                    }
                }
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Razorpay webhook error:', err.message);
        res.status(500).json({ error: 'Webhook processing error' });
    }
});

// GET /api/orders — for the admin dashboard. Requires X-Admin-Key header.
router.get('/orders', requireAdminKey, async (req, res) => {
    const orders = await getAllOrders();
    res.json({ orders });
});

module.exports = router;

