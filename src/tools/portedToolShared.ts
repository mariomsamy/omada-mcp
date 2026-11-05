/**
 * Shared validation and preflight helpers for tools ported from sibling Omada MCP projects
 * (see NOTICE.md and docs/porting-skipped.md). Every route used by these tools was re-verified
 * against the bundled OpenAPI snapshots in docs/openapi/; none of them use private web APIs.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

import type { NestedKeySpec } from '../utils/openapiNestedKeys.js';
import { isSensitiveField, maskValue } from '../utils/redact.js';

const MAC_PATTERN = /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/;

/** Controller-generated identifiers: bounded, URL-safe, no path separators. */
export function resourceIdSchema(label: string): z.ZodString {
    return z
        .string()
        .trim()
        .min(1, `${label} is required.`)
        .max(128, `${label} must contain at most 128 characters.`)
        .regex(/^[A-Za-z0-9_-]+$/, `${label} must contain only letters, digits, "_" or "-".`);
}

export const macAddressSchema = z
    .string()
    .trim()
    .regex(MAC_PATTERN, 'Invalid MAC address format. Expected "AA-BB-CC-DD-EE-FF" or "AA:BB:CC:DD:EE:FF".');

/** Schedule and profile names in the spec: 1-128 characters, no leading/trailing space. */
export const specNameSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^ ]$|^[^ ].{0,126}[^ ]$/, 'Name must contain 1 to 128 characters without leading or trailing spaces.');

/** Global (controller-wide) or site scope for log and notification operations. */
export const logScopeSchema = z
    .enum(['site', 'global'])
    .default('site')
    .describe('Target scope. "site" (default) uses siteId or the configured default site; "global" targets the controller-wide setting.');

/**
 * Log selection body shared by the official delete/resolve alert and event log operations
 * (10-log.json: deleteAlertLogsForSite, deleteEventLogsForSite, resolveAlertForSite and global variants).
 */
export const logSelectionSchema = z
    .object({
        logs: z
            .array(resourceIdSchema('log ID'))
            .max(1000)
            .default([])
            .describe('Log IDs from the matching list tool. Must be empty when selectType is "all".'),
        selectType: z
            .enum(['include', 'exclude', 'all'])
            .describe('include: only the listed logs; exclude: every log in the window except the listed ones; all: every log in the window.'),
        startTime: z.number().int().min(0).describe('Window start timestamp in milliseconds.'),
        endTime: z.number().int().min(0).describe('Window end timestamp in milliseconds.'),
        filterModule: z.enum(['System', 'Device']).optional().describe('Required when selectType is "all".'),
    })
    .strict()
    .superRefine((selection, context) => {
        if (selection.endTime < selection.startTime) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'endTime must not be earlier than startTime.' });
        }
        if (selection.selectType === 'include' && selection.logs.length === 0) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['logs'], message: 'selectType "include" requires at least one log ID.' });
        }
        if (selection.selectType === 'all') {
            if (selection.logs.length > 0) {
                context.addIssue({ code: z.ZodIssueCode.custom, path: ['logs'], message: 'selectType "all" requires an empty logs list.' });
            }
            if (!selection.filterModule) {
                context.addIssue({ code: z.ZodIssueCode.custom, path: ['filterModule'], message: 'selectType "all" requires filterModule.' });
            }
        }
    });

export type LogSelection = z.infer<typeof logSelectionSchema>;

/** Broad selections (exclude/all) remove or resolve logs that were not individually named. */
export function assertBroadSelectionConfirmed(selection: LogSelection, confirmed: boolean): void {
    if (selection.selectType !== 'include' && !confirmed) {
        throw new Error(
            `selectType "${selection.selectType}" affects logs that were not individually listed; set confirmBroadSelection to true to apply.`
        );
    }
}

/** Reboot schedule body (04-site-setting.json RebootScheduleOpenApiVO). */
export const rebootScheduleSchema = z
    .object({
        name: specNameSchema,
        status: z.boolean().describe('Whether the schedule is enabled.'),
        deviceMacs: z.array(macAddressSchema).min(1).max(512).describe('Explicit device MAC addresses that the schedule reboots.'),
        time: z
            .object({
                timingType: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('1: daily, 2: weekly, 3: monthly.'),
                dayOfWeek: z.number().int().min(0).max(6).optional().describe('0 (Sunday) to 6 (Saturday); required for weekly schedules.'),
                dayOfMonth: z.number().int().min(1).max(31).optional().describe('1 to 31; required for monthly schedules.'),
                hour: z.number().int().min(0).max(23),
                minute: z.number().int().min(0).max(59),
            })
            .strict()
            .superRefine((time, context) => {
                if (time.timingType === 2 && time.dayOfWeek === undefined) {
                    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfWeek'], message: 'Weekly schedules require dayOfWeek.' });
                }
                if (time.timingType === 3 && time.dayOfMonth === undefined) {
                    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfMonth'], message: 'Monthly schedules require dayOfMonth.' });
                }
            }),
    })
    .strict();

/** PoE schedule body (04-site-setting.json PoeScheduleOpenApiVO). */
export const poeScheduleSchema = z
    .object({
        name: specNameSchema,
        status: z.boolean().describe('Whether the schedule is enabled.'),
        turnOnTime: resourceIdSchema('turnOnTime').describe('Time range profile ID during which PoE stays powered (see listTimeRangeProfiles).'),
        poePortsMap: z
            .record(
                macAddressSchema,
                z
                    .array(z.number().int().min(1).max(512))
                    .min(1)
                    .max(512)
                    .refine((ports) => new Set(ports).size === ports.length, 'PoE ports must be unique per switch.')
            )
            .refine((map) => Object.keys(map).length > 0, 'poePortsMap must list at least one switch.')
            .describe('Map of switch MAC address to the PoE port numbers controlled by the schedule.'),
    })
    .strict();

/** Serialized-size cap for any request body forwarded to the controller. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Nesting cap for any request body forwarded to the controller. */
export const MAX_PAYLOAD_DEPTH = 8;

function exceedsDepth(value: unknown, remaining: number): boolean {
    if (value === null || typeof value !== 'object') return false;
    if (remaining <= 0) return true;
    const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
    return children.some((child) => exceedsDepth(child, remaining - 1));
}

/** Reject payloads that are too deep or too large to be a plausible controller request body. */
export function checkPayloadBounds(value: unknown, context: z.RefinementCtx): void {
    if (exceedsDepth(value, MAX_PAYLOAD_DEPTH)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Payload nesting exceeds ${MAX_PAYLOAD_DEPTH} levels.` });
        return;
    }
    let size: number;
    try {
        size = Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
    } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Payload must be JSON-serializable.' });
        return;
    }
    if (size > MAX_PAYLOAD_BYTES) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes when serialized.` });
    }
}

/**
 * Reject keys that are not in the official OpenAPI component schema of a nested object (and,
 * recursively, of its nested objects and array items). Map-typed objects have no spec and stay free-form.
 */
export function checkNestedKeys(value: unknown, spec: NestedKeySpec, path: (string | number)[], context: z.RefinementCtx): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => checkNestedKeys(item, spec, [...path, index], context));
        return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter((key) => !spec.keys.includes(key));
    if (unknownKeys.length > 0) {
        context.addIssue({
            code: 'unrecognized_keys',
            keys: unknownKeys,
            path,
            message: `Unrecognized key(s) ${unknownKeys.map((key) => `"${key}"`).join(', ')}: not in the official Open API schema for this object.`,
        });
    }
    for (const [key, child] of Object.entries(spec.children ?? {})) {
        if (key in record) checkNestedKeys(record[key], child, [...path, key], context);
    }
}

/**
 * Strict request body: only the keys of `shape` plus `allowedKeys` (taken from the official
 * OpenAPI component schema) are accepted; unknown keys are rejected rather than forwarded.
 * Values of allowlisted keys that are not modelled in `shape` are checked against `nested` (the
 * generated nested allowlists in src/utils/openapiNestedKeys.ts) when given, and are always bounded
 * by {@link MAX_PAYLOAD_BYTES} and {@link MAX_PAYLOAD_DEPTH}.
 */
export function strictPayload<T extends z.ZodRawShape>(
    shape: T,
    allowedKeys: readonly string[],
    nested?: Readonly<Record<string, NestedKeySpec>>
): z.ZodObject<T, z.core.$strict> {
    const extra: Record<string, z.ZodOptional<z.ZodUnknown>> = {};
    for (const key of allowedKeys) {
        if (!(key in shape)) extra[key] = z.unknown().optional();
    }
    // The extra allowlisted keys are free-form (bounded below); only the modelled keys are typed.
    return z
        .object({ ...extra, ...shape })
        .strict()
        .superRefine((value, context) => {
            checkPayloadBounds(value, context);
            for (const [key, spec] of Object.entries(nested ?? {})) {
                if (key in value) checkNestedKeys((value as Record<string, unknown>)[key], spec, [key], context);
            }
        }) as unknown as z.ZodObject<T, z.core.$strict>;
}

/** A nested JSON object restricted to the keys of its official OpenAPI component schema. */
export function objectPayloadSchema(description: string, allowedKeys: readonly string[]) {
    return strictPayload({}, allowedKeys).describe(description);
}

/** Official LogNotification/AuditLog webhook reference (WebhookConfigEditOpenApiVO). */
export const webhookConfigSchema = z
    .object({
        webhookEnable: z.boolean().describe('Whether webhook delivery is enabled.'),
        webhookId: resourceIdSchema('webhookId').optional().describe('Webhook profile ID (see getWebhookForGlobal).'),
    })
    .strict()
    .describe('Webhook configuration (WebhookConfigEditOpenApiVO): which webhook profile receives notifications.');

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

function isPrivateIpv4(host: string): boolean {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b] = parts as [number, number, number, number];
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function isPrivateIpv6(host: string): boolean {
    const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (!normalized.includes(':')) return false;
    if (normalized === '::' || normalized === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
    if (/^::ffff:/.test(normalized)) return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(normalized);
}

/**
 * Validate a webhook destination: https only, no embedded credentials, and no loopback,
 * private, link-local, CGNAT, multicast or local-only hostnames. Returns a reason when unsafe.
 * This is the literal (synchronous) check; {@link checkWebhookDestination} adds DNS resolution
 * and the optional OMADA_WEBHOOK_ALLOWED_HOSTS allowlist.
 */
export function unsafeWebhookUrlReason(raw: string): string | undefined {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return 'not a valid URL';
    }
    if (url.protocol !== 'https:') return 'only https:// webhook URLs are allowed';
    if (url.username || url.password) return 'webhook URLs must not embed credentials';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return 'missing host';
    if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return 'local-only hostnames are not allowed';
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) return 'loopback, private, link-local and reserved addresses are not allowed';
    if (/^\d+$/.test(host) || /^0x/i.test(host)) return 'numeric host encodings are not allowed';
    return undefined;
}

/** Resolves a hostname to its IP addresses (IPv4 and IPv6). Injected in tests; never called for IP literals. */
export type HostResolver = (host: string) => Promise<string[]>;

const systemResolver: HostResolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

export interface WebhookPolicy {
    /** Optional allowlist (OMADA_WEBHOOK_ALLOWED_HOSTS): exact hosts, or "*.example.com" for subdomains. */
    allowedHosts?: readonly string[];
    resolve?: HostResolver;
}

let webhookPolicy: WebhookPolicy = {};

/** Set the process-wide webhook destination policy (called once from registerAllTools with the loaded config). */
export function configureWebhookPolicy(policy: WebhookPolicy): void {
    webhookPolicy = {
        ...webhookPolicy,
        ...policy,
        allowedHosts: policy.allowedHosts?.map((host) => host.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean),
    };
}

function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
    return allowedHosts.some((entry) => (entry.startsWith('*.') ? host.endsWith(entry.slice(1)) && host.length > entry.length - 1 : host === entry));
}

/**
 * Full webhook destination check: the literal rules of {@link unsafeWebhookUrlReason}, then the
 * optional host allowlist, then DNS resolution: every address the host resolves to must be public.
 * Unresolvable hosts are refused. The controller resolves the name again when it delivers, so this
 * narrows but cannot fully close DNS-rebinding; the allowlist is the stronger control.
 */
export async function checkWebhookDestination(raw: string, policy: WebhookPolicy = webhookPolicy): Promise<string | undefined> {
    const literal = unsafeWebhookUrlReason(raw);
    if (literal) return literal;
    const host = new URL(raw).hostname
        .toLowerCase()
        .replace(/\.$/, '')
        .replace(/^\[|\]$/g, '');
    if (policy.allowedHosts && policy.allowedHosts.length > 0 && !hostAllowed(host, policy.allowedHosts)) {
        return 'host is not in OMADA_WEBHOOK_ALLOWED_HOSTS';
    }
    if (isIP(host) !== 0) return undefined;
    let addresses: string[];
    try {
        addresses = await (policy.resolve ?? systemResolver)(host);
    } catch {
        return 'host could not be resolved';
    }
    if (addresses.length === 0) return 'host could not be resolved';
    if (addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
        return 'host resolves to a loopback, private, link-local or reserved address';
    }
    return undefined;
}

/** One planned field change in a dry-run preview. `before` is absent when the current value was not readable. */
export interface FieldChange {
    path: string;
    before?: unknown;
    planned: unknown;
}

export interface FieldDiff {
    /** Fields whose planned value differs from the current one (secret values masked). */
    changed: FieldChange[];
    /** Number of planned fields that already have the planned value. */
    unchangedCount: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Field-level before/planned diff for dry-run previews. Walks the planned (partial) body; nested
 * objects are compared field by field, arrays and scalars as whole values. `base` selects the
 * sub-object of `before` that the body updates (for example ['macFilter'] in an SSID detail).
 * Values under secret-looking keys are masked; the comparison itself uses the real values.
 */
export function diffFields(before: unknown, planned: unknown, base: readonly string[] = []): FieldDiff {
    let current: unknown = before;
    for (const segment of base) current = isPlainObject(current) ? current[segment] : undefined;
    const changed: FieldChange[] = [];
    let unchangedCount = 0;
    const walk = (plannedValue: unknown, currentValue: unknown, path: string[], parentKey: string | undefined, secret: boolean): void => {
        if (isPlainObject(plannedValue)) {
            for (const [key, value] of Object.entries(plannedValue)) {
                const nestedSecret = secret || isSensitiveField(key, parentKey, plannedValue);
                walk(value, isPlainObject(currentValue) ? currentValue[key] : undefined, [...path, key], key, nestedSecret);
            }
            return;
        }
        if (currentValue !== undefined && JSON.stringify(currentValue) === JSON.stringify(plannedValue)) {
            unchangedCount += 1;
            return;
        }
        changed.push({
            path: path.join('.'),
            ...(currentValue === undefined ? {} : { before: secret ? maskValue(currentValue) : currentValue }),
            planned: secret ? maskValue(plannedValue) : plannedValue,
        });
    };
    walk(planned, current, [], undefined, false);
    return { changed, unchangedCount };
}

/** Normalize list results that arrive either as arrays or as paginated `{ data: [] }` objects. */
export function extractRecords(value: unknown): Record<string, unknown>[] {
    const items = Array.isArray(value)
        ? value
        : value !== null && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
          ? (value as { data: unknown[] }).data
          : [];
    return items.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item));
}

/** Preflight: load the current collection and require an exact identifier match before mutating. */
export async function requireExistingRecord(
    load: () => Promise<unknown>,
    id: string,
    label: string,
    idKeys: readonly string[] = ['id']
): Promise<Record<string, unknown>> {
    const record = extractRecords(await load()).find((item) => idKeys.some((key) => item[key] === id));
    if (!record) {
        throw new Error(`${label} ${id} was not found in the selected site; refusing to mutate an unknown resource.`);
    }
    return record;
}

/** Canonical MAC form for comparisons: upper case with "-" separators. */
export function normalizeMac(mac: string): string {
    return mac.trim().toUpperCase().replace(/:/g, '-');
}

/**
 * Preflight: require a device with this MAC in a read-endpoint result (site device list or pending
 * list). `hint` explains which read tool to use. MAC separators and case are normalized.
 */
export async function requireDeviceByMac(load: () => Promise<unknown>, mac: string, hint: string): Promise<Record<string, unknown>> {
    const wanted = normalizeMac(mac);
    const record = extractRecords(await load()).find((item) => typeof item.mac === 'string' && normalizeMac(item.mac) === wanted);
    if (!record) {
        throw new Error(`Device ${mac} ${hint}; refusing to send the request.`);
    }
    return record;
}

/**
 * Top-level request-body keys of the official Open API component schemas (docs/openapi/04-site-setting.json,
 * 10-log.json). Used as strict allowlists so that undocumented fields are never forwarded.
 */
export const OPENAPI_BODY_KEYS = {
    createSsid: [
        'name',
        'deviceType',
        'band',
        'guestNetEnable',
        'security',
        'broadcast',
        'vlanEnable',
        'vlanId',
        'pskSetting',
        'entSetting',
        'ppskSetting',
        'mloEnable',
        'pmfMode',
        'enable11r',
        'hidePwd',
        'greEnable',
        'vlanSetting',
        'prohibitWifiShare',
    ],
    ssidPskSetting: ['securityKey', 'versionPsk', 'encryptionPsk', 'gikRekeyPskEnable', 'rekeyPskInterval', 'intervalPskType'],
    ssidEntSetting: [
        'radiusProfileId',
        'versionEnt',
        'encryptionEnt',
        'gikRekeyEntEnable',
        'rekeyEntInterval',
        'intervalEntType',
        'nasIdMode',
        'nasId',
    ],
    ssidPpskSetting: ['ppskProfileId', 'radiusProfileId', 'macFormat', 'nasId', 'type'],
    ssidVlanSetting: ['mode', 'customConfig'],
    lanNetwork: [
        'name',
        'purpose',
        'interfaceIds',
        'vlanType',
        'vlans',
        'vlan',
        'application',
        'gatewaySubnet',
        'dhcpSettingsVO',
        'domain',
        'igmpSnoopEnable',
        'mldSnoopEnable',
        'dhcpL2RelayEnable',
        'dhcpGuard',
        'dhcpv6Guard',
        'lanNetworkIpv6Config',
        'allLan',
        'qosQueueEnable',
        'queueId',
    ],
    lanProfile: [
        'name',
        'poe',
        'nativeNetworkId',
        'tagNetworkIds',
        'untagNetworkIds',
        'voiceNetworkId',
        'dot1x',
        'portIsolationEnable',
        'lldpMedEnable',
        'bandWidthCtrlType',
        'stormCtrl',
        'bandCtrl',
        'spanningTreeEnable',
        'loopbackDetectEnable',
        'eeeEnable',
        'flowControlEnable',
        'loopbackDetectVlanBasedEnable',
        'dhcpL2RelaySettings',
    ],
    portForwarding: [
        'name',
        'status',
        'from',
        'limitedAddresses',
        'interfaceWanPortId',
        'virtualWanId',
        'existVirtualWan',
        'wanIps',
        'existWanIp',
        'externalPort',
        'forwardIp',
        'forwardPort',
        'protocol',
        'dMZ',
    ],
    staticRouting: ['name', 'status', 'destinations', 'routeType', 'nextHopIp', 'interfaceType', 'interfaceId', 'metric'],
    internetPort: ['type', 'wanPortSetting', 'usbLteSetting', 'lteWanSetting'],
    wanPortSetting: ['portId', 'portName', 'portDescription', 'wanPortIpv4Setting', 'wanPortIpv6Setting', 'wanPortMacSetting', 'dslSetting'],
    ssidHotspotV2: [
        'hotspotV2Enable',
        'networkType',
        'plmnId',
        'roamingConsortiumOi',
        'operatorDomain',
        'dgafDisable',
        'heSsid',
        'internet',
        'availabilityIpv4',
        'availabilityIpv6',
        'operatorFriendly',
        'venueInfo',
        'realmList',
    ],
    ssidMacFilter: ['macFilterEnable', 'policy', 'macFilterId', 'ouiProfileIdList'],
    ssidMultiCast: ['multiCastEnable', 'channelUtil', 'arpCastEnable', 'ipv6CastEnable', 'filterEnable', 'filterMode', 'macGroupId'],
    ssidRateControl: [
        'rate2gCtrlEnable',
        'lowerDensity2g',
        'higherDensity2g',
        'cckRatesDisable',
        'clientRatesRequire2g',
        'sendBeacons2g',
        'rate5gCtrlEnable',
        'lowerDensity5g',
        'higherDensity5g',
        'clientRatesRequire5g',
        'sendBeacons5g',
        'rate6gCtrlEnable',
        'lowerDensity6g',
        'higherDensity6g',
        'clientRatesRequire6g',
        'sendBeacons6g',
    ],
    ssidRateLimit: ['clientRateLimit', 'ssidRateLimit'],
    ssidRateLimitEntry: ['profileId', 'customSetting'],
    ssidWlanSchedule: ['wlanScheduleEnable', 'action', 'scheduleId'],
    bandSteering: ['mode'],
    beaconControl: [
        'beaconInterval2g',
        'beaconIntvMode2g',
        'dtimPeriod2g',
        'rtsThreshold2g',
        'fragmentationThreshold2g',
        'beaconInterval5g',
        'beaconIntvMode5g',
        'dtimPeriod5g',
        'rtsThreshold5g',
        'fragmentationThreshold5g',
        'beaconInterval6g',
        'beaconIntvMode6g',
        'dtimPeriod6g',
        'rtsThreshold6g',
        'fragmentationThreshold6g',
    ],
    airtimeFairness: ['enable2g', 'enable5g', 'enable6g'],
    mesh: ['meshEnable', 'autoFailoverEnable', 'defGatewayEnable', 'gateway', 'fullSector'],
    roaming: ['fastRoamingEnable', 'aiRoamingEnable', 'dualBand11kReportEnable', 'forceDisassociationEnable', 'nonStickRoamingEnable'],
    rfPlanningCustomSetting: ['channelDeployEnable', 'channelWidthDeployEnable', 'bandDeployEnable', 'powerAdjustEnable', 'advancedSetting'],
    logNotification: ['key', 'enable', 'email', 'webhook'],
    logEmailSetting: ['alertEmailEnable', 'delayEnable', 'delay'],
    auditLogNotification: ['key', 'webhook'],
} as const;

export interface WebhookChangeAssessment {
    /** True when the planned webhookConfig differs from the controller's current one. */
    changed: boolean;
    previous?: unknown;
    planned?: WebhookConfig;
    /** Hosts (never full URLs, which may embed tokens) that the effective webhook profile delivers to. */
    destinationHosts: string[];
}

function hostOf(raw: string): string {
    try {
        return new URL(raw).host;
    } catch {
        return '[invalid URL]';
    }
}

/**
 * Assess a webhookConfig change for log/audit notification tools. Notifications carry client MACs,
 * IPs and hostnames, so the referenced webhook profile's destinations must be https and public.
 * Throws when the profile is unknown or any destination is unsafe.
 */
export async function assessWebhookChange(
    client: { getWebhookForGlobal(customHeaders?: Record<string, string>): Promise<unknown> },
    before: unknown,
    planned: WebhookConfig | undefined,
    customHeaders?: Record<string, string>
): Promise<WebhookChangeAssessment> {
    if (!planned) return { changed: false, destinationHosts: [] };
    const previous = before !== null && typeof before === 'object' ? (before as Record<string, unknown>).webhookConfig : undefined;
    const previousRecord = previous !== null && typeof previous === 'object' ? (previous as Record<string, unknown>) : {};
    const changed =
        planned.webhookEnable !== previousRecord.webhookEnable || (planned.webhookId !== undefined && planned.webhookId !== previousRecord.webhookId);
    const effectiveId = planned.webhookId ?? (typeof previousRecord.webhookId === 'string' ? previousRecord.webhookId : undefined);
    const destinationHosts: string[] = [];
    if (planned.webhookEnable && effectiveId) {
        const profile = extractRecords(await client.getWebhookForGlobal(customHeaders)).find((record) => record.webhookId === effectiveId);
        if (!profile) {
            throw new Error(`Webhook profile ${effectiveId} was not found (see getWebhookForGlobal); refusing to enable it.`);
        }
        const urls = Array.isArray(profile.urlList) ? profile.urlList.filter((url): url is string => typeof url === 'string') : [];
        for (const url of urls) {
            const reason = await checkWebhookDestination(url);
            if (reason) {
                throw new Error(`Webhook profile ${effectiveId} delivers to ${hostOf(url)}, which is not allowed: ${reason}.`);
            }
            destinationHosts.push(hostOf(url));
        }
    }
    return { changed, previous, planned, destinationHosts };
}

/** Require an explicit acknowledgement before redirecting notifications to a different webhook. */
export function assertWebhookChangeConfirmed(assessment: WebhookChangeAssessment, confirmed: boolean): void {
    if (assessment.changed && !confirmed) {
        throw new Error(
            'webhookConfig changes where log notifications (client MACs, IPs, hostnames) are delivered; review the dry-run preview and set confirmWebhookChange to true to apply.'
        );
    }
}

export const confirmWebhookChangeSchema = z
    .boolean()
    .optional()
    .default(false)
    .describe(
        'Required (true) to apply a change to webhookConfig. The dry-run preview shows the current and planned webhook and its destination hosts.'
    );
