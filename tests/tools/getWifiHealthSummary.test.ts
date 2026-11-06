import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitorOperations } from '../../src/omadaClient/monitor.js';
import type { RequestHandler } from '../../src/omadaClient/request.js';
import type { SiteOperations } from '../../src/omadaClient/site.js';
import { registerGetWifiHealthSummaryTool } from '../../src/tools/getWifiHealthSummary.js';
import type { OmadaApiResponse } from '../../src/types/index.js';
import { toolHarness } from '../helpers/toolHarness.js';

describe('getWifiHealthSummary', () => {
    const now = 1792845296789;
    beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(now);
    });
    afterEach(() => vi.restoreAllMocks());

    function setup() {
        const client = {
            resolveSiteId: vi.fn(async () => 'resolved'),
            getDashboardWifiSummary: vi.fn(async () => ({ channelUtilization: 80 })),
            getChannels: vi.fn(async () => ({})),
            getInterference: vi.fn(async () => ({})),
            getRetryAndDroppedRate: vi.fn(async () => ({})),
        };
        return { client, tool: toolHarness(registerGetWifiHealthSummaryTool, client) };
    }
    it('resolves one site, uses seconds for the bounded history window and gives evidence-based findings', async () => {
        const { client, tool } = setup();
        const result = await tool.invoke();
        expect(result).toMatchObject({ siteId: 'resolved', complete: true, findingLimit: 10 });
        expect(result.findings).toHaveLength(1);
        expect(client.resolveSiteId).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(client.getDashboardWifiSummary).toHaveBeenCalledExactlyOnceWith('resolved', undefined, { start: 1792841696, end: 1792845296 });
        expect(client.getRetryAndDroppedRate).toHaveBeenCalledExactlyOnceWith('resolved', 1792841696, 1792845296, undefined);
        expect(result.window).toEqual({ start: 1792841696, end: 1792845296, unit: 'unix-seconds', appliesTo: ['dashboard', 'retries'] });
        expect(tool.schema().safeParse({ windowMinutes: 0 }).success).toBe(false);
    });

    it('sends a nondefault seconds window through the monitor operations to both historical endpoints', async () => {
        const get = vi.fn(async () => ({ errorCode: 0, result: {} }));
        const request = { get, ensureSuccess: (response: OmadaApiResponse<unknown>) => response.result } as unknown as RequestHandler;
        const resolveSiteId = vi.fn(async (siteId?: string) => siteId ?? 'default-site');
        const site = { resolveSiteId } as unknown as SiteOperations;
        const client = Object.assign(new MonitorOperations(request, site, (path) => `/openapi/v1/controller${path}`), { resolveSiteId });
        const tool = toolHarness(registerGetWifiHealthSummaryTool, client);
        const headers = { 'X-Request-Id': 'wifi' };

        const result = await tool.invoke({ siteId: 'site_123', customHeaders: headers, windowMinutes: 10 });

        expect(result).toMatchObject({
            complete: true,
            findings: [],
            window: { start: 1792844696, end: 1792845296, unit: 'unix-seconds', appliesTo: ['dashboard', 'retries'] },
        });
        expect(get).toHaveBeenCalledTimes(4);
        for (const route of ['wifi-summary', 'retry-dropped-rate']) {
            expect(get).toHaveBeenCalledWith(
                `/openapi/v1/controller/sites/site_123/dashboard/${route}`,
                { start: 1792844696, end: 1792845296 },
                headers
            );
        }
        for (const route of ['channels', 'top-interference']) {
            expect(get).toHaveBeenCalledWith(`/openapi/v1/controller/sites/site_123/dashboard/${route}`, undefined, headers);
        }
        expect(result.findingPolicy).toContain('No findings does not establish healthy Wi-Fi');
        expect(result.interpretation).toContain(
            'The requested window applies to dashboard and retry history. Channels and interference use controller-defined observation windows.'
        );
    });

    it('marks a missing endpoint as unknown and never runs a scan or change', async () => {
        const { client, tool } = setup();
        client.getChannels.mockRejectedValue(new Error('unsupported'));
        expect(await tool.invoke({ windowMinutes: 10 })).toMatchObject({
            complete: false,
            missing: ['channels'],
            sections: { channels: { status: 'unavailable' } },
        });
    });

    it('keeps an unavailable dashboard unknown even when retry history succeeds', async () => {
        const { client, tool } = setup();
        client.getDashboardWifiSummary.mockRejectedValue(new Error('unsupported window'));
        expect(await tool.invoke({ windowMinutes: 10 })).toMatchObject({
            complete: false,
            missing: ['dashboard'],
            sections: { dashboard: { status: 'unavailable' }, retries: { status: 'ok', data: {} } },
            findings: [],
        });
    });

    describe('detail', () => {
        const series = (field: string, rateField: string, rates: number[]) => ({
            [field]: rates.map((rate, index) => ({ time: 1792841700 + index * 300, [rateField]: rate })),
        });
        const retries = {
            retryEaps: [{ apMac: 'AA-BB-CC-DD-EE-01', name: 'Kitchen', avg: 5, ...series('retries', 'retryRate', [4, 6, 8]) }],
            droppedEaps: [{ apMac: 'AA-BB-CC-DD-EE-01', name: 'Kitchen', avg: 0.2, ...series('dropouts', 'dropRate', [0.1, 0.3]) }],
        };
        const channels = {
            channels2g: [
                {
                    channel: 1,
                    apNum: 1,
                    wrNum: 0,
                    clientNum: 4,
                    channelUtilization: 14,
                    apWithClientInfoList: [
                        { name: 'Kitchen', mac: 'AA-BB-CC-DD-EE-01', clientNum: 4, model: 'EAP', type: 'ap', channelUtilization: 14 },
                    ],
                },
                { channel: 2 },
                { channel: 3, apNum: 0, wrNum: 0, clientNum: 0 },
            ],
            channels5g: [{ channel: 44, apNum: 0, wrNum: 1, clientNum: 0, channelUtilization: 2 }],
            channels6g: [],
            note: 'kept',
        };

        function setupDetail() {
            const { client, tool } = setup();
            client.getRetryAndDroppedRate.mockResolvedValue(retries);
            client.getChannels.mockResolvedValue(channels);
            return { client, tool };
        }

        it('defaults to summary: drops time series and unoccupied channels but keeps findings and per-AP averages', async () => {
            const { tool } = setupDetail();
            const result = await tool.invoke();
            const sections = result.sections as Record<string, { data: Record<string, unknown> }>;

            expect(result.detail).toBe('summary');
            expect(result.findings).toHaveLength(1);
            expect(sections.retries.data).toEqual({
                retryEaps: [{ apMac: 'AA-BB-CC-DD-EE-01', name: 'Kitchen', avg: 5, retryRateStats: { samples: 3, mean: 6, max: 8, latest: 8 } }],
                droppedEaps: [
                    { apMac: 'AA-BB-CC-DD-EE-01', name: 'Kitchen', avg: 0.2, dropRateStats: { samples: 2, mean: 0.2, max: 0.3, latest: 0.3 } },
                ],
            });
            expect(sections.channels.data).toEqual({
                channels2g: [
                    {
                        channel: 1,
                        apNum: 1,
                        wrNum: 0,
                        clientNum: 4,
                        channelUtilization: 14,
                        aps: [{ name: 'Kitchen', mac: 'AA-BB-CC-DD-EE-01', clientNum: 4, channelUtilization: 14 }],
                    },
                ],
                channels5g: [{ channel: 44, apNum: 0, wrNum: 1, clientNum: 0, channelUtilization: 2 }],
                channels6g: [],
                note: 'kept',
            });
            expect(JSON.stringify(result)).not.toContain('"time"');
            expect(result.interpretation).toEqual(expect.arrayContaining([expect.stringContaining('detail="full"')]));
        });

        it('returns the raw controller payload with detail=full', async () => {
            const { tool } = setupDetail();
            const result = await tool.invoke({ detail: 'full' });
            const sections = result.sections as Record<string, { data: unknown }>;

            expect(result.detail).toBe('full');
            expect(sections.retries.data).toEqual(retries);
            expect(sections.channels.data).toEqual(channels);
            expect(tool.schema().safeParse({ detail: 'verbose' }).success).toBe(false);
        });

        it('keeps unavailable sections and unexpected shapes unchanged in summary mode', async () => {
            const { client, tool } = setup();
            client.getRetryAndDroppedRate.mockRejectedValue(new Error('unsupported'));
            client.getChannels.mockResolvedValue({ channels2g: 'n/a' });
            const result = await tool.invoke();
            expect(result.sections).toMatchObject({
                retries: { status: 'unavailable' },
                channels: { status: 'ok', data: { channels2g: 'n/a' } },
            });
        });

        it('summarises entries without a usable series as zero samples', async () => {
            const { client, tool } = setup();
            client.getRetryAndDroppedRate.mockResolvedValue({ retryEaps: [{ apMac: 'x', retries: 'bad' }, null], droppedEaps: 'n/a' });
            const result = await tool.invoke();
            expect((result.sections as Record<string, { data: unknown }>).retries.data).toEqual({
                retryEaps: [{ apMac: 'x', retryRateStats: { samples: 0 } }, { retryRateStats: { samples: 0 } }],
                droppedEaps: 'n/a',
            });
        });
    });
});
