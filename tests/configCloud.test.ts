import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudBaseUrl, loadConfigFromEnv } from '../src/config.js';
import * as loggerModule from '../src/utils/logger.js';

describe('config: TP-Link cloud region', () => {
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
        env = {
            OMADA_CLOUD_REGION: 'euw1',
            OMADA_CLIENT_ID: 'id',
            OMADA_CLIENT_SECRET: 'secret',
            OMADA_OMADAC_ID: 'controller-id',
        };
        vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds the northbound API URL from the region and keeps strict TLS', () => {
        const config = loadConfigFromEnv(env);
        expect(config.baseUrl).toBe('https://euw1-omada-northbound.tplinkcloud.com');
        expect(config.cloudRegion).toBe('euw1');
        expect(config.strictSsl).toBe(true);
    });

    it('normalises case and whitespace in the region', () => {
        env.OMADA_CLOUD_REGION = '  USE1 ';
        expect(loadConfigFromEnv(env).baseUrl).toBe('https://use1-omada-northbound.tplinkcloud.com');
    });

    it('exposes the URL builder', () => {
        expect(cloudBaseUrl('aps1')).toBe('https://aps1-omada-northbound.tplinkcloud.com');
    });

    it('rejects setting both OMADA_BASE_URL and OMADA_CLOUD_REGION', () => {
        env.OMADA_BASE_URL = 'https://192.168.0.1:8043';
        expect(() => loadConfigFromEnv(env)).toThrow(/not both/);
    });

    it('rejects a region that is not a region code (no URL injection)', () => {
        for (const bad of ['evil.com/x', 'euw1.attacker.net', '../x', 'EUW', '1euw', 'euw1;x']) {
            env.OMADA_CLOUD_REGION = bad;
            expect(() => loadConfigFromEnv(env), bad).toThrow(/OMADA_CLOUD_REGION/);
        }
    });

    it('requires strict TLS in cloud mode', () => {
        env.OMADA_STRICT_SSL = 'false';
        expect(() => loadConfigFromEnv(env)).toThrow(/OMADA_STRICT_SSL=true/);
    });

    it('still works with a local controller URL and no region', () => {
        delete env.OMADA_CLOUD_REGION;
        env.OMADA_BASE_URL = 'https://192.168.0.1:8043/';
        const config = loadConfigFromEnv(env);
        expect(config.baseUrl).toBe('https://192.168.0.1:8043');
        expect(config.cloudRegion).toBeUndefined();
    });

    it('fails clearly when neither a URL nor a region is set', () => {
        delete env.OMADA_CLOUD_REGION;
        expect(() => loadConfigFromEnv(env)).toThrow(/OMADA_BASE_URL/);
    });
});
