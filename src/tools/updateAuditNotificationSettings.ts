// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import {
    assertWebhookChangeConfirmed,
    assessWebhookChange,
    confirmWebhookChangeSchema,
    logScopeSchema,
    OPENAPI_BODY_KEYS,
    objectPayloadSchema,
    webhookConfigSchema,
} from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    scope: logScopeSchema,
    payload: z
        .object({
            webhookConfig: webhookConfigSchema,
            auditLogNotifications: z.array(objectPayloadSchema('Audit log notification rule.', OPENAPI_BODY_KEYS.auditLogNotification)).max(512),
        })
        .strict()
        .describe('modifyAuditLogSetting request body.'),
    confirmWebhookChange: confirmWebhookChangeSchema,
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateAuditNotificationSettingsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateAuditNotificationSettings',
        {
            description:
                'Modify audit log notification settings for a site or globally through the official Omada Open API. Disabling audit notifications reduces change visibility. The preview reads the current settings first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateAuditNotificationSettings',
            ({ scope, siteId }, result, mode) => {
                const target = scope === 'global' ? 'global' : (siteId ?? 'default-site');
                return {
                    action: 'update-audit-notification-settings',
                    target,
                    siteId: scope === 'site' ? siteId : undefined,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned audit notification update for ${target}.`
                            : `Requested audit notification update for ${target}.`,
                    result,
                };
            },
            async ({ scope, payload, siteId, customHeaders, dryRun, confirmWebhookChange }) => {
                const before =
                    scope === 'global'
                        ? await client.getAuditLogSettingForGlobal(customHeaders)
                        : await client.getAuditLogSettingForSite(siteId, customHeaders);
                const webhookChange = await assessWebhookChange(client, before, payload.webhookConfig, customHeaders);
                if (dryRun) {
                    return {
                        accepted: true,
                        dryRun: true,
                        scope,
                        before,
                        plannedConfig: payload,
                        webhookChange: { ...webhookChange, requiresConfirmation: webhookChange.changed },
                    };
                }
                assertWebhookChangeConfirmed(webhookChange, confirmWebhookChange);
                const applied = await (scope === 'global'
                    ? client.modifyAuditLogSettingForGlobal(payload, customHeaders)
                    : client.modifyAuditLogSettingForSite(payload, siteId, customHeaders));
                return { before, applied };
            }
        )
    );
}
