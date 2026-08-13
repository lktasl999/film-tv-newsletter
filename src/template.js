'use strict';

/**
 * Content JSON -> print-ready HTML.
 *
 * The HTML is emitted as a flat stream of atomic "blocks" grouped by section.
 * paginate.js then deals them onto fixed-size sheets in the browser, so a
 * section always starts on a fresh page and nothing is ever split mid-block.
 */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Allows a small amount of inline markup in prose: *emphasis* -> <em>. */
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const tag = (t) => `<span class="tag">${esc(t)}</span>`;
const tags = (list) => (list || []).map(tag).join(' ');

/* ---------------------------------------------------------------- blocks */

function scoreRow(scores) {
  if (!scores) return '';
  const cells = Object.entries(scores).map(([k, v]) => {
    // Anything without a number is a stated absence, not a score — set it in
    // muted italics so the accent stays reserved for real values.
    const missing = !/\d/.test(String(v));
    return `<div class="score"><span class="k">${esc(k)}</span><span class="v${
      missing ? ' none' : ''
    }">${esc(v)}</span></div>`;
  });
  return cells.length ? `<div class="scores">${cells.join('')}</div>` : '';
}

function creditLine(pick) {
  const parts = [];
  if (pick.director) parts.push(`<span class="role">Dir.</span> <span class="name">${esc(pick.director)}</span>`);
  if (pick.dp) parts.push(`<span class="role">DP</span> <span class="name">${esc(pick.dp)}</span>`);
  if (pick.extraCredit) parts.push(rich(pick.extraCredit));
  return parts.length ? `<div class="credits">${parts.join(' &nbsp;·&nbsp; ')}</div>` : '';
}

function pickBlock(p) {
  const why = (Array.isArray(p.why) ? p.why : [p.why])
    .filter(Boolean)
    .map((t) => `<p class="why">${rich(t)}</p>`)
    .join('');
  return `
    <div class="block"><div class="pick">
      <div class="pick-flag"><span class="dot"></span><span class="label">Pick</span></div>
      <h3>${esc(p.title)}</h3>
      <div class="meta">${rich(p.meta)}</div>
      ${creditLine(p)}
      ${scoreRow(p.scores)}
      ${why}
      ${p.tags && p.tags.length ? `<div class="pick-tags">${tags(p.tags)}</div>` : ''}
    </div></div>`;
}

function entryBlock(e) {
  return `
    <div class="block"><div class="entry${e.pick ? ' is-pick' : ''}">
      <span class="t">${esc(e.title)}</span><span class="sep">·</span><span class="p">${esc(e.platform)}</span><span class="sep">·</span><span class="d">${rich(e.desc)}</span>${
        /* &nbsp; ties the tag to the word before it, so a wrapped line can
           never begin with accent-coloured text. */
        e.tags && e.tags.length ? '&nbsp;' + tags(e.tags) : ''
      }
    </div></div>`;
}

function festBlock(f) {
  const winners = f.winners
    ? `<div class="winners"><span class="k">${esc(f.winnersLabel || 'Winners')}</span>${rich(f.winners)}</div>`
    : '';
  const body = (Array.isArray(f.body) ? f.body : [f.body])
    .filter(Boolean)
    .map((t) => `<p>${rich(t)}</p>`)
    .join('');
  const status = f.status
    ? `<span class="status${/live|now on/i.test(f.status) ? ' live' : ''}">${esc(f.status)}</span>`
    : '';
  return `
    <div class="block"><div class="fest">
      <div class="fest-head"><h3>${esc(f.name)}</h3>${status}<span class="when">${esc(f.when)}</span></div>
      ${body}
      ${winners}
    </div></div>`;
}

function wildBlock(w) {
  const body = (Array.isArray(w.body) ? w.body : [w.body])
    .filter(Boolean)
    .map((t) => `<p>${rich(t)}</p>`)
    .join('');
  const credits = [];
  if (w.director) credits.push(`<span class="name">${esc(w.director)}</span>`);
  if (w.runtime) credits.push(esc(w.runtime));
  if (w.extraCredit) credits.push(rich(w.extraCredit));
  return `
    <div class="block"><div class="wild"><div class="frame">
      <h2>${esc(w.title)} <span class="year">${esc(w.year)}</span></h2>
      <div class="credits">${credits.join(' &nbsp;·&nbsp; ')}</div>
      <div class="body">${body}</div>
      ${w.where ? `<div class="where"><span class="k">Where</span>${esc(w.where)}</div>` : ''}
      ${w.tags && w.tags.length ? `<div class="pick-tags" style="margin-top:.18in">${tags(w.tags)}</div>` : ''}
    </div></div></div>`;
}

/**
 * A sub-head must never be the last thing on a page, so it is glued to the
 * block that follows it inside a single atomic unit.
 */
function renderBlocks(items) {
  const html = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'subhead') {
      const next = items[i + 1];
      const glued = next && next.type !== 'subhead' ? renderOne(next) : '';
      if (glued) i++;
      html.push(`<div class="block"><div class="subhead">${esc(it.text)}</div>${strip(glued)}</div>`);
      continue;
    }
    html.push(renderOne(it));
  }
  return html.join('\n');
}

/** Unwrap the outer .block so glued content nests cleanly. */
const strip = (h) => h.replace(/^\s*<div class="block">/, '').replace(/<\/div>\s*$/, '');

function renderOne(it) {
  switch (it.type) {
    case 'standfirst':
      return `<div class="block"><div class="standfirst-block">${rich(it.text)}</div></div>`;
    case 'pick':
      return pickBlock(it);
    case 'entry':
      return entryBlock(it);
    case 'festival':
      return festBlock(it);
    case 'wildcard':
      return wildBlock(it);
    case 'note':
      return `<div class="block"><div class="list-note">${rich(it.text)}</div></div>`;
    default:
      throw new Error(`Unknown block type: ${it.type}`);
  }
}

/* ------------------------------------------------------------------ page */

function coverHtml(data) {
  const rows = data.sections
    .map(
      (s, i) => `
      <div class="toc-row">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="name">${esc(s.title)}</span>
        <span class="desc">${esc(s.tocLine || '')}</span>
      </div>`
    )
    .join('');
  const wildRow = data.wildcard
    ? `<div class="toc-row">
         <span class="num">${String(data.sections.length + 1).padStart(2, '0')}</span>
         <span class="name">Wildcard</span>
         <span class="desc">${esc(data.wildcard.tocLine || '')}</span>
       </div>`
    : '';

  return `
  <div class="page cover">
    <h1 class="wordmark">Film<span class="plus">+</span>Tv<br>Updates</h1>
    <div class="rule"></div>
    <p class="dateline">${esc(data.rangeLabel)}</p>
    ${data.standfirst ? `<p class="standfirst">${rich(data.standfirst)}</p>` : ''}
    <div class="cover-contents">
      <h2>In this issue</h2>
      ${rows}
      ${wildRow}
    </div>
    ${data.coverNote ? `<p class="cover-note">${rich(data.coverNote)}</p>` : ''}
  </div>`;
}

function buildHtml(data, css, fontCss) {
  const sections = data.sections.map((s, i) => ({
    running: s.title,
    index: i + 1,
    opener: {
      eyebrow: `Section ${String(i + 1).padStart(2, '0')}${s.eyebrow ? ' · ' + s.eyebrow : ''}`,
      title: s.title,
      kicker: s.kicker || '',
    },
    body: renderBlocks(s.blocks),
  }));

  if (data.wildcard) {
    sections.push({
      running: 'Wildcard',
      index: sections.length + 1,
      opener: {
        eyebrow: `Section ${String(sections.length + 1).padStart(2, '0')} · One from the vault`,
        title: 'Wildcard',
        kicker: data.wildcard.kicker || '',
      },
      body: renderBlocks([{ type: 'wildcard', ...data.wildcard }]),
    });
  }

  const flow = sections
    .map(
      (s) => `
  <div data-section="${esc(s.running)}">
    <div class="block"><div class="opener">
      <div class="eyebrow">${esc(s.opener.eyebrow)}</div>
      <h1>${esc(s.opener.title)}</h1>
      ${s.opener.kicker ? `<p class="kicker">${rich(s.opener.kicker)}</p>` : ''}
      <div class="opener-rule"></div>
    </div></div>
    ${s.body}
  </div>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Film+Tv Updates — ${esc(data.rangeLabel)}</title>
<style>${fontCss}</style>
<style>${css}</style>
</head>
<body>
<div id="pages">${coverHtml(data)}</div>
<div id="flow">${flow}</div>
<script>
window.__MASTHEAD__ = ${JSON.stringify(data.masthead || 'Film+Tv Updates')};
window.__ISSUE__ = ${JSON.stringify(data.issueLabel || data.rangeLabel)};
</script>
</body>
</html>`;
}

module.exports = { buildHtml };
