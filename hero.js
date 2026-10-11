/* Live panel: one synthetic trading day, an oracle, and two pools (the
   oracle-priced GA at the dial's λ and a CPMM) facing the same arbitrageurs. */
(function () {
  "use strict";
  const canvas = document.getElementById("live-chart");
  const WINDOW = 2400; // 40 minutes on screen
  const N = OD.SEC_PER_DAY + 1;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { regime: "pull", fee: 5, speed: 60, playing: !reduce, dayNo: 1, T: WINDOW, visible: true };
  const ser = {
    gaQ: new Float64Array(N), cpQ: new Float64Array(N),
    gaCum: new Float64Array(N), cpCum: new Float64Array(N),
    gaTr: new Float64Array(N), cpTr: new Float64Array(N),
  };
  let day, orc, ga, cp;

  function newDay() {
    day = OD.makeDay(20230103 + st.dayNo * 7919);
    orc = OD.oraclePath(day, OD.REGIMES[st.regime]);
    recompute();
  }
  function stepTo(t) {
    ser.gaTr[t] = ga.step(day.s[t], orc.pi[t]);
    ser.cpTr[t] = cp.step(day.s[t], orc.pi[t]);
    ser.gaQ[t] = ga.quote;
    ser.cpQ[t] = cp.quote;
    ser.gaCum[t] = ga.lvr;
    ser.cpCum[t] = cp.lvr;
  }
  function recompute() {
    ga = new OD.Pool(App.lam, st.fee * 1e-4);
    cp = new OD.Pool(0, st.fee * 1e-4);
    for (const k in ser) ser[k][0] = 0;
    for (let t = 1; t <= st.T; t++) stepTo(t);
  }

  /* ---------- readouts ---------- */
  const $ = (id) => document.getElementById(id);
  let lastStats = 0;
  function stats(force) {
    const now = performance.now();
    if (!force && now - lastStats < 200) return;
    lastStats = now;
    const yr = (OD.DAYS_PER_YEAR * OD.SEC_PER_DAY) / Math.max(1, st.T);
    const gaB = ga.lvr * yr * 1e4, cpB = cp.lvr * yr * 1e4;
    $("live-lvr-ga").textContent = F.usdPerM(gaB);
    $("live-lvr-ga-sub").textContent = `${F.bps(gaB)} bps a year at λ = ${App.lam.toFixed(2)}`;
    $("live-lvr-cp").textContent = F.usdPerM(cpB);
    $("live-lvr-cp-sub").textContent = `${F.bps(cpB)} bps a year`;
    const dep = OD.depthRatio(App.lam, day.s[st.T] - orc.pi[st.T]);
    $("live-depth").textContent = F.x(dep);
    const teG = Math.sqrt(ga.te2 / Math.max(1, ga.n)) * 1e4, teC = Math.sqrt(cp.te2 / Math.max(1, cp.n)) * 1e4;
    $("live-te").textContent = teG.toFixed(2) + " bps";
    $("live-te-sub").textContent = `CPMM ${teC.toFixed(2)} bps`;
    $("live-trades").textContent = `${ga.trades.toLocaleString("en-US")} / ${cp.trades.toLocaleString("en-US")}`;
    let u = 0;
    for (let t = 1; t <= st.T; t++) u += orc.upd[t];
    $("live-upd").textContent = u.toLocaleString("en-US");
    $("live-clock").textContent = `${OD.clock(st.T)} ET` + (st.dayNo > 1 ? ` · day ${st.dayNo}` : "");
  }

  /* ---------- chart ---------- */
  function minmax(arrs, from, to) {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrs) for (let t = from; t <= to; t++) { const v = a(t); if (v < lo) lo = v; if (v > hi) hi = v; }
    return [lo, hi];
  }
  function paneLabel(ctx, c, text, x, y) {
    Charts.text(ctx, text.toUpperCase(), x, y, c.ink3, { font: `600 10.5px ${c.fontBody}` });
  }
  function draw() {
    if (!day) return;
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(canvas);
    const L = 58, R = 76, top = 16, bottom = 22, gap = 30;
    const avail = h - top - bottom - 2 * gap;
    const p1 = [top, top + avail * 0.36];
    const p2 = [p1[1] + gap, p1[1] + gap + avail * 0.38];
    const p3 = [p2[1] + gap, h - bottom];
    const t1 = Math.max(st.T, WINDOW), t0 = t1 - WINDOW, from = Math.max(1, t0), to = st.T;
    const sx = Charts.lin(t0, t1, L, w - R);
    const n = to - from + 1, xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = sx(from + i);
    const s = day.s, pi = orc.pi;

    // pane 1: prices vs open, percent
    const pct = (v) => v * 100;
    let [lo, hi] = minmax([(t) => s[t], (t) => pi[t], (t) => ser.gaQ[t], (t) => ser.cpQ[t]], from, to);
    let pad = Math.max((hi - lo) * 0.12, 2e-4);
    const sy1 = Charts.lin(pct(lo - pad), pct(hi + pad), p1[1], p1[0]);
    Charts.yAxis(ctx, c, sy1, Charts.ticks(pct(lo - pad), pct(hi + pad), 3), L, w - R, (v) => (v > 0 ? "+" : "") + v.toFixed(2) + "%");
    paneLabel(ctx, c, "Price vs the open", L, p1[0] - 5);
    const series = (f) => { const ys = new Float64Array(n); for (let i = 0; i < n; i++) ys[i] = f(from + i); return ys; };
    Charts.poly(ctx, xs, series((t) => sy1(pct(s[t]))), c.ink, 1.5);
    Charts.poly(ctx, xs, series((t) => sy1(pct(ser.cpQ[t]))), c.cpmm, 1.2, [4, 3]);
    Charts.poly(ctx, xs, series((t) => sy1(pct(ser.gaQ[t]))), c.pool, 1.4);
    Charts.poly(ctx, xs, series((t) => sy1(pct(pi[t]))), c.oracle, 1.8);

    // pane 2: quote minus market, bps, with the no-arbitrage band
    const band = (-Math.log(1 - st.fee * 1e-4) + OD.HALF_SPREAD) * 1e4;
    [lo, hi] = minmax([(t) => (pi[t] - s[t]) * 1e4, (t) => (ser.gaQ[t] - s[t]) * 1e4, (t) => (ser.cpQ[t] - s[t]) * 1e4], from, to);
    const span = Math.max(Math.abs(lo), Math.abs(hi), band * 1.35, 2) * 1.12;
    const sy2 = Charts.lin(-span, span, p2[1], p2[0]);
    ctx.fillStyle = c.band;
    ctx.fillRect(L, sy2(band), w - R - L, sy2(-band) - sy2(band));
    Charts.yAxis(ctx, c, sy2, Charts.ticks(-span, span, 4), L, w - R, (v) => (v > 0 ? "+" : "") + v.toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0));
    paneLabel(ctx, c, "Quote minus market, bps", L, p2[0] - 5);
    Charts.text(ctx, `band ±${band.toFixed(1)}`, w - R + 6, sy2(band) + 4, c.ink3, { font: `10.5px ${c.fontData}` });
    ctx.globalAlpha = 0.75;
    Charts.poly(ctx, xs, series((t) => sy2((pi[t] - s[t]) * 1e4)), c.oracle, 1.1);
    ctx.globalAlpha = 1;
    Charts.poly(ctx, xs, series((t) => sy2((ser.cpQ[t] - s[t]) * 1e4)), c.cpmm, 1.2, [4, 3]);
    Charts.poly(ctx, xs, series((t) => sy2((ser.gaQ[t] - s[t]) * 1e4)), c.pool, 1.6);
    for (let t = from; t <= to; t++) {
      if (ser.cpTr[t] > 0) { ctx.globalAlpha = 0.55; Charts.dot(ctx, sx(t), sy2((ser.cpQ[t] - s[t]) * 1e4), 1.8, c.loss); ctx.globalAlpha = 1; }
      if (ser.gaTr[t] > 0) Charts.dot(ctx, sx(t), sy2((ser.gaQ[t] - s[t]) * 1e4), 2.6, c.loss);
    }

    // pane 3: cumulative LP loss since the open, dollars per $1M
    const usd = (v) => v * 1e6;
    [lo, hi] = minmax([(t) => usd(ser.gaCum[t]), (t) => usd(ser.cpCum[t])], from, to);
    const top3 = Math.max(hi * 1.15, 0.05);
    const bot3 = Math.min(0, lo);
    const sy3 = Charts.lin(bot3, top3, p3[1], p3[0]);
    Charts.yAxis(ctx, c, sy3, Charts.ticks(bot3, top3, 2), L, w - R, (v) => "$" + (v < 10 ? v.toFixed(v < 1 && v ? 2 : 0) : v.toFixed(0)));
    paneLabel(ctx, c, "LP loss to arbitrage since the open, per $1M", L, p3[0] - 5);
    const gaY = series((t) => sy3(usd(ser.gaCum[t])));
    ctx.beginPath();
    ctx.moveTo(xs[0], sy3(0));
    for (let i = 0; i < n; i++) ctx.lineTo(xs[i], gaY[i]);
    ctx.lineTo(xs[n - 1], sy3(0));
    ctx.closePath();
    ctx.fillStyle = c.poolSoft;
    ctx.fill();
    Charts.poly(ctx, xs, series((t) => sy3(usd(ser.cpCum[t]))), c.cpmm, 1.4, [4, 3]);
    Charts.poly(ctx, xs, gaY, c.pool, 2);
    const endG = usd(ser.gaCum[to]), endC = usd(ser.cpCum[to]);
    const fmt$ = (v) => "$" + (v < 100 ? v.toFixed(2) : v.toFixed(0));
    let yG = sy3(endG) + 4, yC = sy3(endC) + 4;
    if (Math.abs(yG - yC) < 12) { if (endG >= endC) yG = yC - 12; else yC = yG - 12; }
    Charts.text(ctx, fmt$(endG), w - R + 6, yG, c.pool, { font: `500 11px ${c.fontData}` });
    Charts.text(ctx, fmt$(endC), w - R + 6, yC, c.cpmm, { font: `11px ${c.fontData}` });

    // time axis: ten-minute marks on the market clock
    const ticks = [];
    for (let t = Math.ceil((t0 + 34200) / 600) * 600 - 34200; t <= t1; t += 600) if (t >= t0) ticks.push(t);
    Charts.xAxis(ctx, c, sx, ticks, p1[0], p3[1], (t) => OD.clock(t).slice(0, 5));
  }
  App.register(canvas, draw);

  /* ---------- loop ---------- */
  let last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    if (!st.playing || !st.visible) return;
    acc += dt * st.speed;
    let moved = false;
    while (acc >= 1) {
      acc -= 1;
      if (st.T >= N - 1) {
        st.dayNo++;
        st.T = WINDOW;
        newDay();
      } else {
        st.T++;
        stepTo(st.T);
      }
      moved = true;
    }
    if (moved) { draw(); stats(); }
  }

  /* ---------- controls ---------- */
  function seg(id, key, onChange) {
    const el = document.getElementById(id);
    const sync = () => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(st[key]))));
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      st[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      sync();
      onChange();
    });
    sync();
  }
  const refresh = () => { draw(); stats(true); };
  seg("live-regime", "regime", () => { orc = OD.oraclePath(day, OD.REGIMES[st.regime]); recompute(); refresh(); });
  seg("live-fee", "fee", () => { recompute(); refresh(); });
  seg("live-speed", "speed", () => {});
  const play = document.getElementById("live-play");
  const syncPlay = () => { play.textContent = st.playing ? "Pause" : "Play"; play.setAttribute("aria-pressed", String(!st.playing)); };
  play.addEventListener("click", () => { st.playing = !st.playing; syncPlay(); });
  syncPlay();
  if (window.IntersectionObserver) {
    new IntersectionObserver((es) => { st.visible = es[0].isIntersecting; }).observe(canvas);
  }
  App.on(() => { recompute(); refresh(); });

  newDay();
  refresh();
  requestAnimationFrame(frame);
})();
