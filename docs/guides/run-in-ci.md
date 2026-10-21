---
title: Run ZcashFlight in CI
description: Fail a pull request that introduces a privacy leak, and show the finding at its line in GitHub code scanning.
audience: developer, security engineer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# Run ZcashFlight in CI

**Outcome:** every pull request runs your scenarios. A new leak fails the check, the job summary shows the report, and the finding appears in GitHub code scanning at the line that caused it.

**Before you start:** your repository has a working `zcashflight.yml` (see the [quickstart](../start/quickstart.md)), and the runner can start your app (dependencies installed, ports free).

## Steps

1. Add `.github/workflows/privacy.yml`:

   ```yaml
   name: privacy
   on: pull_request
   jobs:
     zcashflight:
       runs-on: ubuntu-latest
       permissions:
         contents: read
         security-events: write      # for the SARIF upload
       steps:
         - uses: actions/checkout@v4
         # install your app's own dependencies here, e.g. npm ci
         - uses: mauyaa/zcashflight@7238064c05f1d32e559ac0c136bf1176246e5123   # a commit whose "action" workflow is green
           with:
             dir: .
             fail-on: medium
             sarif: zcashflight.sarif
         - uses: github/codeql-action/upload-sarif@v3
           if: always()
           with:
             sarif_file: zcashflight.sarif
   ```

   Pin the action to a full commit SHA, as above (there is no release tag yet). Or check the tool out next to your code and call it directly:

   ```yaml
         - uses: actions/checkout@v4
           with: { repository: mauyaa/zcashflight, path: .zcashflight-tool }
         - uses: actions/setup-node@v4
           with: { node-version: 24 }
         - run: node .zcashflight-tool/bin/zcashflight.js run --ci --sarif zcashflight.sarif
   ```

2. Open a pull request.

## Verify

- The **zcashflight** check is green when no new finding is at or above `fail-on`.
- The job summary contains the Markdown report: the headline, a findings table, and what was and wasn't tested.
- With a leak, the check fails and **Security → Code scanning** lists it as `ZF-A`, `ZF-B`, `ZF-C` or `ZF-D` at the offending line.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Run complete; nothing new at or above `--fail-on` |
| 1 | At least one finding at or above `--fail-on` that isn't accepted in `zcashflight.baseline.json` |
| 1 | With `strict: true` in the policy: traffic ZcashFlight saw but could not read |
| 2 | Run incomplete or failed (app didn't start, scenario couldn't reach it, policy error) |

## If it fails for the wrong reason

- **Exit 2, "already listening":** another service in the job uses the same port. Change `app.url`.
- **A finding you've decided to accept:** record it in the baseline. See [Accept a known finding](baseline.md).

## Next

- [Rules reference](../reference/rules.md): what each rule ID means.
- [Troubleshooting](troubleshooting.md)
