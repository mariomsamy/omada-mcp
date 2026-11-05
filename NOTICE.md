# Third-party notices

This project merges code, skills and ideas from the MIT and Apache-2.0
projects below. Original copyright notices are retained. Projects we
only studied are listed separately; nothing from them was copied.

## Code or skills used

| Source | License | Copyright | Used for |
|---|---|---|---|
| MiguelTVMS/tplink-omada-mcp | MIT | (c) 2025 João Miguel Tabosa Vaz Marques Silva | original tool surface (via the base) |
| gaspareduard/Omada-mcp | MIT | gaspareduard; (c) 2025 João Miguel Tabosa Vaz Marques Silva | base project: safety model, catalog, tests |
| realtydev/omada-mcp | MIT | Copyright (c) 2026 Alex Gibson (realtydev); Copyright (c) 2025 João Miguel Tabosa Vaz Marques Silva | write tools, getServerInfo, port-forward/route/WAN/IPS writes (web auth mode not ported) |
| aljopro/tplink-omada-mcp | MIT | Copyright (c) 2025 João Miguel Tabosa Vaz Marques Silva | ported tools (adoptDevice, setSiteLed, LAN writes); routes re-verified against docs/openapi |
| Zesty0wl/omada-mcp | MIT | Copyright (c) 2025 João Miguel Tabosa Vaz Marques Silva | ported tools (PoE/reboot schedules re-implemented on Open API routes) |
| daniel-k/omada-mcp | MIT | Copyright (c) 2025 João Miguel Tabosa Vaz Marques Silva | ported tools (RF planning, SSID sections, log and notification writes) |
| ChenyqThu/omada-skill | MIT | (c) 2026 Chen Yuanquan | skills/omada-alert-triage, omada-bulk-site-onboard, omada-guest-portal-wizard, omada-support-assist, omada-wifi-troubleshoot (adapted and rewritten) |
| kaviththiranga/omada-mcp-server | MIT | (c) 2026 Kavith Lokuhewage | skills/omada-roaming-dfs (adapted) |

## Ideas and documented knowledge (no code copied)

| Source | License | Copyright | Used for |
|---|---|---|---|
| dfla-me/omada-mcp | MIT | see upstream | whole-object edits and post-apply override detection, reflected in skills/omada-safe-change |
| margosmark/omada-mcp | MIT | (c) 2026 Mark Arslan | controller quirks and "never fabricate" data rules in skills; certificate pinning and allowlists planned |
| samhaque/omada-controller-mcp | MIT | see upstream | search/describe pattern (compare compact catalog); HTTP hardening ideas |
| ricardo-david-francisco/WhiteOmadaMcp-public | MIT | see upstream | field encodings, error-code table and hardware findings summarised in skills/omada-safe-change and omada-roaming-dfs |
| thalisantunes/mcp-omada | Apache-2.0 | see upstream | write-guard and audit-log design; hardware quirks summarised in skills |
| samhaque/nooa-omada-agent | Apache-2.0 | see upstream | triage -> investigate agent pattern |
| sirfyyn/fyos-plugin-betrieb | Apache-2.0 | see upstream (repository NOTICE) | read-only facade idea for autonomous agents |

## Studied only

- mballoni/omada-controller-mcp (GPL-3.0-only): the idea of a fixed
  Wi-Fi scoring rubric with a saved baseline inspired
  skills/omada-network-audit. The rubric was designed independently; no
  GPL text or code is included, so this project stays MIT.
- RonaldPhilipsen/omada-mcp (no license): registration-time gating and
  spec-hash pinning noted as ideas only.
- jkohen/omada-mcp, wonjo-linc/MCP-Omada, kohlsalem/omada-mcp (no
  license): not copied.

Excluded as unrelated or empty: OmadaIdentity/omada-mcp-server and
walkerpauldavid/omadaidentitymcpserver (Omada Identity, not TP-Link),
bforejt/omada-composer (empty).

The port batch is documented in [docs/porting-skipped.md](docs/porting-skipped.md):
ported operations use only official Open API routes from `docs/openapi/`;
private web API, cookie/CSRF, header-credential and raw API tools were
not ported. The full survey is in [docs/COMPARISON.md](docs/COMPARISON.md).
