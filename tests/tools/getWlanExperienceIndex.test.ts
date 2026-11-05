import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerGetWlanExperienceIndexTool } from '../../src/tools/getWlanExperienceIndex.js';

describe('tools/getWlanExperienceIndex', () => {
    let mockClient: OmadaClient;
    let registeredName: string | undefined;
    let registeredConfig: { inputSchema: z.ZodRawShape } | undefined;
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<CallToolResult>;

    beforeEach(() => {
        const mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredName = name;
                registeredConfig = config;
                toolHandler = (args, extra) => handler(z.object(config.inputSchema).parse(args), extra);
            }),
        } as unknown as McpServer;
        mockClient = { getExperienceIndex: vi.fn().mockResolvedValue({ data: [{ id: 'item-1' }] }) } as unknown as OmadaClient;
        registerGetWlanExperienceIndexTool(mockServer, mockClient);
    });

    it('returns the controller result through the official client operation', async () => {
        expect(registeredName).toBe('getWlanExperienceIndex');
        expect(registeredConfig?.inputSchema).toHaveProperty('siteId');
        const result = await toolHandler({ siteId: 'site-1' }, { sessionId: 's1' });
        expect(mockClient.getExperienceIndex).toHaveBeenCalledExactlyOnceWith('site-1', undefined);
        expect(result.structuredContent).toEqual({ data: [{ id: 'item-1' }] });
    });

    it('propagates controller errors', async () => {
        vi.mocked(mockClient.getExperienceIndex).mockRejectedValueOnce(new Error('boom'));
        await expect(toolHandler({ siteId: 'site-1' }, { sessionId: 's1' })).rejects.toThrow('boom');
    });
});
