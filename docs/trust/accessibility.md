---
title: Accessibility statement
description: The accessibility standard the ZcashFlight dashboard targets, what has been tested, and the known gaps.
audience: everyone
type: policy
owner: design owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-19
---

# Accessibility statement

**Target:** WCAG 2.2 level AA for the dashboard (`zcashflight ui` and the hosted replay) and the HTML report.

## What has been checked

- **Contrast:** primary text 15.1:1, secondary text 7.6:1, muted text 5.4:1, coral leak text 6.9:1, navy on lime buttons 14.5:1; the journey line is 3.6:1. Values are measured, and listed in [ADR 0005](../architecture/adr/0005-concept-palette.md).
- **Targets:** every interactive control is at least 24 × 24 px (WCAG 2.2 AA, 2.5.8); primary buttons and the wordmark are at least 44 px tall. Masked values inside code evidence use the inline exception. Checked automatically on 18 screens at seven viewport sizes, 320 to 1920 px ([design system](../design/design-system.md#tested)).
- **Reflow:** no sideways scrolling at 320 px wide. Content reflows into a stacked layout at 820 px and below.
- **Focus:** a visible 2 px accent ring on every focusable element; Escape closes popovers and returns focus to the control that opened them.
- **Keyboard:** the journey works with Tab and Enter/Space, and ← / →, Page Up / Page Down and the mouse wheel move between moments; ↑ / ↓ scroll a long moment first. Typing in the folder field is never captured. Masked values reveal their proof with Space or Enter.
- **Meaning without colour:** severity always has a text label; closed leaks read "Closed" and are struck through.
- **Motion:** `prefers-reduced-motion` turns off transitions and animations.
- **Announcements:** notices (run finished, start and end of the walk) use a polite live region and always offer the next action.
- **Labels:** the folder field has a visible label above it; errors appear below the field, name the problem and the fix, and keep what was typed.

## Known gaps

- Not yet tested with screen readers (NVDA, JAWS, VoiceOver). The journey illustration is marked decorative (`aria-hidden`), and each moment is a labelled region, but announcements during a live run haven't been verified.
- Text spacing overrides (WCAG 1.4.12) haven't been tested systematically.
- The "hold for proof" interaction relies on press-and-hold with a pointer; keyboard users get the same information with Space or Enter.

## Feedback

Open an issue titled "Accessibility:" with what you tried and what happened.
