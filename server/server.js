require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const ordersRouter = require('./routes/orders');
const productsRouter = require('./routes/products');
const seedProductsIfEmpty = require('./services/seedProducts');

const app = express();

// Configure CORS
const allowedOrigins = process.env.FRONTEND_ORIGIN 
    ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim())
    : ['*'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // Allow during transition/preflight or fallback
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Razorpay-Signature']
}));

// Preserve rawBody buffer for Razorpay webhook signature verification
// and support larger payloads for base64 image uploads
app.use(express.json({
    limit: '15mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.get('/api/health', function (req, res) {
    res.json({
        ok: true,
        service: 'identity-living-backend',
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        timestamp: new Date().toISOString()
    });
});

app.use('/api', ordersRouter);
app.use('/api', productsRouter);

// Global error handler
app.use(function (err, req, res, next) {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGODB_URI)
    .then(function () {
        console.log('Connected to MongoDB');
        return seedProductsIfEmpty();
    })
    .then(function () {
        app.listen(PORT, function () {
            console.log('IDENTITY backend running on port ' + PORT);
        });
    })
    .catch(function (err) {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    });

