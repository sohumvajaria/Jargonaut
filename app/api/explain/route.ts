import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Translate the pasted legal document into plain English for a non-lawyer. This is informational only, not legal advice; tell the reader to consult a licensed attorney for legal decisions, and flag clauses as unusual or worth questioning rather than as definitively legal or illegal.

Respond with ONLY a valid JSON object (no markdown, no code fences) matching this schema:

{
  "document_type": string,                                        // short label for the kind of document, e.g. "Lease Agreement", "Parking Ticket", "Gym Contract", "Eviction Notice", "Employment Contract". 1-4 words. Use "Legal Document" if genuinely unclear.
  "risk_score": integer,                                          // overall risk to the reader from 1 to 10. 1-3 = low (few/no concerns), 4-6 = medium (some concerning terms), 7-10 = high (many or severe red flags). Base this on the number and severity of red_flags below.
  "summary": string,                                              // 2-3 sentences: what the document is and what it means for the reader
  "key_terms": [{ "term": string, "explanation": string }],       // confusing phrase quoted from the text, plus its plain-English meaning
  "deadlines": [{ "date_or_timeframe": string, "what_happens": string }], // [] if none
  "red_flags": [{ "clause": string, "why": string }],             // see red flag rules below; [] if none
  "next_steps": [string]                                          // 3-6 concrete actions to consider
}

Red flag rules — be strict. Only flag clauses that are genuinely unusual, one-sided, potentially illegal, or that significantly disadvantage the average person. Do NOT flag standard or reasonable terms. If the document contains no genuinely concerning clauses, return an empty red_flags array [].
Do NOT flag: standard fees disclosed upfront, normal limitation-of-liability language, typical renewal terms, reasonable replacement fees.
DO flag: hidden or undisclosed fees, waiver of legal rights, unusually harsh penalties, clauses that may violate consumer protection or habitability law, contradictory or confusing terms that could mislead someone.`;

interface ExplainResult {
  document_type: string;
  risk_score: number;
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: { clause: string; why: string }[];
  next_steps: string[];
}

// Strip markdown code fences and stray prose so JSON.parse sees only the object.
// Tolerates an opening ```json / ``` fence with no closing fence (e.g. when the
// model's output is truncated) by also narrowing to the outermost { ... }.
function stripToJson(text: string): string {
  let cleaned = text.trim();

  // Remove a leading ```json or ``` fence and a trailing ``` fence, plus the
  // whitespace around them. Either fence may be absent.
  cleaned = cleaned
    .replace(/^```(?:json)?[ \t]*\r?\n?/i, "")
    .replace(/\r?\n?[ \t]*```$/i, "")
    .trim();

  // Fall back to the outermost JSON object in case prose surrounds it.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

function extractJson(text: string): ExplainResult {
  const parsed = JSON.parse(stripToJson(text)) as Partial<ExplainResult>;
  // Coerce risk_score to an integer clamped to the documented 1-10 range so the
  // UI can rely on it; default to 1 (low) if the model omits or mangles it.
  const rawScore = Number(parsed.risk_score);
  const riskScore = Number.isFinite(rawScore)
    ? Math.min(10, Math.max(1, Math.round(rawScore)))
    : 1;
  return {
    document_type:
      typeof parsed.document_type === "string" && parsed.document_type.trim()
        ? parsed.document_type.trim()
        : "Legal Document",
    risk_score: riskScore,
    summary: parsed.summary ?? "",
    key_terms: Array.isArray(parsed.key_terms) ? parsed.key_terms : [],
    deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing the ANTHROPIC_API_KEY environment variable." },
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

  // Guard against very large pastes.
  const MAX_CHARS = 50_000;
  const truncated = document.slice(0, MAX_CHARS);

  // maxRetries: 0 keeps the SDK from adding its own retries; we control retries
  // explicitly below.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  // One model call + parse. Throws if the model returns empty text or unparseable
  // JSON, so the caller can decide whether to retry.
  async function callAndParse(attempt: number): Promise<ExplainResult> {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the legal document text to analyze:\n\n"""\n${truncated}\n"""`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // DEBUG: log exactly what the model returned before we attempt to parse it.
    console.log(
      `[explain] attempt ${attempt}: stop_reason=${message.stop_reason} rawText.length=${rawText.length}`
    );
    console.log(`[explain] attempt ${attempt}: rawText >>>\n${rawText}\n<<<`);

    if (!rawText) {
      throw new Error("The model returned an empty response.");
    }

    // extractJson throws (SyntaxError) on malformed JSON. Log the stripped text
    // that JSON.parse actually sees and the exact parse error, then rethrow.
    try {
      return extractJson(rawText);
    } catch (parseErr) {
      const stripped = stripToJson(rawText);
      console.error(
        `[explain] attempt ${attempt}: JSON.parse FAILED: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`
      );
      console.error(`[explain] attempt ${attempt}: stripped text >>>\n${stripped}\n<<<`);
      throw parseErr;
    }
  }

  // Try up to twice: if the first response is empty or unparseable, make one more
  // identical call before giving up. Genuine API errors (auth, rate limit,
  // network) are surfaced immediately rather than retried here.
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callAndParse(attempt);
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error(
          `[explain] attempt ${attempt}: Anthropic APIError status=${err.status}: ${err.message}`
        );
        const messageText = err.message || "Unexpected error contacting the model.";
        return NextResponse.json({ error: messageText }, { status: err.status ?? 500 });
      }
      // Empty/malformed response — fall through to retry, or to the error below
      // once attempts are exhausted.
      console.error(
        `[explain] attempt ${attempt} FAILED (will ${
          attempt < MAX_ATTEMPTS ? "retry" : "give up"
        }): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.error("[explain] all attempts failed — returning generic error to user");

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 502 }
  );
}
