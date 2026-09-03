const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const requireAdminKey = require('../middleware/requireAdminKey');
const SiteConfig = require('../models/SiteConfig');

const BUCKET_NAME = 'videos';

function getBucket() {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

// POST /api/upload-video — admin-only. Body is the raw video file bytes
// (the frontend sends it directly, not as multipart/form-data), stored in
// MongoDB via GridFS so every visitor sees it, not just the uploading
// browser. Replaces whichever video was previously active.
router.post('/upload-video', requireAdminKey, express.raw({ type: '*/*', limit: '150mb' }), async (req, res) => {
    try {
        if (!req.body || !req.body.length) {
            return res.status(400).json({ error: 'No video data received.' });
        }

        const contentType = req.headers['content-type'] || 'video/mp4';
        const fileName = req.headers['x-file-name']
            ? decodeURIComponent(req.headers['x-file-name'])
            : ('brand-video-' + Date.now());

        const bucket = getBucket();
        const uploadStream = bucket.openUploadStream(fileName, { contentType });

        uploadStream.on('finish', async function () {
            try {
                await SiteConfig.findOneAndUpdate(
                    { id: 'main' },
                    { $set: { activeVideoFileId: uploadStream.id, activeVideoContentType: contentType, activeVideoFileName: fileName } },
                    { upsert: true }
                );
                res.json({ success: true, fileId: uploadStream.id });
            } catch (err) {
                console.error('upload-video config-save error:', err);
                res.status(500).json({ error: 'Video stored but failed to activate it.' });
            }
        });
        uploadStream.on('error', function (err) {
            console.error('GridFS upload error:', err);
            res.status(500).json({ error: 'Failed to store video.' });
        });

        uploadStream.end(req.body);
    } catch (err) {
        console.error('upload-video error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload video.' });
    }
});

// GET /api/video — public, streams the active brand video with HTTP Range
// support (required for browsers to seek/scrub a <video> element properly).
router.get('/video', async (req, res) => {
    try {
        const config = await SiteConfig.findOne({ id: 'main' });
        if (!config || !config.activeVideoFileId) {
            return res.status(404).json({ error: 'No custom video uploaded.' });
        }

        const files = await mongoose.connection.db
            .collection(BUCKET_NAME + '.files')
            .find({ _id: config.activeVideoFileId })
            .toArray();
        const file = files[0];
        if (!file) {
            return res.status(404).json({ error: 'Video file not found.' });
        }

        const fileSize = file.length;
        const contentType = config.activeVideoContentType || file.contentType || 'video/mp4';
        const bucket = getBucket();
        const range = req.headers.range;

        // Let the frontend check whether a custom video exists without pulling the
        // whole file — used before committing a <video> element's src to this URL.
        if (req.method === 'HEAD') {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes'
            });
            return res.end();
        }

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + fileSize,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType
            });
            bucket.openDownloadStream(config.activeVideoFileId, { start, end: end + 1 }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes'
            });
            bucket.openDownloadStream(config.activeVideoFileId).pipe(res);
        }
    } catch (err) {
        console.error('get-video error:', err);
        res.status(500).json({ error: 'Failed to stream video.' });
    }
});

// DELETE /api/video — admin-only. Reverts to the default (no custom video active).
router.delete('/video', requireAdminKey, async (req, res) => {
    try {
        await SiteConfig.findOneAndUpdate(
            { id: 'main' },
            { $set: { activeVideoFileId: null, activeVideoContentType: '', activeVideoFileName: '' } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('delete-video error:', err);
        res.status(500).json({ error: 'Failed to reset video.' });
    }
});

module.exports = router;
