---
title: Accept a known finding
description: Record a deliberate decision so CI stops failing on a finding you have reviewed.
audience: developer, security engineer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Accept a known finding

**Outcome:** a finding you have reviewed and accepted no longer fails CI, and the decision is written down with its reason.

**Warning:** accepting a finding doesn't make it private. Prefer fixing it, or approving the destination in `zcashflight.yml` with an explicit `purpose` if the data flow is legitimate. Use the baseline for temporary, reviewed exceptions.

## Steps

1. Find the finding's ID: run `zcashflight report --format json` and look for `"id"` on the finding (10 hex characters, for example `8b45d83f7a`).
2. Create or edit `zcashflight.baseline.json` next to `zcashflight.yml`:

   ```json
   {
     "accepted": [
       { "id": "c89bf9c1fb", "title": "Checkout activity revealed to a price API", "reason": "Rate cache job ships in v2.3; tracked in #142" }
     ]
   }
   ```

3. Commit it, so the decision is reviewed like code.

## Verify

`zcashflight run --ci` exits 0 when the only findings are in the baseline. The findings are still printed and still appear in reports. The baseline changes the exit code, never the evidence.

## Recover

To stop accepting it, delete the entry. The next CI run fails again if the finding is still there.
