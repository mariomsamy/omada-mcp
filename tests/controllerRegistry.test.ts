import { describe, expect, it, vi } from 'vitest';

import type { OmadaConnectionConfig } from '../src/config.js';
import { ControllerRegistry } from '../src/controllerRegistry.js';
import { OmadaClient } from '../src/omadaClient/index.js';
import { profile, PROFILE_SECRET as SECRET } from './helpers/controllers.js';

describe('ControllerRegistry', () => {
    it('validates its profiles', () => {
        expect(() => new ControllerRegistry([], 'home')).toThrow('At least one controller profile is required.');
        expect(() => new ControllerRegistry([profile('home')], 'other')).toThrow('Default controller "other" is not configured.');
    });

    it('resolves names, falls back to the default and lists valid names for unknown ones', () => {
        const registry = new ControllerRegistry([profile('home'), profile('lab')], 'lab');
        expect(registry.isMulti).toBe(true);
        expect(registry.names).toEqual(['home', 'lab']);
        expect(registry.resolve()).toBe('lab');
        expect(registry.resolve('home')).toBe('home');
        expect(() => registry.resolve('nope')).toThrow('Unknown controller "nope". Configured controllers: home, lab.');
        expect(new ControllerRegistry([profile('home')], 'home').isMulti).toBe(false);
    });

    it('creates one client per controller lazily, without the profile name or default flag', () => {
        const factory = vi.fn((config: OmadaConnectionConfig) => ({ config }) as unknown as OmadaClient);
        const registry = new ControllerRegistry([profile('home'), profile('lab', { siteId: 's1' })], 'home', factory);
        expect(factory).not.toHaveBeenCalled();
        const home = registry.getClient('home');
        expect(registry.getClient('home')).toBe(home);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory).toHaveBeenCalledWith({
            baseUrl: 'https://home.example.com:8043/some/path',
            clientId: 'home-client',
            clientSecret: SECRET,
            omadacId: 'home-omadac',
            strictSsl: true,
        });
        registry.getClient('lab');
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it('lazyClient defers construction and binds methods to the real client', async () => {
        class FakeClient {
            readonly label: string;
            constructor(config: OmadaConnectionConfig) {
                this.label = config.omadacId;
            }
            whoAmI(): Promise<string> {
                return Promise.resolve(this.label);
            }
        }
        const factory = vi.fn((config: OmadaConnectionConfig) => new FakeClient(config) as unknown as OmadaClient);
        const registry = new ControllerRegistry([profile('home'), profile('lab')], 'home', factory);
        const lazy = registry.lazyClient('lab') as unknown as FakeClient;
        expect(factory).not.toHaveBeenCalled();
        const method = lazy.whoAmI;
        await expect(method()).resolves.toBe('lab-omadac');
        expect(lazy.label).toBe('lab-omadac');
        expect(factory).toHaveBeenCalledTimes(1);
        expect(() => registry.lazyClient('nope')).toThrow('Unknown controller');
    });

    it('builds real OmadaClient instances by default', () => {
        const registry = new ControllerRegistry([profile('home')], 'home');
        expect(registry.getClient('home')).toBeInstanceOf(OmadaClient);
    });

    it('describes controllers with host only and no credentials', () => {
        const registry = new ControllerRegistry([profile('home', { siteId: 'site-1' }), profile('lab')], 'home');
        const described = registry.describe();
        expect(described).toEqual([
            { name: 'home', host: 'home.example.com:8043', default: true, siteId: 'site-1' },
            { name: 'lab', host: 'lab.example.com:8043', default: false },
        ]);
        const text = JSON.stringify(described);
        for (const forbidden of [SECRET, 'client', 'omadac', '/some/path', 'https']) expect(text).not.toContain(forbidden);
    });
});
