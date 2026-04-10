#!/usr/bin/env python3
"""Scrape idioms + example sentences from 教育部成語典 e-book pages."""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://dict.idioms.moe.edu.tw/bookView.jsp?ID="
OUT = Path(__file__).resolve().parent.parent / "webapp" / "backend" / "data" / "idioms.json"

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "cecelearn-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read().decode("utf-8", errors="replace")

def extract(html: str) -> dict | None:
    # Title from <h2>
    m = re.search(r"<h2>\s*(.+?)\s*(?:<|$)", html)
    if not m:
        return None
    title = re.sub(r"<[^>]+>", "", m.group(1)).strip()
    if not title or len(title) < 2:
        return None

    # Check if it's a main entry (has 例句 section)
    if "例句" not in html:
        return None

    # Extract all <li> under 例句 section
    # Find the 例句 header, then grab <li> items after it
    examples = []
    in_example = False
    for line in html.split("\n"):
        if "例句" in line and ("<h4" in line or "<h3" in line):
            in_example = True
            continue
        if in_example and ("<h3" in line or "<h4" in line):
            # If we hit 辨識/近義/反義/參考 section, stop
            if any(kw in line for kw in ["辨", "近義", "反義", "參考"]):
                in_example = False
                continue
        if in_example:
            for li in re.findall(r"<li>(.*?)</li>", line):
                text = re.sub(r"<[^>]+>", "", li).strip()
                clean_title = title.replace(" ", "")
                if clean_title in text and len(text) > len(clean_title) + 4:
                    examples.append(text)

    if not examples:
        return None

    return {"idiom": title, "examples": examples}

def main():
    # Read IDs
    index_html = fetch(BASE + "-1")
    ids = sorted(set(int(x) for x in re.findall(r"bookView\.jsp\?ID=(\d+)", index_html)))
    print(f"Found {len(ids)} IDs to scrape")

    results = []
    errors = 0
    for i, id_ in enumerate(ids):
        try:
            html = fetch(f"{BASE}{id_}")
            entry = extract(html)
            if entry:
                results.append(entry)
                if i % 50 == 0:
                    print(f"  [{i}/{len(ids)}] {entry['idiom']} ({len(entry['examples'])} examples)")
        except Exception as e:
            errors += 1
            if errors < 5:
                print(f"  [{i}] ID={id_} error: {e}", file=sys.stderr)
        # Rate limit: ~5 req/sec
        time.sleep(0.2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone: {len(results)} idioms saved to {OUT}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    main()
