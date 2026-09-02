const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const requireAdminKey = require('../middleware/requireAdminKey');

// Mirrors the frontend's own getNumericPrice() parsing so a price typed as
// "Rs. 18,500" in the admin panel resolves to the same 18500 on both sides.
// numericPrice is always derived from price here — a client-sent numericPrice
// is never trusted, since checkout charges numericPrice directly and it must
// never be able to drift from the price string an admin actually typed.
function deriveNumericPrice(price) {
    const clean = String(price || '').replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
}

// GET /api/products — public catalogue read, used by the storefront and the admin panel.
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json({ products });
    } catch (err) {
        console.error('list-products error:', err);
        res.status(500).json({ error: 'Failed to load products.' });
    }
});

// POST /api/products — admin-only, creates a new catalogue product.
// Body: { id, title, price, tag, image, category }
router.post('/products', requireAdminKey, async (req, res) => {
    try {
        const { id, title, price, tag, image, category } = req.body || {};
        if (!id || !title) {
            return res.status(400).json({ error: 'id and title are required.' });
        }

        const product = await Product.create({
            id,
            title,
            price: price || '',
            numericPrice: deriveNumericPrice(price),
            tag: tag || '',
            image: image || '',
            category: category || ''
        });

        res.json({ product });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'A product with this id already exists.' });
        }
        console.error('create-product error:', err);
        res.status(500).json({ error: 'Failed to create product.' });
    }
});

// PUT /api/products/:id — admin-only, upserts a product's data. Used both for
// full edits and for single-field updates from the admin panel.
router.put('/products/:id', requireAdminKey, async (req, res) => {
    try {
        const update = { ...(req.body || {}), id: req.params.id };
        delete update.numericPrice; // never trust a client-sent value — always derive it below
        if (update.price !== undefined) {
            update.numericPrice = deriveNumericPrice(update.price);
        }

        const product = await Product.findOneAndUpdate(
            { id: req.params.id },
            { $set: update },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ product });
    } catch (err) {
        console.error('update-product error:', err);
        res.status(500).json({ error: 'Failed to update product.' });
    }
});

// DELETE /api/products/:id — admin-only.
router.delete('/products/:id', requireAdminKey, async (req, res) => {
    try {
        const deleted = await Product.findOneAndDelete({ id: req.params.id });
        if (!deleted) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('delete-product error:', err);
        res.status(500).json({ error: 'Failed to delete product.' });
    }
});

module.exports = router;
