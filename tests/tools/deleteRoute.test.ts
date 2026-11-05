import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerDeleteRouteTool } from '../../src/tools/deleteRoute.js';

describe('tools/deleteRoute', () => {
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
            listStaticRoutes: vi.fn().mockResolvedValue([{ id: 'res-1', name: 'existing' }]),
            deleteStaticRouting: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerDeleteRouteTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('deleteRoute');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', staticRoutingId: 'res-1' }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'delete-static-route', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.deleteStaticRouting).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler({ ...{ siteId: 'site-1', staticRoutingId: 'res-1' }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.deleteStaticRouting).toHaveBeenCalledExactlyOnceWith('res-1', 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'delete-static-route', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.deleteStaticRouting).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(toolHandler({ ...{ siteId: 'site-1', staticRoutingId: 'res-1' }, dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Controller rejected the change'
        );
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ staticRoutingId: '' }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['staticRoutingId'], code: 'too_small' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('refuses to mutate a resource that the preflight cannot find', async () => {
        await expect(toolHandler({ siteId: 'site-1', staticRoutingId: 'missing-1', dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'was not found'
        );
        expect(mockClient.listStaticRoutes).toHaveBeenCalledTimes(1);
        expect(mockClient.deleteStaticRouting).not.toHaveBeenCalled();
    });
});
