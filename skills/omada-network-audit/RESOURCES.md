# Resources: network audit

The rubric below is this project's own design. The idea of a fixed,
repeatable Wi-Fi scoring rubric with a saved baseline was inspired by
mballoni/omada-controller-mcp (GPL-3.0); no text or code from that
project is used here.

## Wi-Fi rubric (six dimensions, 0-10 each)

Score each dimension from the evidence listed. Use the worst affected
radio unless the rule says otherwise. If the evidence is missing, the
dimension is UNKNOWN.

### 1. Airtime load

Evidence: channel utilisation per radio from `getApRadios` and
`getChannels`.

| Busiest radio utilisation | Score |
| --- | --- |
| up to 40 % | 10 |
| 41-55 % | 7 |
| 56-70 % | 4 |
| above 70 % | 0 |

### 2. Link quality

Evidence: retry and drop rates from `getRetryAndDroppedRate` or the
retry section of `getWifiHealthSummary`, over at least 60 minutes.

| Retry rate | Score |
| --- | --- |
| up to 5 % | 10 |
| 6-10 % | 7 |
| 11-20 % | 4 |
| above 20 % | 0 |

Subtract 3 (minimum 0) if the drop rate is above 2 %.

### 3. Channel plan

Evidence: `getRadiosConfig` (configured) and `getApRadios` (runtime) per
AP, `getChannels`, `getInterference`. Start at 10 and subtract:

| Condition | Penalty |
| --- | --- |
| Two APs that can hear each other share a 5 GHz channel | 3 per pair |
| A 2.4 GHz radio on a channel other than 1, 6 or 11 | 2 per radio |
| 2.4 GHz radio wider than 20 MHz | 2 per radio |
| 5 GHz at 160 MHz on a site with more than two APs | 2 |
| Runtime channel differs from configured channel on a DFS channel (52-144) | 3 per AP (likely radar eviction, see omada-roaming-dfs) |
| A strong non-Omada interferer on the same channel in `getInterference` | 1 per radio |

Floor at 0.

### 4. Coverage

Evidence: per-client signal from `listClients` (wireless clients only).

| Wireless clients weaker than -75 dBm | Score |
| --- | --- |
| under 5 % | 10 |
| 5-9 % | 7 |
| 10-19 % | 4 |
| 20 % or more | 0 |

Ignore sites with fewer than 5 wireless clients (UNKNOWN).

### 5. Roaming readiness

Evidence: `getRoamingSetting`, `getSsidDetail` for each SSID, AP count.
Single-AP sites score 10 (not applicable). Start at 10 and subtract:

| Condition | Penalty |
| --- | --- |
| Fast roaming (802.11r) on while an SSID allows TKIP or "auto" encryption | 4 |
| More than one AP and neither fast roaming nor AI roaming is enabled | 3 |
| Band steering off on a site with dual-band APs and mostly dual-band clients | 1 |
| Mesh enabled on a site where every AP is wired (`getMeshSetting`, uplink type in `listDevices`) | 1 |

### 6. SSID hygiene

Evidence: `getSsidList`, `getSsidDetail`, `getWlanGroupList`. Start at 10:

| Condition | Penalty |
| --- | --- |
| More than 4 SSIDs broadcast on one radio | 2, or 4 if more than 6 |
| An SSID uses WEP, WPA (v1) or TKIP | 4 |
| An open SSID (no security) without guest network isolation | 4 |
| Protected management frames disabled on a WPA3 SSID | 1 |
| Legacy low data rates allowed on every SSID (no rate control set) | 1 |

### Total

Wi-Fi score = average of the known dimensions x 10 (0-100). Bands:
85-100 good, 70-84 fair, 50-69 needs work, below 50 poor. Always list
the UNKNOWN dimensions next to the total.

## Security checklist

Each check is PASS, WARN, FAIL or UNKNOWN. Severity in brackets.

| # | Check | Evidence | PASS when | Fix via omada-safe-change |
| --- | --- | --- | --- | --- |
| S1 | IDS/IPS enabled on the gateway [high] | `getIpsConfig` | enabled with blocking or at least detection | `setIpsSetting` |
| S2 | Attack defence (flood / spoof protection) on [medium] | `getAttackDefenseSetting` | main protections enabled | none on this server (controller UI) |
| S3 | Active threats in the last 7 days [high] | `getThreatCount`, `getThreatList`, `getSecurityOverview` | none unresolved | investigate first |
| S4 | Rogue APs [medium] | `getRogueAps`, `getWids` | none, or all known neighbours | none (physical follow-up) |
| S5 | Port forwards exposing management or remote-desktop ports (22, 23, 80, 443, 3389, 8043, 8088) [high] | `getPortForwardingList` | none, or each one justified by the operator | `updatePortForward`, `deletePortForward` |
| S6 | UPnP on the gateway [medium] | `getUpnpSetting` | disabled, or limited to a trusted LAN | none on this server |
| S7 | Device SSH access [medium] | `getSshSetting` | disabled, or enabled only on a management network | none on this server |
| S8 | SNMP [medium] | `getSnmpSetting` | disabled or v3; WARN for v1/v2c | none on this server |
| S9 | Controller MFA [high] | `getMfaStatus` | enforced for admins | controller UI |
| S10 | Admin accounts [medium] | `getAllLocalUsers`, `getAllCloudUsers`, `getAvailableRoles` | every admin is a named, current person; no shared accounts | controller UI |
| S11 | Cloud access and remote binding [low] | `getCloudAccessStatus`, `getRemoteBindingStatus` | matches what the operator intends | controller UI |
| S12 | Controller certificate [low] | `getCertificate` | trusted certificate, not expiring within 30 days | controller UI |
| S13 | Device access management [low] | `getDeviceAccessManagement` | management limited to trusted subnets | controller UI |
| S14 | Wireless encryption [high] | `getSsidDetail` | WPA2-AES or WPA3 on every non-guest SSID | `updateSsid` (basic fields) or controller UI for security mode |
| S15 | Guest isolation [medium] | `getSsidDetail` | guest/open SSIDs have guest network isolation | `updateSsid` (`guestNetEnable`) |
| S16 | Remote logging [low] | `getRemoteLoggingSetting`, `getRemoteLogging` | logs leave the controller (syslog) | none on this server |
| S17 | Data retention [low] | `getDataRetention` | retention matches the operator's privacy policy (client and log data kept no longer than needed) | controller UI |
| S18 | Firmware currency [medium] | `getUpgradeOverviewCritical`, `getFirmwareUpgradePlan` | no critical upgrades pending | `startFirmwareUpgrade` (high risk) |
| S19 | Backups [medium] | `getSiteBackupFileList`, `getBackupFileList` | a backup newer than the last configuration change and under 30 days old | `backupSites` |
| S20 | Recent admin changes [info] | `listSiteAuditLogs` (7 days) | every change recognised by the operator | n/a |

## Diagnosis patterns

| Pattern | Typical evidence | Likely cause |
| --- | --- | --- |
| High airtime, low retry | utilisation high on one channel, retry normal | Too many clients or SSIDs on one radio, or a busy neighbour network |
| High retry, normal airtime | retry above 10 %, utilisation moderate | Weak signal or non-Wi-Fi interference |
| Runtime channel keeps differing from configured on 5 GHz | DFS channel configured | Radar events forcing channel changes |
| Many clients below -75 dBm on one AP | coverage dimension low, one AP dominant | AP placement, or sticky clients that should roam |
| Gateway CPU high with low traffic | `getGatewayHealth`, `getIspLoad` | IPS/DPI load, or an attack in progress (check S3) |
| Device offline but in inventory | `listDevices` status | Uplink or PoE budget; check the switch port with `getSwitchDetail` |

## Baseline file format

```json
{
  "schema": "omada-network-audit/1",
  "site": "<site name>",
  "siteId": "<siteId>",
  "auditedAt": "<ISO time>",
  "controllerVersion": "<version>",
  "wifi": {
    "total": 78,
    "dimensions": {
      "airtime": { "score": 7, "busiestUtilPct": 52 },
      "linkQuality": { "score": 7, "retryPct": 8.1, "dropPct": 0.6 },
      "channelPlan": { "score": 7, "penalties": ["co-channel 5 GHz pair"] },
      "coverage": { "score": 10, "weakClientPct": 3 },
      "roaming": { "score": 7, "penalties": ["no fast or AI roaming"] },
      "ssidHygiene": { "score": "UNKNOWN" }
    }
  },
  "security": { "S1": "PASS", "S5": "WARN", "S9": "FAIL" },
  "counts": { "aps": 3, "switches": 1, "gateways": 1, "wirelessClients": 41 }
}
```

No client names, MACs, IPs or usernames in this file.
