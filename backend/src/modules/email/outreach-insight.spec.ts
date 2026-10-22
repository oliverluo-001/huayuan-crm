import { generateOutreachMessage } from './outreach-messages';
import { researchLinks, readCompanyWebsite, ResearchPage, websiteText } from './outreach-research';
import { OutreachSource } from './outreach-types';

const sender = { name: 'Zachary Kael', company: 'Huayuan Flange', email: 'zachary.kael@huayuanflange.com', whatsapp: '+86 152-1503-1006', website: 'huayuanflange.com' };
const page = (kind: OutreachSource['kind'], text: string): OutreachSource => ({ kind, text, title: kind, url: `https://buyer.example/${kind}` });
const generate = (pages: OutreachSource[], business = '') => generateOutreachMessage('Buyer', business, '', sender, 'Carbon steel and stainless steel flanges.', pages);

describe('evidence-led outreach', () => {
  it('prioritizes an explicit flange supplier category over a generic valve template', () => {
    const message = generate([
      page('home', 'We specialize in the design and manufacture of control valves for process plants, utilities and industrial applications worldwide.'),
      page('suppliers', 'New supplier registration: Procurement representatives evaluate applications. Scope of Supply: Castings, fasteners, flanges and instrument components. Company type: Manufacturer Trader.'),
    ]);
    expect(message.insight).toMatchObject({ role: 'manufacturer', roleBasis: 'website', fit: 'direct', recommended: true });
    expect(message.subject).toBe('Flange supplier qualification');
    expect(message.body).toContain('supply categories on your supplier registration page');
    expect(message.body).not.toMatch(/companion|currently purchasing|certified|stock|delivery/i);
    expect(message.insight.facts).toContainEqual(expect.objectContaining({ label: '供应商供货类别包含法兰', url: 'https://buyer.example/suppliers' }));
  });
  it('distinguishes a valve stockist from a manufacturer without assuming a flange purchase', () => {
    const message = generate([page('about', 'We are a distributor and stockist of control valves, actuators and industrial process equipment for contractors across regional markets.')]);
    expect(message.insight).toMatchObject({ role: 'distributor', fit: 'related', recommended: false });
    expect(message.body).toContain('comparing a quotation');
    expect(message.body).not.toMatch(/your manufacturing|supplier registration/);
  });
  it('does not infer flange qualification from a general supplier page or classify form choices as the customer role', () => {
    const message = generate([
      page('home', 'Our valve products support diverse industrial projects and operating conditions. Learn about our product range and technical support services.'),
      page('suppliers', 'New supplier registration. Scope of Supply: Positioners, controllers, air regulators and springs. Company type: Manufacturer Distributor Trader Supplier.'),
    ]);
    expect(message.insight.role).toBe('unknown');
    expect(message.insight.recommended).toBe(false);
    expect(message.body).toContain('Would metal flange supply fall within');
    expect(message.body).not.toContain('flanges are listed');
  });
  it('keeps CRM-only evidence and plastic-only product matches unconfirmed', () => {
    const missing = generate([], 'We are a distributor of flanges');
    expect(missing.insight).toMatchObject({ roleBasis: 'crm', fit: 'unconfirmed', recommended: false });
    expect(missing.body).toContain('If metal flanges');
    expect(missing.body).not.toMatch(/I noticed|I came across/);
    const plastic = generate([page('products', 'We supply PVC and HDPE pipe fittings and plastic flanges for irrigation systems and drainage installations across building and infrastructure projects.')]);
    expect(plastic.insight.fit).toBe('unconfirmed');
    expect(plastic.insight.gaps.join(' ')).toContain('非金属');
    const unrelatedMetal = generate([page('products', 'We supply PVC flanges for drainage systems and irrigation installations. Our separate building catalogue also includes steel fasteners for general construction work.')]);
    expect(unrelatedMetal.insight.recommended).toBe(false);
  });
});

describe('bounded company website research', () => {
  it('discovers relevant same-site links while rejecting private, credentialed, external and action URLs', () => {
    const links = researchLinks(`<nav><a href="/suppliers/">Suppliers</a><a href="/products/">Products</a><a href="/about-us/">About us</a></nav>
      <a href="https://outside.example/suppliers">Suppliers</a><a href="http://127.0.0.1/suppliers">Suppliers</a>
      <a href="https://user:secret@buyer.example/about">About</a><a href="/logout/products">Products</a><a href="/products?delete=1">Products</a>`, 'https://buyer.example/');
    expect(links.map((link) => link.kind)).toEqual(['suppliers', 'products', 'about']);
    expect(websiteText('<nav>Supplier flanges</nav><header>Manufacturer</header><p>Verified company text</p>')).toBe('Verified company text');
  });
  it('reads at most the homepage plus three relevant pages and preserves partial-source gaps', async () => {
    const reader = jest.fn(async (url: string): Promise<ResearchPage> => {
      if (url.endsWith('/')) return { url, text: 'Industrial valve products for applications around the world, with a dedicated team supporting customers and installations.', links: researchLinks('<a href="/suppliers">Suppliers</a><a href="/products">Products</a><a href="/about">About</a><a href="/products/extra">Products</a>', url) };
      if (url.endsWith('about')) throw new Error('timeout');
      return { url, text: 'A detailed public company page with enough evidence for assessment. These are industrial product details and supplier registration information.' };
    });
    const result = await readCompanyWebsite('https://buyer.example/', reader);
    expect(reader).toHaveBeenCalledTimes(4);
    expect(result.pages).toHaveLength(3);
    expect(result.notes.join(' ')).toContain('About');
    const deadlines = reader.mock.calls.map((call: any[]) => call[2]);
    expect(new Set(deadlines).size).toBe(1);
  });
  it('never fetches a cross-site link returned by a reader', async () => {
    const reader = jest.fn(async (): Promise<ResearchPage> => ({ url: 'https://buyer.example/', text: 'A company overview with industrial product details and information about our manufacturing operations and technical support.', links: [{ url: 'https://outside.example/suppliers', label: 'Suppliers', kind: 'suppliers' }] }));
    const result = await readCompanyWebsite('https://buyer.example/', reader);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(result.pages).toHaveLength(1);
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
