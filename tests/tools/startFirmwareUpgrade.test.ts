import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerStartFirmwareUpgradeTool } from '../../src/tools/startFirmwareUpgrade.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/startFirmwareUpgrade', () => {
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
            getFirmwareInfo: vi.fn().mockResolvedValue({ curFwVer: '1.0.0', lastFwVer: '1.1.0' }),
            startOnlineUpgrade: vi.fn().mockResolvedValue({ accepted: true }),
            listDevices: vi.fn().mockResolvedValue([{ mac: 'AA-BB-CC-DD-EE-FF', name: 'ap-1', model: 'EAP', status: 1 }]),
        } as unknown as OmadaClient;
        registerStartFirmwareUpgradeTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('startFirmwareUpgrade');
        expect(await catalogAnnotations('startFirmwareUpgrade')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler({ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF' }, { sessionId: 's1' });
        expect(parseText(result)).toMatchObject({ action: 'start-firmware-upgrade', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.startOnlineUpgrade).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler({ ...{ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF' }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.startOnlineUpgrade).toHaveBeenCalledExactlyOnceWith('AA-BB-CC-DD-EE-FF', 'site-1', undefined);
        expect(parseText(result)).toMatchObject({ action: 'start-firmware-upgrade', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.startOnlineUpgrade).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(toolHandler({ ...{ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF' }, dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Controller rejected the change'
        );
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ deviceMac: 'zz' }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['deviceMac'], code: 'invalid_format' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('preflights the site device list and refuses an unknown device (L6)', async () => {
        const preview = await toolHandler({ siteId: 'site-1', deviceMac: 'AA:BB:CC:DD:EE:FF' }, { sessionId: 's1' });
        expect(parseText(preview).result).toMatchObject({ before: { device: { name: 'ap-1' }, firmware: { curFwVer: '1.0.0' } } });
        vi.mocked(mockClient.listDevices).mockResolvedValue([]);
        await expect(toolHandler({ siteId: 'site-1', deviceMac: 'AA-BB-CC-DD-EE-FF', dryRun: false }, { sessionId: 's1' })).rejects.toThrow(
            'Device AA-BB-CC-DD-EE-FF was not found in the selected site'
        );
        expect(mockClient.startOnlineUpgrade).not.toHaveBeenCalled();
    });
});
