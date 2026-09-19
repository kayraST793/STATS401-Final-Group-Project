// main.js — loads all data, wires shared state, renders legend/meta, dispatches views.
(function () {
  const cfg = WB.config;

  function showError(msg) {
    const el = document.getElementById("error");
    el.style.display = "block";
    el.innerHTML = msg;
  }

  const num = (v) => (v === "" || v == null ? null : +v);

  Promise.all([
    d3.json(cfg.files.meta),
    d3.csv(cfg.files.panel, (d) => ({
      date: new Date(d.date),
      sp500: +d.sp500,
      sp_return: +d.sp_return,
      vix: +d.vix,
      trend: +d.trend,
      condition: d.condition,
    })),
    d3.json(cfg.files.agg),
    d3.json(cfg.files.corr),
    d3.csv(cfg.files.industryDaily, (d) => ({
      date: new Date(d.date),
      condition: d.condition,
      code: d.industry, // long-file 'industry' column holds the code
      ret: num(d.ret),
    })),
  ])
    .then(([meta, panel, agg, corr, industryDaily]) => {
      const state = { cfg, meta, panel, agg, corr, industryDaily };
      WB.state = state;

      renderConditionLegend(state);
      renderMeta(state);

      // dispatch each view, guarding so one failure doesn't kill the rest
      const views = [
        ["drawTimeline", "#timeline"],
        ["drawScatter", "#scatter"],
        ["drawHeatmap", "#heatmap"],
        ["drawNetwork", "#network"],
        ["drawComparison", "#comparison"],
      ];
      views.forEach(([fn, sel]) => {
        try {
          WB[fn] && WB[fn](state);
        } catch (e) {
          console.error(fn, e);
          d3.select(sel).append("p").attr("class", "caveat").text(`(${fn} error: ${e.message})`);
        }
      });
    })
    .catch((err) => {
      console.error(err);
      showError(
        "Could not load data files. Serve this folder over HTTP " +
          "(e.g. <code>python -m http.server</code>) — browsers block <code>file://</code> fetches.<br>" +
          `<small>${err.message}</small>`
      );
    });

  function renderConditionLegend(state) {
    const box = d3.select("#condition-legend");
    state.cfg.conditionOrder.forEach((c) => {
      const item = box.append("div").attr("class", "item");
      item.append("span").attr("class", "swatch").style("background", state.cfg.conditionColor[c]);
      item.append("span").text(c.replace("-", " · "));
    });
  }

  function renderMeta(state) {
    const m = state.meta;
    const dl = d3.select("#meta-panel").append("dl");
    const row = (k, v) => {
      dl.append("dt").text(k);
      dl.append("dd").html(v);
    };
    row("Window (panel)", `${m.panelStart} → ${m.panelEnd}`);
    row("Trading days", m.panelRows.toLocaleString());
    row("VIX cut (median)", m.vixCut);
    row("Return units", m.config.units + " (" + m.config.return_mode + ")");
    row(
      "Condition counts",
      state.cfg.conditionOrder.map((c) => `${c}: <b>${m.conditionCounts[c]}</b>`).join(" &nbsp; ")
    );
    row(
      "Sources",
      "S&P 500 (FRED), VIX (FRED), 12 Industry Portfolios — value-weighted " +
        "(Kenneth R. French Data Library)"
    );
  }

  // small shared helpers on WB for the viz files
  WB.tooltip = d3.select("#tooltip");
  WB.showTip = function (html, event) {
    WB.tooltip.style("opacity", 1).html(html)
      .style("left", event.pageX + 14 + "px")
      .style("top", event.pageY - 10 + "px");
  };
  WB.hideTip = function () {
    WB.tooltip.style("opacity", 0);
  };
})();