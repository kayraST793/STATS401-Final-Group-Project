// main.js — loads all data, wires shared state, renders legend/meta, dispatches views.
(function () {
  const cfg = WB.config;

  function showError(msg) {
    const el = document.getElementById("error");
    el.style.display = "block";
    el.innerHTML = msg;
  }

  const num = (v) => (v === "" || v == null ? null : +v);

  Promise.all([
    d3.json(cfg.files.meta),
    d3.csv(cfg.files.panel, (d) => ({
      date: new Date(d.date),
      sp500: +d.sp500,
      sp_return: +d.sp_return,
      vix: +d.vix,
      trend: +d.trend,
      condition: d.condition,
    })),
    d3.json(cfg.files.agg),
    d3.json(cfg.files.corr),
    d3.csv(cfg.files.industryDaily, (d) => ({
      date: new Date(d.date),
      condition: d.condition,
      code: d.industry, // long-file 'industry' column holds the code
      ret: num(d.ret),
    })),
  ])
    .then(([meta, panel, agg, corr, industryDaily]) => {
      const state = {
        cfg,
        meta,
        panel,
        agg,
        corr,
        industryDaily,

        // Shared state used by ALL five visualizations
            filters: {
          condition: "All",
              dateRange: null,
              selectedDate: null,
              industries: new Set(),
            },
      };

      WB.state = state;

      renderConditionLegend(state);
      renderMeta(state);
      setupMarketInsights(state);

      // dispatch each view, guarding so one failure doesn't kill the rest
      const views = [
        ["drawTimeline", "#timeline"],
        ["drawScatter", "#scatter"],
        ["drawHeatmap", "#heatmap"],
        ["drawNetwork", "#network"],
        ["drawComparison", "#comparison"],
      ];
      views.forEach(([fn, sel]) => {
        try {
          WB[fn] && WB[fn](state);
        } catch (e) {
          console.error(fn, e);
          d3.select(sel).append("p").attr("class", "caveat").text(`(${fn} error: ${e.message})`);
        }
      });

      setupDashboardUI();

    })
    .catch((err) => {
      console.error(err);
      showError(
        "Could not load data files. Serve this folder over HTTP " +
          "(e.g. <code>python -m http.server</code>) — browsers block <code>file://</code> fetches.<br>" +
          `<small>${err.message}</small>`
      );
    });

  function renderConditionLegend(state) {
    const box = d3.select("#condition-legend");
    state.cfg.conditionOrder.forEach((c) => {
      const item = box.append("div").attr("class", "item");
      item.append("span").attr("class", "swatch").style("background", state.cfg.conditionColor[c]);
      item.append("span").text(c.replace("-", " · "));
    });
  }

  function renderMeta(state) {
    const m = state.meta;
    const dl = d3.select("#meta-panel").append("dl");
    const row = (k, v) => {
      dl.append("dt").text(k);
      dl.append("dd").html(v);
    };
    row("Window (panel)", `${m.panelStart} → ${m.panelEnd}`);
    row("Trading days", m.panelRows.toLocaleString());
    row("VIX cut (median)", m.vixCut);
    row("Return units", m.config.units + " (" + m.config.return_mode + ")");
    row(
      "Condition counts",
      state.cfg.conditionOrder.map((c) => `${c}: <b>${m.conditionCounts[c]}</b>`).join(" &nbsp; ")
    );
    row(
      "Sources",
      "S&P 500 (FRED), VIX (FRED), 12 Industry Portfolios — value-weighted " +
        "(Kenneth R. French Data Library)"
    );
  }


  // ============================================================
  // MARKET SUMMARY + DYNAMIC EXPLANATION
  // ============================================================

  function setupMarketInsights(state) {
      const dashboard = document.getElementById("dashboard-grid");

      if (!dashboard || document.getElementById("market-insights")) {
          return;
      }

      // Create the panels automatically above the visualizations
      const section = document.createElement("section");
      section.id = "market-insights";
      section.className = "market-insights";

      section.innerHTML = `
      <div class="insights-stats" aria-label="Selected market summary">

        <div class="insight-stat">
          <span>Market trend</span>
          <strong id="insight-trend">—</strong>
          <small id="insight-trend-detail"></small>
        </div>

        <div class="insight-stat">
          <span>Volatility</span>
          <strong id="insight-volatility">—</strong>
          <small id="insight-vix-detail"></small>
        </div>

        <div class="insight-stat">
          <span>Trading days</span>
          <strong id="insight-days">—</strong>
          <small id="insight-days-detail"></small>
        </div>

        <div class="insight-stat">
          <span>Top industry</span>
          <strong id="insight-industry">—</strong>
          <small id="insight-industry-detail"></small>
        </div>

      </div>

      <div class="insight-explanation" aria-live="polite">
        <div class="insight-explanation-heading">
          Understanding market conditions
          <span id="insight-condition" class="insight-pill">
            All conditions
          </span>
        </div>

        <p id="insight-description"></p>
        <small id="insight-context"></small>
      </div>
    `;

      dashboard.parentNode.insertBefore(section, dashboard);

      // Explanations for each market condition
      const descriptions = {
      "All":
        "The dashboard groups trading days using the direction of the S&P 500 daily return and whether VIX is above or below its median. Choose a condition in the heatmap or network to explore a specific market environment.",

      "Calm-Up":
        "The S&P 500 increased while VIX was relatively low. This is a rising market day with lower expected volatility.",

      "Calm-Down":
        "The S&P 500 declined while VIX was relatively low. Prices fell despite comparatively calm expectations.",

      "Volatile-Up":
        "The S&P 500 increased while VIX was relatively high. Prices rose even though expected volatility was elevated.",

      "Volatile-Down":
        "The S&P 500 declined while VIX was relatively high. Falling prices coincided with elevated expected volatility."

      };

      const put = (id, value) => {
          document.getElementById(id).textContent = value;
      };

      const dateFormat = d3.timeFormat("%b %d, %Y");
      const names = state.meta.industryNames || {};
      const cut = +state.meta.vixCut;

      // Recalculate the summary using current filters
      function update() {
          const {
              condition,
              dateRange,
              industries
          } = state.filters;

          const inRange = d =>
              !dateRange ||
              (d.date >= dateRange[0] && d.date <= dateRange[1]);

          const matches = d =>
              inRange(d) &&
              (condition === "All" || d.condition === condition);

          const days = state.panel.filter(matches);

          const meanReturn = d3.mean(days, d => d.sp_return);
          const meanVix = d3.mean(days, d => d.vix);

          const sign = v => v > 0 ? "+" : "";


          // 1. MARKET TREND
          put(
              "insight-trend",
              days.length
                  ? meanReturn > 0
                      ? "Rising"
                      : meanReturn < 0
                          ? "Falling"
                          : "Flat"
                  : "No data"
          );

          put(
              "insight-trend-detail",
              days.length
                  ? `${sign(meanReturn)}${meanReturn.toFixed(2)}% avg daily S&P return`
                  : "No matching trading days"
          );

          // 2. VOLATILITY
          put(
              "insight-volatility",
              days.length
                  ? meanVix > cut ? "Elevated" : "Calm"
                  : "No data"
          );

          put(
              "insight-vix-detail",
              days.length
                  ? `Avg VIX ${meanVix.toFixed(1)} · median cutoff ${cut.toFixed(2)}`
                  : "No matching VIX data"
          );

          // 3. TRADING DAYS
          put("insight-days", days.length.toLocaleString());

          put(
              "insight-days-detail",
              "Days matching date and condition filters"
          );

          // 4. TOP-PERFORMING INDUSTRY
          const grouped = d3.group(
              state.industryDaily
                  .filter(matches)
                  .filter(d => d.ret != null && Number.isFinite(d.ret)),
                  d => d.code
          );

          let leaders = Array.from(
              grouped,
              ([code, rows]) => ({
                  code,
                  mean: d3.mean(rows, d => d.ret)
              })
          );

          // Industry selections affect only the industry ranking
          if (industries.size) {
              leaders = leaders.filter(
                  d =>
                      industries.has(d.code) ||
                      industries.has(names[d.code])
              );
          }

          leaders.sort((a, b) => b.mean - a.mean);

          const leader = leaders[0];

          put(
              "insight-industry",
              leader ? (names[leader.code] || leader.code) : "No data"
          );

          put(
              "insight-industry-detail",
              leader
                  ? `${sign(leader.mean)}${leader.mean.toFixed(2)}% avg daily return${industries.size ? " · selected industries" : ""}`
                  : "No matching industry returns"
          );

          // 5. DYNAMIC EXPLANATION
          put(
              "insight-condition",
              condition === "All" ? "All conditions" : condition
          );

          put(
              "insight-description",
              descriptions[condition] || descriptions.All
          );

          put(
              "insight-context",
              `${dateRange 
                  ? `${dateFormat(dateRange[0])} – ${dateFormat(dateRange[1])}` 
                  : "Full available date range"
              } · VIX cutoff ${cut.toFixed(2)} · VIX measures expected volatility, not realized daily price changes.`
          );
      }

      // Listen to existing shared dashboard events
      WB.events.on("conditionchange.insights", update);
      WB.events.on("daterangechange.insights", update);
      WB.events.on("industrychange.insights", update);
      WB.events.on("reset.insights", update);

      // Initial display
      update();
  }


  function setupDashboardUI() {
    const dashboard = document.getElementById("dashboard-grid");

    if (!dashboard) return;

    const cards = Array.from(
        dashboard.querySelectorAll(".viz-card")
    );

    function clearFocus() {
      dashboard.classList.remove("has-focus");

      cards.forEach(card => {
        card.classList.remove("is-focused");
        card.classList.remove("is-mini");

        card.style.gridColumn = "";
        card.style.gridRow = "";
      });
    }

    function focusCard(card) {
        const alreadyFocused =
            card.classList.contains("is-focused");

        clearFocus();

        if (alreadyFocused) {
            return;
        }

        dashboard.classList.add("has-focus");
        card.classList.add("is-focused");

        cards.forEach(otherCard => {
          if (otherCard !== card) {
            otherCard.classList.add("is-mini");
          }
        });

        /*
         Move the focused chart into view without an abrupt jump.
        */
        card.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    cards.forEach(card => {
        const button = card.querySelector(".focus-btn");

        if (!button) return;

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            focusCard(card);
        });
    });

    /*
     Reset only resets filters.
     It does not leave focus mode, which avoids surprising the user.
    */
    const resetButton =
        document.getElementById("reset-dashboard");

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            WB.resetDashboard();
        });
    }

    /*
     Escape is a convenient way to leave focus mode.
    */
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            clearFocus();
        }
    });
}

// ============================================================
// SHARED DASHBOARD EVENTS
// ============================================================

  WB.events = d3.dispatch(
      "conditionchange",
      "daterangechange",
      "datechange",
      "industrychange",
      "reset"
  );

  WB.setCondition = function (condition) {
    WB.state.filters.condition = condition;
    WB.events.call("conditionchange", null, condition);
  };

  WB.setDateRange = function (range) {
    WB.state.filters.dateRange = range;
    WB.events.call("daterangechange", null, range);
  };

  WB.setDate = function (date) {
    WB.state.filters.selectedDate = date;
    WB.events.call("datechange", null, date);
  };

  WB.toggleIndustry = function (industry) {
    const selected = WB.state.filters.industries;

    if (selected.has(industry)) {
      selected.delete(industry);
    } else {
      selected.add(industry);
    }
    WB.events.call("industrychange", null, new Set(selected));
  };

  WB.resetDashboard = function () {
    WB.state.filters.condition = "All";
    WB.state.filters.dateRange = null;
    WB.state.filters.selectedDate = null;
    WB.state.filters.industries.clear();

    WB.events.call("reset");
  };

  // small shared helpers on WB for the viz files
  WB.tooltip = d3.select("#tooltip");
  WB.showTip = function (html, event) {
    WB.tooltip.style("opacity", 1).html(html)
      .style("left", event.pageX + 14 + "px")
      .style("top", event.pageY - 10 + "px");
  };
  WB.hideTip = function () {
    WB.tooltip.style("opacity", 0);
  };
})();