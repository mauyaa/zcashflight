# Contributing

Thanks for helping. Please follow the [code of conduct](CODE_OF_CONDUCT.md). ZcashFlight is small on purpose, so these rules keep it that way.

## Set up

You need Node 22.18 or later. `npm ci` installs the two dev-only type packages (`typescript`, `@types/node`); the tool itself has no runtime dependencies.

```bash
npm ci
```
```bash
npm run typecheck
```
```bash
npm test
```
```bash
npm run validate
```
```bash
npm run demo
```

All of these must pass before a pull request is merged. For changes to capture or wallet handling, also run the real-chain proof: `npm run regtest` ([guide](docs/guides/regtest.md)).

## Rules of the codebase

- **No runtime dependencies.** See [ADR 0001](docs/architecture/adr/0001-zero-dependencies.md). Write the small thing yourself, with tests.
- **Erasable TypeScript only.** No enums, namespaces or parameter properties; import local files with their `.ts` extension.
- **Raw values never leave `inspect.ts` unmasked.** Any new capture path must go through `inspectRequest` or `inspectLog`. Add a test that asserts the raw value isn't stored.
- **Rules are deterministic.** No network calls and no randomness in `src/engine/rules.ts`.
- **New detection needs both a positive and a negative case** in `test/cases.ts`.
- **Dashboard changes** must keep `test/ui-audit.js` at 18/18 at 320, 360, 390, 412, 768, 1024, 1280, 1366, 1440 and 1920 px (re-run steps in the design system), and use tokens from `ui/style.css`. Don't add new colours ([design system](docs/design/design-system.md)).

## Docs impact

Every pull request that changes behaviour updates the docs in the same pull request: the CLI or policy reference for flags and keys, the rules reference for detection, and the changelog for anything users can see. If nothing needs changing, say so in the pull request description.

## Commit and pull request

Keep pull requests to one change. Describe what changed, why, and how you tested it.
