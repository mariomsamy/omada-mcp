import { z } from 'zod';

/** A closed time range in Unix seconds, as required by the dashboard and threat endpoints in docs/openapi. */
export interface TimeWindow {
    start: number;
    end: number;
}

export const ONE_HOUR_SECONDS = 3600;
export const ONE_DAY_SECONDS = 86400;

/**
 * Optional `start`/`end` tool inputs (Unix seconds). Both must be given together; when both are
 * omitted the tool uses its documented default window ending now.
 */
export const optionalTimeWindowShape = {
    start: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Start of the time range as a Unix timestamp in seconds. Must be paired with end. Omit both to use the default window ending now.'),
    end: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('End of the time range as a Unix timestamp in seconds. Must be paired with start. Omit both to use the default window ending now.'),
};

/**
 * Resolve an optional window to concrete Unix seconds. Throws when only one bound is given or when
 * the range is empty, so a bad request never reaches the controller as an HTTP 400.
 */
export function resolveTimeWindow(start: number | undefined, end: number | undefined, defaultSeconds: number): TimeWindow {
    if ((start === undefined) !== (end === undefined)) {
        throw new Error('start and end must be provided together (Unix seconds), or both omitted for the default window.');
    }
    if (start !== undefined && end !== undefined) {
        if (start >= end) throw new Error('start must be earlier than end (Unix seconds).');
        return { start, end };
    }
    const now = Math.floor(Date.now() / 1000);
    return { start: now - defaultSeconds, end: now };
}
