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
  conditionColor: {
    "Calm-Up": "#8fd19e",
    "Volatile-Up": "#1a7a3c",
    "Calm-Down": "#f4a582",
    "Volatile-Down": "#b42318",
  },

  // scatterplot educational reference band (VIX p33-p67); not a classifier
  typicalBand: [15.0, 20.0],

  // network default correlation threshold (slider will override)
  corrThreshold: 0.6,

  // 12-industry categorical palette (d3.schemePaired-like)
  industryPalette: [
    "#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c",
    "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#b15928", "#7f7f7f",
  ],
};