import { useEffect, useState } from "react";
import { Banknote, ImageUp, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getQuoteOutputProfile,
  quoteOutputAssetUrl,
  saveQuoteOutputProfile,
  uploadQuoteOutputAsset,
  type QuoteOutputProfile,
} from "@/api/client";

const emptyProfile: QuoteOutputProfile = {
  companyNameZh: "",
  companyNameEn: "",
  taglineZh: "",
  taglineEn: "",
  addressZh: "",
  addressEn: "",
  phone: "",
  email: "",
  website: "",
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactEmail: "",
  bankName: "",
  bankAddress: "",
  accountName: "",
  accountNumber: "",
  swiftCode: "",
  beneficiaryAddress: "",
  defaultLanguage: "bilingual",
  footerZh: "",
  footerEn: "",
  logoAsset: null,
  signatureAsset: null,
};

export function QuoteOutputSettings({ isAdmin }: { isAdmin: boolean }) {
  const [profile, setProfile] = useState<QuoteOutputProfile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "signature" | null>(null);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      setProfile(await getQuoteOutputProfile());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const update = (key: keyof QuoteOutputProfile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    try {
      const saved = await saveQuoteOutputProfile(profile);
      setProfile(saved);
      toast.success("报价输出资料已保存");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAsset = async (kind: "logo" | "signature", file?: File) => {
    if (!file || !isAdmin) return;
    setUploading(kind);
    try {
      const saved = await uploadQuoteOutputAsset(kind, file);
      setProfile(saved);
      toast.success(kind === "logo" ? "公司 Logo 已上传" : "签名图片已上传");
    } finally {
      setUploading(null);
    }
  };

  const disabled = !isAdmin || isLoading || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          报价输出设置
          {!isAdmin && <Badge variant="outline">只读</Badge>}
        </CardTitle>
        <CardDescription>维护正式报价单使用的抬头、银行信息、Logo 和签名。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="中文公司名称"><Input disabled={disabled} value={profile.companyNameZh} onChange={(event) => update("companyNameZh", event.target.value)} /></Field>
              <Field label="English Company Name"><Input disabled={disabled} value={profile.companyNameEn} onChange={(event) => update("companyNameEn", event.target.value)} /></Field>
              <Field label="中文抬头说明"><Input disabled={disabled} value={profile.taglineZh} onChange={(event) => update("taglineZh", event.target.value)} /></Field>
              <Field label="English Tagline"><Input disabled={disabled} value={profile.taglineEn} onChange={(event) => update("taglineEn", event.target.value)} /></Field>
              <Field label="中文地址"><Textarea disabled={disabled} rows={2} value={profile.addressZh} onChange={(event) => update("addressZh", event.target.value)} /></Field>
              <Field label="English Address"><Textarea disabled={disabled} rows={2} value={profile.addressEn} onChange={(event) => update("addressEn", event.target.value)} /></Field>
              <Field label="公司电话"><Input disabled={disabled} value={profile.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
              <Field label="公司邮箱"><Input disabled={disabled} type="email" value={profile.email} onChange={(event) => update("email", event.target.value)} /></Field>
              <Field label="公司网站"><Input disabled={disabled} value={profile.website} onChange={(event) => update("website", event.target.value)} /></Field>
              <Field label="默认模板语言">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={disabled}
                  value={profile.defaultLanguage}
                  onChange={(event) => update("defaultLanguage", event.target.value)}
                >
                  <option value="bilingual">中英双语</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <div className="space-y-4">
              <AssetUploader
                title="公司 Logo"
                assetName={profile.logoAsset?.originalName}
                src={profile.logoAsset ? quoteOutputAssetUrl("logo", profile.logoAsset.updatedAt) : ""}
                disabled={disabled}
                uploading={uploading === "logo"}
                onChange={(file) => uploadAsset("logo", file)}
              />
              <AssetUploader
                title="签名图片"
                assetName={profile.signatureAsset?.originalName}
                src={profile.signatureAsset ? quoteOutputAssetUrl("signature", profile.signatureAsset.updatedAt) : ""}
                disabled={disabled}
                uploading={uploading === "signature"}
                onChange={(file) => uploadAsset("signature", file)}
              />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="联系人姓名"><Input disabled={disabled} value={profile.contactName} onChange={(event) => update("contactName", event.target.value)} /></Field>
            <Field label="联系人职务"><Input disabled={disabled} value={profile.contactTitle} onChange={(event) => update("contactTitle", event.target.value)} /></Field>
            <Field label="联系人电话"><Input disabled={disabled} value={profile.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} /></Field>
            <Field label="联系人邮箱"><Input disabled={disabled} type="email" value={profile.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} /></Field>
          </section>

          <section className="rounded-lg border p-4">
            <div className="mb-4 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">银行信息</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="开户行"><Input disabled={disabled} value={profile.bankName} onChange={(event) => update("bankName", event.target.value)} /></Field>
              <Field label="SWIFT"><Input disabled={disabled} value={profile.swiftCode} onChange={(event) => update("swiftCode", event.target.value)} /></Field>
              <Field label="收款人"><Input disabled={disabled} value={profile.accountName} onChange={(event) => update("accountName", event.target.value)} /></Field>
              <Field label="账号"><Input disabled={disabled} value={profile.accountNumber} onChange={(event) => update("accountNumber", event.target.value)} /></Field>
              <Field label="银行地址"><Textarea disabled={disabled} rows={2} value={profile.bankAddress} onChange={(event) => update("bankAddress", event.target.value)} /></Field>
              <Field label="收款人地址"><Textarea disabled={disabled} rows={2} value={profile.beneficiaryAddress} onChange={(event) => update("beneficiaryAddress", event.target.value)} /></Field>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="中文页脚"><Textarea disabled={disabled} rows={3} value={profile.footerZh} onChange={(event) => update("footerZh", event.target.value)} /></Field>
            <Field label="English Footer"><Textarea disabled={disabled} rows={3} value={profile.footerEn} onChange={(event) => update("footerEn", event.target.value)} /></Field>
          </section>

          {isAdmin && (
            <Button type="submit" disabled={disabled}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "保存中..." : "保存报价输出资料"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AssetUploader({
  title,
  assetName,
  src,
  disabled,
  uploading,
  onChange,
}: {
  title: string;
  assetName?: string;
  src: string;
  disabled: boolean;
  uploading: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <ImageUp className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mb-3 flex h-24 items-center justify-center rounded-md bg-muted/50">
        {src ? <img src={src} alt={title} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">未上传</span>}
      </div>
      {assetName && <p className="mb-2 truncate text-xs text-muted-foreground">{assetName}</p>}
      <Input
        disabled={disabled || uploading}
        type="file"
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
    </div>
  );
}
