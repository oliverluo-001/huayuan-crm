import type { ValueTransformer } from 'typeorm';

/** Keep decimal columns numeric at the HTTP boundary (MySQL returns DECIMAL as strings). */
export const decimalNumberTransformer: ValueTransformer = {
  to(value: number | null | undefined) {
    return value;
  },
  from(value: string | number | null | undefined) {
    if (value === null || value === undefined) return value;
    return Number(value);
  },
};
