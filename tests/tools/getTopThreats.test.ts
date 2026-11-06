import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerGetTopThreatsTool } from '../../src/tools/getTopThreats.js';
import * as loggerModule from '../../src/utils/logger.js';

describe('tools/getTopThreats', () => {
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
            getTopThreats: vi.fn(),
        } as unknown as OmadaClient;

        vi.spyOn(Date, 'now').mockReturnValue(1792845296789);
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

    describe('registerGetTopThreatsTool', () => {
        it('should register the getTopThreats tool with correct schema', () => {
            registerGetTopThreatsTool(mockServer, mockClient);
            expect(mockServer.registerTool).toHaveBeenCalledWith('getTopThreats', expect.any(Object), expect.any(Function));
        });

        it('should execute successfully', async () => {
            const mockData = [{ id: 'threat-1', count: 42 }];
            (mockClient.getTopThreats as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerGetTopThreatsTool(mockServer, mockClient);

            const result = await toolHandler({}, { sessionId: 'test-session' });

            expect(mockClient.getTopThreats).toHaveBeenCalledWith(undefined, { start: 1792758896, end: 1792845296 });
            expect(result).toEqual({
                content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
            });
        });

        it('sends the spec-required startTime/endTime window and validates it', async () => {
            (mockClient.getTopThreats as ReturnType<typeof vi.fn>).mockResolvedValue([]);
            registerGetTopThreatsTool(mockServer, mockClient);

            await toolHandler({ start: 1700000000, end: 1700086400 }, { sessionId: 'test-session' });
            expect(mockClient.getTopThreats).toHaveBeenCalledWith(undefined, { start: 1700000000, end: 1700086400 });

            await expect(toolHandler({ end: 1700086400 }, { sessionId: 'test-session' })).rejects.toThrow('start and end must be provided together');
            expect(mockClient.getTopThreats).toHaveBeenCalledTimes(1);
        });

        it('should handle errors', async () => {
            const error = new Error('API error');
            (mockClient.getTopThreats as ReturnType<typeof vi.fn>).mockRejectedValue(error);

            registerGetTopThreatsTool(mockServer, mockClient);

            await expect(toolHandler({}, { sessionId: 'test-session' })).rejects.toThrow('API error');

            expect(loggerModule.logger.error).toHaveBeenCalledWith('Tool failed', {
                tool: 'getTopThreats',
                sessionId: 'test-session',
                error: 'API error',
            });
        });
    });
});
