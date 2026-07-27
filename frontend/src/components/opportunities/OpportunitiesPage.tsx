import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getOpportunities, updateOpportunity, type Opportunity } from "@/api/client";

const STAGES = [
  { value: "inquiry", label: "询盘", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "quoting", label: "报价中", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "negotiating", label: "谈判中", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "closed-won", label: "已成交", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "closed-lost", label: "已流失", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
];

export function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getOpportunities();
      setOpportunities(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleStageChange = async (id: string, newStage: string) => {
    await updateOpportunity(id, { stage: newStage as Opportunity["stage"] });
    fetchOpportunities();
  };

  // Group opportunities by stage
  const opportunitiesByStage = STAGES.map((stage) => ({
    ...stage,
    opportunities: opportunities.filter((o) => o.stage === stage.value),
  }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-24 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          商机从客户 360 详情中创建。可直接切换阶段。
        </p>
        <Badge variant="secondary">共 {opportunities.length} 个商机</Badge>
      </div>

      {/* Pipeline Board */}
      <div className="grid gap-4 md:grid-cols-5 overflow-x-auto">
        {opportunitiesByStage.map((stage) => (
          <Card key={stage.value} className="min-w-[200px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                {stage.label}
                <Badge variant="secondary">{stage.opportunities.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
              {stage.opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-lg border p-3 space-y-2 bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm line-clamp-2">{opp.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {opp.customerName || "未知客户"}
                  </p>
                  {opp.value && (
                    <p className="text-sm font-medium">
                      {(opp as any).product ? `${(opp as any).product} · ` : ""}
                      {opp.currency || "USD"} {opp.value?.toLocaleString()}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {opp.expectedCloseDate
                        ? `预计 ${new Date(opp.expectedCloseDate).toLocaleDateString()}`
                        : ""}
                      {opp.probability !== undefined && opp.probability !== null
                        ? ` · 概率 ${opp.probability}%`
                        : ""}
                    </span>
                    <Select
                      value={opp.stage}
                      onValueChange={(v) => { if (v) handleStageChange(opp.id, v) }}
                    >
                      <SelectTrigger className="h-6 w-6 p-0 border-0">
                        <span className="sr-only">切换阶段</span>
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {stage.opportunities.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  暂无商机
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}