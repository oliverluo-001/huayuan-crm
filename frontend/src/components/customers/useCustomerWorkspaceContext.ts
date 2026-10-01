import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getCustomer360, type Customer360, type Opportunity } from "@/api/client";
import { toast } from "sonner";

/** Resolve the linked customer through the authorized API, never trust URL business data. */
export function useCustomerWorkspaceContext(enabled: boolean, apply: (data: Customer360, opportunity?: Opportunity) => void) {
  const [params] = useSearchParams();
  const customerId = params.get("customerId");
  const opportunityId = params.get("opportunityId");
  const applied = useRef(false);
  const callback = useRef(apply);
  callback.current = apply;
  useEffect(() => {
    if (!enabled || !customerId || applied.current) return;
    let cancelled = false;
    getCustomer360(customerId).then((data) => {
      if (cancelled) return;
      applied.current = true;
      callback.current(data, data.opportunities.find((item) => String(item.id) === opportunityId || item.opportunityId === opportunityId));
    }).catch(() => { if (!cancelled) toast.error("来源客户加载失败，请手动搜索客户，已填内容保留"); });
    return () => { cancelled = true; };
  }, [customerId, opportunityId, enabled]);
}
