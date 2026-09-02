const Order = require('../models/Order');
const PendingOrder = require('../models/PendingOrder');

async function saveOrder(order) {
    return Order.create(order);
}

async function getAllOrders() {
    return Order.find().sort({ createdAt: -1 });
}

async function getOrderByPaymentOrOrderId(razorpayPaymentId, razorpayOrderId) {
    const query = [];
    if (razorpayPaymentId) query.push({ razorpayPaymentId });
    if (razorpayOrderId) query.push({ razorpayOrderId });
    if (query.length === 0) return null;
    return Order.findOne({ $or: query });
}

async function savePendingOrder(razorpayOrderId, data) {
    await PendingOrder.findByIdAndUpdate(
        razorpayOrderId,
        { $set: data },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function getPendingOrder(razorpayOrderId) {
    return PendingOrder.findById(razorpayOrderId).lean();
}

async function removePendingOrder(razorpayOrderId) {
    await PendingOrder.findByIdAndDelete(razorpayOrderId);
}

module.exports = {
    saveOrder,
    getAllOrders,
    getOrderByPaymentOrOrderId,
    savePendingOrder,
    getPendingOrder,
    removePendingOrder
};

