import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { configureWebhookPolicy } from '../../src/tools/portedToolShared.js';
import { registerUpdateLogNotificationSettingsTool } from '../../src/tools/updateLogNotificationSettings.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/updateLogNotificationSettings', () => {
    let mockClient: OmadaClient;
    let registeredName: string | undefined;
    let registeredConfig: { inputSchema: z.ZodRawShape; annotations?: { destructiveHint?: boolean } } | undefined;
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<CallToolResult>;
    const parseText = (result: CallToolResult): Record<string, unknown> => JSON.parse((result.content[0] as { text: string }).text);

    beforeEach(() => {
        // Never touch real DNS in tests: every hostname resolves to a public documentation address.
        configureWebhookPolicy({ allowedHosts: undefined, resolve: async () => ['93.184.216.34'] });
        const mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredName = name;
                registeredConfig = config;
                toolHandler = (args, extra) => handler(z.object(config.inputSchema).parse(args), extra);
            }),
        } as unknown as McpServer;
        mockClient = {
            getLogSettingForSiteV2: vi.fn().mockResolvedValue({ alertNotifications: [] }),
            getLogSettingForGlobalV2: vi.fn().mockResolvedValue({ alertNotifications: [] }),
            modifyLogSettingForSiteV2: vi.fn().mockResolvedValue({ accepted: true }),
            modifyLogSettingForGlobalV2: vi.fn().mockResolvedValue({ accepted: true }),
            getWebhookForGlobal: vi.fn().mockResolvedValue([
                { webhookId: 'hook-public', urlList: ['https://hooks.example.com/omada'] },
                { webhookId: 'hook-private', urlList: ['https://10.0.0.5/collect'] },
            ]),
        } as unknown as OmadaClient;
        registerUpdateLogNotificationSettingsTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('updateLogNotificationSettings');
        expect(await catalogAnnotations('updateLogNotificationSettings')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', payload: { alertNotifications: [{ key: 'wan-down', enable: true }] } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'update-log-notification-settings', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.modifyLogSettingForSiteV2).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', payload: { alertNotifications: [{ key: 'wan-down', enable: true }] } }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.modifyLogSettingForSiteV2).toHaveBeenCalledExactlyOnceWith(
            { alertNotifications: [{ key: 'wan-down', enable: true }] },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'update-log-notification-settings', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.modifyLogSettingForSiteV2).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', payload: { alertNotifications: [{ key: 'wan-down', enable: true }] } }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: { logNotifications: [] } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['payload'], code: 'unrecognized_keys' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('routes global scope to the controller-wide operation', async () => {
        await toolHandler({ scope: 'global', payload: { eventNotifications: [] }, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.modifyLogSettingForGlobalV2).toHaveBeenCalledExactlyOnceWith({ eventNotifications: [] }, undefined);
        expect(mockClient.modifyLogSettingForSiteV2).not.toHaveBeenCalled();
    });

    it('previews a webhook change with destination hosts and refuses to apply it without confirmation', async () => {
        const args = { siteId: 'site-1', payload: { webhookConfig: { webhookEnable: true, webhookId: 'hook-public' } } };
        const preview = parseText(await toolHandler(args, { sessionId: 's1' }));
        expect(preview.result).toMatchObject({
            webhookChange: { changed: true, requiresConfirmation: true, destinationHosts: ['hooks.example.com'] },
        });
        await expect(toolHandler({ ...args, dryRun: false }, { sessionId: 's1' })).rejects.toThrow('confirmWebhookChange');
        expect(mockClient.modifyLogSettingForSiteV2).not.toHaveBeenCalled();

        await toolHandler({ ...args, dryRun: false, confirmWebhookChange: true }, { sessionId: 's1' });
        expect(mockClient.modifyLogSettingForSiteV2).toHaveBeenCalledExactlyOnceWith(args.payload, 'site-1', undefined);
    });

    it('refuses a webhook profile that delivers to a private address even when confirmed', async () => {
        await expect(
            toolHandler(
                {
                    siteId: 'site-1',
                    payload: { webhookConfig: { webhookEnable: true, webhookId: 'hook-private' } },
                    dryRun: false,
                    confirmWebhookChange: true,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('not allowed');
        expect(mockClient.modifyLogSettingForSiteV2).not.toHaveBeenCalled();
    });

    it('rejects a free-form webhook URL in webhookConfig', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: { webhookConfig: { webhookEnable: true, url: 'https://attacker.example' } } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(
            expect.objectContaining({ code: 'unrecognized_keys', path: ['payload', 'webhookConfig'] })
        );
        expect(mockClient.getWebhookForGlobal).not.toHaveBeenCalled();
    });
});
