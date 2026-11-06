---
name: omada-network-audit
description: |
  TRIGGER when the operator wants a read-only health and security review
  of an Omada site: "audit my network", "health check before the
  holidays", "is anything insecure on the controller?", "score our
  Wi-Fi", "compare this audit with last month's".
  Produces a scored Wi-Fi rubric, a PASS/WARN/FAIL security checklist,
  a device/firmware/backup inventory and a prioritised findings list,
  optionally saved as a baseline for later diffs.
  SKIP for a live complaint about one client or one AP (use
  omada-wifi-troubleshoot), for an alert backlog (omada-alert-triage),
  for a ticket draft (omada-support-assist), and for applying any fix
  (omada-safe-change).
---

# Network audit (read-only health and security review)

## Goal

Give the operator an evidence-backed picture of one site's health and
security posture, scored the same way every time so two audits can be
compared. This skill never changes anything. Each finding names the
tool that produced its evidence and, where a fix exists, the write tool
that would apply it through [omada-safe-change](../omada-safe-change/SKILL.md).

## Capability profile needed

Read-only. Run the server with:

```
OMADA_CAPABILITY_PROFILE=safe-read
OMADA_TOOL_CATEGORIES=all:r
```

The `safe-read` default categories alone (dashboard, clients,
client-insights, devices, firewall ACL and traffic) are not enough: this
audit also needs `sites`, `logs`, `wireless-*`, `network-*`,
`security-*`, `firewall-ids`, `controller`, `maintenance`,
`account-users`, `account-cloud` and `schedules` read access. `all:r`
never registers a write tool and never includes recovery. If a section's
tools are missing, mark that section UNKNOWN instead of guessing.

Tool names are as registered by omada-mcp. Your client may prefix
them. In compact catalog mode use `searchOperations` /
`describeOperation` / `callOperation`.

## Workflow

0. **Quick pass (optional).** `getNetworkAuditReport` returns a
   prioritised findings list (severity, evidence, recommendation) plus
   compact sections and an `unavailable` list in one read-only call.
   Use it as the starting point or for a fast check; its `score` is a
   simple severity penalty, not the rubric score from step 7. Use
   `groupSiteAlerts` to drill into alert groups.
1. **Scope.** `listSites`, then confirm the site. Record the audit time
   in ISO form and the controller version from `getControllerStatus`.
   Use `getServerCapabilities` to note the active profile and categories.
2. **Overall health.** `getNetworkHealthSummary`, `getDashboardOverview`,
   `getGatewayHealth`, `getSitesHealthGatewaysWansDetails`,
   `getWanLanStatus`, `getIspLoad`.
3. **Inventory and lifecycle.** `listDevices`, `listDevicesStats`,
   `listPendingDevices`, `getDashboardTopCpuUsage`,
   `getDashboardTopMemoryUsage`, `getUpgradeOverviewCritical`,
   `getFirmwareUpgradePlan`, `getSiteCapacity`, `getSiteNtpStatus`.
4. **Wi-Fi evidence.** `getWifiHealthSummary` (window 60-1440 min),
   `getDashboardWifiSummary`, `getChannels`, `getInterference`,
   `getRetryAndDroppedRate` (seconds), `getWlanExperienceIndex`,
   `getRoamingSetting`, `getBandSteeringSetting`,
   `getBeaconControlSetting`, `getMeshSetting`, `getSsidList` /
   `getWlanGroupList` / `getSsidDetail`, and for each AP `getApRadios`
   (runtime) and `getRadiosConfig` (configured). Client signal comes
   from `listClients`.
5. **Security evidence.** `getSecurityOverview`, `getThreatCount`,
   `getThreatList`, `getIpsConfig`, `getAttackDefenseSetting`,
   `getFirewallSetting`, `getWids`, `getRogueAps`,
   `getPortForwardingList`, `getUpnpSetting`, `getSshSetting`,
   `getSnmpSetting`, `getMfaStatus`, `getAllLocalUsers`,
   `getAllCloudUsers`, `getAvailableRoles`, `getCloudAccessStatus`,
   `getRemoteBindingStatus`, `getCertificate`,
   `getDeviceAccessManagement`, `getRemoteLoggingSetting`,
   `getDataRetention`, `listSiteAuditLogs` (last 7 days).
6. **Resilience.** `getSiteBackupFileList`, `getBackupFileList`,
   `getRebootScheduleList`, `getPoeScheduleList`, `diagnoseLogs`.
7. **Score.** Apply the Wi-Fi rubric and the security checklist in
   `RESOURCES.md` exactly as written. A dimension or check without
   evidence is UNKNOWN and is left out of the score, never assumed fine.
8. **Report.** Use the template in `checklists/audit-report.md`: header,
   scores, findings ordered by severity, inventory, unknowns, and the
   suggested fixes with the write tool and grant each would need.
9. **Baseline (optional).** If the operator wants re-audits, write the
   scores and the raw metric values (not client names or MACs) to a
   JSON file at a path the operator chooses. On the next audit, load it
   and report the change per dimension and per check.

## Rules

- Read-only. Do not call any write tool, even with `dryRun`. Fixes are
  handed to omada-safe-change.
- Do not trigger scans or RF optimisation (`startRfOptimization` is a
  write). Use the evidence the controller already has.
- Client names, MACs, IPs and audit-log usernames are personal data.
  Report counts and percentages; name an individual client only when the
  finding is about that device. Never put them in the baseline file.
- Say how fresh each piece of evidence is. Controller dashboards cover
  different windows.
- Thresholds are review heuristics. If the operator has their own
  baseline for the site, theirs wins.

## Examples

- [examples/small-office-audit.md](examples/small-office-audit.md):
  three APs, one gateway, a first audit and a re-audit diff.

## Reference

`RESOURCES.md`: the six-dimension Wi-Fi rubric, the security checklist,
diagnosis patterns and the baseline file format.
