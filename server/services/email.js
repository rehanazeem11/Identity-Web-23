const nodemailer = require('nodemailer');

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

function formatMoney(n) {
    return 'Rs. ' + Number(n).toLocaleString('en-IN');
}

function buildOrderEmailHTML(order) {
    const rows = order.items.map(function (item) {
        return '<tr>' +
            '<td style="padding:10px 0; border-bottom:1px solid #eee;">' + item.title +
            (item.selectedSize ? ' <span style="color:#888;">(' + item.selectedSize + ')</span>' : '') +
            ' &times; ' + item.quantity + '</td>' +
            '<td style="padding:10px 0; border-bottom:1px solid #eee; text-align:right; white-space:nowrap;">' +
            formatMoney(item.unitPrice * item.quantity) + '</td>' +
            '</tr>';
    }).join('');

    return '<div style="font-family: Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; color:#121314;">' +
        '<h2 style="letter-spacing:-0.02em; margin-bottom:4px;">IDENTITY</h2>' +
        '<p style="color:#666; margin-top:0;">Order Confirmation</p>' +
        '<p>Hi ' + (order.customer && order.customer.name ? order.customer.name : 'there') + ',</p>' +
        '<p>Thank you for your order — here\'s your confirmation.</p>' +
        '<table style="width:100%; border-collapse:collapse; margin:20px 0;">' + rows + '</table>' +
        '<p style="font-size:1.1rem; font-weight:bold; text-align:right;">Total: ' + formatMoney(order.amount) + '</p>' +
        '<p style="color:#666; font-size:0.85rem;">Order ID: ' + order.id + '<br>Payment ID: ' + order.razorpayPaymentId + '</p>' +
        '<p>We\'ll be in touch with shipping details shortly.</p>' +
        '<p style="color:#999; font-size:0.75rem; margin-top:32px;">IDENTITY LLP &middot; Gurugram, India</p>' +
        '</div>';
}

async function sendOrderConfirmationEmail(order) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[email] Not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing) — skipping.');
        return;
    }
    const to = order.customer && order.customer.email;
    if (!to) {
        console.warn('[email] No customer email on order ' + order.id + ' — skipping.');
        return;
    }

    const transporter = getTransporter();
    const html = buildOrderEmailHTML(order);

    await transporter.sendMail({
        from: '"IDENTITY" <' + process.env.GMAIL_USER + '>',
        to,
        subject: 'Order Confirmed — ' + order.id,
        html
    });

    if (process.env.STORE_OWNER_EMAIL) {
        await transporter.sendMail({
            from: '"IDENTITY Orders" <' + process.env.GMAIL_USER + '>',
            to: process.env.STORE_OWNER_EMAIL,
            subject: 'New Order — ' + order.id + ' (' + formatMoney(order.amount) + ')',
            html
        });
    }
}

module.exports = { sendOrderConfirmationEmail };
