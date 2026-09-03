require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const ordersRouter = require('./routes/orders');
const productsRouter = require('./routes/products');
const videoRouter = require('./routes/video');
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Razorpay-Signature', 'X-File-Name'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
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
app.use('/api', videoRouter);

// Global error handler
app.use(function (err, req, res, next) {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 4000;

// On a free-tier (M0) Atlas cluster, connection/query latency is highly
// variable — minPoolSize keeps at least one connection warm instead of the
// pool dropping to 0 and paying a full reconnect on the next request;
// serverSelectionTimeoutMS is trimmed from the 30s default so a genuinely
// stuck request fails faster rather than hanging near a full minute.
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    minPoolSize: 1,
    maxPoolSize: 10
})
    .then(function () {
        console.log('Connected to MongoDB');
        return seedProductsIfEmpty();
    })
    .then(function () {
        app.listen(PORT, function () {
            console.log('IDENTITY backend running on port ' + PORT);
        });

        // Keeps the pooled connection from going idle between requests —
        // without this, a quiet stretch can mean the next real request pays
        // the cost of re-establishing a connection to the shared M0 cluster.
        setInterval(function () {
            mongoose.connection.db.admin().ping().catch(function (err) {
                console.error('MongoDB keep-alive ping failed:', err.message);
            });
        }, 4 * 60 * 1000);
    })
    .catch(function (err) {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    });

