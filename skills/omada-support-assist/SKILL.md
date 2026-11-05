---
name: omada-support-assist
description: |
  TRIGGER when a support operator wants a tier-1 ticket draft or incident
  summary for one Omada site and one time window, with evidence attached:
  site context, alerts, events, the audit trail of configuration
  changes, and an optional device snapshot.
  TRIGGER for "draft a ticket for the outage at site-042 between 13:00
  and 14:00", "who changed the SSID yesterday and did it break
  anything?", "summarise this morning's incident".
  SKIP for live root-cause work (omada-wifi-troubleshoot,
  omada-alert-triage), for full reviews (omada-network-audit) and for
  any fix (omada-safe-change).
---

# Support assist (ticket drafting)

## Goal

Compile a ticket-ready draft for one site and one incident window:
what happened, what changed just before, and which devices were
involved. Read-only. The draft ranks configuration changes by how close
they were to the alert spike, but never claims they caused it.

## Capability profile needed

Read-only: `OMADA_CAPABILITY_PROFILE=safe-read` with
`OMADA_TOOL_CATEGORIES=all:r` (at minimum
`sites:r,logs:r,dashboard:r,devices-all:r,clients:r,client-insights:r`).
Audit logs live in the `logs` category, which the plain `safe-read`
defaults do not include.

Tool names are as registered by omada-mcp; your client may prefix
them. In compact catalog mode use `callOperation`.

## Tools

| Tool | Used for |
| --- | --- |
| `listSites`, `getSiteDetail` | Site identity and time zone. |
| `getNetworkHealthSummary` | Device/client counts and current state for the header. |
| `listSiteAlerts`, `listSiteEvents` | Alerts and events in the window (Unix milliseconds, both bounds). |
| `listSiteAuditLogs` | Who changed what in the window (`searchKey` matches action text or username). |
| `getAuditLogsForGlobal` | Controller-level changes (accounts, global settings) if relevant. |
| `diagnoseLogs` | When a log list comes back empty: unavailable vs empty. |
| `listDevices`, `getApDetail`, `getSwitchDetail`, `getGatewayDetail`, `getGatewayHealth` | Snapshot of a named device. |
| `diagnoseClient` | Snapshot of a named client. |

## Workflow

1. **Lock the window.** Get site and window explicitly. Convert to Unix
   milliseconds and echo the ISO start and end back in the site time
   zone (`getSiteDetail`). Refuse vague windows ("the incident") and ask
   for times.
2. **Site context.** `getNetworkHealthSummary` for the header: devices,
   clients, WAN state now.
3. **Alerts and events.** `listSiteAlerts` and `listSiteEvents` with the
   window, `pageSize` 100. Keep the top 20 alerts by severity and time.
   If either is empty, check `diagnoseLogs` before writing "none".
4. **Audit trail.** `listSiteAuditLogs` for the window plus 30 minutes
   before it, with a `searchKey` if the operator gave one. Pair each
   alert cluster with the closest preceding audit entry, for example
   "SSID edit by admin-2 at 12:58, alerts from 13:00".
5. **Device or client snapshot (only if one is named).** Resolve with
   `listDevices` or `diagnoseClient`, then the type-specific detail
   tool.
6. **Assemble the draft** with the template in `RESOURCES.md`.
7. **Hand off, do not act.** Name the write tool and grant for any
   suggested fix and point to omada-safe-change.

## Rules

- Correlation is not causation. Present audit entries as "closest
  preceding change", ranked by time distance.
- Usernames, client names, MACs and IPs are personal data. Include only
  what the ticket needs; mask client identifiers that are not central to
  the incident. Do not paste raw payloads that the server has redacted
  back in unredacted form.
- Audit logs are per site. Cross-site incidents need one pass per site.
- No write tools.

## Examples

- [examples/tier1-outage-ticket.md](examples/tier1-outage-ticket.md):
  store outage after a VLAN edit.
- [examples/config-change-audit.md](examples/config-change-audit.md):
  "who changed the SSID and what broke".
