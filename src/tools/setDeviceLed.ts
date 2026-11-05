import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { requireDeviceByMac } from './portedToolShared.js';

const LED_DEVICE_TYPES = new Set(['ap', 'switch', 'gateway'] as const);
type LedDeviceType = 'ap' | 'switch' | 'gateway';

function ledDeviceType(type: unknown, deviceMac: string): LedDeviceType {
    const normalized = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (!LED_DEVICE_TYPES.has(normalized as LedDeviceType)) {
        throw new Error(`Device ${deviceMac} has type "${String(type)}"; LED control is documented only for ap, switch and gateway devices.`);
    }
    return normalized as LedDeviceType;
}

export function registerSetDeviceLedTool(server: McpServer, client: OmadaClient): void {
    const inputSchema = siteInputSchema.extend({
        deviceMac: deviceMacSchema.describe('Device MAC address to update.'),
        ledSetting: z.number().int().min(0).max(2).describe('LED setting. 0=off, 1=on, 2=site-default as documented by the Omada controller.'),
        dryRun: z.boolean().optional().default(true).describe('If true, return the planned action without sending it to the controller.'),
    });

    server.registerTool(
        'setDeviceLed',
        {
            description:
                'Change the LED state of one AP, switch or gateway through its official Open API general-config route (ledSetting). The preview reads the site device list to confirm the device and its type.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'setDeviceLed',
            ({ deviceMac, ledSetting, siteId }, result, mode) => ({
                action: 'set-device-led',
                target: deviceMac,
                siteId,
                mode,
                status: mode === 'dry-run' ? 'planned' : 'applied',
                summary:
                    mode === 'dry-run'
                        ? `Planned LED setting ${ledSetting} for device ${deviceMac}.`
                        : `LED setting ${ledSetting} requested for device ${deviceMac}.`,
                result,
            }),
            async ({ deviceMac, ledSetting, siteId, customHeaders, dryRun }) => {
                // Preflight (read only): the device must exist; its type selects the documented route.
                const device = await requireDeviceByMac(
                    () => client.listDevices(siteId, customHeaders),
                    deviceMac,
                    'was not found in the selected site (see listDevices)'
                );
                const deviceType = ledDeviceType(device.type, deviceMac);
                if (dryRun) {
                    return { accepted: true, dryRun: true, ledSetting, deviceType };
                }
                return await client.setDeviceLed(deviceMac, ledSetting, deviceType, siteId, customHeaders);
            }
        )
    );
}
