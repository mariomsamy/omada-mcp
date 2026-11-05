// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_NESTED_KEYS } from '../utils/openapiNestedKeys.js';
import { OPENAPI_BODY_KEYS, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: strictPayload(
        {
            type: z.number().int().min(0).max(3).optional().describe('Internet port type: 0 WAN, 1 USB, 2 LTE, 3 DSL.'),
            wanPortSetting: strictPayload({ portId: resourceIdSchema('portId') }, OPENAPI_BODY_KEYS.wanPortSetting).describe(
                'WanPortSettingOpenApiVO: portId, wanPortIpv4Setting, wanPortIpv6Setting and wanPortMacSetting per the official schema.'
            ),
        },
        OPENAPI_BODY_KEYS.internetPort,
        OPENAPI_NESTED_KEYS.internetPort
    ).describe('modifyWanPortSettings request body.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateWanPortSettingTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateWanPortSetting',
        {
            description:
                "Modify one WAN port's IPv4/IPv6/MAC settings through the official Omada Open API (modifyWanPortSettings). A wrong WAN setting can take the site offline. The preview reads the current WAN port configuration first.",
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateWanPortSetting',
            ({ payload, siteId }, result, mode) => {
                const target = payload.wanPortSetting.portId;
                return {
                    action: 'update-wan-port-setting',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run' ? `Planned WAN port setting update for ${target}.` : `Requested WAN port setting update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getWanPortsConfig(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyWanPortSettings(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
