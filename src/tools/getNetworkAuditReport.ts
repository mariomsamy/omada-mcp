import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import type { CustomHeaders } from '../types/index.js';
import {
    type AlertFetchResult,
    asNumber,
    buildInventoryIndex,
    type EnrichedAlertGroup,
    type EnrichedSubject,
    enrichGroups,
    fetchAlertsInWindow,
    groupAlerts,
    isRecord,
    normaliseMac,
    readSection,
    type SectionResult,
    type Severity,
} from './networkAuditShared.js';

/** Review thresholds. They are heuristics for prioritising, not a definition of healthy. */
export const RETRY_AVG_HIGH_PERCENT = 10;
export const RETRY_AVG_MEDIUM_PERCENT = 5;
export const DROP_AVG_MEDIUM_PERCENT = 1;
export const CHANNEL_UTILIZATION_BUSY_PERCENT = 70;
export const WAN_LOSS_MEDIUM_PERCENT = 5;
export const WAN_LATENCY_LOW_MS = 150;
export const MAX_FINDINGS = 25;
export const MAX_EVIDENCE_SUBJECTS = 5;
/** Score penalty per finding severity; the score is omitted when too much evidence is missing. */
export const SEVERITY_PENALTY: Record<Severity, number> = { critical: 25, high: 12, medium: 6, low: 2, info: 0 };
export const SCORE_MAX_UNAVAILABLE_SECTIONS = 2;

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface AuditFinding {
    severity: Severity;
    area: string;
    title: string;
    evidence: Record<string, unknown>;
    recommendation: string;
}

const inputSchema = siteInputSchema.extend({
    alertWindowHours: z.number().int().min(1).max(168).default(24).describe('Alert history window in hours (1-168). Default 24.'),
    wifiWindowMinutes: z.number().int().min(5).max(1440).default(60).describe('Retry/drop history window in minutes (5-1440). Default 60.'),
});

type Rec = Record<string, unknown>;

function records(value: unknown): Rec[] {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Omada device status 1 is connected; anything else (0 disconnected, pending, heartbeat missed, isolated) is not. */
function isConnected(device: Rec): boolean {
    return device.status === 1;
}

function deviceLabel(device: Rec): string {
    return text(device.name) ?? normaliseMac(device.mac) ?? 'unknown device';
}

function nameState(device: Rec): 'unnamed' | 'default' | 'custom' {
    const mac = normaliseMac(device.mac);
    const name = text(device.name);
    if (!name || (mac && normaliseMac(name) === mac)) return 'unnamed';
    if (mac && name.toUpperCase().endsWith(` - ${mac}`)) return 'default';
    return 'custom';
}

function subjectEvidence(subject: EnrichedSubject): Rec {
    const identity = subject.identity;
    return {
        ...(subject.ip ? { ip: subject.ip } : {}),
        ...(subject.mac ? { mac: subject.mac } : {}),
        seen: subject.occurrences,
        identity: identity
            ? {
                  source: identity.source,
                  name: identity.name ?? identity.hostName,
                  vendor: identity.vendor,
                  ssid: identity.ssid,
                  connectedTo: identity.connectedTo
                      ? [
                            identity.connectedTo.type,
                            identity.connectedTo.name ?? identity.connectedTo.mac,
                            identity.connectedTo.port === undefined ? undefined : `port ${String(identity.connectedTo.port)}`,
                        ]
                            .filter((part) => part !== undefined)
                            .join(' ')
                      : undefined,
              }
            : 'unknown (not in current client/device list)',
        ...(subject.currentIpHolder
            ? { currentIpHolder: { mac: subject.currentIpHolder.mac, name: subject.currentIpHolder.name ?? subject.currentIpHolder.hostName } }
            : {}),
    };
}

function bandOf(radioId: unknown): '2.4GHz' | '5GHz' | '6GHz' | 'unknown' {
    if (radioId === 0) return '2.4GHz';
    if (radioId === 1 || radioId === 2) return '5GHz';
    if (radioId === 3) return '6GHz';
    return 'unknown';
}

interface ApRadioUse {
    name?: string;
    clients2g: number;
    clients5g: number;
    has5g: boolean;
    util2g?: number;
    util5g?: number;
}

/** Per-AP client counts and utilisation from getChannels (`channels2g` / `channels5g` / `channels6g`). */
function apRadioUse(channels: unknown): Map<string, ApRadioUse> {
    const result = new Map<string, ApRadioUse>();
    if (!isRecord(channels)) return result;
    for (const [field, band] of [
        ['channels2g', '2g'],
        ['channels5g', '5g'],
    ] as const) {
        for (const channel of records(channels[field])) {
            for (const ap of records(channel.apWithClientInfoList)) {
                const mac = normaliseMac(ap.mac);
                if (!mac) continue;
                const entry = result.get(mac) ?? { name: text(ap.name), clients2g: 0, clients5g: 0, has5g: false };
                const clients = asNumber(ap.clientNum) ?? 0;
                const util = asNumber(ap.channelUtilization);
                if (band === '2g') {
                    entry.clients2g += clients;
                    entry.util2g = util ?? entry.util2g;
                } else {
                    entry.clients5g += clients;
                    entry.has5g = true;
                    entry.util5g = util ?? entry.util5g;
                }
                result.set(mac, entry);
            }
        }
    }
    return result;
}

function averages(value: unknown, field: 'retryEaps' | 'droppedEaps'): Map<string, { name?: string; avg: number }> {
    const result = new Map<string, { name?: string; avg: number }>();
    if (!isRecord(value)) return result;
    for (const ap of records(value[field])) {
        const mac = normaliseMac(ap.apMac);
        const avg = asNumber(ap.avg);
        if (mac && avg !== undefined) result.set(mac, { name: text(ap.name), avg });
    }
    return result;
}

interface WanPortState {
    gateway: string;
    port: string;
    status?: unknown;
    internetState?: unknown;
    ip?: string;
    loss?: number;
    latency?: number;
    rxErrorPkts?: number;
    txErrorPkts?: number;
}

/** A port is down only on an observed non-1 link or internet state; missing fields are not evidence either way. */
function isWanDown(port: WanPortState): boolean {
    return (port.status !== undefined && port.status !== 1) || (port.internetState !== undefined && port.internetState !== 1);
}

async function readWan(client: OmadaClient, siteId: string, gateways: Rec[], customHeaders?: CustomHeaders): Promise<SectionResult<WanPortState[]>> {
    if (gateways.length === 0) return { ok: false, error: 'No gateway in the device list.' };
    const ports: WanPortState[] = [];
    const errors: string[] = [];
    for (const gateway of gateways) {
        const mac = normaliseMac(gateway.mac);
        if (!mac) continue;
        const status = await readSection(() => client.getGatewayWanStatus(mac, siteId, customHeaders));
        if (!status.ok) {
            errors.push(`${deviceLabel(gateway)}: ${status.error}`);
            continue;
        }
        for (const port of records(status.value)) {
            ports.push({
                gateway: deviceLabel(gateway),
                port: text(port.name) ?? `port ${String(port.port ?? '?')}`,
                status: port.status,
                internetState: port.internetState,
                ip: text(port.ip),
                loss: asNumber(port.loss),
                latency: asNumber(port.latency),
                rxErrorPkts: asNumber(port.rxErrorPkts),
                txErrorPkts: asNumber(port.txErrorPkts),
            });
        }
    }
    if (ports.length === 0 && errors.length > 0) return { ok: false, error: errors.join('; ') };
    return { ok: true, value: ports };
}

function finding(severity: Severity, area: string, title: string, evidence: Rec, recommendation: string): AuditFinding {
    return { severity, area, title, evidence, recommendation };
}

function alertFindings(groups: EnrichedAlertGroup[], wan: WanPortState[] | undefined): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const other: Rec[] = [];
    for (const group of groups) {
        const key = group.alertType.toUpperCase();
        const base = { alertType: group.alertType, count: group.count, firstSeen: group.firstSeen, lastSeen: group.lastSeen };
        const subjects = group.subjects.slice(0, MAX_EVIDENCE_SUBJECTS).map(subjectEvidence);
        if (key.includes('ROGUE_DHCP')) {
            findings.push(
                finding(
                    'high',
                    'lan',
                    'Rogue DHCP server detected',
                    { ...base, servers: subjects },
                    'Find the device answering DHCP (MAC above; check the switch port / AP it is on) and disable its DHCP server or put it in bridge/AP mode. Consider DHCP snooping or IP-MAC binding.'
                )
            );
        } else if (key.includes('IP_CONFLICT')) {
            findings.push(
                finding(
                    'medium',
                    'lan',
                    'IP address conflicts',
                    { ...base, conflicts: subjects },
                    'Give the affected clients DHCP reservations or move static IPs out of the DHCP pool. A rogue DHCP server is a common cause.'
                )
            );
        } else if (key.includes('WAN') && key.includes('DOWN')) {
            const currentlyDown = (wan ?? []).filter(isWanDown).map((port) => port.port);
            findings.push(
                finding(
                    'high',
                    'wan',
                    'WAN down events in the alert window',
                    {
                        ...base,
                        ports: group.subjects.map((subject) => subject.port).filter((port) => port !== undefined),
                        currentlyDown: wan ? currentlyDown : 'unknown',
                    },
                    'Correlate with ISP outages and the gateway WAN health history; if repeated, check the modem/ONT, cabling and PPPoE session limits, and consider a failover WAN.'
                )
            );
        } else {
            other.push({ alertType: group.alertType, count: group.count, severity: group.severity, lastSeen: group.lastSeen });
        }
    }
    if (other.length > 0)
        findings.push(
            finding(
                'low',
                'alerts',
                'Other alert types in the window',
                { groups: other.slice(0, 10) },
                'Review with groupSiteAlerts and listSiteAlerts.'
            )
        );
    return findings;
}

function severityRank(severity: Severity): number {
    return SEVERITY_ORDER.indexOf(severity);
}

export function registerGetNetworkAuditReportTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getNetworkAuditReport',
        {
            description:
                'Read-only prioritised network audit in one call. Composes devices, gateway WAN status, client summary, grouped and enriched site alerts, rogue APs, IPS config, pending devices, per-AP Wi-Fi retry/drop averages and channel utilisation into { observedAt, score, findings[severity, area, title, evidence, recommendation], sections, unavailable }. Each sub-read degrades independently into `unavailable`. Thresholds are review heuristics. No writes and no scans.',
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('getNetworkAuditReport', async ({ siteId, customHeaders, alertWindowHours, wifiWindowMinutes }) => {
            const resolvedSiteId = await client.resolveSiteId(siteId);
            const nowMs = Date.now();
            const endSec = Math.floor(nowMs / 1000);
            const [devices, clients, alerts, rogueAps, ips, pending, retries, channels] = await Promise.all([
                readSection(() => client.listDevices(resolvedSiteId, customHeaders)),
                readSection(() => client.listClients(resolvedSiteId, customHeaders)),
                readSection<AlertFetchResult>(() =>
                    fetchAlertsInWindow(client, resolvedSiteId, nowMs - alertWindowHours * 3_600_000, nowMs, customHeaders)
                ),
                readSection(() => client.getRogueAps(resolvedSiteId, customHeaders)),
                readSection(() => client.getIpsConfig(resolvedSiteId, customHeaders)),
                readSection(() => client.listPendingDevices(resolvedSiteId, customHeaders)),
                readSection(() => client.getRetryAndDroppedRate(resolvedSiteId, endSec - wifiWindowMinutes * 60, endSec, customHeaders)),
                readSection(() => client.getChannels(resolvedSiteId, customHeaders)),
            ]);
            const deviceList = devices.ok ? records(devices.value) : [];
            const wan: SectionResult<WanPortState[]> = devices.ok
                ? await readWan(
                      client,
                      resolvedSiteId,
                      deviceList.filter((device) => device.type === 'gateway'),
                      customHeaders
                  )
                : { ok: false, error: 'Device list unavailable, so gateways are unknown.' };

            const unavailable: Array<{ section: string; error: string }> = [];
            for (const [section, result] of Object.entries({ devices, clients, alerts, wan, rogueAps, ips, pending, retries, channels })) {
                if (!result.ok) unavailable.push({ section, error: result.error });
            }

            const findings: AuditFinding[] = [];
            const sections: Rec = {};

            // Devices
            if (devices.ok) {
                const offline = deviceList.filter((device) => !isConnected(device));
                const byType: Record<string, number> = {};
                for (const device of deviceList) byType[text(device.type) ?? 'unknown'] = (byType[text(device.type) ?? 'unknown'] ?? 0) + 1;
                const naming = deviceList.map((device) => ({ device, state: nameState(device) }));
                sections.devices = { total: deviceList.length, byType, notConnected: offline.map(deviceLabel) };
                for (const device of offline)
                    findings.push(
                        finding(
                            'high',
                            'devices',
                            `Device not connected: ${deviceLabel(device)}`,
                            { mac: normaliseMac(device.mac), type: device.type, model: device.model, status: device.status },
                            'Check power/PoE and uplink, then the device event log (diagnoseLogs).'
                        )
                    );
                const unnamed = naming.filter((entry) => entry.state === 'unnamed').map((entry) => deviceLabel(entry.device));
                const defaults = naming.filter((entry) => entry.state === 'default').map((entry) => deviceLabel(entry.device));
                if (unnamed.length > 0)
                    findings.push(
                        finding(
                            'low',
                            'inventory',
                            'Devices without a name',
                            { devices: unnamed },
                            'Give each device a location-based name so alerts and reports are readable.'
                        )
                    );
                if (defaults.length > 0)
                    findings.push(
                        finding(
                            'info',
                            'inventory',
                            'Devices with default "<type> - <MAC>" names',
                            { devices: defaults },
                            'Optionally rename them to role/location names.'
                        )
                    );
            }

            // WAN
            if (wan.ok) {
                sections.wan = wan.value;
                for (const port of wan.value) {
                    if (isWanDown(port))
                        findings.push(
                            finding(
                                'critical',
                                'wan',
                                `WAN not online: ${port.gateway} ${port.port}`,
                                { status: port.status, internetState: port.internetState },
                                'Check the ISP link, modem/ONT and WAN credentials.'
                            )
                        );
                    if ((port.loss ?? 0) > WAN_LOSS_MEDIUM_PERCENT)
                        findings.push(
                            finding(
                                'medium',
                                'wan',
                                `WAN packet loss on ${port.port}`,
                                { loss: port.loss, threshold: WAN_LOSS_MEDIUM_PERCENT },
                                'Check the line quality with the ISP.'
                            )
                        );
                    if ((port.latency ?? 0) > WAN_LATENCY_LOW_MS)
                        findings.push(
                            finding(
                                'low',
                                'wan',
                                `High WAN latency on ${port.port}`,
                                { latencyMs: port.latency, threshold: WAN_LATENCY_LOW_MS },
                                'Compare with speed tests and ISP status.'
                            )
                        );
                    if ((port.rxErrorPkts ?? 0) > 0 || (port.txErrorPkts ?? 0) > 0)
                        findings.push(
                            finding(
                                'low',
                                'wan',
                                `WAN interface errors on ${port.port}`,
                                { rxErrorPkts: port.rxErrorPkts, txErrorPkts: port.txErrorPkts },
                                'Check the WAN cable and the negotiated speed/duplex.'
                            )
                        );
                }
            }

            // Clients
            if (clients.ok) {
                const list = records(clients.value);
                const byBand: Record<string, number> = {};
                const bySsid: Record<string, number> = {};
                let wireless = 0;
                for (const entry of list) {
                    if (entry.wireless !== true) continue;
                    wireless++;
                    const band = bandOf(entry.radioId);
                    byBand[band] = (byBand[band] ?? 0) + 1;
                    const ssid = text(entry.ssid) ?? 'unknown';
                    bySsid[ssid] = (bySsid[ssid] ?? 0) + 1;
                }
                sections.clients = { total: list.length, wireless, wired: list.length - wireless, byBand, bySsid };
            }

            // Alerts (grouped and enriched)
            if (alerts.ok) {
                const index = buildInventoryIndex(clients.ok ? clients.value : [], devices.ok ? devices.value : []);
                const groups = enrichGroups(groupAlerts(alerts.value.alerts), index);
                sections.alerts = {
                    windowHours: alertWindowHours,
                    totalRows: alerts.value.totalRows,
                    read: alerts.value.alerts.length,
                    truncated: alerts.value.truncated,
                    groups: groups.map((group) => ({
                        alertType: group.alertType,
                        count: group.count,
                        severity: group.severity,
                        lastSeen: group.lastSeen,
                    })),
                };
                findings.push(...alertFindings(groups, wan.ok ? wan.value : undefined));
            }

            // Security
            const security: Rec = {};
            if (ips.ok) {
                const enabled = isRecord(ips.value) && typeof ips.value.enable === 'boolean' ? ips.value.enable : undefined;
                security.ipsEnabled = enabled ?? 'unknown';
                if (enabled === false)
                    findings.push(
                        finding(
                            'medium',
                            'security',
                            'IPS is disabled',
                            { enable: false },
                            'Enable IPS on the gateway if its throughput headroom allows (check CPU after enabling).'
                        )
                    );
            }
            if (rogueAps.ok) {
                const list = records(rogueAps.value);
                security.rogueApCount = list.length;
                if (list.length > 0)
                    findings.push(
                        finding(
                            'medium',
                            'security',
                            'Rogue access points detected',
                            {
                                count: list.length,
                                sample: list
                                    .slice(0, MAX_EVIDENCE_SUBJECTS)
                                    .map((ap) => ({ ssid: ap.ssid, bssid: ap.bssid ?? ap.mac, channel: ap.channel })),
                            },
                            'Check whether any are on your wired network (getRogueAps / getWids) and remove or block them.'
                        )
                    );
            }
            if (Object.keys(security).length > 0) sections.security = security;

            if (pending.ok) {
                const list = records(pending.value);
                sections.pendingDevices = list.length;
                if (list.length > 0)
                    findings.push(
                        finding(
                            'low',
                            'devices',
                            'Devices waiting for adoption',
                            {
                                devices: list
                                    .slice(0, MAX_EVIDENCE_SUBJECTS)
                                    .map((device) => ({ mac: device.mac, model: device.model, ip: device.ip })),
                            },
                            'Adopt them if they are yours (adoptDevice); otherwise find out why they are on the network.'
                        )
                    );
            }

            // Wi-Fi
            if (retries.ok || channels.ok) {
                const retryAvg = retries.ok ? averages(retries.value, 'retryEaps') : new Map<string, { name?: string; avg: number }>();
                const dropAvg = retries.ok ? averages(retries.value, 'droppedEaps') : new Map<string, { name?: string; avg: number }>();
                const radios = channels.ok ? apRadioUse(channels.value) : new Map<string, ApRadioUse>();
                const macs = new Set([...retryAvg.keys(), ...dropAvg.keys(), ...radios.keys()]);
                const aps: Rec[] = [];
                for (const mac of macs) {
                    const name = retryAvg.get(mac)?.name ?? radios.get(mac)?.name ?? mac;
                    const retry = retryAvg.get(mac)?.avg;
                    const drop = dropAvg.get(mac)?.avg;
                    const radio = radios.get(mac);
                    aps.push({
                        name,
                        retryAvgPercent: retry,
                        dropAvgPercent: drop,
                        clients2g: radio?.clients2g,
                        clients5g: radio?.clients5g,
                        util2gPercent: radio?.util2g,
                        util5gPercent: radio?.util5g,
                    });
                    if (retry !== undefined && retry > RETRY_AVG_MEDIUM_PERCENT) {
                        const high = retry > RETRY_AVG_HIGH_PERCENT;
                        findings.push(
                            finding(
                                high ? 'high' : 'medium',
                                'wifi',
                                `High Wi-Fi retry rate on ${name}`,
                                {
                                    retryAvgPercent: retry,
                                    threshold: high ? RETRY_AVG_HIGH_PERCENT : RETRY_AVG_MEDIUM_PERCENT,
                                    windowMinutes: wifiWindowMinutes,
                                },
                                'Check channel overlap and interference (getWifiHealthSummary), lower 2.4 GHz width to 20 MHz, and review client signal.'
                            )
                        );
                    }
                    if (drop !== undefined && drop > DROP_AVG_MEDIUM_PERCENT)
                        findings.push(
                            finding(
                                'medium',
                                'wifi',
                                `Wi-Fi packet drops on ${name}`,
                                { dropAvgPercent: drop, threshold: DROP_AVG_MEDIUM_PERCENT, windowMinutes: wifiWindowMinutes },
                                'Check AP load, uplink and weak clients.'
                            )
                        );
                    if (radio && radio.clients2g > 0 && radio.has5g && radio.clients5g === 0)
                        findings.push(
                            finding(
                                'low',
                                'wifi',
                                `All clients on 2.4 GHz while 5 GHz is idle on ${name}`,
                                { clients2g: radio.clients2g, clients5g: 0, util2gPercent: radio.util2g },
                                'Many IoT devices are 2.4 GHz only; for dual-band clients check band steering, 5 GHz SSID availability and 5 GHz power/coverage.'
                            )
                        );
                    for (const [band, util] of [
                        ['2.4 GHz', radio?.util2g],
                        ['5 GHz', radio?.util5g],
                    ] as const) {
                        if (util !== undefined && util >= CHANNEL_UTILIZATION_BUSY_PERCENT)
                            findings.push(
                                finding(
                                    'medium',
                                    'wifi',
                                    `Busy ${band} channel on ${name}`,
                                    { channelUtilizationPercent: util, threshold: CHANNEL_UTILIZATION_BUSY_PERCENT },
                                    'Check neighbouring networks and traffic demand before changing channel.'
                                )
                            );
                    }
                }
                sections.wifi = { windowMinutes: wifiWindowMinutes, aps };
            }

            findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
            const shown = findings.slice(0, MAX_FINDINGS);
            const score =
                unavailable.length > SCORE_MAX_UNAVAILABLE_SECTIONS
                    ? undefined
                    : Math.max(0, 100 - findings.reduce((total, entry) => total + SEVERITY_PENALTY[entry.severity], 0));
            const counts = Object.fromEntries(
                SEVERITY_ORDER.map((severity) => [severity, findings.filter((entry) => entry.severity === severity).length])
            );

            return toToolResult({
                siteId: resolvedSiteId,
                observedAt: new Date(nowMs).toISOString(),
                score,
                scorePolicy: `100 minus a per-finding penalty (${Object.entries(SEVERITY_PENALTY)
                    .map(([severity, penalty]) => `${severity} ${penalty}`)
                    .join(
                        ', '
                    )}); omitted when more than ${SCORE_MAX_UNAVAILABLE_SECTIONS} sections are unavailable. A high score does not prove a healthy network.`,
                findingCounts: counts,
                findingsOmitted: findings.length - shown.length,
                findings: shown,
                sections,
                unavailable,
                nextTools: ['groupSiteAlerts', 'getWifiHealthSummary', 'diagnoseClient', 'getSecurityOverview'],
            });
        })
    );
}
