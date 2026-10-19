---
title: Troubleshooting
description: Symptoms, their likely causes, what to do, and how to check it worked.
audience: developer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Troubleshooting

| Symptom | Likely cause | Action | Verification |
|---|---|---|---|
| `Something is already listening on http://127.0.0.1:…` | Another process (often an earlier copy of your app) holds the port | Stop it, or change `app.url` and the port your app uses | The next run prints `app is up, collector listening` |
| `… exited before it was ready (code 1)` | The start command fails | Run `app.start` yourself in the project folder; fix the error it prints (shown under the message) | The app starts by hand, then under ZcashFlight |
| `… did not answer /health within 15s` | Wrong `app.url` or `app.ready`, or a slow start | Check both paths; raise `app.timeout_ms` | `curl <url><ready>` answers while the app runs |
| `silent: the app ran but nothing reached the collector` | Non-Node app, or a Node app started through a wrapper that drops `NODE_OPTIONS` | Set `app.proxy: true` ([guide](non-node-apps.md)); make sure the wrapper passes environment variables | `stats.requests` above 0 in the run |
| `stopped: refunds and errors didn't run` | A scenario step couldn't reach the app (it crashed or closed the connection) | Read the app's error output; fix it, then run again | The run's status is `complete` |
| A step shows `→ 500` and the scenario is marked incomplete | The app returned a server error | If that's expected, add `expect: 500` to the step | The step shows as ok |
| `{{order}}` arrives empty in a later step | The earlier step's `save:` path doesn't match its JSON response | Check the response field name: `save: { order: order_id }` reads `response.order_id` | The later request path contains the value |
| A finding you think is wrong | A legitimate destination isn't in `destinations:`, or it lacks the data class in `allow:` | Add it with a `purpose`, or record a reviewed exception ([baseline](baseline.md)) | The finding no longer appears, or CI passes with it accepted |
| `error: unknown data class "address book"` | A typo in `protect:` or `allow:` | Use: addresses, amounts, memos, transaction IDs, viewing keys, spending keys, seed phrases | `zcashflight run` gets past loading the policy |
| `zcashflight: command not found` | Not installed on the PATH | From a checkout: `npm link` ([quickstart](../start/quickstart.md)) | `zcashflight version` prints `0.1.0` |
| Windows PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell's execution policy blocks npm's script shim | Use `npm.cmd run ui` (or `npm.cmd test`), or call Node directly: `node bin/zcashflight.js ui --dir examples/zecshop`. There's no need to change the execution policy | The dashboard prints `zcashflight dashboard on http://127.0.0.1:4610/` |
| `SyntaxError … TypeScript` on start | Node older than 22.18 | Upgrade Node | `node --version` is 22.18 or later |

Still stuck? Open an issue with the command you ran, the output, and your `zcashflight.yml`. Remove anything private first. For security problems, use [SECURITY.md](../../SECURITY.md) instead.
