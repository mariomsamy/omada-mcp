---
name: omada-bulk-site-onboard
description: |
  TRIGGER when an MSP or integrator is bringing several Omada sites to a
  common standard: checking which sites exist, comparing each against a
  site template or a reference site, finding VLAN/subnet/SSID conflicts,
  adopting pending devices, and planning per-site changes in waves.
  TRIGGER for "onboard these 10 stores", "are all branches configured
  like the template?", "roll out the standard VLANs to the new sites",
  "which new devices are waiting for adoption?".
  SKIP for a single change on one site (omada-safe-change), read-only
  health reviews (omada-network-audit) and firmware-only questions.
  Note: omada-mcp cannot create sites, import site backups or bind
  site templates; those steps are done in the controller UI and this
  skill verifies them.
---

# Bulk site onboarding (readiness, conformance and waves)

## Goal

Get a set of sites to a known standard with evidence, in controlled
waves. The skill inventories sites, compares each one with a reference
(a site template or a known-good site), runs a conflict preflight,
produces a per-site change plan, and then applies that plan one change
at a time through [omada-safe-change](../omada-safe-change/SKILL.md).

## What this server can and cannot do

| Step | On this server | Otherwise |
| --- | --- | --- |
| List sites, read site and template settings | yes (read tools) | |
| Create a site, import sites from backup files, bind a site template | **no** | Controller UI (or a separate tool the operator trusts) |
| Adopt pending devices | `adoptDevice` | |
| Create LANs, LAN profiles, SSIDs, DHCP reservations, schedules | yes (write tools, admin grants) | |
| Back up sites before changes | `backupSites`, `backupSitesToFileServer` | |
| Restore a site | only with explicit `recovery:rw` | Operator-only |

Never pretend a missing step happened. Mark it "manual in controller UI"
and verify the result with read tools afterwards.

## Capability profile needed

| Phase | Tools | Grant | Profile |
| --- | --- | --- | --- |
| Inventory, compare, preflight | `listSites`, `getSiteDetail`, `getSiteSpecification`, `getSiteCapacity`, `getSiteNtpStatus`, `getSiteTemplateList`, `getSiteTemplateDetail`, `getSiteTemplateConfig`, `getLanNetworkListV2`, `getLanProfileList`, `getWlanGroupList`, `getSsidList`, `getSsidDetail`, `getDhcpReservationGrid`, `listDevices`, `listPendingDevices`, `getFirmwareUpgradePlan`, `getUpgradeOverviewCritical` | `all:r` | `safe-read` + `OMADA_TOOL_CATEGORIES=all:r` |
| Backup before a wave | `backupSites` | `maintenance:rw` | `ops-write` |
| Adopt devices | `adoptDevice` | `devices-general:rw` | `admin` or explicit grant |
| Apply standard config | `createLanNetwork`, `updateLanNetwork`, `createLanProfile`, `updateLanProfile`, `createSsid`, `updateSsid`, `updateSsidRateLimit`, `createDhcpReservation`, `createRebootSchedule`, `createPoeSchedule` | `network-lan:rw`, `wireless-ssid:rw`, `network-services:rw`, `schedules:rw` | `admin` or explicit grant |

Run inventory and preflight with read-only categories. Widen the grant
only for the wave being applied, then narrow it again.

## Workflow

1. **Scope.** Get the list of target sites (names) and the reference:
   a site template ID or a reference site. `listSites` and split the
   targets into *exists* and *missing*. Missing sites must be created in
   the controller UI first; list them and stop for those.
2. **Read the reference.** Template: `getSiteTemplateList` ->
   `getSiteTemplateDetail` -> `getSiteTemplateConfig`. Reference site:
   `getLanNetworkListV2`, `getLanProfileList`, `getWlanGroupList`,
   `getSsidList` / `getSsidDetail`, `getDhcpReservationGrid`.
3. **Read each target site** with the same tools, plus
   `getSiteDetail` (time zone, region), `getSiteNtpStatus`,
   `getSiteCapacity`, `listDevices`, `listPendingDevices`.
4. **Preflight** (`checklists/preflight.md`): subnet overlaps between
   sites that will be joined by VPN, VLAN ID clashes, duplicate SSID
   names with different security, DHCP ranges colliding with
   reservations, time zone and NTP sane, device capacity, pending
   devices, critical firmware. Stop and report on any FAIL.
5. **Per-site plan.** For each site, list the differences from the
   reference as concrete changes: "create LAN Staff VLAN 20
   10.14.20.0/24 (`createLanNetwork`)", "adopt 2 pending APs
   (`adoptDevice`)". Mark steps the server cannot do as manual.
6. **Waves.** Start with one pilot site, then small waves (for example
   1 -> 5 -> the rest). Before each wave: `backupSites` for the wave's
   sites (dry run, approval, apply, then `getSiteBackupResult`).
7. **Apply.** For each site, for each change: the full omada-safe-change
   loop (before read, dry run, approval, `dryRun: false`, read-back).
   One approval covers one previewed change, not a whole wave. Stop the
   wave at the first `mismatch`, `unknown` or `partial` result.
8. **Verify the wave.** Re-run step 3 for the wave's sites and diff
   against the reference. Report conformant, drifted and manual-pending
   items per site.
9. **Report.** Sites done, changes applied and verified, failures with
   `errorCode` and message, manual steps still open.

## Rules

- Never guess identifiers across sites: SSID IDs, WLAN group IDs, LAN
  IDs and profile IDs are site-local. Look them up per site.
- Payload tools (`createLanNetwork`, `createSsid`, ...) are built from
  the reference object with site-specific values substituted; never send
  a half-filled skeleton.
- Wi-Fi passphrases and RADIUS secrets are not read back by the server
  (they are redacted). Ask the operator to enter them per site at apply
  time, or set them in the controller UI.
- Rollback is manual: re-apply the before values through the same loop,
  or restore the wave's backup (operator-only, `recovery:rw`).

## Examples

- [examples/10-stores-quickservice.md](examples/10-stores-quickservice.md):
  ten existing stores brought in line with a reference store.
- [examples/multi-region-rollout.md](examples/multi-region-rollout.md):
  new sites created in the UI from a template, then verified and
  completed here.
