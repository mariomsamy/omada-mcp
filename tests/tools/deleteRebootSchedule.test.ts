import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerDeleteRebootScheduleTool } from '../../src/tools/deleteRebootSchedule.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/deleteRebootSchedule', () => {
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
            listSiteRebootSchedules: vi.fn().mockResolvedValue({ data: [{ id: 'res-1' }] }),
            deleteRebootSchedule: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerDeleteRebootScheduleTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('deleteRebootSchedule');
        expect(await catalogAnnotations('deleteRebootSchedule')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', scheduleId: 'res-1' }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'delete-reboot-schedule', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.deleteRebootSchedule).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler({ ...{ siteId: 'site-1', scheduleId: 'res-1' }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.deleteRebootSchedule).toHaveBeenCalledExactlyOnceWith('res-1', 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'delete-reboot-schedule', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.deleteRebootSchedule).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(toolHandler({ ...{ siteId: 'site-1', scheduleId: 'res-1' }, dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Controller rejected the change'
        );
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ scheduleId: '' }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['scheduleId'], code: 'too_small' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('refuses to mutate a resource that the preflight cannot find', async () => {
        await expect(toolHandler({ siteId: 'site-1', scheduleId: 'missing-1', dryRun: false }, { sessionId: 's1' })).rejects.toThrow('was not found');
        expect(mockClient.listSiteRebootSchedules).toHaveBeenCalledTimes(1);
        expect(mockClient.deleteRebootSchedule).not.toHaveBeenCalled();
    });
});
