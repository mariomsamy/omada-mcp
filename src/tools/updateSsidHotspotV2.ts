// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    ssidId: resourceIdSchema('ssidId').describe('SSID ID from getSsidList.'),
    payload: strictPayload({ hotspotV2Enable: z.boolean() }, OPENAPI_BODY_KEYS.ssidHotspotV2).describe(
        'update-hotspotv2 request body per the official Omada Open API schema.'
    ),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateSsidHotspotV2Tool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateSsidHotspotV2',
        {
            description:
                'Update the SSID Hotspot 2.0 (802.11u/Passpoint) settings through the official Omada Open API update-hotspotv2 route. The preview reads the current SSID detail first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateSsidHotspotV2',
            ({ siteId, ssidId, wlanId }, result, mode) => {
                const target = `${wlanId}/${ssidId}`;
                return {
                    action: 'update-ssid-hotspotv2',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned SSID hotspotv2 update for ${target}.` : `Requested SSID hotspotv2 update for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, ssidId, payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getSsidDetail(wlanId, ssidId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.updateSsidSection(wlanId, ssidId, 'hotspotv2', payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
