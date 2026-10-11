/* Plates for §2 (the weighted average, depth vs oracle error) and §3–4.1
   (lag risk vs oracle risk, the depth/loss frontier, the dominance map). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const clip = (ctx, x, y, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); };
  const pctLabel = (v) => {
    const p = v * 100;
    return (p >= 1 || p === 0 ? p.toFixed(0) : p.toFixed(1)) + "%";
  };

  /* ---------- §2.2: two anchors, one quote ---------- */
  const lineC = $("interp-chart");
  const a = { piStar: -0.04, pi: 0.05, drag: null };
  const DOM = [-0.1, 0.1];
  let sx1 = null;
  lineC.tabIndex = 0;
  lineC.setAttribute("aria-label", lineC.getAttribute("aria-label") + ". Arrow keys move the oracle price; Shift with arrows moves the inventory price.");

  function drawLine() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(lineC);
    const L = 30, R = 30, y = Math.round(h * 0.56);
    const sx = (sx1 = Charts.lin(DOM[0], DOM[1], L, w - R));
    const lam = App.lam, p = lam * a.pi + (1 - lam) * a.piStar;

    ctx.strokeStyle = c.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.font = `10.5px ${c.fontData}`; ctx.fillStyle = c.ink3; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (let v = -0.1; v <= 0.1001; v += 0.02) {
      const x = sx(v);
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
      ctx.fillText((v > 0.0001 ? "+" : "") + (Math.abs(v) < 1e-9 ? "0" : (v * 100).toFixed(0)) + "%", x, h - 6);
    }
    // the share λ of the gap that the quote travels toward the oracle
    ctx.lineCap = "round";
    ctx.strokeStyle = c.pool; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx(a.piStar), y); ctx.lineTo(sx(p), y); ctx.stroke();
    ctx.strokeStyle = c.oracle; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(sx(p), y); ctx.lineTo(sx(a.pi), y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = "butt";

    const xs = sx(a.piStar), xo = sx(a.pi), xp = sx(p);
    const close = Math.abs(xs - xo) < 64;
    const math = (s, x, yy, col) => Charts.text(ctx, s, x, yy, col, { font: `italic 500 20px ${c.fontMath}`, align: "center" });
    const small = (s, x, yy, col) => Charts.text(ctx, s, x, yy, col, { font: `11px ${c.fontBody}`, align: "center" });
    Charts.dot(ctx, xs, y, 8, c.plate, c.ink);
    Charts.dot(ctx, xo, y, 8, c.oracle, c.plate);
    Charts.dot(ctx, xp, y, 5.5, c.pool, c.plate);
    math("π*", xs, y - 30 - (close && xs > xo ? 26 : 0), c.ink);
    small("inventory", xs, y - 16 - (close && xs > xo ? 26 : 0), c.ink2);
    math("π", xo, y - 30 - (close && xo >= xs ? 26 : 0), c.oracle);
    small("oracle", xo, y - 16 - (close && xo >= xs ? 26 : 0), c.ink2);
    math("p", xp, y + 32, c.pool);
    small("quote", xp, y + 46, c.ink2);

    const f = (v) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + "%";
    $("interp-read").textContent = `p = ${lam.toFixed(2)}·(${f(a.pi)}) + ${(1 - lam).toFixed(2)}·(${f(a.piStar)}) = ${f(p)}`;
  }
  function pick(e) {
    const r = lineC.getBoundingClientRect(), x = e.clientX - r.left;
    if (!sx1) return null;
    const ds = Math.abs(x - sx1(a.piStar)), dp = Math.abs(x - sx1(a.pi));
    if (Math.min(ds, dp) > 28) return null;
    return dp <= ds ? "pi" : "piStar";
  }
  function moveTo(e) {
    const r = lineC.getBoundingClientRect();
    a[a.drag] = Math.max(DOM[0], Math.min(DOM[1], sx1.inv(e.clientX - r.left)));
    drawLine();
  }
  lineC.addEventListener("pointerdown", (e) => {
    a.drag = pick(e);
    if (!a.drag) return;
    lineC.setPointerCapture(e.pointerId);
    lineC.style.cursor = "grabbing";
    moveTo(e);
  });
  lineC.addEventListener("pointermove", (e) => {
    if (a.drag) moveTo(e);
    else lineC.style.cursor = pick(e) ? "grab" : "default";
  });
  const end = () => { a.drag = null; lineC.style.cursor = "default"; };
  lineC.addEventListener("pointerup", end);
  lineC.addEventListener("pointercancel", end);
  lineC.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const k = e.shiftKey ? "piStar" : "pi", d = e.key === "ArrowLeft" ? -0.005 : 0.005;
    a[k] = Math.max(DOM[0], Math.min(DOM[1], a[k] + d));
    drawLine();
  });
  App.register(lineC, drawLine);

  /* ---------- §2.3: depth vs an equal-value CPMM, by oracle error ---------- */
  const depthC = $("depth-chart");
  function drawDepth() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(depthC);
    const L = 46, R = 14, T = 8, B = 40;
    const X0 = 0.001, X1 = 2, Y0 = 0.1, Y1 = 150;
    const sx = Charts.log(X0, X1, L, w - R), sy = Charts.log(Y0, Y1, h - B, T);
    ctx.fillStyle = c.winSoft;
    ctx.fillRect(L, T, w - R - L, sy(1) - T);
    Charts.yAxis(ctx, c, sy, [0.1, 1, 10, 100], L, w - R, (v) => v + "×");
    Charts.xAxis(ctx, c, sx, [0.001, 0.01, 0.1, 1], T, h - B, pctLabel);
    Charts.text(ctx, "deeper than the CPMM", w - R - 8, T + 14, c.win, { font: `600 11px ${c.fontBody}`, align: "right" });
    Charts.text(ctx, "oracle error |log S − π|, log scale", (L + w - R) / 2, h - 4, c.ink3, { font: `11px ${c.fontBody}`, align: "center" });

    const curve = (lam, color, width) => {
      const xs = [], ys = [];
      for (let i = 0; i <= 240; i++) {
        const x = X0 * Math.pow(X1 / X0, i / 240);
        xs.push(sx(x));
        ys.push(sy(Math.max(OD.depthRatio(lam, x), Y0 / 2)));
      }
      Charts.poly(ctx, xs, ys, color, width);
    };
    clip(ctx, L, T, w - R - L, h - B - T);
    const lam = App.lam;
    [0, 0.6, 0.84, 0.95, 0.99].forEach((l) => {
      if (Math.abs(l - lam) < 0.005) return;
      ctx.globalAlpha = 0.5;
      curve(l, c.ink3, 1.1);
      ctx.globalAlpha = 1;
      Charts.text(ctx, l ? `λ ${l}` : "CPMM", L + 6, sy(1 / (1 - l)) + 13, c.ink3, { font: `10.5px ${c.fontData}` });
    });
    curve(lam, c.pool, 2.4);
    const be = OD.depthBreakEven(lam);
    if (isFinite(be) && be < X1) {
      const x = sx(be);
      ctx.strokeStyle = c.pool; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke(); ctx.setLineDash([]);
      Charts.dot(ctx, x, sy(1), 4, c.pool, c.plate);
    }
    const ly = sy(1 / (1 - lam));
    Charts.text(ctx, `λ ${lam.toFixed(2)}`, L + 6, ly - 6 < T + 10 ? ly + 14 : ly - 6, c.pool, { font: `600 11px ${c.fontData}` });
    ctx.restore();
    $("depth-be").textContent = lam === 0
      ? "λ = 0 is the CPMM itself"
      : `${(1 / (1 - lam)).toFixed(2)}× deeper with a correct oracle; deeper until the error passes ±${pctLabel(be)}`;
  }
  App.register(depthC, drawDepth);

  /* ---------- §3.1 / §4.1: lag risk vs oracle risk ---------- */
  const b = { alpha: 0.5, k: 1 };
  const alphaIn = $("alpha"), kIn = $("kmis");
  const varC = $("var-chart"), frontC = $("frontier-chart"), domC = $("dom-chart");

  function drawVar() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(varC);
    const L = 64, R = 70, lam = App.lam, v = OD.varShares(lam, b.alpha), tot = v.lag + v.oracle;
    const sx = Charts.lin(0, Math.max(1, tot) * 1.04, L, w - R);
    const bar = (y, hgt, x0, x1, color) => { ctx.fillStyle = color; ctx.fillRect(sx(x0), y, Math.max(0, sx(x1) - sx(x0)), hgt); };
    const rows = [[10, "CPMM"], [50, "Pool"]];
    rows.forEach(([y, lab]) => Charts.text(ctx, lab, L - 10, y + 17, c.ink2, { font: `12px ${c.fontBody}`, align: "right" }));
    bar(10, 24, 0, 1, c.cpmm);
    bar(50, 24, 0, v.lag, c.pool);
    bar(50, 24, v.lag, tot, c.oracle);
    const inside = (txt, x0, x1, y, col) => {
      if (sx(x1) - sx(x0) > ctx.measureText(txt).width + 12) Charts.text(ctx, txt, sx(x0) + 6, y + 16, col, { font: `500 11px ${c.fontData}` });
    };
    ctx.font = `500 11px ${c.fontData}`;
    inside("lag 1.00", 0, 1, 10, c.plate);
    inside(`lag ${v.lag.toFixed(2)}`, 0, v.lag, 50, c.plate);
    inside(`oracle ${v.oracle.toFixed(2)}`, v.lag, tot, 50, c.plate);
    Charts.text(ctx, "1.00 σ²", sx(1) + 8, 27, c.ink2, { font: `11px ${c.fontData}` });
    Charts.text(ctx, `${tot.toFixed(2)} σ²`, sx(tot) + 8, 67, c.ink, { font: `500 11px ${c.fontData}` });
    $("var-read").textContent = `(1 − λ)² = ${v.lag.toFixed(2)} · λ²α² = ${v.oracle.toFixed(2)}`;
  }

  function drawFrontier() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(frontC);
    const L = 46, R = 12, T = 8, B = 40;
    const sx = Charts.log(0.1, 100, L, w - R), sy = Charts.log(0.01, 100, h - B, T);
    ctx.fillStyle = c.winSoft;
    ctx.fillRect(sx(1), sy(1), w - R - sx(1), h - B - sy(1));
    Charts.yAxis(ctx, c, sy, [0.01, 0.1, 1, 10, 100], L, w - R, (v) => v + "×");
    Charts.xAxis(ctx, c, sx, [0.1, 1, 10, 100], T, h - B, (v) => v + "×");
    Charts.text(ctx, "depth vs CPMM →", w - R, h - 4, c.ink3, { font: `11px ${c.fontBody}`, align: "right" });
    Charts.text(ctx, "LVR vs CPMM ↑", L + 6, T + 12, c.ink3, { font: `11px ${c.fontBody}` });
    Charts.text(ctx, "deeper, loses less", w - R - 6, h - B - 8, c.win, { font: `600 11px ${c.fontBody}`, align: "right" });
    ctx.strokeStyle = c.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(sx(1), T); ctx.lineTo(sx(1), h - B); ctx.moveTo(L, sy(1)); ctx.lineTo(w - R, sy(1)); ctx.stroke();
    ctx.setLineDash([]);
    clip(ctx, L, T, w - R - L, h - B - T);
    const trace = (alpha, color, width) => {
      const xs = [], ys = [];
      for (let i = 0; i <= 396; i++) {
        const lam = (i / 396) * 0.99;
        xs.push(sx(Math.max(OD.depthRatio(lam, b.k * alpha), 0.05)));
        ys.push(sy(Math.max(OD.lvrRatio(lam, alpha, b.k), 0.005)));
      }
      Charts.poly(ctx, xs, ys, color, width);
    };
    [0, 0.5, 1, 2].forEach((al) => {
      if (Math.abs(al - b.alpha) <= 0.01) return;
      ctx.globalAlpha = 0.45;
      trace(al, c.ink3, 1.1);
      ctx.globalAlpha = 1;
    });
    trace(b.alpha, c.pool, 2.2);
    const lam = App.lam;
    Charts.dot(ctx, sx(1), sy(1), 4, c.cpmm);
    Charts.text(ctx, "CPMM", sx(1) - 8, sy(1) - 8, c.ink3, { font: `10.5px ${c.fontData}`, align: "right" });
    const D = OD.depthRatio(lam, b.k * b.alpha), Rr = OD.lvrRatio(lam, b.alpha, b.k);
    Charts.dot(ctx, sx(Math.max(D, 0.05)), sy(Math.max(Rr, 0.005)), 6, c.pool, c.plate);
    ctx.restore();
    return { D, Rr };
  }

  function drawDom() {
    const c = Charts.colors();
    const { ctx, w, h } = Charts.setup(domC);
    const L = 40, R = 12, T = 8, B = 40;
    const sx = Charts.lin(0, 3, L, w - R), sy = Charts.lin(0, 1, h - B, T);
    const nx = 60, ny = 50, cw = (w - R - L) / nx, ch = (h - B - T) / ny;
    ctx.fillStyle = c.win;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const al = ((i + 0.5) / nx) * 3, lam = Math.min(0.99, (j + 0.5) / ny);
      if (!OD.dominates(lam, al, b.k)) continue;
      const x0 = Math.round(L + i * cw), x1 = Math.round(L + (i + 1) * cw);
      const y0 = Math.round(h - B - (j + 1) * ch), y1 = Math.round(h - B - j * ch);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1;
    Charts.yAxis(ctx, c, sy, [0, 0.25, 0.5, 0.75, 1], L, w - R, (v) => v.toFixed(2));
    Charts.xAxis(ctx, c, sx, [0, 1, 2, 3], T, h - B, (v) => String(v));
    Charts.text(ctx, "oracle noise α →", w - R, h - 4, c.ink3, { font: `11px ${c.fontBody}`, align: "right" });
    Charts.text(ctx, "λ", L - 30, T + 10, c.ink3, { font: `italic 14px ${c.fontMath}` });
    const xs = [], ys = [];
    for (let i = 0; i <= 120; i++) { const al = (i / 120) * 3; xs.push(sx(al)); ys.push(sy(1 / (1 + al * al))); }
    Charts.poly(ctx, xs, ys, c.ink2, 1.2, [4, 3]);
    Charts.text(ctx, "dashed: λ = 1/(1+α²)", w - R - 6, T + 14, c.ink2, { font: `10.5px ${c.fontData}`, align: "right" });
    ctx.strokeStyle = c.pool; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(b.alpha), T); ctx.lineTo(sx(b.alpha), h - B); ctx.moveTo(L, sy(App.lam)); ctx.lineTo(w - R, sy(App.lam)); ctx.stroke();
    Charts.dot(ctx, sx(b.alpha), sy(App.lam), 6, c.pool, c.plate);
  }

  function drawTradeoff() {
    drawVar();
    const { D, Rr } = drawFrontier();
    drawDom();
    $("to-depth").textContent = F.x(D);
    $("to-lvr").textContent = Rr < 0.01 ? "<0.01×" : F.x(Rr);
    const deeper = D >= 1, less = Rr <= 1;
    $("to-verdict").innerHTML = deeper && less
      ? '<span class="pill win">Beats the CPMM on both</span>'
      : deeper ? '<span class="pill loss">Deeper, but loses more</span>'
      : less ? '<span class="pill loss">Loses less, but shallower</span>'
      : '<span class="pill loss">Worse on both</span>';
  }
  function readInputs() {
    b.alpha = +alphaIn.value;
    b.k = +kIn.value;
    $("alpha-out").textContent = b.alpha.toFixed(2);
    $("kmis-out").textContent = b.k.toFixed(1) + " SD";
    drawTradeoff();
  }
  alphaIn.addEventListener("input", readInputs);
  kIn.addEventListener("input", readInputs);
  [varC, frontC, domC].forEach((el) => App.register(el, drawTradeoff));
  readInputs();

  App.on(() => { drawLine(); drawDepth(); drawTradeoff(); });
})();
