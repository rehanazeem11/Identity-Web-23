/**
 * Meta WhatsApp Cloud API — order confirmation messages.
 *
 * Important: Meta requires an approved message TEMPLATE for any message a
 * business sends first (i.e. not a reply within 24h of the customer
 * messaging you). You must create and get WHATSAPP_TEMPLATE_NAME approved
 * in Meta Business Manager before this will actually send anything —
 * approval can take anywhere from minutes to a few days. Until then this
 * will fail with a clear error in the logs, which is expected.
 *
 * Template used here is assumed to have a body with 4 placeholders:
 *   {{1}} customer name, {{2}} order id, {{3}} items summary, {{4}} total
 * Adjust buildComponents() below to match whatever template you approve.
 */

function formatMoney(n) {
    return 'Rs. ' + Number(n).toLocaleString('en-IN');
}

function buildComponents(order) {
    const itemsSummary = order.items.map(function (i) {
        return i.title + ' x' + i.quantity;
    }).join(', ');

    return [
        {
            type: 'body',
            parameters: [
                { type: 'text', text: (order.customer && order.customer.name) || 'Customer' },
                { type: 'text', text: order.id },
                { type: 'text', text: itemsSummary },
                { type: 'text', text: formatMoney(order.amount) }
            ]
        }
    ];
}

async function sendWhatsAppTemplate(toRaw, components) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'order_confirmation';

    const to = String(toRaw).replace(/[^\d]/g, '');

    const resp = await fetch('https://graph.facebook.com/v19.0/' + phoneNumberId + '/messages', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'en_US' },
                components
            }
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('WhatsApp send to ' + to + ' failed (' + resp.status + '): ' + errText);
    }
}

async function sendOrderConfirmationWhatsApp(order) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.warn('[whatsapp] Not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing) — skipping.');
        return;
    }

    const components = buildComponents(order);
    const customerPhone = order.customer && order.customer.phone;

    if (customerPhone) {
        await sendWhatsAppTemplate(customerPhone, components);
    } else {
        console.warn('[whatsapp] No customer phone on order ' + order.id + ' — skipping customer message.');
    }

    if (process.env.STORE_OWNER_WHATSAPP) {
        await sendWhatsAppTemplate(process.env.STORE_OWNER_WHATSAPP, components);
    }
}

module.exports = { sendOrderConfirmationWhatsApp };
