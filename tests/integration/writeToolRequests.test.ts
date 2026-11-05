/**
 * L4/L7: table-driven, loopback stub-controller test over every registered write tool.
 *
 * For each write tool the real OmadaClient talks to a local stub controller that records every
 * request. The test asserts that the dry-run (default) call sends no mutating request (only reads),
 * and that the apply call sends exactly the documented method and path from docs/openapi. It also
 * asserts that the catalog forces destructiveHint: true / readOnlyHint: false on every write tool.
 */

import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseToolCategories } from '../../src/config.js';
import { OmadaClient } from '../../src/omadaClient/index.js';
import type { ToolExtra } from '../../src/server/common.js';
import { registerAllTools } from '../../src/tools/index.js';
import { configureWebhookPolicy } from '../../src/tools/portedToolShared.js';

const MAC = 'AA-BB-CC-DD-EE-FF';
const SERVER_CONFIG = { protocol: 'sftp', hostname: 'backup.example.com', port: 22 };
const SITE = 'site-1';

/** Valid arguments per write tool (siteId is added automatically unless the tool is controller-wide). */
const ARGS: Record<string, Record<string, unknown>> = {
    adoptDevice: { deviceMac: MAC },
    applyRfPlanningHistory: { historyId: 'history-1', appliedConfig: 1 },
    backupController: { retainUser: true },
    backupControllerToFileServer: { serverConfig: SERVER_CONFIG, filePath: '/backups/ctrl.bak', retainUser: true },
    backupSites: { siteIds: [SITE] },
    backupSitesToFileServer: { serverConfig: SERVER_CONFIG, filePath: '/backups/', siteIds: [SITE] },
    blockClient: { clientMac: MAC },
    cancelRfOptimization: {},
    createDhcpReservation: { mac: 'AA-BB-CC-DD-EE-11', netId: 'res-1', status: true },
    createEapAcl: {
        payload: { description: 'Guests wireless', status: true, policy: 0, protocols: [6], sourceIds: ['res-1'], sourceType: 4, destinationType: 0 },
    },
    createGatewayAcl: {
        payload: {
            description: 'Guests drop WAN',
            status: true,
            policy: 0,
            protocols: [6],
            sourceIds: ['res-1'],
            sourceType: 0,
            destinationType: 0,
            direction: { lanToWan: true },
            stateMode: 0,
            syslog: false,
        },
    },
    createLanNetwork: { payload: { name: 'IoT', purpose: 0, vlan: 30 } },
    createLanProfile: { payload: { name: 'Cameras', poe: 0, nativeNetworkId: 'res-1', dot1x: 1 } },
    createPoeSchedule: { schedule: { name: 'Office hours', status: true, turnOnTime: 'res-1', poePortsMap: { [MAC]: [1, 2] } } },
    createPortForward: {
        payload: { name: 'web', status: true, from: 0, forwardIp: '192.168.0.10', externalPort: '8443', forwardPort: '443', protocol: 1, dMZ: false },
    },
    createRebootSchedule: { schedule: { name: 'Nightly', status: true, deviceMacs: [MAC], time: { timingType: 1, hour: 3, minute: 0 } } },
    createRoute: { payload: { name: 'lab', status: true, destinations: ['10.20.0.0/16'], routeType: 0, nextHopIp: '192.168.0.2', metric: 1 } },
    createSsid: {
        wlanId: 'res-1',
        payload: { name: 'Guest', deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false },
    },
    createSwitchAcl: {
        payload: {
            description: 'Block inter-VLAN',
            status: true,
            policy: 0,
            protocols: [0],
            sourceIds: ['res-1'],
            sourceType: 1,
            destinationType: 1,
            bindingType: 0,
            etherType: { enable: false },
        },
    },
    deleteAcl: { aclId: 'res-1' },
    deleteAlertLogs: { selection: { logs: ['res-1'], selectType: 'include', startTime: 1, endTime: 2 } },
    deleteAppControlRule: { ruleId: 'res-1' },
    deleteBandwidthControlRule: { ruleId: 'res-1' },
    deleteDhcpReservation: { reservationMac: MAC },
    deleteEventLogs: { selection: { logs: ['res-1'], selectType: 'include', startTime: 1, endTime: 2 } },
    deleteLanNetwork: { networkId: 'res-1' },
    deletePoeSchedule: { poeScheduleId: 'res-1' },
    deletePortForward: { portForwardingId: 'res-1' },
    deleteRebootSchedule: { scheduleId: 'res-1' },
    deleteRfPlanningHistory: { historyId: 'res-1' },
    deleteRoute: { staticRoutingId: 'res-1' },
    deleteSsid: { wlanId: 'res-1', ssidId: 'res-1' },
    disableClientRateLimit: { clientMac: MAC },
    rebootDevice: { deviceMac: MAC },
    reconnectClient: { clientMac: MAC },
    resetLogNotificationSettings: {},
    resolveAlertLogs: { selection: { logs: ['res-1'], selectType: 'include', startTime: 1, endTime: 2 } },
    restoreController: { fileName: 'backup.cfg', confirmDangerous: true },
    restoreControllerFromFileServer: { serverConfig: SERVER_CONFIG, filePath: '/backups/ctrl.bak', skipDevice: false, confirmDangerous: true },
    restoreSites: { siteRestoreInfos: [{ fileName: 'site1.bak', siteId: SITE }], confirmDangerous: true },
    restoreSitesFromFileServer: {
        serverConfig: SERVER_CONFIG,
        siteInfos: [{ filePath: '/backups/site1.bak', siteId: SITE }],
        confirmDangerous: true,
    },
    setAccessControl: {
        payload: { preAuthAccessEnable: true, preAuthAccessPolicies: [{ type: 2, url: 'example.com' }], freeAuthClientEnable: false },
    },
    setAclConfigTypeSetting: { mode: 0 },
    setApChannelLimit: { apMac: MAC, channelLimitType: 1 },
    setApConfig: { apMac: MAC, configType: 'service-config', payload: { lldpEnable: 0 } },
    setApPowerSaving: { apMac: MAC, timeEnable: false, bandEnable: false },
    setApRadio: { apMac: MAC, band: '5GHz', channel: 36 },
    setAppControlRule: { payload: { ruleName: 'Block social', schedule: 'always', qos: false, applications: [1001], selectType: 'include' } },
    setBandwidthControlRule: {
        payload: {
            name: 'Guests cap',
            status: true,
            sourceType: 0,
            sourceIds: ['res-1'],
            wanPortIds: ['res-1'],
            upstreamBandwidth: 10000,
            upstreamBandwidthUnit: 2,
            downstreamBandwidth: 20000,
            downstreamBandwidthUnit: 2,
            mode: 1,
        },
    },
    setClientRateLimit: { clientMac: MAC, downLimit: 10240, upLimit: 5120 },
    setClientRateLimitProfile: { clientMac: MAC, profileId: 'res-1' },
    setDeviceLed: { deviceMac: MAC, ledSetting: 1 },
    setFirewallSetting: { payload: { spi: false } },
    setGatewayConfig: { gatewayMac: MAC, configType: 'config-general', payload: { ledSetting: 0, name: 'Gateway' } },
    setGatewayWanConnect: { gatewayMac: MAC, portId: 1, connect: false },
    setIpsSetting: { payload: { enable: true, ipsMode: 1, dpLevel: 1 } },
    setSiteLed: { enable: false },
    setSwitchNetworks: { switchMac: MAC, applyList: [{ id: 'res-1', vlan: 10, status: true }] },
    setSwitchPorts: { switchMac: MAC, ports: [1], change: { operation: 'name', name: 'Camera' } },
    startCableTest: { switchMac: MAC, ports: [1, 2] },
    startFirmwareUpgrade: { deviceMac: MAC },
    startRfOptimization: { optimizationStrategy: 0 },
    unblockClient: { clientMac: MAC },
    updateAuditNotificationSettings: { payload: { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] }, confirmWebhookChange: true },
    updateBandSteering: { payload: { bandSteeringForMultiBand: { mode: 1 } } },
    updateBeaconControl: { payload: { beaconControl: { beaconInterval2g: 100 } } },
    updateClient: { clientMac: MAC, name: 'Office Printer' },
    updateDhcpReservation: { reservationMac: MAC, netId: 'res-1', status: true },
    updateEapAcl: {
        aclId: 'res-1',
        payload: { description: 'Guests wireless', status: true, policy: 0, protocols: [6], sourceIds: ['res-1'], sourceType: 4, destinationType: 0 },
    },
    updateGatewayAcl: {
        aclId: 'res-1',
        payload: {
            description: 'Guests drop WAN',
            status: true,
            policy: 0,
            protocols: [6],
            sourceIds: ['res-1'],
            sourceType: 0,
            destinationType: 0,
            direction: { lanToWan: true },
            stateMode: 0,
            syslog: false,
        },
    },
    updateLanNetwork: { networkId: 'res-1', payload: { name: 'IoT', purpose: 0, vlan: 30 } },
    updateLanProfile: { profileId: 'res-1', payload: { name: 'Cameras', poe: 0, nativeNetworkId: 'res-1', dot1x: 1 } },
    updateLogNotificationSettings: { payload: { alertNotifications: [{ key: 'wan-down', enable: true }] } },
    updateMesh: { payload: { mesh: { meshEnable: true } } },
    updatePoeSchedule: {
        poeScheduleId: 'res-1',
        schedule: { name: 'Office hours', status: true, turnOnTime: 'res-1', poePortsMap: { [MAC]: [1, 2] } },
    },
    updatePortForward: {
        portForwardingId: 'res-1',
        payload: { name: 'web', status: true, from: 0, forwardIp: '192.168.0.10', externalPort: '8443', forwardPort: '443', protocol: 1, dMZ: false },
    },
    updateRebootSchedule: {
        scheduleId: 'res-1',
        schedule: { name: 'Nightly', status: true, deviceMacs: [MAC], time: { timingType: 1, hour: 3, minute: 0 } },
    },
    updateRfPlanningConfig: { payload: { mode: 0 } },
    updateRoaming: { payload: { roaming: { fastRoamingEnable: true } } },
    updateRoute: {
        staticRoutingId: 'res-1',
        payload: { name: 'lab', status: true, destinations: ['10.20.0.0/16'], routeType: 0, nextHopIp: '192.168.0.2', metric: 1 },
    },
    updateSsid: { wlanId: 'res-1', ssidId: 'res-1', changes: { name: 'After' } },
    updateSsidHotspotV2: { wlanId: 'res-1', ssidId: 'res-1', payload: { hotspotV2Enable: false } },
    updateSsidMacFilter: { wlanId: 'res-1', ssidId: 'res-1', payload: { macFilterEnable: true, policy: 1, macFilterId: 'res-1' } },
    updateSsidMultiCastConfig: {
        wlanId: 'res-1',
        ssidId: 'res-1',
        payload: { multiCastEnable: true, channelUtil: 100, arpCastEnable: false, ipv6CastEnable: true, filterEnable: false },
    },
    updateSsidRateControl: { wlanId: 'res-1', ssidId: 'res-1', payload: { rate2gCtrlEnable: false, rate5gCtrlEnable: false } },
    updateSsidRateLimit: { wlanId: 'res-1', ssidId: 'res-1', payload: { ssidRateLimit: { profileId: 'res-1' } } },
    updateSsidWlanSchedule: { wlanId: 'res-1', ssidId: 'res-1', payload: { wlanScheduleEnable: true, action: 0, scheduleId: 'res-1' } },
    updateSwitchAcl: {
        aclId: 'res-1',
        payload: {
            description: 'Block inter-VLAN',
            status: true,
            policy: 0,
            protocols: [0],
            sourceIds: ['res-1'],
            sourceType: 1,
            destinationType: 1,
            bindingType: 0,
            etherType: { enable: false },
        },
    },
    updateWanPortSetting: { payload: { type: 0, wanPortSetting: { portId: 'res-1', wanPortIpv4Setting: { protoType: 1, vlanId: 0 } } } },
};

/** Documented operation (method + docs/openapi path template) each write tool sends on apply. */
const EXPECTED_OPERATION: Record<string, string> = {
    adoptDevice: 'POST /openapi/v1/{omadacId}/sites/{siteId}/devices/{deviceMac}/start-adopt',
    applyRfPlanningHistory: 'POST /openapi/v1/{omadacId}/sites/{siteId}/planningHistory/{id}',
    backupController: 'POST /openapi/v1/{omadacId}/maintenance/backup/self-server',
    backupControllerToFileServer: 'POST /openapi/v1/{omadacId}/maintenance/backup/file-server',
    backupSites: 'POST /openapi/v1/{omadacId}/sites/maintenance/multi-backup/self-server',
    backupSitesToFileServer: 'POST /openapi/v1/{omadacId}/sites/maintenance/multi-backup/file-server',
    blockClient: 'POST /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/block',
    cancelRfOptimization: 'POST /openapi/v1/{omadacId}/sites/{siteId}/cmd/rfPlanning/cancel',
    createDhcpReservation: 'POST /openapi/v1/{omadacId}/sites/{siteId}/setting/service/dhcp',
    createEapAcl: 'POST /openapi/v1/{omadacId}/sites/{siteId}/acls/eap-acls',
    createGatewayAcl: 'POST /openapi/v1/{omadacId}/sites/{siteId}/acls/osg-acls',
    createLanNetwork: 'POST /openapi/v2/{omadacId}/sites/{siteId}/lan-networks',
    createLanProfile: 'POST /openapi/v1/{omadacId}/sites/{siteId}/lan-profiles',
    createPoeSchedule: 'POST /openapi/v1/{omadacId}/sites/{siteId}/poe-schedules',
    createPortForward: 'POST /openapi/v1/{omadacId}/sites/{siteId}/nat/port-forwardings',
    createRebootSchedule: 'POST /openapi/v1/{omadacId}/sites/{siteId}/reboot-schedules',
    createRoute: 'POST /openapi/v1/{omadacId}/sites/{siteId}/routing/static-routings',
    createSsid: 'POST /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids',
    createSwitchAcl: 'POST /openapi/v1/{omadacId}/sites/{siteId}/acls/osw-acls',
    deleteAcl: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/acls/{aclId}',
    deleteAlertLogs: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/logs/alerts/delete',
    deleteAppControlRule: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/applicationControl/rules/{ruleId}',
    deleteBandwidthControlRule: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/bandwidth-control/rules/{ruleId}',
    deleteDhcpReservation: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/setting/service/dhcp/{mac}',
    deleteEventLogs: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/logs/events/delete',
    deleteLanNetwork: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/lan-networks/{networkId}',
    deletePoeSchedule: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/poe-schedules/{poeScheduleId}',
    deletePortForward: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/nat/port-forwardings/{portForwardingId}',
    deleteRebootSchedule: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/reboot-schedules/{id}',
    deleteRfPlanningHistory: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/planningHistory/{id}',
    deleteRoute: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/routing/static-routings/{staticRoutingId}',
    deleteSsid: 'DELETE /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}',
    disableClientRateLimit: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/ratelimit',
    rebootDevice: 'POST /openapi/v1/{omadacId}/sites/{siteId}/devices/{deviceMac}/reboot',
    reconnectClient: 'POST /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/reconnect',
    resetLogNotificationSettings: 'POST /openapi/v1/{omadacId}/sites/{siteId}/site/reset/log-notification',
    resolveAlertLogs: 'POST /openapi/v1/{omadacId}/sites/{siteId}/logs/alerts/resolve',
    restoreController: 'POST /openapi/v1/{omadacId}/maintenance/restore/self-server',
    restoreControllerFromFileServer: 'POST /openapi/v1/{omadacId}/maintenance/restore/file-server',
    restoreSites: 'POST /openapi/v1/{omadacId}/sites/maintenance/multi-restore/self-server',
    restoreSitesFromFileServer: 'POST /openapi/v1/{omadacId}/sites/maintenance/multi-restore/file-server',
    setAccessControl: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/setting/access-control',
    setAclConfigTypeSetting: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/acls/osg-config-mode',
    setApChannelLimit: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/aps/{apMac}/channel-limit',
    setApConfig: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/aps/{apMac}/service-config',
    setApPowerSaving: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/aps/{apMac}/power-saving',
    setApRadio: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/aps/{apMac}/radio-config',
    setAppControlRule: 'POST /openapi/v1/{omadacId}/sites/{siteId}/applicationControl/rules',
    setBandwidthControlRule: 'POST /openapi/v1/{omadacId}/sites/{siteId}/bandwidth-control/rules',
    setClientRateLimit: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/ratelimit',
    setClientRateLimitProfile: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/ratelimit',
    setDeviceLed: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/switches/{switchMac}/general-config',
    setFirewallSetting: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/firewall',
    setGatewayConfig: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/gateways/{gatewayMac}/config/general',
    setGatewayWanConnect: 'POST /openapi/v1/{omadacId}/sites/{siteId}/gateways/{gatewayMac}/internet-state',
    setIpsSetting: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/network-security/ips',
    setSiteLed: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/led',
    setSwitchNetworks: 'POST /openapi/v1/{omadacId}/sites/{siteId}/switches/{switchMac}/networks',
    setSwitchPorts: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/switches/{switchMac}/ports/{port}/name',
    startCableTest: 'POST /openapi/v1/{omadacId}/sites/{siteId}/cable-test/switches/{switchMac}/start',
    startFirmwareUpgrade: 'POST /openapi/v1/{omadacId}/sites/{siteId}/devices/{deviceMac}/start-online-upgrade',
    startRfOptimization: 'POST /openapi/v1/{omadacId}/sites/{siteId}/cmd/rfPlanning/optimization',
    unblockClient: 'POST /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/unblock',
    updateAuditNotificationSettings: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/site/audit-notification',
    updateBandSteering: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/band-steering',
    updateBeaconControl: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/beacon-control',
    updateClient: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/clients/{clientMac}/name',
    updateDhcpReservation: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/setting/service/dhcp/{mac}',
    updateEapAcl: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/acls/eap-acls/{aclId}',
    updateGatewayAcl: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/acls/osg-acls/{aclId}',
    updateLanNetwork: 'PATCH /openapi/v2/{omadacId}/sites/{siteId}/lan-networks/{networkId}',
    updateLanProfile: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/lan-profiles/{profileId}',
    updateLogNotificationSettings: 'PATCH /openapi/v2/{omadacId}/sites/{siteId}/site/log-notification',
    updateMesh: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/mesh',
    updatePoeSchedule: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/poe-schedules/{poeScheduleId}',
    updatePortForward: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/nat/port-forwardings/{portForwardingId}',
    updateRebootSchedule: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/reboot-schedules/{id}',
    updateRfPlanningConfig: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/rfPlanning/config',
    updateRoaming: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/roaming',
    updateRoute: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/routing/static-routings/{staticRoutingId}',
    updateSsid: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-basic-config',
    updateSsidHotspotV2: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-hotspotv2',
    updateSsidMacFilter: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-mac-filter',
    updateSsidMultiCastConfig: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-multicast-config',
    updateSsidRateControl: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-rate-control',
    updateSsidRateLimit: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-rate-limit',
    updateSsidWlanSchedule: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-wlan-schedule',
    updateSwitchAcl: 'PUT /openapi/v1/{omadacId}/sites/{siteId}/acls/osw-acls/{aclId}',
    updateWanPortSetting: 'PATCH /openapi/v1/{omadacId}/sites/{siteId}/wan/networks/port-setting',
};

/** Controller-wide tools that take no siteId. */
const CONTROLLER_WIDE = new Set([
    'backupController',
    'backupControllerToFileServer',
    'backupSites',
    'backupSitesToFileServer',
    'restoreController',
    'restoreControllerFromFileServer',
    'restoreSites',
    'restoreSitesFromFileServer',
]);

/** Generic record returned by every stub read: it carries every identifier the tools look up. */
const RECORD = {
    id: 'res-1',
    wlanId: 'res-1',
    ssidId: 'res-1',
    profileId: 'res-1',
    ruleId: 'res-1',
    aclId: 'res-1',
    historyId: 'res-1',
    webhookId: 'res-1',
    netId: 'res-1',
    mac: MAC,
    name: 'fixture',
    type: 'switch',
    status: 1,
    applicationId: 1001,
    portUuids: ['res-1'],
};

/** Reads whose documented response shape differs from the generic paginated record. */
const SHAPED_READS: [RegExp, unknown][] = [
    [/\/wireless-network\/wlans$/, [RECORD]],
    [/\/aps\/[^/]+\/radio-config$/, { radioSetting5g: { radioEnable: true, channel: '36', channelWidth: '5' } }],
    [
        /\/aps\/[^/]+\/available-channel$/,
        [{ radioId: 1, apChannelDetailList: [{ channel: 36, index: 36, freq: 5180, availableChannelWidthList: [20, 40, 80] }] }],
    ],
    [/\/switches\/[^/]+$/, { mac: MAC, portList: [{ port: 1, name: 'p1', status: 1 }] }],
    [
        /\/ssids\/[^/]+$/,
        {
            ssidId: 'res-1',
            name: 'fixture',
            band: 3,
            guestNetEnable: false,
            security: 0,
            broadcast: true,
            vlanEnable: false,
            mloEnable: false,
            pmfMode: 1,
            enable11r: false,
        },
    ],
];

interface Recorded {
    method: string;
    path: string;
}

const servers: Server[] = [];
const calls: Recorded[] = [];
let client: OmadaClient;

function stubResponse(method: string, url: URL): unknown {
    if (url.pathname === '/openapi/authorize/token') return { errorCode: 0, result: { accessToken: 'stub-token', expiresIn: 3600 } };
    if (method !== 'GET') return { errorCode: 0, result: {} };
    const shaped = SHAPED_READS.find(([pattern]) => pattern.test(url.pathname));
    if (shaped) return { errorCode: 0, result: shaped[1] };
    const page = Number(url.searchParams.get('page') ?? '1');
    return { errorCode: 0, result: { ...RECORD, data: [RECORD], totalRows: 1, currentPage: page, currentSize: 1 } };
}

beforeAll(async () => {
    configureWebhookPolicy({ allowedHosts: undefined, resolve: () => Promise.resolve(['93.184.216.34']) });
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://stub.test');
        calls.push({ method: req.method ?? 'GET', path: url.pathname });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(stubResponse(req.method ?? 'GET', url)));
    });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback address');
    client = new OmadaClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        clientId: 'fixture-id',
        clientSecret: 'fixture-secret',
        omadacId: 'omadac',
        siteId: SITE,
        strictSsl: true,
    });
});

afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

interface Registered {
    name: string;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    handler: (args: Record<string, unknown>, extra: ToolExtra) => Promise<{ content: { text: string }[] }>;
}

function registeredTools(): Registered[] {
    const tools: Registered[] = [];
    const server = {
        registerTool(name: string, config: { annotations?: Registered['annotations'] }, handler: Registered['handler']) {
            tools.push({ name, annotations: config.annotations, handler });
        },
    };
    registerAllTools(
        server as never,
        new Proxy({}, { get: () => () => Promise.resolve(undefined) }) as never,
        parseToolCategories('all:rw,recovery:rw').categories
    );
    return tools;
}

const ALL = registeredTools();
const WRITE_TOOLS = ALL.filter((tool) => tool.annotations?.destructiveHint === true && tool.name !== 'callOperation');

async function run(name: string, dryRun: boolean): Promise<{ requests: Recorded[]; error?: string }> {
    const tools: Registered[] = [];
    const server = {
        registerTool(toolName: string, config: { annotations?: Registered['annotations'] }, handler: Registered['handler']) {
            tools.push({ name: toolName, annotations: config.annotations, handler });
        },
    };
    registerAllTools(server as never, client, parseToolCategories('all:rw,recovery:rw').categories);
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    const before = calls.length;
    let error: string | undefined;
    try {
        const site = CONTROLLER_WIDE.has(name) ? {} : { siteId: SITE };
        await tool.handler({ ...site, ...ARGS[name], ...(dryRun ? {} : { dryRun: false }) }, { sessionId: 'stub' } as ToolExtra);
    } catch (caught) {
        error = caught instanceof z.ZodError ? `zod: ${JSON.stringify(caught.issues)}` : caught instanceof Error ? caught.message : String(caught);
    }
    const requests = calls.slice(before).filter((call) => call.path !== '/openapi/authorize/token');
    return { requests, ...(error === undefined ? {} : { error }) };
}

const SPEC = JSON.parse(readFileSync(new URL('../../docs/openapi/00-all.json', import.meta.url), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
};

function templateRegex(template: string): RegExp {
    const pattern = template
        .split(/\{[^}]+\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+');
    return new RegExp(`^${pattern}$`);
}

describe('write tools against a loopback stub controller (L4/L7)', () => {
    it('has an argument fixture and a documented operation for every registered write tool', () => {
        const names = WRITE_TOOLS.map((tool) => tool.name).sort();
        expect(names.length).toBeGreaterThan(80);
        expect(names).toEqual(Object.keys(ARGS).sort());
        expect(names).toEqual(Object.keys(EXPECTED_OPERATION).sort());
        for (const operation of Object.values(EXPECTED_OPERATION)) {
            const [method, path] = operation.split(' ') as [string, string];
            expect(SPEC.paths[path]?.[method.toLowerCase()], operation).toBeDefined();
        }
    });

    it.each(WRITE_TOOLS.map((tool) => [tool.name, tool] as const))('%s: catalog forces destructiveHint and readOnlyHint=false', (_name, tool) => {
        expect(tool.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    });

    it.each(Object.keys(ARGS))('%s: dry-run sends no mutating request; apply sends the documented method and path', async (name) => {
        const dry = await run(name, true);
        expect(dry.error).toBeUndefined();
        expect(dry.requests.filter((request) => request.method !== 'GET')).toEqual([]);

        const apply = await run(name, false);
        expect(apply.error).toBeUndefined();
        const mutations = apply.requests.filter((request) => request.method !== 'GET');
        const [method, template] = (EXPECTED_OPERATION[name] ?? '').split(' ') as [string, string];
        expect(mutations).toHaveLength(1);
        expect(mutations[0]?.method).toBe(method);
        expect(mutations[0]?.path).toMatch(templateRegex(template));
    });
});
