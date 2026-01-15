#!/usr/bin/env node

// Simple web server to serve the Squish install script
// Run with: node get-squish-server.js
// Then test with: curl -fsSL http://localhost:8080 | bash

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const SCRIPT_PATH = path.join(__dirname, 'get-squish.sh');

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/get-squish.sh') {
        fs.readFile(SCRIPT_PATH, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/x-shellscript',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`🐙 Squish install server running at http://localhost:${PORT}`);
    console.log(`Test with: curl -fsSL http://localhost:${PORT} | bash`);
    console.log(`For production, deploy get-squish.sh to https://get.squishapp.dev`);
});