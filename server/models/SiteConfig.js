const mongoose = require('mongoose');

// Singleton document (id: 'main') for small site-wide settings that don't
// belong in any other collection — currently just which GridFS file (in
// the 'videos' bucket, see routes/video.js) is the active brand video.
const siteConfigSchema = new mongoose.Schema({
    id: { type: String, default: 'main', unique: true },
    activeVideoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    activeVideoContentType: { type: String, default: '' },
    activeVideoFileName: { type: String, default: '' }
});

module.exports = mongoose.model('SiteConfig', siteConfigSchema);
