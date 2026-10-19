---
title: Design system and handoff
description: The tokens, components, interactions, responsive behaviour and documented exceptions behind the ZcashFlight dashboard, and how they were tested.
audience: designer, contributor
type: reference
owner: design owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-19
---

# Design system and handoff

The dashboard (`ui/`) is one horizontal journey: six moments on a single line, words top-left, the line at about 68% of the height, and each moment's circle in the right column. A walker carries you between moments. The **Product Design Operating Manual** governs grid, targets, contrast, motion and testing. The concept palette and its primary pill buttons with quiet secondary links are a documented exception in [ADR 0005](../architecture/adr/0005-concept-palette.md). All tokens live in `:root` at the top of [`ui/style.css`](../../ui/style.css).

## Tokens

Contrast is measured against `--paper` (#111c27).

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--paper` | #111c27 navy | Page background, text on lime | — |
| `--ink` | #eef1ea ivory | Headings, primary text | 15.1:1 |
| `--ink-2` | ivory at 68% | Body and secondary text | 7.6:1 |
| `--ink-3` | ivory at 55% | Muted labels, metadata | 5.4:1 |
| `--rule` | ivory at 12% | Dividers only (never a control boundary) | — |
| `--line` | #4a7a77 teal | The journey line, evidence rules | 3.6:1 |
| `--red` / `--red-ink` | #ff5a3c / #ff7d64 coral | A leak, and only a leak | 5.6:1 / 6.9:1 |
| `--accent` | #dcf5a6 lime | Primary buttons (navy text, 14.5:1), focus, the clean state | 14.5:1 |
| `--sans` | Instrument Sans 400/500/600, self-hosted (SIL OFL) | All text | — |
| `--mono` | System monospace | Evidence, commands | — |
| `--ease` | cubic-bezier(.22,.61,.36,1) | All transitions | — |

Nothing is heavier than weight 600.

## Brand

The wordmark is set in Michroma (SIL OFL) and converted to outlines by [`scripts/wordmark.py`](../../scripts/wordmark.py), which also writes the favicon (`ui/brand/icon.svg`) and the copy embedded in HTML reports (`src/brand.ts`). In the header its left edge sits on the content keyline at every width (`max(24px, (100vw − 1120px) / 2)`, `clamp(20px, 6vw, 30px)` below 820 px). It is 16 px tall on desktop and 13 px on narrow screens, inside a 44 px tap target that returns to the start. Docs and Source links sit on the opposite keyline.

The three circles hold the project's own illustrations: locks (the promise), gears (listening) and a paper plane (the report). They are cropped square, served from `ui/img/` and shown at full clarity, with no filter or overlay.

## Components

| Component | Anatomy and size | States |
|---|---|---|
| Button, primary | Lime pill, navy text, 15/500, at least 44 px tall (48 px and full width below 820 px) | hover (lift, brightness), active, focus-visible ring, `aria-busy` |
| Button, secondary | Quiet text link in `--ink-2`, underlined, at least 24 px tall | hover, focus |
| Policy chip | Inline toggle inside the policy sentence, `aria-pressed`, at least 24 px tall | on, off (struck), always on (`aria-disabled`, explained in text) |
| Severity tag | Text label (`High`, `Medium`, `Closed`); coral only for high and critical | meaning never by colour alone |
| Evidence block | Label above, teal 2 px left rule, mono 13 / 1.75, no filled box | masked values reveal their proof on hold, Space or Enter |
| Field | Visible label above, 16 px text (no zoom on iOS), errors below the field | focus, invalid (coral border and message) |
| Leak row | Index, title, severity tag; at least 42 px tall | hover and focus highlight the matching circle; closed (struck) |
| Footer map | One dot per moment with its name as a tooltip; 24 px hit area | current, done, focus |
| Popover | Scenes and Recorded/Local menus; scrolls inside itself | Escape closes and returns focus |
| Notice | Bottom toast, `role="status"`, `aria-live="polite"`, closes after about 5 s | carries the next action |

## Interactions

- **Moving between moments:** buttons, the footer map, the mouse wheel or trackpad, Page Up/Down and the arrow keys. A long moment scrolls its own text first; only then does the wheel move to the next moment. Typing in the folder field is never captured.
- **No dead ends:** every empty moment offers its next action (usually "Run on ZecShop"). At the start and end of the walk a notice says where you are and offers the way on; a notice also reports when a run or re-run finishes.
- **Leaks:** on the leaks moment a hand-drawn arrow and the label "TAP A LEAK" point at the circles until one is opened. Circles and list rows highlight each other on hover and focus. The promise, app and report circles are themselves clickable.
- **Walker:** steps follow distance travelled, so the feet never slide; the walk eases in and out (sine) over 900–1500 ms depending on distance.
- **Hosted demo:** the folder field explains how to run ZcashFlight on your own app instead of failing.

## Responsive behaviour

| Width | Layout |
|---|---|
| > 820 px | Text column up to 480 px beside a 460 px art column, 72 px gap, content within a 1120 px keyline |
| ≤ 820 px | Stacked: the art band on top (`clamp(150px, 31dvh, 270px)`), text below, a solid footer bar; buttons stack full width |
| ≤ 360 px | 20 px margins, smaller headings and art band, tighter rows |
| Short screens | Under 600 px tall on narrow screens the art band shrinks further |

## Motion

Moment content fades in over 450 ms. The walk takes 900–1500 ms. Circles close in sequence when fixes are verified. `prefers-reduced-motion` removes transitions and animations, and the arrow and marks are drawn immediately.

## Tested

The layout audit [`test/ui-audit.js`](../../test/ui-audit.js) walks 18 screens in recorded mode: the promise, choose app, policy, listening, leaks list, two leak details, all closed, report, every day, new leak and its detail, first visit, app didn't start, heard nothing, stopped, folder not found, and the Recorded popover. On each screen it checks for sideways scrolling, overflow without a cue, text running under the footer, and any interactive target under 24 × 24 px (WCAG 2.2 AA, 2.5.8).

| Viewport | Result (2026-10-19) |
|---|---|
| 320 × 640 | 18 / 18 |
| 390 × 844 | 18 / 18 |
| 768 × 1024 | 18 / 18 |
| 1024 × 768 | 18 / 18 |
| 1366 × 768 | 18 / 18 |
| 1440 × 900 | 18 / 18 |
| 1920 × 1080 | 18 / 18 |

To re-run: serve `ui/` (for example `python -m http.server` inside `ui/`), open it at a given size, then load a copy of `ui-audit.js` in the page. It resolves `window.__audit` to the report.

## Exceptions

| Exception | Why | Record |
|---|---|---|
| Concept palette, lime primary pills and quiet secondary links | Retain the selected concept | [ADR 0005](../architecture/adr/0005-concept-palette.md) |
| Walk of 900–1500 ms (above the 400 ms motion ceiling) | A spatial move across the whole stage; the manual's slow motion token covers large spatial change, and reduced motion removes it | This page |
| Secondary links and chips are 24 px, not 44 px, tall | Meets WCAG 2.2 AA (2.5.8); primary buttons and the wordmark keep 44 px or more | This page |
| Masked values are small inline targets in code evidence | WCAG 2.5.8 inline exception; also reachable with Space or Enter | This page |
