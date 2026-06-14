import OpenAI from "openai";
import { NextResponse } from "next/server";
import { formatLlmApiError } from "../../llm-api-error";

export const runtime = "nodejs";
export const maxDuration = 60;

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

interface LetterFinding {
  title?: string;
  clause?: string;
  citation?: string;
  explanation?: string;
  why?: string;
}

interface LetterRequest {
  documentType: string;
  jurisdiction: string;
  findings: LetterFinding[];
}

const SYSTEM_PROMPT = `You draft firm but professional, plain-English demand letters for tenants writing to landlords about problematic lease or rental terms.

Write a letter FROM the tenant TO the landlord that:
- References the document type and jurisdiction provided
- Lists each specific problem clause or issue supplied
- Cites relevant statutes where a citation is provided (e.g. Cal. Civ. Code §1950.5)
- Requests correction or amendment of each issue
- Keeps the tone assertive but courteous — not hostile or threatening litigation unless clearly warranted
- Stays concise (roughly one page)
- Leaves bracketed placeholders like [Your name], [Date], [Property address] for the user to fill in

Respond with ONLY the letter body as plain text. No JSON, no markdown, no code fences, no preamble or commentary.`;

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:\w+)?[ \t]*\r?\n?/i, "")
    .replace(/\r?\n?[ \t]*```$/i, "")
    .trim();
  return cleaned;
}

function formatFindingsForPrompt(findings: LetterFinding[]): string {
  return findings
    .map((finding, index) => {
      const lines: string[] = [`Issue ${index + 1}:`];
      if (finding.title) {
        lines.push(`  Title: ${finding.title}`);
      }
      if (finding.clause) {
        lines.push(`  Clause: ${finding.clause}`);
      }
      if (finding.citation) {
        lines.push(`  Citation: ${finding.citation}`);
      }
      if (finding.explanation) {
        lines.push(`  Explanation: ${finding.explanation}`);
      }
      if (finding.why) {
        lines.push(`  Why it matters: ${finding.why}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing the LLM_API_KEY environment variable." },
      { status: 500 }
    );
  }

  let body: Partial<LetterRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const documentType =
    typeof body.documentType === "string" && body.documentType.trim()
      ? body.documentType.trim()
      : "Lease Agreement";
  const jurisdiction =
    typeof body.jurisdiction === "string" && body.jurisdiction.trim()
      ? body.jurisdiction.trim()
      : "Unknown";
  const findings = Array.isArray(body.findings) ? body.findings : [];

  if (findings.length === 0) {
    return NextResponse.json(
      { error: "At least one finding is required to draft a letter." },
      { status: 400 }
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
    maxRetries: 0,
  });

  try {
    const completion = await client.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Document type: ${documentType}
Jurisdiction: ${jurisdiction}

Problem clauses and findings to address:

${formatFindingsForPrompt(findings)}

Draft the demand letter now.`,
        },
      ],
    });

    const rawText = completion.choices[0]?.message.content ?? "";
    const letter = stripMarkdownFences(rawText);

    if (!letter) {
      return NextResponse.json(
        { error: "The model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({ letter });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: formatLlmApiError(err) },
        { status: err.status ?? 500 }
      );
    }
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 502 }
    );
  }
}
