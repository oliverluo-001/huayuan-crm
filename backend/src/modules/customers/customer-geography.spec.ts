import { CUSTOMER_MARKETS, findCustomerCountry } from './customer-geography';
import { mapCustomerImportColumns } from './customer-import-columns';
import { isValidIanaTimezone } from '../email/customer-timezone';

describe('customer sales geography', () => {
  it('groups aliases and preserves multi-timezone countries as unresolved', () => {
    expect(findCustomerCountry('U.S.A.')?.market).toBe('北美');
    expect(findCustomerCountry('泰国')?.name).toBe('Thailand');
    expect(findCustomerCountry('United States')?.timezone).toBe('');
    expect(CUSTOMER_MARKETS.find((market) => market.name === '东南亚')?.countries.length).toBeGreaterThan(3);
    for (const market of CUSTOMER_MARKETS) {
      for (const country of market.countries) {
        if (country.timezone) expect(isValidIanaTimezone(country.timezone)).toBe(true);
      }
    }
  });
});

describe('import column recognition', () => {
  it('recognizes normalized bilingual headers and a unique small typo', () => {
    const result = mapCustomerImportColumns(['Company Name', 'E-mail Address', 'Country / Region', 'Time Zone', 'Compnay Address']);
    expect(result.mapped).toMatchObject({ company: 'Company Name', email: 'E-mail Address', country: 'Country / Region', timezone: 'Time Zone' });
    expect(result.unmappedColumns).toContain('Compnay Address');
  });

  it('does not guess unrelated or competing columns', () => {
    const result = mapCustomerImportColumns(['Company', 'Company Name', 'Status', 'Personal Email?']);
    expect(result.mapped.company).toBe('Company');
    expect(result.unmappedColumns).toEqual(expect.arrayContaining(['Company Name', 'Status', 'Personal Email?']));
  });
});
