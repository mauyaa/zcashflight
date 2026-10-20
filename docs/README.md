---
title: ZcashFlight documentation
description: Find the page you need, by what you are trying to do.
audience: developer, evaluator, security reviewer
type: index
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# ZcashFlight documentation

ZcashFlight runs your Zcash app's real flows and checks every request and log line for exposed addresses, amounts, memos and transaction IDs. These pages are organised by what you want to do.

## Start

- [Quickstart](start/quickstart.md): your first run on your own app, with a check that it worked.
- [Tutorial: find and fix your first leak](start/tutorial.md): learn the loop on the ZecShop sample.

## Guides

- [Prove it on a real Zcash chain](guides/regtest.md): ZecShop against Zebra + Zallet regtest, before and after.
- [Run in CI](guides/run-in-ci.md): fail a pull request that introduces a leak.
- [Test a non-Node app](guides/non-node-apps.md): Rust, Go, Python or anything else, through the local proxy.
- [Test a browser wallet](guides/browser-wallets.md): scan a HAR export from DevTools.
- [Accept a known finding](guides/baseline.md): record a deliberate decision so CI stops flagging it.
- [Troubleshooting](guides/troubleshooting.md): symptoms, causes and fixes.

## Reference

- [CLI](reference/cli.md): every command, flag and exit code.
- [Policy file](reference/policy.md): every key in `zcashflight.yml`.
- [Rules](reference/rules.md): A–D, what triggers them, their severity.
- [Detection](reference/detection.md): which Zcash identifiers are recognised and how.
- [Run file](reference/run-file.md): the JSON format in `.zcashflight/runs/`.

## Concepts

- [Application-layer privacy](concepts/application-layer-privacy.md): why shielded transactions aren't the whole story.

## Product and architecture

- [Product brief](overview/product-brief.md): problem, audience, scope, measures and risks.
- [Requirements status](overview/requirements-status.md): each PRD requirement, its status and its evidence.
- [Architecture](architecture/overview.md): components, data flow, trust boundaries, plus [decision records](architecture/adr/).
- [Design system](design/design-system.md): tokens, components, documented exceptions and test results.

## Trust

- [Privacy (how the tool handles data)](../PRIVACY.md)
- [Threat model](trust/threat-model.md)
- [Security policy and reporting](../SECURITY.md)
- [Accessibility statement](trust/accessibility.md)
- [Privacy notice for the hosted demo](trust/demo-site-privacy.md)
- [Launch audit](LAUNCH_AUDIT.md): the 30-point release gate, with honest status.
