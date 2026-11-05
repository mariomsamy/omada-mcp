import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    assertWebhookChangeConfirmed,
    assessWebhookChange,
    checkWebhookDestination,
    configureWebhookPolicy,
    diffFields,
    MAX_PAYLOAD_BYTES,
    MAX_PAYLOAD_DEPTH,
    OPENAPI_BODY_KEYS,
    objectPayloadSchema,
    strictPayload,
    unsafeWebhookUrlReason,
} from '../../src/tools/portedToolShared.js';
import { OPENAPI_NESTED_KEYS } from '../../src/utils/openapiNestedKeys.js';

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
    beforeEach(() => {
        // Never touch real DNS in tests.
        configureWebhookPolicy({ allowedHosts: undefined, resolve: async () => ['93.184.216.34'] });
    });

    describe('DNS resolution and allowlist (M3)', () => {
        const resolveTo = (addresses: string[]) => vi.fn(async () => addresses);

        it.each([['127.0.0.1'], ['10.0.0.8'], ['169.254.169.254'], ['::1'], ['fe80::1'], ['93.184.216.34', '192.168.1.1']])(
            'refuses a public-looking host that resolves to %s',
            async (...addresses) => {
                const resolve = resolveTo(addresses);
                await expect(checkWebhookDestination('https://hooks.example.com/x', { resolve })).resolves.toBe(
                    'host resolves to a loopback, private, link-local or reserved address'
                );
                expect(resolve).toHaveBeenCalledWith('hooks.example.com');
            }
        );

        it('accepts a host that resolves only to public addresses', async () => {
            await expect(
                checkWebhookDestination('https://hooks.example.com/x', { resolve: resolveTo(['93.184.216.34', '2606:2800::1']) })
            ).resolves.toBeUndefined();
        });

        it('refuses unresolvable hosts and empty answers', async () => {
            const failing = vi.fn(() => Promise.reject(new Error('ENOTFOUND')));
            await expect(checkWebhookDestination('https://missing.example.com/x', { resolve: failing })).resolves.toBe('host could not be resolved');
            await expect(checkWebhookDestination('https://missing.example.com/x', { resolve: resolveTo([]) })).resolves.toBe(
                'host could not be resolved'
            );
        });

        it('does not resolve IP literals and still applies the literal rules first', async () => {
            const resolve = resolveTo(['10.0.0.1']);
            await expect(checkWebhookDestination('https://8.8.8.8/x', { resolve })).resolves.toBeUndefined();
            await expect(checkWebhookDestination('http://hooks.example.com/x', { resolve })).resolves.toBe('only https:// webhook URLs are allowed');
            expect(resolve).not.toHaveBeenCalled();
        });

        it('enforces OMADA_WEBHOOK_ALLOWED_HOSTS (exact and *.subdomain entries) before resolving', async () => {
            const resolve = resolveTo(['93.184.216.34']);
            const allowedHosts = ['hooks.example.com', '*.alerts.example.net'];
            await expect(checkWebhookDestination('https://hooks.example.com/x', { resolve, allowedHosts })).resolves.toBeUndefined();
            await expect(checkWebhookDestination('https://a.alerts.example.net/x', { resolve, allowedHosts })).resolves.toBeUndefined();
            await expect(checkWebhookDestination('https://alerts.example.net/x', { resolve, allowedHosts })).resolves.toBe(
                'host is not in OMADA_WEBHOOK_ALLOWED_HOSTS'
            );
            await expect(checkWebhookDestination('https://evil.example.org/x', { resolve, allowedHosts })).resolves.toBe(
                'host is not in OMADA_WEBHOOK_ALLOWED_HOSTS'
            );
            // The allowlist never overrides the private-address check.
            await expect(checkWebhookDestination('https://hooks.example.com/x', { resolve: resolveTo(['10.1.1.1']), allowedHosts })).resolves.toBe(
                'host resolves to a loopback, private, link-local or reserved address'
            );
        });

        it('applies the configured policy inside assessWebhookChange', async () => {
            configureWebhookPolicy({ allowedHosts: ['Other.Example.com.'], resolve: resolveTo(['93.184.216.34']) });
            const client = { getWebhookForGlobal: vi.fn().mockResolvedValue([{ webhookId: 'hook-1', urlList: ['https://hooks.example.com/a'] }]) };
            await expect(assessWebhookChange(client, {}, { webhookEnable: true, webhookId: 'hook-1' })).rejects.toThrow(
                'Webhook profile hook-1 delivers to hooks.example.com, which is not allowed: host is not in OMADA_WEBHOOK_ALLOWED_HOSTS.'
            );
            configureWebhookPolicy({ allowedHosts: undefined, resolve: resolveTo(['192.168.0.9']) });
            await expect(assessWebhookChange(client, {}, { webhookEnable: true, webhookId: 'hook-1' })).rejects.toThrow(
                'host resolves to a loopback'
            );
        });
    });

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

describe('nested payload allowlists (M4)', () => {
    const lan = strictPayload({}, OPENAPI_BODY_KEYS.lanNetwork, OPENAPI_NESTED_KEYS.lanNetwork);

    it('accepts documented nested keys, including array items', () => {
        const ok = lan.safeParse({
            name: 'lan',
            dhcpSettingsVO: {
                enable: true,
                ipRangePool: [{ ipaddrStart: '10.0.0.10', ipaddrEnd: '10.0.0.99' }],
                options: [{ code: 6, type: 1, value: 'x' }],
            },
            lanNetworkIpv6Config: { enable: 1, ra: { enable: 1 } },
        });
        expect(ok.success).toBe(true);
    });

    it.each([
        [{ dhcpSettingsVO: { enable: true, adminBypass: 1 } }, ['dhcpSettingsVO']],
        [{ dhcpSettingsVO: { ipRangePool: [{ ipaddrStart: 'a' }, { ipaddrStart: 'b', evil: 1 }] } }, ['dhcpSettingsVO', 'ipRangePool', 1]],
        [{ lanNetworkIpv6Config: { ra: { enable: 1, hidden: true } } }, ['lanNetworkIpv6Config', 'ra']],
    ])('rejects an undocumented nested key in %j', (payload, path) => {
        const result = lan.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ code: 'unrecognized_keys', path }));
    });

    it('covers the WAN port, rate-limit customSetting and RF planning customSetting bodies', () => {
        const wan = strictPayload({}, OPENAPI_BODY_KEYS.internetPort, OPENAPI_NESTED_KEYS.internetPort);
        expect(
            wan.safeParse({ wanPortSetting: { portId: 'p1', wanPortIpv4Setting: { protoType: 0, ipv4Static: { ipAddress: '1.1.1.2' } } } }).success
        ).toBe(true);
        expect(wan.safeParse({ wanPortSetting: { portId: 'p1', wanPortIpv4Setting: { ipv4Static: { shell: 'x' } } } }).success).toBe(false);
        const rate = strictPayload({}, OPENAPI_BODY_KEYS.ssidRateLimit, OPENAPI_NESTED_KEYS.ssidRateLimit);
        expect(rate.safeParse({ clientRateLimit: { customSetting: { downLimitEnable: true } } }).success).toBe(true);
        expect(rate.safeParse({ clientRateLimit: { customSetting: { unknownLimit: 1 } } }).success).toBe(false);
        const rf = strictPayload({}, ['mode', 'customSetting'], OPENAPI_NESTED_KEYS.rfPlanningConfig);
        expect(rf.safeParse({ mode: 1, customSetting: { advancedSetting: { powerRange: { maxPower2g: 20 } } } }).success).toBe(true);
        expect(rf.safeParse({ mode: 1, customSetting: { advancedSetting: { powerRange: { turbo: 1 } } } }).success).toBe(false);
    });

    it('leaves map-typed objects (lanNetworkVlanIds) free-form', () => {
        const ssid = strictPayload({}, OPENAPI_BODY_KEYS.createSsid, OPENAPI_NESTED_KEYS.createSsid);
        expect(ssid.safeParse({ vlanSetting: { mode: 1, customConfig: { customMode: 0, lanNetworkVlanIds: { 'net-1': [10] } } } }).success).toBe(
            true
        );
        expect(ssid.safeParse({ vlanSetting: { mode: 1, customConfig: { customMode: 0, extra: 1 } } }).success).toBe(false);
    });
});

describe('dry-run field diff (M4)', () => {
    it('reports changed nested fields with before and planned values and counts unchanged ones', () => {
        const before = { name: 'lan', dhcpSettingsVO: { enable: true, leasetime: 120, priDns: '1.1.1.1' }, vlan: 10 };
        expect(diffFields(before, { name: 'lan', dhcpSettingsVO: { enable: false, leasetime: 120 }, igmpSnoopEnable: true })).toEqual({
            changed: [
                { path: 'dhcpSettingsVO.enable', before: true, planned: false },
                { path: 'igmpSnoopEnable', planned: true },
            ],
            unchangedCount: 2,
        });
    });

    it('compares arrays as whole values and resolves the base sub-object', () => {
        const ssid = { ssidId: 's', macFilter: { macFilterEnable: false, ouiProfileIdList: ['a'] } };
        expect(diffFields(ssid, { macFilterEnable: true, ouiProfileIdList: ['a'] }, ['macFilter'])).toEqual({
            changed: [{ path: 'macFilterEnable', before: false, planned: true }],
            unchangedCount: 1,
        });
        expect(diffFields(undefined, { a: 1 }, ['missing'])).toEqual({ changed: [{ path: 'a', planned: 1 }], unchangedCount: 0 });
    });

    it('masks secret values while still detecting the change', () => {
        expect(diffFields({ pskSetting: { securityKey: 'old-secret' } }, { pskSetting: { securityKey: 'new-secret' } })).toEqual({
            changed: [{ path: 'pskSetting.securityKey', before: '********', planned: '********' }],
            unchangedCount: 0,
        });
        expect(diffFields({ radius: { password: 'same' } }, { radius: { password: 'same' } })).toEqual({ changed: [], unchangedCount: 1 });
    });
});
