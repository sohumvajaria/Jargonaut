import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import OpenAI from "openai";
import { applyRules } from "../app/rules";
import { SAMPLE_DOCUMENT } from "../app/sample";
import type { ExplainResult } from "../app/explain-result";

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Translate the pasted legal document into plain English for a non-lawyer. This is informational only, not legal advice; tell the reader to consult a licensed attorney for legal decisions, and flag clauses as unusual or worth questioning rather than as definitively legal or illegal.

Respond with ONLY a valid JSON object (no markdown, no code fences) matching this schema:

{
  "document_type": string,
  "jurisdiction": string,
  "risk_score": integer,
  "summary": string,
  "key_terms": [{ "term": string, "explanation": string }],
  "deadlines": [{ "date_or_timeframe": string, "what_happens": string }],
  "red_flags": [{ "clause": string, "why": string, "source_quote": string }],
  "next_steps": [string]
}

Red flag rules — be strict. Only flag clauses that are genuinely unusual, one-sided, potentially illegal, or that significantly disadvantage the average person. Do NOT flag standard or reasonable terms. If the document contains no genuinely concerning clauses, return an empty red_flags array [].
Do NOT flag: standard fees disclosed upfront, normal limitation-of-liability language, typical renewal terms, reasonable replacement fees.
DO flag: hidden or undisclosed fees, waiver of legal rights, unusually harsh penalties, clauses that may violate consumer protection or habitability law, contradictory or confusing terms that could mislead someone.

For each red flag, source_quote is REQUIRED. It is used for automated string matching against the original document — not for display.
- source_quote MUST be copied verbatim from the input document: an exact substring, character-for-character.
- Do NOT paraphrase, summarize, reword, or fix typos in source_quote.
- Pick the shortest contiguous span (4–15 words) that pinpoints the concerning language.
- If you cannot find a verbatim 4–15 word substring in the document for a concern, do not include that red flag.`;

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const contents = readFileSync(envPath, "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional; rely on exported env vars.
  }
}

function stripToJson(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?[ \t]*\r?\n?/i, "")
    .replace(/\r?\n?[ \t]*```$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned.trim();
}

function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function verifyRedFlagQuotes(
  document: string,
  redFlags: ExplainResult["red_flags"]
): ExplainResult["red_flags"] {
  const normalizedDocument = normalizeForQuoteMatch(document);
  return redFlags.map((flag) => ({
    ...flag,
    verified:
      flag.source_quote.trim().length > 0 &&
      normalizedDocument.includes(normalizeForQuoteMatch(flag.source_quote)),
  }));
}

function parseModelJson(rawText: string, document: string): ExplainResult {
  const parsed = JSON.parse(stripToJson(rawText)) as Partial<ExplainResult>;
  const rawScore = Number(parsed.risk_score);
  const riskScore = Number.isFinite(rawScore)
    ? Math.min(10, Math.max(1, Math.round(rawScore)))
    : 1;
  const rawRedFlags = Array.isArray(parsed.red_flags) ? parsed.red_flags : [];
  const red_flags = rawRedFlags.map((item) => {
    const raw = item as Partial<ExplainResult["red_flags"][number]>;
    return {
      clause: typeof raw.clause === "string" ? raw.clause : "",
      why: typeof raw.why === "string" ? raw.why : "",
      source_quote:
        typeof raw.source_quote === "string" ? raw.source_quote : "",
      verified: false,
    };
  });

  return {
    document_type:
      typeof parsed.document_type === "string" && parsed.document_type.trim()
        ? parsed.document_type.trim()
        : "Legal Document",
    jurisdiction:
      typeof parsed.jurisdiction === "string" && parsed.jurisdiction.trim()
        ? parsed.jurisdiction.trim()
        : "Unknown",
    risk_score: riskScore,
    summary: parsed.summary ?? "",
    key_terms: Array.isArray(parsed.key_terms) ? parsed.key_terms : [],
    deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
    red_flags: verifyRedFlagQuotes(document, red_flags),
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
    verified_findings: applyRules(document),
  };
}

async function captureViaHttp(): Promise<ExplainResult> {
  const baseUrl = process.env.CAPTURE_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: SAMPLE_DOCUMENT }),
  });

  const rawBody = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Non-JSON response (HTTP ${res.status}): ${rawBody.slice(0, 120)}`
    );
  }

  if (!res.ok) {
    const message =
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as ExplainResult;
}

async function captureViaGroq(): Promise<ExplainResult> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
    maxRetries: 0,
  });

  const completion = await client.chat.completions.create({
    model: LLM_MODEL,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the legal document text to analyze:\n\n"""\n${SAMPLE_DOCUMENT}\n"""`,
      },
    ],
  });

  const rawText = completion.choices[0]?.message.content;
  if (!rawText) {
    throw new Error("The model returned an empty response.");
  }

  return parseModelJson(rawText, SAMPLE_DOCUMENT);
}

async function captureSampleResult(): Promise<void> {
  loadEnvLocal();

  let result: ExplainResult;
  try {
    result = await captureViaHttp();
    console.log("Captured via POST /api/explain");
  } catch (httpErr) {
    console.warn(
      `HTTP capture failed (${httpErr instanceof Error ? httpErr.message : httpErr}); trying direct Groq call…`
    );
    result = await captureViaGroq();
    console.log("Captured via direct Groq call");
  }

  const outPath = resolve(process.cwd(), "app/sample-result.ts");
  const serialized = JSON.stringify(result, null, 2);

  writeFileSync(
    outPath,
    `import type { ExplainResult } from "./explain-result";

/** Captured verbatim from POST /api/explain on SAMPLE_DOCUMENT. Regenerate: pnpm capture-sample */
export const SAMPLE_RESULT: ExplainResult = ${serialized};
`
  );

  console.log(`Wrote ${outPath}`);
  console.log(
    `verified_findings: ${result.verified_findings.length}, red_flags: ${result.red_flags.length}`
  );
}

captureSampleResult().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
