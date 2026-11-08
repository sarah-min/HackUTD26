// Tool registry: one import per line, one entry per line (WORKFLOW.md §3).
import type { AnyAgentTool } from './types';
import { getReportContextTool } from './getReportContext';
import { getFrameFindingsTool } from './getFrameFindings';
import { reverseGeocodeTool } from './reverseGeocode';
import { lookupDisasterDeclarationsTool } from './lookupDisasterDeclarations';
import { getWeatherAlertsTool } from './getWeatherAlerts';
import { estimateRepairCostTool } from './estimateRepairCost';
import { draftClaimNoticeTool } from './draftClaimNotice';

export const analyzeTools: AnyAgentTool[] = [
  getReportContextTool,
  getFrameFindingsTool,
  reverseGeocodeTool,
  lookupDisasterDeclarationsTool,
  getWeatherAlertsTool,
  estimateRepairCostTool,
  draftClaimNoticeTool,
];

export * from './types';
export { getReportContextTool } from './getReportContext';
export { getFrameFindingsTool } from './getFrameFindings';
export { reverseGeocodeTool, resolveLocation } from './reverseGeocode';
export { lookupDisasterDeclarationsTool, buildOpenFemaUrl, mapFemaRows } from './lookupDisasterDeclarations';
export { getWeatherAlertsTool } from './getWeatherAlerts';
export { estimateRepairCostTool } from './estimateRepairCost';
export { draftClaimNoticeTool } from './draftClaimNotice';
export { loadFindings, loadCoordinates } from './shared';
