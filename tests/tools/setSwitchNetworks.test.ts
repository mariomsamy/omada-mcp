import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerSetSwitchNetworksTool } from '../../src/tools/setSwitchNetworks.js';

describe('tools/setSwitchNetworks', () => {
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
            listSwitchNetworks: vi.fn().mockResolvedValue({ data: [] }),
            applySwitchNetworks: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerSetSwitchNetworksTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('setSwitchNetworks');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', applyList: [{ id: 'net-1', vlan: 10, status: true }] },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'set-switch-networks', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.applySwitchNetworks).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', applyList: [{ id: 'net-1', vlan: 10, status: true }] }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.applySwitchNetworks).toHaveBeenCalledExactlyOnceWith(
            'AA-BB-CC-DD-EE-FF',
            [{ id: 'net-1', vlan: 10, status: true }],
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'set-switch-networks', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.applySwitchNetworks).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', switchMac: 'AA-BB-CC-DD-EE-FF', applyList: [{ id: 'net-1', vlan: 10, status: true }] }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ switchMac: 'AA-BB-CC-DD-EE-FF', applyList: [{ id: 'net-1', vlan: 5000 }] }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['applyList', 0, 'vlan'], code: 'too_big' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
