// Analyses the studio's demo beat once and saves what the presets read from it to assets/demo/demo.json,
// so the home page can draw a live preset without downloading the mp3 or analysing anything.
// Run from the repo root:  npm install && npm run demo   (again whenever studio/demo.mp3 changes)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const body = await fs.readFile(path.join(root, p)); res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
// the same section the gallery previews show: bars 1–8 of the demo beat
await page.goto(`${base}/studio/?visual=orb&embed=1`);
await page.waitForFunction(() => /ready/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
const demo = await page.evaluate(() => {
  const S = window.__LR.S, A = S.A;
  const sl = S.lenBars * 240 / S.bpm, f0 = Math.round((S.startBar * 240 / S.bpm + S.offset / 1000) * A.frameRate);
  const nF = Math.ceil(sl * A.frameRate) + 2;
  const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const cut = (arr, d) => Array.from({ length: nF }, (_, k) => r(arr[Math.min(A.nF - 1, f0 + k)] || 0, d));
  return {
    name: '134_gm_anx87hosty', bpm: S.bpm, key: S.key, lenBars: S.lenBars, quant: S.quant,
    frameRate: r(A.frameRate, 6), nF,
    rmsN: cut(A.rmsN, 3), lowS: cut(A.lowS, 3), highN: cut(A.highN, 3), slow: cut(A.slow, 3), rmsDb: cut(A.rmsDb, 1),
    seg: S.seg.map(o => ({ i: o.i - f0, t: r(o.t - f0 / A.frameRate, 4), rt: r(o.rt, 4), s: r(o.s, 3), type: o.type, fc: r(o.fc || 0, 1), p: r(o.p || 0, 2), note: o.note || '' })),
    wave: Array.from(S.wave, v => r(v, 3))
  };
});
await fs.mkdir(path.join(root, 'assets/demo'), { recursive: true });
const out = path.join(root, 'assets/demo/demo.json');
await fs.writeFile(out, JSON.stringify(demo));
console.log('demo.json', (await fs.stat(out)).size, 'bytes,', demo.seg.length, 'hits,', demo.nF, 'frames');
await browser.close(); server.close();
