# op-amm

An interactive companion to *Oracle-Parametrized Constant Function Market Makers: From Price Feeds to Pricing Rules* by Hamed Amini and Zachary Feinstein ([arXiv:2609.33799](https://arxiv.org/abs/2609.33799)).

The app, **Oracle Dial**, turns the paper's results into instruments you can operate. One control, the oracle sensitivity λ, sets how far the pool's quote follows an external price oracle. At λ = 0 the pool is a plain constant-product AMM (CPMM). Every panel recomputes as the dial turns.

## What's on the page

| Panel | Paper | What it shows |
|---|---|---|
| Live market | §3, §4.2 | A synthetic trading day in one-second steps. An oracle-priced pool and a CPMM face the same arbitrageurs, and their quote errors, trades and cumulative LP losses update live. |
| Weighted average | Theorem 2.8, Example 2.11 | The quote sits between the oracle price π and the inventory price π*, a share λ of the way toward the oracle. A second chart shows depth against an equal-value CPMM as the oracle error grows. |
| Lag risk vs oracle risk | Corollary 3.4, §4.1, Figure 1 | Residual variance split into market lag and oracle noise, the depth and loss path as λ runs from 0 to 0.99, and where the pool beats the CPMM on both. |
| Sandwich | Proposition 3.11, Remark 3.13, Lemma 3.14 | An attacker front-runs the stale curve, the oracle refreshes, and the attacker back-runs the new curve. The panel shows the attacker's take and the fee that neutralizes it. |
| Backtest | §4.2, Figures 2 and 3 | The paper's three oracle setups (L1, L2 and pull), rerun across a λ × fee grid in the browser. |

## Models and data

- **Pricing rule.** The paper's geometric-average design on a constant-product baseline: `p(r, π) = λπ + (1 − λ) log r`, where `r = y/x` is the reserve ratio and prices are logs.
- **Market.** Synthetic, not SPY data: geometric Brownian motion with no drift in price, 13% annual volatility, one-second steps over a 6.5-hour session, and a one-cent spread on a share near $420.
- **Oracles.** Updates follow the paper's rule (3.7). The oracle refreshes when its delayed signal moves more than ε from the posted price, or when the heartbeat h expires.

  | Regime | Heartbeat h | Threshold ε | Delay δ |
  |---|---|---|---|
  | Perfect | 1 s | 0 | 0 |
  | Pull | 1 s | 0 | 1 s |
  | L2 | 1 h | 5 bps | 2 s |
  | L1 | 1 h | 25 bps | 60 s |
  | Noisy | 1 s | 0 | 1 s, plus a mean-reverting error with a 3 bps SD |

- **Arbitrage.** Each second, arbitrageurs make the smallest trade that brings the pool's fee-adjusted quote back to the market bid or ask. The LP loss is their profit net of fees, which is the loss-versus-rebalancing (LVR) the paper measures.

Findings credited to the paper on the page are quoted from it. Everything else is computed from the paper's formulas.

## A note on the formulas

The arXiv HTML rendering of the paper drops radical signs. Two formulas here use the square roots that the derivations require:

- The pool stays deeper than a CPMM while `|log S − π| < ((1 − λ)/λ) · log((1 + √λ)/(1 − √λ))`.
- In the same state, the pool's LVR is below the CPMM's while `σ_η < √((1 − λ)/λ) · σ`, which is `λ < 1/(1 + α²)` with `α = σ_η/σ`.

`scripts/verify.js` checks both. It also checks the worked sandwich example in Remark 3.13: a front-run cost of 2.175, an attacker take of 0.512 (25.6% of the pool), and a plain refresh loss of 0.054.

## Run locally

There is no build step and there are no dependencies.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Check the engine

```bash
node scripts/verify.js
```

## Deploy on Vercel

The site is static. Import the repository in Vercel and choose the **Other** framework preset with no build command; Vercel serves the repository root. From the CLI:

```bash
vercel --prod
```

## Layout

| File | Role |
|---|---|
| `index.html` | Page markup |
| `styles.css` | Design tokens and layout for light and dark themes |
| `engine.js` | Pricing rules, liquidity, LVR, sandwich values, and the market and oracle simulation |
| `core.js` | Dial state, canvas helpers and number formatting |
| `hero.js` | Live market panel |
| `plates.js` | Weighted-average and trade-off panels |
| `sandwich.js` | Oracle-update sandwich panel |
| `backtest.js` | Backtest rerun |
| `scripts/verify.js` | Checks against the paper's numbers |
