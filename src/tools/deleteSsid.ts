// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    ssidId: resourceIdSchema('ssidId').describe('SSID ID from getSsidList.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeleteSsidTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deleteSsid',
        {
            description:
                'Delete an existing SSID through the official Omada Open API. Clients on the SSID are disconnected. The preview reads the current SSID detail first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deleteSsid',
            ({ siteId, ssidId, wlanId }, result, mode) => {
                const target = `${wlanId}/${ssidId}`;
                return {
                    action: 'delete-ssid',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned SSID deletion for ${target}.` : `Requested SSID deletion for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, ssidId, siteId, customHeaders, dryRun }) => {
                const before = await client.getSsidDetail(wlanId, ssidId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deleteSsid(wlanId, ssidId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
