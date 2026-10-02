// viz4_network.js — industry correlation network; edges above a threshold, per condition.
WB.drawNetwork = function (state) {
  const { corr, cfg, meta } = state;
  const names = corr.industries;
  const N = names.length;

  let condition = "All"; // "All" or one of conditionOrder
  let threshold = cfg.corrThreshold;

  const conditions = ["All", ...cfg.conditionOrder];

  // controls
  const ctrl = d3.select("#network-controls").attr("class", "controls");
  ctrl.selectAll("*").remove();
  ctrl.append("span").text("Condition:");
  conditions.forEach((c) => {
    ctrl.append("button").text(c).classed("active", c === condition)
        .on("click", function () {
          WB.setCondition(c);
        });
  });
  ctrl.append("span").style("margin-left", "12px").text("|corr| ≥ ");
  const thLabel = ctrl.append("b").text(threshold.toFixed(2));
  ctrl.append("input").attr("type", "range").attr("min", 0).attr("max", 0.95).attr("step", 0.05)
    .attr("value", threshold)
    .on("input", function () {
      threshold = +this.value;
      thLabel.text(threshold.toFixed(2));
      render();
    });

  const box = d3.select("#network");
  const W = 640, H = 480;
  box.selectAll("*").remove();
  const svg = box.append("svg").attr("class", "wb-svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
  const linkG = svg.append("g");
  const nodeG = svg.append("g");
  const color = d3.scaleOrdinal().domain(names).range(cfg.industryPalette);

  const nodes = names.map((n, i) => ({ id: i, name: n }));
  let sim;

  function matrix() {
    return condition === "All" ? corr.All : corr.byCondition[condition];
  }

  function render() {
    const M = matrix();
    const links = [];
    let edgeCount = 0;
    if (M) {
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const c = M[i][j];
          if (c != null && Math.abs(c) >= threshold) {
            links.push({ source: i, target: j, c });
            edgeCount++;
          }
        }
    }

    const lsel = linkG.selectAll("line").data(links, (d) => d.source + "-" + d.target);
    lsel.exit().remove();
    lsel.enter().append("line").attr("class", "net-link").merge(lsel)
      .attr("stroke-width", (d) => 0.5 + Math.abs(d.c) * 4)
      .attr("stroke", (d) => (d.c < 0 ? "#b42318" : "#9aa5b1"))
      .attr("opacity", (d) => 0.25 + Math.abs(d.c) * 0.5);

    if (!nodeG.selectAll("g.node").size()) {
      const gN = nodeG.selectAll("g.node").data(nodes).join("g").attr("class", "node");
      gN.append("circle")
          .attr("class", "net-node")
          .attr("r", 11)
          .attr("fill", (d) => color(d.name))
          .style("cursor", "pointer")
          .on("click", function (event, d) {
            event.stopPropagation();
            WB.toggleIndustry(d.name);
          });
      gN.append("text").attr("class", "net-label").attr("x", 14).attr("dy", "0.32em").text((d) => d.name);
      gN.call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    }

    sim = sim || d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(28))
      .on("tick", ticked);
    sim.force("link", d3.forceLink(links).id((d) => d.id).distance(90).strength((d) => Math.abs(d.c)));
    sim.alpha(0.6).restart();

    d3.select("#network-controls .edge-count").remove();
    d3.select("#network-controls").append("span").attr("class", "edge-count")
      .style("margin-left", "10px").text(`${edgeCount} edges`);

    function ticked() {
      linkG.selectAll("line")
        .attr("x1", (d) => nodes[d.source.id ?? d.source].x)
        .attr("y1", (d) => nodes[d.source.id ?? d.source].y)
        .attr("x2", (d) => nodes[d.target.id ?? d.target].x)
        .attr("y2", (d) => nodes[d.target.id ?? d.target].y);
      nodeG.selectAll("g.node").attr("transform", (d) => `translate(${d.x},${d.y})`);
    }
  }

  WB.events.on("conditionchange.network", function (c) {
    condition = c;

    ctrl.selectAll("button")
        .classed("active", function () {
          return d3.select(this).text() === c;
        });
    render();
  });

  WB.events.on("reset.network", function () {
    condition = "All";
    ctrl.selectAll("button")
        .classed("active", function () {
          return d3.select(this).text() === "All";
        });
    render();
  });

  WB.events.on("industrychange.network", function (selected) {
    nodeG.selectAll(".net-node")
        .attr("stroke", d =>
            selected.has(d.name) ? "#111" : "#fff"
        )
        .attr("stroke-width", d =>
            selected.has(d.name) ? 4 : 1.5
        )
        .attr("opacity", d =>
            selected.size === 0 || selected.has(d.name)
                ? 1
                : 0.25
        );

    nodeG.selectAll(".net-label")
        .attr("opacity", d =>
            selected.size === 0 || selected.has(d.name)
                ? 1
                : 0.25
        );
  });

  render();
};