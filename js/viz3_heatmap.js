// viz3_heatmap.js — 12 industries x 4 conditions; colour = mean or risk-adjusted.
//
// INTERACTIONS
//   metric toggle   vs. market (default) <-> average return <-> risk-adjusted
//   sort            re-order rows by the selected condition (rearrange view)
//   click row       select/deselect an industry across the dashboard
//   click column    select/deselect a condition across the dashboard
//   animation       cells re-colour and rows glide when the brush moves
//   palette         red/green or colour-vision-safe orange/blue
WB.drawHeatmap = function (state) {
  const { agg, cfg } = state;

  // Columns run Volatile-Up -> Calm-Up -> Calm-Down -> Volatile-Down so the
  // row reads as one best-to-worst gradient rather than two unrelated pairs.
  const conditions = cfg.heatmapConditionOrder || agg.conditionOrder;

  let records = [];
  let metric = cfg.heatmapMetricDefault || "mean";   // "excess" | "mean" | "sharpe"
  let sortBySel = true;   // order rows by the selected condition

  // ----------------------------------------------------------------- controls
  const ctrl = d3.select("#heatmap-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();

  ctrl.append("span").text("Colour by:");
  const metricDefs = {
    excess: ["vs. market",
      "Industry return minus the S&amp;P 500's return that same day. Green means <b>beat the market</b>, red means lagged it.<br><br>" +
      "This is the default because the four conditions are defined by the market's own direction, so raw average return mostly repeats the definition. " +
      "This metric asks the real question: who holds up <i>better than the market</i> when it falls?"],
    mean: ["Avg return",
      "Average daily % move. Bigger = stronger typical day.<br><br>" +
      "<i>Careful reading this one: the Up columns are green and the Down columns red for nearly every industry because that is how the conditions were defined, not a finding.</i>"],
    sharpe: ["Risk-adjusted (mean/σ)",
      "Average move divided by its volatility. Rewards industries that deliver returns steadily rather than in wild swings."],
  };
  ["excess", "mean", "sharpe"].forEach((mt) => {
    ctrl.append("button").attr("data-metric", mt).html(metricDefs[mt][0])
      .classed("active", mt === metric)
      .on("mouseover", (ev) => WB.showTip(`<b>${metricDefs[mt][0]}</b><br>${metricDefs[mt][1]}`, ev))
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .on("click", function () {
        metric = mt;
        ctrl.selectAll("button[data-metric]").classed("active", false);
        d3.select(this).classed("active", true);
        render();
      });
  });

  // The sort target is whichever condition is currently selected, so the label
  // has to say which column the ranking is actually coming from — otherwise
  // the rows move for no visible reason.
  const sortBtn = ctrl.append("button").style("margin-left", "10px")
    .classed("active", sortBySel)
    .on("mouseover", (ev) => WB.showTip(
      "Re-orders the twelve rows best-to-worst by one column, keeping the same " +
      "encoding. Turning it off restores the original industry order.", ev))
    .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
    .on("mouseleave", WB.hideTip)
    .on("click", function () {
      sortBySel = !sortBySel;
      d3.select(this).classed("active", sortBySel);
      render();
    });

  // With several conditions picked, rank by the first of them in canonical
  // order; with none, fall back to Volatile-Down, the column where the
  // industries differ most.
  function sortColumn() {
    const picks = WB.activeConditions().filter((c) => state.filters.conditions.has(c));
    return picks.length ? picks[0] : "Volatile-Down";
  }
  function setSortLabel() {
    sortBtn.text(sortBySel ? `↓ Sorted by ${sortColumn()}` : "↓ Sort rows by a condition");
  }

  // ------------------------------------------------------------------- layout
  const box = d3.select("#heatmap");
  const W = 700, H = 450;
  const m = { top: 46, right: 22, bottom: 24, left: 152 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  box.selectAll("*").remove();

  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const x = d3.scaleBand().domain(conditions).range([0, iw]).padding(0.06);
  const yb = d3.scaleBand().range([0, ih]).padding(0.06);

  // column headers double as condition selectors
  const colH = g.selectAll(".colh").data(conditions).join("g").attr("class", "colh")
    .style("cursor", "pointer")
    .on("click", (ev, d) => WB.toggleCondition(d));
  colH.append("rect").attr("class", "colh-bg")
    .attr("x", (d) => x(d)).attr("y", -34)
    .attr("width", x.bandwidth()).attr("height", 24).attr("rx", 4)
    .attr("fill", "transparent");
  colH.append("text").attr("class", "hm-label")
    .attr("x", (d) => x(d) + x.bandwidth() / 2).attr("y", -17)
    .attr("text-anchor", "middle").text((d) => d);

  const rowG = g.append("g");
  const cellG = g.append("g");
  const fmt = (v) => (v == null ? "–" : d3.format(".2f")(v));
  // excess is a difference, so it reads much better with an explicit sign
  const fmtMetric = (v) => (v == null ? "–"
    : d3.format(metric === "excess" ? "+.2f" : ".2f")(v));

  // ============================================================
  // RECALCULATE FOR THE SELECTED DATE RANGE
  // ============================================================

  // Always recomputed from the daily rows, even with no brush, because the
  // pre-aggregated file has no "excess" column. Checked against
  // industry_by_condition.json over the full window: the means agree to 2e-16,
  // so nothing changed except that a third metric is now available.
  function recompute() {
    const range = state.filters.dateRange;

    const filtered = state.industryDaily.filter((d) =>
      d.ret != null && Number.isFinite(d.ret) &&
      (!range || (d.date >= range[0] && d.date <= range[1]))
    );

    const grouped = d3.group(filtered, (d) => `${WB.normalizeIndustry(d.code)}|${d.condition}`);

    records = agg.records.map((original) => {
      const code = WB.normalizeIndustry(original.industry);
      const rows = grouped.get(`${code}|${original.condition}`) || [];
      const values = rows.map((d) => d.ret);
      const exVals = rows.map((d) => d.excess).filter((v) => v != null && Number.isFinite(v));
      const mean = values.length ? d3.mean(values) : null;
      const std = values.length > 1 ? d3.deviation(values) : null;
      return {
        ...original,
        mean,
        std,
        sharpe: std > 0 ? mean / std : null,
        excess: exVals.length ? d3.mean(exVals) : null,
        n: values.length,
      };
    });
  }

  // ============================================================
  // LINKED INDUSTRY + CONDITION HIGHLIGHTING
  // ============================================================

  function updateHighlights() {
    const { industries } = state.filters;
    const hasInd = industries.size > 0;

    const dimmed = (d) => {
      const condOK = WB.matchesCondition(d.condition);
      const indOK = !hasInd || industries.has(WB.normalizeIndustry(d.industry));
      return !(condOK && indOK);
    };
    const picked = (d) => hasInd && industries.has(WB.normalizeIndustry(d.industry));

    cellG.selectAll("g.cellwrap").select("rect")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (dimmed(d) ? 0.22 : 1))
      .attr("stroke", (d) => (picked(d) ? "#152033" : "#fff"))
      .attr("stroke-width", (d) => (picked(d) ? 2.5 : 1.5));

    cellG.selectAll("g.cellwrap").select("text")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (dimmed(d) ? 0.25 : 1));

    rowG.selectAll("g.rowlab").select("rect")
      .attr("fill", (d) => (industries.has(WB.normalizeIndustry(d)) ? "#e8f0f6" : "transparent"));
    rowG.selectAll("g.rowlab").select("text")
      .attr("font-weight", (d) => (industries.has(WB.normalizeIndustry(d)) ? 700 : 400));

    colH.select("rect").attr("fill", (d) => (WB.conditionPicked(d) ? "#315f85" : "transparent"));
    colH.select("text")
      .attr("fill", (d) => (WB.conditionPicked(d) ? "#fff" : "var(--ink)"))
      .attr("font-weight", (d) => (WB.conditionPicked(d) ? 700 : 400));
  }

  // ------------------------------------------------------------------- render
  function render() {
    setSortLabel();

    const byInd = d3.group(records, (r) => r.industry);
    let industries = [...byInd.keys()];

    const sortCond = sortBySel ? sortColumn() : null;
    if (sortCond) {
      industries.sort((a, b) => {
        const va = byInd.get(a).find((r) => r.condition === sortCond)?.[metric];
        const vb = byInd.get(b).find((r) => r.condition === sortCond)?.[metric];
        return (vb ?? -Infinity) - (va ?? -Infinity);
      });
    }
    yb.domain(industries);

    const vals = records.map((r) => r[metric]).filter((v) => v != null);
    const lim = d3.max(vals.map(Math.abs)) || 1;
    const color = d3.scaleDiverging()
      .domain([-lim, 0, lim])
      .interpolator(WB.heatmapInterpolator());

    // ---- row labels (clickable)
    const rows = rowG.selectAll("g.rowlab").data(industries, (d) => d);
    const rEnter = rows.enter().append("g").attr("class", "rowlab").style("cursor", "pointer")
      .on("click", (ev, d) => WB.toggleIndustry(d))
      .on("mouseover", (ev, d) => WB.showTip(`<b>${d}</b><br>click to pin this industry`, ev))
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip);
    rEnter.append("rect").attr("x", -m.left + 6).attr("width", m.left - 12).attr("rx", 4);
    rEnter.append("text").attr("class", "hm-label").attr("x", -10).attr("dy", "0.32em")
      .attr("text-anchor", "end");
    rows.exit().remove();

    const rAll = rEnter.merge(rows);
    rAll.select("rect").attr("height", yb.bandwidth())
      .transition("layout").duration(cfg.anim.normal).attr("y", (d) => yb(d));
    // Full names when expanded; industry codes when collapsed, where
    // "Consumer NonDurables" overruns the label gutter at mini type size.
    rAll.select("text").text((d) => (WB.isMini("viz3") ? WB.normalizeIndustry(d) : d))
      .transition("layout").duration(cfg.anim.normal)
      .attr("y", (d) => yb(d) + yb.bandwidth() / 2);

    // ---- cells
    const cells = cellG.selectAll("g.cellwrap").data(records, (d) => d.industry + d.condition);
    const enter = cells.enter().append("g").attr("class", "cellwrap");
    enter.append("rect").attr("class", "hm-cell")
      .attr("x", (d) => x(d.condition)).attr("width", x.bandwidth());
    enter.append("text").attr("class", "hm-value")
      .attr("x", (d) => x(d.condition) + x.bandwidth() / 2)
      .attr("dy", "0.32em").attr("text-anchor", "middle");
    cells.exit().remove();
    const merged = enter.merge(cells);

    merged.select("rect")
      .style("cursor", "pointer")
      .on("click", function (event, d) {
        WB.toggleCondition(d.condition);
        WB.toggleIndustry(d.industry);
      })
      .on("mouseover", (event, d) => WB.showTip(
        `<b>${d.industry}</b><br>${d.condition}<br>avg ${fmt(d.mean)}% · σ ${fmt(d.std)}<br>` +
        `vs. market ${d3.format("+.2f")(d.excess ?? 0)}% ` +
        `(${d.excess > 0 ? "beat it" : d.excess < 0 ? "lagged it" : "matched it"})<br>` +
        `risk-adj ${fmt(d.sharpe)} · n=${d.n} days`, event))
      .on("mousemove", (event) => WB.tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .transition("layout").duration(cfg.anim.normal)
      .attr("y", (d) => yb(d.industry))
      .attr("height", yb.bandwidth())
      .attr("fill", (d) => (d[metric] == null ? "#eee" : color(d[metric])));

    merged.select("text")
      .transition("layout").duration(cfg.anim.normal)
      .attr("y", (d) => yb(d.industry) + yb.bandwidth() / 2)
      .attr("fill", (d) => (Math.abs(d[metric] ?? 0) > lim * 0.6 ? "#fff" : "#222"))
      .text((d) => (d[metric] == null ? "" : fmtMetric(d[metric])));

    updateHighlights();
  }

  WB.events.on("conditionchange.heatmap", render);   // re-sorts as well as highlights
  WB.events.on("industrychange.heatmap", updateHighlights);
  WB.events.on("daterangechange.heatmap", function () { recompute(); render(); });
  WB.events.on("reset.heatmap", function () {
    metric = cfg.heatmapMetricDefault || "mean";
    ctrl.selectAll("button[data-metric]").classed("active", function () {
      return this.dataset.metric === metric;
    });
    recompute(); render();
  });
  WB.events.on("palettechange.heatmap", render);
  WB.events.on("layoutchange.heatmap", render);   // labels differ when collapsed

  recompute();
  render();
};
