import type { ExplainResult } from "./explain-result";
import {
  buildDemoResult,
  buildGymContractDemoResult,
  buildParkingTicketDemoResult,
} from "./demo-result";
import {
  GYM_CONTRACT_DOCUMENT,
  PARKING_TICKET_DOCUMENT,
  SAMPLE_DOCUMENT,
} from "./sample";

/** Run `pnpm capture-sample` to replace lease result with live /api/explain JSON. */
export const SAMPLE_RESULT: ExplainResult = buildDemoResult();
export const PARKING_TICKET_RESULT: ExplainResult = buildParkingTicketDemoResult();
export const GYM_CONTRACT_RESULT: ExplainResult = buildGymContractDemoResult();

export function getSampleResult(documentText: string): ExplainResult | null {
  const trimmed = documentText.trim();
  if (trimmed === SAMPLE_DOCUMENT.trim()) return SAMPLE_RESULT;
  if (trimmed === PARKING_TICKET_DOCUMENT.trim()) return PARKING_TICKET_RESULT;
  if (trimmed === GYM_CONTRACT_DOCUMENT.trim()) return GYM_CONTRACT_RESULT;
  return null;
}
