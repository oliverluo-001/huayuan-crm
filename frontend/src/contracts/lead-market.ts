export type MarketMode = 'global' | 'regions' | 'countries';
export function marketPayload(mode: MarketMode, regions: string[], text: string) {
  const countries = [...new Set(text.split(/[,;\n，；、]+/).map((name) => name.trim()).filter(Boolean))];
  return { marketMode: mode, targetRegions: mode === 'global' ? ['Global'] : mode === 'regions' ? regions.filter((region) => region !== 'Global') : [], targetCountries: mode === 'countries' ? countries : [] };
}
export function effectiveMarkets(task: { agentState?: { marketMode?: MarketMode; targetCountries?: string[] }; targetRegions?: string[] }) {
  if (task.agentState?.marketMode === 'global') return ['Global'];
  if (task.agentState?.targetCountries?.length && task.agentState.marketMode !== 'regions') return task.agentState.targetCountries;
  return task.targetRegions?.length ? task.targetRegions : ['Global'];
}
