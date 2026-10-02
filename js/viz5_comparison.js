// viz5_comparison.js — cumulative growth of $1 per industry; toggle industries to compare.
WB.drawComparison = function (state) {
  const { industryDaily, meta, cfg } = state;
  const names = meta.industryNames; // code -> name
  const codes = Object.keys(names);

  // build cumulative series per code: value = product(1 + ret/100)
  const byCode = d3.group(industryDaily.filter((d) => d.ret != null), (d) => d.code);
  const series = {};
  codes.forEach((code) => {
    const rows = (byCode.get(code) || []).slice().sort((a, b) => a.date - b.date);
    let cum = 1;
    series[code] = rows.map((r) => {
      cum *= 1 + r.ret / 100;
      return { date: r.date, v: cum };
    });
  });

  const color = d3.scaleOrdinal().domain(codes).range(cfg.industryPalette);
  // default selection: defensive vs cyclical contrast
  const defaultOn = new Set(["Hlth", "Utils", "BusEq", "Enrgy"]);
  const selected = new Set(defaultOn);

  // chips
  const ctrl = d3.select("#comparison-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();
  codes.forEach((code) => {
    const chip = ctrl.append("span").attr("class", "chip").classed("on", selected.has(code))
      .on("click", function () {
        if (selected.has(code)) selected.delete(code);
        else selected.add(code);
        d3.select(this).classed("on", selected.has(code));
        render();
      });
    chip.append("span").attr("class", "dot").style("background", color(code));
    chip.append("span").text(names[code]);
  });

  const box = d3.select("#comparison");
  const W = 1060, H = 420;
  const m = { top: 16, right: 120, bottom: 30, left: 52 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  box.selectAll("*").remove();
  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const allDates = series[codes[0]].map((d) => d.date);
  const x = d3.scaleTime().domain(d3.extent(allDates)).range([0, iw]);
  const gx = g.append("g").attr("transform", `translate(0,${ih})`);
  const gy = g.append("g").attr("class", "grid");
  const y = d3.scaleLinear().range([ih, 0]);
  const line = d3.line().x((d) => x(d.date)).y((d) => y(d.v));
  const lines = g.append("g");
  const labels = g.append("g");

  g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)")
    .attr("x", -ih / 2).attr("y", -38).attr("text-anchor", "middle").text("growth of $1");
  g.append("line").attr("class", "ref-line").attr("x1", 0).attr("x2", iw); // y=1 baseline (set in render)
  const baseline = g.select("line.ref-line");

  function render() {
    const on = codes.filter((c) => selected.has(c));
    const maxV = d3.max(on, (c) => d3.max(series[c], (d) => d.v)) || 2;
    y.domain([0, maxV]).nice();
    gx.call(d3.axisBottom(x).ticks(8));
    gy.call(d3.axisLeft(y).ticks(6).tickSize(-iw));
    baseline.attr("y1", y(1)).attr("y2", y(1));

    const sel = lines.selectAll("path").data(on, (d) => d);
    sel.exit().remove();
    sel.enter().append("path").attr("fill", "none").attr("stroke-width", 1.8).merge(sel)
      .attr("stroke", (c) => color(c)).attr("d", (c) => line(series[c]));

    const lab = labels.selectAll("text").data(on, (d) => d);
    lab.exit().remove();
    lab.enter().append("text").attr("class", "net-label").merge(lab)
      .attr("x", iw + 6)
      .attr("y", (c) => y(series[c][series[c].length - 1].v)).attr("dy", "0.32em")
      .attr("fill", (c) => color(c)).text((c) => names[c]);
  }
  render();
};