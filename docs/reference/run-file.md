---
title: Run file reference
description: The JSON format ZcashFlight writes to .zcashflight/runs/NNNN.json.
audience: developer, integrator
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Run file reference

Each run is saved as `.zcashflight/runs/NNNN.json` in the project root. Every value in it was masked at capture, so a run file is safe to attach to an issue. The schema is defined in [`src/engine/types.ts`](../../src/engine/types.ts) (`Run`, `Finding`, `MaskedHit`).

## `Run`

| Field | Type | Meaning |
|---|---|---|
| `version` | `1` | Format version |
| `n` | number | Run number in this project |
| `id` | string | Random run ID |
| `startedAt`, `finishedAt` | ISO 8601 | Timestamps (UTC) |
| `app`, `network` | string | From the policy |
| `policyHash` | string | First 12 hex of the policy file's sha256 |
| `protect` | data class[] | Classes protected in this run |
| `status` | `complete` \| `incomplete` \| `failed` | `incomplete`: a scenario couldn't finish, or nothing was heard. `failed`: the app didn't start |
| `error` | string? | Why, when not complete |
| `scenarios[]` | `{ name, description, ok, steps[{ request, status, ok, ms, error? }], window: [start, end] }` | What ran |
| `stats` | `{ requests, external, sinkholed, logs, hosts[] }` | Counts and destination hosts |
| `findings[]` | `Finding[]` | Sorted by severity, then first occurrence |
| `coverage` | `{ tested[], notTested[] }` | Printed in every report |
| `fingerprint` | string | `xxxx xxxx`, from the policy hash and finding IDs; identical runs give identical fingerprints |

## `Finding`

| Field | Meaning |
|---|---|
| `id` | Stable ID (see [rules](rules.md#finding-ids)) |
| `rule`, `ruleName`, `severity`, `title` | What and how serious |
| `classes` | Data classes involved |
| `destination` | Host, or log source |
| `scenario`, `step`, `occurrences` | Where and how often |
| `evidence[]` | `MaskedHit`: `{ cls, kind, network?, pool?, proof, path, masked, ref }` |
| `sample` | One masked request line or log line |
| `fields` | Body field names sent (rules A and D) |
| `at`, `stack[]` | Code location `{ file, line, col, fn? }`, and the project frames innermost first |
| `snippet` | Legacy optional field; new runs omit it so source literals cannot reintroduce secrets. Use `at` to open the source locally |
| `remediation` | `{ summary, steps[], refs[{ label, url }] }` |
| `repro` | Steps to reproduce |

## Stability

Fields are only added within format version 1. A removed or renamed field bumps `version`, and the change goes in the [changelog](../../CHANGELOG.md).

Comparisons return `verdict: incomplete` when either run failed, stopped, or has unsuccessful scenarios. No findings are marked closed in that case. An unexpected HTTP status makes a run incomplete; an empty or unknown scenario selection fails before starting the app.
