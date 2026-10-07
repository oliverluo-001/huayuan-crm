import { expect, it } from 'vitest';
import { effectiveMarkets, marketPayload } from './lead-market';
it('sends exactly one scope even when inactive controls retain their values', () => {
  expect(marketPayload('global', ['Europe'], 'UAE')).toEqual({ marketMode: 'global', targetRegions: ['Global'], targetCountries: [] });
  expect(marketPayload('regions', ['Europe'], 'UAE')).toEqual({ marketMode: 'regions', targetRegions: ['Europe'], targetCountries: [] });
  expect(marketPayload('countries', ['Global', 'Europe'], 'UAE、Germany，UAE')).toEqual({ marketMode: 'countries', targetRegions: [], targetCountries: ['UAE', 'Germany'] });
});
it('shows saved country targeting instead of a misleading global label', () => {
  expect(effectiveMarkets({ agentState: { targetCountries: ['United Arab Emirates'] }, targetRegions: ['Global'] })).toEqual(['United Arab Emirates']);
  expect(effectiveMarkets({ agentState: { marketMode: 'global', targetCountries: ['Germany'] } })).toEqual(['Global']);
});
