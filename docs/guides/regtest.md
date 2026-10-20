---
title: Prove it on a real Zcash chain (Zebra + Zallet regtest)
description: Run ZecShop against a real Zebra node and Zallet wallet on a local regtest network, and watch ZcashFlight fail the leaky build and pass the fixed one.
audience: developer, judge
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-20
---

# Prove it on a real Zcash chain

**Goal:** by the end, ZecShop has taken real shielded payments, swept funds and issued refunds on a local Zcash regtest chain, and ZcashFlight has failed the leaky build (exit 1) and passed the fixed one (exit 0).

`npm run demo` uses a mock wallet so it runs anywhere in seconds. This guide replaces the mock with the real thing: [Zebra](https://github.com/ZcashFoundation/zebra) as the node and [Zallet](https://github.com/zcash/zallet) as the wallet, both run by the Zcash Foundation's [Z3](https://github.com/ZcashFoundation/z3) Docker stack.

## What is real, and what is a test harness

| Part | Real or harness |
|---|---|
| Addresses | Real: unified addresses derived by Zallet from its seed (`uregtest1…`), with Orchard, Sapling and transparent receivers |
| Payments, sweeps, refunds | Real: `z_sendmany` transactions built and proved by Zallet, mined by Zebra |
| Receivers of a unified address | Real: `z_listunifiedreceivers` (ZIP 316), answered by Zallet |
| Confirmations | Real: Zallet applies ZIP 315 (its own change after 3 blocks, other funds after 10) |
| The customer's wallet | Harness: ZecShop exposes `POST /regtest/pay/:order` only when `REGTEST_CUSTOMER_ADDRESS` is set. It pays the order from a second account in the same wallet, then mines a block |
| Mining | Harness: blocks are mined on demand with Zebra's regtest `generate` RPC |
| Analytics, error monitoring, price API | Not real: ZcashFlight's sinkhole answers them locally, so no payment data leaves your machine |

## Before you start

- Docker with Docker Compose 2.24.4 or later, Git, Node 22.18 or later, and `openssl` (bundled with Git for Windows).
- About 2 GB of disk for the images. Regtest has no peers and syncs nothing.

## 1. Start Zebra and Zallet

```bash
git clone https://github.com/ZcashFoundation/z3 && cd z3
```
```bash
./scripts/regtest-init.sh
```
```bash
docker compose --env-file .env.regtest up -d zebra zallet
```

On Linux and macOS these are Z3's documented commands. The end-to-end proof below was run on 20 Oct 2026 from Windows 11 and from a fresh clone on Linux (Ubuntu in WSL 2, Node 24), both against the same Zebra + Zallet stack in Docker Desktop.

**On Windows (Git Bash)** the init script stops at the wallet step, because Git Bash rewrites the container paths. This sequence was tested on Windows 11 with Docker Desktop:

```bash
export COMPOSE_PATH_SEPARATOR=:
./scripts/regtest-init.sh          # starts Zebra and mines the activation blocks, then fails at the wallet step
export MSYS_NO_PATHCONV=1
C="docker compose --env-file .env.regtest"
docker run --rm -v z3-regtest-zallet:/data busybox sh -c 'chown 1000:1000 /data; rm -f /data/.lock /data/wallet.db'
$C run --rm --no-deps zallet --datadir /var/lib/zallet --config /etc/zallet/zallet.toml generate-encryption-identity
$C run --rm zallet --datadir /var/lib/zallet --config /etc/zallet/zallet.toml init-wallet-encryption
$C run --rm zallet --datadir /var/lib/zallet --config /etc/zallet/zallet.toml generate-mnemonic
$C up -d zebra zallet
```

Keep both variables set in that shell for every later `docker compose` command.

**Check:** `curl -s -u zebra:zebra -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getwalletinfo","params":[]}' http://127.0.0.1:50232/` returns a `result`. The `zebra` / `zebra` credentials are Z3's fixed regtest defaults and only work on this local network.

## 2. Prepare the wallet

From the ZcashFlight checkout:

```bash
cd examples/zecshop && node regtest/setup.ts
```

The first time, it creates three accounts (customer, merchant, cold storage) and stops with an instruction like:

```
Zebra is not mining to this wallet. In the z3 folder, set the miner address and restart Zebra:
  ZEBRA_MINING__MINER_ADDRESS=tm…   (in .env.regtest)
  docker compose --env-file .env.regtest up -d zebra
```

Do exactly that, then run `node regtest/setup.ts` again. It mines past coinbase maturity, shields the coinbase into the customer's Orchard receiver, gives the merchant eight 1 ZEC notes, and writes `zcashflight.regtest.yml` with this wallet's addresses (it is gitignored, because the addresses are specific to your wallet).

## 3. Run the proof

From the repository root:

```bash
npm run regtest
```

## Check that it worked

The run ends with lines like these (block numbers differ):

```
Regtest chain: blocks 276–291, 8 non-coinbase transactions built by Zallet and mined by Zebra during this proof.
CI gate: before fixes exit 1 (fails the build), after fixes exit 0 (passes).
```

Before the fixes, ZcashFlight reports five findings against real values: a ZIP 321 payment request (address, amount and memo) sent to analytics, a real transaction ID written to the log, the real memo sent to error monitoring, a price API on the checkout path, and a refund sent with `AllowRevealedRecipients` to the customer's real transparent receiver. After the fixes, the same scenarios close all five. The command exits 0 only if both gates behave.

To run either half yourself: `zcashflight run --policy zcashflight.regtest.yml --ci` from `examples/zecshop`, with `node scripts/fixes.ts reset` or `apply` in between.

## If it didn't work

| You see | Do this |
|---|---|
| `cannot reach http://127.0.0.1:50232` | Start the stack (step 1). `docker compose --env-file .env.regtest ps` should list `zebra` and `zallet` as running |
| `Zebra is not mining to this wallet` | Set the printed miner address in `.env.regtest`, restart Zebra, run setup again |
| `Insufficient balance` | Mine a few blocks (`npm run regtest` mines as it goes); Zallet's ZIP 315 policy needs 3 or 10 confirmations before funds are spendable |
| `GetFileAttributesEx …docker-compose.yml:docker-compose.regtest.yml` on Windows | `export COMPOSE_PATH_SEPARATOR=:` (see the Windows sequence in step 1) |
| `Configuration file at /var/lib/zallet/C:/Program Files/Git/…` on Windows | `export MSYS_NO_PATHCONV=1`, then run the wallet steps by hand (step 1) |

## Clean up

```bash
docker compose --env-file .env.regtest --profile "*" down -v
```

This deletes the regtest chain and wallet volumes.
