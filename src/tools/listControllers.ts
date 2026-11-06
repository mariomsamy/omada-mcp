import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ControllerRegistry } from '../controllerRegistry.js';
import { toToolResult, wrapToolHandler } from '../server/common.js';

/**
 * List the controller profiles from OMADA_CONTROLLERS_FILE: names, base URL host, default flag and
 * default site. Never returns credentials, omadacId, URL paths or query strings, and makes no
 * controller request. Registered only when OMADA_CONTROLLERS_FILE is configured.
 */
export function registerListControllersTool(server: McpServer, registry: ControllerRegistry): void {
    server.registerTool(
        'listControllers',
        {
            description:
                'List the configured Omada controllers (name, host, default flag, default site). Pass a name as the "controller" argument of other tools. No credentials are returned.',
            inputSchema: {},
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        wrapToolHandler('listControllers', () =>
            Promise.resolve(
                toToolResult({
                    defaultController: registry.defaultName,
                    controllerArgument: registry.isMulti
                        ? 'optional for read tools (defaults to the default controller); required for write tools'
                        : 'not used: only one controller is configured',
                    controllers: registry.describe(),
                })
            )
        )
    );
}
