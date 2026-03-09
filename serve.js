// Simple dev server with COOP/COEP headers for SharedArrayBuffer support
// Usage: node serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 8080;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.wgsl': 'text/plain',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.pdf':  'application/pdf',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

http.createServer((req, res) => {
    let filePath = path.join(ROOT, req.url.split('?')[0]);
    if (filePath.endsWith('/')) filePath += 'index.html';
    if (filePath === path.join(ROOT, 'index.html') && !fs.existsSync(filePath)) {
        filePath = path.join(ROOT, 'flux-v2.html');
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    // Required for SharedArrayBuffer + Atomics.wait on main thread
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`Flux dev server (COOP/COEP enabled) → http://localhost:${PORT}/flux-v2.html`);
});
