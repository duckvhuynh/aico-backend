const body = process.env.PR_BODY ?? '';

const checks = [
  {
    name: 'a parent AI Company OS issue reference',
    pattern: /\bduckvhuynh\/aicompanyos#[1-9]\d*\b/i,
  },
  {
    name: 'the Product and architecture references section',
    pattern:
      /##\s+Product and architecture references\b[\s\S]*?(?:MVP_SCOPE|PRD[-\s:]|SRS[-\s:]|AICO-\d{3}|ADR|architecture|contract)/i,
  },
  {
    name: 'the Acceptance evidence section',
    pattern: /##\s+Acceptance evidence\b[\s\S]*?\[[xX]\]/i,
  },
  {
    name: 'a completed MVP scope check',
    pattern:
      /##\s+MVP scope check\b[\s\S]*?\[[xX]\]\s+This change is inside the cited parent issue/i,
  },
];

const missing = checks.filter(({ pattern }) => !pattern.test(body));

if (missing.length > 0) {
  for (const check of missing) {
    console.error(
      `::error title=Missing delivery traceability::Pull request body must include ${check.name}.`,
    );
  }
  console.error('Follow .github/pull_request_template.md and CONTRIBUTING.md.');
  process.exit(1);
}

const parentIssues = [...body.matchAll(/\bduckvhuynh\/aicompanyos#([1-9]\d*)\b/gi)].map((match) =>
  Number(match[1]),
);

console.log(
  `Delivery governance passed; parent issue references: ${[...new Set(parentIssues)].join(', ')}.`,
);
