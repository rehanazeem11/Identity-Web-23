const Product = require('../models/Product');
const DEFAULT_PRODUCTS = require('../products');

// Runs once at startup. Only touches the collection when it's empty, so
// admin-added/edited products already in MongoDB are never overwritten.
async function seedProductsIfEmpty() {
    const count = await Product.countDocuments();
    if (count > 0) return;

    await Product.insertMany(DEFAULT_PRODUCTS.map(function (p) {
        return {
            id: p.id,
            title: p.title,
            price: 'Rs. ' + p.numericPrice.toLocaleString('en-IN'),
            numericPrice: p.numericPrice,
            tag: '',
            image: '',
            category: ''
        };
    }));

    console.log('Seeded MongoDB with ' + DEFAULT_PRODUCTS.length + ' default products.');
}

module.exports = seedProductsIfEmpty;
