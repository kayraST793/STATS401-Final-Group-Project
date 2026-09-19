"""
build_data.py — STATS 401 final project data pipeline (whiteboard scaffold).

Acquires -> cleans -> transforms -> merges -> classifies -> aggregates the three
datasets described in docs/data-spec.md, and writes analysis-ready files that the
D3 visualizations consume.

ALL tunable decisions live in the CONFIG block below (adjustability principle).
Re-run:  python build_data.py           (uses cached raw files if present)
         python build_data.py --refresh (re-downloads raw sources)

Outputs (written to this data/ folder):
  raw/SP500.csv, raw/VIXCLS.csv, raw/12_Industry_Portfolios_Daily.csv  (sources)
  daily_panel.csv             date, sp500, sp_return, vix, trend, condition
  industry_daily.csv          long: date, condition, industry, ret
  industry_by_condition.json  per industry x condition: mean/std/sharpe/n
  correlations.json           per-condition + overall 12x12 correlation matrices
  meta.json                   run parameters + row counts (for the dashboard)
"""

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------
# CONFIG  (single source of truth — mirrors docs/data-spec.md; edit here only)
# ----------------------------------------------------------------------------
CONFIG = {
    "window_start": "2016-09-15",
    "window_end":   "2026-09-14",   # raw FRED cap; industry data trims panel to 2026-07-31

    "return_mode":  "simple",        # "simple" | "log"
    "trend_window": 1,               # 1 = single-day return sign; N = trailing N-day cum return
    "units":        "percent",       # returns expressed in percent

    "vix_cut_mode": "median",        # "median" | "fixed"
    "vix_cut_fixed": 17.0,           # used only if vix_cut_mode == "fixed"

    # scatterplot educational reference band (p33-p67); not a classifier
    "typical_band": [15.0, 20.0],

    "sources": {
        "sp500": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500",
        "vix":   "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS",
        "industry_zip": "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/12_Industry_Portfolios_Daily_CSV.zip",
    },
}

# 12 French industry codes -> readable names (order preserved)
INDUSTRY_NAMES = {
    "NoDur": "Consumer NonDurables",
    "Durbl": "Consumer Durables",
    "Manuf": "Manufacturing",
    "Enrgy": "Energy",
    "Chems": "Chemicals",
    "BusEq": "Business Equipment",
    "Telcm": "Telecom",
    "Utils": "Utilities",
    "Shops": "Retail",
    "Hlth":  "Healthcare",
    "Money": "Finance",
    "Other": "Other",
}
INDUSTRY_CODES = list(INDUSTRY_NAMES.keys())

CONDITION_ORDER = ["Calm-Up", "Calm-Down", "Volatile-Up", "Volatile-Down"]

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
RAW.mkdir(parents=True, exist_ok=True)


# ----------------------------------------------------------------------------
# Acquisition
# ----------------------------------------------------------------------------
def _download(url: str, dest: Path, refresh: bool) -> bytes:
    if dest.exists() and not refresh:
        return dest.read_bytes()
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    dest.write_bytes(data)
    return data


def acquire(refresh: bool):
    print("[1/6] Acquiring raw sources...")
    sp_bytes = _download(CONFIG["sources"]["sp500"], RAW / "SP500.csv", refresh)
    vx_bytes = _download(CONFIG["sources"]["vix"], RAW / "VIXCLS.csv", refresh)

    ind_csv = RAW / "12_Industry_Portfolios_Daily.csv"
    if not ind_csv.exists() or refresh:
        zip_bytes = _download(CONFIG["sources"]["industry_zip"], RAW / "industry.zip", refresh)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            name = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
            ind_csv.write_bytes(z.read(name))
    return sp_bytes, vx_bytes, ind_csv


# ----------------------------------------------------------------------------
# Cleaning / parsing
# ----------------------------------------------------------------------------
def load_fred(path: Path, valcol: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = ["date", valcol]
    df["date"] = pd.to_datetime(df["date"])
    df[valcol] = pd.to_numeric(df[valcol], errors="coerce")  # blanks -> NaN
    return df.dropna(subset=[valcol]).reset_index(drop=True)


def load_industries(path: Path) -> pd.DataFrame:
    """Parse ONLY the value-weighted daily table out of the French file."""
    lines = path.read_text().splitlines()
    start = None
    for i, ln in enumerate(lines):
        if "Average Value Weighted Returns" in ln:
            start = i + 1  # next line is the column header
            break
    if start is None:
        raise RuntimeError("Value-Weighted table not found in French file")

    rows = []
    for ln in lines[start + 1:]:
        s = ln.strip()
        if not s or not s[:8].isdigit():   # blank line or next section -> stop
            break
        parts = [p.strip() for p in s.split(",")]
        rows.append(parts)

    df = pd.DataFrame(rows, columns=["date"] + INDUSTRY_CODES)
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    for c in INDUSTRY_CODES:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    # French missing markers
    df[INDUSTRY_CODES] = df[INDUSTRY_CODES].mask(df[INDUSTRY_CODES] <= -99.0, np.nan)
    return df


# ----------------------------------------------------------------------------
# Transform / merge / classify
# ----------------------------------------------------------------------------
def build_panel(sp: pd.DataFrame, vx: pd.DataFrame, ind: pd.DataFrame):
    print("[3/6] Transforming + merging...")
    start = pd.Timestamp(CONFIG["window_start"])
    end = pd.Timestamp(CONFIG["window_end"])

    sp = sp[(sp.date >= start) & (sp.date <= end)].copy()
    vx = vx[(vx.date >= start) & (vx.date <= end)].copy()
    ind = ind[(ind.date >= start) & (ind.date <= end)].copy()

    # S&P return (percent), simple or log
    sp = sp.sort_values("date")
    if CONFIG["return_mode"] == "log":
        sp["sp_return"] = np.log(sp.sp500 / sp.sp500.shift(1)) * 100.0
    else:
        sp["sp_return"] = (sp.sp500 / sp.sp500.shift(1) - 1.0) * 100.0

    # trend measure for Up/Down (single day, or trailing N-day cumulative %)
    n = int(CONFIG["trend_window"])
    if n <= 1:
        sp["trend"] = sp["sp_return"]
    else:
        sp["trend"] = (sp.sp500 / sp.sp500.shift(n) - 1.0) * 100.0

    # inner join: S&P ∩ VIX ∩ Industries
    panel = sp.merge(vx, on="date", how="inner").merge(
        ind[["date"]], on="date", how="inner"
    )
    panel = panel.dropna(subset=["sp_return", "trend", "vix"]).reset_index(drop=True)

    # classify four conditions
    cut = panel.vix.median() if CONFIG["vix_cut_mode"] == "median" else CONFIG["vix_cut_fixed"]
    vol = np.where(panel.vix <= cut, "Calm", "Volatile")
    trend = np.where(panel.trend >= 0, "Up", "Down")
    panel["condition"] = [f"{v}-{t}" for v, t in zip(vol, trend)]

    # industry returns aligned to the same panel dates (long form)
    ind_win = ind[ind.date.isin(panel.date)].copy()
    ind_long = ind_win.melt(id_vars="date", value_vars=INDUSTRY_CODES,
                            var_name="industry", value_name="ret")
    ind_long = ind_long.merge(panel[["date", "condition"]], on="date", how="left")

    return panel, ind_win, ind_long, float(cut)


# ----------------------------------------------------------------------------
# Aggregate
# ----------------------------------------------------------------------------
def aggregate(ind_long: pd.DataFrame):
    print("[4/6] Aggregating per industry x condition...")
    recs = []
    for code in INDUSTRY_CODES:
        sub = ind_long[ind_long.industry == code]
        for cond in CONDITION_ORDER:
            vals = sub[sub.condition == cond]["ret"].dropna()
            if len(vals) == 0:
                mean = std = sharpe = None
            else:
                mean = float(vals.mean())
                std = float(vals.std(ddof=1)) if len(vals) > 1 else 0.0
                sharpe = float(mean / std) if std and std > 0 else None
            recs.append({
                "code": code, "industry": INDUSTRY_NAMES[code], "condition": cond,
                "mean": mean, "std": std, "sharpe": sharpe, "n": int(len(vals)),
            })
    return recs


def correlations(ind_win: pd.DataFrame, panel: pd.DataFrame):
    print("[5/6] Computing per-condition correlations...")
    merged = ind_win.merge(panel[["date", "condition"]], on="date", how="left")

    def corr_matrix(frame):
        return frame[INDUSTRY_CODES].corr().round(4).values.tolist()

    out = {
        "industries": [INDUSTRY_NAMES[c] for c in INDUSTRY_CODES],
        "codes": INDUSTRY_CODES,
        "All": corr_matrix(merged),
        "byCondition": {},
    }
    for cond in CONDITION_ORDER:
        sub = merged[merged.condition == cond]
        out["byCondition"][cond] = corr_matrix(sub) if len(sub) > 2 else None
    return out


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    refresh = "--refresh" in sys.argv
    sp_b, vx_b, ind_csv = acquire(refresh)

    print("[2/6] Cleaning...")
    sp = load_fred(RAW / "SP500.csv", "sp500")
    vx = load_fred(RAW / "VIXCLS.csv", "vix")
    ind = load_industries(ind_csv)

    panel, ind_win, ind_long, cut = build_panel(sp, vx, ind)
    agg = aggregate(ind_long)
    corr = correlations(ind_win, panel)

    print("[6/6] Writing outputs...")
    panel_out = panel[["date", "sp500", "sp_return", "vix", "trend", "condition"]].copy()
    panel_out["date"] = panel_out["date"].dt.strftime("%Y-%m-%d")
    panel_out.to_csv(HERE / "daily_panel.csv", index=False,
                     float_format="%.4f")

    ind_long_out = ind_long.dropna(subset=["ret"]).copy()
    ind_long_out["date"] = ind_long_out["date"].dt.strftime("%Y-%m-%d")
    ind_long_out.to_csv(HERE / "industry_daily.csv", index=False,
                        float_format="%.4f")

    (HERE / "industry_by_condition.json").write_text(json.dumps({
        "conditionOrder": CONDITION_ORDER,
        "records": agg,
    }, indent=2))

    (HERE / "correlations.json").write_text(json.dumps(corr, indent=2))

    counts = {c: int((panel.condition == c).sum()) for c in CONDITION_ORDER}
    meta = {
        "config": CONFIG,
        "industryNames": INDUSTRY_NAMES,
        "conditionOrder": CONDITION_ORDER,
        "vixCut": round(cut, 4),
        "panelRows": int(len(panel)),
        "panelStart": panel.date.min().strftime("%Y-%m-%d"),
        "panelEnd": panel.date.max().strftime("%Y-%m-%d"),
        "conditionCounts": counts,
    }
    (HERE / "meta.json").write_text(json.dumps(meta, indent=2))

    # ---- verification print ----
    print("\n=== VERIFICATION ===")
    print(f"panel rows        : {len(panel)}")
    print(f"panel span        : {meta['panelStart']} -> {meta['panelEnd']}")
    print(f"VIX cut ({CONFIG['vix_cut_mode']}) : {cut:.2f}")
    print(f"condition counts  : {counts}")
    print(f"industries        : {len(INDUSTRY_CODES)}")
    empties = [r for r in agg if r['n'] == 0]
    print(f"empty agg cells   : {len(empties)}")
    print("outputs written to:", HERE)


if __name__ == "__main__":
    main()