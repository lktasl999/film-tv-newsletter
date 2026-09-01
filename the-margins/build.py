#!/usr/bin/env python3
"""THE MARGINS — issue builder.

    python3 build.py                      # build the newest content/*.json
    python3 build.py content/2026-09-01.json
    python3 build.py --sample content/_sample.json   # design proof, no archive write
    python3 build.py --check-links        # resolve every URL before building
    python3 build.py --png                # also rasterise pages to out/pages/

The research pass is not done here — it is done by the agent, which writes a
content JSON. This script owns everything downstream of that: validation,
de-duplication against the archive, layout, PDF, and the archive write-back.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import difflib
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from jinja2 import Template
from weasyprint import HTML

ROOT = Path(__file__).resolve().parent
FONTS = ROOT / "fonts"
ISSUES = ROOT / "issues"
ARCHIVE = ROOT / "archive"
CONTENT = ROOT / "content"
OUT = ROOT / "out"

SEEN = ARCHIVE / "seen.json"
SOURCES = ARCHIVE / "sources.json"

FACES = [
    ("Archivo", "archivo-latin-400-normal.woff2", 400, "normal"),
    ("Archivo", "archivo-latin-500-normal.woff2", 500, "normal"),
    ("Archivo", "archivo-latin-600-normal.woff2", 600, "normal"),
    ("Archivo", "archivo-latin-700-normal.woff2", 700, "normal"),
    ("Newsreader", "newsreader-latin-400-normal.woff2", 400, "normal"),
    ("Newsreader", "newsreader-latin-400-italic.woff2", 400, "italic"),
    ("Newsreader", "newsreader-latin-500-normal.woff2", 500, "normal"),
    ("Newsreader", "newsreader-latin-600-normal.woff2", 600, "normal"),
    ("IBM Plex Mono", "ibm-plex-mono-latin-400-normal.woff2", 400, "normal"),
    ("IBM Plex Mono", "ibm-plex-mono-latin-500-normal.woff2", 500, "normal"),
]

# Datelines name the place as a local would; the per-country cap is applied to
# the sovereign state, so four Welsh stories still count as four UK stories.
CAP_GROUP = {
    "England": "United Kingdom", "Scotland": "United Kingdom",
    "Wales": "United Kingdom", "Northern Ireland": "United Kingdom",
    "Isle of Man": "United Kingdom",
}

ISO2 = {
    "United States": "US", "England": "GB", "Scotland": "GB", "Wales": "GB",
    "Northern Ireland": "GB", "United Kingdom": "GB", "Ireland": "IE",
    "Brazil": "BR", "Mexico": "MX", "Argentina": "AR", "Chile": "CL",
    "Colombia": "CO", "Peru": "PE", "France": "FR", "Germany": "DE",
    "Italy": "IT", "Spain": "ES", "Portugal": "PT", "Poland": "PL",
    "Czechia": "CZ", "Slovakia": "SK", "Austria": "AT", "Switzerland": "CH",
    "Netherlands": "NL", "Belgium": "BE", "Denmark": "DK", "Norway": "NO",
    "Sweden": "SE", "Finland": "FI", "Iceland": "IS", "Estonia": "EE",
    "Latvia": "LV", "Lithuania": "LT", "Hungary": "HU", "Romania": "RO",
    "Bulgaria": "BG", "Greece": "GR", "Croatia": "HR", "Serbia": "RS",
    "Slovenia": "SI", "Turkey": "TR", "Ukraine": "UA", "Japan": "JP",
    "South Korea": "KR", "China": "CN", "Taiwan": "TW", "India": "IN",
    "Pakistan": "PK", "Bangladesh": "BD", "Sri Lanka": "LK", "Nepal": "NP",
    "Indonesia": "ID", "Philippines": "PH", "Malaysia": "MY", "Thailand": "TH",
    "Vietnam": "VN", "Singapore": "SG", "Australia": "AU", "New Zealand": "NZ",
    "Nigeria": "NG", "Kenya": "KE", "Ghana": "GH", "South Africa": "ZA",
    "Uganda": "UG", "Tanzania": "TZ", "Ethiopia": "ET", "Morocco": "MA",
    "Egypt": "EG", "Canada": "CA", "Israel": "IL", "Russia": "RU",
}

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ------------------------------------------------------------------ helpers

def font_css() -> str:
    """Fonts are base64-inlined so the PDF renders identically anywhere."""
    out = []
    for family, filename, weight, style in FACES:
        b64 = base64.b64encode((FONTS / filename).read_bytes()).decode()
        out.append(
            f'@font-face{{font-family:"{family}";font-style:{style};'
            f"font-weight:{weight};font-display:block;"
            f'src:url(data:font/woff2;base64,{b64}) format("woff2");}}'
        )
    return "\n".join(out)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def norm_url(url: str) -> str:
    p = urlsplit(url.strip())
    host = p.netloc.lower().removeprefix("www.")
    path = p.path.rstrip("/") or "/"
    return f"{host}{path}"


def domain(url: str) -> str:
    return urlsplit(url).netloc.lower().removeprefix("www.")


def norm_headline(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


def words(text: str) -> int:
    return len(text.split())


def typo(text: str) -> str:
    """Straight quotes and hyphens are typewriter marks. Set them properly."""
    if not text:
        return text
    text = text.replace("--", "\u2013")
    text = re.sub(r"(?<=\w)'(?=\w)", "\u2019", text)          # don't, keeper's
    text = re.sub(r"\B'(?=\w)", "\u2018", text)                # opening single
    text = re.sub(r"(?<=\w)'\B", "\u2019", text)               # closing single
    text = re.sub(r'"(?=\w)', "\u201c", text)
    text = text.replace('"', "\u201d")
    text = re.sub(r"(\d)\s*-\s*(\d)", "\\1\u2013\\2", text)  # 1998-2004
    return text


def fmt_date(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def iter_stories(doc: dict):
    for section in doc.get("sections", []):
        for story in section.get("stories", []):
            yield section, story
    if doc.get("longer"):
        yield {"title": "One Longer Piece"}, doc["longer"]


# --------------------------------------------------------------- validation

def validate(doc: dict, seen: list, sample: bool) -> list[str]:
    problems, warnings = [], []
    seen_urls = {r["url_key"] for r in seen}
    seen_heads = [(r["headline_key"], r.get("issue")) for r in seen]

    cap_counts: dict[str, int] = {}
    url_keys: set[str] = set()

    for section, s in iter_stories(doc):
        tag = f'"{s.get("headline", "?")[:44]}"'
        for field in ("headline", "town", "country", "date", "summary",
                      "outlet", "url"):
            if not s.get(field):
                problems.append(f"{tag}: missing {field}")

        long_piece = section.get("title") == "One Longer Piece"
        lo, hi = (120, 155) if long_piece else (40, 60)
        n = words(s.get("summary", ""))
        if not lo <= n <= hi:
            warnings.append(f"{tag}: summary is {n} words (want {lo}–{hi})")
        if words(s.get("headline", "")) > 8:
            problems.append(f"{tag}: headline is over 8 words")
        if s.get("frame") and words(s["frame"]) > 15:
            problems.append(f"{tag}: image line is over 15 words")

        key = norm_url(s.get("url", ""))
        if key in seen_urls:
            problems.append(f"{tag}: URL already in seen.json")
        if key in url_keys:
            problems.append(f"{tag}: duplicate URL inside this issue")
        url_keys.add(key)

        hk = norm_headline(s.get("headline", ""))
        for old, issue in seen_heads:
            if difflib.SequenceMatcher(None, hk, old).ratio() > 0.82:
                problems.append(f"{tag}: near-duplicate of a story in issue {issue}")
                break

        country = s.get("country", "?")
        group = CAP_GROUP.get(country, country)
        cap_counts[group] = cap_counts.get(group, 0) + 1

    for group, n in sorted(cap_counts.items()):
        if n > 3:
            problems.append(f"{n} stories from {group} — the cap is 3")

    total = sum(1 for _ in iter_stories(doc))
    if not sample and not 16 <= total <= 20:
        problems.append(f"{total} stories — an issue runs 16–20")

    for w in warnings:
        print(f"  warn  {w}")
    return problems


def check_links(doc: dict) -> list[str]:
    """Resolve every URL. Distinguishes a dead link from a blocked network:
    behind a restrictive egress policy every host fails at the socket, which
    says nothing about the links, so that case warns instead of blocking."""
    bad, unreachable, total = [], 0, 0
    for _, s in iter_stories(doc):
        total += 1
        url = s.get("url", "")
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; the-margins/1.0)"})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:                      # noqa: BLE001
            unreachable += 1
            bad.append(f"{url} — {type(e).__name__}: {e}")
            continue
        if code >= 400:
            bad.append(f"{url} — HTTP {code}")
        print(f"  link  {code}  {url}")

    if total and unreachable == total:
        print("\n  link check skipped — every host failed at the socket, which "
              "means\n  this machine has no general web egress, not that the "
              "links are dead.")
        return []
    return bad


# ------------------------------------------------------------------ render

def build_context(doc: dict, issue_no: int) -> dict:
    n = 0
    toc, sections = [], []

    for i, section in enumerate(doc.get("sections", []), start=1):
        rows, stories = [], []
        for s in section["stories"]:
            n += 1
            num = f"{n:02d}"
            place = ", ".join(x for x in (s["town"], s.get("region"), s["country"]) if x)
            stories.append({
                **s,
                "headline": typo(s["headline"]),
                "summary": typo(s["summary"]),
                "frame": typo(s.get("frame", "")),
                "num": num,
                "dateline": f"{place} · {fmt_date(s['date'])}",
                "domain": domain(s["url"]),
            })
            rows.append({"num": num, "headline": typo(s["headline"]),
                         "where": s["country"]})
        sections.append({"index": i, "title": section["title"], "stories": stories})
        toc.append({"section": section["title"], "rows": rows})

    longer = None
    if doc.get("longer"):
        s = doc["longer"]
        n += 1
        place = ", ".join(x for x in (s["town"], s.get("region"), s["country"]) if x)
        longer = {
            **s,
            "headline": typo(s["headline"]),
            "summary": typo(s["summary"]),
            "frame": typo(s.get("frame", "")),
            "num": f"{n:02d}",
            "dateline": f"{place} · {fmt_date(s['date'])}",
            "domain": domain(s["url"]),
        }
        toc.append({"section": "One Longer Piece",
                    "rows": [{"num": longer["num"], "headline": typo(s["headline"]),
                              "where": s["country"]}]})

    countries = sorted({s["country"] for _, s in iter_stories(doc)})

    colophon = None
    if doc.get("colophon_note"):
        rows, seen_outlets = [], set()
        for _, s in iter_stories(doc):
            if s["outlet"] in seen_outlets:
                continue
            seen_outlets.add(s["outlet"])
            rows.append({"cc": ISO2.get(s["country"], s["country"][:2].upper()),
                         "outlet": s["outlet"]})
        rows.sort(key=lambda r: (r["cc"], r["outlet"]))
        colophon = {"note": typo(doc["colophon_note"]), "outlets": rows}

    issue_date = doc.get("date") or dt.date.today().isoformat()
    return {
        "issue_no": f"{issue_no:02d}",
        "range_label": doc["range_label"],
        "story_count": n,
        "country_count": len(countries),
        "cover_note": typo(doc.get("cover_note", "")),
        "toc": toc,
        "sections": sections,
        "longer": longer,
        "colophon": colophon,
        "runfoot": f"The Margins · Issue {issue_no:02d} · {doc['range_label']}",
        "font_css": font_css(),
        "base_css": (ROOT / "style.css").read_text(encoding="utf-8"),
        "_countries": countries,
        "_date": issue_date,
    }


def render(ctx: dict, stem: str, outdir: Path) -> tuple[Path, Path, int]:
    outdir.mkdir(parents=True, exist_ok=True)
    template = Template((ROOT / "template.html").read_text(encoding="utf-8"))
    html = template.render(**ctx)

    html_path = outdir / f"{stem}.html"
    pdf_path = outdir / f"{stem}.pdf"
    html_path.write_text(html, encoding="utf-8")

    doc = HTML(string=html, base_url=str(ROOT)).render()
    doc.write_pdf(str(pdf_path))
    return html_path, pdf_path, len(doc.pages)


def rasterise(pdf_path: Path, outdir: Path, scale: float = 2.0) -> int:
    import pypdfium2 as pdfium

    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob("page-*.png"):
        old.unlink()
    pdf = pdfium.PdfDocument(str(pdf_path))
    for i in range(len(pdf)):
        pdf[i].render(scale=scale).to_pil().save(outdir / f"page-{i + 1:02d}.png")
    return len(pdf)


# ----------------------------------------------------------------- archive

def write_archive(doc: dict, ctx: dict, issue_no: int) -> None:
    seen = load_json(SEEN, [])
    sources = load_json(SOURCES, {})
    today = ctx["_date"]

    for _, s in iter_stories(doc):
        seen.append({
            "url": s["url"],
            "url_key": norm_url(s["url"]),
            "headline": s["headline"],
            "headline_key": norm_headline(s["headline"]),
            "outlet": s["outlet"],
            "country": s["country"],
            "story_date": s["date"],
            "issue": issue_no,
            "issue_date": today,
        })
        d = domain(s["url"])
        rec = sources.setdefault(d, {
            "outlet": s["outlet"], "country": s["country"],
            "language": s.get("language", "English"),
            "hits": 0, "first_issue": issue_no, "last_issue": issue_no,
        })
        rec["hits"] += 1
        rec["last_issue"] = issue_no
        rec["outlet"] = s["outlet"]

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    SEEN.write_text(json.dumps(seen, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    SOURCES.write_text(json.dumps(dict(sorted(sources.items())), indent=2,
                                  ensure_ascii=False) + "\n", encoding="utf-8")


def next_issue_no() -> int:
    seen = load_json(SEEN, [])
    return max((r.get("issue", 0) for r in seen), default=0) + 1


# -------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Build an issue of THE MARGINS.")
    ap.add_argument("content", nargs="?", help="content JSON (default: newest in content/)")
    ap.add_argument("--sample", action="store_true",
                    help="design proof: relax the story count, write to out/, skip the archive")
    ap.add_argument("--no-archive", action="store_true", help="build but do not record the issue")
    ap.add_argument("--check-links", action="store_true", help="resolve every URL first")
    ap.add_argument("--png", action="store_true", help="also write out/pages/page-NN.png")
    ap.add_argument("--issue", type=int, help="force the issue number")
    args = ap.parse_args()

    if args.content:
        path = Path(args.content)
    else:
        candidates = sorted(p for p in CONTENT.glob("*.json") if not p.name.startswith("_"))
        if not candidates:
            print("no content JSON found in content/", file=sys.stderr)
            return 1
        path = candidates[-1]

    doc = json.loads(path.read_text(encoding="utf-8"))
    issue_no = args.issue if args.issue is not None else doc.get("issue")
    if issue_no is None:
        issue_no = next_issue_no()

    print(f"\n  THE MARGINS — issue {issue_no:02d}   ({path.name})\n")

    if args.check_links:
        bad = check_links(doc)
        if bad:
            print("\n  links that did not resolve:")
            for b in bad:
                print(f"    {b}")
            return 1

    problems = validate(doc, load_json(SEEN, []), args.sample)
    if problems:
        print("\n  blocked:")
        for p in problems:
            print(f"    {p}")
        return 1

    ctx = build_context(doc, issue_no)
    stem = (f"margins-sample-{ctx['_date']}" if args.sample
            else f"margins-{issue_no:02d}-{ctx['_date']}")
    outdir = OUT if args.sample else ISSUES
    html_path, pdf_path, pages = render(ctx, stem, outdir)

    if args.png:
        n = rasterise(pdf_path, OUT / "pages")
        print(f"  rasterised {n} pages to {(OUT / 'pages').relative_to(ROOT)}/")

    if not (args.sample or args.no_archive):
        write_archive(doc, ctx, issue_no)

    empties = doc.get("empty_searches", [])
    print(f"""
  issue        {issue_no:02d}
  dated        {ctx['_date']}   ({ctx['range_label']})
  stories      {ctx['story_count']}
  countries    {ctx['country_count']} — {', '.join(ctx['_countries'])}
  searches     {doc.get('search_count', '?')} run, {len(empties)} came back empty
  pages        {pages}
  pdf          {pdf_path.relative_to(ROOT)}
  html         {html_path.relative_to(ROOT)}""")

    if empties:
        print("\n  thin coverage — these searches returned nothing usable:")
        for e in empties:
            print(f"    · {e}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
