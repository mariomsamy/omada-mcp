import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerListAllSsidsTool } from '../../src/tools/listAllSsids.js';
import * as loggerModule from '../../src/utils/logger.js';

describe('tools/listAllSsids', () => {
    let mockServer: McpServer;
    let mockClient: OmadaClient;
    let toolHandler: (args: unknown, extra: { sessionId?: string }) => Promise<unknown>;

    beforeEach(() => {
        mockServer = {
            registerTool: vi.fn((name, schema, handler) => {
                toolHandler = handler;
            }),
        } as unknown as McpServer;

        mockClient = {
            listAllSsids: vi.fn(),
        } as unknown as OmadaClient;

        vi.spyOn(loggerModule.logger, 'info').mockImplementation(() => {
            // Mock implementation
        });
        vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {
            // Mock implementation
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('registerListAllSsidsTool', () => {
        it('should register the listAllSsids tool with correct schema', () => {
            registerListAllSsidsTool(mockServer, mockClient);
            expect(mockServer.registerTool).toHaveBeenCalledWith('listAllSsids', expect.any(Object), expect.any(Function));
        });

        it('should execute successfully without siteId', async () => {
            const mockData = [{ name: 'MyWifi', security: 'WPA2', enabled: true }];
            (mockClient.listAllSsids as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerListAllSsidsTool(mockServer, mockClient);

            const result = await toolHandler({}, { sessionId: 'test-session' });

            expect(mockClient.listAllSsids).toHaveBeenCalledWith(undefined, undefined, undefined);
            expect(result).toEqual({
                content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
            });
        });

        it('should execute successfully with siteId', async () => {
            const mockData = [{ name: 'GuestWifi', security: 'WPA3', enabled: false }];
            (mockClient.listAllSsids as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerListAllSsidsTool(mockServer, mockClient);

            const result = await toolHandler({ siteId: 'test-site' }, { sessionId: 'test-session' });

            expect(mockClient.listAllSsids).toHaveBeenCalledWith('test-site', undefined, undefined);
            expect(result).toEqual({
                content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
            });
        });

        it('defaults the spec-required device type to 3 and rejects values outside 1-3', async () => {
            registerListAllSsidsTool(mockServer, mockClient);
            const shape = z.object((mockServer.registerTool as ReturnType<typeof vi.fn>).mock.calls[0][1].inputSchema);

            expect(shape.parse({}).type).toBe(3);
            expect(shape.parse({ type: 1 }).type).toBe(1);
            expect(shape.safeParse({ type: 4 }).success).toBe(false);

            (mockClient.listAllSsids as ReturnType<typeof vi.fn>).mockResolvedValue([]);
            await toolHandler({ type: 2 }, { sessionId: 'test-session' });
            expect(mockClient.listAllSsids).toHaveBeenCalledWith(undefined, undefined, 2);
        });

        it('should handle errors', async () => {
            const error = new Error('API error');
            (mockClient.listAllSsids as ReturnType<typeof vi.fn>).mockRejectedValue(error);

            registerListAllSsidsTool(mockServer, mockClient);

            await expect(toolHandler({}, { sessionId: 'test-session' })).rejects.toThrow('API error');

            expect(loggerModule.logger.error).toHaveBeenCalledWith('Tool failed', {
                tool: 'listAllSsids',
                sessionId: 'test-session',
                error: 'API error',
            });
        });
    });
});
