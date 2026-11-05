# Security Model

## Goals

- Keep the MCP surface safe for AI-facing use.
- Avoid accidental privilege escalation.
- Make every mutation auditable.

## Mandatory rules

1. No header-supplied Omada credentials.
2. No generic raw API execution in the supported runtime.
3. No internal web UI API dependency in the mainline platform.
4. No remote/public HTTP transport in the supported milestone 1 path.
5. All write tools must be category-gated, test-backed, and audit-logged.

## Secrets

- `OMADA_CLIENT_ID`
- `OMADA_CLIENT_SECRET`
- `OMADA_OMADAC_ID`

These must come from environment variables or a secret manager. They must never be accepted from user-supplied request headers.

## Logging

- MCP-layer request and tool logs are redacted in `src/server/common.ts`.
- Omada HTTP logs are redacted in `src/omadaClient/request.ts`.
- Mutation tools emit an explicit audit event with target, site, mode, and summary.
- All layers share one field-aware redaction rule (`src/utils/redact.ts`). A bare `key` is
  masked everywhere except where the spec uses it as an event-type identifier: inside
  `logNotifications`, `alertNotifications`, `eventNotifications` and `auditLogNotifications`
  entries, and in event/alert log entries (`id`, `key`, `module`, `content`, `time`).
  Other `key` fields (for example the VRRP authentication `key`) stay masked.

### What each level contains

| Level | Tool calls | Omada requests |
| --- | --- | --- |
| `info` (default) | Tool name, session, argument names and identifier fields only (`siteId`, resource IDs, `dryRun`); MAC and IP values replaced with `[mac]`/`[ip]` | Method, status and URL with client MAC and IP addresses replaced; query parameters secret-masked and scrubbed |
| `debug` | Full arguments with secret-keyed values masked | Full URL, secret-masked headers, parameters and bodies |

Tool arguments and controller data can contain personal data (client MACs, IPs, host
names, device names). Debug logging should be enabled only for short troubleshooting
sessions.

### Log retention

The server writes logs to stderr (stdio mode) or stdout (HTTP lab mode) and keeps no log
files itself; retention is decided by the MCP host or container runtime that captures them.
Recommended practice:

- Keep `MCP_SERVER_LOG_LEVEL=info` in normal operation; turn `debug` on only while
  troubleshooting and delete those logs afterwards.
- Retain info-level logs and mutation audit events no longer than your change-audit
  policy requires (for example 30 to 90 days) and restrict access to operators.
- Treat captured logs as containing personal data under the applicable data-protection
  law (for example GDPR or the KSA/UAE personal data protection laws): document the
  purpose, limit access, and include them in deletion requests where required.

## Webhook destinations

Log and audit notification webhooks can carry client personal data off-network. The
notification tools accept only a `webhookId` reference, require `confirmWebhookChange: true`
to change it, and check every destination URL of the referenced profile: https only, no
embedded credentials, no private, loopback, link-local, CGNAT or multicast literal, the host
name must resolve only to public addresses, and with `OMADA_WEBHOOK_ALLOWED_HOSTS` set the
host must be on the allowlist. The controller resolves the name again at delivery time, so
DNS rebinding is narrowed, not eliminated; use the allowlist for strong control.

## Payloads and previews

Request bodies are restricted to the keys of their official Open API schema, including nested
objects (generated into `src/utils/openapiNestedKeys.ts` by `scripts/generate-nested-keys.mjs`),
and bounded to 64 KB and depth 8. Dry runs send read requests only and never a mutating request;
this is asserted for every write tool against a loopback stub controller.

## Unsafe/compatibility features

Anything that depends on undocumented controller internals belongs in a future compatibility module, disabled by default and documented separately.

## 0.19 policy

Catalog registration hides deprecated aliases and tool headers by default. Header opt-in permits only bounded request/correlation IDs. Compact dispatch resolves only the already enabled catalog and validates through the same schema/handler; it grants no additional permissions.

Recovery needs an explicit `recovery:rw` category and apply/confirmation arguments. Built-in profiles and `all` exclude it. The confirmation argument is not a human approval mechanism. Mutation audit events distinguish previews, controller acceptance and bounded readback outcomes.

Private CA bundles preserve TLS hostname checking; redirects are disabled. See [SECURITY.md](../SECURITY.md) for the dependency audit status and trust-boundary limitations.
