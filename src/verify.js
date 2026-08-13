'use strict';

/**
 * Rasterize a built PDF to one PNG per page, so the run can be eyeballed
 * before it goes out. Nothing ships without this step.
 *
 *   node src/verify.js                # newest PDF in out/
 *   node src/verify.js out/x.pdf
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

const MIME = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
};

/** pdf.js needs a real http origin — ES modules will not load over file://. */
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function newestPdf() {
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => ({ f, t: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error('No PDF in out/ — run the build first.');
  return path.join(OUT_DIR, files[0].f);
}

async function verify(pdfPath, { scale = 1.5 } = {}) {
  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/src/pdf-render.html`);
  await page.waitForFunction(() => window.__READY__ === true);

  const pdfUrl = `http://127.0.0.1:${port}/${path.relative(ROOT, pdfPath).split(path.sep).join('/')}`;
  const count = await page.evaluate((u) => window.pageCount(u), pdfUrl);

  const dir = path.join(OUT_DIR, 'pages');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const written = [];
  for (let i = 1; i <= count; i++) {
    const dataUrl = await page.evaluate(
      ([u, n, s]) => window.renderPage(u, n, s),
      [pdfUrl, i, scale]
    );
    const out = path.join(dir, `page-${String(i).padStart(2, '0')}.png`);
    fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    written.push(out);
  }

  await browser.close();
  server.close();

  console.log(`pdf     : ${path.relative(ROOT, pdfPath)}`);
  console.log(`pages   : ${count}`);
  console.log(`images  : ${path.relative(ROOT, dir)}/page-01.png … page-${String(count).padStart(2, '0')}.png`);
  return written;
}

if (require.main === module) {
  const arg = process.argv[2];
  const pdfPath = arg ? (path.isAbsolute(arg) ? arg : path.join(ROOT, arg)) : newestPdf();
  verify(pdfPath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { verify, newestPdf };
