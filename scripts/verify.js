// Checks engine.js against numbers and identities stated in the paper.
// Run with: node scripts/verify.js
"use strict";
const assert = require("assert");
const OD = require("../engine.js");

const close = (a, b, tol, what) =>
  assert(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ${b} ± ${tol}`);

// Remark 3.13: CPMM-based GA, λ = 3/5, pool (1, 1) at S = 1, oracle 0 -> 1/2.
const ga = OD.ga(0.6);
const drain = OD.sandwich(ga, { piP: 0.5, f: 1 });
const honest = OD.sandwich(ga, { piP: 0.5, f: 0 });
close(drain.y1 - 1, 2.175, 5e-4, "front-run cost");
close(drain.profit, 0.512, 5e-4, "supremal sandwich value");
close(drain.profit / 2, 0.256, 5e-4, "share of pool value");
close(honest.profit, 0.054, 1e-3, "oracle-refresh loss without front-run");

// Remark 3.13: the price-tracking design approaches the whole pool only in the limit.
const pt = OD.pt();
const ptNear = OD.sandwich(pt, { piP: 0.5, f: 0.999 }).profit;
assert(ptNear < 2 && ptNear > OD.sandwich(pt, { piP: 0.5, f: 0.9 }).profit, "PT take rises toward the pool value");
assert.strictEqual(OD.sandwich(pt, { piP: 0.5, f: 1 }), null, "PT cannot be drained by a finite trade");

// Lemma 3.14: once λ·Δπ ≤ -log(1 - γ), front-running adds nothing.
const gamma = 1 - Math.exp(-0.6 * 0.5);
for (let i = 0; i <= 100; i++) {
  const v = OD.sandwich(ga, { piP: 0.5, gamma, f: i / 100 }).profit;
  assert(v <= 1e-12, `fee-protected attack should not pay (f = ${i / 100}, value ${v})`);
}

// Example 2.11: depth is 1/(1 - λ) with a correct oracle and equals the CPMM's at break-even.
for (const lam of [0.1, 0.3, 0.6, 0.84, 0.95, 0.99]) {
  close(OD.depthRatio(lam, 0), 1 / (1 - lam), 1e-12, `depth at zero error, λ = ${lam}`);
  close(OD.depthRatio(lam, OD.depthBreakEven(lam)), 1, 1e-9, `depth at break-even, λ = ${lam}`);
}

// Section 4.1: at zero misalignment the GA beats the CPMM on loss exactly when λ < 1/(1 + α²).
for (const alpha of [0.25, 0.5, 1, 2]) {
  const edge = 1 / (1 + alpha * alpha);
  assert(OD.lvrRatio(edge - 1e-3, alpha, 0) < 1, `just inside the edge, α = ${alpha}`);
  assert(OD.lvrRatio(edge + 1e-3, alpha, 0) > 1, `just outside the edge, α = ${alpha}`);
}

// Section 4.1: both metrics start at 1 with slopes +1 (depth) and -1 (loss) at λ = 0.
const h = 1e-6;
close((OD.depthRatio(h, 0.7) - 1) / h, 1, 1e-4, "depth slope at λ = 0");
close((OD.lvrRatio(h, 0.7, 1) - 1) / h, -1, 1e-4, "loss slope at λ = 0");

console.log("engine matches the paper's worked numbers and identities");
