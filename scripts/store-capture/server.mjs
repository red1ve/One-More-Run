// Маленький локальный сервер для съёмки материалов магазина (слушает только 127.0.0.1:3999):
//   GET  /cap.js, /recipe.js, /art.js — съёмочные помощники для страницы игры (import() из консоли браузера);
//   POST /save?name=файл       — принимает файл из страницы и кладёт в release/store-out/ (в git не попадает);
//   GET  /out/файл             — отдаёт сохранённое (с Range), чтобы проверить MP4 в <video>.
// Запуск: node scripts/store-capture/server.mjs (параллельно с npm run dev). Подробности — в README.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', '..', 'release', 'store-out');
fs.mkdirSync(outDir, { recursive: true });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range'
};
const clean = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = clean(url.searchParams.get('name') || 'file.bin');
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      fs.writeFileSync(path.join(outDir, name), body);
      console.log(`saved ${name} (${body.length} bytes)`);
      res.writeHead(200, CORS);
      res.end(String(body.length));
    });
    return;
  }
  if (req.method === 'GET' && (['/cap.js', '/recipe.js', '/art.js'].includes(url.pathname))) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(here, path.basename(url.pathname))));
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/out/')) {
    const file = path.join(outDir, clean(path.basename(url.pathname)));
    if (!fs.existsSync(file)) {
      res.writeHead(404, CORS);
      res.end('no');
      return;
    }
    const size = fs.statSync(file).size;
    const type = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...CORS, 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...CORS, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
      fs.createReadStream(file).pipe(res);
    }
    return;
  }
  res.writeHead(404, CORS);
  res.end('no');
}).listen(3999, '127.0.0.1', () => console.log(`store-capture server on http://127.0.0.1:3999, files go to ${outDir}`));
