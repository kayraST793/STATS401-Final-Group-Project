// config.js — front-end single source of truth (mirrors docs/data-spec.md).
// Edit values here only; every viz reads from WB.config. (adjustability principle)
window.WB = window.WB || {};

WB.config = {
  dataDir: "data/",

  files: {
    meta: "data/meta.json",
    panel: "data/daily_panel.csv",
    agg: "data/industry_by_condition.json",
    corr: "data/correlations.json",
    industryDaily: "data/industry_daily.csv",
  },

  // four market conditions — order + colors.
  // hue encodes trend (green=up, red=down); lightness encodes volatility (light=calm, dark=volatile)
  conditionOrder: ["Calm-Up", "Calm-Down", "Volatile-Up", "Volatile-Down"],

  // LIVE palette. WB.setPalette() copies one of the two sets below into this
  // object in place, so every view that reads cfg.conditionColor at repaint
  // time picks up the change without knowing a palette system exists.
  conditionColor: {
    "Calm-Up": "#8CCFA8",
    "Volatile-Up": "#25804A",
    "Calm-Down": "#E9A39D",
    "Volatile-Down": "#B33A3F",
  },

  // ---- colour palettes -----------------------------------------------------
  // "standard" is red/green, which ~8% of men cannot separate. "safe" swaps the
  // hue axis to blue (up) vs orange (down) and keeps the same lightness axis
  // for volatility, so the encoding logic is identical and only the hues move.
  // Swapping also removes a second ambiguity: in the standard palette green
  // means BOTH "Up condition" and "positive return", in two different views.
  palettes: {
    standard: {
      conditionColor: {
        "Calm-Up": "#8CCFA8",
        "Volatile-Up": "#25804A",
        "Calm-Down": "#E9A39D",
        "Volatile-Down": "#B33A3F",
      },
      // diverging ramp for the heatmap: negative -> 0 -> positive
      heatmapRamp: ["#b33a3f", "#efb4b0", "#f7f8fa", "#abd8ba", "#25804a"],
      heatmapLabel: "red → green",
      // view 1's two data lines. They must never collide with the condition
      // hues drawn directly beneath them in the ribbon.
      seriesColor: { sp: "#315f85", vix: "#d18a36" },
    },
    safe: {
      conditionColor: {
        "Calm-Up": "#9EC9E2",
        "Volatile-Up": "#1F5F8B",
        "Calm-Down": "#F0C08A",
        "Volatile-Down": "#B0590C",
      },
      heatmapRamp: ["#9c4a06", "#e8b27a", "#f7f8fa", "#90bcd9", "#15537e"],
      heatmapLabel: "orange → blue",
      // the safe palette spends blue and orange on the CONDITIONS, so the two
      // lines move to charcoal and purple — distinct in hue and in lightness
      // from both, and from each other.
      seriesColor: { sp: "#2b2b38", vix: "#7d3fa8" },
    },
  },
  paletteDefault: "standard",

  // scatterplot educational reference band (VIX p33-p67); not a classifier
  typicalBand: [15.0, 20.0],

  // Column order for the heatmap only. Volatile-Up -> Calm-Up -> Calm-Down ->
  // Volatile-Down puts the four conditions on one best-to-worst gradient, so
  // the colour ramp reads left to right.
  heatmapConditionOrder: ["Volatile-Up", "Calm-Up", "Calm-Down", "Volatile-Down"],

  // chord default correlation threshold (slider will override)
  corrThreshold: 0.6,

  // ---- animation tuning (ms at 1x; divided by WB.speed at playback) ----
  anim: {
    fast: 220,             // re-colour / fade
    normal: 600,           // layout transitions
    traceDuration: 30000,  // viz1 sweep across the full decade
    stepDuration: 1400,    // viz2 staged reveal, per stage
    chordStep: 1600,       // viz4 rolling-window step
  },

  speeds: [
    { label: "0.5x", value: 0.5 },
    { label: "1x", value: 1 },
    { label: "2x", value: 2 },
  ],
  speedDefault: 1,

  // viz1 condition ribbon roll-up (daily stripes are unreadable over 10 years)
  ribbonModes: ["day", "month", "quarter"],
  ribbonModeDefault: "month",

  // viz4 rolling window: length and step, in months
  chordWindowMonths: 12,
  chordStepMonths: 3,

  // viz3 default metric. "excess" (industry return minus the S&P's return that
  // same day) is the default because "mean" largely restates the condition
  // definitions: conditions are built from the market's direction, and almost
  // every industry follows the market, so the raw heatmap is green in both Up
  // columns and red in both Down columns by construction. Excess asks the
  // question the project actually poses — who holds up BETTER than the market.
  heatmapMetricDefault: "excess",

  // viz5 y-axis. Log by default so equal percentage moves are equal distances:
  // on a linear axis a fall from $2 to $1 looks twice as steep as $1 to $0.50
  // even though both are -50%.
  comparisonScaleDefault: "log",

  // viz1 brush: continuous feedback while dragging, throttled to stay under
  // the ~0.1s dynamic-query budget without recomputing on every mousemove.
  brushThrottleMs: 120,

  // 12-industry categorical palette (d3.schemePaired-like)
  industryPalette: [
    "#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c",
    "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#b15928", "#7f7f7f",
  ],
};