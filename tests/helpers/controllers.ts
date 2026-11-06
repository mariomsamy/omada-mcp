import type { ControllerProfile } from '../../src/controllerProfiles.js';

/** Placeholder secret used to prove credentials never reach logs, errors or results. */
export const PROFILE_SECRET = 'placeholder-secret-value-should-never-appear';

/** A placeholder controller profile (example.com host, fake credentials). */
export function profile(name: string, overrides: Partial<ControllerProfile> = {}): ControllerProfile {
    return {
        name,
        isDefault: false,
        baseUrl: `https://${name}.example.com:8043/some/path`,
        clientId: `${name}-client`,
        clientSecret: PROFILE_SECRET,
        omadacId: `${name}-omadac`,
        strictSsl: true,
        ...overrides,
    };
}
