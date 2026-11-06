import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import {
    ALERT_MAX_PAGES,
    ALERT_PAGE_SIZE,
    buildInventoryIndex,
    enrichGroups,
    fetchAlertsInWindow,
    groupAlerts,
    readSection,
} from './networkAuditShared.js';

const inputSchema = siteInputSchema.extend({
    windowHours: z.number().int().min(1).max(720).default(24).describe('How far back to read alerts, in hours (1-720). Default 24.'),
    alertTypes: z
        .array(z.string().trim().min(1).max(128))
        .max(50)
        .optional()
        .describe('Only return groups with these alert types (the alert key), e.g. ["OSG_ROGUE_DHCP_SERVER_DETECTED"]. Omit for all.'),
    enrich: z.boolean().default(true).describe('Match alert MACs/IPs against the current client and device lists. Unknown subjects stay unknown.'),
});

export function registerGroupSiteAlertsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'groupSiteAlerts',
        {
            description: `Read-only: read site alerts for a time window (default last 24 h, up to ${ALERT_MAX_PAGES * ALERT_PAGE_SIZE} alerts) and group them by alert key (e.g. OSG_ROGUE_DHCP_SERVER_DETECTED, OSG_IP_CONFLICT_DETECTED, OSG_WAN_DOWN) with count, first/last seen, severity and de-duplicated subjects parsed from the messages (rogue DHCP server IP+MAC, conflicting IP and client MACs, WAN port). Each subject is matched to the current client/device list by exact MAC or IP (name, vendor, SSID, connected AP/switch/gateway); unmatched subjects are reported as unknown, never guessed. 'truncated' is true when the cap was hit.`,
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('groupSiteAlerts', async ({ siteId, customHeaders, windowHours, alertTypes, enrich }) => {
            const resolvedSiteId = await client.resolveSiteId(siteId);
            const endTime = Date.now();
            const startTime = endTime - windowHours * 60 * 60 * 1000;
            const fetched = await fetchAlertsInWindow(client, resolvedSiteId, startTime, endTime, customHeaders);
            const wanted = alertTypes ? new Set(alertTypes.map((type) => type.toUpperCase())) : undefined;
            const groups = groupAlerts(fetched.alerts).filter((group) => !wanted || wanted.has(group.alertType.toUpperCase()));

            const unavailable: Array<{ section: string; error: string }> = [];
            let enrichedGroups: unknown = groups;
            if (enrich && groups.some((group) => group.subjects.length > 0)) {
                const [clients, devices] = await Promise.all([
                    readSection(() => client.listClients(resolvedSiteId, customHeaders)),
                    readSection(() => client.listDevices(resolvedSiteId, customHeaders)),
                ]);
                if (!clients.ok) unavailable.push({ section: 'clients', error: clients.error });
                if (!devices.ok) unavailable.push({ section: 'devices', error: devices.error });
                if (clients.ok || devices.ok) {
                    const index = buildInventoryIndex(clients.ok ? clients.value : [], devices.ok ? devices.value : []);
                    enrichedGroups = enrichGroups(groups, index);
                }
            }

            return toToolResult({
                siteId: resolvedSiteId,
                observedAt: new Date(endTime).toISOString(),
                window: { start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString(), hours: windowHours },
                totalRows: fetched.totalRows,
                alertsRead: fetched.alerts.length,
                pagesRead: fetched.pagesRead,
                truncated: fetched.truncated,
                groupCount: groups.length,
                groups: enrichedGroups,
                unavailable,
                interpretation: [
                    'Subjects are parsed from alert text. identity is an exact MAC (or, without a MAC, IP) match against the current client/device list; absent means unknown.',
                    'currentIpHolder is the record currently using that IP with a different MAC; it is not proof it caused the alert.',
                    'The client list only contains currently connected clients, so a subject that has left the network is unknown.',
                ],
            });
        })
    );
}
