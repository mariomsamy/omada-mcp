// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    deviceMac: deviceMacSchema.describe('MAC address of the device to upgrade.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerStartFirmwareUpgradeTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'startFirmwareUpgrade',
        {
            description:
                'Start an online firmware upgrade of one device with the latest cloud firmware through the official Omada Open API. The device reboots during the upgrade. The preview reads the current firmware information first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'startFirmwareUpgrade',
            ({ deviceMac, siteId }, result, mode) => {
                const target = deviceMac;
                return {
                    action: 'start-firmware-upgrade',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned firmware upgrade for ${target}.` : `Requested firmware upgrade for ${target}.`,
                    result,
                };
            },
            async ({ deviceMac, siteId, customHeaders, dryRun }) => {
                const before = await client.getFirmwareInfo(deviceMac, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.startOnlineUpgrade(deviceMac, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
