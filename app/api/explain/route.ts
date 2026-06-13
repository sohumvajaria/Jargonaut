import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Translate the pasted legal document into plain English for a non-lawyer. This is informational only, not legal advice; tell the reader to consult a licensed attorney for legal decisions, and flag clauses as unusual or worth questioning rather than as definitively legal or illegal.

Respond with ONLY a valid JSON object (no markdown, no code fences) matching this schema:

{
  "summary": string,                                              // 2-3 sentences: what the document is and what it means for the reader
  "key_terms": [{ "term": string, "explanation": string }],       // confusing phrase quoted from the text, plus its plain-English meaning
  "deadlines": [{ "date_or_timeframe": string, "what_happens": string }], // [] if none
  "red_flags": [{ "clause": string, "why": string }],             // unusual/one-sided/questionable clauses; [] if none
  "next_steps": [string]                                          // 3-6 concrete actions to consider
}`;

interface ExplainResult {
  summary: string;
  key_terms: { term: string; explanation: string }[];
  deadlines: { date_or_timeframe: string; what_happens: string }[];
  red_flags: { clause: string; why: string }[];
  next_steps: string[];
}

function extractJson(text: string): ExplainResult {
  // Be forgiving in case the model wraps the JSON in code fences or stray prose.
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(cleaned) as Partial<ExplainResult>;
  return {
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

  // maxRetries: 0 guarantees exactly one API call per request — no automatic retries.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
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

    if (!rawText) {
      return NextResponse.json(
        { error: "The model returned an empty response. Please try again." },
        { status: 502 }
      );
    }

    let result: ExplainResult;
    try {
      result = extractJson(rawText);
    } catch {
      return NextResponse.json(
        { error: "Could not parse the model's response. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const messageText =
      err instanceof Error ? err.message : "Unexpected error contacting the model.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
