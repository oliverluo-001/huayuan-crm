// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerAnalysisTab } from './CustomerAnalysisTab';

const mocks = vi.hoisted(() => ({ detail: {} as any, get: vi.fn(), edit: vi.fn(), schedule: vi.fn(), create: vi.fn() }));
vi.mock('@/api/client', () => ({
  getOutreachAnalyses: async () => [{ id: 'owf_fixture', name: '已保存解析' }],
  getOutreachAnalysis: (...args: any[]) => mocks.get(...args),
  getEmailRecipients: async () => ({ recipients: [], total: 0 }),
  editOutreachDraft: (...args: any[]) => mocks.edit(...args),
  scheduleOutreachAnalysis: (...args: any[]) => mocks.schedule(...args),
  createOutreachAnalysis: (...args: any[]) => mocks.create(...args),
}));
let host: HTMLDivElement; let root: Root;
const findButton = (text: string) => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(text))!;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.detail = { id: 'owf_fixture', name: '测试解析', status: 'pending', data: { revision: 0, sender: { email: 'seller@example.com' }, drafts: [{ recipientKey: 'customer:c1', company: 'Buyer', email: 'buyer@example.com', segment: 'piping', timezone: 'Asia/Dubai', reason: '已读取官网', warnings: [], eligible: true, selected: true, subject: 'Original subject', body: 'Original body', evidence: { status: 'unavailable' } }] }, summary: { total: 1, eligible: 1, selected: 1 }, senderAccount: { configured: true, from: 'seller@example.com' }, schedule: {}, delivery: {} };
  mocks.get.mockImplementation(async () => structuredClone(mocks.detail));
  mocks.edit.mockImplementation(async (_id, _key, input) => { Object.assign(mocks.detail.data.drafts[0], input); mocks.detail.data.revision += 1; return structuredClone(mocks.detail); });
  mocks.schedule.mockImplementation(async (_id, input) => ({ ...structuredClone(mocks.detail), status: 'active', data: { ...mocks.detail.data, approvedAt: 'approved' }, schedule: input, delivery: { message: '定时任务已启用', sent: 0, failed: 0, skipped: 0 } }));
  mocks.edit.mockClear(); mocks.schedule.mockClear(); mocks.create.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<CustomerAnalysisTab onTasks={() => undefined} />));
  await act(async () => findButton('已保存解析').click());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

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
