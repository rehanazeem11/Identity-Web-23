/**
 * One-time backfill: copies the real product photos (currently only stored
 * as base64 data URIs inside index.html's window.DEFAULT_PRODUCTS array)
 * into the MongoDB Product documents for p1-p4, whose `image` field is
 * empty because server/products.js — what seedProducts.js seeds from —
 * never had an image field to begin with.
 *
 * Usage (from server/): node scripts/backfillDefaultProductImages.js
 * Requires MONGODB_URI in server/.env or the environment.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/Product');

const INDEX_HTML_PATH = path.join(__dirname, '..', '..', 'index.html');
const IDS = ['p1', 'p2', 'p3', 'p4'];

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('Set MONGODB_URI (in server/.env or the environment) before running this script.');
        process.exit(1);
    }
    if (!fs.existsSync(INDEX_HTML_PATH)) {
        console.error('Could not find index.html at ' + INDEX_HTML_PATH);
        process.exit(1);
    }

    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const blockMatch = html.match(/window\.DEFAULT_PRODUCTS\s*=\s*\[([\s\S]*?)\n\s*\];/);
    if (!blockMatch) {
        console.error('Could not find window.DEFAULT_PRODUCTS in index.html — nothing to backfill.');
        process.exit(1);
    }
    const block = blockMatch[1];

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    for (const id of IDS) {
        const entryMatch = block.match(new RegExp("id:\\s*'" + id + "'[\\s\\S]{0,1000}?image:\\s*'([^']+)'"));
        if (!entryMatch) {
            console.log(id + ': no image found in index.html, skipped.');
            continue;
        }
        const image = entryMatch[1];
        const result = await Product.updateOne({ id }, { $set: { image } });
        console.log(
            id + ': matched ' + result.matchedCount + ', modified ' + result.modifiedCount +
            ' (image data is ' + image.length + ' chars — content not printed)'
        );
    }

    await mongoose.disconnect();
    console.log('Done.');
}

main().catch(function (err) {
    console.error('Backfill failed:', err.message);
    process.exit(1);
});
