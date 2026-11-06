import { redactSecrets } from './redact.js';

export interface DiagnosticSection {
    status: 'ok' | 'unavailable';
    observedAt: string;
    data?: unknown;
    error?: string;
}

/** A failed section is unknown, never an empty or healthy observation. */
export async function readDiagnosticSection(read: () => Promise<unknown>): Promise<DiagnosticSection> {
    try {
        return { status: 'ok', observedAt: new Date().toISOString(), data: redactSecrets(await read()) };
    } catch (error) {
        return { status: 'unavailable', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    }
}

export function diagnosticCompleteness(sections: Record<string, DiagnosticSection>): { complete: boolean; missing: string[] } {
    const missing = Object.entries(sections)
        .filter(([, section]) => section.status !== 'ok')
        .map(([name]) => name);
    return { complete: missing.length === 0, missing };
}

export function pageObservation(section: DiagnosticSection): string {
    if (section.status !== 'ok') return 'Unavailable; no conclusion about event activity is possible.';
    const data = section.data;
    if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).data))
        return 'Unexpected response shape; completeness is unknown.';
    const page = data as { data: unknown[]; totalRows?: number };
    if (page.data.length === 0)
        return page.totalRows && page.totalRows > 0
            ? 'Empty page conflicts with the advertised total; incomplete evidence.'
            : 'No records returned in this query window. This alone does not prove logging is enabled.';
    return `Returned ${page.data.length} records in the first page${typeof page.totalRows === 'number' ? ` of ${page.totalRows}` : '; total unknown'}.`;
}

export interface WifiFinding {
    kind: string;
    evidence: Record<string, unknown>;
    interpretation: string;
    nextTool: string;
}

/** Uses percentage fields documented in 07-monitor.json. Thresholds are review heuristics. */
export function wifiFindings(sections: Record<string, DiagnosticSection>): WifiFinding[] {
    const findings: WifiFinding[] = [];
    const dashboard = sections.dashboard?.data;
    if (dashboard && typeof dashboard === 'object') {
        const utilization = (dashboard as Record<string, unknown>).channelUtilization;
        if (typeof utilization === 'number' && utilization >= 70 && utilization <= 100) {
            findings.push({
                kind: 'busy-airtime',
                evidence: { field: 'channelUtilization', value: utilization, unit: 'percent', reviewThreshold: 70 },
                interpretation: 'Average airtime is busy. Check traffic demand and per-channel evidence; this alone does not identify interference.',
                nextTool: 'getChannels',
            });
        }
    }
    const interference = sections.interference?.data;
    if (interference && typeof interference === 'object') {
        for (const band of ['apInterference2g', 'apInterference5g', 'apInterference5g2', 'apInterference6g']) {
            const entries = (interference as Record<string, unknown>)[band];
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
                if (!entry || typeof entry !== 'object') continue;
                const record = entry as Record<string, unknown>;
                if (typeof record.interUtil === 'number' && record.interUtil >= 20 && record.interUtil <= 100) {
                    findings.push({
                        kind: 'reported-interference',
                        evidence: { band, apMac: record.mac, value: record.interUtil, unit: 'percent', reviewThreshold: 20 },
                        interpretation:
                            'The controller reports elevated interference on this radio. Correlate retries and signal before changing its channel.',
                        nextTool: 'getApRadios',
                    });
                }
            }
        }
    }
    return findings.slice(0, 10);
}

/** `summary` (default) drops raw time series and empty rows from composite diagnostics; `full` keeps the controller payload. */
export type DiagnosticDetail = 'summary' | 'full';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function withData(section: DiagnosticSection, compact: (data: Record<string, unknown>) => unknown): DiagnosticSection {
    const data = asRecord(section.data);
    if (section.status !== 'ok' || !data) return section;
    return { ...section, data: compact(data) };
}

export interface SeriesStats {
    samples: number;
    mean?: number;
    max?: number;
    latest?: number;
}

/** Mean, max and latest of one numeric field across a controller time series (two decimals). */
export function seriesStats(series: unknown, field: string): SeriesStats {
    const values = Array.isArray(series)
        ? series.map((point) => asRecord(point)?.[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : [];
    if (values.length === 0) return { samples: 0 };
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
        samples: values.length,
        mean: round(values.reduce((total, value) => total + value, 0) / values.length),
        max: round(Math.max(...values)),
        latest: round(values.at(-1) ?? 0),
    };
}

/** Per-AP retry/drop averages without the five-minute time series (07-monitor.json retry-dropped-rate). */
function compactRetries(data: Record<string, unknown>): Record<string, unknown> {
    const summarize = (entries: unknown, seriesField: string, rateField: string) =>
        Array.isArray(entries)
            ? entries.map((entry) => {
                  const { [seriesField]: series, ...rest } = asRecord(entry) ?? {};
                  return { ...rest, [`${rateField}Stats`]: seriesStats(series, rateField) };
              })
            : entries;
    return {
        ...data,
        retryEaps: summarize(data.retryEaps, 'retries', 'retryRate'),
        droppedEaps: summarize(data.droppedEaps, 'dropouts', 'dropRate'),
    };
}

function isOccupiedChannel(entry: Record<string, unknown> | undefined): entry is Record<string, unknown> {
    return entry !== undefined && [entry.apNum, entry.wrNum, entry.clientNum].some((count) => typeof count === 'number' && count > 0);
}

/** Occupied channels only (an AP, wireless router or client present), with compact per-AP rows. */
function compactChannels(data: Record<string, unknown>): Record<string, unknown> {
    const compacted: Record<string, unknown> = {};
    for (const [band, entries] of Object.entries(data)) {
        if (!Array.isArray(entries)) {
            compacted[band] = entries;
            continue;
        }
        compacted[band] = entries
            .map(asRecord)
            .filter(isOccupiedChannel)
            .map(({ apWithClientInfoList, ...channel }) =>
                Array.isArray(apWithClientInfoList)
                    ? {
                          ...channel,
                          aps: apWithClientInfoList.map((ap) => {
                              const record = asRecord(ap) ?? {};
                              return {
                                  name: record.name,
                                  mac: record.mac,
                                  clientNum: record.clientNum,
                                  channelUtilization: record.channelUtilization,
                              };
                          }),
                      }
                    : channel
            );
    }
    return compacted;
}

/** Compact Wi-Fi sections for `detail: 'summary'`. Compute findings from the full sections first. */
export function compactWifiSections(sections: Record<string, DiagnosticSection>): Record<string, DiagnosticSection> {
    return Object.fromEntries(
        Object.entries(sections).map(([name, section]) => {
            if (name === 'retries') return [name, withData(section, compactRetries)];
            if (name === 'channels') return [name, withData(section, compactChannels)];
            return [name, section];
        })
    );
}

/** Replace per-type notification arrays with enabled counts (10-log.json LogNotification*VO). */
function compactLogSettings(data: Record<string, unknown>): Record<string, unknown> {
    const compacted: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(data)) {
        if (!Array.isArray(value) || !field.toLowerCase().endsWith('notifications')) {
            compacted[field] = value;
            continue;
        }
        const counts: Record<string, number> = { total: value.length };
        for (const entry of value) {
            for (const [flag, enabled] of Object.entries(asRecord(entry) ?? {})) {
                if (typeof enabled === 'boolean') counts[`${flag}Enabled`] = (counts[`${flag}Enabled`] ?? 0) + (enabled ? 1 : 0);
            }
        }
        compacted[field] = counts;
    }
    return compacted;
}

/** Compact logging-setting sections for `detail: 'summary'`; event, alert and audit pages are unchanged. */
export function compactLogSections(sections: Record<string, DiagnosticSection>): Record<string, DiagnosticSection> {
    return Object.fromEntries(
        Object.entries(sections).map(([name, section]) => [name, name.endsWith('Settings') ? withData(section, compactLogSettings) : section])
    );
}
