import type { VerifiedFinding } from "./rules";

export interface ExplainResult {
  document_type: string;
  jurisdiction: string;
  risk_score: number;
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: {
    clause: string;
    why: string;
    source_quote: string;
    verified: boolean;
  }[];
  next_steps: string[];
  verified_findings: VerifiedFinding[];
}
