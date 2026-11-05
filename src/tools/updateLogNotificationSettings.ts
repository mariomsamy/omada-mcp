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
            webhookConfig: webhookConfigSchema.optional(),
            alertNotifications: z.array(objectPayloadSchema('Alert notification rule.', OPENAPI_BODY_KEYS.logNotification)).max(512).optional(),
            eventNotifications: z.array(objectPayloadSchema('Event notification rule.', OPENAPI_BODY_KEYS.logNotification)).max(512).optional(),
            alertEmailSetting: objectPayloadSchema('Alert e-mail settings.', OPENAPI_BODY_KEYS.logEmailSetting).optional(),
            eventEmailSetting: objectPayloadSchema('Event e-mail settings.', OPENAPI_BODY_KEYS.logEmailSetting).optional(),
        })
        .strict()
        .describe('modifyLogSettingSiteV2 / modifyLogSettingGlobalV2 request body.'),
    confirmWebhookChange: confirmWebhookChangeSchema,
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateLogNotificationSettingsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateLogNotificationSettings',
        {
            description:
                'Modify log notification settings (webhook, alert/event notifications, e-mail) for a site or globally through the official Omada Open API v2 route. Destructive: a webhook change can send client data off-network, so the referenced webhook profile must deliver only to public https URLs and applying a webhook change requires confirmWebhookChange:true. The preview reads the current settings first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateLogNotificationSettings',
            ({ scope, siteId }, result, mode) => {
                const target = scope === 'global' ? 'global' : (siteId ?? 'default-site');
                return {
                    action: 'update-log-notification-settings',
                    target,
                    siteId: scope === 'site' ? siteId : undefined,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run' ? `Planned log notification update for ${target}.` : `Requested log notification update for ${target}.`,
                    result,
                };
            },
            async ({ scope, payload, siteId, customHeaders, dryRun, confirmWebhookChange }) => {
                const before =
                    scope === 'global'
                        ? await client.getLogSettingForGlobalV2(customHeaders)
                        : await client.getLogSettingForSiteV2(siteId, customHeaders);
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
                    ? client.modifyLogSettingForGlobalV2(payload, customHeaders)
                    : client.modifyLogSettingForSiteV2(payload, siteId, customHeaders));
                return { before, applied };
            }
        )
    );
}
