import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { configureWebhookPolicy } from '../../src/tools/portedToolShared.js';
import { registerUpdateAuditNotificationSettingsTool } from '../../src/tools/updateAuditNotificationSettings.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/updateAuditNotificationSettings', () => {
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
            getAuditLogSettingForSite: vi.fn().mockResolvedValue({ webhookConfig: { webhookEnable: false }, auditLogNotifications: [] }),
            getAuditLogSettingForGlobal: vi.fn().mockResolvedValue({ webhookConfig: { webhookEnable: false }, auditLogNotifications: [] }),
            getWebhookForGlobal: vi.fn().mockResolvedValue([{ webhookId: 'hook-1', urlList: ['https://hooks.example.com/a'] }]),
            modifyAuditLogSettingForSite: vi.fn().mockResolvedValue({ accepted: true }),
            modifyAuditLogSettingForGlobal: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerUpdateAuditNotificationSettingsTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('updateAuditNotificationSettings');
        expect(await catalogAnnotations('updateAuditNotificationSettings')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            { siteId: 'site-1', payload: { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] } },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'update-audit-notification-settings', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.modifyAuditLogSettingForSite).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            { ...{ siteId: 'site-1', payload: { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] } }, dryRun: false },
            { sessionId: 's1' }
        );
        expect(mockClient.modifyAuditLogSettingForSite).toHaveBeenCalledExactlyOnceWith(
            { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'update-audit-notification-settings', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.modifyAuditLogSettingForSite).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                { ...{ siteId: 'site-1', payload: { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] } }, dryRun: false },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: { webhookConfig: {} } }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(
            expect.objectContaining({ path: ['payload', 'webhookConfig', 'webhookEnable'], code: 'invalid_type' })
        );
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('routes global scope to the controller-wide operation', async () => {
        const payload = { webhookConfig: { webhookEnable: false }, auditLogNotifications: [] };
        await toolHandler({ scope: 'global', payload, dryRun: false }, { sessionId: 's1' });
        expect(mockClient.modifyAuditLogSettingForGlobal).toHaveBeenCalledExactlyOnceWith(payload, undefined);
        expect(mockClient.modifyAuditLogSettingForSite).not.toHaveBeenCalled();
    });

    it('requires confirmWebhookChange before redirecting audit notifications to a webhook', async () => {
        const payload = { webhookConfig: { webhookEnable: true, webhookId: 'hook-1' }, auditLogNotifications: [] };
        await expect(toolHandler({ siteId: 'site-1', payload, dryRun: false }, { sessionId: 's1' })).rejects.toThrow('confirmWebhookChange');
        expect(mockClient.modifyAuditLogSettingForSite).not.toHaveBeenCalled();
        await toolHandler({ siteId: 'site-1', payload, dryRun: false, confirmWebhookChange: true }, { sessionId: 's1' });
        expect(mockClient.modifyAuditLogSettingForSite).toHaveBeenCalledExactlyOnceWith(payload, 'site-1', undefined);
    });
});
