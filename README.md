# Film+Tv Updates

A weekly film & TV newsletter, built as a designed PDF and emailed every Monday.

The design lives in this repo and does not get rebuilt each week. A weekly run is:
write a new content file, run the build, look at the rendered pages, send.

```bash
npm install

node src/build.js            # content JSON -> out/film-tv-updates-<date>.pdf
node src/verify.js           # PDF -> out/pages/page-NN.png, one per page
node src/send.js             # emails the newest PDF as an attachment
```

## Weekly run

1. **Research the window.** One week back, ending the Sunday before the send.
   (The first issue, `2026-08-13`, covers two weeks as a catch-up.)
2. **Copy the previous content file** to `content/YYYY-MM-DD.json` and rewrite it.
   Nothing else changes — the template, stylesheet and paginator stay put.
3. `node src/build.js` — prints a layout report showing which pages each section
   occupies. Every section must show a clean page span of its own.
4. `node src/verify.js` — rasterizes the PDF and writes one PNG per page.
   **Look at them.** No run is finished without this.
5. `node src/send.js`.

## Content format

`content/<issueDate>.json`:

| Field | Purpose |
| --- | --- |
| `issueDate` | `YYYY-MM-DD`, also the output filename |
| `rangeLabel` | Printed on the cover and used in the email subject |
| `issueLabel` | Short form for the page footer |
| `standfirst`, `coverNote` | Cover copy |
| `sections[]` | One per topic; each opens on a fresh page |
| `wildcard` | Rendered as its own final section, on its own page |

Each section has `title`, `eyebrow`, `kicker`, `tocLine` and a `blocks` array.
A block is one of:

- `standfirst` — a short lead paragraph
- `subhead` — a rule-and-caps divider; always glued to the block after it so it
  can never be stranded at the foot of a page
- `entry` — **one line**: `title`, `platform`, `desc` (one sentence), optional
  `pick: true` and `tags`
- `pick` — the expanded treatment: `title`, `meta`, `director`, `dp`,
  `extraCredit`, `scores`, `why` (string or array of paragraphs), `tags`
- `festival` — `name`, `when`, `status`, `body`, `winners`
- `note` — small italic caveat at the end of a list

`*asterisks*` produce italics in prose fields.

### House rules the format encodes

- One line per title in the full list. Director, cinematographer, scores and
  commentary are reserved for picks — that is what keeps the list scannable.
- Scores: print what was verified. If a just-released title has no published
  score, write `"not yet rated"`; anything without a digit is set in muted
  italics rather than the accent colour. Never guess, never leave blank.
- `tags: ["Cults"]` / `["Conspiracy"]` / `["Extremism"]` flags work covering
  cults, conspiracy movements or political extremism.

### Editorial weighting for picks

Toward: elevated or formally distinctive genre work, documentary (especially
belief systems, faith communities, American vernacular culture), festival
premieres, arthouse, strong directorial visual signature. Heavily against:
studio franchise sequels and reality/competition formats, unless the buzz is
genuinely unusual.

## Design

- **Source Serif 4** (bold) for titles, **Inter** for body and meta. Both are
  base64-inlined at build time, so the PDF renders identically anywhere.
- One muted accent, `#9a4a2b`, used only for small highlights: score values, the
  pick marker, content tags. Never a full line. The pick marker on list entries
  is positioned in the left gutter, outside the text flow, so accent colour can
  never begin a wrapped line.
- Letter, 8.5 × 11in, generous margins.

## How pagination works

`src/paginate.js` runs in the browser before printing. It deals the atomic
`.block` elements of each section onto fixed-height sheets:

- Every section mints a fresh sheet, so **two sections can never share a page**.
- Blocks move whole, so nothing splits across a page break.
- A section runs to as many pages as it needs; type is never compressed to fit.
- If a section's closing sheet comes out very light, blocks are walked back onto
  it from the sheet before until the two are roughly even.

This is why the build uses Playwright rather than a CSS-only print pipeline —
the layout is measured in a real engine, then printed.

## Email

`src/send.js` picks a transport from whatever credentials are in the environment:

```bash
# Option A — SMTP (Gmail: use an App Password, not the account password)
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=465
export SMTP_USER=you@gmail.com
export SMTP_PASS=xxxxxxxxxxxxxxxx
export MAIL_FROM="Film+Tv Updates <you@gmail.com>"

# Option B — Resend
export RESEND_API_KEY=re_xxxxxxxx
export MAIL_FROM="Film+Tv Updates <updates@yourdomain.com>"
```

`MAIL_TO` defaults to `aslockett@gmail.com`. Subject is
`Film+Tv Updates — <rangeLabel>`.

### Network requirement

Sending needs outbound access to the mail host, and a sandboxed build environment
usually does not have it. Checked on 2026-08-13 from the Claude Code environment
`env_01GN6oevhHzGTqKA5w7VLgYa`:

| Route | Result |
| --- | --- |
| `smtp.gmail.com:465` / `:587` | TCP connect times out — SMTP ports are not open |
| `api.resend.com:443` and other mail APIs | egress proxy answers `403` to `CONNECT` |

So credentials alone are not enough: correct ones still fail here. Either add the
mail host to the environment's allowed domains (an HTTPS API such as Resend is the
right shape, since only 443 goes through the proxy), or run `src/send.js` somewhere
with open egress — a GitHub Actions runner, or your own machine.

## Layout

```
content/           one JSON per issue
src/
  build.js         content -> HTML -> PDF
  template.js      JSON -> HTML blocks
  newsletter.css   the design
  paginate.js      browser-side sheet dealing
  fonts.js         base64 font embedding
  verify.js        PDF -> PNG per page
  pdf-render.html  pdf.js harness used by verify
  send.js          email
out/               build output (gitignored)
```
