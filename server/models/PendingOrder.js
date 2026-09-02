const mongoose = require('mongoose');

// Keyed by the Razorpay order id itself (used as _id), matching the old
// pending-orders.json object which was keyed the same way.
const pendingOrderSchema = new mongoose.Schema({
    _id: { type: String, alias: 'razorpayOrderId' },
    items: { type: [mongoose.Schema.Types.Mixed], required: true },
    customer: { type: mongoose.Schema.Types.Mixed, required: true },
    amount: { type: Number, required: true },
    receipt: { type: String, required: true }
});

pendingOrderSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.razorpayOrderId;
        return ret;
    }
});

module.exports = mongoose.model('PendingOrder', pendingOrderSchema);
