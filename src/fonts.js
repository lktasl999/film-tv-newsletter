'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FACES = [
  ['Source Serif 4', 'source-serif-4', 'source-serif-4-latin-400-normal.woff2', 400, 'normal'],
  ['Source Serif 4', 'source-serif-4', 'source-serif-4-latin-400-italic.woff2', 400, 'italic'],
  ['Source Serif 4', 'source-serif-4', 'source-serif-4-latin-700-normal.woff2', 700, 'normal'],
  ['Source Serif 4', 'source-serif-4', 'source-serif-4-latin-700-italic.woff2', 700, 'italic'],
  ['Inter', 'inter', 'inter-latin-400-normal.woff2', 400, 'normal'],
  ['Inter', 'inter', 'inter-latin-500-normal.woff2', 500, 'normal'],
  ['Inter', 'inter', 'inter-latin-600-normal.woff2', 600, 'normal'],
  ['Inter', 'inter', 'inter-latin-700-normal.woff2', 700, 'normal'],
];

/**
 * Fonts are base64-inlined rather than linked: the PDF must render identically
 * on any machine, and the build box has no access to a font CDN.
 */
function fontCss() {
  return FACES.map(([family, pkg, file, weight, style]) => {
    const p = path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
    const b64 = fs.readFileSync(p).toString('base64');
    return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }).join('\n');
}

module.exports = { fontCss };
