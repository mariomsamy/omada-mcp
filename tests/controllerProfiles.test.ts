import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONTROLLER_NAME_PATTERN, loadControllerProfiles } from '../src/controllerProfiles.js';

const SECRET = 'placeholder-secret-value-should-never-appear';

const entry = (overrides: Record<string, unknown> = {}) => ({
    name: 'home',
    baseUrl: 'https://omada-a.example.com',
    clientId: 'client-a',
    clientSecret: SECRET,
    omadacId: 'omadac-a',
    ...overrides,
});

/** In-memory file dependencies with a private (0600) regular file by default. */
function memoryFile(content: unknown, stat: Partial<{ isFile: boolean; mode: number; size: number }> = {}) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return {
        platform: 'linux' as NodeJS.Platform,
        stat: () => ({ isFile: () => stat.isFile ?? true, mode: stat.mode ?? 0o100600, size: stat.size ?? text.length }),
        readFile: () => text,
    };
}

function loadError(content: unknown, stat?: Parameters<typeof memoryFile>[1]): string {
    try {
        loadControllerProfiles('/etc/omada/controllers.json', memoryFile(content, stat));
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('expected loadControllerProfiles to throw');
}

describe('loadControllerProfiles', () => {
    it('loads profiles, normalises the base URL and defaults to the first entry', () => {
        const loaded = loadControllerProfiles(
            '/etc/omada/controllers.json',
            memoryFile({
                controllers: [
                    entry({ baseUrl: 'https://omada-a.example.com/', siteId: 'site_1', timeout: 15000 }),
                    entry({ name: 'branch-2', baseUrl: 'https://omada-b.example.com:8043' }),
                ],
            })
        );
        expect(loaded.defaultName).toBe('home');
        expect(loaded.warnings).toEqual([]);
        expect(loaded.profiles).toEqual([
            {
                name: 'home',
                isDefault: true,
                baseUrl: 'https://omada-a.example.com',
                clientId: 'client-a',
                clientSecret: SECRET,
                omadacId: 'omadac-a',
                siteId: 'site_1',
                strictSsl: true,
                caFile: undefined,
                requestTimeout: 15000,
            },
            expect.objectContaining({ name: 'branch-2', isDefault: false, baseUrl: 'https://omada-b.example.com:8043', strictSsl: true }),
        ]);
    });

    it('honours "default": true and warns about strictSsl=false', () => {
        const loaded = loadControllerProfiles(
            '/c.json',
            memoryFile({ controllers: [entry(), entry({ name: 'lab', default: true, strictSsl: false, caFile: '/ca.pem' })] })
        );
        expect(loaded.defaultName).toBe('lab');
        expect(loaded.profiles.map((profile) => profile.isDefault)).toEqual([false, true]);
        expect(loaded.profiles[1]).toMatchObject({ strictSsl: false, caFile: '/ca.pem' });
        expect(loaded.warnings).toEqual(['Controller "lab" has strictSsl=false; TLS certificates are not verified for it.']);
    });

    it.each([
        ['upper case', 'Home'],
        ['leading dash', '-home'],
        ['space', 'my home'],
        ['too long', 'a'.repeat(33)],
        ['empty', ''],
        ['dot', 'home.lan'],
    ])('rejects a bad controller name (%s)', (_label, name) => {
        expect(loadError({ controllers: [entry({ name })] })).toContain('controllers[0].name: name must match');
    });

    it('accepts names that match the documented pattern', () => {
        for (const name of ['a', '0', 'home', 'site_2', 'branch-office', 'a'.repeat(32)]) expect(CONTROLLER_NAME_PATTERN.test(name)).toBe(true);
    });

    it('rejects duplicate names and more than one default', () => {
        const message = loadError({ controllers: [entry({ default: true }), entry({ default: true })] });
        expect(message).toContain('controllers[1].name: duplicate controller name "home"');
        expect(message).toContain('at most one controller may set "default": true');
    });

    it('reports missing and empty required fields by path, never by value', () => {
        const message = loadError({
            controllers: [{ name: 'home', baseUrl: 'https://omada.example.com', clientSecret: SECRET }, entry({ name: 'b', omadacId: '' })],
        });
        expect(message).toContain('controllers[0].clientId: clientId is required');
        expect(message).toContain('controllers[0].omadacId: omadacId is required');
        expect(message).toContain('controllers[1].omadacId: omadacId must not be empty');
        expect(message).not.toContain(SECRET);
    });

    it('rejects unknown keys (typos), bad URLs and an empty or missing controllers list', () => {
        expect(loadError({ controllers: [entry({ clientSecert: SECRET })] })).toMatch(/Unrecognized key.*clientSecert/);
        expect(loadError({ controllers: [entry({ baseUrl: 'not a url' })] })).toContain('controllers[0].baseUrl');
        expect(loadError({ controllers: [entry({ baseUrl: `https://user:${SECRET}@omada.example.com` })] })).not.toContain(SECRET);
        expect(loadError({ controllers: [entry({ baseUrl: 'https://omada.example.com/?token=x' })] })).toContain('without embedded credentials');
        expect(loadError({ controllers: [entry({ baseUrl: 'ftp://omada.example.com' })] })).toContain('baseUrl');
        expect(loadError({ controllers: [entry({ timeout: -1 })] })).toContain('controllers[0].timeout');
        expect(loadError({ controllers: [entry({ strictSsl: 'false' })] })).toContain('strictSsl must be true or false');
        expect(loadError({ controllers: [] })).toContain('at least one controller');
        expect(loadError({})).toContain('controllers must be an array');
        expect(loadError([])).toContain('Invalid OMADA_CONTROLLERS_FILE');
    });

    it('reports invalid JSON without echoing the file content', () => {
        const message = loadError(`{"controllers":[{"clientSecret":"${SECRET}",}]}`);
        expect(message).toBe('OMADA_CONTROLLERS_FILE (/etc/omada/controllers.json) is not valid JSON.');
        expect(message).not.toContain(SECRET);
    });

    it.each([0o100644, 0o100640, 0o100604, 0o100660, 0o100602, 0o100610])('refuses a file with group/other permissions (mode %o)', (mode) => {
        expect(loadError({ controllers: [entry()] }, { mode })).toContain('must not be accessible by group or others');
    });

    it('skips the permission check on Windows', () => {
        const loaded = loadControllerProfiles('C:\\c.json', { ...memoryFile({ controllers: [entry()] }, { mode: 0o100666 }), platform: 'win32' });
        expect(loaded.defaultName).toBe('home');
    });

    it('refuses directories and oversized files', () => {
        expect(loadError({ controllers: [entry()] }, { isFile: false })).toContain('is not a regular file');
        expect(loadError({ controllers: [entry()] }, { size: 2 * 1024 * 1024 })).toContain('larger than 1 MiB');
    });

    it('reports read failures with the error code only', () => {
        const failing = (code?: string) => () => {
            throw Object.assign(new Error(`low-level detail ${SECRET}`), code ? { code } : {});
        };
        const attempt = (dependencies: Parameters<typeof loadControllerProfiles>[1]) => () => loadControllerProfiles('/c.json', dependencies);
        expect(attempt({ ...memoryFile('{}'), stat: failing('ENOENT') })).toThrow('OMADA_CONTROLLERS_FILE (/c.json) cannot be read (ENOENT).');
        expect(attempt({ ...memoryFile('{}'), stat: failing() })).toThrow('OMADA_CONTROLLERS_FILE (/c.json) cannot be read.');
        expect(attempt({ ...memoryFile('{}'), readFile: failing('EACCES') })).toThrow('cannot be read (EACCES).');
        expect(attempt({ ...memoryFile('{}'), readFile: failing() })).toThrow(/^OMADA_CONTROLLERS_FILE \(\/c\.json\) cannot be read\.$/);
    });

    describe('real files', () => {
        let dir: string;
        beforeEach(() => {
            dir = mkdtempSync(join(tmpdir(), 'omada-controllers-'));
        });
        afterEach(() => rmSync(dir, { recursive: true, force: true }));

        it.skipIf(process.platform === 'win32')('loads a 0600 file and refuses the same file at 0644', () => {
            const file = join(dir, 'controllers.json');
            writeFileSync(file, JSON.stringify({ controllers: [entry()] }));
            chmodSync(file, 0o600);
            expect(loadControllerProfiles(file).defaultName).toBe('home');
            chmodSync(file, 0o644);
            expect(() => loadControllerProfiles(file)).toThrow('(mode 644)');
        });

        it('reports a missing file', () => {
            expect(() => loadControllerProfiles(join(dir, 'missing.json'))).toThrow('cannot be read (ENOENT)');
        });
    });
});
