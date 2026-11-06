import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerGetDashboardTrafficActivitiesTool } from '../../src/tools/getDashboardTrafficActivities.js';
import * as loggerModule from '../../src/utils/logger.js';

describe('tools/getDashboardTrafficActivities', () => {
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
            getDashboardTrafficActivities: vi.fn(),
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

    describe('registerGetDashboardTrafficActivitiesTool', () => {
        it('should register the getDashboardTrafficActivities tool with correct schema', () => {
            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);
            expect(mockServer.registerTool).toHaveBeenCalledWith('getDashboardTrafficActivities', expect.any(Object), expect.any(Function));
        });

        it('should execute successfully without siteId', async () => {
            const mockData = [{ timestamp: 1000, upload: 500, download: 1000 }];
            (mockClient.getDashboardTrafficActivities as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);

            const result = await toolHandler({}, { sessionId: 'test-session' });

            expect(mockClient.getDashboardTrafficActivities).toHaveBeenCalledWith(undefined, undefined, { start: 1792841696, end: 1792845296 });
            expect(result).toEqual({
                content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
            });
        });

        it('should pass siteId when provided', async () => {
            const mockData = [{ timestamp: 1000 }];
            (mockClient.getDashboardTrafficActivities as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);

            await toolHandler({ siteId: 'test-site' }, { sessionId: 'test-session' });

            expect(mockClient.getDashboardTrafficActivities).toHaveBeenCalledWith('test-site', undefined, { start: 1792841696, end: 1792845296 });
        });

        it('sends the spec-required start/end window, defaulting to the last hour', async () => {
            (mockClient.getDashboardTrafficActivities as ReturnType<typeof vi.fn>).mockResolvedValue({});
            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);

            await toolHandler({ start: 1700000000, end: 1700003600 }, { sessionId: 'test-session' });

            expect(mockClient.getDashboardTrafficActivities).toHaveBeenCalledWith(undefined, undefined, { start: 1700000000, end: 1700003600 });
        });

        it('rejects a half-open or empty window before calling the controller', async () => {
            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);

            await expect(toolHandler({ start: 1700000000 }, { sessionId: 'test-session' })).rejects.toThrow(
                'start and end must be provided together'
            );
            await expect(toolHandler({ start: 1700003600, end: 1700000000 }, { sessionId: 'test-session' })).rejects.toThrow(
                'start must be earlier than end'
            );
            expect(mockClient.getDashboardTrafficActivities).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            const error = new Error('API error');
            (mockClient.getDashboardTrafficActivities as ReturnType<typeof vi.fn>).mockRejectedValue(error);

            registerGetDashboardTrafficActivitiesTool(mockServer, mockClient);

            await expect(toolHandler({}, { sessionId: 'test-session' })).rejects.toThrow('API error');

            expect(loggerModule.logger.error).toHaveBeenCalledWith('Tool failed', {
                tool: 'getDashboardTrafficActivities',
                sessionId: 'test-session',
                error: 'API error',
            });
        });
    });
});
