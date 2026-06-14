export interface VerifiedFinding {
  id: string;
  title: string;
  citation: string;
  jurisdiction: string;
  severity: "high" | "medium";
  explanation: string;
  source_quote: string;
}

export interface Rule {
  id: string;
  jurisdiction: string;
  citation: string;
  title: string;
  severity: "high" | "medium";
  explanation: string;
  match: (docLower: string, docRaw: string) => string | null;
}

const PROXIMITY_CHARS = 120;

function parseMoney(value: string): number | null {
  const num = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

interface TextSpan {
  index: number;
  end: number;
  text: string;
}

function findAll(text: string, pattern: RegExp): TextSpan[] {
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  const spans: TextSpan[] = [];
  let match = regex.exec(text);
  while (match !== null) {
    spans.push({
      index: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
    match = regex.exec(text);
  }
  return spans;
}

function areWithin(a: TextSpan, b: TextSpan, maxGap: number): boolean {
  if (a.end <= b.index) {
    return b.index - a.end <= maxGap;
  }
  if (b.end <= a.index) {
    return a.index - b.end <= maxGap;
  }
  return true;
}

const MAX_QUOTE_LEN = 140;

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9'"$&()]/.test(ch);
}

function isSentenceBoundaryAt(docRaw: string, index: number): boolean {
  const ch = docRaw[index] ?? "";
  if (ch === ";" || ch === ":") {
    return true;
  }
  if (ch !== ".") {
    return false;
  }
  const prev = docRaw[index - 1] ?? "";
  const next = docRaw[index + 1] ?? "";
  return !(/\d/.test(prev) && /\d/.test(next));
}

function snapToWordBoundaries(
  docRaw: string,
  start: number,
  end: number
): { start: number; end: number } {
  let snappedStart = start;
  let snappedEnd = end;

  while (
    snappedStart > 0 &&
    isWordChar(docRaw[snappedStart - 1] ?? "") &&
    isWordChar(docRaw[snappedStart] ?? "")
  ) {
    snappedStart--;
  }

  while (
    snappedEnd < docRaw.length &&
    isWordChar(docRaw[snappedEnd - 1] ?? "") &&
    isWordChar(docRaw[snappedEnd] ?? "")
  ) {
    snappedEnd++;
  }

  return { start: snappedStart, end: snappedEnd };
}

function clipToSingleLine(
  docRaw: string,
  start: number,
  end: number,
  keywordPos: number
): { start: number; end: number } {
  if (!docRaw.slice(start, end).includes("\n")) {
    return { start, end };
  }

  const keyword = Math.max(start, Math.min(keywordPos, end - 1));
  const lineStart = docRaw.lastIndexOf("\n", keyword) + 1;
  const nextNewline = docRaw.indexOf("\n", keyword);
  const lineEnd = nextNewline === -1 ? docRaw.length : nextNewline;

  return {
    start: Math.max(start, lineStart),
    end: Math.min(end, lineEnd),
  };
}

function skipLeadingWhitespace(docRaw: string, pos: number, max: number): number {
  while (pos < max && /\s/.test(docRaw[pos] ?? "")) {
    pos++;
  }
  return pos;
}

function shrinkEndToWordStart(docRaw: string, end: number, minEnd: number): number {
  let clippedEnd = end;
  while (
    clippedEnd > minEnd &&
    isWordChar(docRaw[clippedEnd - 1] ?? "") &&
    isWordChar(docRaw[clippedEnd] ?? "")
  ) {
    clippedEnd--;
  }
  return clippedEnd;
}

function shrinkStartToWordEnd(docRaw: string, start: number, maxStart: number): number {
  let clippedStart = start;
  while (
    clippedStart < maxStart &&
    isWordChar(docRaw[clippedStart - 1] ?? "") &&
    isWordChar(docRaw[clippedStart] ?? "")
  ) {
    clippedStart++;
  }
  return clippedStart;
}

function capLength(
  docRaw: string,
  start: number,
  end: number,
  keywordPos: number
): { start: number; end: number } {
  if (end - start <= MAX_QUOTE_LEN) {
    return { start, end };
  }

  const keyword = Math.max(start, Math.min(keywordPos, end - 1));
  const distToStart = keyword - start;
  const distToEnd = end - keyword;

  if (distToEnd >= distToStart) {
    const maxEnd = start + MAX_QUOTE_LEN;
    let newEnd = Math.min(end, maxEnd);
    let foundBoundary = false;

    for (let i = Math.min(end, maxEnd) - 1; i > keyword; i--) {
      if (isSentenceBoundaryAt(docRaw, i)) {
        newEnd = i + 1;
        foundBoundary = true;
        break;
      }
    }

    if (!foundBoundary) {
      newEnd = shrinkEndToWordStart(docRaw, newEnd, keyword + 1);
    }

    return { start, end: Math.max(keyword + 1, newEnd) };
  }

  const minStart = end - MAX_QUOTE_LEN;
  let newStart = Math.max(start, minStart);
  let foundBoundary = false;

  for (let i = Math.max(start, minStart); i < keyword; i++) {
    if (isSentenceBoundaryAt(docRaw, i)) {
      newStart = skipLeadingWhitespace(docRaw, i + 1, end);
      foundBoundary = true;
      break;
    }
  }

  if (!foundBoundary) {
    newStart = shrinkStartToWordEnd(docRaw, newStart, keyword);
  }

  return { start: Math.min(keyword, newStart), end };
}

function dropEarlierClauses(
  docRaw: string,
  start: number,
  end: number,
  keywordPos: number
): { start: number; end: number } {
  const keyword = Math.max(start, Math.min(keywordPos, end - 1));

  for (let i = keyword - 1; i >= start; i--) {
    if (isSentenceBoundaryAt(docRaw, i)) {
      const newStart = skipLeadingWhitespace(docRaw, i + 1, end);
      if (newStart < keyword) {
        return { start: newStart, end };
      }
      break;
    }
  }

  return { start, end };
}

function extendEndToCompleteSentence(docRaw: string, end: number): number {
  if (end <= 0 || isSentenceBoundaryAt(docRaw, end - 1)) {
    return end;
  }

  for (let i = end; i < Math.min(docRaw.length, end + 60); i++) {
    if (isSentenceBoundaryAt(docRaw, i)) {
      return i + 1;
    }
  }

  return end;
}

function trimQuoteEdges(
  docRaw: string,
  start: number,
  end: number
): { start: number; end: number } {
  let trimmedStart = start;
  let trimmedEnd = end;

  while (trimmedStart < trimmedEnd && /\s/.test(docRaw[trimmedStart] ?? "")) {
    trimmedStart++;
  }
  while (trimmedEnd > trimmedStart && /\s/.test(docRaw[trimmedEnd - 1] ?? "")) {
    trimmedEnd--;
  }
  while (
    trimmedStart < trimmedEnd &&
    (docRaw[trimmedStart] === '"' || docRaw[trimmedStart] === "'")
  ) {
    trimmedStart++;
  }
  while (
    trimmedEnd > trimmedStart &&
    (docRaw[trimmedEnd - 1] === '"' || docRaw[trimmedEnd - 1] === "'")
  ) {
    trimmedEnd--;
  }

  return { start: trimmedStart, end: trimmedEnd };
}

function tightenQuote(docRaw: string, startIdx: number, endIdx: number): string {
  const spanLen = endIdx - startIdx;
  const keywordPos = startIdx + Math.floor(spanLen * 0.3);
  let { start, end } = snapToWordBoundaries(docRaw, startIdx, endIdx);
  ({ start, end } = clipToSingleLine(docRaw, start, end, keywordPos));
  ({ start, end } = dropEarlierClauses(docRaw, start, end, keywordPos));
  ({ start, end } = capLength(docRaw, start, end, keywordPos));
  end = extendEndToCompleteSentence(docRaw, end);
  ({ start, end } = trimQuoteEdges(docRaw, start, end));

  if (start >= end) {
    return docRaw.slice(startIdx, endIdx);
  }

  return docRaw.slice(start, end);
}

function spanBetween(raw: string, a: TextSpan, b: TextSpan, pad: number): string {
  const start = Math.max(0, Math.min(a.index, b.index) - pad);
  const end = Math.min(raw.length, Math.max(a.end, b.end) + pad);
  return tightenQuote(raw, start, end);
}

function firstProximityMatch(
  docLower: string,
  docRaw: string,
  anchors: RegExp[],
  targets: RegExp[],
  maxGap: number,
  pad: number
): string | null {
  const anchorSpans = anchors.flatMap((pattern) => findAll(docLower, pattern));
  const targetSpans = targets.flatMap((pattern) => findAll(docLower, pattern));

  for (const anchor of anchorSpans) {
    for (const target of targetSpans) {
      if (areWithin(anchor, target, maxGap)) {
        return spanBetween(docRaw, anchor, target, pad);
      }
    }
  }
  return null;
}

function parsePercent(text: string): number | null {
  const parenMatch = text.match(/\(\s*(\d{1,2})\s*%\s*\)/);
  if (parenMatch) {
    return Number.parseInt(parenMatch[1], 10);
  }
  const numericMatch = text.match(/(\d{1,2})\s*(?:%|percent)/);
  if (numericMatch) {
    return Number.parseInt(numericMatch[1], 10);
  }
  return null;
}

const RULES: Rule[] = [
  {
    id: "ca-deposit-return-window",
    jurisdiction: "California",
    citation: "Cal. Civ. Code §1950.5",
    title: "Security deposit return window too long",
    severity: "high",
    explanation:
      "California generally requires landlords to return a security deposit, with an itemized statement of deductions, within 21 days after the tenant moves out — not 60 or 90 days.",
    match: (docLower, docRaw) =>
      firstProximityMatch(
        docLower,
        docRaw,
        [/return\s+(?:the\s+)?(?:security\s+)?deposit/g, /(?:security\s+)?deposit[^.\n]{0,40}return/g],
        [
          /ninety\s*\(\s*90\s*\)\s*days/g,
          /(?:^|[^\d])90\s*days/g,
          /sixty\s*\(\s*60\s*\)\s*days/g,
          /(?:^|[^\d])60\s*days/g,
        ],
        PROXIMITY_CHARS,
        10
      ),
  },
  {
    id: "ca-deposit-cap",
    jurisdiction: "California",
    citation: "Cal. Civ. Code §1950.5 (AB 12)",
    title: "Security deposit exceeds one month's rent",
    severity: "high",
    explanation:
      "Under AB 12, most California landlords may not collect more than one month's rent as a security deposit on residential leases.",
    match: (docLower, docRaw) => {
      const depositMatch = docLower.match(
        /(?:security\s+)?deposit[^$\d\n]{0,80}\$?\s*([\d,]+(?:\.\d{2})?)/
      );
      const rentMatch = docLower.match(
        /(?:monthly\s+)?rent[^$\d\n]{0,80}\$?\s*([\d,]+(?:\.\d{2})?)/
      );
      if (!depositMatch || !rentMatch) {
        return null;
      }
      const deposit = parseMoney(depositMatch[1]);
      const rent = parseMoney(rentMatch[1]);
      if (deposit === null || rent === null || deposit <= rent) {
        return null;
      }
      const start = depositMatch.index ?? 0;
      const end = start + depositMatch[0].length;
      return tightenQuote(docRaw, start, end);
    },
  },
  {
    id: "ca-entry-without-notice",
    jurisdiction: "California",
    citation: "Cal. Civ. Code §1954",
    title: "Landlord entry without reasonable notice",
    severity: "high",
    explanation:
      "California requires landlords to give reasonable written notice (normally 24 hours) before entering a rental unit, except in genuine emergencies.",
    match: (docLower, docRaw) =>
      firstProximityMatch(
        docLower,
        docRaw,
        [/without\s+prior\s+notice/g, /at\s+any\s+time/g],
        [/\benter\b/g, /\bentry\b/g, /\bpremises\b/g],
        PROXIMITY_CHARS,
        15
      ),
  },
  {
    id: "ca-excessive-late-fee",
    jurisdiction: "California",
    citation: "Orozco v. Casimiro / Cal. law on liquidated damages",
    title: "Late fee may be excessive",
    severity: "medium",
    explanation:
      "California courts treat late fees as liquidated damages — they must be a reasonable estimate of the landlord's actual loss. Flat percentages of 10% or more are often challenged as unenforceable penalties.",
    match: (docLower, docRaw) => {
      for (const lateSpan of findAll(docLower, /\blate\b/g)) {
        const windowStart = Math.max(0, lateSpan.index - 30);
        const windowEnd = Math.min(docLower.length, lateSpan.end + 100);
        const windowLower = docLower.slice(windowStart, windowEnd);
        const percent = parsePercent(windowLower);
        if (percent !== null && percent >= 10) {
          return tightenQuote(docRaw, windowStart, windowEnd);
        }
      }
      return null;
    },
  },
  {
    id: "ca-junk-elastic-fee",
    jurisdiction: "California",
    citation: "Cal. Civ. Code §1671 / consumer-protection concerns",
    title: "Non-refundable fee adjustable at landlord's discretion",
    severity: "medium",
    explanation:
      "A mandatory recurring fee described as non-refundable yet adjustable at any time can function as hidden rent and may be scrutinized under California contract and consumer-protection principles.",
    match: (docLower, docRaw) => {
      for (const feeSpan of findAll(docLower, /non-?refundable/g)) {
        const windowStart = feeSpan.index;
        const windowEnd = Math.min(docLower.length, feeSpan.end + 250);
        const windowLower = docLower.slice(windowStart, windowEnd);
        const hasFee = /\bfee\b/.test(windowLower);
        const isElastic =
          /at\s+any\s+time/.test(windowLower) ||
          /adjusted[^.\n]{0,50}at\s+any\s+time/.test(windowLower);
        if (hasFee && isElastic) {
          return tightenQuote(docRaw, windowStart, windowEnd);
        }
      }
      return null;
    },
  },
];

export function applyRules(documentText: string): VerifiedFinding[] {
  const docLower = documentText.toLowerCase();
  const docRaw = documentText;
  const seen = new Set<string>();
  const findings: VerifiedFinding[] = [];

  for (const rule of RULES) {
    if (seen.has(rule.id)) {
      continue;
    }
    const sourceQuote = rule.match(docLower, docRaw);
    if (sourceQuote === null) {
      continue;
    }
    seen.add(rule.id);
    findings.push({
      id: rule.id,
      title: rule.title,
      citation: rule.citation,
      jurisdiction: rule.jurisdiction,
      severity: rule.severity,
      explanation: rule.explanation,
      source_quote: sourceQuote,
    });
  }

  return findings;
}
