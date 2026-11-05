import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerCreateSsidTool } from '../../src/tools/createSsid.js';

describe('tools/createSsid', () => {
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
            createSsid: vi.fn().mockResolvedValue({ ssidId: 'ssid-1' }),
        } as unknown as OmadaClient;
        registerCreateSsidTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('createSsid');
        expect(registeredConfig?.annotations?.destructiveHint).toBeUndefined();
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            {
                siteId: 'site-1',
                wlanId: 'wlan-1',
                payload: { name: 'Guest', deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false },
            },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'create-ssid', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.createSsid).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            {
                ...{
                    siteId: 'site-1',
                    wlanId: 'wlan-1',
                    payload: { name: 'Guest', deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false },
                },
                dryRun: false,
            },
            { sessionId: 's1' }
        );
        expect(mockClient.createSsid).toHaveBeenCalledExactlyOnceWith(
            'wlan-1',
            { name: 'Guest', deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'create-ssid', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.createSsid).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                {
                    ...{
                        siteId: 'site-1',
                        wlanId: 'wlan-1',
                        payload: { name: 'Guest', deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false },
                    },
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ wlanId: 'wlan-1', payload: { name: '' } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['payload', 'name'], code: 'too_small' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
