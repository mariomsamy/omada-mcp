import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerCreateLanProfileTool } from '../../src/tools/createLanProfile.js';

describe('tools/createLanProfile', () => {
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
            createLanProfile: vi.fn().mockResolvedValue({ id: 'new-1' }),
        } as unknown as OmadaClient;
        registerCreateLanProfileTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('createLanProfile');
        expect(registeredConfig?.annotations?.destructiveHint).toBeUndefined();
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', payload: { name: 'Cameras', poe: 0, nativeNetworkId: 'net-1', dot1x: 1 } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'create-lan-profile', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.createLanProfile).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', payload: { name: 'Cameras', poe: 0, nativeNetworkId: 'net-1', dot1x: 1 } }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.createLanProfile).toHaveBeenCalledExactlyOnceWith(
            { name: 'Cameras', poe: 0, nativeNetworkId: 'net-1', dot1x: 1 },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'create-lan-profile', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.createLanProfile).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', payload: { name: 'Cameras', poe: 0, nativeNetworkId: 'net-1', dot1x: 1 } }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: {} }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['payload', 'name'], code: 'invalid_type' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
