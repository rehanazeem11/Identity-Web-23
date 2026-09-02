const mongoose = require('mongoose');

// `id` is the app-generated order id ('ord_' + timestamp), distinct from
// Mongo's own _id. items/customer are stored as-is — routes/orders.js
// already validates and shapes them before they reach this model.
const orderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], required: true },
    customer: { type: mongoose.Schema.Types.Mixed, required: true },
    amount: { type: Number, required: true },
    status: { type: String, required: true },
    createdAt: { type: Date, required: true }
});

orderSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Order', orderSchema);
