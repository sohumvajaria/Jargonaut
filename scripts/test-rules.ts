import { SAMPLE_DOCUMENT } from "../app/sample";
import { applyRules } from "../app/rules";

const findings = applyRules(SAMPLE_DOCUMENT);

console.log(`Found ${findings.length} verified finding(s)\n`);

for (const finding of findings) {
  const isVerbatim = SAMPLE_DOCUMENT.includes(finding.source_quote);
  console.log(`id: ${finding.id}`);
  console.log(`citation: ${finding.citation}`);
  console.log(`source_quote: ${JSON.stringify(finding.source_quote)}`);
  console.log(`verbatim match: ${isVerbatim ? "YES" : "NO"}`);
  console.log("");
}
