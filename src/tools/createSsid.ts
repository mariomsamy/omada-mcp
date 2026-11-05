// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, objectPayloadSchema, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    wlanId: resourceIdSchema('wlanId').describe('WLAN group ID from getWlanGroupList.'),
    payload: strictPayload(
        {
            name: z.string().min(1).max(32).describe('SSID name, 1 to 32 UTF-8 characters.'),
            deviceType: z.number().int().min(1),
            band: z.number().int().min(1),
            guestNetEnable: z.boolean(),
            security: z.number().int().min(0),
            broadcast: z.boolean(),
            vlanEnable: z.boolean(),
            pskSetting: objectPayloadSchema('PSK settings (securityKey is redacted in output).', OPENAPI_BODY_KEYS.ssidPskSetting).optional(),
            entSetting: objectPayloadSchema('Enterprise (RADIUS) settings.', OPENAPI_BODY_KEYS.ssidEntSetting).optional(),
            ppskSetting: objectPayloadSchema('PPSK settings.', OPENAPI_BODY_KEYS.ssidPpskSetting).optional(),
            vlanSetting: objectPayloadSchema('VLAN settings.', OPENAPI_BODY_KEYS.ssidVlanSetting).optional(),
        },
        OPENAPI_BODY_KEYS.createSsid
    ).describe('createSsid request body (CreateSsidOpenApiVO); pskSetting/entSetting and other nested fields follow the official schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreateSsidTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createSsid',
        {
            description:
                'Create a new SSID in a WLAN group through the official Omada Open API. Secrets such as PSK keys are redacted from tool output.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'createSsid',
            ({ payload, siteId, wlanId }, result, mode) => {
                const target = `${wlanId}/${payload.name}`;
                return {
                    action: 'create-ssid',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned SSID creation for ${target}.` : `Requested SSID creation for ${target}.`,
                    result,
                };
            },
            async ({ wlanId, payload, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: payload };
                }
                const applied = await client.createSsid(wlanId, payload, siteId, customHeaders);
                return applied;
            }
        )
    );
}
