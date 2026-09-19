// viz3_heatmap.js — 12 industries x 4 conditions; colour = mean or risk-adjusted return.
WB.drawHeatmap = function (state) {
  const { agg, cfg } = state;
  const conditions = agg.conditionOrder;
  const records = agg.records;
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

  function render() {
    const vals = records.map((r) => r[metric]).filter((v) => v != null);
    const lim = d3.max(vals.map(Math.abs)) || 1;
    const color = d3.scaleDiverging(d3.interpolateRdYlGn).domain([-lim, 0, lim]);

    const cells = cellG.selectAll("g.cellwrap").data(records, (d) => d.industry + d.condition);
    const enter = cells.enter().append("g").attr("class", "cellwrap");
    enter.append("rect").attr("class", "hm-cell");
    enter.append("text").attr("class", "hm-value");
    const merged = enter.merge(cells);

    merged.select("rect")
      .attr("x", (d) => x(d.condition)).attr("y", (d) => yb(d.industry))
      .attr("width", x.bandwidth()).attr("height", yb.bandwidth())
      .attr("fill", (d) => (d[metric] == null ? "#eee" : color(d[metric])))
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
  }
  const fmt = (v) => (v == null ? "–" : d3.format(".2f")(v));
  render();
};