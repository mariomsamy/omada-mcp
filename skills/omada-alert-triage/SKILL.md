---
name: omada-alert-triage
description: |
  TRIGGER when an operator wants to work through a batch of Omada alerts
  for one site: group them, rank them, tie each group to a device and
  its uplink, and get a short evidence-backed triage list.
  TRIGGER for "what's wrong at site X right now?", "triage the last 24h
  of alerts", "there are 120 red alerts this morning, which matter?",
  "which AP is causing these alerts?".
  SKIP when the device is already known and the question is about it
  (read it directly), for "who changed what" questions
  (omada-support-assist), for Wi-Fi quality (omada-wifi-troubleshoot),
  and for resolving or deleting alerts (omada-safe-change).
---

# Alert triage

## Goal

Turn a noisy alert log into a short, ranked list of issue groups, each
tied to a device (or client) and its place in the network. Read-only:
this skill never resolves, deletes or acknowledges alerts. Ticket drafts
go to [omada-support-assist](../omada-support-assist/SKILL.md); any fix
goes to [omada-safe-change](../omada-safe-change/SKILL.md).

## Capability profile needed

Read-only: `OMADA_CAPABILITY_PROFILE=safe-read` with
`OMADA_TOOL_CATEGORIES=all:r` (at minimum
`sites:r,logs:r,dashboard:r,devices-all:r,clients:r,client-insights:r`).
The plain `safe-read` defaults do not include `logs` or `sites`.

Marking alerts resolved afterwards (`resolveAlertLogs`) needs
`logs:rw`, which is not in `ops-write`; it requires `admin` or an
explicit grant, and goes through omada-safe-change.

Tool names are as registered by omada-mcp; your client may prefix
them. In compact catalog mode use `callOperation`.

## Tools

| Tool | Used for |
| --- | --- |
| `listSites`, `getSiteDetail` | Confirm the site and its time zone. |
| `listSiteAlerts` | The alert log for the window (`startTime`/`endTime` in Unix **milliseconds**, both or neither; `searchKey`; `page`/`pageSize`). |
| `listSiteEvents` | Events around the alert spike (same window rules). |
| `diagnoseLogs` | Quick first-page view of events, alerts and audit logs, with "unavailable vs empty" made explicit. |
| `listGlobalAlerts` | Only when the operator asks about all sites. |
| `getNetworkHealthSummary` | Is the site degraded right now? |
| `listDevices`, `getApDetail`, `getSwitchDetail`, `getGatewayDetail`, `getGatewayHealth` | Device context for the top groups. |
| `getUplinkWiredDetail`, `getDownlinkWiredDevices` | Where an AP hangs: uplink switch/port and its wired downlinks. |
| `diagnoseClient` | Context for client-scoped groups. |

## Workflow

1. **Scope the window.** Confirm site and window in one sentence
   (default: last 24 h). Convert relative times to Unix milliseconds and
   echo the ISO start and end back, in the site's time zone from
   `getSiteDetail`, so the operator can catch off-by-one-day or UTC
   mistakes.
2. **Is it live?** `getNetworkHealthSummary` tells you whether the site
   is degraded now or the alerts are history.
3. **Pull the log.** `listSiteAlerts` with both time bounds and
   `pageSize` 100, paging until the window is covered or you reach
   500 alerts. If you stop early, say so: the tail may hold a different
   issue. If the result is empty, run `diagnoseLogs` to tell "no alerts"
   from "alerts not available on this firmware".
4. **Group.** Group alerts by (alert type or key, severity, target
   device or client). Count each group and keep first seen, last seen
   and one sample message. Rank by severity (see `RESOURCES.md`), then
   by count, then by recency. Treat unknown severity as "read it", not
   as low.
5. **Zoom the top 3-5 device groups.** Resolve the MAC with
   `listDevices`, then use the type-specific read: `getApDetail`,
   `getSwitchDetail` or `getGatewayDetail` / `getGatewayHealth`. Note
   status, uptime, firmware, CPU/memory and client count. For APs, add
   `getUplinkWiredDetail` to see the upstream switch and port; if many
   APs on the same switch alert together, the switch or its uplink is
   the likelier cause.
6. **Client groups.** For client-scoped groups, use `diagnoseClient` on
   one representative client; if it is a Wi-Fi quality issue, hand over
   to omada-wifi-troubleshoot.
7. **Events for context.** `listSiteEvents` for 15 minutes either side
   of the biggest spike (reboots, disconnects, provisioning).
8. **Report** (template in `RESOURCES.md`): header, ranked groups with
   device context, an uplink hint, and suggested hand-offs.
9. **Do not act.** No reboots, no resolving. If the operator wants the
   noise cleared afterwards, hand `resolveAlertLogs` (narrow `include`
   selection of the reviewed log IDs) to omada-safe-change.

## Examples

- [examples/device-alert-storm.md](examples/device-alert-storm.md): two
  APs on one switch flooding the log.
- [examples/mixed-24h.md](examples/mixed-24h.md): a mixed 24 h log with
  an empty-log false alarm.

## Pitfalls

- Pass both `startTime` and `endTime` or neither; one alone is
  rejected. Alerts use milliseconds; `getRetryAndDroppedRate` uses
  seconds. Do not mix them up.
- The alert list has no module filter. Group by the fields that are
  actually present in the records, and use `searchKey` only as a
  coarse text filter.
- Severity strings are inconsistent across firmware. Normalise them
  (see `RESOURCES.md`) and always read the unknown bucket.
- An empty result is not proof of a quiet site; some firmware keeps
  logs in a different API family. `diagnoseLogs` makes that visible.
- `getDevice` and `getClient` are deprecated aliases hidden by default;
  use the type-specific device tools and `diagnoseClient` /
  `getClientDetail`.
