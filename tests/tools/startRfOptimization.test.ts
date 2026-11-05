import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerStartRfOptimizationTool } from '../../src/tools/startRfOptimization.js';

describe('tools/startRfOptimization', () => {
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
            startRfOptimization: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerStartRfOptimizationTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('startRfOptimization');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', optimizationStrategy: 0 }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'start-rf-optimization', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.startRfOptimization).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler({ ...{ siteId: 'site-1', optimizationStrategy: 0 }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.startRfOptimization).toHaveBeenCalledExactlyOnceWith(0, 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'start-rf-optimization', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.startRfOptimization).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(toolHandler({ ...{ siteId: 'site-1', optimizationStrategy: 0 }, dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Controller rejected the change'
        );
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ optimizationStrategy: 2 }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['optimizationStrategy'], code: 'invalid_union' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
