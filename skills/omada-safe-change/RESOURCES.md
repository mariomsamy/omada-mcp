# Resources: safe-change

## Write -> read-back map

Use the read tool before the change (rollback data) and after it
(verification). Every write tool also reads current state during its dry
run, so a fresh dry run is an acceptable read-back when no dedicated read
tool exists.

| Write tool | Read-back tool | Built-in verification |
| --- | --- | --- |
| `setApRadio` | `getRadiosConfig` (configured), `getApRadios` (runtime) | yes |
| `setApConfig` | family-specific: `getApGeneralConfig`, `getSitesApsIpSetting`, `getApIpv6Config`, `getApQosConfig`, `getRadiosConfig`, `getSitesApsLoadBalance`, `getSitesApsOfdma`, `getSitesApsTrunkSetting`, `getSitesApsBridge`, `listSitesApsPorts` | yes, where the family is readable |
| `setApChannelLimit` | `getSitesApsChannelLimit` | no |
| `setApPowerSaving` | `getSitesApsPowerSaving` | no |
| `updateSsid` | `getSsidDetail` | yes |
| `updateSsidRateLimit`, `updateSsidRateControl`, `updateSsidMultiCastConfig`, `updateSsidMacFilter`, `updateSsidWlanSchedule`, `updateSsidHotspotV2` | `getSsidDetail` | no: compare manually |
| `createSsid`, `deleteSsid` | `getSsidList` | no |
| `updateRoaming` | `getRoamingSetting` | no |
| `updateBandSteering` | `getBandSteeringSetting` | no |
| `updateBeaconControl` | `getBeaconControlSetting` | no |
| `updateMesh` | `getMeshSetting` | no |
| `updateRfPlanningConfig` | `getRadioFrequencyPlanningConfig` | no |
| `startRfOptimization`, `cancelRfOptimization` | `getRadioFrequencyPlanningResult`, `listRfPlanningHistory` | no |
| `applyRfPlanningHistory`, `deleteRfPlanningHistory` | `getRfPlanningHistoryDetail`, `listRfPlanningHistory`, then `getRadiosConfig` per AP | no |
| `setSwitchPorts` | `getSwitchDetail`, `getCableTestFullResults` for link state | yes, per port |
| `setSwitchNetworks` | `listSwitchNetworks` | no |
| `startCableTest` | `getCableTestFullResults`, `getCableTestLogs` | n/a (action) |
| `rebootDevice` | `listDevices` (status and uptime) | n/a (action) |
| `startFirmwareUpgrade` | `getFirmwareInfo`, `getUpgradeLogs` | n/a (action) |
| `adoptDevice` | `listPendingDevices`, `listDevices` | n/a (action) |
| `setDeviceLed`, `setSiteLed` | fresh dry run of the same tool | no |
| `blockClient`, `unblockClient`, `reconnectClient` | `listClients`, `getClientDetail` | n/a (action) |
| `setClientRateLimit`, `setClientRateLimitProfile`, `disableClientRateLimit` | `getClientDetail`, `getRateLimitProfiles` | no |
| `updateClient` | `getClientDetail` | no |
| `createLanNetwork`, `updateLanNetwork`, `deleteLanNetwork` | `getLanNetworkListV2` | no |
| `createLanProfile`, `updateLanProfile` | `getLanProfileList` | no |
| `createDhcpReservation`, `updateDhcpReservation`, `deleteDhcpReservation` | `getDhcpReservationGrid` | no |
| `createRoute`, `updateRoute`, `deleteRoute` | `getGridStaticRouting` | no |
| `createPortForward`, `updatePortForward`, `deletePortForward` | `getPortForwardingList` | no |
| `updateWanPortSetting` | `getWanPortsConfig` | no |
| `setGatewayWanConnect` | `getGatewayWanStatus` | no |
| `setGatewayConfig` | `getGatewayDetail`, `getSitesGatewaysGeneralConfig` | yes |
| `createGatewayAcl`, `updateGatewayAcl` | `listOsgAcls` | no |
| `createEapAcl`, `updateEapAcl` | `listEapAcls` | no |
| `createSwitchAcl`, `updateSwitchAcl` | `getOswAclList` | no |
| `deleteAcl`, `setAclConfigTypeSetting` | `listOsgAcls`, `listEapAcls`, `getOswAclList`, `getAclConfigTypeSetting` | no |
| `setFirewallSetting` | `getFirewallSetting` | no |
| `setIpsSetting` | `getIpsConfig` | no |
| `setAppControlRule`, `deleteAppControlRule` | `getAppControlRules` | no |
| `setBandwidthControlRule`, `deleteBandwidthControlRule` | `getGridBandwidthCtrlRule` | no |
| `setAccessControl` | `getAccessControl` | no |
| `createRebootSchedule`, `updateRebootSchedule`, `deleteRebootSchedule` | `listRebootSchedules`, `getRebootScheduleList` | no |
| `createPoeSchedule`, `updatePoeSchedule`, `deletePoeSchedule` | `getPoeScheduleList` | no |
| `resolveAlertLogs`, `deleteAlertLogs`, `deleteEventLogs` | `listSiteAlerts`, `listSiteEvents` | no |
| `updateLogNotificationSettings`, `resetLogNotificationSettings` | `getLogSettingForSiteV2`, `getLogSettingForGlobalV2` | no |
| `updateAuditNotificationSettings` | `getAuditLogSettingForSite`, `getAuditLogSettingForGlobal` | no |
| `backupSites`, `backupController` (and `...ToFileServer`) | `getSiteBackupResult`, `getSiteBackupFileList`, `getBackupResult`, `getBackupFileList` | n/a (action) |
| `restoreSites`, `restoreController` (and `...FromFileServer`) | `getRestoreResult` | n/a (action, recovery only) |

## Mutation status contract

| Status | Meaning | What to do |
| --- | --- | --- |
| `planned` | Dry run. Nothing was sent. | Show preview, ask for approval. |
| `submitted` / `applied` | Controller accepted the request. Not proof of effect. | Read back manually. |
| `verified` | Read-back matched (or already matched, no write needed). | Report the change. |
| `mismatch` | Read-back still differs after bounded retries. | Treat as "not applied". Investigate before retrying. |
| `unknown` | Outcome cannot be established. | Read current state. Do not repeat the write blindly. |
| `unverifiable` | No reliable read surface for the requested field. | Verify in the controller UI or by effect. |
| `partial` | Multi-target write finished differently per target. | Inspect each target. No automatic rollback happens. |

## Risk tiers

| Tier | Examples | Extra precautions |
| --- | --- | --- |
| Low | `updateClient`, `setDeviceLed`, `setSiteLed`, `resolveAlertLogs` (narrow selection), `cancelRfOptimization` | Standard loop. |
| Medium (clients notice) | `reconnectClient`, `blockClient`, rate limits, `updateSsid*`, `updateBandSteering`, `updateRoaming`, `updateBeaconControl`, `startCableTest` | Name the affected clients. Prefer a quiet window. |
| High (outage possible) | `setApRadio`, `setApConfig`, `setSwitchPorts`, `setSwitchNetworks`, `rebootDevice`, `startFirmwareUpgrade`, `startRfOptimization`, `applyRfPlanningHistory`, `updateMesh`, LAN/route/NAT/ACL/firewall/IPS writes, `updateWanPortSetting`, `setGatewayWanConnect`, `createPoeSchedule`, `createRebootSchedule`, `deleteSsid`, `deleteAlertLogs`, `deleteEventLogs` | Backup first (`backupSites`). Confirm out-of-band access (you can still reach the controller if this link drops). Change one device at a time. |
| Recovery | `restoreSites`, `restoreController` and file-server variants | Operator-initiated only. Needs `recovery:rw`, `dryRun: false` and `confirmDangerous: true`. Expect the whole site or controller to change. |

## Omada error codes

Omada reports most failures as a non-zero `errorCode` inside an HTTP 200
response. `errorCode: 0` is success. The table is collected from several
community projects that tested real controllers (credited below); codes
can differ between firmware releases, so read the `msg` too.

| Code | Usual meaning | Action |
| --- | --- | --- |
| `0` | Success (request accepted) | Still read back. |
| `-1` | Generic failure, often a feature the hardware does not have | Check the device model supports it. |
| `-1001` | Endpoint exists but the parameters are invalid or missing (some notes also see it for permission problems) | Re-check the schema with `describeOperation`. |
| `-1005` | Feature needs a licence the controller lacks | Not fixable from the MCP. |
| `-1007` | Account role cannot perform this operation (for example a Viewer-role app writing) | Use an Open API app with the right role. |
| `-1600` | This path is not supported on this firmware build | Use another tool or the controller UI. |
| `-33411` | Gateway not connected or not adopted | Check gateway status first. |
| `-44112`, `-44113` and nearby `-441xx` | Access token expired or invalid | The server refreshes once automatically; persistent failure means bad credentials or a revoked app. |
| `-1200`, `-30109`, `-30165` | Web UI session expired / two-factor account | Only seen on the web UI API, which this server does not use. Listed so third-party notes are not confused with Open API errors. |

## Silent failures and hardware quirks

Reported by community projects that tested real controllers. This server
uses only the Open API, so items about the web UI API are background.

- **Success without effect.** Omada can return `errorCode 0` for a write
  it then drops. Mutually exclusive settings are silently resolved by the
  controller. The read-back step is the only proof.
- **Whole-object writes.** Radio settings in particular are discarded if
  the object is incomplete. `setApRadio` and `setApConfig` re-send the
  full object; for `payload` tools, edit the before object rather than
  sending a fragment.
- **Channel index vs channel number.** The stored radio `channel` is an
  index into the AP's channel list; `freq` is the authoritative value.
  `setApRadio` takes a real channel number and converts it. When reading
  `getRadiosConfig`, trust `freq`.
- **Combined strings.** Some runtime fields arrive as text such as
  `"11 / 2462MHz"`. Parse both the channel and the frequency.
- **Missing is not zero.** The Open API returns fewer fields than the
  controller UI (for example per-radio client counts can be absent).
  PoE values like `"--"` mean unknown. Report unknown, not 0.
- **Delayed effect.** Radio and SSID changes report success at once but
  take 30-60 s to reach the air.
- **Logs per firmware.** On some 5.x and 6.2 builds one log family is
  empty or returns `-1600` while another holds the data. `diagnoseLogs`
  reports unavailable vs empty separately.
- **Easy-managed switches.** Some builds leave ES-series switches out of
  the regular switch-port lists. Use `getSitesSwitchesEs` and
  `getSitesSwitchesEsGeneralConfig`.
- **Loop detection vs STP.** On Omada switches, port loopback detection
  and spanning tree exclude each other. Changing one can switch the
  other off.
- **Per-AP SSID overrides.** An AP-level override can stop an SSID
  broadcasting on that AP even though the SSID itself is enabled.
- **Filters ignored.** Some list endpoints ignore filters they do not
  support and return everything. Check results against the filter.
- **No generic device detail route.** Use the type-specific tools
  (`getApDetail`, `getSwitchDetail`, `getGatewayDetail`).
- **Tested hardware in those reports** included OC200 (firmware 5.13,
  5.15 and 6.2), software controller 6.2, ER7206 gateways, T1600G and
  SG2008P switches, and EAP225, EAP610, EAP625-Outdoor, EAP650 and EAP683
  access points. The EAP650 was reported to reject the legacy RF-scan
  read that `getRFScanResult` (deprecated) wraps.

## Sources

Error codes and quirks are summarised, in our own words, from
ricardo-david-francisco/WhiteOmadaMcp-public (MIT),
thalisantunes/mcp-omada (Apache-2.0), kaviththiranga/omada-mcp-server
(MIT), margosmark/omada-mcp (MIT), Zesty0wl/omada-mcp (MIT) and
dfla-me/omada-mcp (MIT). See `NOTICE.md` in the server repository.
