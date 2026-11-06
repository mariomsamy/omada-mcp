import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { compactWifiSections, diagnosticCompleteness, readDiagnosticSection, wifiFindings } from '../utils/diagnostics.js';

export function registerGetWifiHealthSummaryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getWifiHealthSummary',
        {
            description:
                'Read-only Wi-Fi diagnostic evidence: dashboard, channels, interference and retry/drop history. detail="summary" (default) keeps findings, per-AP retry/drop averages and utilisation of occupied channels; detail="full" adds the raw five-minute time series and empty channels. Missing evidence stays unknown; no scan or radio change is initiated.',
            inputSchema: siteInputSchema.extend({
                windowMinutes: z.number().int().min(1).max(1440).default(60),
                detail: z
                    .enum(['summary', 'full'])
                    .default('summary')
                    .describe(
                        'summary (default): compact per-AP averages and occupied channels only. full: raw controller payload including time series.'
                    ),
            }).shape,
        },
        wrapToolHandler('getWifiHealthSummary', async ({ siteId, customHeaders, windowMinutes, detail }) => {
            const resolvedSiteId = await client.resolveSiteId(siteId);
            const end = Math.floor(Date.now() / 1000);
            const start = end - windowMinutes * 60;
            const [dashboard, channels, interference, retries] = await Promise.all([
                readDiagnosticSection(() => client.getDashboardWifiSummary(resolvedSiteId, customHeaders, { start, end })),
                readDiagnosticSection(() => client.getChannels(resolvedSiteId, customHeaders)),
                readDiagnosticSection(() => client.getInterference(resolvedSiteId, customHeaders)),
                readDiagnosticSection(() => client.getRetryAndDroppedRate(resolvedSiteId, start, end, customHeaders)),
            ]);
            const sections = { dashboard, channels, interference, retries };
            return toToolResult({
                siteId: resolvedSiteId,
                window: { start, end, unit: 'unix-seconds', appliesTo: ['dashboard', 'retries'] },
                detail,
                ...diagnosticCompleteness(sections),
                sections: detail === 'full' ? sections : compactWifiSections(sections),
                findings: wifiFindings(sections),
                findingLimit: 10,
                findingPolicy: 'Heuristics for review, not a health score. No findings does not establish healthy Wi-Fi.',
                interpretation: [
                    'The requested window applies to dashboard and retry history. Channels and interference use controller-defined observation windows.',
                    'Busy airtime or retries can have several causes. Correlate signal, traffic and uplink evidence before attributing interference.',
                    'A channel change alone does not establish radar; confirm with controller events.',
                    ...(detail === 'full'
                        ? []
                        : [
                              'Summary detail: retry/drop series are reduced to per-AP samples, mean, max and latest rate (percent); channels without APs or clients are omitted. Call again with detail="full" for the raw series.',
                          ]),
                ],
                nextTools: ['diagnoseClient', 'getApRadios', 'getSitesApsAvailableChannel', 'diagnoseLogs'],
            });
        })
    );
}
