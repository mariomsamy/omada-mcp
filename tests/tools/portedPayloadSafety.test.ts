import { describe, expect, it, vi } from 'vitest';

import {
    assertWebhookChangeConfirmed,
    assessWebhookChange,
    MAX_PAYLOAD_BYTES,
    MAX_PAYLOAD_DEPTH,
    OPENAPI_BODY_KEYS,
    objectPayloadSchema,
    strictPayload,
    unsafeWebhookUrlReason,
} from '../../src/tools/portedToolShared.js';

describe('strict payload allowlists', () => {
    const schema = strictPayload({}, OPENAPI_BODY_KEYS.staticRouting);

    it('accepts documented keys and rejects undocumented ones', () => {
        expect(schema.safeParse({ name: 'r', nextHopIp: ['10.0.0.1'] }).success).toBe(true);
        const result = schema.safeParse({ name: 'r', __proto_payload: 1, adminOverride: true });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]).toMatchObject({ code: 'unrecognized_keys' });
    });

    it('rejects payloads nested deeper than the depth cap', () => {
        let nested: unknown = 'leaf';
        for (let level = 0; level <= MAX_PAYLOAD_DEPTH; level += 1) nested = { level: nested };
        const result = schema.safeParse({ nextHopIp: nested });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]?.message).toContain('nesting');
    });

    it('rejects payloads above the serialized size cap', () => {
        const result = schema.safeParse({ name: 'x'.repeat(MAX_PAYLOAD_BYTES + 1) });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0]?.message).toContain(`${MAX_PAYLOAD_BYTES} bytes`);
    });

    it('objectPayloadSchema restricts nested objects to their component keys', () => {
        const mesh = objectPayloadSchema('mesh', OPENAPI_BODY_KEYS.mesh);
        expect(mesh.safeParse({ meshEnable: true }).success).toBe(true);
        expect(mesh.safeParse({ meshEnable: true, extra: 1 }).success).toBe(false);
    });
});

describe('webhook destination validation', () => {
    it.each([
        'http://hooks.example.com/x',
        'https://127.0.0.1/x',
        'https://localhost/x',
        'https://10.1.2.3/x',
        'https://172.16.0.1/x',
        'https://192.168.1.10/x',
        'https://169.254.169.254/latest',
        'https://100.64.0.1/x',
        'https://[::1]/x',
        'https://[fe80::1]/x',
        'https://[fd00::1]/x',
        'https://[::ffff:10.0.0.1]/x',
        'https://2130706433/x',
        'https://printer.local/x',
        'https://user:pass@hooks.example.com/x',
        'not a url',
    ])('refuses %s', (url) => {
        expect(unsafeWebhookUrlReason(url)).toBeDefined();
    });

    it.each(['https://hooks.example.com/omada', 'https://8.8.8.8/x', 'https://[2001:4860::1]/x'])('allows %s', (url) => {
        expect(unsafeWebhookUrlReason(url)).toBeUndefined();
    });

    const webhookClient = (urlList: string[]) => ({
        getWebhookForGlobal: vi.fn().mockResolvedValue([{ webhookId: 'hook-1', name: 'n', urlList }]),
    });

    it('reports a change, the destination hosts and requires confirmation', async () => {
        const client = webhookClient(['https://hooks.example.com/a?token=secret']);
        const assessment = await assessWebhookChange(
            client,
            { webhookConfig: { webhookEnable: false } },
            { webhookEnable: true, webhookId: 'hook-1' }
        );
        expect(assessment).toMatchObject({ changed: true, destinationHosts: ['hooks.example.com'] });
        expect(JSON.stringify(assessment)).not.toContain('token=secret');
        expect(() => assertWebhookChangeConfirmed(assessment, false)).toThrow('confirmWebhookChange');
        expect(() => assertWebhookChangeConfirmed(assessment, true)).not.toThrow();
    });

    it('does not require confirmation when the webhook is unchanged', async () => {
        const client = webhookClient(['https://hooks.example.com/a']);
        const assessment = await assessWebhookChange(
            client,
            { webhookConfig: { webhookEnable: true, webhookId: 'hook-1' } },
            { webhookEnable: true, webhookId: 'hook-1' }
        );
        expect(assessment.changed).toBe(false);
        expect(() => assertWebhookChangeConfirmed(assessment, false)).not.toThrow();
    });

    it('refuses a webhook profile that delivers to a private address', async () => {
        const client = webhookClient(['https://hooks.example.com/a', 'https://192.168.0.5/internal']);
        await expect(assessWebhookChange(client, {}, { webhookEnable: true, webhookId: 'hook-1' })).rejects.toThrow('192.168.0.5');
    });

    it('refuses an unknown webhook profile and skips lookups when nothing is enabled', async () => {
        const client = webhookClient([]);
        await expect(assessWebhookChange(client, {}, { webhookEnable: true, webhookId: 'other' })).rejects.toThrow('was not found');
        const disabled = await assessWebhookChange(client, { webhookConfig: { webhookEnable: true } }, { webhookEnable: false });
        expect(disabled).toMatchObject({ changed: true, destinationHosts: [] });
        expect(await assessWebhookChange(client, {}, undefined)).toEqual({ changed: false, destinationHosts: [] });
        expect(client.getWebhookForGlobal).toHaveBeenCalledTimes(1);
    });
});
