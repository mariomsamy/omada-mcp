import type { OmadaConnectionConfig } from './config.js';
import type { ControllerProfile } from './controllerProfiles.js';
import { OmadaClient } from './omadaClient/index.js';

/** Credential-free description of a configured controller. */
export interface ControllerSummary {
    name: string;
    /** Host (and port) of the base URL only: no scheme credentials, path or query. */
    host: string;
    default: boolean;
    siteId?: string;
}

export type OmadaClientFactory = (config: OmadaConnectionConfig) => OmadaClient;

/**
 * Holds the named controller profiles and one lazily created OmadaClient (with its own token cache)
 * per profile. Profiles carry credentials: only {@link describe} output may leave this class.
 */
export class ControllerRegistry {
    readonly names: readonly string[];

    readonly defaultName: string;

    private readonly profiles = new Map<string, ControllerProfile>();

    private readonly clients = new Map<string, OmadaClient>();

    private readonly factory: OmadaClientFactory;

    constructor(profiles: readonly ControllerProfile[], defaultName: string, factory: OmadaClientFactory = (config) => new OmadaClient(config)) {
        if (profiles.length === 0) throw new Error('At least one controller profile is required.');
        for (const profile of profiles) this.profiles.set(profile.name, profile);
        if (!this.profiles.has(defaultName)) throw new Error(`Default controller "${defaultName}" is not configured.`);
        this.names = profiles.map((profile) => profile.name);
        this.defaultName = defaultName;
        this.factory = factory;
    }

    /** True when more than one controller is configured (tools then accept a `controller` argument). */
    get isMulti(): boolean {
        return this.names.length > 1;
    }

    /** Resolve an optional name to a configured controller; unknown names list the valid ones. */
    resolve(name?: string): string {
        if (name === undefined) return this.defaultName;
        if (this.profiles.has(name)) return name;
        throw new Error(`Unknown controller "${name.slice(0, 64)}". Configured controllers: ${this.names.join(', ')}.`);
    }

    /** The OmadaClient for a controller, created on first use. */
    getClient(name: string): OmadaClient {
        const resolved = this.resolve(name);
        let client = this.clients.get(resolved);
        if (!client) {
            const { name: _name, isDefault: _isDefault, ...connection } = this.profiles.get(resolved) as ControllerProfile;
            client = this.factory(connection);
            this.clients.set(resolved, client);
        }
        return client;
    }

    /**
     * An OmadaClient stand-in that creates the real client only when a member is first used, so a
     * controller that is never called is never contacted (and a bad CA file only affects its own calls).
     */
    lazyClient(name: string): OmadaClient {
        const resolved = this.resolve(name);
        return new Proxy({} as OmadaClient, {
            get: (_target, property) => {
                const client = this.getClient(resolved);
                const value: unknown = Reflect.get(client, property, client);
                return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
            },
        });
    }

    describe(): ControllerSummary[] {
        return this.names.map((name) => {
            const profile = this.profiles.get(name) as ControllerProfile;
            return {
                name,
                host: new URL(profile.baseUrl).host,
                default: name === this.defaultName,
                ...(profile.siteId ? { siteId: profile.siteId } : {}),
            };
        });
    }
}
