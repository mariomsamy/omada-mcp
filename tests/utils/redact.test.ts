import { describe, expect, it } from 'vitest';
import {
    isLikelySensitiveString,
    isSensitiveField,
    isSensitiveKey,
    maskValue,
    redactSecrets,
    redactSecretsInText,
    scrubPersonalData,
    scrubPersonalDataDeep,
} from '../../src/utils/redact.js';

describe('redact', () => {
    describe('isSensitiveKey', () => {
        it('matches known secret field names regardless of casing', () => {
            expect(isSensitiveKey('Authorization')).toBe(true);
            expect(isSensitiveKey('token')).toBe(true);
            expect(isSensitiveKey('clientSecret')).toBe(true);
            expect(isSensitiveKey('PASSWORD')).toBe(true);
            expect(isSensitiveKey('Cookie')).toBe(true);
            expect(isSensitiveKey('client-id')).toBe(true);
            expect(isSensitiveKey('client_id')).toBe(true);
            expect(isSensitiveKey('clientId')).toBe(true);
            expect(isSensitiveKey('customHeaders')).toBe(true);
            expect(isSensitiveKey('PSK')).toBe(true);
            expect(isSensitiveKey('key')).toBe(true);
            expect(isSensitiveKey('pin')).toBe(true);
            expect(isSensitiveKey('securityKey')).toBe(true);
        });

        it('does not match non-sensitive field names', () => {
            expect(isSensitiveKey('X-Trace')).toBe(false);
            expect(isSensitiveKey('siteId')).toBe(false);
            expect(isSensitiveKey('value')).toBe(false);
        });
    });

    describe('maskValue', () => {
        it('fully masks short strings to avoid partial disclosure', () => {
            expect(maskValue('short')).toBe('********');
            // 12-char value is still fully masked (boundary)
            expect(maskValue('abcdefghijkl')).toBe('********');
        });

        it('fully masks long strings without revealing a prefix or suffix', () => {
            expect(maskValue('verylongsecretvalue')).toBe('********');
        });

        it('masks arrays and objects', () => {
            expect(maskValue(['a', 'b'])).toEqual(['********', '********']);
            expect(maskValue({ secret: 'value' })).toBe('[masked-object]');
        });

        it('masks non-string primitives', () => {
            expect(maskValue(12345)).toBe('********');
            expect(maskValue(null)).toBe('********');
        });
    });

    describe('isLikelySensitiveString', () => {
        it('flags long credential-like strings', () => {
            expect(isLikelySensitiveString('abcd1234abcd1234abcd')).toBe(true);
        });

        it('ignores short strings', () => {
            expect(isLikelySensitiveString('safe')).toBe(false);
            expect(isLikelySensitiveString('hello world')).toBe(false);
        });
    });
});

describe('redactSecrets', () => {
    it('redacts nested secret fields and array elements without mutating the input', () => {
        const original = {
            siteId: 'site-123',
            mac: 'AA:BB:CC:DD:EE:FF',
            enabled: true,
            password: 'very-long-password-with-recognizable-ends',
            nested: [
                {
                    privateKey: 'private-key',
                    private_key: 'private-key-2',
                    preSharedKey: 'shared',
                    passphrase: 'phrase',
                    community: 'snmp',
                    key: 'key-value',
                    psk: 'psk-value',
                    pin: 1234,
                },
            ],
            customHeaders: { Authorization: 'Bearer secret' },
            token: ['one-secret', 'two-secrets'],
        };
        const copy = structuredClone(original);
        expect(redactSecrets(original)).toEqual({
            siteId: 'site-123',
            mac: 'AA:BB:CC:DD:EE:FF',
            enabled: true,
            password: '********',
            nested: [
                {
                    privateKey: '********',
                    private_key: '********',
                    preSharedKey: '********',
                    passphrase: '********',
                    community: '********',
                    key: '********',
                    psk: '********',
                    pin: '********',
                },
            ],
            customHeaders: '[masked-object]',
            token: ['********', '********'],
        });
        expect(original).toEqual(copy);
    });

    it.each([null, undefined, false, 42, 'ordinary value'])('preserves non-object output %s', (value) => {
        expect(redactSecrets(value)).toBe(value);
    });
});

describe('extended secret key coverage', () => {
    const omadaSecretKeys = [
        'radiusPwd',
        'accountingServerPwd',
        'md5Key',
        'simpleKey',
        'authCode',
        'pinCode',
        'newPinCode',
        'remoteAccessPin',
        'wpaPsk',
        'snmpCommunity',
        'shardedSecret',
        'apiToken',
        'adminPass',
        'pppoePassword',
    ];

    it.each(omadaSecretKeys)('masks %s including short values', (key) => {
        expect(isSensitiveKey(key)).toBe(true);
        expect(redactSecrets({ [key]: 'abc', siteId: 'site-1' })).toEqual({ [key]: '********', siteId: 'site-1' });
    });

    it.each([
        'portMapping',
        'dhcpSnooping',
        'pingTarget',
        'keyword',
        'bypassList',
        'passiveMode',
        'keepAliveInterval',
        'siteId',
        'mac',
        'name',
    ])('keeps ordinary configuration field %s readable', (key) => {
        expect(isSensitiveKey(key)).toBe(false);
    });

    it('masks secret-keyed pairs inside free text without hiding the rest', () => {
        expect(redactSecretsInText('Invalid radiusPwd=hunter2 for site 5f9b')).toBe('Invalid radiusPwd="********" for site 5f9b');
        expect(redactSecretsInText('{"md5Key":"k1","name":"ospf"}')).toBe('{"md5Key":"********","name":"ospf"}');
        expect(redactSecretsInText('pinCode: 1234, enable: true')).toBe('pinCode: "********", enable: true');
        expect(redactSecretsInText('Controller rejected the change')).toBe('Controller rejected the change');
    });

    describe('key scoping by parent (L2)', () => {
        it('keeps the event-type key readable inside log and audit notification collections', () => {
            const settings = {
                logNotifications: [{ key: 'EVENT_AP_DISCONNECTED', shortMsg: 'AP disconnected', alert: true, email: false }],
                alertNotifications: [{ key: 'ALERT_WAN_DOWN', enable: true }],
                eventNotifications: [{ key: 'EVENT_CLIENT_JOIN', enable: false }],
                auditLogNotifications: [{ key: 'AUDIT_ADMIN', webhook: true }],
            };
            expect(redactSecrets(settings)).toEqual(settings);
        });

        it('keeps the log key readable in event and alert log entries', () => {
            const entry = { id: 'log1', key: 'EVENT_X', module: 'System', content: 'text', time: 1 };
            expect(redactSecrets({ data: [entry] })).toEqual({ data: [entry] });
        });

        it('still masks a bare key elsewhere and secret fields inside notification entries', () => {
            expect(redactSecrets({ vrrp: { authentication: 1, key: 'vrrp-secret' } })).toEqual({ vrrp: { authentication: 1, key: '********' } });
            expect(redactSecrets({ key: 'top-level' })).toEqual({ key: '********' });
            expect(redactSecrets({ logNotifications: [{ key: 'E', password: 'p' }] })).toEqual({
                logNotifications: [{ key: 'E', password: '********' }],
            });
            expect(isSensitiveField('key')).toBe(true);
            expect(isSensitiveField('Key', 'LogNotifications')).toBe(false);
            expect(isSensitiveField('securityKey', 'logNotifications')).toBe(true);
            expect(isSensitiveField('key', 'items', { module: 'm', content: 'c' })).toBe(true);
        });
    });

    describe('scrubPersonalData (L5)', () => {
        it('replaces MAC, IPv4 and IPv6 addresses in free text', () => {
            expect(scrubPersonalData('/sites/s1/clients/AA-BB-CC-DD-EE-FF')).toBe('/sites/s1/clients/[mac]');
            expect(scrubPersonalData('aa:bb:cc:dd:ee:ff at 10.0.0.2')).toBe('[mac] at [ip]');
            expect(scrubPersonalData('host fe80::1 and 2001:db8:0:0:0:0:0:1')).toBe('host [ip] and [ip]');
            expect(scrubPersonalData('/openapi/v1/omadac/sites/site-1/devices')).toBe('/openapi/v1/omadac/sites/site-1/devices');
        });

        it('scrubs strings nested in objects and arrays', () => {
            expect(scrubPersonalDataDeep({ a: ['10.1.1.1', 3], b: { c: 'AA-BB-CC-DD-EE-FF' }, d: null })).toEqual({
                a: ['[ip]', 3],
                b: { c: '[mac]' },
                d: null,
            });
        });
    });
});
