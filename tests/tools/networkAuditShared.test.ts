import { describe, expect, it, vi } from 'vitest';

import {
    buildInventoryIndex,
    clientIdentity,
    deviceIdentity,
    enrichGroups,
    enrichSubject,
    fetchAlertsInWindow,
    groupAlerts,
    isRecord,
    normaliseMac,
    parseAlertSubjects,
    readSection,
    toAlertRecord,
} from '../../src/tools/networkAuditShared.js';

const GW = 'AA-00-00-00-00-01';
const rogue = (time: number) => ({
    id: `r${time}`,
    key: 'OSG_ROGUE_DHCP_SERVER_DETECTED',
    module: 'Device',
    content: `[gateway:${GW}] A suspicious Rogue DHCP server (ip:192.168.1.1, mac:FFFFFFF4:28:53:FFFFFFDE:FFFFFFE4:FFFFFFC3) is detected in Network Local Network.`,
    time,
    level: 'Warning',
});
const conflict = (time: number) => ({
    key: 'OSG_IP_CONFLICT_DETECTED',
    module: 'Device',
    content: `[gateway:${GW}] client[dc-f5-1b-00-00-01] client[32-16-9d-00-00-02]  used conflicted ip: 192.168.30.8.`,
    time,
    level: 'Warning',
});
const wanDown = (time: number) => ({
    key: 'OSG_WAN_DOWN',
    module: 'Device',
    content: `[WAN1] of [gateway:${GW}] is down.`,
    time,
    level: 'Warning',
});

describe('tools/networkAuditShared', () => {
    it('normalises MACs including sign-extended octets and rejects junk', () => {
        expect(normaliseMac('FFFFFFF4:28:53:FFFFFFDE:FFFFFFE4:FFFFFFC3')).toBe('F4-28-53-DE-E4-C3');
        expect(normaliseMac('dc-f5-1b-41-16-24')).toBe('DC-F5-1B-41-16-24');
        expect(normaliseMac('a:b:c:d:e:f')).toBe('0A-0B-0C-0D-0E-0F');
        expect(normaliseMac('AA-BB-CC-DD-EE')).toBeUndefined();
        expect(normaliseMac('ZZ-BB-CC-DD-EE-FF')).toBeUndefined();
        expect(normaliseMac(42)).toBeUndefined();
    });

    it('parses rogue DHCP, IP conflict, WAN and generic subjects without the reporting gateway', () => {
        expect(parseAlertSubjects(rogue(1).key, rogue(1).content)).toEqual([
            { role: 'rogue-dhcp-server', ip: '192.168.1.1', mac: 'F4-28-53-DE-E4-C3' },
        ]);
        expect(parseAlertSubjects(conflict(1).key, conflict(1).content)).toEqual([
            { role: 'conflicting-client', mac: 'DC-F5-1B-00-00-01', ip: '192.168.30.8' },
            { role: 'conflicting-client', mac: '32-16-9D-00-00-02', ip: '192.168.30.8' },
        ]);
        expect(parseAlertSubjects('OSG_IP_CONFLICT_DETECTED', 'used conflicted ip: 10.0.0.9')).toEqual([
            { role: 'conflicting-client', ip: '10.0.0.9' },
        ]);
        expect(parseAlertSubjects('OSG_IP_CONFLICT_DETECTED', 'no detail')).toEqual([]);
        expect(parseAlertSubjects(wanDown(1).key, wanDown(1).content)).toEqual([{ role: 'wan-port', port: 'WAN1' }]);
        expect(parseAlertSubjects('OSG_ROGUE_DHCP_SERVER_DETECTED', 'nothing parseable')).toEqual([]);
        expect(parseAlertSubjects('OSG_ROGUE_DHCP_SERVER_DETECTED', 'server (ip:10.1.1.1)')).toEqual([{ role: 'rogue-dhcp-server', ip: '10.1.1.1' }]);
        expect(parseAlertSubjects('AP_SOMETHING', `[ap:${GW}] client 11:22:33:44:55:66 at 10.0.0.5 failed`)).toEqual([
            { role: 'mentioned', mac: '11-22-33-44-55-66' },
            { role: 'mentioned', ip: '10.0.0.5' },
        ]);
        expect(parseAlertSubjects('OSG_WAN_FLAPPING', 'WAN flapped')).toEqual([]);
    });

    it('accepts only alert records with key and content', () => {
        expect(toAlertRecord(null)).toBeUndefined();
        expect(toAlertRecord({ key: 'K' })).toBeUndefined();
        expect(toAlertRecord({ key: 'K', content: 'c', time: 'x' })).toEqual({
            key: 'K',
            content: 'c',
            module: undefined,
            time: undefined,
            level: undefined,
        });
        expect(isRecord([])).toBe(false);
    });

    it('groups by key with counts, first/last seen, reporters and de-duplicated subjects', () => {
        const groups = groupAlerts(
            [rogue(3000), rogue(1000), rogue(2000), conflict(1500), wanDown(1700), { key: 'NO_TIME', content: 'x' }].map(
                (alert) => toAlertRecord(alert) ?? { key: 'bad', content: '' }
            )
        );
        expect(groups.map((group) => [group.alertType, group.count])).toEqual([
            ['OSG_ROGUE_DHCP_SERVER_DETECTED', 3],
            ['NO_TIME', 1],
            ['OSG_IP_CONFLICT_DETECTED', 1],
            ['OSG_WAN_DOWN', 1],
        ]);
        expect(groups[0]).toMatchObject({
            firstSeen: new Date(1000).toISOString(),
            lastSeen: new Date(3000).toISOString(),
            severity: 'Warning',
            reporters: [GW],
            subjects: [{ role: 'rogue-dhcp-server', ip: '192.168.1.1', mac: 'F4-28-53-DE-E4-C3', occurrences: 3 }],
            subjectsOmitted: 0,
        });
        expect(groups[1]).toMatchObject({ firstSeen: undefined, lastSeen: undefined, subjects: [] });
    });

    it('caps subjects per group', () => {
        const alerts = [1, 2, 3].map((n) => ({ key: 'X', content: `seen 10.0.0.${n}` }));
        expect(groupAlerts(alerts, 2)[0]).toMatchObject({ subjectsOmitted: 1 });
    });

    it('reads every page until the advertised total and flags truncation at the cap', async () => {
        const listSiteAlerts = vi.fn(async ({ page }: { page: number }) => ({
            totalRows: 5,
            data: page === 1 ? [rogue(1), rogue(2)] : page === 2 ? [rogue(3), conflict(4)] : [wanDown(5)],
        }));
        const all = await fetchAlertsInWindow({ listSiteAlerts }, 's', 10, 20, undefined, { pageSize: 2, maxPages: 5 });
        expect(all).toMatchObject({ totalRows: 5, pagesRead: 3, truncated: false });
        expect(all.alerts).toHaveLength(5);
        expect(listSiteAlerts).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 2, startTime: 10, endTime: 20 }, 's', undefined);

        listSiteAlerts.mockClear();
        const capped = await fetchAlertsInWindow({ listSiteAlerts }, 's', 10, 20, { 'X-Request-Id': 'a' }, { pageSize: 2, maxPages: 2 });
        expect(capped).toMatchObject({ pagesRead: 2, truncated: true });
        expect(listSiteAlerts).toHaveBeenCalledTimes(2);

        const exact = vi.fn(async () => ({ totalRows: 2, data: [rogue(1), rogue(2)] }));
        expect(await fetchAlertsInWindow({ listSiteAlerts: exact }, 's', 1, 2, undefined, { pageSize: 2 })).toMatchObject({
            truncated: false,
            pagesRead: 1,
        });

        const noTotal = vi.fn(async () => ({ data: [rogue(1), rogue(2)] }));
        expect(await fetchAlertsInWindow({ listSiteAlerts: noTotal }, 's', 1, 2, undefined, { pageSize: 2, maxPages: 1 })).toMatchObject({
            truncated: true,
            totalRows: undefined,
        });

        const defaults = vi.fn(async () => ({ totalRows: 0, data: [] }));
        expect(await fetchAlertsInWindow({ listSiteAlerts: defaults }, 's', 1, 2)).toMatchObject({ truncated: false, alerts: [] });
        expect(defaults).toHaveBeenCalledWith({ page: 1, pageSize: 500, startTime: 1, endTime: 2 }, 's', undefined);
    });

    it('rejects an alert page without a data array', async () => {
        await expect(fetchAlertsInWindow({ listSiteAlerts: vi.fn(async () => ({ totalRows: 1 })) }, 's', 1, 2)).rejects.toThrow(
            'Unexpected alert page shape'
        );
    });

    it('builds identities without treating MAC-valued names or Unknown vendors as facts', () => {
        expect(
            clientIdentity({
                mac: '32-16-9D-00-00-02',
                name: '32-16-9D-00-00-02',
                vendor: 'Unknown',
                deviceType: 'Mobile',
                ip: '192.168.30.4',
                ssid: 'Home',
                apMac: 'aa-00-00-00-00-0a',
                apName: 'Kitchen',
            })
        ).toEqual({
            source: 'client',
            mac: '32-16-9D-00-00-02',
            ip: '192.168.30.4',
            deviceType: 'Mobile',
            ssid: 'Home',
            connectedTo: { type: 'ap', name: 'Kitchen', mac: 'AA-00-00-00-00-0A' },
        });
        expect(clientIdentity({ mac: 'AA-00-00-00-00-0B', switchMac: 'AA-00-00-00-00-0C', switchName: 'Core', port: 4 }).connectedTo).toEqual({
            type: 'switch',
            name: 'Core',
            mac: 'AA-00-00-00-00-0C',
            port: 4,
        });
        expect(clientIdentity({ mac: 'AA-00-00-00-00-0B', gatewayName: 'GW' }).connectedTo).toEqual({ type: 'gateway', name: 'GW', mac: undefined });
        expect(clientIdentity({ mac: 'AA-00-00-00-00-0B' }).connectedTo).toBeUndefined();
        expect(deviceIdentity({ mac: GW, name: 'Gateway', type: 'gateway', model: 'ER605', ip: '192.168.0.1' })).toEqual({
            source: 'device',
            mac: GW,
            ip: '192.168.0.1',
            name: 'Gateway',
            deviceType: 'gateway',
            model: 'ER605',
        });
    });

    it('enriches by exact MAC, falls back to IP only without a MAC, and reports a different IP holder', () => {
        const index = buildInventoryIndex(
            [
                {
                    mac: 'DC-F5-1B-00-00-01',
                    name: 'LG TV',
                    vendor: 'LG',
                    ip: '192.168.0.36',
                    ssid: 'smart',
                    apName: 'Lounge',
                    apMac: 'AA-00-00-00-00-0A',
                },
                { mac: 'AA-00-00-00-00-99', name: 'Phone', ip: '192.168.30.8' },
                { mac: 'AA-00-00-00-00-98', name: 'Dup', ip: '192.168.0.1' },
                'junk',
            ],
            [{ mac: GW, name: 'Gateway', type: 'gateway', ip: '192.168.0.1' }]
        );
        expect(index.byIp.get('192.168.0.1')?.source).toBe('device');

        const tv = enrichSubject({ role: 'conflicting-client', mac: 'DC-F5-1B-00-00-01', ip: '192.168.30.8', occurrences: 1 }, index);
        expect(tv).toMatchObject({
            known: true,
            identity: { matchedBy: 'mac', name: 'LG TV', vendor: 'LG', ssid: 'smart', connectedTo: { type: 'ap', name: 'Lounge' } },
            currentIpHolder: { matchedBy: 'ip', mac: 'AA-00-00-00-00-99', name: 'Phone' },
        });

        const stranger = enrichSubject({ role: 'rogue-dhcp-server', mac: 'F4-28-53-DE-E4-C3', ip: '192.168.1.1', occurrences: 2 }, index);
        expect(stranger).toEqual({ role: 'rogue-dhcp-server', mac: 'F4-28-53-DE-E4-C3', ip: '192.168.1.1', occurrences: 2, known: false });

        const ipOnly = enrichSubject({ role: 'mentioned', ip: '192.168.0.1', occurrences: 1 }, index);
        expect(ipOnly).toMatchObject({ known: true, identity: { source: 'device', matchedBy: 'ip' } });
        expect(ipOnly.currentIpHolder).toBeUndefined();

        const sameHolder = enrichSubject({ role: 'conflicting-client', mac: 'AA-00-00-00-00-99', ip: '192.168.30.8', occurrences: 1 }, index);
        expect(sameHolder.currentIpHolder).toBeUndefined();

        const groups = enrichGroups(groupAlerts([toAlertRecord(conflict(1)) ?? { key: 'x', content: '' }]), index);
        expect(groups[0]?.subjects[0]?.known).toBe(true);
        expect(buildInventoryIndex(undefined, null).byMac.size).toBe(0);
    });

    it('turns a failed read into an unavailable section', async () => {
        expect(await readSection(async () => 1)).toEqual({ ok: true, value: 1 });
        expect(await readSection(async () => Promise.reject(new Error('boom')))).toEqual({ ok: false, error: 'boom' });
        expect(await readSection(async () => Promise.reject('plain'))).toEqual({ ok: false, error: 'plain' });
    });
});
