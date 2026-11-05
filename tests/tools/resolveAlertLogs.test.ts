import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerResolveAlertLogsTool } from '../../src/tools/resolveAlertLogs.js';

describe('tools/resolveAlertLogs', () => {
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
            resolveSiteAlerts: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerResolveAlertLogsTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('resolveAlertLogs');
        expect(registeredConfig?.annotations?.destructiveHint).toBeUndefined();
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'resolve-alert-logs', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.resolveSiteAlerts).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.resolveSiteAlerts).toHaveBeenCalledExactlyOnceWith(
            { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'resolve-alert-logs', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.resolveSiteAlerts).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ selection: { selectType: 'include', logs: [], startTime: 1, endTime: 2 } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['selection', 'logs'], code: 'custom' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
