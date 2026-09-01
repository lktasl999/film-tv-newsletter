# THE MARGINS

A bi-weekly collection of offbeat, bizarre and subcultural stories from local
and regional news around the world, set as an A4 PDF you can read in five
minutes.

It is a reference document, not a news product. Stories are chosen on whether
they put an image in your head — a vivid physical setting, a real person with a
real obsession, a scene you could not have invented. News value is not a
criterion.

```bash
pip install -r requirements.txt

python3 build.py --check-links content/2026-09-14.json   # → issues/margins-01-2026-09-14.pdf
python3 build.py --sample --png content/_sample.json     # design proof → out/, with page PNGs
```

## The two halves

The pipeline is deliberately split, because only one half is a program.

**Research and writing** is an agent's job — 40+ searches across local outlets
in a dozen languages, reading the originals, judging the stories, writing the
copy. `RESEARCH.md` is the runbook for it, and doubles as the prompt for the
scheduled run.

**Everything downstream** is `build.py`: validation, de-duplication against the
archive, layout, PDF, archive write-back, terminal report. It takes a content
JSON and is fully deterministic.

## What the builder enforces

It refuses to render an issue that breaks the house rules, rather than quietly
producing a bad one:

| Rule | Behaviour |
| --- | --- |
| Story already used | Blocks — matched on normalised URL **and** on fuzzy headline similarity (>0.82) against `archive/seen.json` |
| Duplicate inside the issue | Blocks |
| More than 3 stories from one country | Blocks. England/Scotland/Wales/NI count as one United Kingdom |
| Headline over 8 words | Blocks |
| Image line over 15 words | Blocks |
| 16–20 stories | Blocks outside that range, unless `--sample` |
| Summary outside 40–60 words (120–155 for the longer piece) | Warns |
| A URL that does not resolve | Blocks, with `--check-links` |

`--check-links` tells a dead link apart from a blocked network: if *every* host
fails at the socket the machine simply has no web egress, so it warns and
carries on rather than condemning the links.

## Layout

```
the-margins/
  build.py            content JSON → HTML → PDF, plus the archive write-back
  template.html       Jinja2
  style.css           the design
  RESEARCH.md         the research runbook / scheduled-run prompt
  fonts/              Archivo, Newsreader, IBM Plex Mono (OFL, vendored)
  content/            one JSON per issue; _sample.json is the design proof
  issues/             margins-{NN}-{YYYY-MM-DD}.pdf and .html
  archive/
    seen.json         every story ever used: url, headline, outlet, issue
    sources.json      outlets that have produced hits, with hit counts
  out/                sample builds and page PNGs (gitignored)
```

Fonts are base64-inlined at build time, so the PDF renders identically on any
machine and the build needs no font CDN.

## Design

A4 portrait, 26mm margins, never more than two stories to a page.

Three families and no more: **Archivo** for headlines, section titles and the
numerals; **Newsreader** for body; **IBM Plex Mono** for datelines, source
lines and page numbers. One accent, `#c0341b`, used only on section rules,
story numbers and the image-line marker. Otherwise black on off-white.

Every story is numbered 01–20 and the numerals sit in a 23mm left gutter, doing
the graphic work. Hairline rules separate stories. Section openers get a
full-width rule and a title alone on its line. No boxes, no shadows, no
gradients, no icon sets, and no images at all — the typography carries it and
the rights on scraped photos are a mess.

`--png` rasterises the finished PDF to `out/pages/page-NN.png`, one per page.
Look at them. A build that has not been looked at is not finished.

## Cadence

Every other Monday. Each run: read the archive, research, build, write the new
stories back, output the PDF, print a report — issue number, story count,
countries covered, and any searches that came back empty, so thin coverage is
visible rather than silent.

Issue numbers auto-increment from `archive/seen.json`; nothing needs to be
tracked by hand.

A Claude routine (`THE MARGINS — fortnightly issue`, `0 8 * * 1`) fires a fresh
session every Monday at 08:00 UTC. Cron cannot express "fortnightly", so the
routine's first instruction is a due-check: it reads the newest `issue_date` in
`seen.json` and stops without doing anything if the last issue is under thirteen
days old. The archive is the schedule; the cron is just a heartbeat.

## Known constraint — network access

Issue 01 was built in an environment with no general web egress. `WebFetch` and
`curl` were refused for every news domain (Block Club Chicago, ITV, BBC, VRT, Le
Monde, even Wikipedia); only package registries, Google Fonts and the GitHub API
resolved. Search worked, because it runs server-side.

That means article pages could not be opened, so the summaries in issue 01 are
drawn from what search returned rather than from the pages themselves, and no
URL was verified. The issue says so on its own colophon page rather than
implying otherwise, and `--check-links` reports the blocked network instead of
condemning the links.

If you want the research done to the standard `RESEARCH.md` describes, the
environment needs a network policy that permits general web egress — see
https://code.claude.com/docs/en/claude-code-on-the-web. Nothing else about the
pipeline changes.
