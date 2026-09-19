// viz1_timeline.js — S&P 500 + VIX over time with a per-day condition ribbon.
WB.drawTimeline = function (state) {
  const { panel, cfg } = state;
  const box = d3.select("#timeline");
  box.selectAll("*").remove();

  const W = 1060, H = 380, ribbonH = 16;
  const m = { top: 16, right: 54, bottom: 30, left: 56 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom - ribbonH - 8;

  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const x = d3.scaleTime().domain(d3.extent(panel, (d) => d.date)).range([0, iw]);
  const ySp = d3.scaleLinear().domain(d3.extent(panel, (d) => d.sp500)).nice().range([ih, 0]);
  const yVix = d3.scaleLinear().domain([0, d3.max(panel, (d) => d.vix)]).nice().range([ih, 0]);

  // axes
  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(8));
  g.append("g").call(d3.axisLeft(ySp).ticks(6));
  g.append("g").attr("transform", `translate(${iw},0)`).call(d3.axisRight(yVix).ticks(6));
  g.append("text").attr("class", "axis-title").attr("x", -40).attr("y", -4).text("S&P 500");
  g.append("text").attr("class", "axis-title").attr("x", iw + 8).attr("y", -4).text("VIX");

  // S&P line
  g.append("path").datum(panel).attr("fill", "none").attr("stroke", "#1f3864").attr("stroke-width", 1.4)
    .attr("d", d3.line().x((d) => x(d.date)).y((d) => ySp(d.sp500)));
  // VIX line
  g.append("path").datum(panel).attr("fill", "none").attr("stroke", "#c77d18")
    .attr("stroke-width", 1).attr("opacity", 0.75)
    .attr("d", d3.line().x((d) => x(d.date)).y((d) => yVix(d.vix)));

  // condition ribbon (compress contiguous same-condition runs into segments)
  const ry = ih + 24;
  const segs = [];
  for (let i = 0; i < panel.length; i++) {
    const c = panel[i].condition;
    if (!segs.length || segs[segs.length - 1].c !== c) {
      segs.push({ c, start: panel[i].date, end: panel[i].date });
    } else {
      segs[segs.length - 1].end = panel[i].date;
    }
  }
  g.selectAll(".ribbon").data(segs).join("rect")
    .attr("x", (d) => x(d.start))
    .attr("y", ry)
    .attr("width", (d) => Math.max(1, x(d.end) - x(d.start) + 1))
    .attr("height", ribbonH)
    .attr("fill", (d) => cfg.conditionColor[d.c]);
  g.append("text").attr("class", "axis-title").attr("x", -40).attr("y", ry + 12).text("cond.");

  // hover guideline
  const focus = g.append("line").attr("class", "ref-line").attr("y1", 0).attr("y2", ih).style("opacity", 0);
  svg.append("rect").attr("transform", `translate(${m.left},${m.top})`)
    .attr("width", iw).attr("height", ih).attr("fill", "transparent")
    .on("mousemove", function (event) {
      const mx = d3.pointer(event, this)[0];
      const dt = x.invert(mx);
      const i = d3.bisector((d) => d.date).left(panel, dt);
      const d = panel[Math.min(i, panel.length - 1)];
      if (!d) return;
      focus.attr("x1", x(d.date)).attr("x2", x(d.date)).style("opacity", 1);
      WB.showTip(
        `<b>${d3.timeFormat("%Y-%m-%d")(d.date)}</b><br>S&P ${d.sp500.toFixed(0)} · ` +
          `ret ${d.sp_return.toFixed(2)}%<br>VIX ${d.vix.toFixed(1)} · ${d.condition}`,
        event
      );
    })
    .on("mouseleave", () => { focus.style("opacity", 0); WB.hideTip(); });
};