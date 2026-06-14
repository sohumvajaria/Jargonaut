import OpenAI from "openai";
import { NextResponse } from "next/server";
import { formatLlmApiError } from "../../llm-api-error";
import { applyRules, type VerifiedFinding } from "../../rules";

export const runtime = "nodejs";
export const maxDuration = 60;

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Translate the pasted legal document into plain English for a non-lawyer. This is informational only, not legal advice; tell the reader to consult a licensed attorney for legal decisions, and flag clauses as unusual or worth questioning rather than as definitively legal or illegal.

Respond with ONLY a valid JSON object (no markdown, no code fences) matching this schema:

{
  "document_type": string,                                        // short label for the kind of document, e.g. "Lease Agreement", "Parking Ticket", "Gym Contract", "Eviction Notice", "Employment Contract". 1-4 words. Use "Legal Document" if genuinely unclear.
  "jurisdiction": string,                                         // US state the document appears to govern, e.g. "California", "New York". Use "Unknown" if not determinable from the text.
  "risk_score": integer,                                          // overall risk to the reader from 1 to 10. 1-3 = low (few/no concerns), 4-6 = medium (some concerning terms), 7-10 = high (many or severe red flags). Base this on the number and severity of red_flags below.
  "summary": string,                                              // 2-3 sentences: what the document is and what it means for the reader
  "key_terms": [{ "term": string, "explanation": string }],       // confusing phrase quoted from the text, plus its plain-English meaning
  "deadlines": [{ "date_or_timeframe": string, "what_happens": string }], // [] if none
  "red_flags": [{ "clause": string, "why": string, "source_quote": string }], // see red flag rules below; [] if none
  "next_steps": [string]                                          // 3-6 concrete actions to consider
}

Red flag rules — be strict. Only flag clauses that are genuinely unusual, one-sided, potentially illegal, or that significantly disadvantage the average person. Do NOT flag standard or reasonable terms. If the document contains no genuinely concerning clauses, return an empty red_flags array [].
Do NOT flag: standard fees disclosed upfront, normal limitation-of-liability language, typical renewal terms, reasonable replacement fees.
DO flag: hidden or undisclosed fees, waiver of legal rights, unusually harsh penalties, clauses that may violate consumer protection or habitability law, contradictory or confusing terms that could mislead someone.

For each red flag, source_quote is REQUIRED. It is used for automated string matching against the original document — not for display.
- source_quote MUST be copied verbatim from the input document: an exact substring, character-for-character.
- Do NOT paraphrase, summarize, reword, or fix typos in source_quote.
- Pick the shortest contiguous span (4–15 words) that pinpoints the concerning language.
- If you cannot find a verbatim 4–15 word substring in the document for a concern, do not include that red flag.`;

interface RedFlag {
  clause: string;
  why: string;
  source_quote: string;
  verified: boolean;
}

interface ExplainResult {
  document_type: string;
  jurisdiction: string;
  risk_score: number;
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: RedFlag[];
  next_steps: string[];
  verified_findings: VerifiedFinding[];
}

function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function verifyRedFlagQuotes(
  document: string,
  redFlags: RedFlag[]
): RedFlag[] {
  const normalizedDocument = normalizeForQuoteMatch(document);
  return redFlags.map((flag) => ({
    ...flag,
    verified:
      flag.source_quote.trim().length > 0 &&
      normalizedDocument.includes(normalizeForQuoteMatch(flag.source_quote)),
  }));
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

class TruncationError extends Error {}

function extractJson(text: string): ExplainResult {
  const parsed = JSON.parse(stripToJson(text)) as Partial<ExplainResult>;
  const rawScore = Number(parsed.risk_score);
  const riskScore = Number.isFinite(rawScore)
    ? Math.min(10, Math.max(1, Math.round(rawScore)))
    : 1;
  const rawRedFlags = Array.isArray(parsed.red_flags) ? parsed.red_flags : [];
  const red_flags: RedFlag[] = rawRedFlags.map((item) => {
    const raw = item as Partial<RedFlag>;
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
    red_flags,
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
    verified_findings: [],
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing the LLM_API_KEY environment variable." },
      { status: 500 }
    );
  }

  let document: string;
  try {
    const body = await request.json();
    document = typeof body?.document === "string" ? body.document : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!document.trim()) {
    return NextResponse.json(
      { error: "Please paste some document text to explain." },
      { status: 400 }
    );
  }

  const MAX_CHARS = 50_000;
  const truncated = document.slice(0, MAX_CHARS);

  const client = new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
    maxRetries: 0,
  });

  async function callAndParse(): Promise<ExplainResult> {
    const completion = await client.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the legal document text to analyze:\n\n"""\n${truncated}\n"""`,
        },
      ],
    });

    const choice = completion.choices[0];
    if (choice?.finish_reason === "length") {
      throw new TruncationError("The model's response was cut off.");
    }

    const rawText = choice?.message.content;
    if (!rawText) {
      throw new Error("The model returned an empty response.");
    }

    const parsed = extractJson(rawText);
    return {
      ...parsed,
      red_flags: verifyRedFlagQuotes(truncated, parsed.red_flags),
    };
  }

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callAndParse();
      return NextResponse.json({
        ...result,
        verified_findings: applyRules(truncated),
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        return NextResponse.json(
          { error: formatLlmApiError(err) },
          { status: err.status ?? 500 }
        );
      }
      if (err instanceof TruncationError) {
        return NextResponse.json(
          {
            error:
              "This document is too long to analyze in full. Please try a shorter section.",
          },
          { status: 422 }
        );
      }
    }
  }

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 502 }
  );
}
