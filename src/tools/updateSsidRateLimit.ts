// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_NESTED_KEYS } from '../utils/openapiNestedKeys.js';
import { diffFields, OPENAPI_BODY_KEYS, objectPayloadSchema, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    ssidId: resourceIdSchema('ssidId').describe('SSID ID from getSsidList.'),
    payload: strictPayload(
        {
            clientRateLimit: objectPayloadSchema('Client rate limit (profileId or customSetting).', OPENAPI_BODY_KEYS.ssidRateLimitEntry).optional(),
            ssidRateLimit: objectPayloadSchema('SSID rate limit (profileId or customSetting).', OPENAPI_BODY_KEYS.ssidRateLimitEntry).optional(),
        },
        OPENAPI_BODY_KEYS.ssidRateLimit,
        OPENAPI_NESTED_KEYS.ssidRateLimit
    ).describe('update-rate-limit request body per the official Omada Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateSsidRateLimitTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateSsidRateLimit',
        {
            description:
                'Update the SSID SSID and per-client rate limit settings through the official Omada Open API update-rate-limit route. The preview reads the current SSID detail first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateSsidRateLimit',
            ({ siteId, ssidId, wlanId }, result, mode) => {
                const target = `${wlanId}/${ssidId}`;
                return {
                    action: 'update-ssid-rate-limit',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned SSID rate-limit update for ${target}.` : `Requested SSID rate-limit update for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, ssidId, payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getSsidDetail(wlanId, ssidId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload, diff: diffFields(before, payload) };
                }
                const applied = await client.updateSsidSection(wlanId, ssidId, 'rate-limit', payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
