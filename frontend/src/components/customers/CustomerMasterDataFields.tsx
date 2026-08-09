import type { UserDirectoryEntry } from "@/api/client";
import {
  CURRENCY_OPTIONS,
  CUSTOMER_SOURCE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  INCOTERM_OPTIONS,
  type CustomerMasterForm,
} from "@/contracts/customer-master-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function CustomerMasterDataFields({
  form,
  users,
  canAssignOwner,
  onChange,
}: {
  form: CustomerMasterForm;
  users: UserDirectoryEntry[];
  canAssignOwner: boolean;
  onChange: (field: keyof CustomerMasterForm, value: string | string[]) => void;
}) {
  const collaborators = users.filter(
    (user) => user.role !== "viewer" && user.id !== form.ownerId,
  );

  const toggleCollaborator = (id: string, checked: boolean) => {
    if (!canAssignOwner) return;
    const next = checked
      ? [...new Set([...form.collaboratorIds, id])]
      : form.collaboratorIds.filter((item) => item !== id);
    onChange("collaboratorIds", next);
  };

  return (
    <>
      <div className="space-y-2">
        <Label>国家 / 地区</Label>
        <Input value={form.country} onChange={(event) => onChange("country", event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>公司类型</Label>
        <Select value={form.customerType || "__none__"} onValueChange={(value) => onChange("customerType", value === "__none__" ? "" : value || "")}>
          <SelectTrigger><SelectValue placeholder="选择公司类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">未设置</SelectItem>
            {CUSTOMER_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>详细地址</Label>
        <Textarea rows={2} value={form.address} onChange={(event) => onChange("address", event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>主要市场</Label>
        <Input placeholder="例如：东南亚、欧洲；多个市场用逗号分隔" value={form.mainMarkets} onChange={(event) => onChange("mainMarkets", event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>年采购金额</Label>
        <Input type="number" min="0" step="0.01" placeholder="按首选币种填写" value={form.annualPurchaseAmount} onChange={(event) => onChange("annualPurchaseAmount", event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>首选币种</Label>
        <Select value={form.preferredCurrency} onValueChange={(value) => onChange("preferredCurrency", value || "USD")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCY_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>首选贸易条款</Label>
        <Select value={form.preferredIncoterm || "__none__"} onValueChange={(value) => onChange("preferredIncoterm", value === "__none__" ? "" : value || "")}>
          <SelectTrigger><SelectValue placeholder="选择 Incoterm" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">未设置</SelectItem>
            {INCOTERM_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>客户来源</Label>
        <Select value={form.source || "__none__"} onValueChange={(value) => onChange("source", value === "__none__" ? "" : value || "")}>
          <SelectTrigger><SelectValue placeholder="选择客户来源" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">未设置</SelectItem>
            {CUSTOMER_SOURCE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {canAssignOwner && (
        <div className="space-y-2">
          <Label>负责人</Label>
          <Select value={form.ownerId || "__none__"} onValueChange={(value) => onChange("ownerId", value === "__none__" ? "" : value || "")}>
            <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">未分配</SelectItem>
              {users.filter((user) => user.role !== "viewer").map((user) => <SelectItem key={user.id} value={user.id}>{user.displayName}（{user.username}）</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2 md:col-span-2">
        <Label>协作者</Label>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          {collaborators.length ? collaborators.map((user) => (
            <label key={user.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canAssignOwner} checked={form.collaboratorIds.includes(user.id)} onChange={(event) => toggleCollaborator(user.id, event.target.checked)} />
              <span>{user.displayName}（{user.username}）</span>
            </label>
          )) : <span className="text-sm text-muted-foreground">暂无可选协作者</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {canAssignOwner
            ? "协作者可查看并维护该客户；负责人和授权范围仅由管理员调整。"
            : "你只能查看当前授权范围；如需调整负责人或协作者，请联系管理员。"}
        </p>
      </div>
    </>
  );
}
