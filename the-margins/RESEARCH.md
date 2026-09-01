# The research pass

This is the half of the pipeline `build.py` cannot do. It is written as a
runbook so an agent can execute it cold, every other Monday, and produce a
`content/YYYY-MM-DD.json` the builder will accept.

## Before anything

Read `archive/seen.json` (everything already used) and `archive/sources.json`
(outlets that have paid off, with hit counts). Start the fortnight's searching
from the outlets already in `sources.json` — that is the point of keeping it.

Window: the **last 14 days**, ending the Sunday before the send.

## Tiers

**Tier 1 — local and regional outlets. The main source.**
US local TV affiliates, small-town papers, county weeklies, state-level sites.
UK regional titles: Reach network, BBC regional, Scottish, Welsh and NI locals,
county and parish papers. Pair a state or county name with terms like
*unusual, mystery, residents baffled, world record, annual contest, tradition,
stolen, spotted, refuses, museum, club, festival*.

**Tier 2 — non-English local press. At least a third of the issue.**
Brazil, Mexico, Argentina, France, Germany, Italy, Spain, Poland, Czechia, the
Nordics, Japan, South Korea, India (state editions), Indonesia, the
Philippines, Nigeria, Kenya, South Africa, Turkey. Search **in the local
language** — translate the query terms, not just the topic — then translate the
story into English yourself and set `"language"` on the record.

**Tier 3 — leads only, never the source.**
Weird-news aggregators, forums, subreddits, niche blogs. Use them to find a
thread, then track the story back to the local outlet that broke it and cite
**that**. Never link an aggregator.

**Subculture pass — run it separately.**
Hobbyist federations, competitive amateur sports, collector societies,
religious splinter groups, reenactors, urban explorers, single-subject museums,
regional festivals, trade associations for strange trades. Search for the
*community* first, then find recent local coverage of it.

Run **at least 40 distinct searches**, in parallel batches. Do not stop at the
first page. Do not build the issue out of whatever surfaces first — most of
that is syndicated filler.

## Selection

16–20 stories. Take one if it is genuinely strange, has a vivid physical
setting, involves a real person with a real obsession, or contains an image you
could not have invented. The target is the man in Ohio who has hand-dug a
tunnel under his house for thirty years. A quirky-headline wire story about a
cat is not.

Reject:

- anything in `seen.json` — by URL and by fuzzy headline match
- syndicated wire copy running on forty sites
- SEO content farms and AI slop
- listicles and "you won't believe" framing
- humour that depends on someone's death, disability, poverty or mental
  illness. Strange is fine; punching down is not
- links that do not resolve — **verify every URL**

No more than three stories from any one country. Prefer places the reader would
otherwise never read about.

## Writing

- **Headline** — your own, max 8 words, flat and declarative. Let the facts be
  the joke.
- **Summary** — 40–60 words (120–150 for the longer piece). What happened, who
  is involved, the detail that makes it worth reading. No preamble, no "in a
  bizarre twist", no editorialising.
- **Image line** — max 15 words. The single visual that would carry a frame.
  The only interpretive line in the whole issue; if you cannot write one that
  earns its place, cut the story.
- **Link** — the original outlet, named. Note the language if not English.

Dry, observational, confident. No exclamation marks. No winking.

## Sections

Four, roughly 4–5 stories each, plus one longer piece:

1. **Dispatches** — general offbeat, small-town news
2. **Subcultures** — communities, obsessives, clubs, rituals
3. **Unexplained** — mysteries, hauntings, things nobody can account for
4. **Characters** — one person, one fixation

## Output

Write `content/YYYY-MM-DD.json`:

```jsonc
{
  "date": "2026-09-14",                  // issue date, also the filename
  "range_label": "1–14 September 2026",  // printed on the cover and the footer
  "cover_note": "…",                     // 40–60 words, sets up the fortnight
  "colophon_note": "…",                  // one short paragraph
  "search_count": 46,                    // how many searches actually ran
  "empty_searches": ["Nordic county press — nothing usable"],
  "sections": [
    { "title": "Dispatches", "stories": [ { /* story */ } ] }
  ],
  "longer": { /* story, 120–150 word summary */ }
}
```

A story record:

```jsonc
{
  "headline": "Town votes to keep the wrong clock",
  "town": "Ardglass", "region": "County Down", "country": "Northern Ireland",
  "date": "2026-08-21",                  // the story's date, not the issue's
  "summary": "…",
  "frame": "…",                          // the image line
  "outlet": "Down Recorder",
  "url": "https://…",
  "language": "Polish"                   // omit or null when the source is English
}
```

`country` is the country as a local would name it — England, Scotland and Wales
all appear as themselves in the dateline, and the builder still counts them
against one United Kingdom cap.

Then:

```bash
python3 build.py --check-links content/2026-09-14.json
```

`--check-links` resolves every URL before laying anything out. The builder
refuses to render an issue that repeats a story, breaks the country cap, or
runs a headline past eight words.
