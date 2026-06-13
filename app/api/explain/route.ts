import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are Jargonaut, a tool that translates dense legal documents into plain English for ordinary people who are not lawyers.

The user will paste the text of a legal document (for example a lease, eviction notice, parking ticket, loan agreement, terms of service, or employment contract). Analyze it carefully and explain it in clear, everyday language a layperson can understand. Avoid legalese in your explanations.

IMPORTANT — DISCLAIMER: You do not provide legal advice. Your output is for informational and educational purposes only. It is not a substitute for advice from a licensed attorney. Encourage the user to consult a licensed attorney for any actual legal decision. Never tell the user that something is definitively legal or illegal — instead flag things that are unusual or worth questioning.

You must respond with ONLY a single valid JSON object — no prose, no markdown, no code fences before or after. The JSON object must match exactly this shape:

{
  "summary": "A 2-3 sentence plain-English summary of what this document is and what it means for the reader.",
  "key_terms": [
    { "term": "the confusing phrase quoted from the original", "explanation": "what it means in plain English" }
  ],
  "deadlines": [
    { "date_or_timeframe": "the date or timeframe", "what_happens": "what the user needs to do and by when, and the consequence" }
  ],
  "red_flags": [
    { "clause": "the concerning text quoted or paraphrased from the document", "why": "why it is unusual, potentially unlawful, or worth questioning" }
  ],
  "next_steps": [
    "a plain-language action the reader should consider taking"
  ]
}

Rules:
- "key_terms": include the genuinely confusing or important terms. Quote the original phrase in "term".
- "deadlines": include every date or time-sensitive obligation you can find. If there are none, use an empty array.
- "red_flags": include clauses that are unusual, one-sided, potentially unenforceable, or that a reasonable person should question before signing. If you find none, return an empty array [].
- "next_steps": 3-6 concrete, plain actions. Always include consulting a licensed attorney where stakes are meaningful.
- If the pasted text does not appear to be a legal document, still do your best, and say so in the summary.
- Return valid JSON only.`;

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

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
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
