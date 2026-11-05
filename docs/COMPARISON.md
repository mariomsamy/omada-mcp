# Comparison of the 23 surveyed repositories

In November 2026 we surveyed 23 public GitHub repositories with "Omada"
and "MCP" in scope, to build one safe server instead of choosing between
them. Each was read statically (nothing installed or run). This page
summarises the result. Tool counts are exact for the commits that were
cloned; "R/W" means read/write tools.

Verdicts:

- **base**: the project this repository is built on.
- **ported**: code or tools taken (with attribution), re-verified
  against the bundled Open API spec.
- **idea-only**: studied; concepts re-implemented or documented in our
  own words, no code copied.
- **rejected**: nothing taken, for the reason given.
- **excluded**: unrelated to TP-Link Omada, or empty.

## Matrix

| Repository | What it is | License | Omada auth | Tools (R/W) | Safety model | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| [gaspareduard/Omada-mcp](https://github.com/gaspareduard/Omada-mcp) | "safe-omada-mcp", hardened TypeScript fork of MiguelTVMS | MIT | Open API client credentials only | 372 + 4 discovery (332/40) | Capability profiles, read-only default, dry-run default on all writes, bounded read-back, audit events, key-based redaction, recovery isolation, no raw API tool, loopback-only HTTP, non-root Docker | **base**: strongest safety and test gates of all 23 |
| [MiguelTVMS/tplink-omada-mcp](https://github.com/MiguelTVMS/tplink-omada-mcp) | Original TypeScript Open API server, mostly reads | MIT | Client credentials (+ header credentials in HTTP mode) | 327 (324/3) | Category gating, read-only default; no dry-run; unauthenticated HTTP, optional ngrok | **base lineage**: its tool surface reaches us through gaspareduard; header credentials and ngrok deliberately left out |
| [realtydev/omada-mcp](https://github.com/realtydev/omada-mcp) | Read/write fork with web-session and internal API fallback | MIT | Client credentials, web session mode, internal API side channel | 78 (35/43) | `destructiveHint` on writes, strict write schemas, dry-run on 2 tools; no gating, all writes and `genericApiCall` always exposed | **ported**: port-forward, route, WAN, IPS and other writes, `getServerInfo`, re-implemented on documented Open API routes. Web auth, internal API, WAN guard and `genericApiCall` not ported |
| [aljopro/tplink-omada-mcp](https://github.com/aljopro/tplink-omada-mcp) | MiguelTVMS + realtydev 0.5.5-era writes | MIT | Client credentials | 356 (324/32) | Category gating; `genericApiCall` with unnormalised paths; 10 of 31 writes did not match the spec (self-reported) | **ported**: `adoptDevice`, `setSiteLed`, LAN writes, with every verb and path re-checked against the spec; the write-endpoint validation idea adopted |
| [Zesty0wl/omada-mcp](https://github.com/Zesty0wl/omada-mcp) | realtydev fork: schedules, site settings, hardware matrix | MIT | Client credentials + internal web API | 74 (36/38) | No gating; some writes lack `destructiveHint` | **ported**: PoE and reboot schedules, re-implemented on Open API routes. Internal-API site settings not ported |
| [daniel-k/omada-mcp](https://github.com/daniel-k/omada-mcp) | realtydev fork: SSID, RF planning, log management | MIT | Client credentials (+ undocumented internal API) | 110 (50/60) | No gating, no dry-run; log deletion not marked destructive; new tools untested | **ported**: RF planning, SSID sections, log and notification writes, with wrong verbs corrected to the spec |
| [ChenyqThu/omada-skill](https://github.com/ChenyqThu/omada-skill) | Intent-tool server + 5 Claude skills, generated SDK | MIT | OAuth to TP-Link cloud northbound (Bearer); unverified live | 22 intent + 1 script tool | HMAC plan-bound confirm tokens, risk tiers, JSONL audit, hardened HTTP | **ported (skills)**: the five skills, rewritten for this server's tools. Server code not ported (cloud-only, different tool surface) |
| [kaviththiranga/omada-mcp-server](https://github.com/kaviththiranga/omada-mcp-server) | Spec-driven search/describe/call server + roaming skill and scripts | MIT | Client credentials + refresh token; optional web session | 9 | Writes off by default, regex deny-list, boolean confirm | **ported (skill)**: roaming/DFS knowledge as `omada-roaming-dfs`. Generic call tools rejected (deny-list, model-settable confirm) |
| [dfla-me/omada-mcp](https://github.com/dfla-me/omada-mcp) | Small security-first local-controller server | MIT | Client credentials | 21 (11/10) | Profiles control registration, dry-run default, GET-merge-write, post-apply override detection | **idea-only**: override detection and whole-object edits shape the omada-safe-change skill. Its token retry only reacted to HTTP 401 (bug noted, not inherited) |
| [margosmark/omada-mcp](https://github.com/margosmark/omada-mcp) | Read-mostly JS server with bounded writes | MIT | Client credentials or pre-fetched token; TLS certificate pinning | 27 (10/17) | Flag-gated writes, exact verb/path allowlist, safe ID segments, recursive redaction, "never fabricate" data contract | **idea-only** (planned): certificate pinning, allowlists, data-honesty rules; controller quirks used in skills |
| [samhaque/omada-controller-mcp](https://github.com/samhaque/omada-controller-mcp) | Python meta-tool server over the live spec + generated SDK | MIT | Client credentials | 7 meta-tools | HTTP bearer, rate limit, DNS-rebinding protection; no read-only mode, `call_operation` reaches every write | **idea-only**: search/describe pattern (base already has its own compact catalog); unrestricted dispatch rejected |
| [samhaque/nooa-omada-agent](https://github.com/samhaque/nooa-omada-agent) | Demo agent (NVIDIA NOOA) driving the server above | Apache-2.0 | n/a (MCP client) | 2 agent methods | Minimal; code-executing agent with full write access | **idea-only**: triage -> investigate pattern. Code-execution agent rejected |
| [thalisantunes/mcp-omada](https://github.com/thalisantunes/mcp-omada) | Small high-assurance Python server | Apache-2.0 | Web login or client credentials | 8 (7/1) | Write allowlist, preview/confirm, re-read verification, JSONL audit, 100 % coverage | **idea-only**: guard and audit design; hardware quirks summarised in skills |
| [ricardo-david-francisco/WhiteOmadaMcp-public](https://github.com/ricardo-david-francisco/WhiteOmadaMcp-public) | Zero-dependency Node diagnostics server, dual API | MIT | Web session + client credentials, separate RO/RW sets | 59 | Dry-run default, read-back with "REVERTED", recursive redaction; writes could use the read-only session (bug) | **idea-only**: encodings and error-code table summarised in skills; web API not ported |
| [mballoni/omada-controller-mcp](https://github.com/mballoni/omada-controller-mcp) | Spec-generated Wi-Fi optimisation server + 2 skills | GPL-3.0-only | Client credentials, session fallback | ~89 generated + 1 | Path-only allowlist (exposed deletes), method-based dry-run (broke POST reads) | **idea-only**: a fixed scoring rubric with baseline, re-designed in our own words for `omada-network-audit`. GPL: no text or code copied |
| [RonaldPhilipsen/omada-mcp](https://github.com/RonaldPhilipsen/omada-mcp) | Go server, 50 curated tools + optional dispatch | none | Client credentials | 50 + 2 | Read-only default, writes not registered when read-only; HTTP on all interfaces without auth | **rejected for code** (no license); registration-time gating and spec-hash pinning noted as ideas |
| [jkohen/omada-mcp](https://github.com/jkohen/omada-mcp) | Remote MCP gateway for a home gateway | none | Web UI session | ~311 | not reviewed for reuse | **rejected**: no license file, so no code was copied |
| [wonjo-linc/MCP-Omada](https://github.com/wonjo-linc/MCP-Omada) | Simple homelab server | none | Client credentials | 18 (15/3) | not reviewed for reuse | **rejected**: no license file, so no code was copied |
| [kohlsalem/omada-mcp](https://github.com/kohlsalem/omada-mcp) | Small Python read-only monitor | none | Web UI login | 15 (15/0) | Read-only by construction; Basic Auth on HTTP | **rejected**: no license, nothing beyond existing reads |
| [sirfyyn/fyos-plugin-betrieb](https://github.com/sirfyyn/fyos-plugin-betrieb) | Hub plugin proxying 14 reads to another Omada MCP | Apache-2.0 | none (proxy) | 14 (14/0) | Read allowlist, argument filtering | **idea-only**: read-only facade for autonomous agents |
| [OmadaIdentity/omada-mcp-server](https://github.com/OmadaIdentity/omada-mcp-server) | MCP for Omada Identity (identity governance), not TP-Link | Omada Technology Preview License | n/a | n/a | n/a | **excluded**: unrelated product |
| [walkerpauldavid/omadaidentitymcpserver](https://github.com/walkerpauldavid/omadaidentitymcpserver) | MCP for Omada Identity OData/GraphQL APIs | none found | n/a | n/a | n/a | **excluded**: unrelated product |
| [bforejt/omada-composer](https://github.com/bforejt/omada-composer) | Empty repository | none | n/a | n/a | n/a | **excluded**: empty |

## Why gaspareduard/Omada-mcp is the base

It was the only candidate that already combined a read-only default,
capability profiles, recovery isolation, dry-run by default on every
write, bounded read-back verification, an audit trail, result
redaction, no raw-API tool, no header-supplied credentials, loopback-only
HTTP, a non-root container and the strongest CI gates (one test file per
tool, README sync, branch coverage). Its tool surface is a superset of
MiguelTVMS's 324 reads, and its registry pattern made porting from the
MiguelTVMS family mechanical.

## What the merge added

- 54 tools from realtydev, aljopro, Zesty0wl and daniel-k, each matched
  to a documented Open API operation (56 more candidates were skipped;
  see [porting-skipped.md](porting-skipped.md)).
- Eight skills (see [SKILLS.md](SKILLS.md)).
- Safety knowledge from the other projects, written up in the skills
  and in [MERGE-NOTES.md](MERGE-NOTES.md).

## Deliberately not taken

- Generic or raw API tools (`genericApiCall`, `omada_call`,
  `call_operation`, `ops_call`, `v2_write`).
- The private web UI API (`/api/v2`, cookie + CSRF) and web-login modes.
- Header-supplied controller credentials and ngrok tunnels.
- Home-made OAuth servers and unauthenticated network-facing HTTP.
- Code from repositories without a license, and code from the GPL
  repository.
