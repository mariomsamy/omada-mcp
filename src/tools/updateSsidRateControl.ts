// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { diffFields, OPENAPI_BODY_KEYS, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    ssidId: resourceIdSchema('ssidId').describe('SSID ID from getSsidList.'),
    payload: strictPayload({ rate2gCtrlEnable: z.boolean(), rate5gCtrlEnable: z.boolean() }, OPENAPI_BODY_KEYS.ssidRateControl).describe(
        'update-rate-control request body per the official Omada Open API schema.'
    ),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateSsidRateControlTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateSsidRateControl',
        {
            description:
                'Update the SSID 802.11 data rate control settings through the official Omada Open API update-rate-control route. The preview reads the current SSID detail first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateSsidRateControl',
            ({ siteId, ssidId, wlanId }, result, mode) => {
                const target = `${wlanId}/${ssidId}`;
                return {
                    action: 'update-ssid-rate-control',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run' ? `Planned SSID rate-control update for ${target}.` : `Requested SSID rate-control update for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, ssidId, payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getSsidDetail(wlanId, ssidId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload, diff: diffFields(before, payload, ['rateControl']) };
                }
                const applied = await client.updateSsidSection(wlanId, ssidId, 'rate-control', payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
