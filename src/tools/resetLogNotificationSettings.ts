// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { logScopeSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    scope: logScopeSchema,
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerResetLogNotificationSettingsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'resetLogNotificationSettings',
        {
            description:
                'Reset log notification settings to controller defaults (site or global scope) through the official Omada Open API. Custom webhook/e-mail notification rules are lost. The preview reads the current settings first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'resetLogNotificationSettings',
            ({ scope, siteId }, result, mode) => {
                const target = scope === 'global' ? 'global' : (siteId ?? 'default-site');
                return {
                    action: 'reset-log-notification-settings',
                    target,
                    siteId: scope === 'site' ? siteId : undefined,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned log notification reset for ${target}.` : `Requested log notification reset for ${target}.`,
                    result,
                };
            },
            async ({ scope, siteId, customHeaders, dryRun }) => {
                const before =
                    scope === 'global'
                        ? await client.getLogSettingForGlobalV2(customHeaders)
                        : await client.getLogSettingForSiteV2(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, scope, before };
                }
                const applied = await (scope === 'global'
                    ? client.resetLogSettingForGlobal(customHeaders)
                    : client.resetLogSettingForSite(siteId, customHeaders));
                return { before, applied };
            }
        )
    );
}
