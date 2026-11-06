import type { OmadaClient } from '../omadaClient/index.js';
import type { CustomHeaders } from '../types/index.js';

/** Alerts are read in pages of this size (the Open API accepts 1-1000). */
export const ALERT_PAGE_SIZE = 500;
/** At most this many alert pages are read per call, so at most 2,000 alerts. */
export const ALERT_MAX_PAGES = 4;
/** Subjects listed per alert group; the rest are counted in `subjectsOmitted`. */
export const MAX_SUBJECTS_PER_GROUP = 20;

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AlertRecord {
    key: string;
    module?: string;
    content: string;
    time?: number;
    level?: string;
}

export interface AlertFetchResult {
    alerts: AlertRecord[];
    totalRows?: number;
    pagesRead: number;
    /** True when the page cap stopped the read or the controller advertised more rows than were read. */
    truncated: boolean;
}

export interface AlertSubject {
    role: 'rogue-dhcp-server' | 'conflicting-client' | 'wan-port' | 'mentioned';
    ip?: string;
    mac?: string;
    port?: string;
    occurrences: number;
}

export interface AlertGroup {
    /** The alert's `key` (e.g. OSG_WAN_DOWN). Named alertType so result redaction of `key` fields leaves it readable. */
    alertType: string;
    module?: string;
    severity?: string;
    count: number;
    firstSeen?: string;
    lastSeen?: string;
    /** Devices that reported the alert (e.g. the gateway), from `[gateway:MAC]` prefixes. */
    reporters: string[];
    latestMessage: string;
    subjects: AlertSubject[];
    subjectsOmitted: number;
}

export interface ConnectionInfo {
    type: string;
    name?: string;
    mac?: string;
    port?: unknown;
}

export interface SubjectIdentity {
    source: 'client' | 'device';
    matchedBy: 'mac' | 'ip';
    mac?: string;
    ip?: string;
    name?: string;
    hostName?: string;
    vendor?: string;
    deviceType?: string;
    model?: string;
    ssid?: string;
    connectedTo?: ConnectionInfo;
}

export interface EnrichedSubject extends AlertSubject {
    /** The current client or device record with this MAC (or this IP when the alert has no MAC). Absent when unknown. */
    identity?: SubjectIdentity;
    /** The client or device currently using this IP when it is a different MAC from the subject. */
    currentIpHolder?: SubjectIdentity;
    known: boolean;
}

export interface EnrichedAlertGroup extends Omit<AlertGroup, 'subjects'> {
    subjects: EnrichedSubject[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalise a MAC address to `AA-BB-CC-DD-EE-FF`. Accepts `:` or `-` separators and the
 * sign-extended octets some controller messages contain (`FFFFFFF4:28:53:FFFFFFDE:...`): only the
 * last two hex digits of each octet are kept. Returns undefined for anything that is not six octets.
 */
export function normaliseMac(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const parts = raw.trim().split(/[:-]/);
    if (parts.length !== 6) return undefined;
    const octets: string[] = [];
    for (const part of parts) {
        if (!/^[0-9A-Fa-f]{1,8}$/.test(part)) return undefined;
        octets.push(part.slice(-2).padStart(2, '0').toUpperCase());
    }
    return octets.join('-');
}

const IPV4 = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}`;
const MAC_TOKEN = String.raw`[0-9A-Fa-f]{1,8}(?:[:-][0-9A-Fa-f]{1,8}){5}`;

/** Parse the affected subjects (IPs, MACs, WAN ports) out of an alert message. */
export function parseAlertSubjects(key: string, content: string): Array<Omit<AlertSubject, 'occurrences'>> {
    const upperKey = key.toUpperCase();
    // Drop the reporter prefix such as "[gateway:AA-BB-...]" so the reporting device is not a subject.
    const body = content.replace(new RegExp(String.raw`\[(?:gateway|switch|ap|eap|osg|device)\s*:\s*${MAC_TOKEN}\]`, 'gi'), ' ');

    if (upperKey.includes('ROGUE_DHCP')) {
        const ip = new RegExp(String.raw`ip\s*:\s*(${IPV4})`, 'i').exec(body)?.[1];
        const mac = normaliseMac(new RegExp(String.raw`mac\s*:\s*(${MAC_TOKEN})`, 'i').exec(body)?.[1]);
        return ip || mac ? [{ role: 'rogue-dhcp-server', ...(ip ? { ip } : {}), ...(mac ? { mac } : {}) }] : [];
    }
    if (upperKey.includes('IP_CONFLICT')) {
        const ip = new RegExp(String.raw`conflict\w*\s+ip\s*:?\s*(${IPV4})`, 'i').exec(body)?.[1];
        const macs = [...body.matchAll(new RegExp(String.raw`client\s*\[\s*(${MAC_TOKEN})\s*\]`, 'gi'))]
            .map((match) => normaliseMac(match[1]))
            .filter((mac): mac is string => mac !== undefined);
        if (macs.length === 0) return ip ? [{ role: 'conflicting-client', ip }] : [];
        return macs.map((mac) => ({ role: 'conflicting-client' as const, mac, ...(ip ? { ip } : {}) }));
    }
    if (upperKey.includes('WAN')) {
        const port = /\[\s*(WAN\s*\d*)\s*\]/i.exec(body)?.[1];
        if (port) return [{ role: 'wan-port', port: port.replace(/\s+/g, '').toUpperCase() }];
    }
    const subjects: Array<Omit<AlertSubject, 'occurrences'>> = [];
    for (const match of body.matchAll(new RegExp(MAC_TOKEN, 'g'))) {
        const mac = normaliseMac(match[0]);
        if (mac) subjects.push({ role: 'mentioned', mac });
    }
    for (const match of body.matchAll(new RegExp(String.raw`(?<![\d.])${IPV4}(?![\d.])`, 'g'))) {
        subjects.push({ role: 'mentioned', ip: match[0] });
    }
    return subjects;
}

function reportersOf(content: string): string[] {
    return [...content.matchAll(new RegExp(String.raw`\[(?:gateway|switch|ap|eap|osg|device)\s*:\s*(${MAC_TOKEN})\]`, 'gi'))]
        .map((match) => normaliseMac(match[1]))
        .filter((mac): mac is string => mac !== undefined);
}

export function toAlertRecord(value: unknown): AlertRecord | undefined {
    if (!isRecord(value)) return undefined;
    const key = asString(value.key);
    const content = typeof value.content === 'string' ? value.content : undefined;
    if (!key || content === undefined) return undefined;
    return { key, content, module: asString(value.module), time: asNumber(value.time), level: asString(value.level) };
}

/** Read every alert page in a millisecond window, bounded by ALERT_MAX_PAGES. */
export async function fetchAlertsInWindow(
    client: Pick<OmadaClient, 'listSiteAlerts'>,
    siteId: string,
    startTime: number,
    endTime: number,
    customHeaders?: CustomHeaders,
    limits: { pageSize?: number; maxPages?: number } = {}
): Promise<AlertFetchResult> {
    const pageSize = limits.pageSize ?? ALERT_PAGE_SIZE;
    const maxPages = limits.maxPages ?? ALERT_MAX_PAGES;
    const alerts: AlertRecord[] = [];
    let totalRows: number | undefined;
    let pagesRead = 0;
    let lastPageFull = false;
    for (let page = 1; page <= maxPages; page++) {
        const result: unknown = await client.listSiteAlerts({ page, pageSize, startTime, endTime }, siteId, customHeaders);
        if (!isRecord(result) || !Array.isArray(result.data)) throw new Error('Unexpected alert page shape: missing data array.');
        pagesRead++;
        totalRows = asNumber(result.totalRows) ?? totalRows;
        for (const entry of result.data) {
            const alert = toAlertRecord(entry);
            if (alert) alerts.push(alert);
        }
        lastPageFull = result.data.length >= pageSize;
        if (!lastPageFull) break;
        if (totalRows !== undefined && page * pageSize >= totalRows) {
            lastPageFull = false;
            break;
        }
    }
    const truncated = lastPageFull || (totalRows !== undefined && totalRows > pagesRead * pageSize);
    return { alerts, totalRows, pagesRead, truncated };
}

function iso(ms: number | undefined): string | undefined {
    return ms === undefined ? undefined : new Date(ms).toISOString();
}

function subjectKey(subject: Omit<AlertSubject, 'occurrences'>): string {
    return `${subject.role}|${subject.ip ?? ''}|${subject.mac ?? ''}|${subject.port ?? ''}`;
}

/** Group alerts by key, newest message last-seen, subjects de-duplicated with an occurrence count. */
export function groupAlerts(alerts: AlertRecord[], maxSubjects = MAX_SUBJECTS_PER_GROUP): AlertGroup[] {
    const groups = new Map<
        string,
        { group: AlertGroup; first?: number; last?: number; subjects: Map<string, AlertSubject>; reporters: Set<string> }
    >();
    for (const alert of alerts) {
        let entry = groups.get(alert.key);
        if (!entry) {
            entry = {
                group: {
                    alertType: alert.key,
                    module: alert.module,
                    severity: alert.level,
                    count: 0,
                    reporters: [],
                    latestMessage: alert.content,
                    subjects: [],
                    subjectsOmitted: 0,
                },
                subjects: new Map(),
                reporters: new Set(),
            };
            groups.set(alert.key, entry);
        }
        entry.group.count++;
        if (alert.time !== undefined) {
            if (entry.first === undefined || alert.time < entry.first) entry.first = alert.time;
            if (entry.last === undefined || alert.time >= entry.last) {
                entry.last = alert.time;
                entry.group.latestMessage = alert.content;
                entry.group.severity = alert.level ?? entry.group.severity;
            }
        }
        for (const reporter of reportersOf(alert.content)) entry.reporters.add(reporter);
        for (const subject of parseAlertSubjects(alert.key, alert.content)) {
            const id = subjectKey(subject);
            const existing = entry.subjects.get(id);
            if (existing) existing.occurrences++;
            else entry.subjects.set(id, { ...subject, occurrences: 1 });
        }
    }
    return [...groups.values()]
        .map(({ group, first, last, subjects, reporters }) => {
            const sorted = [...subjects.values()].sort((a, b) => b.occurrences - a.occurrences);
            return {
                ...group,
                firstSeen: iso(first),
                lastSeen: iso(last),
                reporters: [...reporters],
                subjects: sorted.slice(0, maxSubjects),
                subjectsOmitted: Math.max(0, sorted.length - maxSubjects),
            };
        })
        .sort((a, b) => b.count - a.count || a.alertType.localeCompare(b.alertType));
}

/** Lookup tables over the current client and device lists; MACs are normalised. */
export interface InventoryIndex {
    byMac: Map<string, SubjectIdentity>;
    byIp: Map<string, SubjectIdentity>;
}

function connectionOf(record: Record<string, unknown>): ConnectionInfo | undefined {
    const port = record.port ?? record.portName;
    if (asString(record.apMac) || asString(record.apName))
        return { type: 'ap', name: asString(record.apName), mac: normaliseMac(record.apMac), ...(port !== undefined ? { port } : {}) };
    if (asString(record.switchMac) || asString(record.switchName))
        return { type: 'switch', name: asString(record.switchName), mac: normaliseMac(record.switchMac), ...(port !== undefined ? { port } : {}) };
    if (asString(record.gatewayMac) || asString(record.gatewayName))
        return { type: 'gateway', name: asString(record.gatewayName), mac: normaliseMac(record.gatewayMac), ...(port !== undefined ? { port } : {}) };
    return undefined;
}

/** Controllers fill `name` with the MAC when no alias is set; that is not a name. */
function realName(value: unknown, mac: string | undefined): string | undefined {
    const name = asString(value);
    if (!name) return undefined;
    return mac !== undefined && normaliseMac(name) === mac ? undefined : name;
}

function knownValue(value: unknown): string | undefined {
    const text = asString(value);
    return text && text.toLowerCase() !== 'unknown' ? text : undefined;
}

function withoutUndefined<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function clientIdentity(record: Record<string, unknown>): Omit<SubjectIdentity, 'matchedBy'> {
    const mac = normaliseMac(record.mac);
    return withoutUndefined({
        source: 'client' as const,
        mac,
        ip: asString(record.ip),
        name: realName(record.name, mac),
        hostName: realName(record.hostName, mac),
        vendor: knownValue(record.vendor),
        deviceType: knownValue(record.deviceType),
        ssid: asString(record.ssid),
        connectedTo: connectionOf(record),
    });
}

export function deviceIdentity(record: Record<string, unknown>): Omit<SubjectIdentity, 'matchedBy'> {
    const mac = normaliseMac(record.mac);
    return withoutUndefined({
        source: 'device' as const,
        mac,
        ip: asString(record.ip),
        name: realName(record.name, mac),
        deviceType: asString(record.type),
        model: asString(record.model),
    });
}

export function buildInventoryIndex(clients: unknown, devices: unknown): InventoryIndex {
    const byMac = new Map<string, SubjectIdentity>();
    const byIp = new Map<string, SubjectIdentity>();
    const add = (identity: Omit<SubjectIdentity, 'matchedBy'>) => {
        if (identity.mac && !byMac.has(identity.mac)) byMac.set(identity.mac, { ...identity, matchedBy: 'mac' });
        if (identity.ip && !byIp.has(identity.ip)) byIp.set(identity.ip, { ...identity, matchedBy: 'ip' });
    };
    // Devices first: a gateway or AP IP must not be attributed to a client record.
    if (Array.isArray(devices)) for (const record of devices) if (isRecord(record)) add(deviceIdentity(record));
    if (Array.isArray(clients)) for (const record of clients) if (isRecord(record)) add(clientIdentity(record));
    return { byMac, byIp };
}

/** Match subjects to current records. Only exact MAC or IP matches are reported; nothing is inferred. */
export function enrichSubject(subject: AlertSubject, index: InventoryIndex): EnrichedSubject {
    const enriched: EnrichedSubject = { ...subject, known: false };
    const macMatch = subject.mac ? index.byMac.get(subject.mac) : undefined;
    const ipMatch = subject.ip ? index.byIp.get(subject.ip) : undefined;
    if (macMatch) enriched.identity = macMatch;
    else if (ipMatch && !subject.mac) enriched.identity = ipMatch;
    if (ipMatch && subject.mac && ipMatch.mac !== subject.mac) enriched.currentIpHolder = ipMatch;
    enriched.known = enriched.identity !== undefined;
    return enriched;
}

export function enrichGroups(groups: AlertGroup[], index: InventoryIndex): EnrichedAlertGroup[] {
    return groups.map((group) => ({ ...group, subjects: group.subjects.map((subject) => enrichSubject(subject, index)) }));
}

export type SectionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Run one read; a failure becomes an unavailable section instead of failing the caller. */
export async function readSection<T>(read: () => Promise<T>): Promise<SectionResult<T>> {
    try {
        return { ok: true, value: await read() };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
