import { useEffect, useId, useState } from "react";
import { getCustomers, type Customer } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Search the authorized server pool instead of truncating it to a local dropdown. */
export function CustomerPicker({ value, customers, onChange }: {
  value: string;
  customers: Customer[];
  onChange: (customer: Customer) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = customers.find((customer) => String(customer.id) === value);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void getCustomers(page * 25, 25, query.trim() ? { q: query.trim() } : {}).then((result) => {
        if (cancelled) return;
        setItems(result.customers);
        setTotal(result.total);
      }).catch(() => {
        if (!cancelled) setError("客户搜索失败，当前选择未改变，请重试");
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, query, page, retry]);

  return <div className="space-y-2">
    <Button type="button" variant="outline" className="w-full justify-start" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {selected?.company || (value ? `已选择客户 #${value}` : "搜索并选择客户")}
    </Button>
    {open && <div id={id} className="space-y-2 rounded-md border p-2" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <Input autoFocus aria-label="搜索客户公司、编号、联系人或邮箱" placeholder="公司、编号、联系人或邮箱" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
      {loading ? <p role="status" className="text-xs">正在搜索...</p> : error ? <div role="alert" className="text-xs">{error}<Button type="button" variant="ghost" size="sm" onClick={() => setRetry(retry + 1)}>重试</Button></div> : <>
        <div className="max-h-60 overflow-y-auto">{items.map((customer) => <Button type="button" variant="ghost" className="h-auto w-full justify-start text-left" key={customer.id} onClick={() => { onChange(customer); setOpen(false); }}>
          <span><span className="block">{customer.company || "未填写公司"}</span><span className="block text-xs text-muted-foreground">{customer.customerId} · {customer.email || customer.contact || "暂无联系信息"}</span></span>
        </Button>)}{items.length === 0 && <p className="text-xs">没有符合条件的授权客户</p>}</div>
        <div className="flex items-center justify-between text-xs"><Button type="button" size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button><span>共 {total} 条 · 第 {page + 1} 页</span><Button type="button" size="sm" variant="ghost" disabled={(page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>下一页</Button></div>
      </>}
    </div>}
  </div>;
}
