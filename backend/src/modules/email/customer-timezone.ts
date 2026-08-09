const LOCATION_TIMEZONES: Array<{ timezone: string; locations: string[] }> = [
  { timezone: "Asia/Bangkok", locations: ["bangkok", "thailand", "泰国", "曼谷"] },
  { timezone: "Asia/Jakarta", locations: ["jakarta", "indonesia", "印度尼西亚", "印尼", "雅加达"] },
  { timezone: "Asia/Kuala_Lumpur", locations: ["kuala lumpur", "malaysia", "马来西亚", "吉隆坡"] },
  { timezone: "Asia/Singapore", locations: ["singapore", "新加坡"] },
  { timezone: "Asia/Manila", locations: ["manila", "philippines", "菲律宾", "马尼拉"] },
  { timezone: "Asia/Ho_Chi_Minh", locations: ["ho chi minh", "hanoi", "vietnam", "越南", "胡志明", "河内"] },
  { timezone: "Asia/Shanghai", locations: ["beijing", "shanghai", "china", "中国", "北京", "上海"] },
  { timezone: "Asia/Hong_Kong", locations: ["hong kong", "香港"] },
  { timezone: "Asia/Taipei", locations: ["taipei", "taiwan", "台北", "台湾"] },
  { timezone: "Asia/Tokyo", locations: ["tokyo", "japan", "东京", "日本"] },
  { timezone: "Asia/Seoul", locations: ["seoul", "south korea", "korea", "首尔", "韩国"] },
  { timezone: "Asia/Kolkata", locations: ["mumbai", "new delhi", "india", "孟买", "新德里", "印度"] },
  { timezone: "Asia/Dhaka", locations: ["dhaka", "bangladesh", "达卡", "孟加拉"] },
  { timezone: "Asia/Karachi", locations: ["karachi", "pakistan", "卡拉奇", "巴基斯坦"] },
  { timezone: "Asia/Dubai", locations: ["dubai", "united arab emirates", "uae", "迪拜", "阿联酋"] },
  { timezone: "Asia/Riyadh", locations: ["riyadh", "saudi arabia", "利雅得", "沙特"] },
  { timezone: "Europe/Istanbul", locations: ["istanbul", "turkey", "伊斯坦布尔", "土耳其"] },
  { timezone: "Europe/London", locations: ["london", "united kingdom", "great britain", "英国", "伦敦"] },
  { timezone: "Europe/Berlin", locations: ["berlin", "germany", "德国", "柏林"] },
  { timezone: "Europe/Paris", locations: ["paris", "france", "法国", "巴黎"] },
  { timezone: "Europe/Rome", locations: ["rome", "italy", "意大利", "罗马"] },
  { timezone: "Europe/Madrid", locations: ["madrid", "spain", "西班牙", "马德里"] },
  { timezone: "Europe/Amsterdam", locations: ["amsterdam", "netherlands", "荷兰", "阿姆斯特丹"] },
  { timezone: "Europe/Warsaw", locations: ["warsaw", "poland", "波兰", "华沙"] },
  { timezone: "Africa/Johannesburg", locations: ["johannesburg", "south africa", "南非", "约翰内斯堡"] },
  { timezone: "Africa/Lagos", locations: ["lagos", "nigeria", "尼日利亚", "拉各斯"] },
  { timezone: "Africa/Cairo", locations: ["cairo", "egypt", "埃及", "开罗"] },
  { timezone: "Pacific/Auckland", locations: ["auckland", "new zealand", "新西兰", "奥克兰"] },
];

export function isValidIanaTimezone(value: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveCustomerTimezone(
  timezone?: string | null,
  region?: string | null,
  country?: string | null,
) {
  const explicit = String(timezone || "").trim();
  if (isValidIanaTimezone(explicit)) return explicit;

  const location = [explicit, region, country]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!location) return "";

  return LOCATION_TIMEZONES.find(({ locations }) =>
    locations.some((candidate) => location.includes(candidate)),
  )?.timezone || "";
}
