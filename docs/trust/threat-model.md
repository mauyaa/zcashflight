---
title: Threat model
description: What ZcashFlight protects, from whom, where its trust boundaries are, and what it does not defend against.
audience: security reviewer
type: explanation
owner: security/privacy owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Threat model

Following the OWASP threat-modelling structure: assets, actors, trust boundaries, threats and mitigations.

## Assets

1. **Test data** the app handles during a run: addresses, amounts, memos, txids, and potentially keys or seeds if the app mishandles them.
2. **The developer's machine and source**, where ZcashFlight runs with the developer's permissions.
3. **Findings**: masked, but they still describe where an app is weak.

## Actors

| Actor | Capability |
|---|---|
| Developer (trusted) | Runs ZcashFlight on their own code |
| A web page in the developer's browser | Can send requests to localhost, and attempt DNS rebinding |
| A third-party service the app calls | Receives whatever the app sends |
| Someone who gets the run files or a CI log | Reads stored findings |
| A malicious dependency or upstream package | Runs code with the tool's permissions |

## Trust boundaries and mitigations

| Threat | Mitigation | Evidence |
|---|---|---|
| Raw sensitive values written to disk by the tool | Detect and mask inside the app process; only masked events are written; the capture file is deleted after each run | `test/zecshop.test.ts` asserts no raw value in `.zcashflight/`; [ADR 0002](../architecture/adr/0002-mask-at-capture.md) |
| Running the test sends the leak to the real third party | Sinkhole by default | `stats.sinkholed == stats.external`, asserted in tests; [ADR 0004](../architecture/adr/0004-sinkhole-by-default.md) |
| Linking runs to each other through hashes | Per-run random HMAC key held only in memory | `engine.test.ts`: refs differ across keys |
| Credentials captured | `Authorization`, `Cookie`, `Proxy-Authorization` and `X-Api-Key` are never inspected or recorded | `inspect.ts` |
| A web page drives the local dashboard (CSRF) | Every API call needs a per-session random token; comparison is constant-time | `curl` without a token → 401 |
| DNS rebinding against the dashboard | Requests with a non-local `Host` are refused | `Host: evil.example.com` → 403 |
| Path traversal in the dashboard's static files | Resolved paths must stay inside `ui/` | `/../package.json` → 404 |
| Script injection in the dashboard from finding text | All finding text is escaped before insertion; CSP `default-src 'self'`, no `eval` | `ui/app.js` `esc()`; the CSP blocks eval (observed) |
| Supply-chain compromise | Zero runtime dependencies | `package.json` has no `dependencies` |
| The regtest harness pays orders or mines blocks in a real deployment | Its routes (`/regtest/pay`, `/regtest/mine`) exist only when `REGTEST_CUSTOMER_ADDRESS` is set, and only the regtest policy sets it. The `zebra`/`zebra` RPC credentials are Z3's fixed regtest defaults, valid only on that local network | `examples/zecshop/server.ts`; [regtest guide](../guides/regtest.md) |
| A body ZcashFlight cannot read is mistaken for a clean one | Unknown body types, bodies over 5 MB, malformed or unsupported compression, binary bodies and encrypted proxy tunnels are recorded as uninspected and listed under "Not inspected" in every output (CLI, reports, SARIF tool notifications, dashboard); `strict: true` fails the CI gate on them | `test/channels.test.ts`, `test/proxy.test.ts` |
| A decompression bomb exhausts memory | Compressed input and decompressed output are each capped at 5 MB (`maxOutputLength`); over-limit or malformed data is reported as uninspected | `test/channels.test.ts` |
| A reversible encoding of a protected value is stored | A base64 value that decodes to protected data is masked whole (`[base64 carrying utest1…]`), wherever it appears | `test/channels.test.ts` asserts no raw or base64 form is stored |
| Arbitrary command execution from a policy file | `app.start` runs a shell command, by design. Only run policies you trust, as with any `npm start` | Documented here and in the quickstart |

## Trust boundary: the app's own output

ZcashFlight inspects what the app writes to the console, `process.stdout` / `stderr`, file descriptors 1 and 2, and the log files you list, and stores only masked results. It does **not** rewrite or sanitise the app's own stdout, its log files, or anything a third-party logging sink receives: those keep whatever the app wrote. Use synthetic values, and treat the app's own output and CI logs as sensitive.

## Not instrumented

Traffic through these surfaces is not seen at all, and every live report lists them under "Not tested": `node:http2`, WebSocket, raw TCP/TLS/UDP sockets (`node:net`, `node:tls`, `node:dgram`), undici used directly (not through global `fetch`), worker threads, and child processes that are not Node. Node child processes are covered when they inherit `NODE_OPTIONS` (the default; observed with `npm start` spawning `node`).

## Not defended against

- A compromised developer machine or Node runtime.
- An app that deliberately hides traffic from the collector (raw sockets, native modules, child processes started without `NODE_OPTIONS`).
- HTTPS bodies through the proxy (host only, by design).
- Network-layer metadata: IP address, TLS fingerprinting, timing.
- Someone with the run files learning *which* kinds of leaks an app has. Findings are masked, not secret.
- Arbitrary secrets or personal data outside supported identifier and field-context detection. Review metadata and unrecognised log text before sharing.
- Rewriting the app's own logs or console output, or cleaning historical artifacts. New reports omit source snippets, but older reports may still contain them.

The regression suite in `test/privacy-regressions.test.ts` checks encoded and duplicate URL fields, JSON escapes, field-name identifiers, NDJSON imports, source literals, loopback lookalikes, HTTP option overrides, automatic redirect blocking, incomplete runs, malformed dashboard requests and static-root containment.

## Reporting

See [SECURITY.md](../../SECURITY.md).
