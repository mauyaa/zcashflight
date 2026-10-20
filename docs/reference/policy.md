---
title: Policy file reference (zcashflight.yml)
description: Every key in zcashflight.yml, its type, default and effect.
audience: developer
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Policy file reference: `zcashflight.yml`

ZcashFlight looks for `zcashflight.yml` (or `.yaml`) in the project folder. The file uses a YAML subset: maps, lists, `[flow, lists]`, `{flow: maps}`, quoted and plain scalars, and `#` comments. Tabs aren't allowed for indentation.

## Top level

| Key | Type | Default | Effect |
|---|---|---|---|
| `version` | number | `1` | Format version |
| `network` | string | `testnet` | Label shown in reports (`testnet`, `regtest`, `mainnet`) |
| `app` | map | — | How to start and reach the app (below) |
| `protect` | list of data classes | all seven | Data that must not leave the app. Viewing keys, spending keys and seed phrases are **always** added |
| `destinations` | list | `[]` | Approved hosts and what each may receive (below) |
| `logs` | list | `[]` | Log files to inspect: a path string, or `{ path, allow }` |
| `transactions.shielded_only` | boolean | `true` | Turns on rule C for wallet sends |
| `sinkhole` | boolean | `true` | Answer requests to non-local hosts locally during tests |
| `scenarios` | list | `[]` | Flows to run (below) |
| `not_tested` | list of strings | network metadata note | Printed in every report as "Not tested" |

**Data classes:** `addresses`, `amounts`, `memos`, `transaction IDs`, `viewing keys`, `spending keys`, `seed phrases`. Singular forms and `txid` are also accepted.

## `app`

| Key | Type | Default | Effect |
|---|---|---|---|
| `name` | string | `app` | Shown in reports |
| `start` | string | — | Command that starts the app. A leading `node` uses the same Node as ZcashFlight |
| `url` | URL | `http://127.0.0.1:3000` | Base URL for scenario requests |
| `ready` | path | `/` | Polled until it answers (any status below 500) |
| `env` | map | `{}` | Extra environment variables for the app |
| `timeout_ms` | number | `15000` | How long to wait for `ready` |
| `proxy` | boolean | `false` | Also route `HTTP(S)_PROXY` through ZcashFlight, for non-Node apps |
| `root` | path | `.` | Project root, relative to the policy file |

## `destinations[]`

```yaml
destinations:
  - host: 127.0.0.1:18232          # exact host:port, a bare host, or *.example.com
    purpose: Wallet RPC (zallet)    # shown in the dashboard; write down why
    allow: [addresses, amounts, memos, transaction IDs]
```

A listed host with `allow: []` may receive requests, but no protected data, so rule D doesn't fire for it. Keys and seeds can't be allowed anywhere.

## `scenarios[]`

```yaml
scenarios:
  - name: refunds
    description: A returning customer checks out, then the order fails.
    steps:
      - request: POST /api/checkout       # METHOD /path
        json: { amount: 0.1 }             # sent as application/json
        headers: { x-test: "1" }          # optional
        save: { order: order_id }         # read response.order_id into {{order}}
      - request: POST /api/orders/{{order}}/fail
        expect: 200                       # optional; otherwise any status below 500 is ok
        timeout_ms: 180000                # optional; default 10000 (real wallet sends take longer)
```

`save` paths use dots for nesting (`data.order.id`). `{{name}}` works in paths and in any string in `json`.

## Example

The ZecShop sample policy, [`examples/zecshop/zcashflight.yml`](../../examples/zecshop/zcashflight.yml), uses every common key.
