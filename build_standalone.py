"""
build_standalone.py — bundle the whole dashboard into ONE html file.

Inlines d3, the stylesheet, all five view scripts, and the data itself, so the
result opens by double-clicking it (no local server, no internet, nothing to
404). Useful as a presentation backup; the multi-file version stays the one you
develop against.

    python build_standalone.py        ->  dashboard_standalone.html
"""

import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "dashboard_standalone.html"


def read(p):
    return (HERE / p).read_text(encoding="utf-8")


def num(s):
    if s is None or s == "":
        return None
    try:
        return round(float(s), 4)
    except ValueError:
        return None


meta = json.loads(read("data/meta.json"))
agg = json.loads(read("data/industry_by_condition.json"))
corr = json.loads(read("data/correlations.json"))
codes = list(meta["industryNames"].keys())

# daily panel -> [date, sp500, sp_return, vix, trend, condition]
panel = []
with open(HERE / "data/daily_panel.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        panel.append([
            r["date"], num(r["sp500"]), num(r["sp_return"]),
            num(r["vix"]), num(r["trend"]), r["condition"],
        ])

# long industry file -> one row per date: [date, condition, [12 returns]]
by_date = {}
with open(HERE / "data/industry_daily.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        d = r["date"]
        rec = by_date.setdefault(d, [d, r["condition"], [None] * len(codes)])
        try:
            rec[2][codes.index(r["industry"])] = num(r["ret"])
        except ValueError:
            pass
daily = [by_date[k] for k in sorted(by_date)]

inline = {"meta": meta, "agg": agg, "corr": corr, "codes": codes,
          "panel": panel, "daily": daily}

html = read("index.html")
css = read("css/whiteboard.css")
scripts = ["js/d3.v7.min.js", "js/config.js", "js/viz1_timeline.js",
           "js/viz2_scatter.js", "js/viz3_heatmap.js", "js/viz4_chord.js",
           "js/viz5_comparison.js", "js/main.js"]

# stylesheet -> inline <style>  (href carries a ?v= cache-buster, so match loosely)
html, n = re.subn(
    r'<link rel="stylesheet" href="css/whiteboard\.css[^"]*">',
    lambda _: "<style>\n" + css + "\n</style>",
    html,
)
assert n == 1, f"expected 1 stylesheet link, found {n}"

# strip every external <script src=...> (and the CDN fallback block)
html = re.sub(r'<script src="[^"]*"></script>\s*', "", html)
html = re.sub(
    r"<script>\s*if \(!window\.d3\).*?</script>\s*", "", html, flags=re.S
)

# Lift the self-check out so it can be re-appended AFTER the bundle; otherwise
# it runs before d3 exists and reports a failure that hasn't happened.
selfcheck = ""
m = re.search(r"<!-- Self-check:.*?</script>", html, flags=re.S)
if m:
    selfcheck = m.group(0)
    html = html.replace(selfcheck, "")

bundle = ["<script>window.__WB_INLINE = " + json.dumps(inline, separators=(",", ":")) + ";</script>"]
for s in scripts:
    bundle.append("<script>\n" + read(s) + "\n</script>")
if selfcheck:
    bundle.append(selfcheck)

html = html.replace("</body>", "\n".join(bundle) + "\n</body>")
OUT.write_text(html, encoding="utf-8")

kb = OUT.stat().st_size / 1024
print(f"wrote {OUT.name}  ({kb:,.0f} KB)")
print(f"  trading days : {len(daily):,}")
print(f"  panel rows   : {len(panel):,}")
print(f"  industries   : {len(codes)}")
