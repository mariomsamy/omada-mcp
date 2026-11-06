import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import { ControllerRegistry } from '../../src/controllerRegistry.js';
import type { ToolExtra } from '../../src/server/common.js';
import { registerListControllersTool } from '../../src/tools/listControllers.js';
import { PROFILE_SECRET, profile } from '../helpers/controllers.js';

function harness(registry: ControllerRegistry) {
    let definition: { inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> } | undefined;
    let handler: ((args: Record<string, unknown>, extra: ToolExtra) => Promise<CallToolResult>) | undefined;
    const registerTool = vi.fn((_name: string, config: typeof definition, callback: typeof handler) => {
        definition = config;
        handler = callback;
    });
    registerListControllersTool({ registerTool } as unknown as McpServer, registry);
    return {
        registerTool,
        definition: () => definition,
        invoke: async () => {
            const result = await (handler as NonNullable<typeof handler>)({}, { sessionId: 'test' } as ToolExtra);
            return { result, payload: JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown> };
        },
    };
}

describe('listControllers', () => {
    it('registers a read-only tool without arguments', () => {
        const tool = harness(new ControllerRegistry([profile('home')], 'home'));
        expect(tool.registerTool).toHaveBeenCalledWith('listControllers', expect.anything(), expect.any(Function));
        expect(tool.definition()?.inputSchema).toEqual({});
        expect(tool.definition()?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    });

    it('returns names, hosts, default flag and site, never credentials or URL paths', async () => {
        const tool = harness(new ControllerRegistry([profile('home'), profile('intcore', { siteId: 'main' })], 'intcore'));
        const { result, payload } = await tool.invoke();
        expect(payload).toEqual({
            defaultController: 'intcore',
            controllerArgument: 'optional for read tools (defaults to the default controller); required for write tools',
            controllers: [
                { name: 'home', host: 'home.example.com:8043', default: false },
                { name: 'intcore', host: 'intcore.example.com:8043', default: true, siteId: 'main' },
            ],
        });
        const text = JSON.stringify(result);
        for (const forbidden of [PROFILE_SECRET, '-client', '-omadac', '/some/path']) expect(text).not.toContain(forbidden);
    });

    it('explains that the controller argument is unused with one controller', async () => {
        const { payload } = await harness(new ControllerRegistry([profile('home')], 'home')).invoke();
        expect(payload.controllerArgument).toBe('not used: only one controller is configured');
    });
});
