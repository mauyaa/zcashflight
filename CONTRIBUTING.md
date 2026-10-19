# Contributing

Thanks for helping. ZcashFlight is small on purpose, so these rules keep it that way.

## Set up

You need Node 22.18 or later. There is nothing to install.

```bash
npm test
```
```bash
npm run validate
```
```bash
npm run demo
```

All three must pass before a pull request is merged.

## Rules of the codebase

- **No runtime dependencies.** See [ADR 0001](docs/architecture/adr/0001-zero-dependencies.md). Write the small thing yourself, with tests.
- **Erasable TypeScript only.** No enums, namespaces or parameter properties; import local files with their `.ts` extension.
- **Raw values never leave `inspect.ts` unmasked.** Any new capture path must go through `inspectRequest` or `inspectLog`. Add a test that asserts the raw value isn't stored.
- **Rules are deterministic.** No network calls and no randomness in `src/engine/rules.ts`.
- **New detection needs both a positive and a negative case** in `test/cases.ts`.
- **Dashboard changes** must keep `test/ui-audit.js` at 18/18 at 320, 390, 768, 1024, 1366, 1440 and 1920 px (re-run steps in the design system), and use tokens from `ui/style.css`. Don't add new colours ([design system](docs/design/design-system.md)).

## Docs impact

Every pull request that changes behaviour updates the docs in the same pull request: the CLI or policy reference for flags and keys, the rules reference for detection, and the changelog for anything users can see. If nothing needs changing, say so in the pull request description.

## Commit and pull request

Keep pull requests to one change. Describe what changed, why, and how you tested it.
