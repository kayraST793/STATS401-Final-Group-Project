// main.js — loads all data, wires shared state, renders legend/meta, dispatches views.
(function () {
  const cfg = WB.config;

  // Build stamp. index.html checks this against its own copy and shows a loud
  // banner if they disagree, because the failure mode for mixed files is
  // miserable to debug: the view scripts throw "WB.events is undefined" and
  // the focus layout and the filter dock silently do nothing, which looks
  // like three unrelated bugs rather than one stale file.
  WB.BUILD = "2026-10-15e";

  function showError(msg) {
    const el = document.getElementById("error");
    el.style.display = "block";
    el.innerHTML = msg;
  }

  const num = (v) => (v === "" || v == null ? null : +v);

  // The standalone single-file build inlines the data as window.__WB_INLINE so
  // it needs no fetches and runs straight off a file:// path. The normal
  // multi-file build falls through to the usual d3.csv / d3.json loads.
  function fromInline(inl) {
    const panel = inl.panel.map((r) => ({
      date: new Date(r[0]), sp500: r[1], sp_return: r[2],
      vix: r[3], trend: r[4], condition: r[5],
    }));
    const industryDaily = [];
    inl.daily.forEach((row) => {
      const dt = new Date(row[0]);
      row[2].forEach((v, i) => {
        industryDaily.push({ date: dt, condition: row[1], code: inl.codes[i], ret: v });
      });
    });
    return [inl.meta, panel, inl.agg, inl.corr, industryDaily];
  }

  const loader = window.__WB_INLINE
    ? Promise.resolve(fromInline(window.__WB_INLINE))
    : Promise.all([
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
  ]);

  loader
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
          // MULTI-SELECT. `conditions` is the source of truth; an empty set
          // means "all four". `condition` is kept in sync as a single string
          // ("All" unless exactly one is chosen) purely so older call sites
          // that read it keep working — anything deciding what to SHOW should
          // use WB.matchesCondition() / WB.activeConditions() instead.
          conditions: new Set(),
          condition: "All",
              dateRange: null,
              selectedDate: null,
              industries: new Set(),
            },
      };

      WB.state = state;

      // ----------------------------------------------------------------
      // Pivot the long industry file into one row per date holding a
      // 12-vector of returns. The chord recomputes a 12x12 correlation
      // matrix on every brush and every animation step, so doing it from a
      // pre-pivoted array keeps that to a cheap pass instead of a regroup.
      // ----------------------------------------------------------------
      state.codes = Object.keys(meta.industryNames);
      const idx = new Map(state.codes.map((c, i) => [c, i]));
      const byDateMap = new Map();
      industryDaily.forEach((r) => {
        const key = +r.date;
        let rec = byDateMap.get(key);
        if (!rec) {
          rec = { date: r.date, condition: r.condition,
                  vals: new Array(state.codes.length).fill(null) };
          byDateMap.set(key, rec);
        }
        const i = idx.get(r.code);
        if (i != null) rec.vals[i] = r.ret;
      });
      state.byDate = [...byDateMap.values()].sort((a, b) => a.date - b.date);

      // ----------------------------------------------------------------
      // EXCESS RETURN — industry return minus the S&P's return that day.
      //
      // Done here, as a join against the panel, rather than in build_data.py:
      // both files are already in memory and the join is exact (every one of
      // the 29,508 industry rows finds its trading day), so the data folder
      // never has to be rebuilt or re-shipped to get this metric.
      //
      // This matters because the four conditions are DEFINED by the market's
      // direction. Raw average return therefore mostly restates the
      // definition. Excess return is the actual finding: on Volatile-Down
      // days Utilities beats the market by +0.50%/day while Consumer
      // Durables trails it by -0.61%, and the ranking inverts in the Up
      // columns.
      // ----------------------------------------------------------------
      const spByDate = new Map(panel.map((p) => [+p.date, p.sp_return]));
      industryDaily.forEach((r) => {
        const s = spByDate.get(+r.date);
        r.excess = (r.ret == null || s == null) ? null : r.ret - s;
      });

      WB.normalizeIndustry = function (value) {
          const names = state.meta.industryNames || {};

          if (Object.prototype.hasOwnProperty.call(names, value)) {
              return value;
          }

          return Object.keys(names).find(
              code => names[code] === value
          ) || value;
      };

      renderConditionLegend(state);
      renderMeta(state);
      setupMarketInsights(state);

      // dispatch each view, guarding so one failure doesn't kill the rest
      const views = [
        ["drawTimeline", "#timeline"],
        ["drawScatter", "#scatter"],
        ["drawHeatmap", "#heatmap"],
        ["drawChord", "#chord"],
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
      setupFilterDock(state);

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
    box.selectAll("*").remove();
    state.cfg.conditionOrder.forEach((c) => {
      const item = box.append("div").attr("class", "item cond-pick")
        .attr("role", "button").attr("tabindex", 0).attr("data-cond", c)
        .on("click", () => WB.toggleCondition(c));
      item.append("span").attr("class", "swatch").style("background", state.cfg.conditionColor[c]);
      item.append("span").text(c.replace("-", " · "));
    });

    // repaint the swatches when the palette is switched
    WB.events.on("palettechange.legend", function () {
      box.selectAll(".cond-pick").select(".swatch")
        .style("background", function () {
          return state.cfg.conditionColor[this.parentNode.dataset.cond];
        });
    });

    function fade() {
      const any = WB.state.filters.conditions.size > 0;
      box.selectAll(".cond-pick")
        .classed("dim", function () { return any && !WB.conditionPicked(this.dataset.cond); })
        .classed("on", function () { return WB.conditionPicked(this.dataset.cond); });
    }
    WB.events.on("conditionchange.legend", fade);
    WB.events.on("reset.legend", fade);
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

          // membership, not equality — several conditions can be active
          const matches = d =>
              inRange(d) && WB.matchesCondition(d.condition);

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
          const picks = [...state.filters.conditions];

          put(
              "insight-condition",
              picks.length === 0 ? "All conditions"
                : picks.length === 1 ? picks[0]
                : `${picks.length} conditions compared`
          );

          put(
              "insight-description",
              picks.length === 1
                ? descriptions[picks[0]]
                : picks.length > 1
                  ? "Comparing " + picks.join(", ") + ". " +
                    "View 4 has split into one ring per condition so the differences " +
                    "can be read side by side instead of from memory. The summary " +
                    "figures above pool all the selected days together."
                  : descriptions.All
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


  // ============================================================
  // STICKY FILTER DOCK
  //
  // One bar pinned below the nav carrying every global filter AND a plain
  // read-out of its current state, so the user never has to scroll back to
  // view 1 to find out what they are looking at. When nothing is chosen the
  // read-out says so explicitly ("Showing all times") rather than going blank.
  // ============================================================

  function setupFilterDock(state) {
    const grid = document.getElementById("dashboard-grid");
    if (!grid || document.getElementById("filter-dock")) return;

    const dock = document.createElement("div");
    dock.id = "filter-dock";
    dock.className = "filter-dock";

    const condButtons = ['All', ...cfg.conditionOrder].map((c) => {
      const sw = c === "All" ? "" :
        `<span class="swatch" style="background:${cfg.conditionColor[c]}"></span>`;
      return `<button type="button" class="dock-chip cond-chip" data-cond="${c}">${sw}${c === "All" ? "All" : c.replace("-", " · ")}</button>`;
    }).join("");

    const indButtons = ['All', ...state.codes].map((code) => {
      if (code === "All") return '<button type="button" class="dock-chip ind-chip" data-code="All">All</button>';
      const dot = `<span class="dot" style="background:${d3.scaleOrdinal().domain(state.codes).range(cfg.industryPalette)(code)}"></span>`;
      return `<button type="button" class="dock-chip ind-chip" data-code="${code}">${dot}${state.meta.industryNames[code]}</button>`;
    }).join("");

    const speedButtons = cfg.speeds.map((sp) =>
      `<button type="button" class="dock-chip spd-btn${sp.value === WB.speed ? " on" : ""}" data-speed="${sp.value}">${sp.label}</button>`
    ).join("");

    dock.innerHTML = `
      <div class="dock-row">
        <span class="dock-label">Time</span>
        <span class="dock-readout" id="dock-time">Showing all times</span>
        <button type="button" class="dock-clear" id="dock-clear-time" hidden>Clear</button>

        <span class="dock-sep"></span>

        <span class="dock-label">Day</span>
        <span class="dock-readout" id="dock-day">No day picked</span>
        <button type="button" class="dock-clear" id="dock-clear-day" hidden>Clear</button>

        <button type="button" class="dock-reset" id="dock-reset" hidden>Clear all filters</button>
      </div>

      <div class="dock-row">
        <span class="dock-label">Conditions</span>
        <span class="dock-chips">${condButtons}</span>
        <span class="dock-readout" id="dock-condition">Showing all conditions</span>
      </div>

      <div class="dock-row">
        <span class="dock-label">Industries</span>
        <span class="dock-chips">${indButtons}</span>
        <span class="dock-readout" id="dock-industries">Showing all industries</span>
      </div>

      <div class="dock-row dock-row--minor">
        <span class="dock-label">Animation speed</span>
        <span class="dock-chips">${speedButtons}</span>

        <span class="dock-sep"></span>

        <span class="dock-label">Colours</span>
        <span class="dock-chips">
          <button type="button" class="dock-chip pal-btn${WB.palette === "standard" ? " on" : ""}" data-pal="standard">Red · green</button>
          <button type="button" class="dock-chip pal-btn${WB.palette === "safe" ? " on" : ""}" data-pal="safe">Orange · blue</button>
        </span>
        <span class="dock-readout" id="dock-palette">Red–green can be hard to separate; orange–blue is colour-vision safe.</span>
      </div>
    `;

    grid.parentNode.insertBefore(dock, grid);

    // ---- wiring
    // multi-select: each chip adds or removes one condition, "All" clears
    dock.querySelectorAll(".cond-chip").forEach((b) => {
      b.addEventListener("click", () => WB.toggleCondition(b.dataset.cond));
    });

    dock.querySelectorAll(".ind-chip").forEach((b) => {
      b.addEventListener("click", () => {
        const code = b.dataset.code;
        if (code === "All") {
          if (state.filters.industries.size === 0) return;
          state.filters.industries.clear();
          WB.events.call("industrychange", null, new Set());
          return;
        }
        WB.toggleIndustry(code);
      });
    });

    dock.querySelectorAll(".spd-btn").forEach((b) => {
      b.addEventListener("click", () => {
        WB.speed = +b.dataset.speed;
        dock.querySelectorAll(".spd-btn").forEach((o) => o.classList.remove("on"));
        b.classList.add("on");
      });
    });

    dock.querySelectorAll(".pal-btn").forEach((b) => {
      b.addEventListener("click", () => {
        WB.setPalette(b.dataset.pal);
        dock.querySelectorAll(".pal-btn").forEach((o) => o.classList.remove("on"));
        b.classList.add("on");
      });
    });

    // the condition chips carry swatches of their own
    WB.events.on("palettechange.dock", function () {
      dock.querySelectorAll(".cond-chip").forEach((b) => {
        const sw = b.querySelector(".swatch");
        if (sw) sw.style.background = cfg.conditionColor[b.dataset.cond];
      });
    });

    dock.querySelector("#dock-clear-time")
      .addEventListener("click", () => WB.setDateRange(null));
    dock.querySelector("#dock-clear-day")
      .addEventListener("click", () => WB.setDate(null));
    dock.querySelector("#dock-reset")
      .addEventListener("click", () => WB.resetDashboard());

    // ---- read-out
    const fmt = d3.timeFormat("%b %d, %Y");
    const fmtShort = d3.timeFormat("%b %Y");

    function update() {
      const f = state.filters;

      // time
      const timeEl = dock.querySelector("#dock-time");
      if (f.dateRange) {
        const days = state.panel.filter(
          (d) => d.date >= f.dateRange[0] && d.date <= f.dateRange[1]).length;
        timeEl.textContent =
          `${fmtShort(f.dateRange[0])} – ${fmtShort(f.dateRange[1])} · ${days.toLocaleString()} trading days`;
        timeEl.classList.add("is-set");
      } else {
        timeEl.textContent = "Showing all times";
        timeEl.classList.remove("is-set");
      }
      dock.querySelector("#dock-clear-time").hidden = !f.dateRange;

      // selected day
      const dayEl = dock.querySelector("#dock-day");
      if (f.selectedDate) {
        dayEl.textContent = fmt(f.selectedDate);
        dayEl.classList.add("is-set");
      } else {
        dayEl.textContent = "No day picked";
        dayEl.classList.remove("is-set");
      }
      dock.querySelector("#dock-clear-day").hidden = !f.selectedDate;

      // condition (multi-select)
      const condEl = dock.querySelector("#dock-condition");
      const picks = WB.activeConditions().filter((c) => f.conditions.has(c));

      if (picks.length === 0) {
        condEl.textContent = "Showing all conditions — pick two or more to compare them side by side in view 4";
        condEl.classList.remove("is-set");
      } else if (picks.length === 1) {
        condEl.textContent = `Showing ${picks[0]} only`;
        condEl.classList.add("is-set");
      } else {
        condEl.textContent =
          `Comparing ${picks.join(" + ")} — view 4 splits into ${picks.length} panels`;
        condEl.classList.add("is-set");
      }

      dock.querySelectorAll(".cond-chip").forEach((b) => {
        const c = b.dataset.cond;
        b.classList.toggle("on",
          c === "All" ? f.conditions.size === 0 : f.conditions.has(c));
      });

      // industries
      const indEl = dock.querySelector("#dock-industries");
      const picked = [...f.industries].map((c) => state.meta.industryNames[c] || c);
      if (picked.length === 0) {
        indEl.textContent = "Showing all industries";
        indEl.classList.remove("is-set");
      } else {
        indEl.textContent = picked.length <= 3
          ? `Showing ${picked.join(", ")}`
          : `Showing ${picked.length} industries`;
        indEl.classList.add("is-set");
      }
      dock.querySelectorAll(".ind-chip").forEach((b) => {
        const code = b.dataset.code;
        b.classList.toggle("on",
          code === "All" ? f.industries.size === 0 : f.industries.has(code));
      });

      // anything active at all?
      const active = !!(f.dateRange || f.selectedDate ||
        f.conditions.size || f.industries.size);
      dock.classList.toggle("is-filtered", active);
      dock.querySelector("#dock-reset").hidden = !active;
    }

    WB.events.on("conditionchange.dock", update);
    WB.events.on("daterangechange.dock", update);
    WB.events.on("industrychange.dock", update);
    WB.events.on("datechange.dock", update);
    WB.events.on("reset.dock", update);

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

      WB.events.call("layoutchange");
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

        // let the views re-render at their new size
        WB.events.call("layoutchange");

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
      "reset",
      "palettechange",
      "layoutchange"
  );

  // Is this card currently collapsed to a mini? Views use it to drop detail
  // that cannot survive the smaller size — full industry names around the
  // chord ring, for instance, which would overrun the SVG at mini width.
  WB.isMini = function (cardId) {
    const el = document.getElementById(cardId);
    return !!el && el.classList.contains("is-mini");
  };

  // ============================================================
  // COLOUR PALETTE
  //
  // Red vs green carries two of this dashboard's encodings at once — the
  // condition hue (Up/Down) and the heatmap's diverging scale — and is the
  // single most common colour-vision problem. setPalette copies the chosen
  // set INTO cfg.conditionColor rather than replacing the object, so every
  // view keeps reading the same reference and only has to repaint.
  // ============================================================

  WB.palette = cfg.paletteDefault;

  WB.setPalette = function (name) {
    const p = cfg.palettes[name];
    if (!p) return;
    WB.palette = name;
    Object.keys(p.conditionColor).forEach((c) => {
      cfg.conditionColor[c] = p.conditionColor[c];
    });
    WB.events.call("palettechange", null, name);
  };

  // the heatmap's diverging interpolator for the active palette
  WB.heatmapInterpolator = function () {
    return d3.interpolateRgbBasis(cfg.palettes[WB.palette].heatmapRamp);
  };

  // view 1's S&P / VIX line colours for the active palette
  WB.seriesColor = function () {
    return cfg.palettes[WB.palette].seriesColor;
  };

  // ============================================================
  // CONDITION SELECTION (multi-select)
  //
  // Picking two or more conditions is what turns views 4 and 5 into small
  // multiples — one panel per condition, same encoding, different slice of
  // the data. Picking none means "all four", which is also the reset state.
  // ============================================================

  function syncCondition() {
    const s = WB.state.filters.conditions;
    WB.state.filters.condition = s.size === 1 ? [...s][0] : "All";
  }

  // the chosen conditions in canonical order; all four when nothing is chosen
  WB.activeConditions = function () {
    const s = WB.state.filters.conditions;
    return s.size ? cfg.conditionOrder.filter((c) => s.has(c)) : cfg.conditionOrder.slice();
  };

  // does this row's condition survive the current filter?
  WB.matchesCondition = function (c) {
    const s = WB.state.filters.conditions;
    return s.size === 0 || s.has(c);
  };

  // is this condition explicitly picked? (for "selected" styling, which is
  // NOT the same as "visible" — with nothing picked everything is visible
  // but nothing is selected)
  WB.conditionPicked = function (c) {
    return WB.state.filters.conditions.has(c);
  };

  // add/remove one condition — the handler behind every condition click
  WB.toggleCondition = function (condition) {
    const s = WB.state.filters.conditions;
    if (!condition || condition === "All") s.clear();
    else if (s.has(condition)) s.delete(condition);
    else s.add(condition);
    syncCondition();
    WB.events.call("conditionchange", null, WB.state.filters.condition);
  };

  // replace the whole selection with one condition (or clear it with "All")
  WB.setCondition = function (condition) {
    const s = WB.state.filters.conditions;
    s.clear();
    if (condition && condition !== "All") s.add(condition);
    syncCondition();
    WB.events.call("conditionchange", null, WB.state.filters.condition);
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
      const code = WB.normalizeIndustry(industry);
      const selected = WB.state.filters.industries;

      if (selected.has(code)) {
          selected.delete(code);
      } else {
          selected.add(code);
      }

      WB.events.call(
          "industrychange",
          null,
          new Set(selected)
      );
  };

  WB.resetDashboard = function () {
    WB.state.filters.conditions.clear();
    WB.state.filters.condition = "All";
    WB.state.filters.dateRange = null;
    WB.state.filters.selectedDate = null;
    WB.state.filters.industries.clear();

    WB.events.call("reset");
  };

  // ============================================================
  // SHARED COMPUTATION HELPERS
  // ============================================================

  // Daily rows matching the current date range (and optionally a condition).
  WB.rowsInScope = function (condition) {
    const st = WB.state;
    const range = st.filters.dateRange;
    return st.byDate.filter((r) =>
      (!range || (r.date >= range[0] && r.date <= range[1])) &&
      (!condition || condition === "All" || r.condition === condition)
    );
  };

  // 12x12 Pearson correlation matrix over a set of pivoted daily rows.
  WB.corrFor = function (rows) {
    const codes = WB.state.codes, k = codes.length;
    const M = Array.from({ length: k }, () => new Array(k).fill(null));
    if (rows.length < 3) return M;

    const mean = new Array(k).fill(0), cnt = new Array(k).fill(0);
    rows.forEach((r) => {
      for (let i = 0; i < k; i++) {
        const v = r.vals[i];
        if (v != null) { mean[i] += v; cnt[i] += 1; }
      }
    });
    for (let i = 0; i < k; i++) mean[i] = cnt[i] ? mean[i] / cnt[i] : 0;

    for (let i = 0; i < k; i++) {
      M[i][i] = 1;
      for (let j = i + 1; j < k; j++) {
        let sxy = 0, sxx = 0, syy = 0, n = 0;
        for (let t = 0; t < rows.length; t++) {
          const a = rows[t].vals[i], b = rows[t].vals[j];
          if (a == null || b == null) continue;
          const da = a - mean[i], db = b - mean[j];
          sxy += da * db; sxx += da * da; syy += db * db; n++;
        }
        const den = Math.sqrt(sxx * syy);
        const v = n > 2 && den > 0 ? sxy / den : null;
        M[i][j] = v; M[j][i] = v;
      }
    }
    return M;
  };

  // ============================================================
  // PLAYBACK SPEED (shared by every animated view)
  // ============================================================

  WB.speed = cfg.speedDefault;
  WB.dur = function (ms) { return ms / (WB.speed || 1); };

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