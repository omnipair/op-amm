/* §3.2.1 plate: front-run the stale curve, let the oracle refresh, back-run
   the refreshed curve. Pool starts at x = y = 1, S = 1, oracle 0 -> Δπ. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const curvesC = $("sw-curves"), profitC = $("sw-profit");
  const jumpIn = $("sw-jump"), feeIn = $("sw-fee"), fIn = $("sw-f"), playBtn = $("sw-play");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { design: "ga", anim: null };

  const jumpOf = (v) => 0.001 * Math.pow(500, v / 1000); // 10 bps .. 0.5
  const feeOf = (v) => (v <= 0 ? 0 : 1e-4 * Math.pow(3000, v / 1000)); // 0, 1 bp .. 30%
  const fmtFee = (g) => (g === 0 ? "0" : g < 0.01 ? (g * 1e4).toFixed(g < 0.001 ? 1 : 0) + " bps" : (g * 100).toFixed(1) + "%");
  const fmtJump = (j) => (j < 0.01 ? `${(j * 1e4).toFixed(0)} bps` : j.toFixed(3)) + ` · oracle +${((Math.exp(j) - 1) * 100).toFixed(j < 0.01 ? 2 : 1)}%`;

  function model() {
    const d = st.design === "ga" ? OD.ga(App.lam) : OD.pt();
    const canDrain = isFinite(d.gInf(0));
    const fMax = canDrain ? 1 : 0.9;
    const f = Math.min(+fIn.value, fMax);
    const piP = jumpOf(+jumpIn.value), gamma = feeOf(+feeIn.value);
    const run = (ff, g) => OD.sandwich(d, { piP, gamma: g, f: ff >= 1 && !canDrain ? 0.9 : ff });
    return { d, f, fMax, piP, gamma, canDrain, run, res: run(f, gamma), honest: run(0, gamma) };
  }
  // y on the conditional curve with liquidity Lv at risky reserve x (x = 0 is the axis).
  function yAt(d, Lv, x, pi) {
    if (x <= 1e-12) return Lv * Math.exp(-d.gInf(pi));
    return d.invG(Math.log(Lv / x), pi) * x;
  }

  function drawCurves(m, u) {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(curvesC);
    const L = 40, R = 12, T = 10, B = 34;
    const r = m.res;
    const xmax = Math.max(1.3, r.x2 * 1.12), ymax = Math.min(12, Math.max(3.5, r.y1 * 1.1, r.y2 * 1.1));
    const sx = Charts.lin(0, xmax, L, w - R), sy = Charts.lin(0, ymax, h - B, T);
    Charts.yAxis(ctx, c, sy, Charts.ticks(0, ymax, 4), L, w - R, (v) => String(v));
    Charts.xAxis(ctx, c, sx, Charts.ticks(0, xmax, 4), T, h - B, (v) => String(v));
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, w - R - L, h - B - T); ctx.clip();
    const Lm = OD.L(m.d, 1, 1, 0), Lp = OD.L(m.d, r.x1, r.y1, m.piP), Lh = OD.L(m.d, 1, 1, m.piP);
    const curve = (Lv, pi, color, width, dash, xa = 0, xb = xmax) => {
      const xs = [], ys = [];
      for (let i = 0; i <= 200; i++) {
        const x = xa + ((xb - xa) * i) / 200;
        const y = yAt(m.d, Lv, x, pi);
        xs.push(sx(x)); ys.push(isFinite(y) ? sy(Math.min(y, ymax * 3)) : NaN);
      }
      Charts.poly(ctx, xs, ys, color, width, dash);
    };
    curve(Lh, m.piP, c.ink3, 1, [3, 3]); // honest arbitrage curve through the start
    curve(Lm, 0, c.oracle, 1.6, null); // stale curve
    if (u > 1) curve(Lp, m.piP, c.pool, 1.6, null); // refreshed curve through the front-run
    // walked segments
    const u1 = Math.min(1, u), u2 = Math.max(0, Math.min(1, u - 2));
    if (u1 > 0) curve(Lm, 0, c.loss, 3.2, null, 1 - (1 - r.x1) * u1, 1);
    if (u2 > 0) curve(Lp, m.piP, c.loss, 3.2, null, r.x1, r.x1 + (r.x2 - r.x1) * u2);
    ctx.restore();
    const pt = (x, y, label, color, dx = 8, dy = -8) => {
      Charts.dot(ctx, sx(x), sy(Math.min(y, ymax)), 5, color, c.plate);
      Charts.text(ctx, label, sx(x) + dx, sy(Math.min(y, ymax)) + dy, color, { font: `500 11px ${c.fontBody}`, align: dx < 0 ? "right" : "left" });
    };
    pt(1, 1, "start", c.ink, -10, -8);
    if (u >= 1) pt(r.x1, r.y1, "after front-run", c.loss, r.x1 < 0.4 ? 10 : -10, -8);
    if (u >= 3) pt(r.x2, r.y2, "after back-run", c.pool, -10, 16);
    if (u > 1 && u < 2) Charts.text(ctx, "oracle update", (L + w - R) / 2, T + 16, c.pool, { font: `600 12px ${c.fontBody}`, align: "center" });
  }

  function drawProfit(m) {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(profitC);
    const L = 46, R = 12, T = 10, B = 34;
    const n = 100, fs = [], pf = [], p0 = [];
    for (let i = 0; i <= n; i++) {
      const f = (i / n) * m.fMax;
      fs.push(f);
      pf.push(m.run(f, m.gamma).profit / 2);
      p0.push(m.run(f, 0).profit / 2);
    }
    const all = pf.concat(p0);
    const lo = Math.min(0, ...all), hi = Math.max(0.01, ...all) * 1.12;
    const sx = Charts.lin(0, 1, L, w - R), sy = Charts.lin(lo, hi, h - B, T);
    Charts.yAxis(ctx, c, sy, Charts.ticks(lo, hi, 4), L, w - R, (v) => (v * 100).toFixed(Math.abs(v) < 0.1 && v ? 1 : 0) + "%");
    Charts.xAxis(ctx, c, sx, [0, 0.25, 0.5, 0.75, 1], T, h - B, (v) => (v * 100).toFixed(0) + "%");
    ctx.strokeStyle = c.ink3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, sy(0)); ctx.lineTo(w - R, sy(0)); ctx.stroke();
    Charts.poly(ctx, fs.map(sx), p0.map(sy), c.ink3, 1.2, [4, 3]);
    Charts.poly(ctx, fs.map(sx), pf.map(sy), c.loss, 2.2);
    let bi = 0;
    pf.forEach((v, i) => { if (v > pf[bi] + 1e-12) bi = i; });
    Charts.dot(ctx, sx(0), sy(pf[0]), 4, c.ink, c.plate);
    Charts.dot(ctx, sx(fs[bi]), sy(pf[bi]), 4, c.loss, c.plate);
    Charts.text(ctx, "best", sx(fs[bi]) + (fs[bi] > 0.8 ? -8 : 8), sy(pf[bi]) - 8, c.loss, { font: `500 11px ${c.fontBody}`, align: fs[bi] > 0.8 ? "right" : "left" });
    Charts.dot(ctx, sx(m.f), sy(m.res.profit / 2), 6, c.loss, c.plate);
    Charts.text(ctx, "share of risky reserve front-run →", w - R, h - 4, c.ink3, { font: `11px ${c.fontBody}`, align: "right" });
    if (m.gamma > 0) Charts.text(ctx, "dashed: same attack with no fee", L + 6, T + 12, c.ink3, { font: `11px ${c.fontBody}` });
    if (!m.canDrain) Charts.text(ctx, "PT: the take keeps rising toward 100% as the trade grows", L + 6, T + 26, c.ink3, { font: `11px ${c.fontBody}` });
  }

  function render(u = 3) {
    const m = model();
    fIn.max = String(m.fMax);
    $("sw-jump-out").textContent = fmtJump(m.piP);
    $("sw-fee-out").textContent = fmtFee(m.gamma);
    $("sw-f-out").textContent = (m.f * 100).toFixed(0) + "%" + (m.f >= 1 ? " · drains it" : "");
    drawCurves(m, u);
    drawProfit(m);
    const take = m.res.profit / 2;
    $("sw-take").textContent = F.pct(Math.max(take, 0));
    $("sw-take-sub").textContent = take > 0 ? `${m.res.profit.toFixed(3)} of a pool worth 2` : "no profitable attack";
    $("sw-honest").textContent = F.pct(Math.max(m.honest.profit / 2, 0));
    const lamEff = st.design === "ga" ? App.lam : 1;
    const need = 1 - Math.exp(-lamEff * m.piP);
    $("sw-need").textContent = lamEff === 0 ? "none" : fmtFee(need);
    $("sw-need-sub").textContent = lamEff === 0
      ? "a CPMM ignores the oracle"
      : m.gamma >= need ? "met: front-running adds nothing" : `γ ≥ 1 − e^(−${lamEff === 1 ? "" : lamEff.toFixed(2) + "·"}Δπ)`;
  }

  function play() {
    if (reduce) { render(3); return; }
    if (st.anim) cancelAnimationFrame(st.anim);
    const t0 = performance.now();
    const tick = (now) => {
      const u = Math.min(3, ((now - t0) / 2400) * 3);
      render(u);
      st.anim = u < 3 ? requestAnimationFrame(tick) : null;
    };
    st.anim = requestAnimationFrame(tick);
  }

  const seg = $("sw-design");
  const syncSeg = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === st.design)));
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    st.design = b.dataset.v;
    syncSeg();
    render();
  });
  syncSeg();
  [jumpIn, feeIn, fIn].forEach((el) => el.addEventListener("input", () => render()));
  playBtn.addEventListener("click", play);
  [curvesC, profitC].forEach((el) => App.register(el, () => render()));
  App.on(() => render());
})();
