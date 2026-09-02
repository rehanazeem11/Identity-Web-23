function requireAdminKey(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

module.exports = requireAdminKey;
