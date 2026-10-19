# Security policy

## Supported versions

| Version | Security fixes |
|---|---|
| 0.1.x | Yes |
| Older | No |

## Report a vulnerability privately

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Please don't open a public issue for a vulnerability.

Include:

- what is affected (CLI, collector, proxy, dashboard, reports) and the version;
- the impact: for example a raw value written to disk, a request escaping the sinkhole, or the dashboard reachable without the token;
- minimal steps to reproduce, using **synthetic data only** (`zcashflight synth` generates some).

Don't include real keys, seed phrases, addresses or customer data in a report.

## What happens next

The maintainers acknowledge reports within 5 working days, agree a fix and disclosure date with you, and publish an advisory with credit (unless you'd rather stay anonymous) when the fix is released.

## Scope

The most important properties to test are in the [threat model](docs/trust/threat-model.md): raw values never reach disk, third-party calls are sinkholed, and the dashboard can't be driven by another site. Bugs in the sample app `examples/zecshop` that are its seeded leaks are intentional and out of scope.
