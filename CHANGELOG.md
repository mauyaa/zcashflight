# Changelog

## Unreleased — reviewed 2026-10-19

### Fixed

- Detect every repeated query/form parameter; mask decoded URL and JSON log values, including percent escapes, form spaces, JSON escapes and alternate numeric spellings. Remove URL credentials and mask recognised identifiers in field metadata.
- Inspect NDJSON imports as logs instead of trusting their content as pre-masked events. This changes saved-capture import semantics; use HAR for request imports.
- Omit optional source snippets from new findings so hardcoded secrets cannot bypass capture masking. Code locations remain available.
- Wait for the HTTP sink server before app startup; honour URL/options hostname overrides; distinguish literal loopback addresses from DNS lookalikes; capture DataView bytes correctly.
- Reject automatic fetch redirects in sinkhole mode to prevent unobserved network hops. Manual redirects with explicit subsequent fetch calls remain supported.
- Keep keys and seeds protected in log policies. Failed HTTP expectations and empty scenario selections cannot pass as clean runs; incomplete comparisons close no findings and exit with code 2.
- Reject malformed dashboard tokens and URL escapes without crashing, and enforce the static directory boundary.
- Preserve POSIX leading slashes in stack-frame locations.
- Leak details: the back / next row no longer overlaps the title (a header class collided with it); long evidence lines wrap instead of scrolling sideways. The layout audit now checks both, plus the logo against the header links.
- Code locations resolve when the project path is a symlink (macOS `/var` → `/private/var`).
- The installed package (`dist/`) loads its collector correctly; previously apps failed to start when run from a build.
- Dashboard: "Run on <your app>" runs the open project (it ran the ZecShop sample); a reload keeps the last saved run; singular wording for one leak, request or fix.
- `zcashflight ui` explains a busy port instead of crashing; `init` names the app after its package and links the policy reference.

### Design and documentation

- The lime Z mark is the project's only logo and the Z of the name: the logo reads ZCASHFLIGHT, the mark followed by CASHFLIGHT in Michroma (SIL OFL), cap-height aligned and spaced as the typeface spaces Z to C. Used in the header, HTML reports, README and a 1200 × 630 share image; the mark alone is the favicon and app icon. `scripts/brand.py` builds every asset from the mark's master SVG; the old Z-circle and "ZF" marks are gone.
- The logo is aligned to the content keyline at every width with a 44 px tap target.
- Concept positioning and buttons restored; the project's own illustrations (locks, gears, paper plane) in the three circles.
- Scroll (wheel/trackpad), Page Up/Down and arrow keys move between pages; long pages scroll first, and typing in the folder field is never interrupted.
- Page 4: a hand-drawn arrow and "TAP A LEAK" label point to the leak circles; circles and list rows highlight each other; hero, app and final circles are clickable.
- The folder field works on the hosted demo too, explaining how to run on your own app.
- Docs and Source links in the header; the landing offers See it work and Get started.
- Walker about 20% larger, steps tied to distance so feet never slide, sine-eased walk; a Basquiat crown.
- No dead ends: empty pages offer the next action; notices at the start and end of the walk and when a run finishes.

- Interactive targets meet WCAG 2.2 AA (24 px); the layout audit passes 18/18 at seven sizes. Design system, accessibility statement and ADR 0005 updated to match.
- Document capture limits, redirect compatibility, legacy artifacts and the need to review reports before sharing. Dashboard failure states now remain incomplete after reruns and when revisited.

### Validation scope

- The local Windows suite includes additional privacy and server regressions.

## 0.1.0 — 2026-10-18

First release, built for Zecathon.

### Added

- `zcashflight run`: starts an app with an in-process collector, runs scenarios from `zcashflight.yml`, and reports findings with masked evidence, code location and remediation.
- Zcash-aware detection: unified, Sapling, TEX, Sprout and transparent addresses; unified and Sapling viewing keys; Sapling, Sprout and WIF spending keys (checksum-verified); BIP-39 seed phrases; txids, amounts and memos by context.
- Rules A–D: data in requests, data in logs, transparent exposure in wallet RPC sends, third-party flows.
- Sinkhole for third-party requests during tests (on by default).
- `compare`, `report` (Markdown, HTML, SARIF, JSON), `scan` (HAR, logs), `proxy`, `init`, `synth`, `list`.
- CI mode (`--ci`, `--fail-on`, baseline file), GitHub Action, job summary.
- Local dashboard (`zcashflight ui`) and a recorded-replay mode for the hosted demo.
- ZecShop sample app with five seeded leaks and their fixes; a 21-case validation suite; end-to-end tests.

### Security

- Values are masked at capture; raw payloads are never written to disk.
- The dashboard is bound to 127.0.0.1, with a session token, a Host check and a strict CSP.
