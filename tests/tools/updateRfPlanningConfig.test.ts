import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerUpdateRfPlanningConfigTool } from '../../src/tools/updateRfPlanningConfig.js';

describe('tools/updateRfPlanningConfig', () => {
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
            getRadioFrequencyPlanningConfig: vi.fn().mockResolvedValue({ mode: 1 }),
            updateRfPlanningConfig: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerUpdateRfPlanningConfigTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('updateRfPlanningConfig');
        expect(registeredConfig?.annotations?.destructiveHint).toBeUndefined();
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', payload: { mode: 0 } }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'update-rf-planning-config', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.updateRfPlanningConfig).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler({ ...{ siteId: 'site-1', payload: { mode: 0 } }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.updateRfPlanningConfig).toHaveBeenCalledExactlyOnceWith({ mode: 0 }, 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'update-rf-planning-config', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.updateRfPlanningConfig).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(toolHandler({ ...{ siteId: 'site-1', payload: { mode: 0 } }, dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Controller rejected the change'
        );
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: { mode: 5 } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['payload', 'mode'], code: 'invalid_union' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
