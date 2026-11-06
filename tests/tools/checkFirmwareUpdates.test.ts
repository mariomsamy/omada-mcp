import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import {
    classifyFirmware,
    compareFirmwareVersions,
    normalizeFirmwareVersion,
    parseFirmwareVersion,
    registerCheckFirmwareUpdatesTool,
} from '../../src/tools/checkFirmwareUpdates.js';
import * as loggerModule from '../../src/utils/logger.js';

interface ResultShape {
    siteId: string;
    summary: { total: number; upToDate: number; updateAvailable: number; unknown: number };
    devices: {
        mac: string;
        name?: string;
        model?: string;
        type?: string;
        currentVersion?: string;
        latestVersion?: string;
        status: string;
        note?: string;
    }[];
    warnings?: string[];
}

const gateway = {
    mac: 'AA-AA-AA-AA-AA-01',
    name: 'gw',
    model: 'ER605 v2.20',
    type: 'gateway',
    status: 1,
    firmwareVersion: '2.4.5 Build 20260721 Rel.81048',
};
const sw = {
    mac: 'AA-AA-AA-AA-AA-02',
    name: 'sw',
    model: 'SG2210P v5.20',
    type: 'switch',
    status: 1,
    firmwareVersion: '5.20.20 Build 20250101 Rel.10000',
};
const ap = {
    mac: 'AA-AA-AA-AA-AA-03',
    name: 'ap',
    model: 'EAP610(EU) v3.0',
    type: 'ap',
    status: 1,
    firmwareVersion: '1.6.0 Build 20250507 Rel. 66340',
};

function pool(rows: { showModel: string; compoundModel?: string; latestVersion: string }[], totalRows = rows.length) {
    return {
        totalRows,
        currentPage: 1,
        currentSize: 100,
        data: rows.map((row) => ({
            id: 'x',
            modelTypeInfo: { showModel: row.showModel, compoundModel: row.compoundModel ?? row.showModel },
            latestVersion: row.latestVersion,
        })),
    };
}

describe('tools/checkFirmwareUpdates', () => {
    let mockServer: McpServer;
    let mockClient: OmadaClient;
    let definition: { inputSchema: z.ZodRawShape; description: string };
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<unknown>;

    async function run(args: unknown = {}): Promise<ResultShape> {
        registerCheckFirmwareUpdatesTool(mockServer, mockClient);
        const result = (await toolHandler(args, { sessionId: 'test' })) as { content: { text: string }[] };
        return JSON.parse(result.content[0].text) as ResultShape;
    }

    beforeEach(() => {
        mockServer = {
            registerTool: vi.fn((_name, def, handler) => {
                definition = def;
                toolHandler = handler;
            }),
        } as unknown as McpServer;

        mockClient = {
            resolveSiteId: vi.fn(async (siteId?: string) => siteId ?? 'default-site'),
            listDevices: vi.fn(),
            getFirmwareInfo: vi.fn(),
            listUpgradeOverviewFirmwares: vi.fn(),
            startOnlineUpgrade: vi.fn(),
        } as unknown as OmadaClient;

        vi.spyOn(loggerModule.logger, 'info').mockImplementation(() => {
            // noop
        });
        vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {
            // noop
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers as checkFirmwareUpdates with a site schema', () => {
        registerCheckFirmwareUpdatesTool(mockServer, mockClient);
        expect(mockServer.registerTool).toHaveBeenCalledWith('checkFirmwareUpdates', expect.any(Object), expect.any(Function));
        expect(definition.description).toMatch(/never triggers an upgrade/i);
        const schema = z.object(definition.inputSchema);
        expect(schema.safeParse({}).success).toBe(true);
        expect(schema.safeParse({ siteId: 'site-1' }).success).toBe(true);
        expect(schema.safeParse({ siteId: 42 }).success).toBe(false);
    });

    it('reports each status and a compact summary', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([
            gateway,
            sw,
            ap,
            { mac: 'AA-AA-AA-AA-AA-04', model: 'OC200 v1.0', status: 1, firmwareVersion: '1.0.0' },
        ]);
        vi.mocked(mockClient.getFirmwareInfo).mockImplementation((mac: string) => {
            if (mac === sw.mac) return Promise.resolve({ curFwVer: sw.firmwareVersion, lastFwVer: '5.20.25 Build 20260509 Rel.23533' });
            if (mac === gateway.mac) return Promise.resolve({ curFwVer: gateway.firmwareVersion });
            return Promise.resolve({ curFwVer: mac === ap.mac ? ap.firmwareVersion : '1.0.0' });
        });
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockResolvedValue(
            pool([
                { showModel: 'ER605 v2.20', latestVersion: '2.4.5 Build 20260721 Rel. 81048' },
                { showModel: 'EAP610(EU) v3.0', compoundModel: 'EAP610-abc v3.0', latestVersion: '1.5.3 Build 20250208 Rel. 60097' },
            ])
        );

        const parsed = await run({ siteId: 'site-1' });

        expect(mockClient.listDevices).toHaveBeenCalledWith('site-1', undefined);
        expect(mockClient.listUpgradeOverviewFirmwares).toHaveBeenCalledWith(1, 100, undefined, 0);
        expect(mockClient.getFirmwareInfo).toHaveBeenCalledWith(sw.mac, 'site-1', undefined);
        expect(mockClient.startOnlineUpgrade).not.toHaveBeenCalled();
        expect(parsed.siteId).toBe('site-1');
        expect(parsed.summary).toEqual({ total: 4, upToDate: 2, updateAvailable: 1, unknown: 1 });
        expect(parsed.warnings).toBeUndefined();

        const byMac = Object.fromEntries(parsed.devices.map((d) => [d.mac, d]));
        expect(byMac[gateway.mac]).toEqual({
            name: 'gw',
            mac: gateway.mac,
            model: 'ER605 v2.20',
            type: 'gateway',
            currentVersion: gateway.firmwareVersion,
            latestVersion: '2.4.5 Build 20260721 Rel. 81048',
            status: 'up-to-date',
        });
        expect(byMac[sw.mac]).toMatchObject({ status: 'update-available', latestVersion: '5.20.25 Build 20260509 Rel.23533' });
        expect(byMac[ap.mac]).toMatchObject({ status: 'up-to-date', note: 'running newer than latest known' });
        expect(byMac['AA-AA-AA-AA-AA-04']).toMatchObject({ status: 'unknown', note: 'controller reports no latest firmware for this model' });
        expect(byMac['AA-AA-AA-AA-AA-04'].latestVersion).toBeUndefined();
    });

    it('skips pending (not adopted) devices', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([gateway, { ...sw, status: 2 }]);
        vi.mocked(mockClient.getFirmwareInfo).mockResolvedValue({ curFwVer: gateway.firmwareVersion, lastFwVer: gateway.firmwareVersion });
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockResolvedValue(pool([]));

        const parsed = await run();

        expect(parsed.siteId).toBe('default-site');
        expect(parsed.devices.map((d) => d.mac)).toEqual([gateway.mac]);
        expect(mockClient.getFirmwareInfo).toHaveBeenCalledTimes(1);
        expect(parsed.summary).toEqual({ total: 1, upToDate: 1, updateAvailable: 0, unknown: 0 });
    });

    it('degrades gracefully when the firmware pool fails', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([gateway, sw]);
        vi.mocked(mockClient.getFirmwareInfo).mockImplementation(async (mac: string) =>
            mac === sw.mac ? { curFwVer: sw.firmwareVersion, lastFwVer: '5.20.25 Build 20260509 Rel.23533' } : { curFwVer: gateway.firmwareVersion }
        );
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockRejectedValue(new Error('pageSize should between 1 and 100.\n'));

        const parsed = await run();

        expect(parsed.warnings).toEqual(['firmware pool unavailable: pageSize should between 1 and 100.']);
        expect(parsed.summary).toEqual({ total: 2, upToDate: 0, updateAvailable: 1, unknown: 1 });
    });

    it('falls back to the device list version when latest-firmware-info fails', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([sw, { mac: 'AA-AA-AA-AA-AA-05', status: 1 }]);
        vi.mocked(mockClient.getFirmwareInfo).mockRejectedValue('timeout');
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockResolvedValue(
            pool([{ showModel: 'SG2210P v5.20', latestVersion: '5.20.25 Build 20260509 Rel.23533' }])
        );

        const parsed = await run();

        expect(parsed.devices[0]).toMatchObject({
            currentVersion: sw.firmwareVersion,
            latestVersion: '5.20.25 Build 20260509 Rel.23533',
            status: 'update-available',
            note: 'latest-firmware-info failed: timeout',
        });
        expect(parsed.devices[1]).toMatchObject({
            status: 'unknown',
            note: 'latest-firmware-info failed: timeout; current firmware version not reported',
        });
        expect(parsed.devices[1].model).toBeUndefined();
    });

    it('pages through the firmware pool and ignores malformed rows', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([sw]);
        vi.mocked(mockClient.getFirmwareInfo).mockResolvedValue(null);
        const firstPage = pool(
            Array.from({ length: 100 }, (_, i) => ({ showModel: `M${i}`, latestVersion: '1.0.0 Build 20200101 Rel.1' })),
            101
        );
        firstPage.data.push({ id: 'bad' } as never, null as never);
        vi.mocked(mockClient.listUpgradeOverviewFirmwares)
            .mockResolvedValueOnce(firstPage)
            .mockResolvedValueOnce(pool([{ showModel: 'SG2210P v5.20', latestVersion: '5.20.20 Build 20250101 Rel.10000' }], 101));

        const parsed = await run();

        expect(mockClient.listUpgradeOverviewFirmwares).toHaveBeenCalledTimes(2);
        expect(mockClient.listUpgradeOverviewFirmwares).toHaveBeenLastCalledWith(2, 100, undefined, 0);
        expect(parsed.devices[0]).toMatchObject({ status: 'up-to-date', latestVersion: '5.20.20 Build 20250101 Rel.10000' });
    });

    it('handles a non-object pool response', async () => {
        vi.mocked(mockClient.listDevices).mockResolvedValue([]);
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockResolvedValue(undefined);

        const parsed = await run();

        expect(parsed.summary).toEqual({ total: 0, upToDate: 0, updateAvailable: 0, unknown: 0 });
        expect(parsed.devices).toEqual([]);
    });

    it('propagates a device list failure', async () => {
        vi.mocked(mockClient.listDevices).mockRejectedValue(new Error('API error'));
        vi.mocked(mockClient.listUpgradeOverviewFirmwares).mockResolvedValue(pool([]));
        registerCheckFirmwareUpdatesTool(mockServer, mockClient);

        await expect(toolHandler({}, { sessionId: 'test' })).rejects.toThrow('API error');
    });
});

describe('checkFirmwareUpdates version helpers', () => {
    it('normalizes spacing and case', () => {
        expect(normalizeFirmwareVersion('2.4.5 Build 20260721 Rel. 81048')).toBe(normalizeFirmwareVersion('2.4.5 build 20260721 Rel.81048'));
    });

    it('parses Omada version strings', () => {
        expect(parseFirmwareVersion('1.6.0 Build 20250507 Rel. 66340')).toEqual({ numbers: [1, 6, 0], build: 20250507, rel: 66340 });
        expect(parseFirmwareVersion('v2.1')).toEqual({ numbers: [2, 1], build: undefined, rel: undefined });
        expect(parseFirmwareVersion('beta')).toBeUndefined();
    });

    it('orders versions without guessing', () => {
        expect(compareFirmwareVersions('1.5.3 Build 20250208 Rel. 60097', '1.6.0 Build 20250507 Rel. 66340')).toBeLessThan(0);
        expect(compareFirmwareVersions('1.6', '1.5.9')).toBeGreaterThan(0);
        expect(compareFirmwareVersions('1.0.0 Build 20200101 Rel.1', '1.0.0 Build 20200102 Rel.1')).toBeLessThan(0);
        expect(compareFirmwareVersions('1.0.0 Build 20200101 Rel.2', '1.0.0 Build 20200101 Rel.1')).toBeGreaterThan(0);
        expect(compareFirmwareVersions('1.0.0', '1.0.0 Build 20200101')).toBeUndefined();
        expect(compareFirmwareVersions('1.0.0 Build 20200101 Rel.1', '1.0.0 Build 20200101 Rel.1')).toBe(0);
        expect(compareFirmwareVersions('beta', '1.0')).toBeUndefined();
    });

    it('classifies each status', () => {
        expect(classifyFirmware(undefined, ['1.0'])).toEqual({ status: 'unknown', note: 'current firmware version not reported' });
        expect(classifyFirmware('1.0', [])).toMatchObject({ status: 'unknown' });
        expect(classifyFirmware('1.0', ['1.1'])).toEqual({ status: 'update-available', latestVersion: '1.1' });
        expect(classifyFirmware('1.1', ['1.1'])).toEqual({ status: 'up-to-date', latestVersion: '1.1' });
        expect(classifyFirmware('1.0', ['1.1', '1.2', '1.0'])).toEqual({ status: 'update-available', latestVersion: '1.2' });
        expect(classifyFirmware('1.0', ['beta', '1.1'])).toEqual({ status: 'unknown', note: 'latest firmware sources disagree' });
        expect(classifyFirmware('custom', ['1.1'])).toEqual({ status: 'unknown', latestVersion: '1.1', note: 'versions not comparable' });
    });
});
