import type { ReactNode } from "react";

export interface DocumentHighlight {
  id: string;
  quote: string;
  severity: "high" | "medium";
}

interface TextRange {
  start: number;
  end: number;
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findQuoteRange(
  documentText: string,
  quote: string
): TextRange | null {
  const normalizedQuote = normalizeForMatch(quote);
  if (!normalizedQuote) {
    return null;
  }

  for (let start = 0; start < documentText.length; start++) {
    let docIdx = start;
    let quoteIdx = 0;

    while (quoteIdx < normalizedQuote.length && docIdx < documentText.length) {
      const docChar = documentText[docIdx] ?? "";

      if (/\s/.test(docChar)) {
        if (normalizedQuote[quoteIdx] === " ") {
          while (
            quoteIdx < normalizedQuote.length &&
            normalizedQuote[quoteIdx] === " "
          ) {
            quoteIdx++;
          }
        }
        while (docIdx < documentText.length && /\s/.test(documentText[docIdx] ?? "")) {
          docIdx++;
        }
        continue;
      }

      if (docChar.toLowerCase() !== normalizedQuote[quoteIdx]) {
        break;
      }

      quoteIdx++;
      docIdx++;
    }

    if (quoteIdx === normalizedQuote.length) {
      return { start, end: docIdx };
    }
  }

  return null;
}

const MARK_CLASSES: Record<DocumentHighlight["severity"], string> = {
  high: "border-b-2 border-stamp bg-[rgba(193,15,43,0.10)] cursor-pointer transition-all duration-200",
  medium: "border-b-2 border-medium bg-[rgba(196,127,10,0.10)] cursor-pointer transition-all duration-200",
};

function resolveClaimedMatches(
  documentText: string,
  highlights: DocumentHighlight[]
): { start: number; end: number; highlight: DocumentHighlight }[] {
  const candidates: { start: number; end: number; highlight: DocumentHighlight }[] =
    [];

  for (const highlight of highlights) {
    const range = findQuoteRange(documentText, highlight.quote);
    if (range !== null) {
      candidates.push({ ...range, highlight });
    }
  }

  candidates.sort((a, b) => a.start - b.start);

  const claimed: { start: number; end: number; highlight: DocumentHighlight }[] =
    [];
  for (const candidate of candidates) {
    if (claimed.some((existing) => rangesOverlap(existing, candidate))) {
      continue;
    }
    claimed.push(candidate);
  }

  return claimed;
}

export function highlightDocument(
  documentText: string,
  highlights: DocumentHighlight[]
): ReactNode[] {
  const claimed = resolveClaimedMatches(documentText, highlights);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of claimed) {
    if (match.start < cursor) {
      continue;
    }
    if (match.start > cursor) {
      nodes.push(documentText.slice(cursor, match.start));
    }
    nodes.push(
      <mark
        key={`${match.highlight.id}-${match.start}`}
        data-finding-id={match.highlight.id}
        data-severity={match.highlight.severity}
        className={MARK_CLASSES[match.highlight.severity]}
      >
        {documentText.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  }

  if (cursor < documentText.length) {
    nodes.push(documentText.slice(cursor));
  }

  return nodes;
}

export interface HighlightPlan {
  highlights: DocumentHighlight[];
  highlightedIds: Set<string>;
  railRedFlags: {
    flag: { clause: string; why: string; source_quote: string; verified: boolean };
    index: number;
  }[];
}

export function buildHighlightPlan(
  documentText: string,
  verifiedFindings: {
    id: string;
    source_quote: string;
    severity: "high" | "medium";
  }[],
  redFlags: { clause: string; why: string; source_quote: string; verified: boolean }[]
): HighlightPlan {
  const highlights: DocumentHighlight[] = [];
  const verifiedRanges: TextRange[] = [];

  for (const finding of verifiedFindings) {
    if (!finding.source_quote.trim()) {
      continue;
    }
    highlights.push({
      id: finding.id,
      quote: finding.source_quote,
      severity: finding.severity,
    });
    const range = findQuoteRange(documentText, finding.source_quote);
    if (range !== null) {
      verifiedRanges.push(range);
    }
  }

  const railRedFlags: HighlightPlan["railRedFlags"] = [];

  redFlags.forEach((flag, index) => {
    if (!flag.source_quote.trim()) {
      railRedFlags.push({ flag, index });
      return;
    }
    const flagRange = findQuoteRange(documentText, flag.source_quote);
    const duplicatesVerified =
      flagRange !== null &&
      verifiedRanges.some((verifiedRange) => rangesOverlap(verifiedRange, flagRange));
    if (duplicatesVerified) {
      return;
    }
    railRedFlags.push({ flag, index });
    highlights.push({
      id: `red-flag-${index}`,
      quote: flag.source_quote,
      severity: "high",
    });
  });

  const claimed = resolveClaimedMatches(documentText, highlights);
  const highlightedIds = new Set(claimed.map((match) => match.highlight.id));

  return { highlights, highlightedIds, railRedFlags };
}
