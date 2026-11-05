import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerAdoptDeviceTool } from '../../src/tools/adoptDevice.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/adoptDevice', () => {
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
            adoptDevice: vi.fn().mockResolvedValue({ accepted: true }),
            listPendingDevices: vi.fn().mockResolvedValue([{ mac: 'AA-BB-CC-DD-EE-FF', name: 'new-ap', model: 'EAP' }]),
        } as unknown as OmadaClient;
        registerAdoptDeviceTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('adoptDevice');
        expect(await catalogAnnotations('adoptDevice')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', username: 'admin', password: 'example-password' },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'adopt-device', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.adoptDevice).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', username: 'admin', password: 'example-password' }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.adoptDevice).toHaveBeenCalledExactlyOnceWith(
            'AA-BB-CC-DD-EE-FF',
            { username: 'admin', password: 'example-password' },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'adopt-device', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.adoptDevice).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', username: 'admin', password: 'example-password' }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ deviceMac: 'not-a-mac' }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['deviceMac'], code: 'invalid_format' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('never echoes the device password in the preview', async () => {
        const result = await toolHandler({ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', password: 'example-password' }, { sessionId: 's1' });
        expect(result.content[0].text).not.toContain('example-password');
        expect(JSON.parse(result.content[0].text as string).result).toMatchObject({ credentialsProvided: true });
    });

    it('preflights the pending device list and refuses an unknown or already adopted device (L6)', async () => {
        const preview = await toolHandler({ siteId: 'site-1', deviceMac: 'aa:bb:cc:dd:ee:ff' }, { sessionId: 's1' });
        expect(parseText(preview).result).toMatchObject({ pendingDevice: { mac: 'AA-BB-CC-DD-EE-FF', name: 'new-ap' } });
        expect(mockClient.listPendingDevices).toHaveBeenCalledWith('site-1', undefined);
        vi.mocked(mockClient.listPendingDevices).mockResolvedValue([{ mac: '11-22-33-44-55-66' }]);
        await expect(toolHandler({ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Device AA-BB-CC-DD-EE-FF is not in the pending (adoptable) device list'
        );
        expect(mockClient.adoptDevice).not.toHaveBeenCalled();
    });
});
