/**
 * Shared validation and preflight helpers for tools ported from sibling Omada MCP projects
 * (see NOTICE.md and docs/porting-skipped.md). Every route used by these tools was re-verified
 * against the bundled OpenAPI snapshots in docs/openapi/; none of them use private web APIs.
 */
import { z } from 'zod';

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
 * Strict request body: only the keys of `shape` plus `allowedKeys` (taken from the official
 * OpenAPI component schema) are accepted; unknown keys are rejected rather than forwarded.
 * Values of allowlisted keys that are not modelled in `shape` are free-form but bounded by
 * {@link MAX_PAYLOAD_BYTES} and {@link MAX_PAYLOAD_DEPTH}.
 */
export function strictPayload<T extends z.ZodRawShape>(shape: T, allowedKeys: readonly string[]) {
    const extra: Record<string, z.ZodOptional<z.ZodUnknown>> = {};
    for (const key of allowedKeys) {
        if (!(key in shape)) extra[key] = z.unknown().optional();
    }
    return z.object(shape).extend(extra).strict().superRefine(checkPayloadBounds);
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
 * Hostnames are not resolved; a public name that resolves to a private address is not detected.
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
            const reason = unsafeWebhookUrlReason(url);
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
