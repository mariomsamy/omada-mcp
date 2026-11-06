import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { type OmadaConnectionConfig, parseToolCategories } from '../../src/config.js';
import { ControllerRegistry } from '../../src/controllerRegistry.js';
import type { OmadaClient } from '../../src/omadaClient/index.js';
import type { ToolExtra } from '../../src/server/common.js';
import { controllerArgumentSchema, routeToolAcrossControllers, selectController } from '../../src/server/controllerRouting.js';
import { registerAllTools } from '../../src/tools/index.js';
import { logger } from '../../src/utils/logger.js';
import { PROFILE_SECRET, profile } from '../helpers/controllers.js';

interface Registered {
    config: { inputSchema: z.ZodRawShape; description: string; annotations?: Record<string, unknown> };
    handler: (args: Record<string, unknown>, extra: ToolExtra) => Promise<CallToolResult>;
}

const extra = { sessionId: 'session-1' } as ToolExtra;

function fakeClients() {
    const clients = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
    const factory = vi.fn((config: OmadaConnectionConfig) => {
        const name = config.omadacId.replace(/-omadac$/, '');
        const client = {
            listSites: vi.fn(() =>
                name === 'down' ? Promise.reject(new Error('connect ETIMEDOUT 192.0.2.10:8043')) : Promise.resolve([{ siteId: `${name}-site`, name }])
            ),
            getLedSetting: vi.fn(async () => ({ enable: true })),
            setSiteLedSetting: vi.fn(async () => ({ ok: true })),
        };
        clients.set(name, client);
        return client as unknown as OmadaClient;
    });
    return { clients, factory };
}

function register(names: string[], options: { catalogMode?: 'standard' | 'compact'; categories?: string } = {}) {
    const { clients, factory } = fakeClients();
    const registry = new ControllerRegistry(
        names.map((name) => profile(name)),
        names[0],
        factory
    );
    const tools = new Map<string, Registered>();
    const server = {
        registerTool(name: string, config: Registered['config'], handler: Registered['handler']) {
            tools.set(name, { config, handler });
        },
    } as unknown as McpServer;
    registerAllTools(server, {} as OmadaClient, parseToolCategories(options.categories ?? 'sites:rw').categories, {
        catalogMode: options.catalogMode,
        controllerRegistry: registry,
    });
    const call = async (name: string, args: Record<string, unknown> = {}) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`not registered: ${name}`);
        const result = await tool.handler(args, extra);
        return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    };
    return { tools, call, clients, factory, registry };
}

function registerSingleEnv() {
    const tools = new Map<string, Registered>();
    const server = {
        registerTool(name: string, config: Registered['config'], handler: Registered['handler']) {
            tools.set(name, { config, handler });
        },
    } as unknown as McpServer;
    registerAllTools(server, {} as OmadaClient, parseToolCategories('sites:rw').categories);
    return tools;
}

const jsonSchema = (shape: z.ZodRawShape) => JSON.stringify(z.toJSONSchema(z.object(shape), { io: 'input', unrepresentable: 'any' }));

describe('multi-controller routing', () => {
    afterEach(() => vi.restoreAllMocks());

    it('adds an optional controller argument to read tools and a required one to write tools', () => {
        const { tools } = register(['home', 'lab']);
        const read = z.object(tools.get('listSites')?.config.inputSchema ?? {});
        expect(read.safeParse({}).success).toBe(true);
        expect(read.safeParse({ controller: 'lab' }).success).toBe(true);
        const unknown = read.safeParse({ controller: 'nope' });
        expect(unknown.success).toBe(false);
        expect(unknown.error?.issues[0].message).toBe('Unknown controller. Configured controllers: home, lab.');

        const write = z.object(tools.get('setSiteLed')?.config.inputSchema ?? {});
        const missing = write.safeParse({ enable: true });
        expect(missing.success).toBe(false);
        expect(missing.error?.issues[0].message).toContain('controller is required for write tools');
        expect(write.safeParse({ enable: true, controller: 'home' }).success).toBe(true);
        expect(tools.get('listControllers')).toBeDefined();
    });

    it('keeps every tool schema byte-for-byte identical with one profile or plain env config', () => {
        const single = registerSingleEnv();
        const oneProfile = register(['home']).tools;
        oneProfile.delete('listControllers');
        expect([...oneProfile.keys()]).toEqual([...single.keys()]);
        for (const [name, tool] of single) {
            expect(jsonSchema(oneProfile.get(name)?.config.inputSchema ?? {})).toBe(jsonSchema(tool.config.inputSchema));
            expect(oneProfile.get(name)?.config.description).toBe(tool.config.description);
            expect(oneProfile.get(name)?.config.annotations).toEqual(tool.config.annotations);
            expect(JSON.stringify(tool.config.inputSchema)).not.toContain('controller":');
        }
        expect(Object.keys(single.get('listSites')?.config.inputSchema ?? {})).not.toContain('controller');
    });

    it('routes read calls to the named controller and falls back to the default', async () => {
        const { call, clients, factory } = register(['home', 'lab']);
        expect(factory).not.toHaveBeenCalled();
        expect(await call('listSites', {})).toEqual([{ siteId: 'home-site', name: 'home' }]);
        expect(clients.has('lab')).toBe(false);
        expect(await call('listSites', { controller: 'lab' })).toEqual([{ siteId: 'lab-site', name: 'lab' }]);
        expect(clients.get('home')?.listSites).toHaveBeenCalledTimes(1);
        expect(clients.get('lab')?.listSites).toHaveBeenCalledTimes(1);
    });

    it('isolates controller failures: an unreachable controller does not affect the others', async () => {
        const { call } = register(['home', 'down']);
        await expect(call('listSites', { controller: 'down' })).rejects.toThrow('ETIMEDOUT');
        expect(await call('listSites', { controller: 'home' })).toEqual([{ siteId: 'home-site', name: 'home' }]);
    });

    it('refuses writes (even previews) without an explicit controller and audits the controller name', async () => {
        const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        const { call, tools, clients } = register(['home', 'lab']);
        await expect(tools.get('setSiteLed')?.handler({ enable: true }, extra)).rejects.toThrow();
        expect(clients.size).toBe(0);

        const preview = await call('setSiteLed', { enable: false, controller: 'lab' });
        expect(preview).toMatchObject({ mode: 'dry-run', status: 'planned', controller: 'lab' });
        expect(clients.get('lab')?.getLedSetting).toHaveBeenCalledTimes(1);
        expect(clients.get('lab')?.setSiteLedSetting).not.toHaveBeenCalled();
        expect(clients.has('home')).toBe(false);

        const audit = info.mock.calls.find(([message]) => message === 'Mutation audit event');
        expect(audit).toBeDefined();
        expect(JSON.parse(((audit ?? [])[1] as { mutation: string }).mutation)).toMatchObject({
            tool: 'setSiteLed',
            controller: 'lab',
            mode: 'dry-run',
        });
        expect(info).toHaveBeenCalledWith('Tool invoked', expect.objectContaining({ tool: 'setSiteLed', controller: 'lab' }));
        expect(JSON.stringify(info.mock.calls)).not.toContain(PROFILE_SECRET);
    });

    it('logs the controller on failed mutations', async () => {
        const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        const { call, factory } = register(['home', 'lab']);
        factory.mockImplementationOnce(
            () =>
                ({
                    getLedSetting: vi.fn(() => Promise.reject(new Error('controller rejected request'))),
                }) as unknown as OmadaClient
        );
        await expect(call('setSiteLed', { enable: true, controller: 'home' })).rejects.toThrow('controller rejected request');
        expect(error).toHaveBeenCalledWith(
            'Mutation audit event',
            expect.objectContaining({ tool: 'setSiteLed', controller: 'home', status: 'failed' })
        );
        expect(JSON.stringify(error.mock.calls)).not.toContain(PROFILE_SECRET);
    });

    it('routes compact-mode callOperation and exposes the controller argument through describeOperation', async () => {
        const { call } = register(['home', 'lab'], { catalogMode: 'compact' });
        expect(await call('callOperation', { name: 'listSites', arguments: { controller: 'lab' } })).toEqual([{ siteId: 'lab-site', name: 'lab' }]);
        const described = await call('describeOperation', { name: 'setSiteLed' });
        expect(JSON.stringify(described.inputSchema)).toContain('"controller"');
        await expect(call('callOperation', { name: 'setSiteLed', arguments: { enable: true } })).rejects.toThrow();
    });

    it('lists controllers without credentials', async () => {
        const { call } = register(['home', 'lab']);
        const listed = await call('listControllers');
        expect(listed).toEqual({
            defaultController: 'home',
            controllerArgument: 'optional for read tools (defaults to the default controller); required for write tools',
            controllers: [
                { name: 'home', host: 'home.example.com:8043', default: true },
                { name: 'lab', host: 'lab.example.com:8043', default: false },
            ],
        });
        expect(JSON.stringify(listed)).not.toContain(PROFILE_SECRET);
    });
});

describe('selectController', () => {
    const multi = new ControllerRegistry([profile('home'), profile('lab')], 'home');
    const single = new ControllerRegistry([profile('home')], 'home');

    it('defaults reads, refuses implicit writes only with several controllers, and validates names', () => {
        expect(selectController(multi, 'listSites', 'read', undefined)).toBe('home');
        expect(() => selectController(multi, 'setSiteLed', 'write', undefined)).toThrow(
            'setSiteLed changes controller state; pass "controller" explicitly (one of: home, lab).'
        );
        expect(selectController(single, 'setSiteLed', 'write', undefined)).toBe('home');
        expect(selectController(multi, 'setSiteLed', 'write', 'lab')).toBe('lab');
        expect(() => selectController(multi, 'listSites', 'read', 42)).toThrow('controller must be a string (one of: home, lab).');
        expect(() => selectController(multi, 'listSites', 'read', 'nope')).toThrow('Unknown controller "nope". Configured controllers: home, lab.');
    });

    it('describes the argument per permission', () => {
        expect(controllerArgumentSchema(multi, 'read').description).toContain('Defaults to "home"');
        expect(controllerArgumentSchema(multi, 'write').description).toContain('(required)');
    });

    it('merges tools registered by one module per controller', async () => {
        const registry = new ControllerRegistry(
            [profile('home'), profile('lab')],
            'home',
            (config) => ({ id: config.omadacId }) as unknown as OmadaClient
        );
        const tools = routeToolAcrossControllers(
            (server, client) => {
                server.registerTool('whoAmI', { description: 'who', inputSchema: {} }, async () => ({
                    content: [{ type: 'text', text: (client as unknown as { id: string }).id }],
                }));
            },
            'sites',
            'read',
            registry
        );
        expect(tools).toHaveLength(1);
        const result = await tools[0].handler({ controller: 'lab' }, extra);
        expect(result.content[0]).toEqual({ type: 'text', text: 'lab-omadac' });
    });
});
