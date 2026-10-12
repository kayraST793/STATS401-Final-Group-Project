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

function selectQuadrant(condition) {
    const current = WB.state.filters.condition;

    WB.setCondition(
        current === condition ? "All" : condition
    );
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
    .attr("fill-opacity", 0.025)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
        selectQuadrant(d.condition);
    });

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
  const points = g.selectAll("circle")
      .data(panel)
      .join("circle")

      .attr("cx", (d) => x(d.sp_return)).attr("cy", (d) => y(d.vix)).attr("r", 2.2)
      .attr("fill", (d) => cfg.conditionColor[d.condition]).attr("opacity", 0.55)
      .on("click", (event, d) => {
        selectQuadrant(d.condition);
        WB.setDate(d.date);
      })
      .on("mouseover", (event, d) => WB.showTip(
          `<b>${d3.timeFormat("%Y-%m-%d")(d.date)}</b><br>ret ${d.sp_return.toFixed(2)}% · VIX ${d.vix.toFixed(1)}<br>${d.condition}`,
          event))
      .on("mousemove", (event) => WB.tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px"))
      .on("mouseleave", WB.hideTip);



function updateSelection() {
    const { condition, dateRange } = state.filters;

    const noFilters =
        condition === "All" && !dateRange;

    points
        .transition()
        .duration(250)
        .attr("opacity", d => {
            if (noFilters) return 0.55;

            const conditionOK =
                condition === "All" ||
                d.condition === condition;

            const dateOK =
                !dateRange ||
                (d.date >= dateRange[0] &&
                 d.date <= dateRange[1]);

            return conditionOK && dateOK ? 0.75 : 0.05;
        })
        .attr("r", d => {
            if (noFilters) return 2.2;

            return condition === "All" ||
                d.condition === condition ? 2.8 : 2;
        });

    quadrantLabels.selectAll("text")
        .classed("selected", d =>
            d.condition === condition
        );
}

WB.events.on("conditionchange.scatter", updateSelection);
WB.events.on("daterangechange.scatter", updateSelection);
WB.events.on("reset.scatter", updateSelection);

};