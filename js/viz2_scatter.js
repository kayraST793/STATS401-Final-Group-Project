// viz2_scatter.js — daily S&P return (x) vs VIX (y), coloured by condition.
WB.drawScatter = function (state) {
  const { panel, cfg, meta } = state;
  const box = d3.select("#scatter");
  box.selectAll("*").remove();

  const W = 720, H = 460;
  const m = { top: 16, right: 16, bottom: 44, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const ctrl = d3.select("#scatter-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();
  const explainBtn = ctrl.append("button").text("▶ Explain the four conditions");

  let showDensity = false;
  const densityBtn = ctrl.append("button").style("margin-left", "8px")
    .text("Density contours")
    .on("mouseover", (ev) => WB.showTip(
      "2,459 points overlap heavily near (0%, 15). The contours show where days " +
      "actually pile up, per condition.<br><br><i>Off by default: four " +
      "overlapping densities get muddy, so read them one condition at a time.</i>", ev))
    .on("mousemove", (ev) => WB.tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY - 10 + "px"))
    .on("mouseleave", WB.hideTip)
    .on("click", function () {
      showDensity = !showDensity;
      d3.select(this).classed("active", showDensity);
      drawDensity();
    });

  ctrl.append("span").style("margin-left", "8px").style("font-style", "italic")
    .text("Click a quadrant or label to filter the dashboard; click a dot to mark that day.");

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
  const vixLine = g.append("line").attr("class", "ref-line").attr("x1", 0).attr("x2", iw)
    .attr("y1", y(meta.vixCut)).attr("y2", y(meta.vixCut));
  const vixLabel = g.append("text").attr("class", "axis-title").attr("x", iw - 4).attr("y", y(meta.vixCut) - 4)
    .attr("text-anchor", "end").text(`VIX median ${meta.vixCut} — the calm / volatile line`);
  const zeroLine = g.append("line").attr("class", "ref-line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ih);


// ============================================================
// CLICKABLE MARKET-CONDITION QUADRANTS
// ============================================================

const quadrants = [
    {
        condition: "Calm-Up",
        x0: x(0),
        x1: iw,
        y0: y(meta.vixCut),
        y1: ih
    },
    {
        condition: "Calm-Down",
        x0: 0,
        x1: x(0),
        y0: y(meta.vixCut),
        y1: ih
    },
    {
        condition: "Volatile-Up",
        x0: x(0),
        x1: iw,
        y0: 0,
        y1: y(meta.vixCut)
    },
    {
        condition: "Volatile-Down",
        x0: 0,
        x1: x(0),
        y0: 0,
        y1: y(meta.vixCut)
    }
];

// Multi-select: clicking a second quadrant ADDS it rather than replacing the
// first, which is what splits views 4 and 5 into side-by-side panels.
function selectQuadrant(condition) {
    WB.toggleCondition(condition);
}

// Clickable backgrounds
const quadrantLayer = g.append("g")
    .attr("class", "quadrant-layer");

quadrantLayer.selectAll("rect")
    .data(quadrants)
    .join("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => cfg.conditionColor[d.condition])
    // 0.025 was effectively invisible, so the four regions did not read as
    // clickable targets at all. 0.08 is enough to see without competing with
    // the points drawn on top.
    .attr("fill-opacity", 0.08)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
        selectQuadrant(d.condition);
    });

// ============================================================
// DENSITY CONTOURS (optional)
//
// Sits between the quadrant backgrounds and the points so the contours read
// as a ground layer rather than covering the dots.
// ============================================================

const densityG = g.append("g").attr("class", "density-layer")
    .style("pointer-events", "none");

function drawDensity() {
    densityBtn.classed("active", showDensity);

    if (!showDensity) {
        densityG.selectAll("*").remove();
        return;
    }

    const byCond = d3.group(panel, d => d.condition);
    const paths = [];

    byCond.forEach((rows, cond) => {
        const contours = d3.contourDensity()
            .x(d => x(d.sp_return))
            .y(d => y(d.vix))
            .size([iw, ih])
            .bandwidth(16)
            .thresholds(7)(rows);

        contours.forEach(c => paths.push({ cond, c }));
    });

    const maxVal = d3.max(paths, p => p.c.value) || 1;

    const sel = densityG.selectAll("path").data(paths);
    sel.exit().remove();

    sel.enter().append("path").merge(sel)
        .attr("d", p => d3.geoPath()(p.c))
        .attr("fill", "none")
        .attr("stroke", p => cfg.conditionColor[p.cond])
        .attr("stroke-width", 1.1)
        .attr("stroke-opacity", p => 0.25 + 0.6 * (p.c.value / maxVal));
}

// Clickable quadrant labels
const quadrantLabels = g.append("g")
    .attr("class", "quadrant-labels");

quadrantLabels.selectAll("text")
    .data(quadrants)
    .join("text")
    .attr("x", d => (d.x0 + d.x1) / 2)
    .attr("y", d => d.y0 + 16)
    .attr("text-anchor", "middle")
    .attr("class", "quadrant-choice")
    .text(d => d.condition)
    .on("click", (event, d) => {
        selectQuadrant(d.condition);
    });


  // points
  //
  // OVERPLOTTING: 2,459 days crowd into the region around (0%, 15), so at
  // r=2.2 / opacity=0.55 the middle of the cloud saturated to solid colour and
  // hid its own shape. Smaller and fainter lets overlap accumulate, so density
  // reads as darkness instead of as one flat blob.
  const R_BASE = 1.6, R_ON = 2.2, R_OFF = 1.4;
  const OP_BASE = 0.28, OP_ON = 0.6, OP_OFF = 0.04;

  const points = g.selectAll("circle")
      .data(panel)
      .join("circle")

      .attr("cx", (d) => x(d.sp_return)).attr("cy", (d) => y(d.vix)).attr("r", R_BASE)
      .attr("fill", (d) => cfg.conditionColor[d.condition]).attr("opacity", OP_BASE)
      // A dot click marks the DAY only. It used to also toggle the quadrant's
      // condition, which meant clicking a second dot in the same quadrant
      // silently cleared the condition filter — it read as a bug.
      .on("click", (event, d) => {
        WB.setDate(d.date);
      })
      .on("mouseover", (event, d) => WB.showTip(
          `<b>${d3.timeFormat("%Y-%m-%d")(d.date)}</b><br>ret ${d.sp_return.toFixed(2)}% · VIX ${d.vix.toFixed(1)}<br>${d.condition}`,
          event))
      .on("mousemove", (event) => WB.tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip);



function updateSelection() {
    if (explaining) return;
    const { conditions, dateRange } = state.filters;

    const noFilters =
        conditions.size === 0 && !dateRange;

    points
        .transition("sel")
        .duration(250)
        .attr("opacity", d => {
            if (noFilters) return OP_BASE;

            const conditionOK = WB.matchesCondition(d.condition);

            const dateOK =
                !dateRange ||
                (d.date >= dateRange[0] &&
                 d.date <= dateRange[1]);

            return conditionOK && dateOK ? OP_ON : OP_OFF;
        })
        .attr("r", d => {
            if (noFilters) return R_BASE;

            return WB.matchesCondition(d.condition) ? R_ON : R_OFF;
        });

    quadrantLabels.selectAll("text")
        .classed("selected", d => WB.conditionPicked(d.condition));
}

// ============================================================
// STAGED EXPLAINER
//
// View 2 shows a DEFINITION, not a finding: every dot's colour is fully
// determined by which side of the two lines it falls on. So the animation
// introduces one rule at a time -- strip the colour, add the volatility cut,
// add the direction cut, pull the four groups apart so the categories are
// countable, then settle back to the true positions.
// ============================================================

const EXPLODE = 26;
const explodeOffset = {
    "Calm-Up":       [ EXPLODE,  EXPLODE],
    "Calm-Down":     [-EXPLODE,  EXPLODE],
    "Volatile-Up":   [ EXPLODE, -EXPLODE],
    "Volatile-Down": [-EXPLODE, -EXPLODE]
};

let explaining = false;

explainBtn.on("click", function () {
    if (explaining) return;
    explaining = true;
    explainBtn.attr("disabled", true).text("● Explaining…");

    // the contours describe the TRUE positions, so they would be wrong while
    // the four groups are pulled apart
    densityG.style("opacity", 0);

    const T = WB.dur(cfg.anim.stepDuration);

    // stage 0 — forget the classification
    vixLine.transition().duration(300).style("opacity", 0);
    vixLabel.transition().duration(300).style("opacity", 0);
    zeroLine.transition().duration(300).style("opacity", 0);
    quadrantLabels.selectAll("text").transition().duration(300).style("opacity", 0);
    points.transition("explain").duration(300)
        .attr("cx", d => x(d.sp_return)).attr("cy", d => y(d.vix))
        .attr("fill", "#9aa5b1").attr("opacity", 0.45);

    // stage 1 — the volatility cut
    d3.timeout(() => {
        vixLine.transition().duration(400).style("opacity", 1);
        vixLabel.transition().duration(400).style("opacity", 1);
        points.transition("explain").duration(T * 0.7)
            .attr("fill", d => (d.vix <= meta.vixCut ? "#9fd3b0" : "#2f6d49"));
    }, 400);

    // stage 2 — the direction cut
    d3.timeout(() => {
        zeroLine.transition().duration(400).style("opacity", 1);
        points.transition("explain").duration(T * 0.7)
            .attr("fill", d => cfg.conditionColor[d.condition]);
    }, 400 + T);

    // stage 3 — pull the four groups apart
    d3.timeout(() => {
        points.transition("explain").duration(T).ease(d3.easeCubicOut)
            .attr("cx", d => x(d.sp_return) + explodeOffset[d.condition][0])
            .attr("cy", d => y(d.vix) - explodeOffset[d.condition][1]);
        quadrantLabels.selectAll("text")
            .transition().delay(T * 0.5).duration(400).style("opacity", 1);
    }, 400 + T * 2);

    // stage 4 — settle back to the truthful positions
    d3.timeout(() => {
        points.transition("explain").duration(T).ease(d3.easeCubicInOut)
            .attr("cx", d => x(d.sp_return)).attr("cy", d => y(d.vix));
        // NB: a transition's "end" fires once PER ELEMENT (2,459 times here),
        // so the restore is scheduled on a single timeout instead.
        d3.timeout(() => {
            explaining = false;
            explainBtn.attr("disabled", null).text("▶ Explain the four conditions");
            densityG.transition().duration(300).style("opacity", 1);
            updateSelection();
        }, T + 60);
    }, 400 + T * 3.6);
});

WB.events.on("conditionchange.scatter", updateSelection);
WB.events.on("daterangechange.scatter", updateSelection);
WB.events.on("reset.scatter", updateSelection);

// Everything coloured by condition has to be repainted when the palette
// switches; the scales and positions are untouched.
WB.events.on("palettechange.scatter", function () {
    points.attr("fill", d => cfg.conditionColor[d.condition]);
    quadrantLayer.selectAll("rect").attr("fill", d => cfg.conditionColor[d.condition]);
    drawDensity();
});

};