# ADR 0005: Keep the concept palette as a documented exception

**Status:** Accepted · 2026-10-18 · Owner: design owner

**Decision.** The dashboard uses the ZcashFlight concept palette (navy `#111c27`, ivory `#eef1ea`, lime `#dcf5a6`, coral `#ff5a3c`/`#ff7d64`, teal) instead of one of the design system's four modes. Every other part of the system applies: type, spacing, radii, components, targets, contrast and motion.

**Context.** The design system says never to invent a palette. The ZcashFlight identity (logo, wordmark, walker, journey) was designed in this palette before the product was built, and the product owner chose to keep it.

**Evidence / standard.** Measured contrast on navy: ivory 15.1:1; secondary text (ink at 68%) 7.6:1; muted text (ink at 55%) 5.4:1; lime 14.5:1; coral text 6.9:1. The journey line `#4a7a77` is 3.6:1, which meets WCAG 1.4.11 (3:1). The concept's earlier muted ink at 40% (3.5:1) and line `#2f5655` (2.1:1) failed, and were changed.

**Alternatives considered.** Dark Native (the system's crypto mode), Product Light (the system default), Product Dark.

**Why this choice.** Brand continuity with existing assets; the palette passes WCAG AA once the two failing values are corrected; the design system's *structure* still applies in full.

**How the system's rules map onto it.** Lime is used for primary pill buttons, eyebrows, links, marks and focus. Secondary actions are quiet underlined text links. The primary pill and text-link pairing is an additional concept exception to the system's rectangular ink buttons. Evidence and terminal blocks use a teal left rule with their label above, rather than raised boxes. Coral identifies leaks and decorative journey marks; severity always has a text label. In light mode and print, reports use the system's Product Light tokens.

**Brand and illustration update (reviewed 2026-10-20).** The lime Z mark is the only logo. It appears with the ZCASHFLIGHT name (Michroma, SIL OFL) in the header and HTML reports, and alone as the favicon and app icon; `scripts/brand.py` generates every asset from the mark's master SVG. The earlier Z-circle and "ZF" marks have been removed. The three circles hold the team's own illustrations at full clarity, with no overlay. The palette governs interface elements, not the colours inside the illustrations.

**Accessibility impact.** Positive: two contrast failures fixed. **Responsive impact:** none.

**Review trigger.** A rebrand, or the product moving into a family that uses the system's standard modes.
