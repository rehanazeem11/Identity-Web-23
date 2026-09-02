/**
 * One-time repair: recomputes numericPrice from price for every product in
 * MongoDB. Needed because routes/products.js used to trust a client-sent
 * numericPrice instead of deriving it — a PUT made before that was fixed
 * could save a fresh price string alongside a stale numericPrice (checkout
 * and the cart both read numericPrice, so that stale value is what actually
 * gets charged/displayed, even though the price string looks correct).
 *
 * Usage (from server/): node scripts/repairNumericPrices.js
 * Requires MONGODB_URI in server/.env or the environment.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

function deriveNumericPrice(price) {
    const clean = String(price || '').replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
}

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('Set MONGODB_URI (in server/.env or the environment) before running this script.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const products = await Product.find();
    let fixed = 0;

    for (const product of products) {
        const correct = deriveNumericPrice(product.price);
        if (product.numericPrice !== correct) {
            console.log(
                product.id + ' (' + product.title + '): numericPrice ' +
                product.numericPrice + ' -> ' + correct + ' (price: "' + product.price + '")'
            );
            product.numericPrice = correct;
            await product.save();
            fixed++;
        }
    }

    console.log('Checked ' + products.length + ' products, fixed ' + fixed + '.');

    await mongoose.disconnect();
    console.log('Done.');
}

main().catch(function (err) {
    console.error('Repair failed:', err.message);
    process.exit(1);
});
