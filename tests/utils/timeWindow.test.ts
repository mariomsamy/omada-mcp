import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ONE_DAY_SECONDS, ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../../src/utils/timeWindow.js';

describe('timeWindow', () => {
    afterEach(() => vi.restoreAllMocks());

    it('defaults to a window of the given length ending now, in Unix seconds', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1792845296789);
        expect(resolveTimeWindow(undefined, undefined, ONE_HOUR_SECONDS)).toEqual({ start: 1792841696, end: 1792845296 });
        expect(resolveTimeWindow(undefined, undefined, ONE_DAY_SECONDS)).toEqual({ start: 1792758896, end: 1792845296 });
    });

    it('passes an explicit window through unchanged', () => {
        expect(resolveTimeWindow(1700000000, 1700003600, ONE_HOUR_SECONDS)).toEqual({ start: 1700000000, end: 1700003600 });
    });

    it.each([
        [1700000000, undefined, 'start and end must be provided together'],
        [undefined, 1700000000, 'start and end must be provided together'],
        [1700000000, 1700000000, 'start must be earlier than end'],
        [1700003600, 1700000000, 'start must be earlier than end'],
    ])('rejects start=%s end=%s', (start, end, message) => {
        expect(() => resolveTimeWindow(start, end, ONE_HOUR_SECONDS)).toThrow(message);
    });

    it('accepts optional positive integer bounds only', () => {
        const schema = z.object(optionalTimeWindowShape);
        expect(schema.safeParse({}).success).toBe(true);
        expect(schema.safeParse({ start: 1, end: 2 }).success).toBe(true);
        expect(schema.safeParse({ start: -1 }).success).toBe(false);
        expect(schema.safeParse({ end: 1.5 }).success).toBe(false);
    });
});
