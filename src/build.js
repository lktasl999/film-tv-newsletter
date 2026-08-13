'use strict';

/**
 * Build one issue: content JSON -> styled HTML -> PDF (headless Chromium).
 *
 *   node src/build.js                 # newest file in content/
 *   node src/build.js 2026-08-13      # a specific issue
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { buildHtml } = require('./template');
const { fontCss } = require('./fonts');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'out');

function resolveContent(arg) {
  if (arg) {
    const direct = arg.endsWith('.json') ? arg : path.join(CONTENT_DIR, `${arg}.json`);
    const p = path.isAbsolute(direct) ? direct : path.join(ROOT, direct);
    if (!fs.existsSync(p)) throw new Error(`No content file at ${p}`);
    return p;
  }
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (!files.length) throw new Error('content/ is empty');
  return path.join(CONTENT_DIR, files[files.length - 1]);
}

async function build(contentPath) {
  const data = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const css = fs.readFileSync(path.join(__dirname, 'newsletter.css'), 'utf8');
  const paginator = fs.readFileSync(path.join(__dirname, 'paginate.js'), 'utf8');

  const html = buildHtml(data, css, fontCss());

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const slug = `film-tv-updates-${data.issueDate}`;
  const htmlPath = path.join(OUT_DIR, `${slug}.html`);
  const pdfPath = path.join(OUT_DIR, `${slug}.pdf`);
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(paginator);
  await page.waitForFunction(() => document.documentElement.dataset.paginated === 'true');

  const layout = await page.evaluate(() => ({
    pages: window.__PAGE_COUNT__,
    starts: window.__SECTION_STARTS__,
  }));

  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  await browser.close();

  // Which page does each section open on, and does any page mix two sections?
  const bySection = [];
  for (const p of layout.starts) {
    const last = bySection[bySection.length - 1];
    if (!last || last.running !== p.running) bySection.push({ running: p.running, from: p.page, to: p.page });
    else last.to = p.page;
  }

  console.log(`content : ${path.relative(ROOT, contentPath)}`);
  console.log(`html    : ${path.relative(ROOT, htmlPath)}`);
  console.log(`pdf     : ${path.relative(ROOT, pdfPath)}`);
  console.log(`pages   : ${layout.pages}`);
  console.log('layout  :');
  for (const s of bySection) {
    const span = s.from === s.to ? `p${s.from}` : `p${s.from}–${s.to}`;
    console.log(`          ${span.padEnd(8)} ${s.running}`);
  }

  return { pdfPath, htmlPath, pages: layout.pages, sections: bySection, data };
}

if (require.main === module) {
  build(resolveContent(process.argv[2])).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build, resolveContent };
