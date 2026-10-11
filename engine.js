/* Oracle Dial engine.
   Pricing rules, local liquidity, LVR ratios and sandwich values from
   Amini & Feinstein (arXiv:2609.33799), all on a CPMM baseline phi(r) = r,
   plus the one-second arbitrage simulation of their Section 4.2 run on
   synthetic market data. Log-prices throughout; r = y / x. */
(function (root) {
  "use strict";
  const OD = {};
  const SEC_PER_DAY = 23400;
  const DAYS_PER_YEAR = 252;
  OD.SEC_PER_DAY = SEC_PER_DAY;
  OD.DAYS_PER_YEAR = DAYS_PER_YEAR;

  /* ---------- pricing rules (Section 2) ---------- */
  // CPMM: p = log r.  GA (Example 2.9): p = lam*pi + (1-lam) log r.
  // PT (Example 2.4): p = pi + log r.  Each carries G (eq. 2.1) in closed form.
  function cpmm() {
    return {
      kind: "CPMM", lam: 0,
      p: (r) => Math.log(r),
      G: (r) => 0.5 * Math.log(r),
      invG: (g) => Math.exp(2 * g),
      rStar: (s) => Math.exp(s),
      gInf: () => -Infinity,
    };
  }
  function ga(lam) {
    if (lam < 1e-6) return cpmm();
    return {
      kind: "GA", lam,
      p: (r, pi) => lam * pi + (1 - lam) * Math.log(r),
      G: (r, pi) => {
        const e = Math.exp(lam * pi);
        return Math.log((Math.pow(r, lam) + e) / (1 + e)) / lam;
      },
      invG: (g, pi) => {
        const e = Math.exp(lam * pi);
        return Math.pow((1 + e) * Math.exp(lam * g) - e, 1 / lam);
      },
      rStar: (s, pi) => Math.exp((s - lam * pi) / (1 - lam)),
      gInf: (pi) => -Math.log(1 + Math.exp(lam * pi)) / lam,
    };
  }
  function pt() {
    return {
      kind: "PT", lam: 1,
      p: (r, pi) => pi + Math.log(r),
      G: (r, pi) => Math.log(r) / (1 + Math.exp(pi)),
      invG: (g, pi) => Math.exp(g * (1 + Math.exp(pi))),
      rStar: (s, pi) => Math.exp(s - pi),
      gInf: () => -Infinity,
    };
  }
  OD.ga = ga;
  OD.pt = pt;
  OD.cpmm = cpmm;

  // Invariant liquidity L(x, y, pi) = exp U (Proposition 2.3) and the
  // portfolio value function V_pi(S) = (S + rbar) exp(-G(rbar, pi)).
  OD.L = (d, x, y, pi) => (x > 0 ? x * Math.exp(d.G(y / x, pi)) : y * Math.exp(d.gInf(pi)));
  OD.V = (d, S, pi) => {
    const rb = d.rStar(Math.log(S), pi);
    return (S + rb) * Math.exp(-d.G(rb, pi));
  };
  // Point on the conditional trading curve with liquidity Lv at reserve ratio r.
  OD.curvePoint = (d, Lv, r, pi) => {
    const x = Lv * Math.exp(-d.G(r, pi));
    return [x, r * x];
  };

  /* ---------- local liquidity and LVR (Sections 2.3, 3.1, 4.1) ---------- */
  // L_GA / L at the market price when the oracle is off by err = log S - pi.
  // 4m/(1+m)^2 with m = exp(lam/(1-lam) err) is sech^2 of half the exponent.
  OD.depthRatio = (lam, err) => {
    if (lam <= 0) return 1;
    const c = Math.cosh((0.5 * lam * err) / (1 - lam));
    return 1 / ((1 - lam) * c * c);
  };
  // Largest |log S - pi| at which the GA is still deeper than the CPMM.
  OD.depthBreakEven = (lam) => {
    if (lam <= 0) return Infinity;
    const q = Math.sqrt(lam);
    return ((1 - lam) / lam) * Math.log((1 + q) / (1 - q));
  };
  // Residual variance shares (Corollary 3.4, rho = 0), in units of sigma^2.
  OD.varShares = (lam, alpha) => ({ lag: (1 - lam) * (1 - lam), oracle: lam * lam * alpha * alpha });
  // Relative LVR rate of Section 4.1 with misalignment k (in oracle-error SDs).
  OD.lvrRatio = (lam, alpha, k) => {
    const v = OD.varShares(lam, alpha);
    return (v.lag + v.oracle) * OD.depthRatio(lam, k * alpha);
  };
  OD.dominates = (lam, alpha, k) =>
    OD.depthRatio(lam, k * alpha) >= 1 && OD.lvrRatio(lam, alpha, k) <= 1;

  /* ---------- oracle-update sandwich (Section 3.2.1) ---------- */
  // Pool at (x0, y0) in equilibrium at oracle piM; the oracle refreshes to piP.
  // The attacker front-runs by buying a fraction f of the risky reserve on the
  // stale curve, then back-runs on the refreshed curve. Fee gamma is paid on
  // the asset sold to the pool on both legs (Lemma 3.14); gamma = 0 gives
  // Proposition 3.11. Returns the path and the attacker's value.
  OD.sandwich = (d, o) => {
    const x0 = o.x0 ?? 1, y0 = o.y0 ?? 1, piM = o.piM ?? 0, S = o.S ?? 1;
    const piP = o.piP, gamma = o.gamma ?? 0, f = o.f;
    const s = Math.log(S), Gam = -Math.log(1 - gamma), q = 1 - gamma;
    const Lm = OD.L(d, x0, y0, piM);
    let x1, y1;
    if (f >= 1) {
      const gi = d.gInf(piM);
      if (!isFinite(gi)) return null; // boundary divergence: cannot drain in finite size
      x1 = 0;
      y1 = Lm * Math.exp(-gi);
    } else {
      x1 = (1 - f) * x0;
      y1 = d.invG(Math.log(Lm / x1), piM) * x1;
    }
    const front = S * (x0 - x1) + (y0 - y1) / q;
    const pAt = x1 > 0 ? d.p(y1 / x1, piP) : Infinity;
    let x2 = x1, y2 = y1, back = 0;
    if (pAt > s + Gam) {
      const Lp = OD.L(d, x1, y1, piP);
      [x2, y2] = OD.curvePoint(d, Lp, d.rStar(s + Gam, piP), piP);
      back = (S * (x1 - x2)) / q + (y1 - y2);
    }
    return { x1, y1, x2, y2, front, back, profit: front + back, poolValue: S * x0 + y0 };
  };

  /* ---------- synthetic one-second market (Section 4.2 mechanics) ---------- */
  OD.SIGMA_ANNUAL = 0.13; // close to SPY's realized volatility in 2023
  OD.SIGMA_SEC = OD.SIGMA_ANNUAL / Math.sqrt(DAYS_PER_YEAR * SEC_PER_DAY);
  OD.HALF_SPREAD = 0.12e-4; // a one-cent NBBO on a ~$420 share, in log terms
  OD.REGIMES = {
    perfect: { key: "perfect", label: "Perfect", h: 1, eps: 0, delay: 0, noise: 0, theta: 0 },
    pull: { key: "pull", label: "Pull", h: 1, eps: 0, delay: 1, noise: 0, theta: 0 },
    l2: { key: "l2", label: "L2", h: 3600, eps: 5e-4, delay: 2, noise: 0, theta: 0 },
    l1: { key: "l1", label: "L1", h: 3600, eps: 25e-4, delay: 60, noise: 0, theta: 0 },
    noisy: { key: "noisy", label: "Noisy", h: 1, eps: 0, delay: 1, noise: 3e-4, theta: 1 / 30 },
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(u) {
    const a = Math.max(u(), 1e-12);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  }
  OD.rng = rng;

  // One trading day: log mid s[t] for t = 0..23400 (s[0] = 0, i.e. prices are
  // relative to the open) and a spare normal stream z[t] for oracle noise.
  OD.makeDay = (seed) => {
    const u = rng(seed), n = SEC_PER_DAY + 1, sig = OD.SIGMA_SEC;
    const s = new Float64Array(n), z = new Float64Array(n);
    for (let t = 1; t < n; t++) s[t] = s[t - 1] - 0.5 * sig * sig + sig * gauss(u);
    for (let t = 0; t < n; t++) z[t] = gauss(u);
    return { seed, s, z };
  };

  // Update policy (3.7): refresh when the candidate signal drifts more than eps
  // from the posted value or the heartbeat h expires. The candidate is the mid
  // delayed by `delay` seconds, plus OU noise for the noisy regime.
  OD.oraclePath = (day, reg) => {
    const n = day.s.length, pi = new Float64Array(n), upd = new Uint8Array(n);
    const decay = Math.exp(-reg.theta), sd = reg.noise * Math.sqrt(1 - decay * decay);
    let eta = 0, cur = day.s[0], last = 0;
    pi[0] = cur;
    upd[0] = 1;
    for (let t = 1; t < n; t++) {
      if (reg.noise) eta = eta * decay + sd * day.z[t];
      const cand = day.s[Math.max(0, t - reg.delay)] + eta;
      if (t - last >= reg.h || Math.abs(cand - cur) > reg.eps) {
        cur = cand;
        last = t;
        upd[t] = 1;
      }
      pi[t] = cur;
    }
    return { pi, upd };
  };

  // A CPMM-based GA pool worth 1 at the open, fee escrowed outside reserves.
  // Each second, arbitrageurs see the NBBO and make the minimal trade that
  // brings the fee-adjusted quote back to the bid or ask (Section 4.2).
  class Pool {
    constructor(lam, gamma) {
      this.lam = lam < 1e-6 ? 0 : lam;
      this.gamma = gamma;
      this.Gam = -Math.log(1 - gamma);
      this.reset();
    }
    reset() {
      this.x = 0.5;
      this.y = 0.5;
      this.lr = 0; // log reserve ratio
      this.quote = 0; // post-trade log mid quote
      this.lvr = 0; // cumulative arbitrage profit = LP loss vs rebalancing, net of fees
      this.fees = 0;
      this.trades = 0;
      this.te2 = 0;
      this.n = 0;
    }
    step(s, pi) {
      const lam = this.lam, Gam = this.Gam, q = 1 - this.gamma, hs = OD.HALF_SPREAD;
      const mid = lam * pi + (1 - lam) * this.lr;
      let target = NaN;
      if (mid < s - hs - Gam) target = s - hs - Gam; // pool ask below market bid
      else if (mid > s + hs + Gam) target = s + hs + Gam; // pool bid above market ask
      let profit = 0;
      if (target === target) {
        const lr = (target - lam * pi) / (1 - lam), r = Math.exp(lr);
        const x = this.x, y = this.y;
        let nx;
        if (lam === 0) nx = Math.sqrt((x * y) / r);
        else {
          const e = Math.exp(lam * pi);
          nx = Math.pow((Math.pow(y, lam) + e * Math.pow(x, lam)) / (Math.pow(r, lam) + e), 1 / lam);
        }
        const ny = r * nx;
        if (nx < x) {
          profit = Math.exp(s - hs) * (x - nx) - (ny - y) / q;
          this.fees += ((ny - y) * this.gamma) / q;
        } else {
          profit = y - ny - (Math.exp(s + hs) * (nx - x)) / q;
          this.fees += (((nx - x) * this.gamma) / q) * Math.exp(s);
        }
        this.x = nx;
        this.y = ny;
        this.lr = lr;
        this.lvr += profit;
        this.trades++;
      }
      this.quote = lam * pi + (1 - lam) * this.lr;
      const err = this.quote - s;
      this.te2 += err * err;
      this.n++;
      return profit;
    }
  }
  OD.Pool = Pool;

  OD.meanDepth = (day, pi, lam) => {
    let a = 0;
    const n = day.s.length;
    for (let t = 1; t < n; t++) a += OD.depthRatio(lam, day.s[t] - pi[t]);
    return a / (n - 1);
  };

  // One configuration over prepared days -> annualized LVR (bps of pool value),
  // average daily tracking error (bps) and mean relative depth.
  OD.runConfig = (days, oracles, lam, gamma) => {
    let lvr = 0, te = 0, depth = 0, trades = 0;
    for (let i = 0; i < days.length; i++) {
      const s = days[i].s, pi = oracles[i].pi, pool = new Pool(lam, gamma);
      for (let t = 1; t < s.length; t++) pool.step(s[t], pi[t]);
      lvr += pool.lvr;
      te += Math.sqrt(pool.te2 / pool.n);
      depth += OD.meanDepth(days[i], pi, lam);
      trades += pool.trades;
    }
    const k = days.length;
    return {
      lam, gamma,
      lvrBps: (lvr / k) * DAYS_PER_YEAR * 1e4,
      teBps: (te / k) * 1e4,
      depth: depth / k,
      trades: trades / k,
    };
  };

  OD.clock = (t) => {
    const sec = 9 * 3600 + 30 * 60 + Math.floor(t);
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = OD;
  else root.OD = OD;
})(typeof window !== "undefined" ? window : globalThis);
