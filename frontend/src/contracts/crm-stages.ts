export const CUSTOMER_JOURNEY_STAGES = [
  { value: "new", label: "新客户" },
  { value: "contacted", label: "已联系" },
  { value: "replied", label: "已回复" },
  { value: "qualified", label: "已确认需求" },
  { value: "opportunity", label: "已转为商机" },
  { value: "proposal", label: "已提交报价" },
  { value: "negotiation", label: "商务谈判" },
  { value: "won", label: "已成交" },
  { value: "lost", label: "已流失" },
] as const;

export const OPPORTUNITY_STAGES = [
  {
    value: "prospecting",
    label: "初步沟通",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  {
    value: "qualification",
    label: "需求确认",
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  },
  {
    value: "proposal",
    label: "报价方案",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  {
    value: "negotiation",
    label: "商务谈判",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  {
    value: "won",
    label: "已成交",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  {
    value: "lost",
    label: "已流失",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
] as const;

export const OPPORTUNITY_FORECAST_CATEGORIES = [
  { value: "pipeline", label: "销售管道" },
  { value: "best_case", label: "最佳情况" },
  { value: "commit", label: "承诺成交" },
  { value: "closed", label: "已关闭" },
  { value: "omitted", label: "排除预测" },
] as const;
