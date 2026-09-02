const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=UTF-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4'
};

const server = http.createServer((req, res) => {
    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, X-Requested-With');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Direct Video / Media Upload Endpoint
    if (req.method === 'POST' && (req.url === '/api/upload-video' || req.url === '/upload-video')) {
        const contentType = req.headers['content-type'] || '';
        let chunks = [];

        req.on('data', (chunk) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const assetsDir = path.join(PUBLIC_DIR, 'assets');
                if (!fs.existsSync(assetsDir)) {
                    fs.mkdirSync(assetsDir, { recursive: true });
                }

                // If JSON base64 upload
                if (contentType.includes('application/json')) {
                    const parsed = JSON.parse(buffer.toString());
                    let fileBuffer;
                    let fileName = parsed.fileName || 'brand_video.mp4';

                    if (parsed.data && parsed.data.includes('base64,')) {
                        fileBuffer = Buffer.from(parsed.data.split('base64,')[1], 'base64');
                    } else if (parsed.data) {
                        fileBuffer = Buffer.from(parsed.data, 'base64');
                    }

                    const targetPath = path.join(assetsDir, 'brand_video.mp4');
                    fs.writeFileSync(targetPath, fileBuffer);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: true,
                        url: 'assets/brand_video.mp4?t=' + Date.now(),
                        size: fileBuffer.length
                    }));
                    return;
                } else {
                    // Raw binary video stream upload
                    const targetPath = path.join(assetsDir, 'brand_video.mp4');
                    fs.writeFileSync(targetPath, buffer);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: true,
                        url: 'assets/brand_video.mp4?t=' + Date.now(),
                        size: buffer.length
                    }));
                    return;
                }
            } catch (err) {
                console.error('Upload handler error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    let reqUrl = decodeURI(req.url.split('?')[0]);
    if (reqUrl === '/' || reqUrl === '') {
        reqUrl = '/index.html';
    }

    let filePath = path.join(PUBLIC_DIR, reqUrl);

    // Security check
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const range = req.headers.range;

        // Video Range Streaming Support (HTTP 206 Partial Content)
        if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
            const positions = range.replace(/bytes=/, '').split('-');
            const start = parseInt(positions[0], 10);
            const total = stats.size;
            const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType
            });

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes'
            });

            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Preview server running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://192.168.0.105:${PORT}`);
});
