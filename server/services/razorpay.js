const Razorpay = require('razorpay');
const crypto = require('crypto');

function getInstance() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment variables.');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret
    });
}

async function createOrder(amountInPaise, receipt, notes = {}) {
    if (!amountInPaise || amountInPaise <= 0) {
        throw new Error('Invalid order amount for Razorpay order creation.');
    }

    const instance = getInstance();
    const options = {
        amount: Math.round(amountInPaise),
        currency: 'INR',
        receipt: receipt || ('rcpt_' + Date.now()),
        payment_capture: 1,
        notes: notes || {}
    };

    return instance.orders.create(options);
}

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function verifySignature(orderId, paymentId, signature) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret || !orderId || !paymentId || !signature) {
        return false;
    }

    try {
        const generated = crypto
            .createHmac('sha256', secret)
            .update(orderId + '|' + paymentId)
            .digest('hex');
        return safeCompare(generated, signature);
    } catch (err) {
        console.error('Razorpay signature verification error:', err.message);
        return false;
    }
}

function verifyWebhookSignature(rawBody, signature, customSecret) {
    const secret = customSecret || process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    if (!secret || !signature || !rawBody) {
        return false;
    }

    try {
        const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
        const generated = crypto
            .createHmac('sha256', secret)
            .update(bodyString)
            .digest('hex');
        return safeCompare(generated, signature);
    } catch (err) {
        console.error('Razorpay webhook signature verification error:', err.message);
        return false;
    }
}

async function fetchPayment(paymentId) {
    const instance = getInstance();
    return instance.payments.fetch(paymentId);
}

async function fetchOrder(orderId) {
    const instance = getInstance();
    return instance.orders.fetch(orderId);
}

module.exports = {
    getInstance,
    createOrder,
    verifySignature,
    verifyWebhookSignature,
    fetchPayment,
    fetchOrder
};

