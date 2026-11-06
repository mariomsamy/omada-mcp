import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerGetDashboardSwitchSummaryTool } from '../../src/tools/getDashboardSwitchSummary.js';
import * as loggerModule from '../../src/utils/logger.js';

describe('tools/getDashboardSwitchSummary', () => {
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
            getDashboardSwitchSummary: vi.fn(),
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

    describe('registerGetDashboardSwitchSummaryTool', () => {
        it('should register the getDashboardSwitchSummary tool with correct schema', () => {
            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);
            expect(mockServer.registerTool).toHaveBeenCalledWith('getDashboardSwitchSummary', expect.any(Object), expect.any(Function));
        });

        it('should execute successfully without siteId', async () => {
            const mockData = { total: 5, activePorts: 24, poeUsed: 60 };
            (mockClient.getDashboardSwitchSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);

            const result = await toolHandler({}, { sessionId: 'test-session' });

            expect(mockClient.getDashboardSwitchSummary).toHaveBeenCalledWith(undefined, undefined, { start: 1792841696, end: 1792845296 });
            expect(result).toEqual({
                structuredContent: mockData,
                content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
            });
        });

        it('should pass siteId when provided', async () => {
            const mockData = { total: 5 };
            (mockClient.getDashboardSwitchSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);

            await toolHandler({ siteId: 'test-site' }, { sessionId: 'test-session' });

            expect(mockClient.getDashboardSwitchSummary).toHaveBeenCalledWith('test-site', undefined, { start: 1792841696, end: 1792845296 });
        });

        it('sends the spec-required start/end window, defaulting to the last hour', async () => {
            (mockClient.getDashboardSwitchSummary as ReturnType<typeof vi.fn>).mockResolvedValue({});
            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);

            await toolHandler({ start: 1700000000, end: 1700003600 }, { sessionId: 'test-session' });

            expect(mockClient.getDashboardSwitchSummary).toHaveBeenCalledWith(undefined, undefined, { start: 1700000000, end: 1700003600 });
        });

        it('rejects a half-open or empty window before calling the controller', async () => {
            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);

            await expect(toolHandler({ start: 1700000000 }, { sessionId: 'test-session' })).rejects.toThrow(
                'start and end must be provided together'
            );
            await expect(toolHandler({ start: 1700003600, end: 1700000000 }, { sessionId: 'test-session' })).rejects.toThrow(
                'start must be earlier than end'
            );
            expect(mockClient.getDashboardSwitchSummary).not.toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            const error = new Error('API error');
            (mockClient.getDashboardSwitchSummary as ReturnType<typeof vi.fn>).mockRejectedValue(error);

            registerGetDashboardSwitchSummaryTool(mockServer, mockClient);

            await expect(toolHandler({}, { sessionId: 'test-session' })).rejects.toThrow('API error');

            expect(loggerModule.logger.error).toHaveBeenCalledWith('Tool failed', {
                tool: 'getDashboardSwitchSummary',
                sessionId: 'test-session',
                error: 'API error',
            });
        });
    });
});
