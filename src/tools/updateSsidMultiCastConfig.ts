// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    ssidId: resourceIdSchema('ssidId').describe('SSID ID from getSsidList.'),
    payload: strictPayload(
        {
            multiCastEnable: z.boolean(),
            channelUtil: z.number().int(),
            arpCastEnable: z.boolean(),
            ipv6CastEnable: z.boolean(),
            filterEnable: z.boolean(),
        },
        OPENAPI_BODY_KEYS.ssidMultiCast
    ).describe('update-multicast-config request body per the official Omada Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateSsidMultiCastConfigTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateSsidMultiCastConfig',
        {
            description:
                'Update the SSID multicast/broadcast management settings through the official Omada Open API update-multicast-config route. The preview reads the current SSID detail first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateSsidMultiCastConfig',
            ({ siteId, ssidId, wlanId }, result, mode) => {
                const target = `${wlanId}/${ssidId}`;
                return {
                    action: 'update-ssid-multicast-config',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned SSID multicast-config update for ${target}.`
                            : `Requested SSID multicast-config update for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, ssidId, payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getSsidDetail(wlanId, ssidId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.updateSsidSection(wlanId, ssidId, 'multicast-config', payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
