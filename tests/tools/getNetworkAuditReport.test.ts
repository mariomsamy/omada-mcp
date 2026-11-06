import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerGetNetworkAuditReportTool } from '../../src/tools/getNetworkAuditReport.js';
import { redactSecrets } from '../../src/utils/redact.js';
import { catalogAnnotations, toolHarness } from '../helpers/toolHarness.js';

const NOW = 1_800_000_000_000;
const GW = 'AA-00-00-00-00-01';
const SW = 'AA-00-00-00-00-02';
const AP1 = 'AA-00-00-00-00-11';
const AP2 = 'AA-00-00-00-00-12';
const AP3 = 'AA-00-00-00-00-13';

const devices = () => [
    { mac: GW, name: `Load balancer - ${GW}`, type: 'gateway', model: 'ER605 v2.20', ip: '192.168.0.1', status: 1 },
    { mac: SW, name: 'Core switch', type: 'switch', model: 'SG2210P v5.20', ip: '192.168.0.4', status: 1 },
    { mac: AP1, name: `${AP1} - Master`, type: 'ap', model: 'EAP610(EU) v3.0', ip: '192.168.0.9', status: 1 },
    { mac: AP2, name: AP2, type: 'ap', model: 'EAP610(EU) v3.0', ip: '192.168.0.11', status: 1 },
    { mac: AP3, name: 'Garage', type: 'ap', model: 'EAP610(EU) v3.0', ip: '192.168.0.12', status: 0 },
];

const wanStatus = () => [
    {
        port: 1,
        name: 'WAN1',
        status: 1,
        internetState: 1,
        ip: '203.0.113.10',
        latency: 0,
        loss: 0,
        rxErrorPkts: 0,
        txErrorPkts: 0,
        proto: 'pppoe',
    },
];

const clients = () => [
    { mac: 'DC-F5-1B-00-00-01', name: 'LG TV', vendor: 'LG', ip: '192.168.0.36', wireless: true, ssid: 'smart', radioId: 0, apName: AP2, apMac: AP2 },
    {
        mac: '32-16-9D-00-00-02',
        name: '32-16-9D-00-00-02',
        vendor: 'Apple',
        ip: '192.168.30.4',
        wireless: true,
        ssid: 'Home',
        radioId: 0,
        apMac: AP1,
    },
    { mac: 'F2-C4-83-00-00-03', name: 'Phone', ip: '192.168.30.6', wireless: true, ssid: 'Home', radioId: 1, apMac: AP2 },
    { mac: 'BC-24-11-00-00-04', name: 'server', ip: '192.168.0.30', wireless: false, gatewayMac: GW, gatewayName: 'Gateway' },
    { mac: 'F4-28-53-DE-E4-C3', name: 'F4-28-53-DE-E4-C3', vendor: 'Unknown', wireless: false, switchMac: SW, switchName: 'Core switch', port: 8 },
];

const rogueText = `[gateway:${GW}] A suspicious Rogue DHCP server (ip:192.168.1.1, mac:FFFFFFF4:28:53:FFFFFFDE:FFFFFFE4:FFFFFFC3) is detected in Network Local Network.`;
const alerts = () => ({
    totalRows: 6,
    data: [
        { key: 'OSG_WAN_DOWN', module: 'Device', content: `[WAN1] of [gateway:${GW}] is down.`, time: NOW - 1000, level: 'Warning' },
        { key: 'OSG_ROGUE_DHCP_SERVER_DETECTED', module: 'Device', content: rogueText, time: NOW - 2000, level: 'Warning' },
        { key: 'OSG_ROGUE_DHCP_SERVER_DETECTED', module: 'Device', content: rogueText, time: NOW - 4000, level: 'Warning' },
        {
            key: 'OSG_IP_CONFLICT_DETECTED',
            module: 'Device',
            content: `[gateway:${GW}] client[dc-f5-1b-00-00-01] client[32-16-9d-00-00-02]  used conflicted ip: 192.168.30.8.`,
            time: NOW - 3000,
            level: 'Warning',
        },
        { key: 'AP_CHANNEL_CHANGED', module: 'Device', content: 'channel changed', time: NOW - 5000, level: 'Info' },
    ],
});

const retries = () => ({
    retryEaps: [
        { apMac: AP1, name: `${AP1} - Master`, avg: 6.17, retries: [] },
        { apMac: AP2, name: AP2, avg: 12.5, retries: [] },
        { apMac: 'bad', avg: 50 },
    ],
    droppedEaps: [
        { apMac: AP1, name: `${AP1} - Master`, avg: 0.27 },
        { apMac: AP2, name: AP2, avg: 1.5 },
    ],
});

const channels = () => ({
    channels2g: [
        { channel: 1 },
        { channel: 6, apNum: 1, apWithClientInfoList: [{ name: AP2, mac: AP2, clientNum: 8, channelUtilization: 75 }] },
        { channel: 11, apNum: 1, apWithClientInfoList: [{ name: `${AP1} - Master`, mac: AP1, clientNum: 8, channelUtilization: 21 }, { mac: 'x' }] },
    ],
    channels5g: [
        { channel: 44, apWithClientInfoList: [{ name: AP2, mac: AP2, clientNum: 3, channelUtilization: 2 }] },
        { channel: 52, apWithClientInfoList: [{ name: `${AP1} - Master`, mac: AP1, clientNum: 0, channelUtilization: 0 }] },
    ],
    channels6g: [],
});

function setup() {
    const client = {
        resolveSiteId: vi.fn(async () => 'site-1'),
        listDevices: vi.fn(async (): Promise<unknown> => devices()),
        listClients: vi.fn(async (): Promise<unknown> => clients()),
        listSiteAlerts: vi.fn(async (): Promise<unknown> => alerts()),
        getGatewayWanStatus: vi.fn(async (): Promise<unknown> => wanStatus()),
        getRogueAps: vi.fn(async (): Promise<unknown> => []),
        getIpsConfig: vi.fn(async (): Promise<unknown> => ({ enable: false })),
        listPendingDevices: vi.fn(async (): Promise<unknown> => []),
        getRetryAndDroppedRate: vi.fn(async (): Promise<unknown> => retries()),
        getChannels: vi.fn(async (): Promise<unknown> => channels()),
    };
    return { client, tool: toolHarness(registerGetNetworkAuditReportTool, client) };
}

interface Finding {
    severity: string;
    area: string;
    title: string;
    evidence: Record<string, unknown>;
    recommendation: string;
}

describe('getNetworkAuditReport', () => {
    beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => vi.restoreAllMocks());

    it('is registered as a read-only tool', async () => {
        expect(await catalogAnnotations('getNetworkAuditReport')).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    });

    it('produces prioritised findings and compact sections from every source', async () => {
        const { client, tool } = setup();
        const result = await tool.invoke();
        const findings = result.findings as Finding[];
        const titles = findings.map((entry) => `${entry.severity}:${entry.title}`);

        expect(client.getGatewayWanStatus).toHaveBeenCalledExactlyOnceWith(GW, 'site-1', undefined);
        expect(client.getRetryAndDroppedRate).toHaveBeenCalledWith('site-1', 1_800_000_000 - 3600, 1_800_000_000, undefined);
        expect(client.listSiteAlerts.mock.calls[0]).toEqual([
            { page: 1, pageSize: 500, startTime: NOW - 86_400_000, endTime: NOW },
            'site-1',
            undefined,
        ]);
        expect(result).toMatchObject({ siteId: 'site-1', unavailable: [], findingsOmitted: 0 });

        expect(titles).toEqual(
            expect.arrayContaining([
                'high:Device not connected: Garage',
                'high:Rogue DHCP server detected',
                'high:WAN down events in the alert window',
                `high:High Wi-Fi retry rate on ${AP2}`,
                'medium:IP address conflicts',
                'medium:IPS is disabled',
                `medium:High Wi-Fi retry rate on ${AP1} - Master`,
                `medium:Wi-Fi packet drops on ${AP2}`,
                `medium:Busy 2.4 GHz channel on ${AP2}`,
                `low:All clients on 2.4 GHz while 5 GHz is idle on ${AP1} - Master`,
                'low:Devices without a name',
                'low:Other alert types in the window',
                'info:Devices with default "<type> - <MAC>" names',
            ])
        );
        const order = ['critical', 'high', 'medium', 'low', 'info'];
        const ranks = findings.map((entry) => order.indexOf(entry.severity));
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

        const rogue = findings.find((entry) => entry.title === 'Rogue DHCP server detected');
        expect(rogue?.evidence).toMatchObject({
            count: 2,
            servers: [
                { ip: '192.168.1.1', mac: 'F4-28-53-DE-E4-C3', seen: 2, identity: { source: 'client', connectedTo: 'switch Core switch port 8' } },
            ],
        });
        const conflict = findings.find((entry) => entry.title === 'IP address conflicts');
        expect(conflict?.evidence.conflicts).toEqual([
            {
                ip: '192.168.30.8',
                mac: 'DC-F5-1B-00-00-01',
                seen: 1,
                identity: { source: 'client', name: 'LG TV', vendor: 'LG', ssid: 'smart', connectedTo: `ap ${AP2}` },
            },
            {
                ip: '192.168.30.8',
                mac: '32-16-9D-00-00-02',
                seen: 1,
                identity: { source: 'client', vendor: 'Apple', ssid: 'Home', connectedTo: `ap ${AP1}` },
            },
        ]);
        const wanDown = findings.find((entry) => entry.title === 'WAN down events in the alert window');
        expect(wanDown?.evidence).toMatchObject({ ports: ['WAN1'], currentlyDown: [] });
        expect(findings.find((entry) => entry.title === 'Devices without a name')?.evidence).toEqual({ devices: [AP2] });

        expect(result.sections).toMatchObject({
            devices: { total: 5, byType: { gateway: 1, switch: 1, ap: 3 }, notConnected: ['Garage'] },
            wan: [{ gateway: `Load balancer - ${GW}`, port: 'WAN1', status: 1, internetState: 1, loss: 0 }],
            clients: { total: 5, wireless: 3, wired: 2, byBand: { '2.4GHz': 2, '5GHz': 1 }, bySsid: { smart: 1, Home: 2 } },
            alerts: { windowHours: 24, totalRows: 6, read: 5, truncated: false },
            security: { ipsEnabled: false, rogueApCount: 0 },
            pendingDevices: 0,
        });
        const wifi = (result.sections as { wifi: { aps: Array<Record<string, unknown>> } }).wifi;
        expect(wifi.aps).toEqual(
            expect.arrayContaining([
                {
                    name: `${AP1} - Master`,
                    retryAvgPercent: 6.17,
                    dropAvgPercent: 0.27,
                    clients2g: 8,
                    clients5g: 0,
                    util2gPercent: 21,
                    util5gPercent: 0,
                },
            ])
        );
        expect(typeof result.score).toBe('number');
        expect(JSON.stringify(result).length).toBeLessThan(15_000);
        const redacted = JSON.stringify(redactSecrets(result));
        for (const type of ['OSG_ROGUE_DHCP_SERVER_DETECTED', 'OSG_IP_CONFLICT_DETECTED', 'OSG_WAN_DOWN', 'AP_CHANNEL_CHANGED'])
            expect(redacted).toContain(type);
    });

    it('degrades each failing section into unavailable and omits the score when evidence is thin', async () => {
        const { client, tool } = setup();
        client.listDevices.mockRejectedValue(new Error('530'));
        client.listClients.mockRejectedValue(new Error('timeout'));
        client.getIpsConfig.mockRejectedValue(new Error('unsupported'));
        client.getRetryAndDroppedRate.mockRejectedValue(new Error('x'));
        const result = await tool.invoke({ alertWindowHours: 2, wifiWindowMinutes: 10 });
        expect((result.unavailable as Array<{ section: string }>).map((entry) => entry.section)).toEqual([
            'devices',
            'clients',
            'wan',
            'ips',
            'retries',
        ]);
        expect(result.score).toBeUndefined();
        expect(client.getGatewayWanStatus).not.toHaveBeenCalled();
        const findings = result.findings as Finding[];
        expect(findings.find((entry) => entry.title === 'WAN down events in the alert window')?.evidence.currentlyDown).toBe('unknown');
        expect(findings.find((entry) => entry.title === 'Rogue DHCP server detected')?.evidence.servers).toEqual([
            { ip: '192.168.1.1', mac: 'F4-28-53-DE-E4-C3', seen: 2, identity: 'unknown (not in current client/device list)' },
        ]);
        expect(result.sections).not.toHaveProperty('devices');
        expect((result.sections as { wifi: { aps: Array<Record<string, unknown>> } }).wifi.aps[0]).not.toHaveProperty('retryAvgPercent');
        expect(tool.schema().safeParse({ wifiWindowMinutes: 1 }).success).toBe(false);
    });

    it('reports a down WAN, WAN quality, rogue APs, pending devices and a missing gateway', async () => {
        const { client, tool } = setup();
        client.getGatewayWanStatus.mockResolvedValue([
            { port: 1, name: 'WAN1', status: 0, internetState: 0, loss: 10, latency: 300, rxErrorPkts: 4, txErrorPkts: 0 },
            { port: 2, status: 1, internetState: 1, txErrorPkts: 2 },
            { port: 3, name: 'WAN3' },
            { port: 4, name: 'WAN4', status: 1, internetState: 0 },
        ]);
        client.getRogueAps.mockResolvedValue([
            { ssid: 'Free', bssid: 'AA-00-00-00-00-77', channel: 6 },
            { ssid: 'X', mac: 'AA-00-00-00-00-78' },
        ]);
        client.listPendingDevices.mockResolvedValue([{ mac: 'AA-00-00-00-00-55', model: 'EAP225', ip: '192.168.0.200' }]);
        client.getIpsConfig.mockResolvedValue({ enable: true });
        client.listSiteAlerts.mockResolvedValue({ totalRows: 0, data: [] });
        const result = await tool.invoke();
        const titles = (result.findings as Finding[]).map((entry) => `${entry.severity}:${entry.title}`);
        expect(titles[0]).toBe('critical:WAN not online: Load balancer - AA-00-00-00-00-01 WAN1');
        expect(titles).toEqual(
            expect.arrayContaining([
                'medium:WAN packet loss on WAN1',
                'low:High WAN latency on WAN1',
                'low:WAN interface errors on WAN1',
                'low:WAN interface errors on port 2',
                'medium:Rogue access points detected',
                'low:Devices waiting for adoption',
            ])
        );
        expect(titles).not.toContain('medium:IPS is disabled');
        expect(titles).toContain('critical:WAN not online: Load balancer - AA-00-00-00-00-01 WAN4');
        expect(titles.filter((title) => title.includes('WAN3'))).toEqual([]);
        expect(result.sections).toMatchObject({ security: { ipsEnabled: true, rogueApCount: 2 }, pendingDevices: 1 });

        client.listDevices.mockResolvedValue([{ mac: SW, name: 'Core switch', type: 'switch', status: 1 }]);
        const noGateway = await tool.invoke();
        expect(noGateway.unavailable).toEqual([{ section: 'wan', error: 'No gateway in the device list.' }]);
    });

    it('treats a failing WAN read per gateway, unknown IPS shape and odd payloads as unknown', async () => {
        const { client, tool } = setup();
        client.getGatewayWanStatus.mockRejectedValue(new Error('ETIMEDOUT'));
        client.getIpsConfig.mockResolvedValue({});
        client.getRogueAps.mockResolvedValue(null);
        client.listPendingDevices.mockResolvedValue('nope');
        client.getChannels.mockResolvedValue('nope');
        client.getRetryAndDroppedRate.mockResolvedValue(null);
        client.listClients.mockResolvedValue([
            { mac: 'AA-00-00-00-00-66', wireless: true, radioId: 3 },
            { wireless: true, radioId: 9, ssid: ' ' },
        ]);
        client.listDevices.mockResolvedValue([
            { mac: 'bad', type: 'gateway', status: 1 },
            { mac: GW, type: 'gateway', status: 1 },
            { type: 'switch' },
        ]);
        const result = await tool.invoke();
        expect(result.unavailable).toEqual([{ section: 'wan', error: `${GW}: ETIMEDOUT` }]);
        expect(result.sections).toMatchObject({
            security: { ipsEnabled: 'unknown', rogueApCount: 0 },
            pendingDevices: 0,
            clients: { byBand: { '6GHz': 1, unknown: 1 }, bySsid: { unknown: 2 } },
            wifi: { aps: [] },
        });
        const titles = (result.findings as Finding[]).map((entry) => entry.title);
        expect(titles).toContain('Device not connected: unknown device');
    });

    it('caps the number of findings it returns', async () => {
        const { client, tool } = setup();
        client.listDevices.mockResolvedValue(
            Array.from({ length: 40 }, (_, i) => ({ mac: `AA-00-00-00-01-${String(i).padStart(2, '0')}`, name: `ap${i}`, type: 'ap', status: 0 }))
        );
        const result = await tool.invoke();
        expect((result.findings as unknown[]).length).toBe(25);
        expect(result.findingsOmitted as number).toBeGreaterThan(0);
        expect(result.score).toBe(0);
    });
});
