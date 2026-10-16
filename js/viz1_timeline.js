// viz1_timeline.js — S&P 500 + VIX over time with a market-condition ribbon.
//
// INTERACTIONS
//   brush (x)        drag a date range -> filters every other view
//   play/pause       pausable sweep that traces the decade left to right
//   ribbon roll-up   day / month / quarter (changing a parameter)
//   hover            crosshair + details on demand
//   linked           ribbon dims to the selected condition; a marker shows the
//                    day picked in the scatter
WB.drawTimeline = function (state) {
  const { panel, cfg, meta } = state;
  const box = d3.select("#timeline");
  box.selectAll("*").remove();

  let ribbonMode = cfg.ribbonModeDefault;

  // ----------------------------------------------------------------- controls
  const ctrl = d3.select("#timeline-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();

  const playBtn = ctrl.append("button").attr("id", "tl-play").text("▶ Play");
  const pauseBtn = ctrl.append("button").attr("id", "tl-pause").text("⏸ Pause").attr("disabled", true);
  const restartBtn = ctrl.append("button").attr("id", "tl-restart").text("↻ Restart").attr("disabled", true);

  ctrl.append("span").style("margin-left", "10px").text("Ribbon:");
  cfg.ribbonModes.forEach((mode) => {
    ctrl.append("button")
      .attr("data-ribbon", mode)
      .text(mode === "day" ? "Daily" : mode === "month" ? "Monthly" : "Quarterly")
      .classed("active", mode === ribbonMode)
      .on("click", function () {
        ribbonMode = mode;
        ctrl.selectAll("button[data-ribbon]").classed("active", false);
        d3.select(this).classed("active", true);
        drawRibbon();
      });
  });

  ctrl.append("span").style("margin-left", "10px").style("font-style", "italic")
    .text("Drag across the chart to filter every view.");

  // ------------------------------------------------------------------- layout
  const W = 1060, H = 380, ribbonH = 16;
  const m = { top: 16, right: 54, bottom: 30, left: 56 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom - ribbonH - 8;

  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);

  // clip used by the play sweep
  svg.append("defs").append("clipPath").attr("id", "tl-reveal")
    .append("rect").attr("x", 0).attr("y", -4).attr("width", iw).attr("height", ih + 8);

  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const x = d3.scaleTime().domain(d3.extent(panel, (d) => d.date)).range([0, iw]);
  const ySp = d3.scaleLinear().domain(d3.extent(panel, (d) => d.sp500)).nice().range([ih, 0]);
  const yVix = d3.scaleLinear().domain([0, d3.max(panel, (d) => d.vix)]).nice().range([ih, 0]);

  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(8));
  g.append("g").call(d3.axisLeft(ySp).ticks(6));
  g.append("g").attr("transform", `translate(${iw},0)`).call(d3.axisRight(yVix).ticks(6));
  g.append("text").attr("class", "axis-title tl-axis-sp").attr("x", -40).attr("y", -4).text("S&P 500");
  g.append("text").attr("class", "axis-title tl-axis-vix").attr("x", iw + 8).attr("y", -4).text("VIX");

  const lines = g.append("g").attr("clip-path", "url(#tl-reveal)");

  const spPath = lines.append("path").datum(panel).attr("fill", "none")
    .attr("stroke-width", 1.8)
    .attr("d", d3.line().x((d) => x(d.date)).y((d) => ySp(d.sp500)));

  const vixPath = lines.append("path").datum(panel).attr("fill", "none")
    .attr("stroke-width", 1.25).attr("opacity", 0.85)
    .attr("d", d3.line().x((d) => x(d.date)).y((d) => yVix(d.vix)));

  // marker riding the S&P line during playback
  const playDot = g.append("circle").attr("r", 4).style("opacity", 0);

  // --------------------------------------------------------------- legend
  // Two unlabelled lines on twin axes are guesswork, so they get a legend.
  // It also has to repaint on a palette switch: in the colour-safe palette
  // blue and orange are spent on the CONDITIONS in the ribbon below, so the
  // lines move to charcoal and purple to stay distinguishable from them.
  const legend = g.append("g").attr("class", "tl-legend")
    .attr("transform", `translate(${iw - 186},6)`);

  legend.append("rect")
    .attr("x", -8).attr("y", -12).attr("width", 194).attr("height", 24).attr("rx", 5)
    .attr("fill", "#fff").attr("fill-opacity", 0.82)
    .attr("stroke", "var(--line, #e2e8f0)");

  const legSp = legend.append("g");
  legSp.append("line").attr("x1", 0).attr("x2", 18).attr("y1", 0).attr("y2", 0)
    .attr("stroke-width", 2.4).attr("class", "leg-sp");
  legSp.append("text").attr("x", 23).attr("dy", "0.32em")
    .attr("class", "tl-legend-label").text("S&P 500 (left)");

  const legVix = legend.append("g").attr("transform", "translate(108,0)");
  legVix.append("line").attr("x1", 0).attr("x2", 18).attr("y1", 0).attr("y2", 0)
    .attr("stroke-width", 2.4).attr("class", "leg-vix");
  legVix.append("text").attr("x", 23).attr("dy", "0.32em")
    .attr("class", "tl-legend-label").text("VIX (right)");

  function paintSeries() {
    const c = WB.seriesColor();
    spPath.attr("stroke", c.sp);
    vixPath.attr("stroke", c.vix);
    playDot.attr("fill", c.sp);
    legend.select(".leg-sp").attr("stroke", c.sp);
    legend.select(".leg-vix").attr("stroke", c.vix);
    svg.selectAll(".tl-axis-sp").attr("fill", c.sp);
    svg.selectAll(".tl-axis-vix").attr("fill", c.vix);
  }
  const playLabel = g.append("text").attr("class", "tl-playlabel").style("opacity", 0);

  // --------------------------------------------------------------- the ribbon
  const ry = ih + 24;
  const ribbonG = g.append("g");
  g.append("text").attr("class", "axis-title").attr("x", -40).attr("y", ry + 12).text("cond.");

  // Rolling the daily classification up to months or quarters turns the ribbon
  // from static into readable regimes: a bucket is Volatile when its mean VIX
  // sits above the same median cut, and Down when the index fell across it.
  function bucketed(mode) {
    if (mode === "day") {
      const segs = [];
      panel.forEach((p) => {
        const last = segs[segs.length - 1];
        if (!last || last.c !== p.condition) segs.push({ c: p.condition, start: p.date, end: p.date });
        else last.end = p.date;
      });
      return segs;
    }
    const key = mode === "month" ? d3.timeMonth : d3.timeMonth.every(3);
    return d3.groups(panel, (p) => key.floor(p.date)).map(([start, rows]) => {
      const meanVix = d3.mean(rows, (r) => r.vix);
      const ret = rows[rows.length - 1].sp500 / rows[0].sp500 - 1;
      const c = `${meanVix <= meta.vixCut ? "Calm" : "Volatile"}-${ret >= 0 ? "Up" : "Down"}`;
      return { c, start, end: rows[rows.length - 1].date, meanVix, ret };
    });
  }

  function drawRibbon() {
    const segs = bucketed(ribbonMode);
    const sel = ribbonG.selectAll("rect").data(segs, (d) => +d.start);
    sel.exit().remove();
    sel.enter().append("rect")
      .attr("y", ry).attr("height", ribbonH)
      .style("cursor", "pointer")
      .on("mouseover", function (ev, d) {
        const f = d3.timeFormat("%b %Y");
        WB.showTip(
          `<b>${f(d.start)}</b>${ribbonMode === "day" ? "" : ` – ${f(d.end)}`}<br>${d.c}` +
          (d.meanVix ? `<br>mean VIX ${d.meanVix.toFixed(1)} · move ${(d.ret * 100).toFixed(1)}%` : ""),
          ev);
      })
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .on("click", (ev, d) => WB.toggleCondition(d.c))
      .merge(sel)
      .transition("shape").duration(cfg.anim.fast)
      .attr("x", (d) => x(d.start))
      .attr("width", (d) => Math.max(1, x(d.end) - x(d.start) + (ribbonMode === "day" ? 1 : 0)))
      .attr("fill", (d) => cfg.conditionColor[d.c]);
    updateRibbon();
  }

  function updateRibbon() {
    ribbonG.selectAll("rect")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (WB.matchesCondition(d.c) ? 1 : 0.18));
  }

  drawRibbon();

  paintSeries();

  WB.events.on("conditionchange.timeline-ribbon", updateRibbon);
  WB.events.on("reset.timeline-ribbon", updateRibbon);
  WB.events.on("palettechange.timeline-ribbon", function () {
    drawRibbon();
    paintSeries();
  });

  // hover guideline
  const focus = g.append("line").attr("class", "ref-line")
    .attr("y1", 0).attr("y2", ih)
    .style("pointer-events", "none").style("opacity", 0);

  // ============================================================
  // BRUSH: SELECT A DATE RANGE
  // ============================================================

  // Dynamic queries want continuous feedback — under ~0.1s — so the range is
  // published DURING the drag as well as at the end. It is throttled to
  // cfg.brushThrottleMs because the listeners downstream are not free: the
  // heatmap regroups 29,508 daily rows and the chord recomputes a 12x12
  // correlation matrix. At ~120ms that lands well inside the budget while
  // cutting the recomputes from one per mousemove to roughly eight a second.
  let lastBrushEmit = 0;

  function emitRange(selection) {
    if (!selection) { WB.setDateRange(null); return; }
    WB.setDateRange([x.invert(selection[0]), x.invert(selection[1])]);
  }

  const brush = d3.brushX()
    .extent([[0, 0], [iw, ih]])
    .on("brush", function (event) {
      if (!event.sourceEvent || !event.selection) return;
      const now = performance.now();
      if (now - lastBrushEmit < cfg.brushThrottleMs) return;
      lastBrushEmit = now;
      emitRange(event.selection);
    })
    .on("end", function (event) {
      if (!event.sourceEvent) return;          // ignore programmatic moves
      lastBrushEmit = 0;                       // always publish the final range
      emitRange(event.selection);
    });

  const brushG = g.append("g").attr("class", "timeline-brush").call(brush);
  brushG.raise();

  brushG
    .on("mousemove.tooltip", function (event) {
      const mx = d3.pointer(event, this)[0];
      if (mx < 0 || mx > iw) return;
      const dt = x.invert(mx);
      const i = d3.bisector((d) => d.date).left(panel, dt);
      const d = panel[Math.min(i, panel.length - 1)];
      if (!d) return;
      focus.attr("x1", x(d.date)).attr("x2", x(d.date)).style("opacity", 1);
      WB.showTip(
        `<b>${d3.timeFormat("%Y-%m-%d")(d.date)}</b><br>` +
        `S&P ${d.sp500.toFixed(0)} · ret ${d.sp_return.toFixed(2)}%<br>` +
        `VIX ${d.vix.toFixed(1)} · ${d.condition}`,
        event
      );
    })
    .on("mouseleave.tooltip", function () {
      focus.style("opacity", 0);
      WB.hideTip();
    });

  brushG.select(".selection")
    .attr("fill", "#3b82f6").attr("fill-opacity", 0.18)
    .attr("stroke", "#2563eb").attr("stroke-width", 1.5);

  brushG.select(".overlay")
    .style("cursor", "crosshair").style("pointer-events", "all");

  WB.events.on("reset.timeline", function () {
    brushG.call(brush.move, null);
  });

  // Selected date indicator (set by clicking a day in the scatter)
  const selectedDateLine = g.append("line")
    .attr("y1", 0).attr("y2", ih)
    .attr("stroke", "#111").attr("stroke-width", 2).attr("stroke-dasharray", "4,3")
    .style("pointer-events", "none").style("opacity", 0);

  WB.events.on("datechange.timeline", function (date) {
    if (!date) { selectedDateLine.style("opacity", 0); return; }
    selectedDateLine.attr("x1", x(date)).attr("x2", x(date)).style("opacity", 1);
  });

  WB.events.on("reset.timeline-date", function () {
    selectedDateLine.style("opacity", 0);
  });

  // ============================================================
  // REPLAY — driven by d3.timer, not a transition, so it can truly pause
  // and resume: elapsed time is accumulated and the clip redrawn from it.
  // ============================================================

  const clip = svg.select("#tl-reveal rect");
  let playing = false, done = 0, timer = null;

  function paintAt(frac) {
    const px = Math.max(0, Math.min(1, frac)) * iw;
    clip.attr("width", px);
    const d = panel[Math.min(
      d3.bisector((r) => r.date).left(panel, x.invert(px)), panel.length - 1)];
    if (d) {
      playDot.attr("cx", x(d.date)).attr("cy", ySp(d.sp500));
      playLabel
        .attr("x", Math.min(x(d.date) + 8, iw - 60))
        .attr("y", Math.max(12, ySp(d.sp500) - 10))
        .text(d3.timeFormat("%b %Y")(d.date));
    }
  }

  function setButtons() {
    playBtn.attr("disabled", playing ? true : null)
      .text(done > 0 && !playing ? "▶ Resume" : "▶ Play");
    pauseBtn.attr("disabled", playing ? null : true);
    restartBtn.attr("disabled", (done > 0 || playing) ? null : true);
  }

  function stopTimer() {
    if (timer) { timer.stop(); timer = null; }
    playing = false;
    setButtons();
  }

  function finish() {
    clip.attr("width", iw);
    playDot.transition().duration(400).style("opacity", 0);
    playLabel.transition().duration(400).style("opacity", 0);
    done = 0;
    setButtons();
  }

  playBtn.on("click", () => {
    if (playing) return;
    playing = true;
    playDot.style("opacity", 1);
    playLabel.style("opacity", 1);
    setButtons();
    const total = WB.dur(cfg.anim.traceDuration);
    const from = done;
    timer = d3.timer((elapsed) => {
      const frac = from + elapsed / total;
      paintAt(frac);
      done = frac;
      if (frac >= 1) { stopTimer(); done = 1; finish(); }
    });
  });

  pauseBtn.on("click", () => { if (playing) stopTimer(); });

  restartBtn.on("click", () => {
    stopTimer();
    done = 0;
    clip.attr("width", iw);
    playDot.style("opacity", 0);
    playLabel.style("opacity", 0);
    setButtons();
  });

  setButtons();
};
