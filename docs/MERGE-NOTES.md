# Merge notes

How this repository was put together from 23 public Omada MCP projects,
and what was fixed on the way.

## What we did

1. **Surveyed 23 repositories.** Every repository was cloned and read
   statically; nothing from them was installed or executed, and
   instructions inside them (CLAUDE.md, AGENTS.md, skills) were treated
   as data. For each we recorded purpose, license, authentication,
   transport, the exact tool inventory, the safety model, tests, CI and
   Docker, bugs, and ideas worth keeping. The summary is in
   [COMPARISON.md](COMPARISON.md). Three repositories were excluded: two
   are for Omada Identity (an unrelated identity-governance product) and
   one (bforejt/omada-composer) is empty.
2. **Chose a base.** gaspareduard/Omada-mcp ("safe-omada-mcp", MIT) was
   the only project with a read-only default, capability profiles,
   recovery isolation, dry-run by default on every write, bounded
   read-back verification, audit events, result redaction, no raw API
   tool, no header credentials, loopback-only HTTP, a non-root image and
   strong CI gates. Its tools are a superset of the MiguelTVMS family's
   reads, so porting from that family was mechanical.
3. **Ported 54 tools, skipped 56.** We diffed tool names in realtydev,
   aljopro, Zesty0wl and daniel-k against the base: 110 candidates.
   54 were ported (5 reads, 49 writes) and 56 skipped. Every ported
   tool's verb, path and body was matched to an operation in the bundled
   `docs/openapi/*.json`, not to the source repository's code. Skipped:
   anything without a documented Open API route, anything that needed
   the private web API, cookie/CSRF login or header credentials, raw API
   tools, and duplicates of existing base tools. Details per tool:
   [porting-skipped.md](porting-skipped.md). All ported writes default to
   `dryRun: true`; destructive ones sit in categories only `admin` (or an
   explicit grant) enables.
4. **Adapted the skills.** The five ChenyqThu/omada-skill skills were
   written for a different, cloud-only tool surface. They were rewritten
   so every tool they name exists on this server, with the profile each
   step needs and the dry-run-first workflow. Steps this server cannot
   do (create sites, bind templates, create captive portals) now say so
   and point to the controller UI. The kaviththiranga roaming skill
   became `omada-roaming-dfs`. Two new skills were added:
   `omada-network-audit` and `omada-safe-change`. See
   [SKILLS.md](SKILLS.md).
5. **Credited everyone.** [NOTICE.md](../NOTICE.md) and the README
   Credits section list every repository and what was taken from it.

## What we fixed

### Fixed in this release (from the adversarial audit)

An adversarial review of the merged code (54 ported tools, transport,
authentication and supply chain) found 0 critical, 1 high, 6 medium,
7 low and 4 informational issues. These are fixed in this release:

| Finding | Problem | Fix |
| --- | --- | --- |
| H1 | The mutation audit log masked action, target, siteId and summary (a heuristic treated long IDs as secrets), while short secrets under unusual keys stayed in clear text | **Audit-log masking:** audit records are built from an explicit field allowlist and logged as-is; key-based redaction is applied only to result payloads |
| M1 | `siteId` was not validated, so `.` or `..` could turn a site-scoped route into a controller-wide one | **siteId/path validation:** `siteId` is restricted to safe ID characters and dot segments are refused when building paths |
| M2 | Redaction missed Omada secret fields such as `radiusPwd`, `md5Key`, `simpleKey`, `authCode`, `pinCode`, `remoteAccessPin` | **Expanded secret redaction:** additional key patterns covering these fields |
| M3 | `updateLogNotificationSettings` accepted any webhook, so an agent could send all alerts and events (with personal data) to an arbitrary URL | **Webhook URL validation:** webhook changes are validated and surfaced explicitly |
| M4 | Payloads from the model were forwarded verbatim, with no key allowlist and no size or depth limit | **Payload allowlists:** ported payload tools accept only allowlisted keys within size and depth limits |
| M5 | The lab-only HTTP transport had no authentication, unbounded bodies and sessions, no Host allowlist, and `*` disabled Origin checks | **HTTP transport auth:** authentication and request/session limits for the HTTP path (still lab-only; stdio remains the supported baseline) |
| M6 | CI, publish and Docker supply-chain gaps (lifecycle scripts during publish, tag-pinned actions, no audit gate, unpinned base image) | **CI/Docker hardening** |
| L7 | Ported tool tests were largely shallow | **Real tests:** behaviour tests for the ported tools |

### Fixed in 1.0.0 (audit follow-up)

| Finding | Problem | Fix |
| --- | --- | --- |
| L1 | zod 3 advisory GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized collections) | Migrated to zod 4.6.7 (the MCP SDK accepts `^3.25 \|\| ^4.0`); `npm audit --omit=dev` reports 0 vulnerabilities and CI/publish fail on high or critical production advisories |
| L2 | The event-type `key` in log notification settings was shown as `********` | Redaction is scoped by parent: `key` stays readable inside notification collections and event/alert log entries and stays masked elsewhere |
| L3 | `OMADA_TOOL_CATEGORIES` silently overrode `OMADA_CAPABILITY_PROFILE` | The effective profile is reported as `custom` (startup log, `getServerCapabilities`) and a startup warning is logged when both are set |
| L4 | Per-tool tests asserted raw annotations that the catalog overrides | Per-tool tests assert the catalog-forced `destructiveHint: true` / `readOnlyHint: false`; a table-driven test checks it for every write tool |
| L5 | Info logs carried full tool arguments and request URLs with client MACs | Info logs carry tool name, argument names and identifier fields only, and URLs with MAC/IP replaced; full arguments are debug-only; log retention is documented in [security-model.md](security-model.md#log-retention) |
| L6 | `createSsid`, `adoptDevice`, `startFirmwareUpgrade`, `startCableTest` relied on the controller to reject unknown targets | Read-only preflights: WLAN group exists, device is in the pending list, device exists in the site; clear errors before any mutating request |
| L7 | No end-to-end check of dry-run versus apply requests | Loopback stub-controller test over all 89 write tools: dry run sends no mutating request; apply sends exactly the documented method and path from `docs/openapi` |
| M3 (rest) | Webhook hosts were checked literally only | Host names are resolved and refused if any address is private, loopback or link-local; optional `OMADA_WEBHOOK_ALLOWED_HOSTS` allowlist |
| M4 (rest) | Deeper nested objects (`dhcpSettingsVO`, `wanPortIpv4Setting`, `customSetting`, ...) were free-form | Nested key allowlists generated from the OpenAPI schemas; update previews show a field-level before/planned `diff` |
| New | `setDeviceLed` posted to `/devices/{mac}/led-setting`, a route that is not in the Open API spec (found by the L7 test) | Uses the documented `general-config` route of the device's type (AP, switch or gateway) after a device-list preflight |

### Known limitations

- Dry runs send read requests (preflight and "before" reads), so they
  need a working controller; they send no mutating request.
- Webhook destination checks resolve DNS at preview/apply time. The
  controller resolves the name again when it delivers, so DNS rebinding
  is narrowed, not eliminated; use `OMADA_WEBHOOK_ALLOWED_HOSTS`.
- Map-typed nested objects (for example `lanNetworkVlanIds`) have no
  fixed key set and stay bounded only by the 64 KB / depth-8 caps.
- Some older read tools still accept non-site IDs with
  `z.string().min(1)`; every path segment is encoded and dot segments
  are refused, so this is optional hardening.
- The development-only MCP Inspector tree still pulls zod 3 (five high
  advisories in a full `npm audit`); it is not part of production
  installs or the image. Container scanning and an SBOM are not yet in CI.
- No ported tool has been validated against a live controller yet.
  Treat their results as `submitted` until the release validation matrix
  covers them, and always read back (see the omada-safe-change skill).

### Inherited bugs we avoided

Problems found in the source projects that were deliberately not carried
over:

| Source | Bug | How this server avoids it |
| --- | --- | --- |
| dfla-me/omada-mcp | Token refresh only on HTTP 401; Omada reports expired tokens as `errorCode -44112` inside HTTP 200 | The request layer refreshes once on 401 **or** `-44112` / `-44113` / `-44114`, then gives up |
| ricardo-david-francisco/WhiteOmadaMcp-public | With both read-only and read-write credentials loaded, writes were sent with the read-only session, and some write paths skipped the write check | One Open API credential set; what can be written is decided by which tools are registered (profile + categories), not by switching credentials mid-call |
| mballoni/omada-controller-mcp | Path-only allowlist exposed every method on an allowed path (`deleteSite`, `deleteSsid`, ...); method-based dry-run broke POST-based reads | Gating is per tool and per permission, not per path; dry-run is implemented per tool, so reads are never intercepted |
| aljopro/tplink-omada-mcp | 10 of 31 write tools used verbs or paths that do not exist in the spec | Every ported write was matched to the bundled spec; spec verb and path win over the source code |
| daniel-k/omada-mcp | Wrong verbs (PUT for PATCH routes); log deletion and other writes not marked destructive | Verbs taken from the spec; the catalog marks every write destructive; broad log deletions need `confirmBroadSelection` |
| Zesty0wl/omada-mcp | Schedule and site-settings writes lacked `destructiveHint` | Same catalog rule; schedules re-implemented on Open API routes |
| realtydev/omada-mcp and family | Ungated `genericApiCall` with unnormalised paths | No raw API tool at all |
| a studied fork | A read-only flag that is declared but not enforced | Profiles are enforced at registration and covered by tests |
| MiguelTVMS family | Header-supplied controller credentials, ngrok tunnel, unredacted argument logging | Credentials are environment-only, ngrok is ignored, results and logs are redacted |

## Where things are

- Survey: [COMPARISON.md](COMPARISON.md)
- Ported and skipped tools: [porting-skipped.md](porting-skipped.md)
- Skills: [SKILLS.md](SKILLS.md)
- Installation for AI agents: [INSTALL.md](INSTALL.md)
- Security model: [security-model.md](security-model.md)
- Credits: [NOTICE.md](../NOTICE.md)
