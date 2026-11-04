import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAddonHandler } from './addon-proxy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const addonHandler = createAddonHandler();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/addon') return addonHandler(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let file;
  try {
    const decoded = decodeURIComponent(pathname);
    const target = path.resolve(root, `.${decoded}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    file = target === root ? path.join(root, 'index.html') : target;
    let data;
    try { data = await readFile(file); }
    catch {
      if (path.extname(file)) throw new Error('Not found');
      file = path.join(root, 'index.html');
      data = await readFile(file);
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT) || 8080, '0.0.0.0', () => console.log(`Nébula listo en el puerto ${process.env.PORT || 8080}`));
