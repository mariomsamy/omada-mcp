import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerGroupSiteAlertsTool } from '../../src/tools/groupSiteAlerts.js';
import { redactSecrets } from '../../src/utils/redact.js';
import { catalogAnnotations, toolHarness } from '../helpers/toolHarness.js';

const GW = 'AA-00-00-00-00-01';
const NOW = 1_800_000_000_000;

function alertPage() {
    return {
        totalRows: 4,
        currentPage: 1,
        currentSize: 500,
        data: [
            { id: '1', key: 'OSG_WAN_DOWN', module: 'Device', content: `[WAN1] of [gateway:${GW}] is down.`, time: NOW - 1000, level: 'Warning' },
            {
                id: '2',
                key: 'OSG_ROGUE_DHCP_SERVER_DETECTED',
                module: 'Device',
                content: `[gateway:${GW}] A suspicious Rogue DHCP server (ip:192.168.1.1, mac:FFFFFFF4:28:53:FFFFFFDE:FFFFFFE4:FFFFFFC3) is detected in Network Local Network.`,
                time: NOW - 2000,
                level: 'Warning',
            },
            {
                id: '3',
                key: 'OSG_ROGUE_DHCP_SERVER_DETECTED',
                module: 'Device',
                content: `[gateway:${GW}] A suspicious Rogue DHCP server (ip:192.168.1.1, mac:FFFFFFF4:28:53:FFFFFFDE:FFFFFFE4:FFFFFFC3) is detected in Network Local Network.`,
                time: NOW - 5000,
                level: 'Warning',
            },
            {
                id: '4',
                key: 'OSG_IP_CONFLICT_DETECTED',
                module: 'Device',
                content: `[gateway:${GW}] client[dc-f5-1b-00-00-01] client[32-16-9d-00-00-02]  used conflicted ip: 192.168.30.8.`,
                time: NOW - 3000,
                level: 'Warning',
            },
        ],
    };
}

function setup() {
    const client = {
        resolveSiteId: vi.fn(async () => 'site-1'),
        listSiteAlerts: vi.fn(async () => alertPage()),
        listClients: vi.fn(async () => [
            {
                mac: 'DC-F5-1B-00-00-01',
                name: 'LG TV',
                hostName: 'LGwebOSTV',
                vendor: 'LG',
                ip: '192.168.0.36',
                wireless: true,
                ssid: 'smart',
                apName: 'Lounge',
                apMac: 'AA-00-00-00-00-0A',
            },
            { mac: '32-16-9D-00-00-02', name: '32-16-9D-00-00-02', vendor: 'Apple', ip: '192.168.30.4', ssid: 'Home', apName: 'Master' },
        ]),
        listDevices: vi.fn(async () => [{ mac: GW, name: 'Gateway', type: 'gateway', ip: '192.168.0.1', status: 1 }]),
    };
    return { client, tool: toolHarness(registerGroupSiteAlertsTool, client) };
}

describe('groupSiteAlerts', () => {
    beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => vi.restoreAllMocks());

    it('is registered as a read-only tool', async () => {
        expect(await catalogAnnotations('groupSiteAlerts')).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    });

    it('groups the last 24 h by key and enriches subjects by exact MAC', async () => {
        const { client, tool } = setup();
        const result = await tool.invoke();
        expect(client.listSiteAlerts).toHaveBeenCalledExactlyOnceWith(
            { page: 1, pageSize: 500, startTime: NOW - 86_400_000, endTime: NOW },
            'site-1',
            undefined
        );
        expect(result).toMatchObject({ siteId: 'site-1', totalRows: 4, alertsRead: 4, truncated: false, groupCount: 3, unavailable: [] });
        const groups = result.groups as Array<Record<string, unknown>>;
        expect(groups.map((group) => [group.alertType, group.count])).toEqual([
            ['OSG_ROGUE_DHCP_SERVER_DETECTED', 2],
            ['OSG_IP_CONFLICT_DETECTED', 1],
            ['OSG_WAN_DOWN', 1],
        ]);
        expect(groups[0]).toMatchObject({
            firstSeen: new Date(NOW - 5000).toISOString(),
            lastSeen: new Date(NOW - 2000).toISOString(),
            reporters: [GW],
            subjects: [{ role: 'rogue-dhcp-server', ip: '192.168.1.1', mac: 'F4-28-53-DE-E4-C3', occurrences: 2, known: false }],
        });
        expect(groups[1]).toMatchObject({
            subjects: [
                {
                    mac: 'DC-F5-1B-00-00-01',
                    ip: '192.168.30.8',
                    known: true,
                    identity: { name: 'LG TV', vendor: 'LG', ssid: 'smart', connectedTo: { type: 'ap', name: 'Lounge' } },
                },
                { mac: '32-16-9D-00-00-02', known: true, identity: { vendor: 'Apple', ssid: 'Home' } },
            ],
        });
        const conflictSubjects = (groups[1]?.subjects ?? []) as Array<{ identity?: Record<string, unknown> }>;
        expect(conflictSubjects[1]?.identity ?? {}).not.toHaveProperty('name');
        expect(groups[2]).toMatchObject({ subjects: [{ role: 'wan-port', port: 'WAN1', known: false }] });
        // Catalog output redaction masks generic `key` fields; the alert type must stay readable.
        expect(JSON.stringify(redactSecrets(result))).toContain('OSG_ROGUE_DHCP_SERVER_DETECTED');
    });

    it('filters alert types, honours the window and skips enrichment when asked', async () => {
        const { client, tool } = setup();
        const result = await tool.invoke({ windowHours: 2, alertTypes: ['osg_wan_down'], enrich: false, siteId: 'other' });
        expect(client.resolveSiteId).toHaveBeenCalledWith('other');
        expect(client.listSiteAlerts.mock.calls[0]?.[0]).toMatchObject({ startTime: NOW - 7_200_000 });
        expect(client.listClients).not.toHaveBeenCalled();
        expect((result.groups as unknown[]).length).toBe(1);
        expect(tool.schema().safeParse({ windowHours: 0 }).success).toBe(false);
        expect(tool.schema().safeParse({ windowHours: 721 }).success).toBe(false);
    });

    it('reports a failed enrichment source as unavailable without failing', async () => {
        const { client, tool } = setup();
        client.listClients.mockRejectedValue(new Error('timeout'));
        const result = await tool.invoke();
        expect(result.unavailable).toEqual([{ section: 'clients', error: 'timeout' }]);
        const groups = result.groups as Array<{ subjects: Array<Record<string, unknown>> }>;
        expect(groups[1]?.subjects[0]).toMatchObject({ known: false });

        client.listDevices.mockRejectedValue(new Error('down'));
        const neither = await tool.invoke();
        expect(neither.unavailable).toHaveLength(2);
        expect((neither.groups as Array<{ subjects: Array<Record<string, unknown>> }>)[0]?.subjects[0]?.known).toBeUndefined();
    });

    it('flags truncation when the page cap is hit', async () => {
        const { client, tool } = setup();
        const full = Array.from({ length: 500 }, (_, i) => ({ key: 'OSG_WAN_DOWN', content: '[WAN2] is down.', time: NOW - i }));
        client.listSiteAlerts.mockResolvedValue({ totalRows: 5000, currentPage: 1, currentSize: 500, data: full });
        const result = await tool.invoke();
        expect(client.listSiteAlerts).toHaveBeenCalledTimes(4);
        expect(result).toMatchObject({ truncated: true, alertsRead: 2000, totalRows: 5000 });
    });

    it('fails when the alert read itself fails', async () => {
        const { client, tool } = setup();
        client.listSiteAlerts.mockRejectedValue(new Error('530'));
        await expect(tool.invoke()).rejects.toThrow('530');
    });
});
