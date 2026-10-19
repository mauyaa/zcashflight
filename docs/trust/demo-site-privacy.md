---
title: Privacy notice for the hosted demo
description: What the hosted ZcashFlight demo page collects (nothing) and what its host receives.
audience: visitor
type: policy
owner: security/privacy owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-19
---

# Privacy notice for the hosted demo

**Who:** the ZcashFlight maintainers publish the demo page. **What it processes:** nothing about you.

- The page is static. It replays a recorded run of the ZecShop sample app; it can't scan anything and doesn't accept uploads.
- No cookies, no local storage, no analytics, no tracking pixels.
- No third-party requests. Fonts, illustrations and scripts are served from the page itself, and the Content-Security-Policy only allows the page's own origin.
- **The host** (Vercel) receives standard request information when your browser loads the page, such as your IP address, user agent and the time. That is processed under the host's own privacy policy, not by ZcashFlight.

**Changes:** this notice is versioned in the repository with the code; the date above shows the last review. **Contact:** open an issue in the repository.

The command-line tool and local dashboard have their own, separate description: [PRIVACY.md](../../PRIVACY.md).
