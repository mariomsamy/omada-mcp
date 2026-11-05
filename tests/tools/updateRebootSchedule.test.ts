import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerUpdateRebootScheduleTool } from '../../src/tools/updateRebootSchedule.js';

describe('tools/updateRebootSchedule', () => {
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
            listSiteRebootSchedules: vi.fn().mockResolvedValue([{ id: 'res-1', name: 'existing' }]),
            modifyRebootSchedule: vi.fn().mockResolvedValue({ accepted: true }),
        } as unknown as OmadaClient;
        registerUpdateRebootScheduleTool(mockServer, mockClient);
    });

    it('registers the tool with the expected risk annotation', () => {
        expect(registeredName).toBe('updateRebootSchedule');
        expect(registeredConfig?.annotations?.destructiveHint).toBe(true);
    });

    it('defaults to a dry-run preview without mutating', async () => {
        const result = await toolHandler(
            {
                siteId: 'site-1',
                scheduleId: 'res-1',
                schedule: { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'], time: { timingType: 1, hour: 3, minute: 0 } },
            },
            { sessionId: 's1' }
        );
        expect(parseText(result)).toMatchObject({ action: 'update-reboot-schedule', mode: 'dry-run', status: 'planned' });
        expect(parseText(result).result).toMatchObject({ accepted: true, dryRun: true });
        expect(mockClient.modifyRebootSchedule).not.toHaveBeenCalled();
    });

    it('applies through the official client operation only when dryRun is false', async () => {
        const result = await toolHandler(
            {
                ...{
                    siteId: 'site-1',
                    scheduleId: 'res-1',
                    schedule: { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'], time: { timingType: 1, hour: 3, minute: 0 } },
                },
                dryRun: false,
            },
            { sessionId: 's1' }
        );
        expect(mockClient.modifyRebootSchedule).toHaveBeenCalledExactlyOnceWith(
            'res-1',
            { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'], time: { timingType: 1, hour: 3, minute: 0 } },
            'site-1',
            undefined
        );
        expect(parseText(result)).toMatchObject({ action: 'update-reboot-schedule', mode: 'apply', status: 'submitted' });
    });

    it('propagates controller errors instead of reporting success', async () => {
        vi.mocked(mockClient.modifyRebootSchedule).mockRejectedValueOnce(new Error('Controller rejected the change'));
        await expect(
            toolHandler(
                {
                    ...{
                        siteId: 'site-1',
                        scheduleId: 'res-1',
                        schedule: { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'], time: { timingType: 1, hour: 3, minute: 0 } },
                    },
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('Controller rejected the change');
    });

    it('rejects invalid input before any client call', async () => {
        const error = await Promise.resolve()
            .then(() => toolHandler({ scheduleId: 'res-1', schedule: {} }, { sessionId: 's1' }))
            .then(
                () => undefined,
                (caught: unknown) => caught
            );
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['schedule', 'name'], code: 'invalid_type' }));
        for (const operation of Object.values(mockClient)) expect(operation).not.toHaveBeenCalled();
    });

    it('refuses to mutate a resource that the preflight cannot find', async () => {
        await expect(
            toolHandler(
                {
                    siteId: 'site-1',
                    scheduleId: 'missing-1',
                    schedule: { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'], time: { timingType: 1, hour: 3, minute: 0 } },
                    dryRun: false,
                },
                { sessionId: 's1' }
            )
        ).rejects.toThrow('was not found');
        expect(mockClient.listSiteRebootSchedules).toHaveBeenCalledTimes(1);
        expect(mockClient.modifyRebootSchedule).not.toHaveBeenCalled();
    });
});
