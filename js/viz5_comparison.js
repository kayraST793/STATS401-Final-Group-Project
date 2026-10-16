// viz5_comparison.js — cumulative growth of $1 per industry;
// toggle industries to compare.
//
// INTERACTIONS
//   industry chips   add/remove a line; also broadcasts to the whole dashboard
//   scale toggle     log (default) vs linear — see the note on the y scale
//   hover            vertical guide + ONE tooltip listing every selected
//                    industry's value on that date (details on demand)
//   condition ribbon aligned beneath the lines on the same x scale, so
//                    "did Healthcare drop during the 2020 Volatile-Down
//                    stretch?" is answered by reading straight down
//   linked           brushing view 1 re-bases every line to the new start date

WB.drawComparison = function (state) {
  const { industryDaily, meta, cfg } = state;

  const names = meta.industryNames; // code -> readable name
  const codes = Object.keys(names);

  // ============================================================
  // BUILD CUMULATIVE SERIES
  // ============================================================

  const byCode = d3.group(
    industryDaily.filter(d => d.ret != null),
    d => d.code
  );

  const series = {};
  let activeRange = null;
  let scaleMode = cfg.comparisonScaleDefault || "log";

  codes.forEach(code => {
    const rows = (byCode.get(code) || [])
      .slice()
      .sort((a, b) => a.date - b.date);

    let cum = 1;

    series[code] = rows.map(r => {
      cum *= 1 + r.ret / 100;

      return {
        date: r.date,
        v: cum
      };
    });
  });

  // ============================================================
  // COLORS
  // ============================================================

  const color = d3
    .scaleOrdinal()
    .domain(codes)
    .range(cfg.industryPalette);

  // ============================================================
  // DEFAULT INDUSTRIES
  // ============================================================

  const defaultOn = new Set([
    "Hlth",
    "Utils",
    "BusEq",
    "Enrgy"
  ]);

  const selected = new Set(defaultOn);

  // ============================================================
  // CONTROLS / INDUSTRY CHIPS
  // ============================================================

  const ctrl = d3
    .select("#comparison-controls")
    .attr("class", "controls");

  ctrl.selectAll("*").remove();

  // ---- y-scale toggle
  //
  // Log is the default because cumulative growth is read as PERCENTAGE change.
  // On a linear axis a fall from $2 to $1 is drawn twice as steep as a fall
  // from $1 to $0.50, though both are -50%; on a log axis equal percentage
  // moves are equal distances, which is what the data actually means.
  ctrl.append("span").text("Scale:");

  const scaleDefs = {
    log: ["Log", "Equal percentage moves take equal vertical space — the honest way to compare growth rates. A doubling looks the same whether it happens from $1 or from $4."],
    linear: ["Linear", "Equal dollar moves take equal vertical space. Easier to read off, but it exaggerates late moves and flattens early ones."],
  };

  ["log", "linear"].forEach(mode => {
    ctrl.append("button").attr("data-scale", mode).text(scaleDefs[mode][0])
      .classed("active", mode === scaleMode)
      .on("mouseover", (ev) => WB.showTip(`<b>${scaleDefs[mode][0]} scale</b><br>${scaleDefs[mode][1]}`, ev))
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .on("click", function () {
        scaleMode = mode;
        ctrl.selectAll("button[data-scale]").classed("active", false);
        d3.select(this).classed("active", true);
        render();
      });
  });

  ctrl.append("span").style("margin-left", "12px").text("Industries:");

  codes.forEach(code => {
    const chip = ctrl
      .append("span")
      .attr("class", "chip")
      .classed("on", selected.has(code))
      .on("click", function () {

        // Update this chart's local selection
        if (selected.has(code)) {
          selected.delete(code);
        } else {
          selected.add(code);
        }

        // Update chip appearance
        d3.select(this)
          .classed("on", selected.has(code));

        // Tell the OTHER visualizations
        WB.toggleIndustry(code);

        // Redraw comparison chart
        render();
      });

    chip
      .append("span")
      .attr("class", "dot")
      .style("background", color(code));

    chip
      .append("span")
      .text(names[code]);
  });

  // ============================================================
  // SVG
  // ============================================================

  const box = d3.select("#comparison");
  box.selectAll("*").remove();

  const W = 1060;
  const H = 450;
  const ribbonH = 16;

  const m = {
    top: 16,
    right: 172,   // room for "Business Equipment $7.63" at the line end
    bottom: 30,
    left: 56
  };

  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom - ribbonH - 10;

  const svg = box
    .append("svg")
    .attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", W)
    .attr("height", H);

  const g = svg
    .append("g")
    .attr("transform", `translate(${m.left},${m.top})`);

  // ============================================================
  // SCALES
  // ============================================================

  const allDates = series[codes[0]].map(d => d.date);

  const x = d3
    .scaleTime()
    .domain(d3.extent(allDates))
    .range([0, iw]);

  // rebuilt in render() so the scale TYPE can change
  let y = d3.scaleLog().range([ih, 0]);

  // ============================================================
  // AXES
  // ============================================================

  const gx = g
    .append("g")
    .attr("transform", `translate(0,${ih})`);

  const gy = g
    .append("g")
    .attr("class", "grid");

  // ============================================================
  // LINE GENERATOR
  // ============================================================

  const line = d3
    .line()
    .x(d => x(d.date))
    .y(d => y(d.v));

  const lines = g.append("g");
  const labels = g.append("g");

  // ============================================================
  // Y AXIS TITLE
  // ============================================================

  const yTitle = g
    .append("text")
    .attr("class", "axis-title")
    .attr("transform", "rotate(-90)")
    .attr("x", -ih / 2)
    .attr("y", -42)
    .attr("text-anchor", "middle")
    .text("growth of $1");

  // ============================================================
  // $1 BASELINE
  // ============================================================

  const baseline = g
    .append("line")
    .attr("class", "ref-line")
    .attr("x1", 0)
    .attr("x2", iw);

  // ============================================================
  // ALIGNED CONDITION RIBBON
  //
  // The same market-condition ribbon as view 1, on the SAME x scale directly
  // beneath the growth lines. That alignment is the whole point: a user can
  // read straight down from a dip in a line to the regime it happened in,
  // instead of holding view 1 in memory and comparing by eye.
  //
  // Rolled up to months, as in view 1 — a stripe per trading day over ten
  // years is 2,459 slivers and reads as noise.
  // ============================================================

  const ribbonY = ih + 26;
  const ribbonG = g.append("g").attr("class", "cmp-ribbon");

  g.append("text").attr("class", "axis-title")
    .attr("x", -46).attr("y", ribbonY + 12).text("cond.");

  const monthly = d3.groups(state.panel, p => d3.timeMonth.floor(p.date))
    .map(([start, rows]) => {
      const meanVix = d3.mean(rows, r => r.vix);
      const ret = rows[rows.length - 1].sp500 / rows[0].sp500 - 1;
      return {
        c: `${meanVix <= meta.vixCut ? "Calm" : "Volatile"}-${ret >= 0 ? "Up" : "Down"}`,
        start,
        end: rows[rows.length - 1].date,
        meanVix,
        ret,
      };
    });

  // date -> condition, for the hover read-out
  const condByDay = new Map(state.panel.map(p => [+d3.timeDay.floor(p.date), p.condition]));

  function drawRibbon() {
    const [d0, d1] = x.domain();
    const segs = monthly.filter(s => s.end >= d0 && s.start <= d1);

    const sel = ribbonG.selectAll("rect").data(segs, d => +d.start);
    sel.exit().remove();

    sel.enter().append("rect")
      .attr("y", ribbonY)
      .attr("height", ribbonH)
      .style("cursor", "pointer")
      .on("mouseover", function (ev, d) {
        const f = d3.timeFormat("%b %Y");
        WB.showTip(
          `<b>${f(d.start)}</b><br>${d.c}<br>` +
          `mean VIX ${d.meanVix.toFixed(1)} · market ${(d.ret * 100).toFixed(1)}%` +
          "<br><i>click to filter to this condition</i>", ev);
      })
      .on("mousemove", ev => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .on("click", (ev, d) => WB.toggleCondition(d.c))
      .merge(sel)
      .attr("x", d => Math.max(0, x(d.start)))
      .attr("width", d => Math.max(1, Math.min(iw, x(d.end)) - Math.max(0, x(d.start))))
      .attr("fill", d => cfg.conditionColor[d.c]);

    updateRibbonFade();
  }

  function updateRibbonFade() {
    ribbonG.selectAll("rect")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", d => (WB.matchesCondition(d.c) ? 1 : 0.18));
  }

  // ============================================================
  // HOVER CROSSHAIR + ONE TOOLTIP FOR EVERY SELECTED INDUSTRY
  // ============================================================

  const hoverLine = g.append("line")
    .attr("class", "ref-line")
    .attr("y1", 0).attr("y2", ih)
    .attr("stroke", "#111").attr("stroke-width", 1)
    .style("pointer-events", "none")
    .style("opacity", 0);

  const hoverDots = g.append("g").style("pointer-events", "none");

  const fmtMoney = d3.format("$.2f");
  const fmtPct = d3.format("+.1%");
  const fmtDate = d3.timeFormat("%b %d, %Y");

  const hoverRect = g.append("rect")
    .attr("width", iw).attr("height", ih)
    .attr("fill", "none")
    .style("pointer-events", "all")
    .style("cursor", "crosshair")
    .on("mousemove", function (event) {
      const mx = d3.pointer(event, this)[0];
      const dt = x.invert(mx);

      const on = codes.filter(c => selected.has(c) && series[c].length);
      if (!on.length) return;

      const bisect = d3.bisector(d => d.date).left;

      const readings = on.map(c => {
        const s = series[c];
        const i = Math.min(bisect(s, dt), s.length - 1);
        return { code: c, point: s[i] };
      }).filter(r => r.point);

      if (!readings.length) return;

      const anchor = readings[0].point.date;

      hoverLine.attr("x1", x(anchor)).attr("x2", x(anchor)).style("opacity", 0.55);

      const dots = hoverDots.selectAll("circle").data(readings, d => d.code);
      dots.exit().remove();
      dots.enter().append("circle")
        .attr("r", 3.5).attr("stroke", "#fff").attr("stroke-width", 1.5)
        .merge(dots)
        .attr("cx", d => x(d.point.date))
        .attr("cy", d => y(d.point.v))
        .attr("fill", d => color(d.code));

      readings.sort((a, b) => b.point.v - a.point.v);

      const cond = condByDay.get(+d3.timeDay.floor(anchor));

      WB.showTip(
        `<b>${fmtDate(anchor)}</b>${cond ? ` · ${cond}` : ""}<br>` +
        readings.map(r =>
          `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;` +
          `background:${color(r.code)};margin-right:5px"></span>` +
          `${names[r.code]} <b>${fmtMoney(r.point.v)}</b> ` +
          `<span style="opacity:.65">${fmtPct(r.point.v - 1)}</span>`
        ).join("<br>"),
        event);
    })
    .on("mouseleave", function () {
      hoverLine.style("opacity", 0);
      hoverDots.selectAll("circle").remove();
      WB.hideTip();
    });

  // keep the overlay beneath the ribbon but above the lines
  hoverRect.raise();

  // ============================================================
  // SERIES BUILDER
  //
  // Compounds one industry's daily returns into growth of $1, restricted to
  // the brushed date range and — when faceting — to a single market
  // condition. Re-based to $1 at the first day that survives the filters, so
  // every panel starts from the same place and the shapes are comparable.
  // ============================================================

  function seriesFor(code, condition) {
    let value = 1;

    const rows = (byCode.get(code) || [])
      .filter(d =>
        (!activeRange || (d.date >= activeRange[0] && d.date <= activeRange[1])) &&
        (!condition || d.condition === condition)
      )
      .slice()
      .sort((a, b) => a.date - b.date);

    return rows.map(d => {
      value *= 1 + d.ret / 100;
      return { date: d.date, v: value };
    });
  }

  // Push overlapping end labels apart so industries that finish at similar
  // values stay readable. Returns a Map of item -> adjusted y.
  function declutter(items, getY, minGap) {
    const sorted = items.map(d => ({ d, y: getY(d) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].y - sorted[k - 1].y < minGap) {
        sorted[k].y = sorted[k - 1].y + minGap;
      }
    }
    const out = new Map();
    sorted.forEach(s => out.set(s.d, s.y));
    return out;
  }


  function render() {

    // Rebuild cumulative returns from the start of the selected period.
    // A single condition still pools into one chart; the ribbon beneath
    // already shows which stretches it covers.
    codes.forEach(code => {
      series[code] = seriesFor(code, null);
    });

    const on = codes.filter(
        c => selected.has(c) && series[c].length
    );

    const maxV =
      d3.max(
        on,
        c => d3.max(series[c], d => d.v)
      ) || 2;

    const minV =
      d3.min(
        on,
        c => d3.min(series[c], d => d.v)
      ) || 1;

    // A log scale cannot show zero or negative values. A portfolio of $1
    // compounded by daily returns can only reach zero on a -100% day, which
    // never happens in this data — but guard anyway and fall back cleanly.
    const logOK = scaleMode === "log" && minV > 0 && maxV > 0;

    if (logOK) {
      y = d3.scaleLog().range([ih, 0]).domain([minV * 0.96, maxV * 1.04]);
    } else {
      y = d3.scaleLinear().range([ih, 0]).domain([0, maxV]).nice();
    }

    yTitle.text(logOK ? "growth of $1 (log scale)" : "growth of $1");

    gx.call(
      d3.axisBottom(x)
        .ticks(8)
    );

    // d3's default log ticks are dense and include unlabelled minors, so the
    // gridlines are placed on values a reader would actually look for.
    const axis = d3.axisLeft(y).tickSize(-iw);

    if (logOK) {
      const candidates = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50];
      const dom = y.domain();
      axis.tickValues(candidates.filter(v => v >= dom[0] && v <= dom[1]))
          .tickFormat(d3.format("$,.3~f"));
    } else {
      axis.ticks(6).tickFormat(d3.format("$,.3~f"));
    }

    gy.call(axis);

    baseline
      .attr("y1", y(1))
      .attr("y2", y(1));

    // ----------------------------------------------------------
    // LINES
    // ----------------------------------------------------------

    const sel = lines
      .selectAll("path")
      .data(on, d => d);

    sel.exit().remove();

    sel
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", 1.8)
      .merge(sel)
      .attr("stroke", c => color(c))
      .transition("shape")
      .duration(cfg.anim.normal)
      .attr("d", c => line(series[c]));

    // ----------------------------------------------------------
    // END LABELS
    // ----------------------------------------------------------

    const endY = declutter(on, c => {
      const s = series[c];
      return s && s.length ? y(s[s.length - 1].v) : ih;
    }, WB.isMini("viz5") ? 15 : 12);

    const lab = labels
      .selectAll("text")
      .data(on, d => d);

    lab.exit().remove();

    lab
      .enter()
      .append("text")
      .attr("class", "net-label")
      .merge(lab)
      .attr("x", iw + 6)
      .attr("dy", "0.32em")
      .attr("fill", c => color(c))
      .text(c => {
        const s = series[c];
        // codes when collapsed — full names do not fit the mini right margin
        const label = WB.isMini("viz5") ? c : names[c];
        if (!s || !s.length) return label;
        return `${label} ${fmtMoney(s[s.length - 1].v)}`;
      })
      .transition("shape")
      .duration(cfg.anim.normal)
      .attr("y", c => endY.get(c) ?? ih);

    drawRibbon();
    hoverRect.raise();
  }

  // ============================================================
  // LISTEN FOR INDUSTRY SELECTIONS FROM OTHER VISUALIZATIONS
  // ============================================================

  WB.events.on("industrychange.comparison", function (globalSelected) {

    /*
      IMPORTANT:

      Other charts may send either the industry CODE: "Hlth"

      or the readable industry NAME.

      Convert readable names back to their code here.
    */

    const normalized = new Set();

    globalSelected.forEach(value => {

      // Already a valid code
      if (codes.includes(value)) {
        normalized.add(value);
        return;
      }

      // Try matching readable industry name
      const matchingCode = codes.find(
        code => names[code] === value
      );

      if (matchingCode) {
        normalized.add(matchingCode);
      }
    });

    // Replace local selection with global selection
    selected.clear();

    if (normalized.size > 0) {
      normalized.forEach(code => selected.add(code));
    } else {
      defaultOn.forEach(code => selected.add(code));
    }

    // Update chips
    ctrl
      .selectAll(".chip")
      .classed("on", function (_, i) {
        const code = codes[i];
        return selected.has(code);
      });

    render();
  });

  // ============================================================
  // DATE RANGE FROM TIMELINE
  // ============================================================

  WB.events.on("daterangechange.comparison", function (range) {
    activeRange = range;

    x.domain(
        range || d3.extent(allDates)
    );

    render();
  });

  // ============================================================
  // CONDITION + PALETTE (ribbon only — the lines stay continuous, because
  // chaining non-consecutive days into a cumulative curve would be a lie)
  // ============================================================

  // A condition change can change the NUMBER of panels here, so it goes
  // through render() rather than only re-fading the ribbon.
  // The lines stay pooled across conditions — chaining non-consecutive days
  // into a cumulative curve would be a lie — so a condition change only
  // re-fades the ribbon beneath.
  WB.events.on("conditionchange.comparison", updateRibbonFade);

  // A palette switch has to go through a full render, not just the ribbon:
  // the ribbon fill AND anything else reading cfg.conditionColor repaint here.
  WB.events.on("palettechange.comparison", render);
  WB.events.on("layoutchange.comparison", render);   // labels differ when collapsed

  // ============================================================
  // RESET
  // ============================================================

  WB.events.on("reset.comparison", function () {

    activeRange = null;
    selected.clear();

    defaultOn.forEach(code => {
      selected.add(code);
    });

    x.domain(d3.extent(allDates));

    ctrl
      .selectAll(".chip")
      .classed("on", function (_, i) {
        const code = codes[i];
        return selected.has(code);
      });

    render();
  });

  // ============================================================
  // INITIAL DRAW
  // ============================================================

  render();
};
