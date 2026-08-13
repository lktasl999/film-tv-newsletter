/**
 * Browser-side paginator.
 *
 * Deals the atomic .block elements of each [data-section] onto fixed-height
 * sheets. Because every section starts by minting a fresh sheet, two sections
 * can never share a page, and because blocks are moved whole, nothing is ever
 * split across a page boundary.
 *
 * Injected into the page by build.js and run before printing.
 */
(function paginate() {
  const pagesEl = document.getElementById('pages');
  const flowEl = document.getElementById('flow');
  const masthead = window.__MASTHEAD__ || 'Film+Tv Updates';
  const issue = window.__ISSUE__ || '';

  // The cover already occupies page 1.
  let pageNo = pagesEl.querySelectorAll('.page').length;

  function makeSheet(runningLabel) {
    pageNo += 1;
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML =
      '<div class="page-head">' +
      '<span class="running"></span>' +
      '<span class="masthead"></span>' +
      '</div>' +
      '<div class="page-body"></div>' +
      '<div class="page-foot"><span class="issue"></span><span class="folio"></span></div>';
    page.querySelector('.running').textContent = runningLabel;
    page.querySelector('.masthead').textContent = masthead;
    page.querySelector('.page-foot .issue').textContent = issue;
    page.querySelector('.folio').textContent = String(pageNo);
    pagesEl.appendChild(page);
    return page.querySelector('.page-body');
  }

  const overflows = (body) => body.scrollHeight > body.clientHeight + 0.5;

  /**
   * How much of the sheet the content actually covers.
   * scrollHeight is no use here — it never reports less than clientHeight —
   * so measure from the top of the first block to the bottom of the last.
   */
  function fill(body) {
    const kids = body.children;
    if (!kids.length) return 0;
    const top = kids[0].getBoundingClientRect().top;
    const bottom = kids[kids.length - 1].getBoundingClientRect().bottom;
    const available = body.clientHeight - parseFloat(getComputedStyle(body).paddingTop || 0);
    return available > 0 ? (bottom - top) / available : 1;
  }

  /**
   * A section that spills two entries onto a final page reads as a mistake
   * rather than as whitespace. When the closing sheet comes out very light,
   * walk blocks back onto it from the sheet before until the two are roughly
   * even — stopping the moment the move would overflow or overshoot.
   */
  function balanceTail(sheets) {
    if (sheets.length < 2) return;
    const last = sheets[sheets.length - 1];
    const prev = sheets[sheets.length - 2];
    if (fill(last) > 0.45) return;

    // Never strip the sheet that carries the section opener down to nothing.
    const floor = sheets.length === 2 ? 2 : 1;

    while (prev.children.length > floor) {
      const block = prev.lastElementChild;
      last.insertBefore(block, last.firstChild);
      if (overflows(last) || fill(last) > fill(prev)) {
        prev.appendChild(block);
        return;
      }
    }
  }

  const sections = Array.from(flowEl.querySelectorAll('[data-section]'));

  for (const section of sections) {
    const label = section.getAttribute('data-section');
    const blocks = Array.from(section.children);
    const sheets = [];
    let body = makeSheet(label);
    sheets.push(body);

    for (const block of blocks) {
      body.appendChild(block);

      // Overflowed this sheet?
      if (overflows(body)) {
        if (body.children.length === 1) {
          // Single block taller than a whole sheet — nothing to gain by
          // moving it, so let it ride and start the next sheet after it.
          body = makeSheet(label);
          sheets.push(body);
          continue;
        }
        body.removeChild(block);
        body = makeSheet(label);
        sheets.push(body);
        body.appendChild(block);
      }
    }

    // An empty trailing sheet can appear when the last block exactly filled
    // its page; drop it before balancing.
    while (sheets.length && !sheets[sheets.length - 1].children.length) {
      sheets.pop().closest('.page').remove();
      pageNo -= 1;
    }

    balanceTail(sheets);
  }

  // Folios are only correct once every sheet exists.
  Array.from(pagesEl.querySelectorAll('.page')).forEach((p, i) => {
    const folio = p.querySelector('.folio');
    if (folio) folio.textContent = String(i + 1);
  });

  flowEl.remove();

  // Reported back to build.js for the render report.
  window.__PAGE_COUNT__ = pagesEl.querySelectorAll('.page').length;
  window.__SECTION_STARTS__ = Array.from(pagesEl.querySelectorAll('.page')).map((p, i) => ({
    page: i + 1,
    running: p.querySelector('.running') ? p.querySelector('.running').textContent : 'Cover',
  }));
  document.documentElement.setAttribute('data-paginated', 'true');
})();
