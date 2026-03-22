// ===== CS2 Investment Tracker - Price Proxy Server =====
// Run: node server.js
// Serves the frontend + provides CORS-free access to Steam Market and CSFloat price APIs.
// Open http://localhost:3000 in your browser.

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 3000;

// Steam currency codes: 1=USD, 6=PLN, 3=EUR, 23=CNY
const CURRENCY_MAP = { USD: 1, PLN: 6, EUR: 3, CNY: 23 };

// Skinport bulk cache (server-side, refreshed every 5 min)
let skinportCache = { data: null, ts: 0 };
const SKINPORT_CACHE_TTL = 5 * 60 * 1000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function fetchJSON(reqUrl) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(reqUrl);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data: null, raw: data });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

// Fetch with brotli support (required by Skinport API)
function fetchBrotli(reqUrl) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(reqUrl);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Encoding': 'br'
            }
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                zlib.brotliDecompress(buf, (err, decoded) => {
                    if (err) {
                        try { resolve({ status: res.statusCode, data: JSON.parse(buf.toString()) }); }
                        catch { resolve({ status: res.statusCode, data: null }); }
                    } else {
                        try { resolve({ status: res.statusCode, data: JSON.parse(decoded.toString()) }); }
                        catch { resolve({ status: res.statusCode, data: null }); }
                    }
                });
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
    setCORS(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsed = url.parse(req.url, true);

    // Health check
    if (parsed.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // Steam Market price
    // GET /api/steam-price?market_hash_name=AK-47 | Redline (Field-Tested)&currency=USD
    if (parsed.pathname === '/api/steam-price') {
        const name = parsed.query.market_hash_name;
        const curr = parsed.query.currency || 'USD';
        if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'market_hash_name required' }));
            return;
        }
        const steamCurr = CURRENCY_MAP[curr] || 1;
        const steamUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${steamCurr}&market_hash_name=${encodeURIComponent(name)}`;
        try {
            const result = await fetchJSON(steamUrl);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.data || { error: 'No data' }));
        } catch (e) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // CSFloat price (via public history/graph endpoint — avg daily price in cents)
    // GET /api/csfloat-price?market_hash_name=AK-47 | Redline (Field-Tested)
    if (parsed.pathname === '/api/csfloat-price') {
        const name = parsed.query.market_hash_name;
        if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'market_hash_name required' }));
            return;
        }
        const cfUrl = `https://csfloat.com/api/v1/history/${encodeURIComponent(name)}/graph`;
        try {
            const result = await fetchJSON(cfUrl);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.data || { error: 'No data' }));
        } catch (e) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Skinport bulk prices (cached server-side for 5 min)
    // GET /api/skinport-prices
    if (parsed.pathname === '/api/skinport-prices') {
        if (skinportCache.data && Date.now() - skinportCache.ts < SKINPORT_CACHE_TTL) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skinportCache.data));
            return;
        }
        try {
            const result = await fetchBrotli('https://api.skinport.com/v1/items?app_id=730&currency=USD');
            if (Array.isArray(result.data)) {
                // Transform to { market_hash_name: { suggested_price, min_price } }
                const priceMap = {};
                for (const item of result.data) {
                    if (item.market_hash_name && item.suggested_price) {
                        priceMap[item.market_hash_name] = {
                            suggested_price: item.suggested_price,
                            min_price: item.min_price || null,
                        };
                    }
                }
                skinportCache = { data: priceMap, ts: Date.now() };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(priceMap));
            } else {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid Skinport response' }));
            }
        } catch (e) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // ===== Static file serving =====
    let filePath = parsed.pathname;
    if (filePath === '/') filePath = '/index.html';

    // Prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(__dirname, safePath);

    // Ensure the resolved path is within the project directory
    if (!fullPath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`CS2 Investment Tracker running on http://localhost:${PORT}`);
    console.log('Open http://localhost:3000 in your browser');
    console.log('');
    console.log('API Endpoints:');
    console.log('  GET /api/steam-price?market_hash_name=...&currency=USD');
    console.log('  GET /api/csfloat-price?market_hash_name=...');
    console.log('  GET /api/skinport-prices (bulk, cached 5 min)');
});
