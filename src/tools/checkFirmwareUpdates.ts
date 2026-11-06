import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import type { CustomHeaders, OmadaDeviceInfo } from '../types/index.js';

export type FirmwareStatus = 'up-to-date' | 'update-available' | 'unknown';

export interface FirmwareCheckEntry {
    name?: string;
    mac: string;
    model?: string;
    type?: string;
    currentVersion?: string;
    latestVersion?: string;
    status: FirmwareStatus;
    note?: string;
}

/** Device status 2 is "Pending" (not adopted) in the Open API DeviceInfo schema. */
const PENDING_STATUS = 2;
/** The spec allows 1000, but controller 6.3 rejects pageSize above 100. */
const POOL_PAGE_SIZE = 100;
const POOL_MAX_PAGES = 20;
const DEVICE_CONCURRENCY = 4;

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).trim();
}

interface ParsedVersion {
    numbers: number[];
    build?: number;
    rel?: number;
}

/** Normalizes spacing differences such as "Rel.81048" vs "Rel. 81048". */
export function normalizeFirmwareVersion(version: string): string {
    return version.replace(/\s+/g, '').toLowerCase();
}

export function parseFirmwareVersion(version: string): ParsedVersion | undefined {
    const match = /^\s*v?(\d+(?:\.\d+)*)(?:\s*build\s*(\d+))?(?:\s*rel\.?\s*(\d+))?/i.exec(version);
    if (!match) return undefined;
    return {
        numbers: match[1].split('.').map(Number),
        build: match[2] === undefined ? undefined : Number(match[2]),
        rel: match[3] === undefined ? undefined : Number(match[3]),
    };
}

/**
 * Compares two firmware versions. Returns a negative number when `a` is older, positive when newer,
 * 0 when equal, or undefined when the order cannot be determined without guessing.
 */
export function compareFirmwareVersions(a: string, b: string): number | undefined {
    if (normalizeFirmwareVersion(a) === normalizeFirmwareVersion(b)) return 0;
    const pa = parseFirmwareVersion(a);
    const pb = parseFirmwareVersion(b);
    if (!pa || !pb) return undefined;
    const length = Math.max(pa.numbers.length, pb.numbers.length);
    for (let i = 0; i < length; i++) {
        const diff = (pa.numbers[i] ?? 0) - (pb.numbers[i] ?? 0);
        if (diff !== 0) return diff;
    }
    for (const key of ['build', 'rel'] as const) {
        const va = pa[key];
        const vb = pb[key];
        if (va === undefined || vb === undefined) return undefined;
        if (va !== vb) return va - vb;
    }
    return undefined;
}

interface PoolLookup {
    byModel: Map<string, string>;
    error?: string;
}

async function loadFirmwarePool(client: OmadaClient, customHeaders?: CustomHeaders): Promise<PoolLookup> {
    const byModel = new Map<string, string>();
    try {
        for (let page = 1; page <= POOL_MAX_PAGES; page++) {
            const result = asRecord(await client.listUpgradeOverviewFirmwares(page, POOL_PAGE_SIZE, customHeaders, 0));
            const rows = Array.isArray(result?.data) ? result.data : [];
            for (const row of rows) {
                const entry = asRecord(row);
                const latest = nonEmptyString(entry?.latestVersion);
                const modelInfo = asRecord(entry?.modelTypeInfo);
                if (!latest || !modelInfo) continue;
                for (const key of ['showModel', 'compoundModel']) {
                    const model = nonEmptyString(modelInfo[key]);
                    if (model) byModel.set(model, latest);
                }
            }
            const total = typeof result?.totalRows === 'number' ? result.totalRows : 0;
            if (rows.length < POOL_PAGE_SIZE || page * POOL_PAGE_SIZE >= total) break;
        }
        return { byModel };
    } catch (error) {
        return { byModel, error: errorMessage(error) };
    }
}

/** Picks the newest known version among candidates; undefined if they disagree in an unorderable way. */
function newestKnown(candidates: string[]): string | undefined {
    let newest: string | undefined;
    for (const candidate of candidates) {
        if (newest === undefined) {
            newest = candidate;
            continue;
        }
        const order = compareFirmwareVersions(candidate, newest);
        if (order === undefined) return undefined;
        if (order > 0) newest = candidate;
    }
    return newest;
}

export function classifyFirmware(
    current: string | undefined,
    candidates: string[]
): { status: FirmwareStatus; latestVersion?: string; note?: string } {
    if (!current) return { status: 'unknown', note: 'current firmware version not reported' };
    if (candidates.length === 0) return { status: 'unknown', note: 'controller reports no latest firmware for this model' };
    const latest = newestKnown(candidates);
    if (latest === undefined) return { status: 'unknown', note: 'latest firmware sources disagree' };
    const order = compareFirmwareVersions(current, latest);
    if (order === undefined) return { status: 'unknown', latestVersion: latest, note: 'versions not comparable' };
    if (order < 0) return { status: 'update-available', latestVersion: latest };
    if (order > 0) return { status: 'up-to-date', latestVersion: latest, note: 'running newer than latest known' };
    return { status: 'up-to-date', latestVersion: latest };
}

async function checkDevice(
    client: OmadaClient,
    device: OmadaDeviceInfo,
    pool: PoolLookup,
    siteId: string,
    customHeaders?: CustomHeaders
): Promise<FirmwareCheckEntry> {
    let current = nonEmptyString(device.firmwareVersion);
    const candidates: string[] = [];
    const notes: string[] = [];
    try {
        const info = asRecord(await client.getFirmwareInfo(device.mac, siteId, customHeaders));
        current = nonEmptyString(info?.curFwVer) ?? current;
        const last = nonEmptyString(info?.lastFwVer);
        if (last) candidates.push(last);
    } catch (error) {
        notes.push(`latest-firmware-info failed: ${errorMessage(error)}`);
    }
    const model = nonEmptyString(device.model);
    const poolLatest = model ? pool.byModel.get(model) : undefined;
    if (poolLatest) candidates.push(poolLatest);

    const verdict = classifyFirmware(current, candidates);
    if (verdict.note) notes.push(verdict.note);
    const entry: FirmwareCheckEntry = {
        name: nonEmptyString(device.name),
        mac: device.mac,
        model,
        type: nonEmptyString(device.type),
        currentVersion: current,
        latestVersion: verdict.latestVersion,
        status: verdict.status,
    };
    if (notes.length > 0) entry.note = notes.join('; ');
    return entry;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

export function registerCheckFirmwareUpdatesTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'checkFirmwareUpdates',
        {
            description:
                'Read-only firmware audit for every adopted device in a site: current firmware vs the latest firmware the controller knows (per-device latest-firmware-info plus the stable-channel firmware pool), with status up-to-date, update-available or unknown, and device name/model/type. Never triggers an upgrade. A status is "unknown" whenever the controller does not report a comparable latest version; it is never guessed. Partial failures are reported in notes/warnings.',
            inputSchema: siteInputSchema.shape,
        },
        wrapToolHandler('checkFirmwareUpdates', async ({ siteId, customHeaders }) => {
            const resolvedSiteId = await client.resolveSiteId(siteId);
            const [devices, pool] = await Promise.all([client.listDevices(resolvedSiteId, customHeaders), loadFirmwarePool(client, customHeaders)]);
            // The API returns a numeric status although OmadaDeviceInfo types it loosely.
            const adopted = devices.filter((device) => Number(device.status) !== PENDING_STATUS);
            const results = await mapWithConcurrency(adopted, DEVICE_CONCURRENCY, (device) =>
                checkDevice(client, device, pool, resolvedSiteId, customHeaders)
            );

            const summary = { total: results.length, upToDate: 0, updateAvailable: 0, unknown: 0 };
            for (const entry of results) {
                if (entry.status === 'up-to-date') summary.upToDate++;
                else if (entry.status === 'update-available') summary.updateAvailable++;
                else summary.unknown++;
            }
            const warnings: string[] = [];
            if (pool.error) warnings.push(`firmware pool unavailable: ${pool.error}`);

            return toToolResult({
                siteId: resolvedSiteId,
                summary,
                devices: results,
                ...(warnings.length > 0 ? { warnings } : {}),
            });
        })
    );
}
