# ADR 0002: Mask at capture

**Status:** Accepted · 2026-10-18 · Owner: security/privacy owner

**Context.** To check an address's checksum or a seed phrase against the BIP-39 list, the tool needs the raw value. Storing raw values for later analysis or display would make the tool's own files a leak.

**Options.** (1) Capture raw, analyse, then mask the stored results. (2) Detect and mask inside the observed process, and write only masked events. (3) Keep raw values encrypted at rest.

**Decision.** Option 2. Detection runs in-process; only masked events (header names, body field names, masked matches) are written. To link repeats of one value inside a run, each match carries an HMAC under a per-run random key held only in memory.

**Consequences.** Raw values never reach disk, and tests assert this. The dashboard can't "reveal" a value, so hold-to-reveal shows *how* the value was recognised instead. A finding can't be re-analysed later with a new detector; you re-run the scenario instead. Refs can't be correlated across runs, by design.

**Accessibility and responsive impact.** None.

**Review trigger.** Any feature that would need raw values after the run ends.
