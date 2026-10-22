import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createOutreachAnalysis, editOutreachDraft, getEmailRecipients, getCustomerGeography, getOutreachAnalyses, getOutreachAnalysis, scheduleOutreachAnalysis } from '@/api/client';
import type { EmailRecipient, CustomerMarket } from '@/api/client';
import { CUSTOMER_JOURNEY_STAGES } from '@/contracts/crm-stages';
import { CUSTOMER_TIER_OPTIONS } from '@/contracts/crm-terminology';
import { defaultOutreachStart, OUTREACH_SEGMENTS, outreachStartIso } from '@/contracts/outreach';
import type { OutreachDetail, OutreachDraft, OutreachListItem, OutreachSender } from '@/contracts/outreach';

const INITIAL_SENDER: OutreachSender = {
  name: 'Zachary Kael', company: 'Huayuan Flange', email: 'zachary.kael@huayuanflange.co',
  whatsapp: '+86 152-1503-1006', website: 'huayuanflange.com',
};
const requestId = () => `owf_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
const EMPTY_FILTERS = { q: '', marketRegion: '', country: '', region: '', tier: '', journeyStage: '', business: '', emailState: 'sendable' };

export function CustomerAnalysisTab({ onTasks }: { onTasks: () => void }) {
  const [sender, setSender] = useState(INITIAL_SENDER);
  const [name, setName] = useState('阿联酋首次开发');
  const [country, setCountry] = useState('UAE');
  const [scope, setScope] = useState('Carbon steel and stainless steel weld neck, slip-on and blind flanges, including ASME B16.5 items.');
  const [research, setResearch] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [offset, setOffset] = useState(0);
  const [markets, setMarkets] = useState<CustomerMarket[]>([]); const [regions, setRegions] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]); const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Map<string, EmailRecipient>>(new Map());
  const [saved, setSaved] = useState<OutreachListItem[]>([]);
  const [analysis, setAnalysis] = useState<OutreachDetail | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [editing, setEditing] = useState('');
  const [editSubject, setEditSubject] = useState(''); const [editBody, setEditBody] = useState('');
  const [zone, setZone] = useState('Asia/Dubai');
  const [localStart, setLocalStart] = useState(() => defaultOutreachStart('Asia/Dubai'));
  const [batchSize, setBatchSize] = useState('10'); const [interval, setInterval] = useState('10'); const [rounds, setRounds] = useState('2');
  const operation = useRef(false); const pendingRequest = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    getOutreachAnalyses().then((rows) => { if (current) setSaved(rows); }).catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    Promise.all([getCustomerGeography(), getEmailRecipients({ optionsOnly: 'true' })])
      .then(([geography, options]) => { if (current) { setMarkets(geography); setRegions(options.filterOptions?.regions || []); } })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getEmailRecipients({ ...filters, offset: String(offset), limit: '25' })
        .then((data) => { if (current) { setRecipients(data.recipients); setTotal(data.total); } })
        .catch((e: Error) => { if (current) { setRecipients([]); setTotal(0); setError(e.message); } })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [filters, offset]);

  const changeFilters = (changes: Partial<typeof EMPTY_FILTERS>) => {
    setFilters((previous) => ({ ...previous, ...changes })); setOffset(0); setSelected(new Map());
    setRecipients([]); setTotal(0); setLoading(true);
  };

  const perform = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请核对保存状态后重试'); }
    finally { operation.current = false; setBusy(false); }
  };

  const generate = () => perform(async () => {
    // Reuse the same ID on a timed-out retry. Persist it before transmitting.
    pendingRequest.current ||= requestId();
    localStorage.setItem('huayuan-outreach-pending', pendingRequest.current);
    const next = await createOutreachAnalysis({ requestId: pendingRequest.current, name, targetCountry: country, productScope: scope,
      recipientKeys: [...selected.keys()], sender, researchWebsites: research });
    setAnalysis(next); pendingRequest.current = null; localStorage.removeItem('huayuan-outreach-pending');
    setEditing(''); setSaved(await getOutreachAnalyses());
  });

  const load = (id: string) => perform(async () => { setAnalysis(await getOutreachAnalysis(id)); setEditing(''); });
  const updateDraft = (draft: OutreachDraft, changes: { subject?: string; body?: string; selected?: boolean }) => perform(async () => {
    if (!analysis) return;
    setAnalysis(await editOutreachDraft(analysis.id, draft.recipientKey, {
      subject: changes.subject ?? draft.subject, body: changes.body ?? draft.body,
      selected: changes.selected ?? draft.selected, revision: analysis.data.revision,
    }));
    setEditing('');
  });

  let startIso = ''; let scheduleError = '';
  try { startIso = outreachStartIso(localStart, zone); } catch (e) { scheduleError = (e as Error).message; }
  const capacity = Number(batchSize) * Number(rounds);
  const approved = Boolean(analysis?.data.approvedAt);
  const actualFrom = analysis?.senderAccount.from || '';
  const actualEmail = (actualFrom.match(/<([^>]+)>/)?.[1] || actualFrom).trim().toLowerCase();
  const accountMatches = actualEmail === analysis?.data.sender.email.trim().toLowerCase();
  const parametersValid = [batchSize, interval, rounds].every((value) => Number.isInteger(Number(value)) && Number(value) >= 1);
  const canSchedule = analysis && !approved && analysis.status === 'pending' && !editing && !busy
    && analysis.summary.selected > 0 && capacity >= analysis.summary.selected && parametersValid && !scheduleError && analysis.senderAccount.configured && accountMatches;
  const fieldClass = 'space-y-2';
  const selectClass = 'flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm';
  const countries = filters.marketRegion ? markets.find((market) => market.name === filters.marketRegion)?.countries || [] : markets.flatMap((market) => market.countries);

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>客户解析与对应邮件</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">选择客户 → 解析业务并生成邮件 → 编辑、勾选内容 → 创建定时任务。生成草稿不会发送邮件。</p>
      {error && <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {saved.map((item) => <Button key={item.id} size="sm" variant="outline" disabled={busy || Boolean(editing)} onClick={() => load(item.id)}>{item.name} · {item.approvedAt ? '已排程' : '草稿'}</Button>)}
        <Button variant="outline" disabled={busy} onClick={() => perform(async () => {
          const id = localStorage.getItem('huayuan-outreach-pending');
          if (id) { setAnalysis(await getOutreachAnalysis(id)); localStorage.removeItem('huayuan-outreach-pending'); pendingRequest.current = null; }
          setSaved(await getOutreachAnalyses());
        })}>刷新／恢复上次结果</Button>
      </div>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className={fieldClass}><Label htmlFor="analysis-name">本次解析名称</Label><Input id="analysis-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="analysis-country">目标国家</Label><Input id="analysis-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="如 UAE、阿联酋" /></div>
        </div>
        <div className={fieldClass}><Label htmlFor="analysis-scope">本次推广产品（仅填写已确认的产品能力）</Label><Textarea id="analysis-scope" value={scope} maxLength={1500} onChange={(e) => setScope(e.target.value)} /></div>
        <details className="rounded border p-3"><summary className="cursor-pointer text-sm">发件人签名</summary><div className="mt-3 grid gap-3 md:grid-cols-2">
          {([['name', '姓名'], ['company', '公司'], ['email', '工作邮箱'], ['whatsapp', 'WhatsApp'], ['website', '网站']] as const).map(([key, label]) => <div className={fieldClass} key={key}><Label htmlFor={`sender-${key}`}>{label}</Label><Input id={`sender-${key}`} type={key === 'email' ? 'email' : 'text'} value={sender[key]} onChange={(e) => setSender((previous) => ({ ...previous, [key]: e.target.value }))} /></div>)}
        </div></details>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />读取客户官网，保存业务关键词与来源；读取失败则标记待核验</label>
        <p className="text-sm text-muted-foreground">新名单请先在客户管理导入Excel，再在此选择。每次最多解析20个联系入口；同一客户、重复邮箱及不适合首次开发的记录会被标记。</p>
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3" aria-label="客户解析筛选条件">
          <p className="text-sm font-medium">筛选客户</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={fieldClass}><Label htmlFor="analysis-search">搜索公司或邮箱</Label><Input id="analysis-search" value={filters.q} onChange={(e) => changeFilters({ q: e.target.value })} /></div>
            <div className={fieldClass}><Label htmlFor="analysis-market-filter">大区</Label><select id="analysis-market-filter" className={selectClass} value={filters.marketRegion} onChange={(e) => changeFilters({ marketRegion: e.target.value, country: '', region: '' })}><option value="">全部大区</option>{markets.map((market) => <option key={market.name} value={market.name}>{market.name}</option>)}</select></div>
            <div className={fieldClass}><Label htmlFor="analysis-country-filter">国家</Label><select id="analysis-country-filter" className={selectClass} value={filters.country} onChange={(e) => { changeFilters({ country: e.target.value, region: '' }); if (e.target.value) setCountry(e.target.value); }}><option value="">全部国家</option>{countries.map((item) => <option key={item.name} value={item.name}>{item.label} · {item.name}</option>)}</select></div>
            <div className={fieldClass}><Label htmlFor="analysis-region-filter">城市／地区</Label><select id="analysis-region-filter" className={selectClass} value={filters.region} onChange={(e) => changeFilters({ region: e.target.value })}><option value="">全部城市／地区</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select></div>
            <div className={fieldClass}><Label htmlFor="analysis-tier-filter">客户分层</Label><select id="analysis-tier-filter" className={selectClass} value={filters.tier} onChange={(e) => changeFilters({ tier: e.target.value })}><option value="">全部客户分层</option>{CUSTOMER_TIER_OPTIONS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}</select></div>
            <div className={fieldClass}><Label htmlFor="analysis-stage-filter">跟进阶段</Label><select id="analysis-stage-filter" className={selectClass} value={filters.journeyStage} onChange={(e) => changeFilters({ journeyStage: e.target.value })}><option value="">全部跟进阶段</option>{CUSTOMER_JOURNEY_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></div>
            <div className={fieldClass}><Label htmlFor="analysis-email-filter">邮箱状态</Label><select id="analysis-email-filter" className={selectClass} value={filters.emailState} onChange={(e) => changeFilters({ emailState: e.target.value })}><option value="sendable">仅可发送邮箱</option><option value="all">全部邮箱状态</option><option value="invalid">邮箱异常</option></select></div>
            <div className={fieldClass}><Label htmlFor="analysis-business-filter">主营业务／产品</Label><Input id="analysis-business-filter" placeholder="如 flange、valve" value={filters.business} onChange={(e) => changeFilters({ business: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={() => changeFilters(EMPTY_FILTERS)}>清除筛选</Button><p className="text-xs text-muted-foreground">选择国家会同步目标国家；更改筛选会清空已选客户，翻页保留选择。</p></div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded border" aria-busy={loading}>
          {recipients.map((recipient) => <label key={recipient.recipientKey} className="flex items-start gap-3 border-b p-3 text-sm last:border-0">
            <input type="checkbox" aria-label={`解析 ${recipient.email}`} checked={selected.has(recipient.recipientKey)} disabled={recipient.emailStatus === 'invalid' || recipient.suppressed || (!selected.has(recipient.recipientKey) && selected.size >= 20)} onChange={(e) => {
              const checked = e.target.checked;
              setSelected((previous) => { const next = new Map(previous); if (checked) next.set(recipient.recipientKey, recipient); else next.delete(recipient.recipientKey); return next; });
            }} /><span>{recipient.customerName}<span className="block break-all text-muted-foreground">{recipient.email} · {[recipient.country, recipient.region].filter(Boolean).join(' / ')}</span></span>
          </label>)}
          {loading && <p className="p-4 text-sm" role="status">正在筛选客户…</p>}
          {!loading && !recipients.length && <p className="p-4 text-sm">未找到匹配联系人</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>已选 {selected.size} / 20 · 匹配 {total} 个</span><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>上一页</Button><Button variant="outline" disabled={offset + 25 >= total || loading} onClick={() => setOffset(offset + 25)}>下一页</Button><Button variant="ghost" onClick={() => setSelected(new Map())}>清空选择</Button></div>
        <Button disabled={!selected.size || !name.trim() || !country.trim() || !scope.trim()} onClick={generate}>{busy ? '正在解析并保存，请稍候…' : '解析客户并生成对应邮件'}</Button>
      </fieldset>
    </CardContent></Card>

    {analysis && <Card><CardHeader><CardTitle>{analysis.name} · 选择生成内容</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm">共 {analysis.summary.total} 条 · 可选 {analysis.summary.eligible} 条 · 已选 {analysis.summary.selected} 封</p>
      <p className="text-sm text-muted-foreground">规则按官网与CRM业务关键词匹配邮件，不等同于采购意向确认。请逐封查看；每次修改需保存后再排程。</p>
      {analysis.data.drafts.map((draft) => <article key={draft.recipientKey} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label={`发送给 ${draft.email}`} checked={draft.selected} disabled={!draft.eligible || approved || busy || Boolean(editing)} onChange={(e) => updateDraft(draft, { selected: e.target.checked })} />{draft.company}</label><Badge variant="secondary">{OUTREACH_SEGMENTS[draft.segment]}</Badge></div>
        <p className="break-all text-sm text-muted-foreground">{draft.email} · {draft.timezone || '时区待核实'}</p>
        <p className="text-sm">{draft.reason}</p>
        <ul className="list-inside list-disc text-sm text-muted-foreground">{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        {draft.evidence.status === 'verified' && <details className="text-sm"><summary className="cursor-pointer">查看官网依据与核对时间</summary><p className="mt-2">{draft.evidence.excerpt}</p>{/^https?:\/\//.test(draft.evidence.url) && <a className="break-all underline" href={draft.evidence.url} target="_blank" rel="noreferrer">{draft.evidence.url}</a>}<p>{new Date(draft.evidence.checkedAt).toLocaleString()}</p></details>}
        {editing === draft.recipientKey ? <div className="space-y-3">
          <Label htmlFor="draft-subject">邮件主题</Label><Input id="draft-subject" value={editSubject} maxLength={500} onChange={(e) => setEditSubject(e.target.value)} disabled={busy} />
          <Label htmlFor="draft-body">邮件正文</Label><Textarea id="draft-body" value={editBody} maxLength={6000} rows={16} onChange={(e) => setEditBody(e.target.value)} disabled={busy} />
          <Button disabled={busy} onClick={() => updateDraft(draft, { subject: editSubject, body: editBody })}>保存本封修改</Button><Button variant="ghost" disabled={busy} onClick={() => setEditing('')}>放弃修改</Button>
        </div> : <><p className="font-medium">Subject: {draft.subject}</p><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{draft.body}</pre>{!approved && <Button variant="outline" disabled={busy || Boolean(editing)} onClick={() => { setEditing(draft.recipientKey); setEditSubject(draft.subject); setEditBody(draft.body); }}>编辑这封邮件</Button>}</>}
      </article>)}
    </CardContent></Card>}

    {analysis && <Card><CardHeader><CardTitle>{approved ? '已创建定时任务' : '用所选邮件创建定时任务'}</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="break-all text-sm">实际发件账户：{analysis.senderAccount.from || '未配置'} · 签名邮箱：{analysis.data.sender.email}</p>
      {!analysis.senderAccount.configured && <p className="text-sm text-destructive">请先在设置中完成发件邮箱配置。</p>}
      {analysis.senderAccount.configured && !accountMatches && <p className="text-sm text-destructive">实际发件地址与本次签名邮箱不一致，请核对设置，或使用正确签名重新生成。</p>}
      {approved ? <><p role="status">{analysis.delivery.message}</p><p>开始：{analysis.schedule.startAt ? new Date(analysis.schedule.startAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '-'}（北京时间），每轮 {analysis.schedule.batchSize} 封，间隔 {analysis.schedule.intervalMinutes} 分钟，共 {analysis.schedule.totalRuns} 轮。</p><p>已发送 {analysis.delivery.sent} · 失败 {analysis.delivery.failed} · 跳过 {analysis.delivery.skipped}</p><Button onClick={onTasks}>前往发信任务查看、暂停或取消</Button><Button variant="outline" disabled={busy} onClick={() => load(analysis.id)}>刷新结果</Button></> : <>
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <div className={fieldClass}><Label htmlFor="analysis-zone">发送时间使用的时区</Label><Input id="analysis-zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Asia/Dubai" /></div>
          <div className={fieldClass}><Label htmlFor="analysis-start">该时区的开始时间</Label><Input id="analysis-start" type="datetime-local" value={localStart} onChange={(e) => setLocalStart(e.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="analysis-batch">每轮邮件数量</Label><Input id="analysis-batch" type="number" min={1} max={200} value={batchSize} onChange={(e) => setBatchSize(e.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="analysis-interval">轮次间隔（分钟）</Label><Input id="analysis-interval" type="number" min={1} max={43200} value={interval} onChange={(e) => setInterval(e.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="analysis-rounds">总轮数</Label><Input id="analysis-rounds" type="number" min={1} max={1000} value={rounds} onChange={(e) => setRounds(e.target.value)} /></div>
        </fieldset>
        <p className="text-sm">已选 {analysis.summary.selected} 封，当前容量 {Number.isFinite(capacity) ? capacity : 0} 封。{startIso && `对应北京时间：${new Date(startIso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`}</p>
        {scheduleError && <p className="text-sm text-destructive">{scheduleError}</p>}
        {editing && <p className="text-sm text-destructive">请先保存或放弃正在编辑的邮件。</p>}
        <p className="text-sm text-muted-foreground">创建后自动启用。系统仍遵守每日限额、客户当地发送窗口与退订抑制规则，实际发送可能顺延；不会自动生成后续跟进。</p>
        <Button disabled={!canSchedule} onClick={() => perform(async () => {
          const next = await scheduleOutreachAnalysis(analysis.id, { startAt: outreachStartIso(localStart, zone), batchSize: Number(batchSize), intervalMinutes: Number(interval), totalRuns: Number(rounds), revision: analysis.data.revision });
          setAnalysis(next); setSaved(await getOutreachAnalyses());
        })}>创建并启用定时任务（{analysis.summary.selected}封）</Button>
      </>}
    </CardContent></Card>}
  </div>;
}
