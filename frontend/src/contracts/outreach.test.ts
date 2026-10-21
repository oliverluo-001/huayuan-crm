import { expect, it } from 'vitest';
import { outreachStartIso } from './outreach';

it('converts UAE business time independently of the operator/browser timezone', () => {
  expect(outreachStartIso('2026-10-22T10:00', 'Asia/Dubai')).toBe('2026-10-22T06:00:00.000Z');
  expect(outreachStartIso('2026-10-22T14:00', 'Asia/Shanghai')).toBe('2026-10-22T06:00:00.000Z');
});
it('handles DST offsets and rejects gaps, ambiguous times, invalid dates and zones', () => {
  expect(outreachStartIso('2026-07-15T10:00', 'Europe/London')).toBe('2026-07-15T09:00:00.000Z');
  expect(() => outreachStartIso('2026-03-29T01:30', 'Europe/London')).toThrow();
  expect(() => outreachStartIso('2026-10-25T01:30', 'Europe/London')).toThrow();
  expect(() => outreachStartIso('2026-02-31T10:00', 'Asia/Dubai')).toThrow();
  expect(() => outreachStartIso('2026-10-22T10:00', 'Invalid/Zone')).toThrow();
});
