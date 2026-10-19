# ADR 0001: Zero runtime dependencies

**Status:** Accepted · 2026-10-18 · Owner: technical owner

**Context.** ZcashFlight runs inside the developer's environment and sees sensitive test data. Every dependency is code that runs with that access, and a supply-chain compromise of a privacy tool would be a privacy incident. The tool also has to be quick to try during a hackathon review: clone and run.

**Options.** (1) A conventional stack: TypeScript compiler, a YAML library, a web framework. (2) No dependencies: Node's native TypeScript type stripping, a small YAML subset parser, plain HTML/JS for the dashboard.

**Decision.** Option 2. Node 22.18+ strips types natively; `npm run build` uses Node's own `stripTypeScriptTypes` to emit JavaScript for npm installs, because Node won't strip types inside `node_modules`.

**Consequences.** Nothing to audit beyond this repository; no install step. In exchange: the YAML parser supports a subset (documented in the [policy reference](../../reference/policy.md)); the source must use erasable TypeScript only (no enums or parameter properties); and Node 22.18 is the minimum.

**Review trigger.** A required format (for example full YAML anchors) that the subset can't support.
