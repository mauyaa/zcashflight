---
title: Requirements status
description: Each requirement from the ZcashFlight PRD, its current status, and the evidence for it.
audience: evaluator, contributor
type: reference
owner: product owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Requirements status

Each requirement from the original product requirements document, mapped to what exists today. Status labels follow the evidence ladder: **Available** means it is implemented and demonstrated by a test you can run; **Partial** means it works with a stated limit; **Planned** means it doesn't exist yet.

## P0: MVP requirements

| Requirement | Acceptance criterion (PRD) | Status | Evidence |
|---|---|---|---|
| Privacy Test Lab | Predefined scenarios can be executed | Available | `examples/zecshop` with 3 scenarios; `npm run demo` |
| Traffic Collector | Records destinations, fields and timestamps | Available | `src/capture/register.ts`, `proxy.ts`; event fields `host`, `fields`, `t` in [run file](../reference/run-file.md) |
| Sensitive Field Detection | Identifies seeded sensitive fields in test data | Available | 19/19 in `npm run validate`, including ZIP 321 payment requests |
| Log Inspection | Detects designated fields in test logs | Available | Rule B; validation cases "Transaction ID in a log line", "Seed phrase printed by console.error" |
| Findings Dashboard | Shows affected fields and reproduction details | Available | `zcashflight ui`; leak detail shows evidence, the line, the fix and reproduction steps |
| Remediation Guide | Actionable guidance for each rule | Available | `remediation` on every finding; [rules reference](../reference/rules.md) |
| Re-test | Repeats scenarios and reports changes | Available | `zcashflight compare`; `test/zecshop.test.ts` asserts 5 closed |

## P1: future enhancements

| Requirement | Status | Note |
|---|---|---|
| CI integration (GitHub Actions) | Available | `action.yml`, `--ci`, SARIF; [guide](../guides/run-in-ci.md) |
| Custom privacy policies | Available | `zcashflight.yml` protect, destinations and log allow-lists |
| Team audit history and report export | Partial | Local run history and exports (HTML, Markdown, SARIF, JSON); no shared team history |
| More Zcash wallet and RPC environments | Available | zcashd/zallet JSON-RPC send methods parsed; ZecShop runs against real Zallet + Zebra regtest (`npm run regtest`, [guide](../guides/regtest.md)) |
| Extensible rule plugins | Planned | |

## Data-handling requirements

| Requirement | Status | Evidence |
|---|---|---|
| Collect only data required for each test | Available | Header names only; body field names; masked matches |
| Never collect seeds, private keys or viewing keys | Available | Fully redacted at capture; tests assert they never appear raw |
| Keep captured payloads and logs local by default | Available | No network code besides the sinkhole and the local dashboard |
| Mask sensitive values in displayed evidence | Available | `src/engine/mask.ts`; nothing raw is ever stored to display |
| Explicit consent and redaction before external AI | Not applicable | There is no AI integration. Findings are deterministic ([ADR 0003](../architecture/adr/0003-deterministic-rules.md)) |

## Success metrics (PRD §12)

| Question | Answer today |
|---|---|
| Does it detect every seeded exposure? | Yes, 19/19 in the validation suite and 5/5 in ZecShop, with the mock wallet and on a real regtest chain |
| Does the rule pass after the issue is fixed? | Yes, ZecShop shows 0 findings after the fixes |
| Does each finding include reproduction steps and evidence? | Yes, `repro` and `evidence` on every finding |
| Are results consistent across repeated runs? | Yes, identical fingerprints, asserted in tests |
| Can developers understand and fix from the report? | Not yet tested with users. Planned usability test (see [launch audit](../LAUNCH_AUDIT.md)) |
