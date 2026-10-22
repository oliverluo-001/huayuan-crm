// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerAnalysisTab } from './CustomerAnalysisTab';

const mocks = vi.hoisted(() => ({ detail: {} as any, get: vi.fn(), edit: vi.fn(), select: vi.fn(), schedule: vi.fn(), create: vi.fn(), recipients: vi.fn() }));
vi.mock('@/api/client', () => ({
  getOutreachAnalyses: async () => [{ id: 'owf_fixture', name: '已保存解析' }],
  getOutreachAnalysis: (...args: any[]) => mocks.get(...args),
  getEmailRecipients: (...args: any[]) => mocks.recipients(...args),
  getCustomerGeography: async () => [{ name: '中东', countries: [{ name: 'United Arab Emirates', label: '阿联酋' }, { name: 'Saudi Arabia', label: '沙特阿拉伯' }] }],
  editOutreachDraft: (...args: any[]) => mocks.edit(...args),
  selectOutreachDrafts: (...args: any[]) => mocks.select(...args),
  scheduleOutreachAnalysis: (...args: any[]) => mocks.schedule(...args),
  createOutreachAnalysis: (...args: any[]) => mocks.create(...args),
}));
let host: HTMLDivElement; let root: Root;
const findButton = (text: string) => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(text))!;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.recipients.mockReset();
  mocks.recipients.mockImplementation(async (input) => input?.optionsOnly ? { recipients: [], total: 0, filterOptions: { regions: ['Dubai', 'Sharjah'] } } : { recipients: [{ recipientKey: 'customer:c2', customerName: 'UAE Buyer', email: 'uae@example.com', country: 'United Arab Emirates', region: 'Dubai' }], total: 26 });
  mocks.detail = { id: 'owf_fixture', name: '测试解析', status: 'pending', data: { revision: 0, sender: { email: 'seller@example.com' }, drafts: [{ recipientKey: 'customer:c1', company: 'Buyer', email: 'buyer@example.com', segment: 'piping', timezone: 'Asia/Dubai', reason: '已读取官网', warnings: [], eligible: true, selected: true, subject: 'Original subject', body: 'Original body', evidence: { status: 'unavailable' } }] }, summary: { total: 1, eligible: 1, selected: 1 }, senderAccount: { configured: true, from: 'seller@example.com' }, schedule: {}, delivery: {} };
  mocks.get.mockImplementation(async () => structuredClone(mocks.detail));
  mocks.edit.mockImplementation(async (_id, _key, input) => { Object.assign(mocks.detail.data.drafts[0], input); mocks.detail.data.revision += 1; return structuredClone(mocks.detail); });
  mocks.select.mockImplementation(async (_id, keys) => {
    mocks.detail.data.drafts.forEach((draft: any) => { draft.selected = keys.includes(draft.recipientKey); });
    mocks.detail.data.revision += 1; mocks.detail.summary.selected = keys.length;
    return structuredClone(mocks.detail);
  });
  mocks.schedule.mockImplementation(async (_id, input) => ({ ...structuredClone(mocks.detail), status: 'active', data: { ...mocks.detail.data, approvedAt: 'approved' }, schedule: input, delivery: { message: '定时任务已启用', sent: 0, failed: 0, skipped: 0 } }));
  mocks.edit.mockClear(); mocks.select.mockClear(); mocks.schedule.mockClear(); mocks.create.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<CustomerAnalysisTab onTasks={() => undefined} />));
  await act(async () => findButton('已保存解析').click());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const waitForFilter = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
const changeSelect = async (id: string, value: string) => act(async () => {
  const select = host.querySelector<HTMLSelectElement>(`#${id}`)!;
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
});

it('queries the complete filtered pool, preserves filters across pages, and resets selection when filters change', async () => {
  await waitForFilter();
  await act(async () => host.querySelector<HTMLInputElement>('[aria-label="解析 uae@example.com"]')!.click());
  await act(async () => findButton('下一页').click());
  await waitForFilter();
  expect(mocks.recipients).toHaveBeenLastCalledWith(expect.objectContaining({ offset: '25', limit: '25' }));
  expect(host.textContent).toContain('已选 1 / 20');
  await changeSelect('analysis-market-filter', '中东');
  await changeSelect('analysis-country-filter', 'United Arab Emirates');
  await changeSelect('analysis-region-filter', 'Dubai');
  await changeSelect('analysis-tier-filter', 'A');
  await changeSelect('analysis-stage-filter', 'new');
  await waitForFilter();
  expect(mocks.recipients).toHaveBeenLastCalledWith(expect.objectContaining({ marketRegion: '中东', country: 'United Arab Emirates', region: 'Dubai', tier: 'A', journeyStage: 'new', emailState: 'sendable', offset: '0' }));
  expect(host.querySelector<HTMLInputElement>('#analysis-country')!.value).toBe('United Arab Emirates');
  expect(host.textContent).toContain('已选 0 / 20');
  await act(async () => findButton('下一页').click());
  await waitForFilter();
  expect(mocks.recipients).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'United Arab Emirates', tier: 'A', offset: '25' }));
  await act(async () => findButton('清除筛选').click());
  await waitForFilter();
  expect(mocks.recipients).toHaveBeenLastCalledWith(expect.objectContaining({ marketRegion: '', country: '', region: '', tier: '', journeyStage: '', business: '', emailState: 'sendable', offset: '0' }));
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.schedule).not.toHaveBeenCalled();
});

it('allows saved drafts to be reviewed without sending and blocks scheduling during an unsaved edit', async () => {
  expect(host.textContent).toContain('Original body');
  expect(mocks.schedule).not.toHaveBeenCalled();
  await act(async () => findButton('编辑这封邮件').click());
  expect(findButton('创建并启用').disabled).toBe(true);
  expect(host.textContent).toContain('请先保存或放弃');
  await act(async () => findButton('保存本封修改').click());
  expect(mocks.edit).toHaveBeenCalledWith('owf_fixture', 'customer:c1', expect.objectContaining({ subject: 'Original subject', revision: 0 }));
  await act(async () => findButton('创建并启用').click());
  expect(mocks.schedule).toHaveBeenCalledWith('owf_fixture', expect.objectContaining({ revision: 1, batchSize: 10, intervalMinutes: 10, totalRuns: 2 }));
  expect(host.textContent).toContain('定时任务已启用');
});

it('saves recipient selection before a task can be scheduled', async () => {
  const checkbox = host.querySelector<HTMLInputElement>('[aria-label="发送给 buyer@example.com"]')!;
  mocks.edit.mockImplementationOnce(async () => ({ ...structuredClone(mocks.detail), summary: { total: 1, eligible: 1, selected: 0 } }));
  await act(async () => checkbox.click());
  expect(mocks.edit).toHaveBeenCalledWith('owf_fixture', 'customer:c1', expect.objectContaining({ selected: false }));
  expect(findButton('创建并启用').disabled).toBe(true);
  expect(mocks.schedule).not.toHaveBeenCalled();
});

it('shows source evidence and selects only recommended eligible drafts atomically without sending', async () => {
  mocks.detail.data.drafts[0].insight = { version: 2, role: 'manufacturer', roleBasis: 'website', fit: 'direct', recommended: true, approach: '供应商评审', gaps: ['采购数量未确认'], researchNotes: ['关于页面待核实'], facts: [{ label: '供应类别', excerpt: 'Scope of Supply: Flanges', url: 'https://buyer.example/suppliers' }], sources: [{ title: 'Suppliers', kind: 'suppliers', url: 'https://buyer.example/suppliers' }] };
  mocks.detail.data.drafts[0].warnings = ['采购数量未确认'];
  mocks.detail.data.drafts.push({ ...structuredClone(mocks.detail.data.drafts[0]), recipientKey: 'customer:c3', email: 'review@example.com', insight: { ...mocks.detail.data.drafts[0].insight, recommended: false, fit: 'related' } });
  await act(async () => findButton('已保存解析').click());
  expect(host.textContent).toContain('Scope of Supply: Flanges');
  expect(host.querySelector('a[href="https://buyer.example/suppliers"]')).not.toBeNull();
  expect(host.textContent).toContain('采购数量未确认');
  await act(async () => findButton('仅勾选有明确产品依据').click());
  expect(mocks.select).toHaveBeenLastCalledWith('owf_fixture', ['customer:c1'], 0);
  await act(async () => findButton('清空邮件勾选').click());
  expect(mocks.select).toHaveBeenLastCalledWith('owf_fixture', [], 1);
  expect(findButton('创建并启用').disabled).toBe(true);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
