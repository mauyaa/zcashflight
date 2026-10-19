---
title: Launch audit
description: The 30-point editorial and launch gate from the Product Documentation Handbook, applied honestly to ZcashFlight v0.1.0.
audience: maintainer, evaluator
type: reference
owner: product owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Launch audit (v0.1.0)

Readiness level: **A, prototype / hackathon.** The handbook's level A asks for: an overview, a working demo, setup, architecture, known limits, security reporting for public code, and privacy or terms only if a real service or data warrants them.

**Status key:** Pass · Open (needs work, with the action) · N/A (doesn't apply, with the reason).

| # | Check | Status | Evidence or action |
|---|---|---|---|
| 01 | Description names an exact user, problem and outcome | Pass | [README](../README.md), [product brief](overview/product-brief.md) |
| 02 | Numerical claims have dated evidence or are labelled assumptions | Pass | Every number in the README is reproducible by a command; prevalence is labelled an assumption |
| 03 | A first-time visitor can find a live example | Pass | Hosted replay; `npm run demo` |
| 04 | Status and unreleased features are labelled accurately | Pass | Capability table: Available / Not supported / Planned |
| 05 | Quickstart followed by someone new | **Open** | Ask one person outside the project to follow [the quickstart](start/quickstart.md), and fix what they trip on |
| 06 | Tutorials state prerequisites and expected results | Pass | [Tutorial](start/tutorial.md) has a starting state and checkpoints |
| 07 | Guides cover the top three tasks | Pass | Test your app, run in CI, fix a leak |
| 08 | Limits appear before a blocked action | Pass | Proxy HTTPS limit stated before the steps; HAR sensitivity warning before export |
| 09 | Architecture reflects the built system | Pass | [Architecture](architecture/overview.md) written from `src/` |
| 10 | Commands and examples have been executed | Pass | Tutorial and quickstart commands run on 2026-10-18 |
| 11 | Errors and exit codes explained | Pass | [CLI reference](reference/cli.md), [troubleshooting](guides/troubleshooting.md) |
| 12 | Behaviour when dependencies fail is described | Pass | Architecture failure paths; troubleshooting table |
| 13 | Known limitations published | Pass | README "What it is not"; "Not tested" in every report |
| 14 | Private security reporting route | Pass, once enabled | [SECURITY.md](../SECURITY.md) uses GitHub private reporting. **Enable it in the repository settings** |
| 15 | Security claims are evidenced and narrow | Pass | [Threat model](trust/threat-model.md) ties each claim to a test or code path |
| 16 | No secrets or restricted runbooks public | Pass | No credentials in the repo; sample data is synthetic |
| 17 | Data flows inventoried against actual behaviour | Pass | [PRIVACY.md](../PRIVACY.md) table matches `inspect.ts` |
| 18 | Privacy notice matches processing | Pass | [Demo site notice](trust/demo-site-privacy.md); PRIVACY.md for the tool |
| 19 | Rights / choice mechanisms work | N/A | No personal data is collected, and there are no accounts |
| 20 | Terms have the correct legal identity | N/A | Open-source tool under the MIT licence; no hosted service. Revisit if a hosted service launches |
| 21 | Payment / refund promises match checkout | N/A | Nothing is sold |
| 22 | Jurisdictions and regulatory triggers reviewed | N/A | No personal data processing by the project. ZecShop is a fictional sample |
| 23 | Legal documents have owners, dates and versions | Pass | LICENSE; notices carry `owner` and `last_reviewed` |
| 24 | Headings, links, media and tables accessible | Pass | Single H1 per page; descriptive links; text alternatives under diagrams |
| 25 | Works on narrow screens and enlarged text | Pass (layout) / Open (text spacing) | 18/18 at 320–1920 px (2026-10-19); WCAG 1.4.12 not yet tested ([accessibility](trust/accessibility.md)) |
| 26 | Labels match user language | Pass | Task-first index ("I want to…") |
| 27 | Links, anchors and code blocks work | Pass | Remediation URLs checked (HTTP 200) on 2026-10-18 |
| 28 | Every important page has an owner | Pass | Front matter `owner` on every docs page |
| 29 | Feature changes require a docs-impact review | Pass | [CONTRIBUTING](../CONTRIBUTING.md) "Docs impact" |
| 30 | Feedback leads to tracked improvements | Open | Turn on GitHub Issues with labels `docs`, `accessibility`, `detection` |

**Before submission:** close 05 (one fresh reader) and 14 (enable private reporting). 25 and 30 can follow.
