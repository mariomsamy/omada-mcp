---
name: omada-wifi-troubleshoot
description: |
  TRIGGER when someone asks "why is my Wi-Fi slow / unstable?" on one
  Omada site and wants a fixed diagnostic playbook: site-wide Wi-Fi
  evidence first, then one client and/or one AP.
  TRIGGER for "Wi-Fi is laggy at the office", "my laptop keeps dropping
  in the living room", "AP Hall looks overloaded", "high retry rate",
  "poor signal clients".
  SKIP for an alert backlog (omada-alert-triage), a full scored review
  (omada-network-audit), roaming or DFS tuning in depth
  (omada-roaming-dfs), ticket drafting (omada-support-assist) and any
  change (omada-safe-change).
---

# Wi-Fi troubleshoot

## Goal

A repeatable read-only playbook for "my Wi-Fi is slow" on one site.
Site evidence first, then zoom into one client and/or one AP, then a
four-line verdict. Nothing is changed; a fix is handed to
[omada-safe-change](../omada-safe-change/SKILL.md).

## Capability profile needed

Read-only: `OMADA_CAPABILITY_PROFILE=safe-read` with
`OMADA_TOOL_CATEGORIES=all:r` (or at least
`dashboard:r,clients:r,client-insights:r,devices-all:r,wireless-radio:r,wireless-ssid:r,sites:r`).
The plain `safe-read` defaults do not include `wireless-radio`, so
`getWifiHealthSummary`, `getChannels` and `getInterference` would be
missing.

Tool names are as registered by omada-mcp; your client may prefix
them. In compact catalog mode call them through `callOperation`.

## Tools

| Tool | Used for |
| --- | --- |
| `listSites` | Confirm the site. |
| `getWifiHealthSummary` | One-call site evidence: dashboard, channels, interference, retry/drop, with missing sections marked. `windowMinutes` 1-1440. |
| `getDashboardWifiSummary` | Current dashboard Wi-Fi numbers. |
| `getRetryAndDroppedRate` | Retry and drop rate over a window (Unix **seconds**). |
| `getChannels`, `getInterference` | Channel use per AP and interference sources. |
| `diagnoseClient` | Resolve a client by MAC, IP or hostname; current attachment, signal and recent history. |
| `getClientDetail`, `getGridClientHistory`, `listClientsPastConnections` | Deeper client evidence (past connections use **milliseconds**). |
| `listDevices`, `getApDetail` | Find and inspect an AP. |
| `getApRadios`, `getRadiosConfig` | Runtime radio state vs configured radio settings. |
| `getRoamingSetting`, `getBandSteeringSetting` | Site roaming and band steering configuration. |

## Workflow

1. **One site.** Confirm the site with `listSites`. Reject cross-site
   comparisons (use omada-network-audit per site instead).
2. **Site evidence.** `getWifiHealthSummary` with a window that covers
   the complaint (default 60 minutes). Read every section and note which
   are missing. Add `getRetryAndDroppedRate` if retry data is absent.
3. **Pick the zoom path** using the signal table in `RESOURCES.md`:
   - retry above 10 % or a radio above 70 % utilisation -> AP zoom;
   - weak-signal clients, or the operator named a device -> client zoom;
   - health dipped earlier but is fine now -> past incident, suggest
     omada-alert-triage for that window.
4. **Client zoom.** `diagnoseClient` with whatever identifier the
   operator has (MAC, IP or hostname; ambiguous matches are rejected).
   Then `getGridClientHistory` for roams and disconnects. Build the
   client dossier from `RESOURCES.md`. Look for ping-pong (3 or more
   roams within 60 s between the same two APs) and for repeated
   disconnects with the same reason.
5. **AP zoom.** `listDevices` -> MAC, then `getApDetail`, `getApRadios`
   (runtime: channel, utilisation, clients per radio) and
   `getRadiosConfig` (configured). A runtime channel that differs from
   the configured one on a DFS channel points to radar: hand over to
   omada-roaming-dfs. High CPU with few clients suggests interference or
   a device fault.
6. **Verdict.** Four lines the operator can forward:
   - **Symptom:** what the evidence shows.
   - **Likely cause:** one or two candidates, ranked.
   - **Evidence:** tool, window and values.
   - **Next step:** a manual check, or a named change for
     omada-safe-change with the write tool and the grant it needs.

## Rules

- No write tools, not even dry runs. `reconnectClient`, `setApRadio`,
  `rebootDevice` and friends are suggestions only.
- Missing evidence is reported as unknown, never as zero or "fine".
- Thresholds are heuristics. A site with a known baseline is judged
  against its own baseline.
- Name a client only when the complaint is about that client.

## Examples

- [examples/slow-wifi-home.md](examples/slow-wifi-home.md): single AP,
  evening airtime congestion.
- [examples/roaming-laptop.md](examples/roaming-laptop.md): a laptop
  ping-ponging between two APs.

## Reference

`RESOURCES.md`: signal -> hypothesis table, the client dossier template
and common scenarios. `checklists/diagnose-runbook.md`: step checklist.
