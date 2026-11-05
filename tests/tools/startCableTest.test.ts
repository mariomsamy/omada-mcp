import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerStartCableTestTool } from '../../src/tools/startCableTest.js';

describe('tools/startCableTest', () => {
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
            startCableTest: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerStartCableTestTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('startCableTest');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', ports: [1, 2] }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'start-cable-test', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.startCableTest).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', ports: [1, 2] }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.startCableTest).toHaveBeenCalledExactlyOnceWith('AA-BB-CC-DD-EE-FF', [1, 2], 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'start-cable-test', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.startCableTest).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler({ ...{ siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', ports: [1, 2] }, dryRun: false }, { sessionId: 's1' })
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ switchMac: 'AA-BB-CC-DD-EE-FF', ports: [1, 1] }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['ports'], code: 'custom' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
