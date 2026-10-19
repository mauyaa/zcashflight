# ADR 0004: Sinkhole third-party calls by default

**Status:** Accepted · 2026-10-18 · Owner: security/privacy owner

**Context.** Running the app's scenarios would otherwise send the very leaks under test to real analytics, error and price services, including any synthetic identifiers.

**Options.** (1) Let traffic through. (2) Block it with errors. (3) Answer it locally with a neutral success response.

**Decision.** Option 3, on by default (`sinkhole: true`). `fetch` to non-local hosts gets a synthetic `202 {}`; `http(s).request` is redirected to a local sink server; the proxy refuses HTTPS tunnels to non-local hosts.

**Implementation constraints (2026-10-19).** The hook waits for its local sink server before the app starts. HTTP URL/options overrides are evaluated together. Only `localhost` and literal loopback IPs are treated as local; DNS names beginning with `127.` are not. With the sinkhole enabled, automatic fetch redirects throw an explicit error rather than allowing an unobserved hop. Apps can use `redirect: 'manual'` and fetch each destination explicitly through the hook. This is a deliberate compatibility limit.

**Consequences.** Tests make no external network requests, and apps behave as though their vendors answered. An app that depends on a real third-party response (for example a live price) sees an empty object; to test that path, approve the host and turn the sinkhole off, knowing the request will really go out.

**Review trigger.** Apps that need recorded responses rather than empty ones.
