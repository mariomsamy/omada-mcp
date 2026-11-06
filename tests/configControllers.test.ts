import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfigFromEnv } from '../src/config.js';

const SECRET = 'placeholder-secret-value-should-never-appear';

describe('loadConfigFromEnv with OMADA_CONTROLLERS_FILE', () => {
    let dir: string;
    let file: string;

    const write = (content: unknown, mode = 0o600) => {
        writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
        chmodSync(file, mode);
    };
    const controllers = [
        {
            name: 'home',
            baseUrl: 'https://omada-a.example.com',
            clientId: 'id-a',
            clientSecret: SECRET,
            omadacId: 'c-a',
            siteId: 's1',
            timeout: 5000,
        },
        {
            name: 'lab',
            baseUrl: 'https://omada-b.example.com',
            clientId: 'id-b',
            clientSecret: SECRET,
            omadacId: 'c-b',
            strictSsl: false,
            default: true,
        },
    ];

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'omada-config-'));
        file = join(dir, 'controllers.json');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('loads profiles without any single-controller variables and fills legacy fields from the default', () => {
        write({ controllers });
        const config = loadConfigFromEnv({ OMADA_CONTROLLERS_FILE: ` ${file} ` });
        expect(config.defaultController).toBe('lab');
        expect(config.controllerProfiles?.map((profile) => profile.name)).toEqual(['home', 'lab']);
        expect(config).toMatchObject({ baseUrl: 'https://omada-b.example.com', clientId: 'id-b', omadacId: 'c-b', strictSsl: false });
        expect(config.cloudRegion).toBeUndefined();
        expect(config.startupWarnings).toContain('Controller "lab" has strictSsl=false; TLS certificates are not verified for it.');
        expect(config.startupWarnings.join('\n')).not.toContain(SECRET);
    });

    it('maps the default profile timeout and site', () => {
        write({ controllers: [controllers[0]] });
        const config = loadConfigFromEnv({ OMADA_CONTROLLERS_FILE: file });
        expect(config).toMatchObject({ siteId: 's1', requestTimeout: 5000, strictSsl: true, defaultController: 'home' });
    });

    it('ignores single-controller variables with a warning when the file is set', () => {
        write({ controllers });
        const config = loadConfigFromEnv({
            OMADA_CONTROLLERS_FILE: file,
            OMADA_BASE_URL: 'https://ignored.example.com',
            OMADA_CLIENT_SECRET: 'ignored-secret',
            OMADA_CLOUD_REGION: 'euw1',
        });
        expect(config.baseUrl).toBe('https://omada-b.example.com');
        expect(config.startupWarnings).toContain(
            'OMADA_CONTROLLERS_FILE is set, so OMADA_BASE_URL, OMADA_CLOUD_REGION, OMADA_CLIENT_SECRET are ignored.'
        );
        write({ controllers });
        expect(loadConfigFromEnv({ OMADA_CONTROLLERS_FILE: file, OMADA_SITE_ID: 'x' }).startupWarnings).toContain(
            'OMADA_CONTROLLERS_FILE is set, so OMADA_SITE_ID is ignored.'
        );
    });

    it('keeps plain env configuration unchanged when the file variable is blank', () => {
        const config = loadConfigFromEnv({
            OMADA_CONTROLLERS_FILE: '  ',
            OMADA_BASE_URL: 'https://omada.example.com',
            OMADA_CLIENT_ID: 'id',
            OMADA_CLIENT_SECRET: 'secret',
            OMADA_OMADAC_ID: 'c',
        });
        expect(config.controllerProfiles).toBeUndefined();
        expect(config.defaultController).toBeUndefined();
        expect('controllerProfiles' in config).toBe(false);
    });

    it('refuses the HTTP transport', () => {
        write({ controllers });
        expect(() =>
            loadConfigFromEnv({
                OMADA_CONTROLLERS_FILE: file,
                MCP_SERVER_USE_HTTP: 'true',
                MCP_UNSAFE_ENABLE_HTTP: 'true',
                MCP_HTTP_BEARER_TOKEN: 'x'.repeat(40),
            })
        ).toThrow('OMADA_CONTROLLERS_FILE is supported with the stdio transport only');
    });

    it.skipIf(process.platform === 'win32')('refuses group/other readable files and never echoes secrets in errors', () => {
        write({ controllers }, 0o644);
        expect(() => loadConfigFromEnv({ OMADA_CONTROLLERS_FILE: file })).toThrow('must not be accessible by group or others');
        write(`{"controllers":[{"clientSecret":"${SECRET}"`);
        let message = '';
        try {
            loadConfigFromEnv({ OMADA_CONTROLLERS_FILE: file });
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toContain('is not valid JSON');
        expect(message).not.toContain(SECRET);
    });
});
