import { ConfigService } from '@nestjs/config';
import { getTypeOrmConfig, parseBooleanConfig } from './database.config';

describe('database configuration', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['false', false],
    ['0', false],
    ['off', false],
    [true, true],
    [false, false],
  ])('parses boolean value %p without JavaScript string truthiness', (value, expected) => {
    expect(parseBooleanConfig(value, !expected)).toBe(expected);
  });

  it('keeps production schema synchronization disabled for the string false', () => {
    const values: Record<string, unknown> = {
      DB_SYNCHRONIZE: 'false',
      DB_LOGGING: 'false',
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    } as unknown as ConfigService;

    const options = getTypeOrmConfig(config);

    expect(options.synchronize).toBe(false);
    expect(options.logging).toBe(false);
  });
});
