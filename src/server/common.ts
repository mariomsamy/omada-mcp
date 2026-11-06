import { AsyncLocalStorage } from 'node:async_hooks';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { type CallToolResult, ListResourcesRequestSchema, type ServerNotification, type ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import packageMetadata from '../../package.json' with { type: 'json' };

import { logger } from '../utils/logger.js';
import { isLikelySensitiveString, isSensitiveField, maskValue, redactSecrets, redactSecretsInText, scrubPersonalData } from '../utils/redact.js';

/**
 * Name of the controller profile the current tool call targets. Only set when OMADA_CONTROLLERS_FILE
 * is configured, so single-controller logs, audit records and results are unchanged.
 */
const controllerContext = new AsyncLocalStorage<string>();

export function runWithController<T>(controller: string, callback: () => T): T {
    return controllerContext.run(controller, callback);
}

export function currentControllerName(): string | undefined {
    return controllerContext.getStore();
}

function controllerField(): { controller?: string } {
    const controller = controllerContext.getStore();
    return controller === undefined ? {} : { controller };
}

// Custom headers schema for optional HTTP headers
export const customHeadersSchema = z.record(z.string(), z.string()).optional();

// Reusable MAC address schema for device identifiers (AP, switch, gateway)
export const deviceMacSchema = z
    .string()
    .trim()
    .regex(/^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/, 'Invalid MAC address format. Expected "AA-BB-CC-DD-EE-FF" or "AA:BB:CC:DD:EE:FF".');

/** Strict identifier pattern for anything interpolated into a URL path (no '.', '/', '?', '%'). */
export const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Site IDs are controller-generated identifiers; reject dot segments and separators that could reroute a request. */
export const siteIdSchema = z.string().trim().regex(SAFE_ID_PATTERN, 'siteId must be 1 to 128 letters, digits, "_" or "-".');

/** MAC-or-identifier values used as path segments (device, client and stack IDs). */
const pathIdSchema = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is required`)
        .regex(/^[A-Za-z0-9_:-]{1,128}$/, `${label} must be 1 to 128 letters, digits, ":", "_" or "-".`);

export const siteInputSchema = z.object({
    siteId: siteIdSchema
        .optional()
        .describe('Site ID to target. If omitted, uses the default site from OMADA_SITE_ID config. Use listSites to discover available site IDs.'),
    customHeaders: customHeadersSchema.describe(
        'Optional HTTP headers to include in the Omada API request (e.g. {"X-Custom-Header": "value"}). Rarely needed.'
    ),
});

export const clientIdSchema = siteInputSchema.extend({
    clientId: pathIdSchema('clientId (MAC or client identifier)'),
});

export const deviceIdSchema = siteInputSchema.extend({
    deviceId: pathIdSchema('deviceId (MAC or device identifier)'),
});

export const stackIdSchema = siteInputSchema.extend({
    stackId: pathIdSchema('stackId'),
});

export function toToolResult(value: unknown): CallToolResult {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

    return {
        content: text ? [{ type: 'text' as const, text }] : [],
        ...(value !== null && typeof value === 'object' && !Array.isArray(value) ? { structuredContent: value as Record<string, unknown> } : {}),
    };
}

export function safeSerialize(value: unknown): string {
    try {
        return JSON.stringify(sanitizeForLogs(value));
    } catch {
        return '[unserializable]';
    }
}

function sanitizeForLogs(value: unknown, parentKey?: string): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        return isLikelySensitiveString(value) ? maskValue(value) : value;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeForLogs(entry, parentKey));
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sanitized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(record)) {
            sanitized[key] = isSensitiveField(key, parentKey, record) ? maskValue(entry) : sanitizeForLogs(entry, key);
        }
        return sanitized;
    }

    return value;
}

/** Argument names that identify the target of a call and are safe to log at info level (values scrubbed). */
const INFO_IDENTIFIER_KEY = /^(siteId|dryRun|scope|scheduleId|profileId|networkId|ssidId|wlanId|ruleId|aclId|routeId|historyId|webhookId|apply)$|Id$/;

/**
 * Info-level view of tool arguments: only identifier-like scalar fields (site, resource IDs, dry-run
 * flag), with MAC and IP addresses replaced by placeholders, plus the list of supplied argument names.
 * Full (secret-masked) arguments are logged at debug level only.
 */
export function summarizeArgsForInfo(args: unknown): Record<string, unknown> {
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return {};
    const record = args as Record<string, unknown>;
    const identifiers: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        if (!INFO_IDENTIFIER_KEY.test(key) || isSensitiveField(key)) continue;
        if (typeof value === 'string') identifiers[key] = scrubPersonalData(value);
        else if (typeof value === 'boolean' || typeof value === 'number') identifiers[key] = value;
    }
    return { argNames: Object.keys(record).sort(), ...(Object.keys(identifiers).length > 0 ? { identifiers } : {}) };
}

function summarizeSuccess(method: string, result: unknown): Record<string, unknown> | undefined {
    if (!result || typeof result !== 'object') {
        return undefined;
    }

    const payload = result as Record<string, unknown>;

    switch (method) {
        case 'initialize': {
            const protocolVersion = payload['protocolVersion'];
            return typeof protocolVersion === 'string' ? { protocolVersion } : undefined;
        }
        case 'tools/list': {
            const tools = Array.isArray(payload['tools']) ? payload['tools'] : undefined;
            return tools ? { toolCount: tools.length } : undefined;
        }
        case 'tools/call': {
            const name = payload['name'];
            if (typeof name === 'string') {
                return { tool: name };
            }
            break;
        }
        default:
            break;
    }

    return undefined;
}

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface MutationSummary {
    action: string;
    target: string;
    siteId?: string;
    mode: 'apply' | 'dry-run';
    status: 'planned' | 'applied' | 'submitted' | 'verified' | 'mismatch' | 'unknown' | 'unverifiable' | 'partial';
    summary: string;
    result?: unknown;
}

export function wrapToolHandler<Args extends Record<string, unknown>>(
    name: string,
    handler: (args: Args, extra: ToolExtra) => Promise<CallToolResult>
): (args: Args, extra: ToolExtra) => Promise<CallToolResult> {
    return async (args: Args, extra: ToolExtra): Promise<CallToolResult> => {
        const sessionId = extra.sessionId ?? 'unknown-session';
        logger.info('Tool invoked', { tool: name, sessionId, ...controllerField(), ...summarizeArgsForInfo(args) });
        logger.debug('Tool arguments', { tool: name, sessionId, args: safeSerialize(args) });

        try {
            const result = await handler(args, extra);
            logger.info('Tool completed', { tool: name, sessionId, ...controllerField() });
            return result;
        } catch (error) {
            logger.error('Tool failed', {
                tool: name,
                sessionId,
                ...controllerField(),
                error: redactSecretsInText(error instanceof Error ? error.message : String(error)),
            });
            throw error;
        }
    };
}

/**
 * Build the structured mutation audit record. Identifying fields (action, target, siteId, mode,
 * status, summary) are logged verbatim so incident response can tell what changed and where;
 * only values under secret-looking keys are masked (no length-based string heuristic).
 */
export function buildMutationAuditRecord(
    summary: MutationSummary,
    context: { tool?: string; sessionId?: string; controller?: string } = {}
): Record<string, unknown> {
    return {
        ...(context.tool ? { tool: context.tool } : {}),
        ...(context.controller ? { controller: context.controller } : {}),
        action: summary.action,
        target: summary.target,
        ...(summary.siteId === undefined ? {} : { siteId: summary.siteId }),
        mode: summary.mode,
        status: summary.status,
        summary: redactSecretsInText(summary.summary),
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        ...(summary.result === undefined ? {} : { result: redactSecrets(summary.result) }),
    };
}

export function toMutationResult(summary: MutationSummary, context: { tool?: string; sessionId?: string } = {}): CallToolResult {
    const result = summary.result;
    const verification = result !== null && typeof result === 'object' ? (result as Record<string, unknown>).verification : undefined;
    const verifiedStatus = verification !== null && typeof verification === 'object' ? (verification as Record<string, unknown>).status : undefined;
    const status =
        summary.mode === 'dry-run'
            ? 'planned'
            : typeof verifiedStatus === 'string' && ['verified', 'mismatch', 'unknown', 'unverifiable', 'partial'].includes(verifiedStatus)
              ? verifiedStatus
              : summary.status === 'applied'
                ? 'submitted'
                : summary.status;
    const controller = currentControllerName();
    const normalized = {
        ...summary,
        ...(controller === undefined ? {} : { controller }),
        status: status as MutationSummary['status'],
        ...(summary.result === undefined ? {} : { result: redactSecrets(summary.result) }),
    };
    logger.info('Mutation audit event', {
        mutation: JSON.stringify(buildMutationAuditRecord(normalized, controller === undefined ? context : { ...context, controller })),
    });
    return toToolResult(normalized);
}

export function wrapMutationToolHandler<Args extends Record<string, unknown>>(
    name: string,
    summary: (args: Args, result: unknown, mode: 'apply' | 'dry-run') => MutationSummary,
    handler: (args: Args, extra: ToolExtra) => Promise<unknown>
): (args: Args, extra: ToolExtra) => Promise<CallToolResult> {
    return wrapToolHandler(name, async (args, extra) => {
        const mode = (args as Record<string, unknown>).dryRun === false ? 'apply' : 'dry-run';
        const normalizedArgs = { ...args, dryRun: mode === 'dry-run' };
        let result: unknown;
        try {
            result = await handler(normalizedArgs, extra);
        } catch (error) {
            logger.error('Mutation audit event', {
                tool: name,
                ...controllerField(),
                mode,
                status: 'failed',
                sessionId: extra.sessionId,
                error: redactSecretsInText(error instanceof Error ? error.message : String(error)),
            });
            throw error;
        }
        const mutationSummary = summary(normalizedArgs, result, mode);
        return toMutationResult(mutationSummary, { tool: name, sessionId: extra.sessionId });
    });
}

function setupServerLogging(server: McpServer): void {
    const protocol = server.server;
    type RequestSchema = Parameters<typeof protocol.setRequestHandler>[0];
    type RequestCallback = Parameters<typeof protocol.setRequestHandler>[1];

    const originalSetRequestHandler = protocol.setRequestHandler.bind(protocol);
    protocol.setRequestHandler = function patchedSetRequestHandler(schema: RequestSchema, handler: RequestCallback) {
        const method = (schema as { shape: { method: { value: string } } }).shape.method.value;
        const wrapped: RequestCallback = async (request, extra) => {
            const sessionId = extra.sessionId ?? 'unknown-session';
            const params = 'params' in request ? (request as { params: unknown }).params : undefined;
            const toolName =
                params !== null && typeof params === 'object' && typeof (params as { name?: unknown }).name === 'string'
                    ? (params as { name: string }).name
                    : undefined;
            // Info level: method and tool name only. Parameters (tool arguments) can carry client MACs,
            // IPs and names, so the secret-masked params are logged at debug level.
            logger.info('MCP request received', { method, sessionId, ...(toolName ? { tool: toolName } : {}) });
            if (params !== undefined) {
                logger.debug('MCP request params', { method, sessionId, params: safeSerialize(params) });
            }

            try {
                const result = await handler(request, extra);
                const summary = summarizeSuccess(method, result);
                logger.info('MCP request handled', summary ? { method, sessionId, ...summary } : { method, sessionId });
                return result;
            } catch (error) {
                logger.error('MCP request failed', {
                    method,
                    sessionId,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        };

        return originalSetRequestHandler(schema, wrapped);
    };

    server.server.oninitialized = () => {
        interface ServerWithCapabilities {
            getCapabilities?: () => unknown;
        }
        const capabilities = (server.server as unknown as ServerWithCapabilities).getCapabilities?.();
        if (capabilities) {
            logger.info('Server initialization completed', { capabilities });
        } else {
            logger.info('Server initialization completed');
        }
    };

    server.server.onclose = () => {
        logger.warn('Server connection closed');
    };

    // biome-ignore lint/suspicious/noExplicitAny: MCP SDK doesn't provide types for error handler
    server.server.onerror = (error: any) => {
        logger.error('Server error', { error });
    };

    // biome-ignore lint/suspicious/noExplicitAny: MCP SDK doesn't provide types for request handler
    // biome-ignore lint/suspicious/useAwait: Handler signature requires async even without await
    server.server.fallbackRequestHandler = async (request: any, extra: any) => {
        const sessionId = extra.sessionId ?? 'unknown-session';
        logger.warn('Unhandled request received', { method: request.method, sessionId });
        logger.debug('Unhandled request params', { method: request.method, sessionId, params: safeSerialize(request.params) });
        throw new Error(`Unhandled request: ${request.method}`);
    };

    // biome-ignore lint/suspicious/noExplicitAny: MCP SDK doesn't provide types for notification handler
    // biome-ignore lint/suspicious/useAwait: Handler signature requires async even without await
    server.server.fallbackNotificationHandler = async (notification: any) => {
        logger.warn('Unhandled notification received', { method: notification.method });
        logger.debug('Unhandled notification params', { method: notification.method, params: safeSerialize(notification.params) });
    };
}

export function createServer(): McpServer {
    const server = new McpServer({
        name: 'omada-mcp',
        version: packageMetadata.version,
    });

    setupServerLogging(server);

    // Register resources capability and resources/list handler to prevent initialization errors
    // in MCP clients like Claude Desktop. Currently, this server does not expose any resources,
    // so we return an empty list.
    server.server.registerCapabilities({
        resources: {},
    });

    server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [],
    }));

    return server;
}

export { setupServerLogging };
