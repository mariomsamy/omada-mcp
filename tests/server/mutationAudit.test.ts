import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolExtra } from '../../src/server/common.js';
import { buildMutationAuditRecord, toMutationResult, wrapMutationToolHandler } from '../../src/server/common.js';
import { logger } from '../../src/utils/logger.js';

const SITE_ID = '5f9b1c2d3e4f5a6b7c8d9e0f';
const NETWORK_ID = '64f1a2b3c4d5e6f708192a3b';

function auditEvents(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
    return spy.mock.calls
        .filter(([message]) => message === 'Mutation audit event')
        .map(([, fields]) => JSON.parse((fields as { mutation: string }).mutation) as Record<string, unknown>);
}

describe('mutation audit events', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps action, target, siteId and summary readable (24-hex IDs and MACs survive)', () => {
        const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        toMutationResult(
            {
                action: 'delete-lan-network',
                target: NETWORK_ID,
                siteId: SITE_ID,
                mode: 'apply',
                status: 'applied',
                summary: `Requested LAN network deletion for ${NETWORK_ID} (gateway AA-BB-CC-DD-EE-FF).`,
                result: { mac: 'AA-BB-CC-DD-EE-FF', before: { name: 'Cameras' } },
            },
            { tool: 'deleteLanNetwork', sessionId: 'session-1' }
        );
        const [event] = auditEvents(info);
        expect(event).toEqual({
            tool: 'deleteLanNetwork',
            action: 'delete-lan-network',
            target: NETWORK_ID,
            siteId: SITE_ID,
            mode: 'apply',
            status: 'submitted',
            summary: `Requested LAN network deletion for ${NETWORK_ID} (gateway AA-BB-CC-DD-EE-FF).`,
            sessionId: 'session-1',
            result: { mac: 'AA-BB-CC-DD-EE-FF', before: { name: 'Cameras' } },
        });
    });

    it('masks short secrets under secret-looking keys in the audit event and tool result', () => {
        const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
        const result = toMutationResult({
            action: 'update-radius-profile',
            target: NETWORK_ID,
            mode: 'dry-run',
            status: 'planned',
            summary: 'Planned update.',
            result: { before: { radiusPwd: 'hunter2', md5Key: 'k', pinCode: '1234', remoteAccessPin: '42', name: 'ok' } },
        });
        const serialized = JSON.stringify(auditEvents(info)[0]);
        for (const secret of ['hunter2', '"k"', '1234', '"42"']) expect(serialized).not.toContain(secret);
        expect(serialized).toContain('"name":"ok"');
        expect(JSON.stringify(result.structuredContent)).not.toContain('hunter2');
        expect((result.structuredContent?.result as { before: Record<string, unknown> }).before).toEqual({
            radiusPwd: '********',
            md5Key: '********',
            pinCode: '********',
            remoteAccessPin: '********',
            name: 'ok',
        });
    });

    it('buildMutationAuditRecord omits absent optional fields', () => {
        expect(buildMutationAuditRecord({ action: 'a', target: 't', mode: 'dry-run', status: 'planned', summary: 's' })).toEqual({
            action: 'a',
            target: 't',
            mode: 'dry-run',
            status: 'planned',
            summary: 's',
        });
    });

    it('redacts secret-keyed values from the failure audit error', async () => {
        const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        const wrapped = wrapMutationToolHandler(
            'failing',
            () => ({ action: 'a', target: 't', mode: 'apply', status: 'applied', summary: 's' }),
            () => Promise.reject(new Error('rejected radiusPwd=hunter2 for network'))
        );
        await expect(wrapped({ dryRun: false }, { sessionId: 's' } as unknown as ToolExtra)).rejects.toThrow();
        const failure = error.mock.calls.find(([message]) => message === 'Mutation audit event');
        expect(failure?.[1]).toMatchObject({ tool: 'failing', status: 'failed', error: 'rejected radiusPwd="********" for network' });
    });
});
