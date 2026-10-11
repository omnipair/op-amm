/* §4.2 plate: rerun the paper's backtest mechanics on synthetic days across
   a (λ, fee) grid for the L1, L2 and pull oracle regimes. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const lvrC = $("bt-lvr"), frC = $("bt-frontier"), btn = $("bt-run"), status = $("bt-status"), bar = $("bt-progress");
  const FEES = [0, 1, 2, 5, 10, 20, 50];
  const LAMS = [];
  for (let i = 0; i <= 19; i++) LAMS.push(+(i * 0.05).toFixed(2));
  LAMS.push(0.84, 0.97, 0.99);
  LAMS.sort((a, b) => a - b);
  const REG = ["l1", "l2", "pull"];
  const FLOOR = 1e-4;
  const st = { fee: 5, res: null, running: false, batch: 0 };
  const fmtLog = (v) => (v === FLOOR ? "≤" : "") + (v >= 1 ? v.toFixed(0) : String(+v.toPrecision(1)));
  const styleOf = (c, k) => ({ color: k === "l1" ? c.loss : k === "l2" ? c.oracle : c.pool, width: 2, dash: null });

  function run() {
    if (st.running) return;
    st.running = true;
    btn.disabled = true;
    const days = [1, 2, 3].map((i) => OD.makeDay(424242 + st.batch * 101 + i));
    st.batch++;
    const oracles = {};
    REG.forEach((k) => (oracles[k] = days.map((d) => OD.oraclePath(d, OD.REGIMES[k]))));
    const jobs = [];
    REG.forEach((k) => FEES.forEach((f) => LAMS.forEach((l) => jobs.push({ k, f, l }))));
    const res = { l1: [], l2: [], pull: [] };
    let i = 0;
    const chunk = () => {
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 14) {
        const j = jobs[i++];
        const r = OD.runConfig(days, oracles[j.k], j.l, j.f * 1e-4);
        r.feeBps = j.f;
        res[j.k].push(r);
      }
      bar.style.width = ((i / jobs.length) * 100).toFixed(1) + "%";
      if (i < jobs.length) {
        status.textContent = `Simulating ${i} of ${jobs.length} pool settings…`;
        setTimeout(chunk, 0);
      } else {
        st.res = res;
        st.running = false;
        btn.disabled = false;
        draw();
      }
    };
    chunk();
  }

  function summary() {
    if (!st.res) return;
    const parts = REG.map((k) => {
      const rows = st.res[k].filter((r) => r.feeBps === st.fee);
      let best = rows[0];
      rows.forEach((r) => { if (r.lvrBps < best.lvrBps - 1e-12) best = r; });
      return `${OD.REGIMES[k].label} ${best.lam.toFixed(2)}`;
    });
    status.textContent = `Lowest-loss λ at ${st.fee} bps: ${parts.join(" · ")}. Synthetic run ${st.batch}, 3 days each.`;
  }

  function drawLvr() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(lvrC);
    const L = 52, R = 14, T = 10, B = 34;
    if (!st.res) {
      Charts.text(ctx, "Running…", w / 2, h / 2, c.ink3, { font: `12px ${c.fontBody}`, align: "center" });
      return;
    }
    const rows = {};
    let hi = FLOOR * 10;
    REG.forEach((k) => {
      rows[k] = st.res[k].filter((r) => r.feeBps === st.fee).sort((a, b) => a.lam - b.lam);
      rows[k].forEach((r) => (hi = Math.max(hi, r.lvrBps)));
    });
    const top = Math.pow(10, Math.ceil(Math.log10(hi)));
    const sx = Charts.lin(0, 1, L, w - R - 30), sy = Charts.log(FLOOR, top, h - B, T);
    Charts.yAxis(ctx, c, sy, Charts.logTicks(FLOOR, top), L, w - R, fmtLog);
    Charts.xAxis(ctx, c, sx, [0, 0.25, 0.5, 0.75, 1], T, h - B, (v) => v.toFixed(2));
    Charts.text(ctx, "λ →", w - R, h - 4, c.ink3, { font: `italic 13px ${c.fontMath}`, align: "right" });
    const cp = rows.pull[0].lvrBps;
    ctx.strokeStyle = c.ink3; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(L, sy(Math.max(cp, FLOOR))); ctx.lineTo(w - R, sy(Math.max(cp, FLOOR))); ctx.stroke();
    ctx.setLineDash([]);
    $("bt-cpmm-key").textContent = `CPMM (λ = 0): ${F.bps(cp)} bps a year`;
    ctx.strokeStyle = c.ink3; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(sx(App.lam), T); ctx.lineTo(sx(App.lam), h - B); ctx.stroke();
    ctx.globalAlpha = 1;
    const ends = [];
    REG.forEach((k) => {
      const sty = styleOf(c, k), pts = rows[k];
      Charts.poly(ctx, pts.map((r) => sx(r.lam)), pts.map((r) => sy(Math.max(r.lvrBps, FLOOR))), sty.color, sty.width, sty.dash);
      const last = pts[pts.length - 1];
      ends.push({ k, y: sy(Math.max(last.lvrBps, FLOOR)), color: sty.color });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    ends.forEach((e) => Charts.text(ctx, OD.REGIMES[e.k].label, sx(0.99) + 8, e.y + 4, e.color, { font: `500 11px ${c.fontBody}` }));
  }

  // Lowest annualized LVR reachable within each tracking-error allowance,
  // searching every (λ, fee) setting: the paper's Figure 3(a).
  function drawFrontier() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(frC);
    const L = 52, R = 14, T = 10, B = 34;
    if (!st.res) {
      Charts.text(ctx, "Running…", w / 2, h / 2, c.ink3, { font: `12px ${c.fontBody}`, align: "center" });
      return;
    }
    const fronts = {};
    let hi = FLOOR * 10, teEnd = 0;
    REG.forEach((k) => {
      const rows = st.res[k].slice().sort((a, b) => a.teBps - b.teBps || a.lvrBps - b.lvrBps);
      const pts = [];
      let best = Infinity;
      rows.forEach((r) => {
        if (r.lvrBps < best - 1e-15) {
          best = r.lvrBps;
          pts.push({ te: r.teBps, lvr: Math.max(best, FLOOR) });
        }
      });
      fronts[k] = pts;
      hi = Math.max(hi, pts[0].lvr);
      teEnd = Math.max(teEnd, pts[pts.length - 1].te);
    });
    const right = Math.max(12.5, teEnd * 1.25);
    const top = Math.pow(10, Math.ceil(Math.log10(hi)));
    const sx = Charts.lin(0, right, L, w - R), sy = Charts.log(FLOOR, top, h - B, T);
    Charts.yAxis(ctx, c, sy, Charts.logTicks(FLOOR, top), L, w - R, fmtLog);
    Charts.xAxis(ctx, c, sx, Charts.ticks(0, right, 5), T, h - B, (v) => String(v));
    Charts.text(ctx, "tracking error allowed, bps →", w - R, h - 4, c.ink3, { font: `11px ${c.fontBody}`, align: "right" });
    // the paper's two headline points, for comparison
    ctx.strokeStyle = c.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(sx(11), T); ctx.lineTo(sx(11), h - B); ctx.stroke();
    ctx.setLineDash([]);
    Charts.text(ctx, "paper: L1 leaves the CPMM at 11", sx(11) - 6, T + 12, c.ink3, { font: `10.5px ${c.fontData}`, align: "right" });
    Charts.dot(ctx, sx(7.5), sy(0.001), 4.5, c.plate, c.pool);
    Charts.text(ctx, "paper: pull", sx(7.5) + 9, sy(0.001) + 4, c.pool, { font: `10.5px ${c.fontData}` });
    REG.forEach((k) => {
      const sty = styleOf(c, k), pts = fronts[k], xs = [], ys = [];
      pts.forEach((pt, i) => {
        if (i) { xs.push(sx(pt.te)); ys.push(sy(pts[i - 1].lvr)); }
        xs.push(sx(pt.te)); ys.push(sy(pt.lvr));
      });
      xs.push(w - R); ys.push(sy(pts[pts.length - 1].lvr));
      Charts.poly(ctx, xs, ys, sty.color, sty.width, sty.dash);
      Charts.dot(ctx, xs[0], ys[0], 2.6, sty.color);
    });
  }

  function draw() {
    drawLvr();
    drawFrontier();
    summary();
  }

  const seg = $("bt-fee");
  const sync = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === st.fee)));
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    st.fee = +b.dataset.v;
    sync();
    draw();
  });
  sync();
  btn.addEventListener("click", run);
  App.register(lvrC, drawLvr);
  App.register(frC, drawFrontier);
  App.on(drawLvr);
  run();

  App.setLam(App.lam); // sync every instrument with the dial's starting value
})();
