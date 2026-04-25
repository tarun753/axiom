<div align="center">

# Axiom

**The behavioral test runner for AI applications.**

*Test what your AI means, not what it says.*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#status)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

You change a prompt. You swap a model. OpenAI silently updates their API. And you have **zero way to know** if your AI just got better, broke, or quietly drifted into something that's going to embarrass you in production.

There is no `npm test` for AI behavior. **Axiom is that.**

```bash
axiom run

  ✓ PASS  angry customer handling .............. ████████████░░░░  72%  $0.003  1.2s
  ✗ FAIL  refund policy accuracy .............. ████████░░░░░░░░  41%  $0.002  0.9s
     ↳ [critical] promised a specific delivery date

  Pass rate   81.2%  (13/16)
  Cost        $0.04          Duration  18.3s

  ⚠  REGRESSION  refund policy accuracy   0.87 → 0.41   ← critical
```

---

## Why Axiom

Most AI evaluation tools check **strings** (`assert response.includes("...")`). That's brittle. The same prompt produces ten valid responses, none of them stringly equal.

Axiom checks **meaning**: an LLM-as-judge evaluates output against your formal spec — invariants that must always hold, quality dimensions you score on. It detects regressions across runs, not just failures within one. And it ships a local dashboard so you can actually see what changed.

```typescript
import { evalDef, spec, expect } from '@axiom-ai/sdk'

const supportSpec = spec('customer-support', {
  invariants: [
    { rule: 'never promises specific delivery dates', severity: 'critical' },
    { rule: 'always acknowledges customer emotion',   severity: 'high' },
  ],
  qualities: [
    { name: 'empathy',     weight: 0.4, description: 'validates the feeling' },
    { name: 'helpfulness', weight: 0.4, description: 'gives concrete next steps' },
    { name: 'conciseness', weight: 0.2, description: 'under 150 words' },
  ],
})

evalDef('angry customer', async (ctx) => {
  const r = await ctx.run("I've waited 3 weeks. Nobody is helping me!")

  await expect(r, ctx, "I've waited 3 weeks. Nobody is helping me!")
    .toAcknowledgeEmotion()
    .toSatisfySpec(supportSpec)
    .toHaveWordCount({ max: 150 })
    .not.toContain(['guarantee', 'definitely'])
    .evaluate()
})
```

---

## What you get

| | |
|---|---|
| **Semantic assertions** | `.toPass()`, `.toScore()`, `.toAcknowledgeEmotion()`, `.toSatisfySpec()` — judged by LLM, not regex |
| **Deterministic checks** | `.toContain()`, `.toMatch()`, `.toHaveWordCount()`, `.toBeValidJSON()` — free, no API call |
| **Behavioral specs** | Invariants + weighted quality dimensions, checked every run |
| **Regression detection** | Auto-compare to last run, severity classification, score deltas |
| **Multi-turn evals** | Full conversation flows, not just single turns |
| **CI/CD native** | `axiom run --ci` exits 1 on regression, posts a PR comment |
| **Local dashboard** | `axiom ui` — Next.js app, no signup, no cloud, your data stays on disk |
| **Watch mode** | `axiom run --watch` — re-run on file save, dev-loop friendly |
| **Reports** | console (default), JSON, single-file HTML, GitHub PR comments |

---

## Quick start

```bash
# 1. Install
npm install -g @axiom-ai/cli
npm install --save-dev @axiom-ai/sdk

# 2. Scaffold
axiom init

# 3. Set a key (Anthropic recommended; OpenAI works too)
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Run
axiom run
axiom ui              # open the dashboard
```

Or look at [`examples/customer-support`](examples/customer-support) for a full working setup with 5 evals, multi-turn flows, and a real spec.

---

## Do I need an LLM key?

| | LLM needed? |
|---|---|
| Running your AI | Yes — or pass a custom function |
| Semantic assertions (`.toPass`, `.toScore`) | Yes — uses a judge model |
| Deterministic assertions (`.toContain`, `.toBeValidJSON`, `.toHaveWordCount`) | **No** |
| Regression detection | **No** — pure local |
| Dashboard, compare, history | **No** |

Bring your own AI — if it isn't a standard API call, just wrap it:

```typescript
evalDef('my custom AI', async (ctx) => {
  const output = await myCustomThing(input)
  const fakeResponse = { content: output, /* ...*/ }
  await expect(fakeResponse, ctx, input).toPass('is helpful').evaluate()
})
```

---

## Architecture

```
axiom/
├── packages/
│   ├── core/         types · SQLite storage · LLM client · runner · regression
│   ├── sdk/          evalDef() · spec() · dataset() · expect() · context
│   ├── judges/       LLMJudge · EnsembleJudge · Contains · Regex · JSONSchema · WordCount · CodeSyntax
│   ├── reporters/    Console · JSON · HTML · GitHub PR
│   └── cli/          axiom run · ui · compare · init · show · ls
├── apps/
│   └── web/          Local Next.js dashboard
└── examples/
    └── customer-support/   spec + dataset + 5 evals incl. multi-turn
```

---

## CLI

```bash
axiom run [pattern]            # run evals (default: evals/**/*.eval.ts)
  -m, --model <model>          # override default model
  --ci                         # exit 1 on failure / regression
  --only <tag>                 # filter by tag
  --json | --html              # also write report files
  -w, --watch                  # re-run on file change

axiom ui                       # open localhost:3847 dashboard
axiom compare [base] [head]    # diff two runs (default: last two)
axiom init                     # scaffold axiom.config.ts + evals/
axiom show <runId>             # full run details as JSON
axiom ls                       # list recent runs
```

---

## How it compares

| | Axiom | Promptfoo | LangSmith | OpenAI Evals |
|---|---|---|---|---|
| Open source | ✅ | ✅ | partial | ✅ |
| Local-first (no signup) | ✅ | ✅ | ❌ | ✅ |
| Behavioral specs (invariants + qualities) | ✅ | partial | ❌ | ❌ |
| Auto regression detection | ✅ | ❌ | ✅ | ❌ |
| Local dashboard included | ✅ | ❌ | ✅ (cloud) | ❌ |
| Built-in CI/PR comments | ✅ | partial | ✅ | ❌ |
| Multi-turn conversation evals | ✅ | partial | ✅ | partial |

---

## Status

**Alpha.** The shape is stable, the internals are not. Use it on real problems and tell me what breaks.

What works today:
- Full eval runner with retries, timeouts, concurrency
- LLM judge (Anthropic + OpenAI), all deterministic judges, ensemble judge
- SQLite storage, regression detection, run comparison
- Console / JSON / HTML / GitHub PR reporters
- CLI: run · ui · compare · init · show · ls
- Watch mode
- Local Next.js dashboard
- ~56 unit tests on the highest-risk pure-logic surface

Honest gaps:
- No published npm packages yet — clone, `pnpm install`, `pnpm build` to use locally
- No semantic similarity judge (embeddings) — the LLM judge handles most cases
- No Slack reporter (planned)
- Schema migrations are absent — if I change the SQLite schema, your DB needs deletion

---

## Contributing

PRs welcome — particularly:
- New built-in judges
- More working examples (RAG, agents, code-gen)
- Integrations (Vitest, Playwright, etc.)
- Bug fixes — there's a known list at the bottom of CONTRIBUTING.md once it exists

For now: open an issue, talk it through, then PR.

---

## License

[MIT](LICENSE) — built to be used, forked, and improved.

---

<div align="center">
<sub>If this saves you from one bad AI release, that's enough. ⭐ if it helps.</sub>
</div>
