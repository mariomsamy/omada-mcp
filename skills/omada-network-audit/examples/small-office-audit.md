# Example: small-office audit and re-audit

Operator: "Audit the office network and keep a baseline so we can compare
next month."

Server: `OMADA_CAPABILITY_PROFILE=safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

## First audit

1. `listSites` -> "Office" `66b0...`. `getControllerStatus` -> 6.x.
2. Health: `getNetworkHealthSummary` shows 3 APs, 1 switch, 1 gateway,
   all connected, WAN up. `getGatewayHealth` shows gateway CPU 18 %.
3. Inventory: `getUpgradeOverviewCritical` reports 1 critical upgrade
   (AP-Meeting).
4. Wi-Fi: `getWifiHealthSummary { windowMinutes: 240 }`,
   `getRetryAndDroppedRate` (last 4 h, seconds), `getChannels`, and
   `getApRadios` / `getRadiosConfig` for each AP.
   - Airtime: busiest radio AP-Hall 5 GHz at 52 % -> 7.
   - Link quality: retry 8 %, drop 0.4 % -> 7.
   - Channel plan: AP-Hall and AP-Meeting both on 5 GHz channel 36 and
     hear each other -> 10 - 3 = 7.
   - Coverage: 3 of 41 wireless clients below -75 dBm (7 %) -> 7.
   - Roaming: 3 APs, fast roaming and AI roaming both off -> 7.
   - SSID hygiene: 3 SSIDs, WPA2-AES, guest SSID isolated -> 10.
   - Total: (7+7+7+7+7+10)/6 x 10 = 75 (fair).
5. Security: S1 PASS, S5 WARN (port forward 8443 to an internal NAS,
   operator confirms it is intended), S9 FAIL (MFA not enforced),
   S18 WARN (one critical upgrade), S19 FAIL (no site backup).
6. Report written with the template. Suggested fixes:
   - S19: `backupSites` via omada-safe-change (needs `maintenance:rw`,
     `ops-write`).
   - Channel plan: move AP-Meeting 5 GHz to a free non-DFS channel with
     `setApRadio` (needs `devices-ap:rw`).
   - Roaming: `updateRoaming` (needs `wireless-radio:rw`), after checking
     the SSIDs are AES-only.
   - S9: enable MFA in the controller UI (no tool on this server).
7. Baseline saved to the path the operator gave, with metric values and
   no client identifiers.

## Re-audit a month later

Same steps. The baseline diff shows: channel plan 7 -> 10 (AP-Meeting
moved to channel 44), roaming 7 -> 10, total 75 -> 85. S19 now PASS
(backup 3 days old). S9 still FAIL and stays at the top of the findings.
