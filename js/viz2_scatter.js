// viz2_scatter.js — daily S&P return (x) vs VIX (y), coloured by condition.
WB.drawScatter = function (state) {
  const { panel, cfg, meta } = state;
  const box = d3.select("#scatter");
  box.selectAll("*").remove();

  const W = 720, H = 460;
  const m = { top: 16, right: 16, bottom: 44, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const xExtent = d3.max(panel, (d) => Math.abs(d.sp_return));
  const x = d3.scaleLinear().domain([-xExtent, xExtent]).nice().range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(panel, (d) => d.vix)]).nice().range([ih, 0]);

  // typical VIX band (educational, not a classifier)
  g.append("rect").attr("class", "typical-band")
    .attr("x", 0).attr("width", iw)
    .attr("y", y(cfg.typicalBand[1])).attr("height", y(cfg.typicalBand[0]) - y(cfg.typicalBand[1]));
  g.append("text").attr("class", "axis-title").attr("x", 6).attr("y", y(cfg.typicalBand[1]) - 4)
    .text("typical VIX range (15–20)");

  // axes + gridlines
  g.append("g").attr("class", "grid").attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-ih));
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(7).tickSize(-iw));
  g.append("text").attr("class", "axis-title").attr("x", iw / 2).attr("y", ih + 36).attr("text-anchor", "middle")
    .text("S&P 500 daily return (%)");
  g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)")
    .attr("x", -ih / 2).attr("y", -38).attr("text-anchor", "middle").text("VIX");

  // classifier guides: median (Calm/Volatile) + return = 0
  g.append("line").attr("class", "ref-line").attr("x1", 0).attr("x2", iw)
    .attr("y1", y(meta.vixCut)).attr("y2", y(meta.vixCut));
  g.append("text").attr("class", "axis-title").attr("x", iw - 4).attr("y", y(meta.vixCut) - 4)
    .attr("text-anchor", "end").text(`VIX median ${meta.vixCut}`);
  g.append("line").attr("class", "ref-line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ih);

  // points
  g.selectAll("circle").data(panel).join("circle")
    .attr("cx", (d) => x(d.sp_return)).attr("cy", (d) => y(d.vix)).attr("r", 2.2)
    .attr("fill", (d) => cfg.conditionColor[d.condition]).attr("opacity", 0.55)
    .on("mouseover", (event, d) => WB.showTip(
      `<b>${d3.timeFormat("%Y-%m-%d")(d.date)}</b><br>ret ${d.sp_return.toFixed(2)}% · VIX ${d.vix.toFixed(1)}<br>${d.condition}`,
      event))
    .on("mousemove", (event) => WB.tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px"))
    .on("mouseleave", WB.hideTip);
};