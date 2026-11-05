import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerUpdatePortForwardTool } from '../../src/tools/updatePortForward.js';

describe('tools/updatePortForward', () => {
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
            listPortForwardingRules: vi.fn().mockResolvedValue([{ id: 'res-1', name: 'existing' }]),
            modifyPortForwarding: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerUpdatePortForwardTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('updatePortForward');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            {
                siteId: 'site-1',
                portForwardingId: 'res-1',
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
        expect(parseText(result)).toMatchObject({ action: 'update-port-forward', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.modifyPortForwarding).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            {
                ...{
                    siteId: 'site-1',
                    portForwardingId: 'res-1',
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
        expect(mockClient.modifyPortForwarding).toHaveBeenCalledExactlyOnceWith(
            'res-1',
            { name: 'web', status: true, from: 0, forwardIp: '192.168.0.10', externalPort: '8443', forwardPort: '443', protocol: 1, dMZ: false },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'update-port-forward', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.modifyPortForwarding).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                {
                    ...{
                        siteId: 'site-1',
                        portForwardingId: 'res-1',
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
            .then(() =>
                toolHandler(
                    {
                        portForwardingId: 'a/b',
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
                )
            )
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['portForwardingId'], code: 'invalid_string' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('refuses to mutate a resource that the preflight cannot find', async () => {
        await expect(
            toolHandler(
                {
                    siteId: 'site-1',
                    portForwardingId: 'missing-1',
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
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('was not found');
        expect(mockClient.listPortForwardingRules).toHaveBeenCalledTimes(1);
        expect(mockClient.modifyPortForwarding).not.toHaveBeenCalled();
    });
});
