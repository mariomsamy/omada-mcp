import { readFileSync, statSync } from 'node:fs';

import { z } from 'zod';

import type { OmadaConnectionConfig } from './config.js';

/**
 * Named controller profiles loaded from OMADA_CONTROLLERS_FILE.
 *
 * The file holds credentials, so every error raised here names the file, the entry index and the
 * field, never a value. JSON syntax errors are reported without the parser message, because V8
 * quotes the surrounding source text (which can contain a client secret) in it.
 */

/** Controller names: lower-case, start with a letter or digit, at most 32 characters. */
export const CONTROLLER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Upper bound for the profiles file; a real file is a few hundred bytes per controller. */
const MAX_FILE_BYTES = 1024 * 1024;

/** Upper bound for configured controllers. */
export const MAX_CONTROLLERS = 32;

export interface ControllerProfile extends OmadaConnectionConfig {
    name: string;
    isDefault: boolean;
}

export interface LoadedControllerProfiles {
    profiles: ControllerProfile[];
    defaultName: string;
    warnings: string[];
}

const baseUrlSchema = z
    .string({ error: 'baseUrl is required' })
    .url({ message: 'baseUrl must be a valid http(s) URL' })
    .refine((value) => {
        // Zod 4 runs refinements after a failed .url() check, so guard the parse.
        if (!URL.canParse(value)) return true;
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.search && !url.hash;
    }, 'baseUrl must be an http(s) URL without embedded credentials, query string or fragment');

const profileSchema = z
    .object({
        name: z.string({ error: 'name is required' }).regex(CONTROLLER_NAME_PATTERN, 'name must match ^[a-z0-9][a-z0-9_-]{0,31}$'),
        baseUrl: baseUrlSchema,
        clientId: z.string({ error: 'clientId is required' }).min(1, 'clientId must not be empty'),
        clientSecret: z.string({ error: 'clientSecret is required' }).min(1, 'clientSecret must not be empty'),
        omadacId: z.string({ error: 'omadacId is required' }).min(1, 'omadacId must not be empty'),
        siteId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{1,128}$/, 'siteId must be 1 to 128 letters, digits, "_" or "-"')
            .optional(),
        strictSsl: z.boolean({ error: 'strictSsl must be true or false' }).optional().default(true),
        caFile: z.string().min(1, 'caFile must not be empty').optional(),
        timeout: z.number({ error: 'timeout must be a number of milliseconds' }).int().positive().max(600_000).optional(),
        default: z.boolean({ error: 'default must be true or false' }).optional(),
    })
    .strict();

const fileSchema = z
    .object({
        controllers: z
            .array(profileSchema, { error: 'controllers must be an array of controller profiles' })
            .min(1, 'controllers must list at least one controller')
            .max(MAX_CONTROLLERS, `controllers may list at most ${MAX_CONTROLLERS} controllers`),
    })
    .strict()
    .superRefine((data, context) => {
        const seen = new Set<string>();
        data.controllers.forEach((profile, index) => {
            if (seen.has(profile.name)) {
                context.addIssue({ code: 'custom', message: `duplicate controller name "${profile.name}"`, path: ['controllers', index, 'name'] });
            }
            seen.add(profile.name);
        });
        if (data.controllers.filter((profile) => profile.default === true).length > 1) {
            context.addIssue({ code: 'custom', message: 'at most one controller may set "default": true', path: ['controllers'] });
        }
    });

function formatPath(path: readonly PropertyKey[]): string {
    return path.reduce<string>(
        (text, segment) => (typeof segment === 'number' ? `${text}[${segment}]` : text ? `${text}.${String(segment)}` : String(segment)),
        ''
    );
}

export interface ControllerFileDependencies {
    platform?: NodeJS.Platform;
    stat?: (path: string) => { isFile(): boolean; mode: number; size: number };
    readFile?: (path: string) => string;
}

/**
 * Load and validate OMADA_CONTROLLERS_FILE. Refuses files that are not regular files, larger than
 * 1 MiB, or (on POSIX) readable, writable or executable by group or others.
 */
export function loadControllerProfiles(path: string, dependencies: ControllerFileDependencies = {}): LoadedControllerProfiles {
    const platform = dependencies.platform ?? process.platform;
    const stat = dependencies.stat ?? ((file: string) => statSync(file));
    const readFile = dependencies.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const label = `OMADA_CONTROLLERS_FILE (${path})`;

    let info: ReturnType<typeof stat>;
    try {
        info = stat(path);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        throw new Error(`${label} cannot be read${code ? ` (${code})` : ''}.`);
    }
    if (!info.isFile()) throw new Error(`${label} is not a regular file.`);
    if (info.size > MAX_FILE_BYTES) throw new Error(`${label} is larger than 1 MiB.`);
    if (platform !== 'win32' && (info.mode & 0o077) !== 0) {
        const mode = (info.mode & 0o777).toString(8).padStart(3, '0');
        throw new Error(`${label} holds controller credentials and must not be accessible by group or others (mode ${mode}). Run: chmod 600 <file>`);
    }

    let raw: unknown;
    try {
        raw = JSON.parse(readFile(path));
    } catch (error) {
        if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON.`);
        const code = (error as NodeJS.ErrnoException).code;
        throw new Error(`${label} cannot be read${code ? ` (${code})` : ''}.`);
    }

    const parsed = fileSchema.safeParse(raw);
    if (!parsed.success) {
        const messages = parsed.error.issues.map((issue) => {
            const where = formatPath(issue.path);
            return where ? `${where}: ${issue.message}` : issue.message;
        });
        throw new Error(`Invalid ${label}:\n${messages.join('\n')}`);
    }

    const defaultIndex = Math.max(
        0,
        parsed.data.controllers.findIndex((profile) => profile.default === true)
    );
    const warnings: string[] = [];
    const profiles = parsed.data.controllers.map((profile, index): ControllerProfile => {
        if (!profile.strictSsl) warnings.push(`Controller "${profile.name}" has strictSsl=false; TLS certificates are not verified for it.`);
        return {
            name: profile.name,
            isDefault: index === defaultIndex,
            baseUrl: profile.baseUrl.replace(/\/+$/, ''),
            clientId: profile.clientId,
            clientSecret: profile.clientSecret,
            omadacId: profile.omadacId,
            siteId: profile.siteId,
            strictSsl: profile.strictSsl,
            caFile: profile.caFile,
            requestTimeout: profile.timeout,
        };
    });
    return { profiles, defaultName: profiles[defaultIndex].name, warnings };
}
