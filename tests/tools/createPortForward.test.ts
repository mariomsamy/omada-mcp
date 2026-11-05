import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerCreatePortForwardTool } from '../../src/tools/createPortForward.js';
import { catalogAnnotations } from '../helpers/toolHarness.js';

describe('tools/createPortForward', () => {
    let mockClient: OmadaClient;
    let registeredName: string | undefined;
    let registeredConfig: { inputSchema: z.ZodRawShape; annotations?: { destructiveHint?: boolean } } | undefined;
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<CallToolResult>;
    const parseText = (result: CallToolResult): Record<string, unknown> => JSON.parse((result.content[0] as { text: string }).text);

    beforeEach(() => {
        const mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredName = name;
                registeredConfig = config;
                toolHandler = (args, extra) => handler(z.object(config.inputSchema).parse(args), extra);
            }),
        } as unknown as McpServer;
        mockClient = {
            createPortForwarding: vi.fn().mockResolvedValue({ id: 'new-1' }),
        } as unknown as OmadaClient;
        registerCreatePortForwardTool(mockServer, mockClient);
    });

    it('registers the tool with the catalog-forced destructive annotation', async () => {
        expect(registeredName).toBe('createPortForward');
        expect(await catalogAnnotations('createPortForward')).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        // A tool module must never declare itself read-only; the catalog derives the hints from its write permission.
        expect(registeredConfig?.annotations).not.toMatchObject({ readOnlyHint: true });
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            {
                siteId: 'site-1',
                payload: {
                    name: 'web',
                    status: true,
                    from: 0,
                    forwardIp: '192.168.0.10',
                    externalPort: '8443',
                    forwardPort: '443',
                    protocol: 1,
                    dMZ: false,
                },
            },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'create-port-forward', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.createPortForwarding).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            {
                ...{
                    siteId: 'site-1',
                    payload: {
                        name: 'web',
                        status: true,
                        from: 0,
                        forwardIp: '192.168.0.10',
                        externalPort: '8443',
                        forwardPort: '443',
                        protocol: 1,
                        dMZ: false,
                    },
                },
                dryRun: false,
            },
            { sessionId: 's1' }
        );
        expect(mockClient.createPortForwarding).toHaveBeenCalledExactlyOnceWith(
            { name: 'web', status: true, from: 0, forwardIp: '192.168.0.10', externalPort: '8443', forwardPort: '443', protocol: 1, dMZ: false },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'create-port-forward', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.createPortForwarding).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                {
                    ...{
                        siteId: 'site-1',
                        payload: {
                            name: 'web',
                            status: true,
                            from: 0,
                            forwardIp: '192.168.0.10',
                            externalPort: '8443',
                            forwardPort: '443',
                            protocol: 1,
                            dMZ: false,
                        },
                    },
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ payload: {} }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['payload', 'name'], code: 'invalid_type' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });
});
