const mongoose = require('mongoose');

// `id` is the app-generated product id used throughout the frontend
// ('p1'..'p4' for the seeded defaults, 'p_' + Date.now() for products
// added via the admin panel) — distinct from Mongo's own _id.
const productSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    price: { type: String, default: '' },
    numericPrice: { type: Number, default: 0 },
    tag: { type: String, default: '' },
    image: { type: String, default: '' },
    category: { type: String, default: '' }
});

productSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Product', productSchema);
