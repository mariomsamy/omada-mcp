import { describe, expect, it, vi } from 'vitest';

import {
    assertBroadSelectionConfirmed,
    extractRecords,
    logSelectionSchema,
    poeScheduleSchema,
    rebootScheduleSchema,
    requireExistingRecord,
    resourceIdSchema,
} from '../../src/tools/portedToolShared.js';

describe('tools/portedToolShared', () => {
    it('accepts controller identifiers and rejects path-like values', () => {
        const schema = resourceIdSchema('id');
        expect(schema.parse(' 64f0c0ffee_01-ab ')).toBe('64f0c0ffee_01-ab');
        for (const value of ['', '../etc', 'a/b', 'a b', 'x'.repeat(129)]) {
            expect(schema.safeParse(value).success).toBe(false);
        }
    });

    it('validates log selections against the documented rules', () => {
        expect(logSelectionSchema.parse({ logs: ['a'], selectType: 'include', startTime: 1, endTime: 2 })).toEqual({
            logs: ['a'],
            selectType: 'include',
            startTime: 1,
            endTime: 2,
        });
        expect(logSelectionSchema.safeParse({ selectType: 'include', startTime: 1, endTime: 2 }).success).toBe(false);
        expect(logSelectionSchema.safeParse({ logs: ['a'], selectType: 'include', startTime: 3, endTime: 2 }).success).toBe(false);
        expect(logSelectionSchema.safeParse({ logs: ['a'], selectType: 'all', startTime: 1, endTime: 2, filterModule: 'System' }).success).toBe(
            false
        );
        expect(logSelectionSchema.safeParse({ selectType: 'all', startTime: 1, endTime: 2 }).success).toBe(false);
        expect(logSelectionSchema.safeParse({ selectType: 'all', startTime: 1, endTime: 2, filterModule: 'Device' }).success).toBe(true);
        expect(logSelectionSchema.safeParse({ logs: ['a'], selectType: 'include', startTime: 1, endTime: 2, extra: true }).success).toBe(false);
    });

    it('requires confirmation only for broad log selections', () => {
        const include = logSelectionSchema.parse({ logs: ['a'], selectType: 'include', startTime: 1, endTime: 2 });
        const exclude = logSelectionSchema.parse({ logs: ['a'], selectType: 'exclude', startTime: 1, endTime: 2 });
        expect(() => assertBroadSelectionConfirmed(include, false)).not.toThrow();
        expect(() => assertBroadSelectionConfirmed(exclude, false)).toThrow('confirmBroadSelection');
        expect(() => assertBroadSelectionConfirmed(exclude, true)).not.toThrow();
    });

    it('validates reboot schedule timing rules', () => {
        const base = { name: 'Nightly', status: true, deviceMacs: ['AA-BB-CC-DD-EE-FF'] };
        expect(rebootScheduleSchema.safeParse({ ...base, time: { timingType: 1, hour: 3, minute: 0 } }).success).toBe(true);
        expect(rebootScheduleSchema.safeParse({ ...base, time: { timingType: 2, hour: 3, minute: 0 } }).success).toBe(false);
        expect(rebootScheduleSchema.safeParse({ ...base, time: { timingType: 3, hour: 3, minute: 0 } }).success).toBe(false);
        expect(rebootScheduleSchema.safeParse({ ...base, time: { timingType: 3, dayOfMonth: 1, hour: 24, minute: 0 } }).success).toBe(false);
        expect(rebootScheduleSchema.safeParse({ ...base, deviceMacs: ['bad'], time: { timingType: 1, hour: 3, minute: 0 } }).success).toBe(false);
    });

    it('validates PoE schedule port maps', () => {
        const base = { name: 'Office', status: true, turnOnTime: 'range-1' };
        expect(poeScheduleSchema.safeParse({ ...base, poePortsMap: { 'AA-BB-CC-DD-EE-FF': [1, 2] } }).success).toBe(true);
        expect(poeScheduleSchema.safeParse({ ...base, poePortsMap: {} }).success).toBe(false);
        expect(poeScheduleSchema.safeParse({ ...base, poePortsMap: { 'AA-BB-CC-DD-EE-FF': [1, 1] } }).success).toBe(false);
        expect(poeScheduleSchema.safeParse({ ...base, poePortsMap: { 'not-a-mac': [1] } }).success).toBe(false);
    });

    it('extracts records from arrays and paginated results', () => {
        expect(extractRecords([{ id: 'a' }, null, 'x'])).toEqual([{ id: 'a' }]);
        expect(extractRecords({ data: [{ id: 'b' }] })).toEqual([{ id: 'b' }]);
        expect(extractRecords({ result: [] })).toEqual([]);
        expect(extractRecords(undefined)).toEqual([]);
    });

    it('requires an exact identifier match before mutating', async () => {
        const load = vi.fn().mockResolvedValue([{ id: 'a' }, { profileId: 'b' }]);
        await expect(requireExistingRecord(load, 'a', 'Thing')).resolves.toEqual({ id: 'a' });
        await expect(requireExistingRecord(load, 'b', 'Thing', ['id', 'profileId'])).resolves.toEqual({ profileId: 'b' });
        await expect(requireExistingRecord(load, 'c', 'Thing')).rejects.toThrow('Thing c was not found');
    });
});
