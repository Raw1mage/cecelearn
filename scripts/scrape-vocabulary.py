#!/usr/bin/env python3
"""Scrape elementary school vocabulary from stroke.gh.miniasp.com."""

import json
import time
import urllib.request
from pathlib import Path

BASE = "https://stroke.gh.miniasp.com/vocabulary"
OUT = Path(__file__).resolve().parent.parent / "webapp" / "backend" / "data" / "vocabulary.json"

def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "cecelearn-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))

def main():
    # Step 1: Get the index
    print("Fetching options.json...")
    options = fetch_json(f"{BASE}/options.json")
    print(f"Generated at: {options['generatedAt']}")

    # Step 2: Collect all lesson IDs
    lessons = []
    for year in options["years"]:
        for grade in year["grades"]:
            for version in grade["versions"]:
                for lesson in version["lessons"]:
                    lessons.append({
                        "year": year["label"],
                        "grade": grade["label"],
                        "version": version["label"],
                        "lesson": lesson["label"],
                        "textNameId": lesson["textNameId"],
                    })

    print(f"Found {len(lessons)} lessons to scrape")

    # Step 3: Fetch each lesson's vocabulary
    results = []
    errors = 0
    for i, meta in enumerate(lessons):
        try:
            data = fetch_json(f"{BASE}/{meta['textNameId']}.json")
            chars = []
            for item in data.get("詞條", []):
                name = item.get("詞條名稱", "").strip()
                if len(name) == 1:  # single character only
                    chars.append(name)

            results.append({
                **meta,
                "characters": chars,
            })

            if i % 50 == 0:
                print(f"  [{i}/{len(lessons)}] {meta['grade']} {meta['version']} {meta['lesson']} → {len(chars)} chars")
        except Exception as e:
            errors += 1
            if errors < 10:
                print(f"  [{i}] {meta['textNameId']} error: {e}")
        time.sleep(0.15)

    # Step 4: Save
    OUT.parent.mkdir(parents=True, exist_ok=True)

    # Build summary
    total_chars = sum(len(r["characters"]) for r in results)
    unique_chars = len(set(c for r in results for c in r["characters"]))

    output = {
        "generatedAt": options["generatedAt"],
        "stats": {
            "lessons": len(results),
            "totalChars": total_chars,
            "uniqueChars": unique_chars,
        },
        "lessons": results,
    }

    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone: {len(results)} lessons, {total_chars} chars ({unique_chars} unique)")
    print(f"Saved to {OUT}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    main()
