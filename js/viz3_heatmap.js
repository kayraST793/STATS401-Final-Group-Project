// viz3_heatmap.js — 12 industries x 4 conditions; colour = mean or risk-adjusted return.
WB.drawHeatmap = function (state) {
  const { agg, cfg } = state;
  const conditions = agg.conditionOrder;
  let records = agg.records;
  const industries = [...new Set(records.map((r) => r.industry))];

  let metric = "mean"; // "mean" | "sharpe"

  // controls
  const ctrl = d3.select("#heatmap-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();
  ctrl.append("span").text("Colour by:");
  ["mean", "sharpe"].forEach((mt) => {
    ctrl.append("button").text(mt === "mean" ? "Avg return" : "Risk-adjusted (mean/σ)")
      .classed("active", mt === metric)
      .on("click", function () {
        metric = mt;
        ctrl.selectAll("button").classed("active", false);
        d3.select(this).classed("active", true);
        render();
      });
  });

  const box = d3.select("#heatmap");
  const W = 640, H = 430;
  const m = { top: 40, right: 20, bottom: 20, left: 150 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  box.selectAll("*").remove();
  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const x = d3.scaleBand().domain(conditions).range([0, iw]).padding(0.06);
  const yb = d3.scaleBand().domain(industries).range([0, ih]).padding(0.06);

  // column headers
  g.selectAll(".colh").data(conditions).join("text").attr("class", "hm-label")
    .attr("x", (d) => x(d) + x.bandwidth() / 2).attr("y", -14).attr("text-anchor", "middle")
    .text((d) => d);
  // row labels
  g.selectAll(".rowh").data(industries).join("text").attr("class", "hm-label")
    .attr("x", -8).attr("y", (d) => yb(d) + yb.bandwidth() / 2).attr("dy", "0.32em")
    .attr("text-anchor", "end").text((d) => d);

  const cellG = g.append("g");


// ============================================================
// RECALCULATE HEATMAP FOR SELECTED DATE RANGE
// ============================================================

function recompute() {
    const range = state.filters.dateRange;

    if (!range) {
        records = agg.records;
        return;
    }

    const filtered = state.industryDaily.filter(d =>
        d.ret != null &&
        Number.isFinite(d.ret) &&
        d.date >= range[0] &&
        d.date <= range[1]
    );

    const grouped = d3.group(
        filtered,
        d => `${WB.normalizeIndustry(d.code)}|${d.condition}`
    );

    records = agg.records.map(original => {
        const code = WB.normalizeIndustry(original.industry);

        const rows = grouped.get(
            `${code}|${original.condition}`
        ) || [];

        const values = rows.map(d => d.ret);

        const mean = values.length
            ? d3.mean(values)
            : null;

        const std = values.length > 1
            ? d3.deviation(values)
            : null;

        return {
            ...original,
            mean,
            std,
            sharpe: std > 0 ? mean / std : null,
            n: values.length
        };
    });
}

// ============================================================
// LINKED INDUSTRY + CONDITION HIGHLIGHTING
// ============================================================

function updateHighlights() {
    const { condition, industries } = state.filters;

    cellG.selectAll(".cellwrap")
        .attr("opacity", d => {
            const conditionOK =
                condition === "All" ||
                d.condition === condition;

            const industryOK =
                industries.size === 0 ||
                industries.has(
                    WB.normalizeIndustry(d.industry)
                );

            return conditionOK && industryOK ? 1 : 0.15;
        });
}


  function render() {
    const vals = records.map((r) => r[metric]).filter((v) => v != null);
    const lim = d3.max(vals.map(Math.abs)) || 1;
    const color = d3
        .scaleDiverging()
        .domain([-lim, 0, lim])
        .interpolator(
            d3.interpolateRgbBasis([
                "#b33a3f",
                "#efb4b0",
                "#f7f8fa",
                "#abd8ba",
                "#25804a"
            ])
        );

    const cells = cellG.selectAll("g.cellwrap").data(records, (d) => d.industry + d.condition);
    const enter = cells.enter().append("g").attr("class", "cellwrap");
    enter.append("rect").attr("class", "hm-cell");
    enter.append("text").attr("class", "hm-value");
    const merged = enter.merge(cells);

    merged.select("rect")
      .attr("x", (d) => x(d.condition)).attr("y", (d) => yb(d.industry))
      .attr("width", x.bandwidth()).attr("height", yb.bandwidth())
      .attr("fill", (d) => (d[metric] == null ? "#eee" : color(d[metric])))
        .style("cursor", "pointer")
        .on("click", function (event, d) {
          WB.setCondition(d.condition);
          WB.toggleIndustry(d.industry);
        })

      .on("mouseover", (event, d) => WB.showTip(
        `<b>${d.industry}</b><br>${d.condition}<br>avg ${fmt(d.mean)}% · σ ${fmt(d.std)}<br>` +
          `risk-adj ${fmt(d.sharpe)} · n=${d.n}`, event))
      .on("mousemove", (event) => WB.tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip);

    merged.select("text")
      .attr("x", (d) => x(d.condition) + x.bandwidth() / 2)
      .attr("y", (d) => yb(d.industry) + yb.bandwidth() / 2).attr("dy", "0.32em")
      .attr("text-anchor", "middle")
      .attr("fill", (d) => (Math.abs(d[metric] ?? 0) > lim * 0.6 ? "#fff" : "#222"))
      .text((d) => (d[metric] == null ? "" : fmt(d[metric])));

    updateHighlights();
  }
  const fmt = (v) => (v == null ? "–" : d3.format(".2f")(v));

  WB.events.on(
      "conditionchange.heatmap",
      updateHighlights
  );

  WB.events.on(
      "industrychange.heatmap",
      updateHighlights
  );

  WB.events.on("daterangechange.heatmap", function () {
      recompute();
      render();
  });

  WB.events.on("reset.heatmap", function () {
      recompute();
      render();
  });

  render();
};