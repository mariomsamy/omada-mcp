import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ToolCategory, ToolPermission } from '../config.js';
import type { ControllerRegistry } from '../controllerRegistry.js';
import type { OmadaClient } from '../omadaClient/index.js';
import type { CatalogTool } from './catalog.js';
import { runWithController } from './common.js';

type ToolDefinition = Pick<CatalogTool, 'description' | 'inputSchema' | 'annotations'>;

/**
 * Schema of the injected `controller` argument. Read tools may omit it (the default controller is
 * used); write tools must name the controller explicitly when several are configured.
 */
export function controllerArgumentSchema(registry: ControllerRegistry, permission: ToolPermission): z.ZodType<string | undefined> {
    const names = registry.names as [string, ...string[]];
    const choices = names.join(', ');
    const schema = z.enum(names, {
        error: (issue) =>
            issue.input === undefined
                ? `controller is required for write tools when several controllers are configured; choose one of: ${choices}.`
                : `Unknown controller. Configured controllers: ${choices}.`,
    });
    return permission === 'write'
        ? schema.describe(`Omada controller to change (required): one of ${choices}. See listControllers.`)
        : schema.optional().describe(`Omada controller to query: one of ${choices}. Defaults to "${registry.defaultName}". See listControllers.`);
}

/** Pick the controller for one call; refuses writes without an explicit choice in multi-controller mode. */
export function selectController(registry: ControllerRegistry, tool: string, permission: ToolPermission, controller: unknown): string {
    if (controller === undefined) {
        if (registry.isMulti && permission === 'write') {
            throw new Error(`${tool} changes controller state; pass "controller" explicitly (one of: ${registry.names.join(', ')}).`);
        }
        return registry.defaultName;
    }
    if (typeof controller !== 'string') throw new Error(`controller must be a string (one of: ${registry.names.join(', ')}).`);
    return registry.resolve(controller);
}

/**
 * Register one tool module once per configured controller (each with that controller's lazily created
 * client) and merge the results into catalog entries that dispatch on the `controller` argument.
 * The argument is only added to the schema when more than one controller is configured.
 */
export function routeToolAcrossControllers(
    register: (server: McpServer, client: OmadaClient) => void,
    category: ToolCategory,
    permission: ToolPermission,
    registry: ControllerRegistry
): CatalogTool[] {
    const tools = new Map<string, { definition: ToolDefinition; handlers: Map<string, CatalogTool['handler']> }>();
    for (const controller of registry.names) {
        const collector = {
            registerTool(name: string, definition: ToolDefinition, handler: CatalogTool['handler']): void {
                let slot = tools.get(name);
                if (!slot) {
                    slot = { definition, handlers: new Map() };
                    tools.set(name, slot);
                }
                slot.handlers.set(controller, handler);
            },
        } as unknown as McpServer;
        register(collector, registry.lazyClient(controller));
    }

    return [...tools].map(([name, { definition, handlers }]) => ({
        name,
        ...definition,
        inputSchema: registry.isMulti
            ? { ...definition.inputSchema, controller: controllerArgumentSchema(registry, permission) }
            : definition.inputSchema,
        category,
        permission,
        handler: (args, extra) => {
            const { controller, ...rest } = args;
            const target = selectController(registry, name, permission, controller);
            const handler = handlers.get(target) as CatalogTool['handler'];
            return runWithController(target, () => handler(rest, extra));
        },
    }));
}
