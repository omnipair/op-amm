/* Shared state (the λ dial), redraw registry, canvas helpers and formatters. */
(function () {
  "use strict";
  const root = document.documentElement;
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();

  /* ---------- the dial ---------- */
  const listeners = [];
  const App = {
    lam: 0.6,
    on(fn) { listeners.push(fn); },
    setLam(v) {
      v = Math.min(0.99, Math.max(0, Math.round(v * 100) / 100));
      App.lam = v;
      listeners.forEach((fn) => fn(v));
    },
  };

  /* ---------- redraw on resize and theme change ---------- */
  const drawers = new Set();
  App.redraw = () => drawers.forEach((fn) => fn());
  App.register = (el, fn) => {
    drawers.add(fn);
    if (window.ResizeObserver) new ResizeObserver(() => fn()).observe(el);
    else fn();
  };
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", App.redraw);
  new MutationObserver(App.redraw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(App.redraw);

  /* ---------- canvas helpers ---------- */
  const Charts = {};
  Charts.colors = () => {
    const o = {};
    ["ink", "ink-2", "ink-3", "rule", "grid", "oracle", "oracle-soft", "pool", "pool-soft", "cpmm",
      "loss", "win", "win-soft", "band", "plate", "paper"].forEach((k) => {
      o[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = css("--" + k);
    });
    o.fontData = css("--font-data");
    o.fontBody = css("--font-body");
    o.fontMath = css("--font-math");
    return o;
  };
  Charts.setup = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  };
  Charts.lin = (d0, d1, r0, r1) => {
    const k = (r1 - r0) / (d1 - d0 || 1);
    const f = (v) => r0 + (v - d0) * k;
    f.inv = (p) => d0 + (p - r0) / k;
    return f;
  };
  Charts.log = (d0, d1, r0, r1) => {
    const a = Math.log10(d0), b = Math.log10(d1), k = (r1 - r0) / (b - a || 1);
    const f = (v) => r0 + (Math.log10(Math.max(v, 1e-300)) - a) * k;
    f.inv = (p) => Math.pow(10, a + (p - r0) / k);
    return f;
  };
  Charts.ticks = (lo, hi, n = 5) => {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
    const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
    }
    return out;
  };
  Charts.logTicks = (lo, hi) => {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      const v = Math.pow(10, e);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
    return out;
  };
  Charts.yAxis = (ctx, c, sy, ticks, x0, x1, fmt) => {
    ctx.font = `11px ${c.fontData}`;
    ctx.fillStyle = c.ink3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    ticks.forEach((v) => {
      const y = Math.round(sy(v)) + 0.5;
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillText(fmt(v), x0 - 6, y);
    });
  };
  Charts.xAxis = (ctx, c, sx, ticks, y0, y1, fmt) => {
    ctx.font = `11px ${c.fontData}`;
    ctx.fillStyle = c.ink3;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 1;
    ticks.forEach((v) => {
      const x = Math.round(sx(v)) + 0.5;
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.fillText(fmt(v), x, y1 + 6);
    });
  };
  // Polyline through pixel points; non-finite y lifts the pen.
  Charts.poly = (ctx, xs, ys, color, width, dash) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
      if (!isFinite(ys[i]) || !isFinite(xs[i])) { pen = false; continue; }
      if (pen) ctx.lineTo(xs[i], ys[i]);
      else { ctx.moveTo(xs[i], ys[i]); pen = true; }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  Charts.dot = (ctx, x, y, r, fill, stroke) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  Charts.text = (ctx, s, x, y, color, opts = {}) => {
    ctx.font = opts.font || `11px ${opts.c ? opts.c.fontData : "monospace"}`;
    ctx.fillStyle = color;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.base || "alphabetic";
    ctx.fillText(s, x, y);
  };

  /* ---------- formatters ---------- */
  const F = {};
  F.n = (v, d = 2) => (isFinite(v) ? v.toFixed(d) : "∞");
  F.bps = (v) => {
    if (!isFinite(v)) return "∞";
    if (v === 0) return "0";
    if (Math.abs(v) < 0.001) return "<0.001";
    if (Math.abs(v) < 1) return v.toFixed(3);
    if (Math.abs(v) < 10) return v.toFixed(2);
    return v.toFixed(1);
  };
  // Annualized bps of pool value -> dollars per $1M per year.
  F.usdPerM = (bps) => {
    const d = bps * 100;
    if (!isFinite(d)) return "∞";
    if (d === 0) return "$0";
    if (d < 1) return "$" + d.toFixed(2);
    if (d < 1000) return "$" + d.toFixed(0);
    return "$" + Math.round(d).toLocaleString("en-US");
  };
  F.pct = (v, d = 1) => (isFinite(v) ? (v * 100).toFixed(d) + "%" : "∞");
  F.x = (v) => (isFinite(v) ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) + "×" : "∞");

  /* ---------- wire the dial ---------- */
  const lamInput = document.getElementById("lam");
  const lamOut = document.getElementById("lam-out");
  const eqA = document.getElementById("eq-a"), eqB = document.getElementById("eq-b");
  lamInput.addEventListener("input", () => App.setLam(+lamInput.value));
  document.querySelectorAll("[data-lam]").forEach((b) =>
    b.addEventListener("click", () => App.setLam(+b.dataset.lam))
  );
  App.on((v) => {
    if (+lamInput.value !== v) lamInput.value = v;
    lamOut.textContent = v.toFixed(2);
    eqA.textContent = v.toFixed(2);
    eqB.textContent = (1 - v).toFixed(2);
    document.querySelectorAll("[data-lam]").forEach((b) =>
      b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.lam - v) < 1e-9))
    );
  });

  window.App = App;
  window.Charts = Charts;
  window.F = F;
})();
