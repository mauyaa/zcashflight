# ADR 0003: Deterministic rules, no AI judgement

**Status:** Accepted · 2026-10-18 · Owner: product owner

**Context.** The PRD lists an optional LLM to explain findings, and says AI should explain, not decide. Sending findings to an external model would move test data off the machine, and a model's judgement isn't reproducible in CI.

**Options.** (1) An LLM classifies or explains findings. (2) Deterministic rules with written remediation per rule and destination category.

**Decision.** Option 2 for v0.1. Findings come only from rules A–D over observed, masked events. Each finding carries hand-written remediation steps and documentation links.

**Consequences.** Identical input gives identical output, so CI gating and fingerprints are meaningful. No data leaves the machine. Remediation text is generic per category, not tailored to each codebase.

**Review trigger.** An explanation feature that can run fully locally, opt-in, on masked findings only.
