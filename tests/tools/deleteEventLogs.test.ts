import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerDeleteEventLogsTool } from '../../src/tools/deleteEventLogs.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/deleteEventLogs', () => {
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
            deleteSiteLogs: vi.fn().mockResolvedValue({ accepted: true }),
            deleteGlobalLogs: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerDeleteEventLogsTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('deleteEventLogs');
        expect(await catalogAnnotations('deleteEventLogs')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'delete-event-logs', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.deleteSiteLogs).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.deleteSiteLogs).toHaveBeenCalledExactlyOnceWith(
            'events',
            { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'delete-event-logs', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.deleteSiteLogs).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 } }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ selection: { selectType: 'all', logs: [], startTime: 5, endTime: 1 } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['selection', 'endTime'], code: 'custom' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('routes global scope to the controller-wide operation', async () => {
        await toolHandler(
            { scope: 'global', selection: { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.deleteGlobalLogs).toHaveBeenCalledExactlyOnceWith(
            'events',
            { logs: ['log-1'], selectType: 'include', startTime: 1, endTime: 2 },
            undefined
        );
        expect(mockClient.deleteSiteLogs).not.toHaveBeenCalled();
    });

    it('refuses to apply a broad selection without explicit confirmation', async () => {
        const selection = { logs: [], selectType: 'all', startTime: 1, endTime: 2, filterModule: 'System' };
        await expect(toolHandler({ siteId: 'site-1', selection, dryRun: false }, { sessionId: 's1' })).rejects.toThrow('confirmBroadSelection');
        expect(mockClient.deleteSiteLogs).not.toHaveBeenCalled();
        await toolHandler({ siteId: 'site-1', selection, dryRun: false, confirmBroadSelection: true }, { sessionId: 's1' });
        expect(mockClient.deleteSiteLogs).toHaveBeenCalledTimes(1);
    });
});
