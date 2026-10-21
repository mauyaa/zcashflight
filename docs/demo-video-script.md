---
title: Demo video script (2:00)
description: Shot-by-shot script for the two-minute ZcashFlight demo: exact commands, what is on screen, voiceover, setup and editing notes.
audience: maintainer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# Demo video script (2:00)

**Hard limit: 2:00.** Every shot below shows real captured footage of commands that were run and passed. Waiting time is cut or time-lapsed, and every cut is marked on screen (a small "⏩ sped up" label), so nothing looks instant that wasn't.

## Before recording

1. **Machine:** Node 22.18+, Git, Docker Desktop running. Do Not Disturb on; close chat, mail and anything with notifications. Terminal: dark theme, 18–20 pt font, about 1500 × 900, a short prompt (no user or machine name).
2. **Repository:** `git clone https://github.com/mauyaa/zcashflight && cd zcashflight && npm ci`.
3. **Real chain:** start Zebra + Zallet and prepare the wallet as in [the regtest guide](guides/regtest.md), then rehearse once: `npm run regtest` must end with `before fixes exit 1 … after fixes exit 0`.
4. **Reset the sample:** `node examples/zecshop/scripts/fixes.ts reset`.
5. **Browser:** a clean window on <https://zcashflight.vercel.app>, zoom 100%, no bookmarks bar.
6. **Recorder:** 1920 × 1080, 30 fps, cursor visible. Record the voiceover separately, in a quiet room.

## Shots

| Time | On screen | Voiceover |
|---|---|---|
| **0:00–0:15** The problem | A still: a shielded Zcash payment (sender, recipient and amount hidden) with an arrow from its memo to an analytics dashboard. Then zcashflight.vercel.app, landing page. | "A shielded Zcash payment hides who paid whom, and how much. But the app around it can still leak the address, the amount, even the memo, to analytics, logs and error trackers. ZcashFlight catches that before you ship." |
| **0:15–0:30** A real chain | Terminal in the z3 folder: `docker compose --env-file .env.regtest ps` showing `zebra` and `zallet` running. Then, in the repo, type `npm run regtest`. | "This is a real Zcash regtest network: Zebra as the node, Zallet as the wallet. Our sample shop takes real shielded payments, sweeps funds and issues refunds." |
| **0:30–0:50** Five leaks, with evidence | ⏩ sped up through setup. Pause on `5 privacy leaks found.` Zoom on the first finding: `payment_request[zip321].address / amount / memo`, all masked, `server.ts:60`. Then the transparent refund (`C · … lib/refund.ts:9`). | "Five leaks. The checkout hands its ZIP 321 payment request to analytics, so the address, amount and memo all go with it. Each finding shows masked evidence, the line that sent it, and a fix." |
| **0:50–1:05** Fixed and verified | ⏩ sped up through `Apply the fixes` and the second run. Hold on `All 5 leaks closed.` and the last two lines: `N non-coinbase transactions built by Zallet and mined by Zebra` and `CI gate: before fixes exit 1 … after fixes exit 0`. | "The fixes are applied and the same scenarios run again, with real transactions on the chain. All five close, and the CI gate goes from failing to passing." |
| **1:05–1:25** Channels it reads | Terminal: `cd test/fixtures/channels && node ../../../bin/zcashflight.js run`. Scroll the ten findings: `body.data[base64].address`, `body[gzip].address`, `body[form-data].address`, `log.txid` from `process.stdout`, `paid txid` from `console.log`. | "Leaks hide in more than JSON. ZcashFlight decodes base64, gzip, form data, blobs and streams, and reads stdout as well as the console. Nine reference channels, nine found. On an independent open-source checkout, it found the payment txid written to the logs; a two-line fix closed it." |
| **1:25–1:40** Honest about gaps | `node ../../../bin/zcashflight.js run --policy zcashflight.strict.yml --ci`, then `echo $?` → `1`. Highlight the `not tested:` lines (an async-iterable body, a 6 MB blob, a gzip bomb). | "And what it can't read, it says. Unreadable bodies are listed, never counted as clean, and strict mode fails the build on them." |
| **1:40–1:55** Into CI | GitHub: the `action` workflow run (green), then the README's workflow snippet. | "Drop it into CI with the GitHub Action. A leak fails the pull request, and the finding shows up in code scanning at its line." |
| **1:55–2:00** Call to action | End card: the ZcashFlight logo, `zcashflight.vercel.app`, `github.com/mauyaa/zcashflight`. | "ZcashFlight. Privacy should be verified, not merely promised." |

**Case studies:** they are anonymised ("an independent open-source checkout"); never name the projects on screen or show their code until the maintainers have been contacted.

## Exact commands (in order)

```bash
docker compose --env-file .env.regtest ps
```
```bash
npm run regtest
```
```bash
cd test/fixtures/channels && node ../../../bin/zcashflight.js run
```
```bash
node ../../../bin/zcashflight.js run --policy zcashflight.strict.yml --ci; echo $?
```

Afterwards, `node examples/zecshop/scripts/fixes.ts reset` (from the repo root) restores the sample for the next take. `npm run regtest` already does this at the end.

## Say, and don't say

- **Say:** "catches these leaks in the flows you test"; "unreadable bodies are reported, never counted as clean"; "real Zebra + Zallet regtest".
- **Don't say:** "guarantees privacy", "certifies", "finds every leak", "works on mainnet funds"; don't present the hosted site as a live scanner (it replays a recorded run); don't show keys, real addresses, your email, desktop or account pages.

## Edit and export

- Cut waiting time, and label each cut "⏩ sped up". Keep every result line on screen for at least 2 seconds.
- Zoom on findings so the masked evidence is readable on a phone. Add captions from the voiceover.
- MP4 (H.264), 1920 × 1080, **under 2:00**. Watch it once from start to end before uploading.
