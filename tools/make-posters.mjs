// Renders one still per visual from the studio and saves it to assets/posters/<id>.jpg (and a small copy in assets/posters/small/).
// Run from the repo root:  npm install && npm run posters
// (Fonts come from Google Fonts, so run it with internet on, or the posters fall back to system fonts.)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { VISUALS } = await import(path.join(root, 'assets/js/catalog.js'));
const only = process.argv.slice(2);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
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
await fs.mkdir(path.join(root, 'assets/posters/small'), { recursive: true });
for (const v of VISUALS) {
  if (only.length && !only.includes(v.id)) continue;
  await page.goto(`${base}/studio/?visual=${v.id}&embed=1`);
  await page.waitForFunction(() => /ready/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
  await page.waitForTimeout(300);
  const [url, small] = await page.evaluate(t => {
    window.__LR.S.embed = false; window.__LR.setTau(t); window.__LR.render(t);
    const cv = document.getElementById('cv'), s = document.createElement('canvas'); s.width = 360; s.height = 640;
    const g = s.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, s.width, s.height);
    return [cv.toDataURL('image/jpeg', 0.86), s.toDataURL('image/jpeg', 0.84)];
  }, v.posterAt ?? 4);
  await fs.writeFile(path.join(root, 'assets/posters', `${v.id}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  // a small one for the strip on the home page
  await fs.writeFile(path.join(root, 'assets/posters/small', `${v.id}.jpg`), Buffer.from(small.split(',')[1], 'base64'));
  console.log('poster', v.id);
}
await browser.close(); server.close();
