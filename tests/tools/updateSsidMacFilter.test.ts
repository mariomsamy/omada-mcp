import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerUpdateSsidMacFilterTool } from '../../src/tools/updateSsidMacFilter.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/updateSsidMacFilter', () => {
    let mockClient: OmadaClient;
    let registeredName: string | undefined;
    let registeredConfig: { inputSchema: z.ZodRawShape; annotations?: { destructiveHint?: boolean } } | undefined;
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<CallToolResult>;
    const parseText = (result: CallToolResult): Record<string, unknown> => JSON.parse((result.content[0] as { text: string }).text);

    beforeEach(() => {
        const mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredName = name;
                registeredConfig = config;
                toolHandler = (args, extra) => handler(z.object(config.inputSchema).parse(args), extra);
            }),
        } as unknown as McpServer;
        mockClient = {
            getSsidDetail: vi.fn().mockResolvedValue({ id: 'ssid-1' }),
            updateSsidSection: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerUpdateSsidMacFilterTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('updateSsidMacFilter');
        expect(await catalogAnnotations('updateSsidMacFilter')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', wlanId: 'wlan-1', ssidId: 'ssid-1', payload: { macFilterEnable: true, policy: 1, macFilterId: 'group-1' } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'update-ssid-mac-filter', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.updateSsidSection).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            {
                ...{ siteId: 'site-1', wlanId: 'wlan-1', ssidId: 'ssid-1', payload: { macFilterEnable: true, policy: 1, macFilterId: 'group-1' } },
                dryRun: false,
            },
            { sessionId: 's1' }
        );
        expect(mockClient.updateSsidSection).toHaveBeenCalledExactlyOnceWith(
            'wlan-1',
            'ssid-1',
            'mac-filter',
            { macFilterEnable: true, policy: 1, macFilterId: 'group-1' },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'update-ssid-mac-filter', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.updateSsidSection).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                {
                    ...{
                        siteId: 'site-1',
                        wlanId: 'wlan-1',
                        ssidId: 'ssid-1',
                        payload: { macFilterEnable: true, policy: 1, macFilterId: 'group-1' },
                    },
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ wlanId: 'wlan-1', ssidId: '', payload: {} }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['ssidId'], code: 'too_small' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
