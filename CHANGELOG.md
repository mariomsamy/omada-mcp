# Changelog

## Unreleased

### Added

- `groupSiteAlerts` (read, `dashboard`): reads a site's alerts for a window (default 24 h,
  paginated, capped at 2,000 with a `truncated` flag) and groups them by alert type with count,
  first/last seen, severity and de-duplicated subjects parsed from the message (rogue DHCP server
  IP/MAC with sign-extended MACs such as `FFFFFFF4:28:...` normalised, IP-conflict clients, WAN
  port). Subjects are matched to the current client/device list by exact MAC (or IP when no MAC);
  unmatched subjects stay unknown.
- `getNetworkAuditReport` (read, `dashboard`): one-call prioritised audit composed from devices,
  gateway WAN status, clients, grouped alerts, rogue APs, IPS, pending devices and per-AP Wi-Fi
  retry/drop/channel data. Returns severity-ordered findings with evidence and recommendations,
  compact sections, a simple penalty score and an `unavailable` list; every sub-read degrades on
  its own. Thresholds are named constants. No writes or scans.
- `OMADA_CLOUD_REGION` (for example `euw1`) to use the TP-Link cloud Open API
  (`https://<region>-omada-northbound.tplinkcloud.com`) instead of a local controller. Setting
  it together with `OMADA_BASE_URL` is rejected, the region is validated as a region code, and
  strict TLS is mandatory in cloud mode. See `docs/CLOUD.md`.

## 1.0.0 - 2026-11-05

Security and audit follow-up release of the unified server.

- migrate to zod 4.6.7, fixing GHSA-mrhx-c7xc-m3w5; `npm audit --omit=dev` reports 0 vulnerabilities; CI and publish now run `npm audit --omit=dev --audit-level=high`
- webhook destinations of the log/audit notification tools are resolved and refused when any address is private, loopback or link-local; new optional `OMADA_WEBHOOK_ALLOWED_HOSTS` allowlist
- nested request-body key allowlists generated from the OpenAPI schemas (`dhcpSettingsVO`, `lanNetworkIpv6Config`, `wanPortIpv4Setting`, rate-limit and RF-planning `customSetting`, ...); update previews include a field-level before/planned `diff`
- read-only preflights for `createSsid` (WLAN group), `adoptDevice` (pending list), `startFirmwareUpgrade` and `startCableTest` (device in site)
- fix `setDeviceLed`: it used the undocumented `/devices/{mac}/led-setting` route; it now uses the documented AP/switch/gateway `general-config` route after confirming the device type
- info-level logs no longer contain full tool arguments or client MACs/IPs in request URLs; full arguments are debug-only; log retention documented
- the event-type `key` in log/audit notification settings and log entries is no longer masked; other `key` fields stay masked
- `OMADA_TOOL_CATEGORIES` overriding `OMADA_CAPABILITY_PROFILE` now logs a warning and reports profile `custom`
- table-driven loopback stub-controller test over all 89 write tools (dry run sends no mutating request; apply sends the documented method and path); per-tool tests assert the catalog-forced `destructiveHint`
- rename leftover "Safe Omada MCP" / `safe-omada-mcp` references to `omada-mcp` (MCP server name, image label, docs) and point repository links at `mariomsamy/omada-mcp`; document Docker hardening flags (`--read-only --cap-drop=ALL --security-opt no-new-privileges`), `MCP_HTTP_BEARER_TOKEN` and `confirmWebhookChange`

## 0.19.0-rc.1 - 2026-10-24

- default all writes to preview, separate explicit recovery permissions, and distinguish submitted changes from verified readback
- serialize request pacing, share token acquisition, bound read retries/pagination, reject malformed envelopes, recover site discovery and normalize client identity with ambiguity checks
- add typed AP radio, restricted SSID basic-setting and guarded switch-port workflows with bounded semantic verification and partial outcomes
- add enabled-operation search/schema discovery, optional compact dispatch, hidden legacy aliases and capability metadata
- add Wi-Fi, log and camera-client diagnostic composition with timestamps and incomplete-evidence reporting
- incorporate PR #10 by q759k6n9pm-hash; extend shared redaction, restrict optional tool headers, add private CA trust and disable redirects
- remove an unregistered duplicate device-stats implementation, verify README inventory against runtime registration, expand protocol/regression coverage and update compatible dependencies
- document migration, issue #11 registry findings and operation-specific validation; Zod has a remaining high advisory, and stable write-tool release awaits disposable-controller/hardware evidence

See [migration](docs/operations/0.19-migration.md) and [validation](docs/operations/0.19-validation.md). This candidate does not upgrade the live installation.

## 0.18.0 - 2026-10-20

- added site auto-discovery when neither a tool argument nor `OMADA_SITE_ID` supplies a site: single-site controllers are selected automatically; controllers with no sites or multiple sites return an explanatory error
- added `createSwitchAcl` and `updateSwitchAcl` tools with schema validation, dry-run previews, and existing-rule checks for updates
- expanded the default `safe-read` profile with firewall ACL and traffic read tools
- reorganized README tool tables into collapsible read and write sections
- configured repository engineering skills with GitHub Issues, default triage labels, and single-context domain documentation conventions
- updated CI and publishing actions to releases using the Node.js 24 runtime
- synchronized package and lockfile versions for the release

## 0.17.0 - 2026-04-05

- added explicit two-step `confirmDangerous` confirmation gate to all four restore tools (`restoreController`, `restoreControllerFromFileServer`, `restoreSites`, `restoreSitesFromFileServer`) — irreversibility warning surfaces before any execution
- fixed three API contract bugs: `getRogueApExport` format values corrected to spec (`'0'`/`'1'`), threat API timestamps converted to seconds, `getThreatList` site scoping via `siteList` param
- expanded `ops-write` capability profile to include `maintenance:rw`, `logs:r`, `network-wan:r`, `security-threat:r`, `vpn:r`
- documented `confirmDangerous` scope and limitations in `CLAUDE.md` and `README.md`
- added `AGENTS.md` symlink to `CLAUDE.md` for cross-agent instruction pickup
- fixed Docker publish workflow to use dynamic repository owner

## 0.16.0 - 2026-04-03

- promoted the hardened Omada MCP platform to a stdio-first production baseline
- completed Phase 3 administrative tooling for AP, gateway, DHCP, ACL, and traffic-control workflows
- aligned server version reporting with package metadata
- tightened legacy HTTP mode so it remains loopback-only even when explicitly enabled for lab use
- refreshed README, Docker README, and AI-agent instructions to match the current platform behavior
- strengthened CI with symlink validation and cleaned release metadata for the published package and container image
