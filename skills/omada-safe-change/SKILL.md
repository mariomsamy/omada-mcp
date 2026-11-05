---
name: omada-safe-change
description: |
  TRIGGER whenever the operator wants to change anything on an Omada
  controller through safe-omada-mcp: an SSID, an AP radio, a switch port,
  roaming or band steering, a LAN, route, port forward, schedule, client
  block or rate limit, a reboot, a firmware upgrade, a backup. Covers the
  mandatory dry-run -> review -> apply -> read-back loop and which
  capability profile each write needs.
  TRIGGER for "change channel on AP X", "turn on fast roaming", "block
  this client", "disable PoE on port 7", "apply the RF plan", "roll back
  what we changed".
  SKIP for read-only questions (use omada-network-audit,
  omada-wifi-troubleshoot, omada-alert-triage or omada-support-assist).
  SKIP restores of controller or site backups unless the operator has
  explicitly granted recovery:rw; that is an operator-only action.
---

# Safe change (dry-run -> review -> apply -> read-back)

## Goal

Make one controlled change at a time, with evidence before and after.
Every write tool in safe-omada-mcp defaults to `dryRun: true`; this skill
is the procedure for turning a preview into an applied, verified change
without ever skipping the human review step.

Tool names below are the names safe-omada-mcp registers. Your MCP client
may prefix them (for example `mcp__safe-omada__setApRadio`). In
`OMADA_CATALOG_MODE=compact` call them through `searchOperations` ->
`describeOperation` -> `callOperation`.

## Capability profile needed

Writes are only visible when the server exposes their category with write
permission. Check with `getServerCapabilities` before planning.

| Change family | Example tools | Category grant | Minimum profile |
| --- | --- | --- | --- |
| Client operations | `blockClient`, `unblockClient`, `reconnectClient`, `setClientRateLimit`, `setClientRateLimitProfile`, `disableClientRateLimit`, `updateClient` | `clients:rw` | `ops-write` |
| Backups | `backupSites`, `backupController`, `backupSitesToFileServer`, `backupControllerToFileServer` | `maintenance:rw` | `ops-write` |
| AP radio / AP config | `setApRadio`, `setApConfig`, `setApChannelLimit`, `setApPowerSaving` | `devices-ap:rw` | `admin` (or explicit grant) |
| Device actions | `rebootDevice`, `setDeviceLed`, `adoptDevice`, `startFirmwareUpgrade` | `devices-general:rw` | `admin` (or explicit grant) |
| Switch ports | `setSwitchPorts`, `setSwitchNetworks`, `startCableTest` | `devices-switch:rw` | `admin` (or explicit grant) |
| SSIDs | `updateSsid`, `createSsid`, `deleteSsid`, `updateSsidRateLimit`, `updateSsidRateControl`, `updateSsidMultiCastConfig`, `updateSsidMacFilter`, `updateSsidWlanSchedule`, `updateSsidHotspotV2` | `wireless-ssid:rw` | `admin` (or explicit grant) |
| Site RF | `updateRoaming`, `updateBandSteering`, `updateBeaconControl`, `updateMesh`, `updateRfPlanningConfig`, `startRfOptimization`, `cancelRfOptimization`, `applyRfPlanningHistory`, `deleteRfPlanningHistory` | `wireless-radio:rw` | `admin` (or explicit grant) |
| Network | `createLanNetwork`, `updateLanNetwork`, `deleteLanNetwork`, `createLanProfile`, `updateLanProfile`, `createRoute`, `updateRoute`, `deleteRoute`, `createPortForward`, `updatePortForward`, `deletePortForward`, `createDhcpReservation`, `updateDhcpReservation`, `deleteDhcpReservation`, `updateWanPortSetting` | `network-lan:rw`, `network-routing:rw`, `network-nat:rw`, `network-services:rw`, `network-wan:rw` | `admin` (or explicit grant) |
| Gateway | `setGatewayConfig`, `setGatewayWanConnect` | `devices-gateway:rw` | `admin` (or explicit grant) |
| Firewall / traffic | `createGatewayAcl`, `updateGatewayAcl`, `createEapAcl`, `updateEapAcl`, `createSwitchAcl`, `updateSwitchAcl`, `deleteAcl`, `setAclConfigTypeSetting`, `setFirewallSetting`, `setAppControlRule`, `deleteAppControlRule`, `setBandwidthControlRule`, `deleteBandwidthControlRule`, `setAccessControl`, `setIpsSetting` | `firewall-acl:rw`, `firewall-traffic:rw`, `firewall-ids:rw` | `admin` (or explicit grant) |
| Schedules, logs, site LED | `createRebootSchedule`, `createPoeSchedule` (and update/delete), `resolveAlertLogs`, `deleteAlertLogs`, `deleteEventLogs`, `updateLogNotificationSettings`, `resetLogNotificationSettings`, `updateAuditNotificationSettings`, `setSiteLed` | `schedules:rw`, `logs:rw`, `sites:rw` | `admin` (or explicit grant) |
| Restore | `restoreSites`, `restoreSitesFromFileServer`, `restoreController`, `restoreControllerFromFileServer` | `recovery:rw` (never included in `admin` or `all:rw`) | explicit grant only, plus `confirmDangerous: true` |

Prefer the narrowest grant, for example
`OMADA_TOOL_CATEGORIES=all:r,wireless-radio:rw` for a one-off roaming change,
and drop it back to read-only afterwards. `OMADA_TOOL_CATEGORIES` replaces
the profile defaults, and the server reads it at start-up, so a change needs
a restart. If the needed tool is not exposed, stop and tell the operator
which grant is missing. Never work around a missing tool: no raw API calls,
no scripted UI sessions.

## Workflow

1. **Scope the target.** Resolve exact identifiers with read tools:
   `listSites`, `listDevices`, `searchDevices`, `getSsidList` /
   `getWlanGroupList`, `listClients` or `diagnoseClient`. Echo back
   site, object and identifier so the operator can catch a wrong target.
2. **Read the before state (safe-read).** Call the read tool that pairs
   with the write tool (see `RESOURCES.md`, "Write -> read-back map").
   Keep the raw result. It is your rollback data.
3. **Build the smallest change.** Change only the fields the operator
   asked for. Payload-style tools (`updateRoaming`, `updateBandSteering`,
   `updateSsidRateLimit` and the other ported `payload` tools) send a
   whole settings object, so start from the before object and edit it.
   Omada often treats a missing field as "reset to default".
4. **Dry run (same profile as the write).** Call the write tool *without*
   `dryRun` (it defaults to `true`). Expect `status: planned`. Show the
   operator the preview verbatim, then state the impact in one line:
   who disconnects, which ports drop, what reboots, how long.
5. **Get explicit approval for this exact preview.** A yes to an earlier
   preview does not carry over. If anything in the arguments changes,
   run a new dry run. For high-risk changes (see `RESOURCES.md`), first
   suggest a backup with `backupSites` (also dry-run first).
6. **Apply.** Repeat the identical call with `dryRun: false`. Do not
   batch several unrelated writes into one approval.
7. **Read back.** Tools with built-in verification (`setApRadio`,
   `setApConfig`, `setGatewayConfig`, `updateSsid`, `setSwitchPorts`)
   return `verified`, `mismatch`, `unknown`, `unverifiable` or `partial`.
   Other tools return `submitted` or `applied`, which only means the
   controller accepted the request: call the read tool again and compare
   the requested fields. Radio and SSID changes can take 30-60 s to show;
   re-read two or three times before deciding.
8. **Classify the outcome.** `verified` (matches), `not applied` (the
   controller answered success but the value did not change, a known
   Omada behaviour), or `unknown`. Never repeat an uncertain write
   blindly: read the current state first.
9. **Check health after the change (safe-read).** Re-run the evidence
   that motivated the change: `getWifiHealthSummary`, `diagnoseClient`,
   `getApRadios`, `listSiteAlerts` for the last few minutes.
10. **Record it.** Fill in the change record in
    `checklists/change-record.md`. If the change made things worse,
    roll back by running this same loop with the before values.

## Rules

- One change per loop. Multi-port or multi-AP work goes target by target,
  stopping at the first `mismatch`, `unknown` or `partial` result.
- `dryRun: false` is only ever sent after the operator approved that
  exact preview in this conversation.
- `confirmDangerous` and `confirmBroadSelection` are argument checks, not
  approvals. Set them only after the operator has explicitly asked for
  that restore or broad log action.
- Never ask for, print or store Wi-Fi passphrases, RADIUS secrets or
  controller credentials. The server redacts them; keep it that way.
- If the operator asks to skip the preview, explain that the server
  defaults to preview and the review step is the safety mechanism.

## Examples

- [examples/fast-roaming-change.md](examples/fast-roaming-change.md):
  turning on fast roaming with a payload-style tool and a manual read-back.
- [examples/switch-port-poe.md](examples/switch-port-poe.md): a PoE
  power-cycle on one switch port with built-in verification.

## Reference

`RESOURCES.md` has the write -> read-back map, the mutation status
contract, risk tiers, the Omada error-code table and known silent-failure
behaviours seen on real hardware.
