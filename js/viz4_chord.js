// viz4_chord.js — industry co-movement as a CHORD DIAGRAM.
//
// Replaces the force-directed network. The reason is comparability: a force
// layout re-settles every time the data changes, so the calm picture and the
// stressed picture can't be compared. Here the twelve industries hold FIXED
// positions on the ring, and only the ribbons change.
//
// ENCODING
//   ring position   fixed, 1/12 of the circle each — never moves, by design
//   arc fill        how strongly that industry is tied to the rest, as a
//                   fraction of the maximum possible co-movement
//   ribbon width    the correlation between the two industries it joins
//
// INTERACTIONS
//   click an arc    pin that industry across the dashboard, trace its chords
//   threshold       minimum correlation required to draw a chord
//   play/pause      rolling 12-month window showing the structure tighten
//                   through the crises and loosen in the calm years
//   linked          recomputes on condition and date-range changes
WB.drawChord = function (state) {
  const { cfg, meta } = state;
  const codes = state.codes;
  const names = meta.industryNames;
  const color = d3.scaleOrdinal().domain(codes).range(cfg.industryPalette);

  let threshold = cfg.corrThreshold;
  let playing = false, playTimer = null, overrideMatrix = null;
  let wins = [], wi = 0;

  // ----------------------------------------------------------------- controls
  const ctrl = d3.select("#chord-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();

  // ---- view mode -----------------------------------------------------------
  // Switching the condition on one ring asks the reader to compare against a
  // picture they saw ten seconds ago. Small multiples put all four states on
  // screen at once, same encoding, four data subsets — so the contrast
  // (a handful of links when the market is calm, a dense web when it is
  // falling hard) is a single glance rather than an act of memory.
  //
  // The big ring stays the default: at a quarter of the size the twelve full
  // industry names will not fit, so the comparison view falls back to codes.
  let mode = "auto";   // "auto" | "small"

  ctrl.append("span").text("View:");

  const modeDefs = {
    auto: ["Follow selection",
      "<b>One ring</b> while no condition, or a single condition, is selected — full industry names, hover detail and the rolling-window animation.<br><br>" +
      "<b>Select two or more conditions</b> (click the quadrants in view 2, the columns in view 3, or the chips at the top) and this view splits into one panel per condition automatically."],
    small: ["Compare all four",
      "All four conditions at once, whatever is selected. Same threshold, same encoding, four slices of the data — comparison by looking instead of by remembering."],
  };

  ["auto", "small"].forEach((md) => {
    ctrl.append("button").attr("data-mode", md).text(modeDefs[md][0])
      .classed("active", md === mode)
      .on("mouseover", (ev) => WB.showTip(`<b>${modeDefs[md][0]}</b><br>${modeDefs[md][1]}`, ev))
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip)
      .on("click", function () {
        if (mode === md) return;
        mode = md;
        ctrl.selectAll("button[data-mode]").classed("active", false);
        d3.select(this).classed("active", true);
        refresh();
      });
  });

  ctrl.append("span").attr("class", "dock-sep").style("margin", "0 8px");

  const playBtn = ctrl.append("button").text("▶ Play");
  const pauseBtn = ctrl.append("button").text("⏸ Pause").attr("disabled", true);
  const restartBtn = ctrl.append("button").text("↻ Restart").attr("disabled", true);

  ctrl.append("span").style("margin-left", "10px").text("|corr| ≥ ");
  const thLabel = ctrl.append("b").text(threshold.toFixed(2));
  ctrl.append("input").attr("type", "range")
    .attr("min", 0).attr("max", 0.95).attr("step", 0.05).attr("value", threshold)
    .on("input", function () {
      threshold = +this.value;
      thLabel.text(threshold.toFixed(2));
      refresh();
    });

  const statline = d3.select("#chord-stat");

  // ------------------------------------------------------------------- layout
  const outerBox = d3.select("#chord");
  outerBox.selectAll("*").remove();

  // two sub-containers: one big ring, and the four-condition comparison
  const box = outerBox.append("div").attr("id", "chord-single");
  const smallBox = outerBox.append("div").attr("id", "chord-small").style("display", "none");

  const W = 700, H = 620;
  const outerR = Math.min(W, H) * 0.5 - 118;
  const innerR = outerR - 16;

  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2 + 6})`);

  const windowLabel = svg.append("text").attr("class", "chord-window")
    .attr("x", W / 2).attr("y", 26).attr("text-anchor", "middle").style("opacity", 0);

  const emptyNote = svg.append("text").attr("class", "axis-title")
    .attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle").style("opacity", 0)
    .text("No pair clears this threshold — drag the slider left.");

  const chord = d3.chord().padAngle(0.045).sortSubgroups(d3.descending).sortGroups(null);
  const arc = d3.arc().innerRadius(innerR).outerRadius(outerR);
  const ribbon = d3.ribbon().radius(innerR - 1);

  const ribbonG = g.append("g").attr("class", "chord-ribbons");
  const groupG = g.append("g").attr("class", "chord-groups");

  const lastGroups = new Map();
  const lastRibbons = new Map();

  // -------------------------------------------------------------- matrix prep
  // Multi-select aware: with several conditions picked, the single ring pools
  // exactly those days rather than silently falling back to all of them.
  function currentRaw() {
    if (overrideMatrix) return overrideMatrix;
    const rows = WB.rowsInScope(null).filter((r) => WB.matchesCondition(r.condition));
    return WB.corrFor(rows);
  }

  // d3.chord sizes each group by its row total, so in a calm period (few
  // links) three industries would swallow the whole ring and the labels would
  // collide. Giving every row the same total — real correlations plus "slack"
  // parked on the diagonal — pins each industry to exactly 1/12 of the circle.
  // The self-chord that slack would draw is filtered out before rendering.
  const DENOM = codes.length - 1;

  function thresholded(raw) {
    const k = codes.length;
    const M = Array.from({ length: k }, () => new Array(k).fill(0));
    const rowSum = new Array(k).fill(0);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i === j) continue;
        const v = raw?.[i]?.[j];
        const w = v != null && Math.abs(v) >= threshold ? Math.abs(v) : 0;
        M[i][j] = w;
        rowSum[i] += w;
      }
    }
    for (let i = 0; i < k; i++) M[i][i] = Math.max(0, DENOM - rowSum[i]);
    return { M, rowSum };
  }

  function meanOffDiagonal(raw) {
    let s = 0, n = 0;
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const v = raw?.[i]?.[j];
        if (v != null) { s += v; n++; }
      }
    }
    return n ? s / n : null;
  }

  function flatten(d, collapsed) {
    const s = d.source, t = d.target;
    return {
      source: { startAngle: s.startAngle, endAngle: collapsed ? s.startAngle : s.endAngle, radius: innerR - 1 },
      target: { startAngle: t.startAngle, endAngle: collapsed ? t.startAngle : t.endAngle, radius: innerR - 1 },
    };
  }

  // ------------------------------------------------------------------- render
  function render() {
    const raw = currentRaw();
    const { M, rowSum } = thresholded(raw);
    const linked = d3.sum(rowSum);

    emptyNote.style("opacity", linked > 0 ? 0 : 1);

    const full = chord(M);
    const groups = full.groups;
    const layout = full.filter((d) => d.source.index !== d.target.index);

    // ---- ribbons
    const rb = ribbonG.selectAll("path")
      .data(layout, (d) => `${Math.min(d.source.index, d.target.index)}-${Math.max(d.source.index, d.target.index)}`);

    rb.exit().transition("shape").duration(cfg.anim.normal).style("opacity", 0).remove();

    const rbEnter = rb.enter().append("path")
      .attr("class", "chord-ribbon")
      .attr("fill", (d) => color(codes[d.source.index]))
      .attr("stroke", "#fff").attr("stroke-width", 0.4)
      .style("opacity", 0)
      .attr("d", (d) => ribbon(flatten(d)));

    rbEnter.merge(rb)
      .on("mouseover", function (ev, d) {
        const a = codes[d.source.index], b = codes[d.target.index];
        const v = raw?.[d.source.index]?.[d.target.index];
        WB.showTip(`<b>${names[a]}</b> ↔ <b>${names[b]}</b><br>correlation ${v == null ? "–" : v.toFixed(2)}`, ev);
        d3.select(this).attr("stroke", "#152033").attr("stroke-width", 1.2);
      })
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", function () {
        WB.hideTip();
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 0.4);
      })
      .transition("shape").duration(cfg.anim.normal)
      .attr("fill", (d) => color(codes[d.source.index]))
      .attrTween("d", function (d) {
        const key = `${Math.min(d.source.index, d.target.index)}-${Math.max(d.source.index, d.target.index)}`;
        const prev = lastRibbons.get(key) || flatten(d, true);
        const i = d3.interpolate(prev, flatten(d));
        lastRibbons.set(key, flatten(d));
        return (t) => ribbon(i(t));
      })
      .style("opacity", 1);

    // ---- group arcs: a pale full sector plus a saturated fill level
    const gp = groupG.selectAll("g.chord-group").data(groups, (d) => d.index);
    gp.exit().remove();

    const gpEnter = gp.enter().append("g").attr("class", "chord-group")
      .style("cursor", "pointer")
      .on("click", (ev, d) => WB.toggleIndustry(codes[d.index]))
      .on("mouseover", (ev, d) => {
        const code = codes[d.index];
        const partners = codes
          .map((c, j) => ({ c, v: raw?.[d.index]?.[j], j }))
          .filter((o) => o.j !== d.index && o.v != null && Math.abs(o.v) >= threshold)
          .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
        const frac = Math.max(0, Math.min(1, rowSum[d.index] / DENOM));
        WB.showTip(
          `<b>${names[code]}</b><br>${partners.length} link${partners.length === 1 ? "" : "s"} at ≥ ${threshold.toFixed(2)}<br>` +
          (partners.length ? "closest: " + partners.map((p) => `${names[p.c]} ${p.v.toFixed(2)}`).join(", ")
                           : "none at this threshold") +
          `<br>co-movement ${d3.format(".0%")(frac)} of the maximum possible` +
          "<br><i>click to pin this industry</i>",
          ev);
      })
      .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip);

    gpEnter.append("path").attr("class", "chord-arc-bg")
      .attr("stroke", "#fff").attr("stroke-width", 0.6).attr("opacity", 0.22);
    gpEnter.append("path").attr("class", "chord-arc-fg")
      .attr("stroke", "#fff").attr("stroke-width", 0.6);
    gpEnter.append("text").attr("class", "chord-label").attr("dy", "0.32em");

    const gpAll = gpEnter.merge(gp);

    gpAll.select(".chord-arc-bg")
      .attr("fill", (d) => color(codes[d.index]))
      .attr("d", (d) => arc({ startAngle: d.startAngle, endAngle: d.endAngle }));

    gpAll.select(".chord-arc-fg")
      .attr("fill", (d) => color(codes[d.index]))
      .transition("shape").duration(cfg.anim.normal)
      .attrTween("d", function (d) {
        const frac = Math.max(0, Math.min(1, rowSum[d.index] / DENOM));
        const target = {
          startAngle: d.startAngle,
          endAngle: d.startAngle + (d.endAngle - d.startAngle) * frac,
        };
        const prev = lastGroups.get(d.index) || { startAngle: d.startAngle, endAngle: d.startAngle };
        const i = d3.interpolate(prev, target);
        lastGroups.set(d.index, target);
        return (t) => arc(i(t));
      });

    gpAll.select("text")
      // full names when the card has room; codes when it is collapsed to a
      // mini, where "Consumer NonDurables" would run off the edge
      .text((d) => (WB.isMini("viz4") ? codes[d.index] : names[codes[d.index]]))
      .attr("text-anchor", (d) => ((d.startAngle + d.endAngle) / 2 > Math.PI ? "end" : "start"))
      .attr("transform", (d) => {
        const a = (d.startAngle + d.endAngle) / 2;
        const deg = (a * 180) / Math.PI - 90;
        return `rotate(${deg}) translate(${outerR + 8},0)${a > Math.PI ? " rotate(180)" : ""}`;
      });

    // ---- plain-language read-out
    const avg = meanOffDiagonal(raw);
    const condTxt = state.filters.condition === "All" ? "all conditions" : state.filters.condition;
    if (!statline.empty()) {
      statline.html(
        avg == null
          ? "Not enough days in this selection to compute correlations."
          : `Average correlation across all 66 industry pairs in <b>${condTxt}</b>: ` +
            `<b>${avg.toFixed(2)}</b> — ${layout.length} of 66 pairs drawn at a threshold of ${threshold.toFixed(2)}. ` +
            (avg >= 0.6 ? "Industries are moving largely as one block."
             : avg >= 0.4 ? "Industries are partly coupled."
             : "Industries are drifting fairly independently.")
      );
    }

    applyHighlight();
  }

  // ==========================================================================
  // SMALL MULTIPLES — four conditions, same encoding, four data subsets
  //
  // Each panel ignores the dashboard's condition filter (that is the variable
  // being faceted on) but respects the brushed date range, so brushing 2020
  // shows how the four regimes looked through the crash specifically.
  // ==========================================================================

  const sChord = d3.chord().padAngle(0.05).sortSubgroups(d3.descending).sortGroups(null);

  // Which conditions get a panel of their own:
  //   - the explicit "Compare all four" button wins
  //   - otherwise, two or more selected conditions each get a panel
  //   - zero or one selected -> null, meaning the single big ring
  function activeFacets() {
    const order = cfg.heatmapConditionOrder || cfg.conditionOrder;
    if (mode === "small") return order;
    const picked = state.filters.conditions;
    if (picked.size < 2) return null;
    return order.filter((c) => picked.has(c));
  }

  function renderSmall(facets) {
    const conds = facets || (cfg.heatmapConditionOrder || cfg.conditionOrder);

    // two panels read better in one row; three or four go 2 x 2
    const cols = conds.length <= 2 ? conds.length : 2;
    const rowsN = Math.ceil(conds.length / cols);

    const cellW = 390, cellH = 410;
    const SW = cellW * cols, SH = cellH * rowsN;

    const sOuterR = Math.min(cellW, cellH) * 0.5 - 76;
    const sInnerR = sOuterR - 9;
    const sArc = d3.arc().innerRadius(sInnerR).outerRadius(sOuterR);
    const sRibbon = d3.ribbon().radius(sInnerR - 1);

    smallBox.selectAll("*").remove();

    const svgS = smallBox.append("svg").attr("class", "wb-svg")
      .attr("viewBox", `0 0 ${SW} ${SH}`).attr("width", SW).attr("height", SH);

    conds.forEach((cond, k) => {
      const col = k % cols, row = Math.floor(k / cols);
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2 + 18;

      const rows = WB.rowsInScope(cond);
      const raw = WB.corrFor(rows);
      const { M, rowSum } = thresholded(raw);
      const full = sChord(M);
      const layout = full.filter((d) => d.source.index !== d.target.index);
      const avg = meanOffDiagonal(raw);

      // ---- panel heading
      const head = svgS.append("g")
        .attr("transform", `translate(${cx},${row * cellH + 24})`);

      const titleText = head.append("text").attr("class", "chord-mini-title")
        .attr("text-anchor", "middle").attr("y", -4)
        .text(cond);

      // The swatch sits just left of the centred title. Its offset is MEASURED
      // from the rendered text rather than estimated from the character count,
      // because the title's font-size changes when the card collapses to a
      // mini and any hard-coded guess lands on top of the words.
      const titleW = titleText.node().getComputedTextLength();
      const swatchH = Math.max(9, titleW / cond.length * 0.9);

      head.insert("rect", ":first-child")
        .attr("class", "mini-swatch")
        .attr("x", -titleW / 2 - swatchH * 1.9)
        .attr("y", -4 - swatchH * 0.78)
        .attr("width", swatchH * 1.35).attr("height", swatchH * 0.8)
        .attr("rx", 2)
        .attr("fill", cfg.conditionColor[cond]);

      head.append("text").attr("class", "chord-mini-sub")
        .attr("text-anchor", "middle").attr("y", 12)
        .text(
          rows.length < 3
            ? "not enough days in this range"
            : `${layout.length} of 66 pairs · avg r ${avg == null ? "–" : avg.toFixed(2)} · ${rows.length.toLocaleString()} days`
        );

      const cg = svgS.append("g")
        .attr("class", "chord-mini")
        .attr("data-cond", cond)
        .attr("transform", `translate(${cx},${cy})`);

      // ---- ribbons
      cg.append("g").attr("class", "mini-ribbons")
        .selectAll("path").data(layout).join("path")
        .attr("class", "mini-ribbon")
        .attr("d", sRibbon)
        .attr("fill", (d) => color(codes[d.source.index]))
        .attr("stroke", "#fff").attr("stroke-width", 0.3)
        .style("opacity", 0.7)
        .on("mouseover", function (ev, d) {
          const a = codes[d.source.index], b = codes[d.target.index];
          const v = raw?.[d.source.index]?.[d.target.index];
          WB.showTip(
            `<b>${cond}</b><br>${names[a]} ↔ ${names[b]}<br>` +
            `correlation ${v == null ? "–" : v.toFixed(2)}`, ev);
          d3.select(this).attr("stroke", "#152033").attr("stroke-width", 1);
        })
        .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
        .on("mouseleave", function () {
          WB.hideTip();
          d3.select(this).attr("stroke", "#fff").attr("stroke-width", 0.3);
        });

      // ---- arcs + code labels
      const gp = cg.append("g").attr("class", "mini-groups")
        .selectAll("g").data(full.groups).join("g")
        .attr("class", "mini-group")
        .style("cursor", "pointer")
        .on("click", (ev, d) => WB.toggleIndustry(codes[d.index]))
        .on("mouseover", (ev, d) => {
          const frac = Math.max(0, Math.min(1, rowSum[d.index] / DENOM));
          WB.showTip(
            `<b>${names[codes[d.index]]}</b> · ${cond}<br>` +
            `co-movement ${d3.format(".0%")(frac)} of the maximum possible` +
            "<br><i>click to pin this industry everywhere</i>", ev);
        })
        .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
        .on("mouseleave", WB.hideTip);

      gp.append("path").attr("class", "mini-arc-bg")
        .attr("fill", (d) => color(codes[d.index]))
        .attr("opacity", 0.22)
        .attr("d", (d) => sArc({ startAngle: d.startAngle, endAngle: d.endAngle }));

      gp.append("path").attr("class", "mini-arc-fg")
        .attr("fill", (d) => color(codes[d.index]))
        .attr("d", (d) => {
          const frac = Math.max(0, Math.min(1, rowSum[d.index] / DENOM));
          return sArc({
            startAngle: d.startAngle,
            endAngle: d.startAngle + (d.endAngle - d.startAngle) * frac,
          });
        });

      // codes, not names — at this size the full names collide
      gp.append("text").attr("class", "chord-mini-label").attr("dy", "0.32em")
        .text((d) => codes[d.index])
        .attr("text-anchor", (d) => ((d.startAngle + d.endAngle) / 2 > Math.PI ? "end" : "start"))
        .attr("transform", (d) => {
          const a = (d.startAngle + d.endAngle) / 2;
          const deg = (a * 180) / Math.PI - 90;
          return `rotate(${deg}) translate(${sOuterR + 5},0)${a > Math.PI ? " rotate(180)" : ""}`;
        });
    });

    applyHighlight();
  }

  // ---------------------------------------------------------------- mode swap
  function refresh() {
    const facets = activeFacets();
    const single = !facets;

    box.style("display", single ? null : "none");
    smallBox.style("display", single ? "none" : null);

    // the rolling-window animation only makes sense on the single ring
    [playBtn, pauseBtn, restartBtn].forEach((b) => b.style("display", single ? null : "none"));

    if (single) {
      smallBox.selectAll("*").remove();   // drop stale panels so none can flash back
      render();
      return;
    }

    if (playing) pausePlay();
    overrideMatrix = null;
    windowLabel.style("opacity", 0);
    renderSmall(facets);

    if (!statline.empty()) {
      statline.html(
        facets.length === 4
          ? "Same ring, same threshold, four slices of the data. Watch the number of " +
            "pairs in each heading: industries drift apart when the market is calm and " +
            "lock together when it falls hard — the reason diversification thins out " +
            "exactly when it is needed."
          : `Comparing <b>${facets.join("</b> and <b>")}</b> at the same threshold. ` +
            "The pair count in each heading is the comparison — more pairs means the " +
            "twelve industries were moving more nearly as one. Deselect a condition to " +
            "go back to a single ring."
      );
    }
  }

  // ------------------------------------------------------------- highlighting
  function applyHighlight() {
    const sel = state.filters.industries;
    const has = sel.size > 0;
    const picked = (i) => sel.has(WB.normalizeIndustry(codes[i]));

    // ---- small-multiples panels
    smallBox.selectAll(".mini-ribbon")
      .transition("fade").duration(cfg.anim.fast)
      .style("opacity", (d) => {
        if (!has) return 0.7;
        return picked(d.source.index) || picked(d.target.index) ? 0.92 : 0.05;
      });

    smallBox.selectAll(".mini-arc-fg")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 1 : 0.25));

    smallBox.selectAll(".mini-arc-bg")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 0.22 : 0.08));

    smallBox.selectAll(".chord-mini-label")
      .attr("font-weight", (d) => (picked(d.index) ? 700 : 400))
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 1 : 0.3));

    ribbonG.selectAll("path")
      .transition("fade").duration(cfg.anim.fast)
      .style("opacity", (d) => {
        if (!has) return 0.72;
        return picked(d.source.index) || picked(d.target.index) ? 0.92 : 0.06;
      });

    groupG.selectAll("g.chord-group").select(".chord-arc-fg")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 1 : 0.25));

    groupG.selectAll("g.chord-group").select(".chord-arc-bg")
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 0.22 : 0.08));

    groupG.selectAll("g.chord-group").select("text")
      .attr("font-weight", (d) => (picked(d.index) ? 700 : 400))
      .transition("fade").duration(cfg.anim.fast)
      .attr("opacity", (d) => (!has || picked(d.index) ? 1 : 0.35));
  }

  // -------------------------------------------------------- time animation
  function buildWindows() {
    const rows = WB.rowsInScope(null);
    if (rows.length < 60) return [];
    const t0 = rows[0].date, t1 = rows[rows.length - 1].date;
    const out = [];
    let start = d3.timeMonth.floor(t0);
    for (;;) {
      const end = d3.timeMonth.offset(start, cfg.chordWindowMonths);
      if (end > t1) break;
      const sub = rows.filter((r) => r.date >= start && r.date < end);
      if (sub.length > 30) out.push({ start, end, rows: sub });
      start = d3.timeMonth.offset(start, cfg.chordStepMonths);
    }
    return out;
  }

  function setPlayButtons() {
    playBtn.attr("disabled", playing ? true : null)
      .text(wi > 0 && !playing ? "▶ Resume" : "▶ Play");
    pauseBtn.attr("disabled", playing ? null : true);
    restartBtn.attr("disabled", (wi > 0 || playing) ? null : true);
  }

  function pausePlay() {
    playing = false;
    if (playTimer) { playTimer.stop(); playTimer = null; }
    setPlayButtons();
  }

  function stopPlay() {
    pausePlay();
    wi = 0;
    overrideMatrix = null;
    windowLabel.transition().duration(300).style("opacity", 0);
    setPlayButtons();
    render();
  }

  function step() {
    if (!playing) return;
    const w = wins[wi];
    const f = d3.timeFormat("%b %Y");
    overrideMatrix = WB.corrFor(w.rows);
    windowLabel.text(
      `${f(w.start)} – ${f(d3.timeDay.offset(w.end, -1))}   ·   window ${wi + 1} of ${wins.length}`);
    render();
    wi += 1;
    if (wi >= wins.length) { playTimer = d3.timeout(stopPlay, WB.dur(cfg.anim.chordStep)); return; }
    playTimer = d3.timeout(step, WB.dur(cfg.anim.chordStep));
  }

  playBtn.on("click", () => {
    if (playing) return;
    if (!wins.length || wi === 0) {
      wins = buildWindows();
      if (!wins.length) {
        if (!statline.empty()) {
          statline.html("<i>Brush a wider time range to animate — at least a couple of years is needed.</i>");
        }
        return;
      }
      wi = 0;
    }
    playing = true;
    windowLabel.style("opacity", 1);
    setPlayButtons();
    step();
  });

  pauseBtn.on("click", pausePlay);
  restartBtn.on("click", stopPlay);
  setPlayButtons();

  // ------------------------------------------- react to the shared filters
  WB.events.on("industrychange.chord", applyHighlight);
  WB.events.on("layoutchange.chord", refresh);   // labels differ when collapsed
  WB.events.on("palettechange.chord", function () {
    smallBox.selectAll(".mini-swatch")
      .attr("fill", function () {
        return cfg.conditionColor[this.parentNode.querySelector(".chord-mini-title").textContent];
      });
  });
  // A condition change can now change the NUMBER of panels, so it has to go
  // through refresh() rather than straight to render().
  WB.events.on("conditionchange.chord", function () {
    if (playing) pausePlay();
    overrideMatrix = null;
    wi = 0;
    refresh();
  });

  WB.events.on("daterangechange.chord", function () {
    if (playing) { pausePlay(); overrideMatrix = null; wi = 0; windowLabel.style("opacity", 0); }
    refresh();
  });

  WB.events.on("reset.chord", function () {
    threshold = cfg.corrThreshold;
    thLabel.text(threshold.toFixed(2));
    ctrl.select("input").property("value", threshold);
    mode = "auto";
    ctrl.selectAll("button[data-mode]").classed("active", function () {
      return this.dataset.mode === "auto";
    });
    pausePlay();
    wi = 0;
    overrideMatrix = null;
    windowLabel.style("opacity", 0);
    refresh();
  });

  refresh();
};
