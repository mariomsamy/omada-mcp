# Port batch: ported and skipped tools

Scope: tool names present in aljopro/tplink-omada-mcp, realtydev/omada-mcp, Zesty0wl/omada-mcp or daniel-k/omada-mcp but missing from the base
(`comm -13 analysis/names/base.txt <(...)`): **110 candidates, 54 ported, 56 skipped**.

Rules applied to each candidate:

1. Its method, path and body must match an operation in the bundled `docs/openapi/*.json`. The spec's verb and path were used, not the source repo's.
   Some sources sent the wrong verb (daniel-k used PUT for PATCH routes, for example) or an undocumented path.
2. No raw API tool, no private `/api/v2` or cookie/CSRF web API, and no header-supplied credentials. Where a source tool used the private
   web API but the operation is documented in the Open API (PoE and reboot schedules), only the concept was kept. It was re-implemented on the Open API route.
3. When an existing base tool already covers the same documented route, the candidate was skipped as a duplicate rather than re-registered under a second name.

All writes default to `dryRun: true` and emit mutation audit events. Destructive tools set `destructiveHint` and live in categories that only `admin`
(or an explicit `OMADA_TOOL_CATEGORIES` grant) enables. `tests/toolCategories.test.ts` asserts they are absent from `safe-read` and `ops-write`.
Update and delete tools for id-addressed resources run an existence preflight and refuse unknown IDs. Log deletion and resolution with `exclude`/`all`
selections additionally require `confirmBroadSelection: true`.

No ported tool has been validated against a live controller. Treat them as `submitted`-only until they are covered by the release validation matrix.

## Ported (54)

| Tool | Category | Risk | Official operation | Source |
|---|---|---|---|---|
| `getWlanExperienceIndex` | `wireless-radio` | read | GET /sites/{siteId}/experienceIndex (getExperienceIndex) | daniel-k |
| `listRfPlanningHistory` | `wireless-radio` | read | GET /sites/{siteId}/planningHistory (getGirdPlanningHistorys) | daniel-k |
| `getRfPlanningHistoryDetail` | `wireless-radio` | read | GET /sites/{siteId}/planningHistory/{id} (getPlanningHistory) | daniel-k |
| `listRebootSchedules` | `schedules` | read | GET /sites/{siteId}/reboot-schedules (getRebootScheduleList) | daniel-k |
| `getServerInfo` | `controller` | read | none (local process metadata only) | realtydev (build-commit fields dropped; no generated build file) |
| `adoptDevice` | `devices-general` | write | POST /sites/{siteId}/devices/{deviceMac}/start-adopt (adoptDevice) | aljopro, Zesty0wl (realtydev/daniel-k used /cmd/adopts, not in spec) |
| `startCableTest` | `devices-switch` | destructive write | POST /sites/{siteId}/cable-test/switches/{switchMac}/start (startCableTest) | all four |
| `startFirmwareUpgrade` | `devices-general` | destructive write | POST /sites/{siteId}/devices/{deviceMac}/start-online-upgrade (onlineUpgrade) | aljopro, Zesty0wl (realtydev/daniel-k used /devices/{mac}/firmware/upgrade, not in spec) |
| `setSwitchNetworks` | `devices-switch` | destructive write | POST /sites/{siteId}/switches/{switchMac}/networks (batchApplySwitchNetwork) | all four |
| `setGatewayWanConnect` | `devices-gateway` | destructive write | POST /sites/{siteId}/gateways/{gatewayMac}/internet-state (changeInternetState) | realtydev (Zesty0wl /cmd/gateways/{mac}/internetState and daniel-k /gateways/{mac}/wan/{port}/{action} are not in spec) |
| `updateWanPortSetting` | `network-wan` | destructive write | PATCH /sites/{siteId}/wan/networks/port-setting (modifyWanPortSettings) | realtydev |
| `setSiteLed` | `sites` | write | PUT /sites/{siteId}/led (updateSiteLedSetting) | aljopro |
| `updateClient` | `clients` | write | PATCH /sites/{siteId}/clients/{clientMac}/name (updateClientName) | aljopro, Zesty0wl, realtydev, daniel-k (name only; rate limits stay in setClientRateLimit) |
| `createLanNetwork` | `network-lan` | write | POST v2 /sites/{siteId}/lan-networks (createLanNetworkV2; v1 is deprecated) | all four (v2 route used) |
| `updateLanNetwork` | `network-lan` | destructive write | PATCH v2 /sites/{siteId}/lan-networks/{networkId} (modifyLanNetworkV2; v1 is deprecated) | aljopro, Zesty0wl (daniel-k used PUT; spec verb is PATCH) |
| `deleteLanNetwork` | `network-lan` | destructive write | DELETE /sites/{siteId}/lan-networks/{networkId} (deleteLanNetwork) | all four |
| `createLanProfile` | `network-lan` | write | POST /sites/{siteId}/lan-profiles (createLanProfile) | all four |
| `updateLanProfile` | `network-lan` | destructive write | PATCH /sites/{siteId}/lan-profiles/{profileId} (modifyLanProfile) | aljopro, Zesty0wl (realtydev/daniel-k used PUT; spec verb is PATCH) |
| `createPortForward` | `network-nat` | destructive write | POST /sites/{siteId}/nat/port-forwardings (createPortForwarding) | realtydev (source path /setting/transmission/portForwardings is not in spec; spec route used) |
| `updatePortForward` | `network-nat` | destructive write | PUT /sites/{siteId}/nat/port-forwardings/{portForwardingId} (modifyPortForwarding) | realtydev (source path not in spec; spec route used) |
| `deletePortForward` | `network-nat` | destructive write | DELETE /sites/{siteId}/nat/port-forwardings/{portForwardingId} (deletePortForwarding) | realtydev (source path not in spec; spec route used) |
| `createRoute` | `network-routing` | destructive write | POST /sites/{siteId}/routing/static-routings (createStaticRouting) | realtydev (source path /setting/transmission/staticRoutings is not in spec; spec route used) |
| `updateRoute` | `network-routing` | destructive write | PUT /sites/{siteId}/routing/static-routings/{staticRoutingId} (modifyStaticRouting) | realtydev (source path not in spec; spec route used) |
| `deleteRoute` | `network-routing` | destructive write | DELETE /sites/{siteId}/routing/static-routings/{staticRoutingId} (deleteStaticRouting) | realtydev (source path not in spec; spec route used) |
| `createSsid` | `wireless-ssid` | write | POST /sites/{siteId}/wireless-network/wlans/{wlanId}/ssids (createSsid) | daniel-k |
| `deleteSsid` | `wireless-ssid` | destructive write | DELETE /sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId} (deleteSsid) | daniel-k |
| `updateSsidHotspotV2` | `wireless-ssid` | write | PATCH .../ssids/{ssidId}/update-hotspotv2 (updateSsidHotspotV2Setting) | daniel-k |
| `updateSsidMacFilter` | `wireless-ssid` | destructive write | PATCH .../ssids/{ssidId}/update-mac-filter (updateSsidMacFilterConfig) | daniel-k |
| `updateSsidMultiCastConfig` | `wireless-ssid` | write | PATCH .../ssids/{ssidId}/update-multicast-config (updateSsidMultiCastConfig) | daniel-k |
| `updateSsidRateControl` | `wireless-ssid` | write | PATCH .../ssids/{ssidId}/update-rate-control (updateSsidRateControlConfig) | daniel-k |
| `updateSsidRateLimit` | `wireless-ssid` | write | PATCH .../ssids/{ssidId}/update-rate-limit (updateSsidRateLimitConfig) | daniel-k |
| `updateSsidWlanSchedule` | `wireless-ssid` | destructive write | PATCH .../ssids/{ssidId}/update-wlan-schedule (updateSsidWlanSchedule) | daniel-k |
| `updateBandSteering` | `wireless-radio` | write | PATCH /sites/{siteId}/band-steering (updateBandSteeringSetting) | daniel-k |
| `updateBeaconControl` | `wireless-radio` | write | PATCH /sites/{siteId}/beacon-control (updateBeaconControlSetting) | daniel-k |
| `updateMesh` | `wireless-radio` | destructive write | PATCH /sites/{siteId}/mesh (updateMeshSetting) | daniel-k |
| `updateRoaming` | `wireless-radio` | write | PATCH /sites/{siteId}/roaming (updateRoamingSetting) | daniel-k |
| `startRfOptimization` | `wireless-radio` | destructive write | POST /sites/{siteId}/cmd/rfPlanning/optimization (startOptimization) | daniel-k |
| `cancelRfOptimization` | `wireless-radio` | write | POST /sites/{siteId}/cmd/rfPlanning/cancel (cancelRadioFrequencyPlanning) | daniel-k |
| `applyRfPlanningHistory` | `wireless-radio` | destructive write | POST /sites/{siteId}/planningHistory/{id} (applyPlanningHistory) | daniel-k |
| `deleteRfPlanningHistory` | `wireless-radio` | destructive write | DELETE /sites/{siteId}/planningHistory/{id} (deletePlanningHistory) | daniel-k |
| `updateRfPlanningConfig` | `wireless-radio` | write | PUT /sites/{siteId}/rfPlanning/config (modifyRFPlanningDeployConfig) | daniel-k |
| `createRebootSchedule` | `schedules` | destructive write | POST /sites/{siteId}/reboot-schedules (createRebootSchedule) | daniel-k (Zesty0wl used the private web API) |
| `updateRebootSchedule` | `schedules` | destructive write | PUT /sites/{siteId}/reboot-schedules/{id} (modifyRebootSchedule) | daniel-k (Zesty0wl used the private web API) |
| `deleteRebootSchedule` | `schedules` | destructive write | DELETE /sites/{siteId}/reboot-schedules/{id} (deleteRebootSchedule) | daniel-k (Zesty0wl used the private web API) |
| `createPoeSchedule` | `schedules` | destructive write | POST /sites/{siteId}/poe-schedules (createPoeSchedule) | Zesty0wl concept only: its implementation used the private web API, so the tool was re-implemented on the documented Open API route |
| `updatePoeSchedule` | `schedules` | destructive write | PUT /sites/{siteId}/poe-schedules/{poeScheduleId} (modifyPoeSchedule) | Zesty0wl concept only (private web API in source); re-implemented on the Open API route |
| `deletePoeSchedule` | `schedules` | destructive write | DELETE /sites/{siteId}/poe-schedules/{poeScheduleId} (deletePoeSchedule) | Zesty0wl concept only (private web API in source); re-implemented on the Open API route |
| `setIpsSetting` | `firewall-ids` | destructive write | PATCH /sites/{siteId}/network-security/ips (modifyIpsConfig) | realtydev |
| `deleteAlertLogs` | `logs` | destructive write | DELETE [/sites/{siteId}]/logs/alerts/delete with body (deleteAlertLogsForSite / deleteAlertLogsForGlobal) | daniel-k |
| `deleteEventLogs` | `logs` | destructive write | DELETE [/sites/{siteId}]/logs/events/delete with body (deleteEventLogsForSite / deleteEventLogsForGlobal) | daniel-k |
| `resolveAlertLogs` | `logs` | write | POST /sites/{siteId}/logs/alerts/resolve (resolveAlertForSite) | daniel-k |
| `resetLogNotificationSettings` | `logs` | destructive write | POST /sites/{siteId}/site/reset/log-notification, POST /reset/log-notification (resetLogSettingSite / resetLogSettingGlobal) | daniel-k |
| `updateLogNotificationSettings` | `logs` | write | PATCH v2 /sites/{siteId}/site/log-notification, PATCH v2 /log-notification (modifyLogSettingSiteV2 / modifyLogSettingGlobalV2) | daniel-k |
| `updateAuditNotificationSettings` | `logs` | destructive write | PATCH /sites/{siteId}/site/audit-notification, PATCH /audit-notification (modifyAuditLogSettingSite_1 / modifyAuditLogSettingGlobal) | daniel-k |

## Skipped (56)

| Candidate(s) | Reason |
|---|---|
| `genericApiCall` | Hard rule: raw API escape hatch. The base deliberately ships no generic API tool (docs/security-model.md rule 2). |
| `exportLogs` | `POST /logs/export` and `/logs/audit/export` exist, but the spec documents the result only as `object` (likely a file stream). The base has no safe file/stream handling and the source repo (daniel-k) was never verified. Needs live validation first. |
| `getSwitchPorts` | Not in spec: `GET /sites/{siteId}/switches/{mac}/ports` is undocumented. Port data is available from `getSwitchDetail` (`portList`). |
| `updateSwitchPort` | Not in spec: `PATCH /sites/{siteId}/switches/{mac}/ports/{port}` is undocumented. The per-field routes are covered by `setSwitchPorts`. |
| `setSsidEnable` | Not in spec: `/wireless-network/ssids/{id}/enable` is undocumented. |
| `getSiteSettings` | Not in spec: `GET /sites/{siteId}/setting` is undocumented. |
| `updateSiteSettings` | Not in spec: `PATCH /sites/{siteId}/setting` is undocumented. The nearest documented op (`PUT /sites/{siteId}`, updateSiteEntity) replaces the whole site entity and was not substituted. |
| `setSiteTimeZone` | Not in spec: implemented through the undocumented `PATCH /sites/{siteId}/setting`. |
| `updateChannelLimit` | Spec marks site-level `PATCH /sites/{siteId}/channel-limit` deprecated in favor of per-AP channel limits, which `setApChannelLimit` already covers. |
| `setLogNotifications` | Duplicates the newly ported `updateLogNotificationSettings`, which uses the same v2 route (modifyLogSettingSiteV2). |
| `batchSetSwitchPortName` / `batchSetSwitchPortPoe` / `batchSetSwitchPortProfile` / `batchSetSwitchPortStatus` | Duplicates: the spec routes (`PUT .../multi-ports/{name,poe-mode,profile-override,status}`) are already used by `setSwitchPorts`, which adds existence, LAG guard and readback checks. |
| `setSwitchPortName` / `setSwitchPortPoe` / `setSwitchPortProfile` / `setSwitchPortProfileOverride` / `setSwitchPortStatus` | Duplicates: the single-port spec routes are already used by `setSwitchPorts`. |
| `createFirewallAcl` | Duplicate of `createGatewayAcl` (`POST /acls/osg-acls`). realtydev/Zesty0wl/daniel-k also used `/setting/firewall/acls`, which is not in spec. |
| `updateFirewallAcl` | Not in spec (`PUT /setting/firewall/acls/{id}`). The documented gateway ACL update is already covered by `updateGatewayAcl`. |
| `deleteFirewallAcl` | Duplicate of `deleteAcl` (`DELETE /acls/{aclId}`). The other source path `/setting/firewall/acls/{id}` is not in spec. |
| `listFirewallAcls` | Duplicate of `listOsgAcls`. The other source path `/setting/firewall/acls` is not in spec. |
| `updateFirewallSetting` | Duplicate of `setFirewallSetting` (`PATCH /sites/{siteId}/firewall`, destructive, dry-run). daniel-k used PUT, which is not in spec. |
| `getSwitch` | Duplicate of `getSwitchDetail` (`GET /switches/{mac}`). |
| `getSwitchNetworks` | Duplicate of `listSwitchNetworks`. |
| `getCableTestResults` | Duplicate of `getCableTestFullResults`. |
| `getFirmwareDetails` | Duplicate of `getFirmwareInfo` (latest-firmware-info). daniel-k's `/devices/{mac}/firmware` is not in spec. |
| `getIpsSetting` | Duplicate of `getIpsConfig`. |
| `getApRadioConfig` | Duplicate of `getRadiosConfig` (with `getSitesApsAvailableChannel` for channels). |
| `getApRadioDetail` | Duplicate of `getApRadios`. |
| `updateApRadioConfig` | Duplicate of `setApRadio` (PATCH radio-config with validation and readback). |
| `updateApRssiThreshold` | Duplicate of `setApConfig` (load-balance / RSSI threshold section). |
| `getBandSteering` / `getBeaconControl` / `getChannelLimit` / `getMesh` / `getRoaming` | Duplicates of `getBandSteeringSetting`, `getBeaconControlSetting`, `getChannelLimitSetting`, `getMeshSetting` and `getRoamingSetting`. |
| `getRfPlanning` / `getRfPlanningConfig` / `getRfPlanningResult` | Duplicates of `getRadioFrequencyPlanningConfig` and `getRadioFrequencyPlanningResult`. |
| `getAlertLogs` / `listAlerts` / `listLogs` | Duplicates of `listSiteAlerts` and `listGlobalAlerts`. realtydev's listLogs used audit-logs, which is covered by `listSiteAuditLogs`. |
| `getEventLogs` / `listEvents` | Duplicates of `listSiteEvents` and `listGlobalEvents`. Zesty0wl's `/sites/{id}/events` is not in spec. |
| `getAuditLogs` | Duplicate of `listSiteAuditLogs` and `getAuditLogsForGlobal`. |
| `getAuditNotificationSettings` | Duplicate of `getAuditLogSettingForSite` and `getAuditLogSettingForGlobal`. |
| `getLogNotificationSettings` | Duplicate of `getLogSettingForSite(V2)` and `getLogSettingForGlobal(V2)`. |
| `getClientHistory` | Duplicate of `listClientsPastConnections` (insight/past-connection). |
| `listPortForwardings` | Duplicate of `getPortForwardingList` / `listPortForwardingRules`. |
| `listRoutes` | Duplicate of `listStaticRoutes` / `getGridStaticRouting`. The realtydev and daniel-k paths are not in spec. |
| `listPoeSchedules` | Duplicate of `getPoeScheduleList`. Zesty0wl's implementation used the private web API. |
| `listTimeRanges` | Duplicate of `listTimeRangeProfiles`. Zesty0wl's `/setting/profiles/timeranges` is not in spec. |
| `listIpGroups` | Duplicate of `listGroupProfiles`. The source path `/setting/profiles/groups` is not in spec. |
| `updateSsidBasicConfig` | Duplicate of `updateSsid` (update-basic-config with preserved security fields and readback). |

## Token refresh (-44112)

`src/omadaClient/request.ts` already refreshes and replays once on HTTP 401 and on Omada codes -44112/-44113/-44114, whether they arrive in an HTTP-200 body or an error response.
This differs from the sibling repo bug, which ignored -44112. Regression tests in `tests/omadaClient/request.test.ts` now cover replay of mutating verbs
(POST/PUT/PATCH/DELETE) after a -44112 body, the 401 + -44112 case, use of the fresh token on replay, and a bounded single retry.
Requests issued with `retry=false` (used by `setSwitchPorts`) deliberately do not replay. This is existing, tested base behavior and was left unchanged.
