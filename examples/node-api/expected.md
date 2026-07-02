# Expected Governance Detection

## Dimensions

- Should enable: `code`, `api`
- Should not enable: `database`, `deploy`, `maintenance`

## Evidence

- API framework evidence: `express` dependency in `package.json`
- Runtime validation evidence: `zod` dependency and `src/routes/users.ts`
- Route evidence: `src/routes/users.ts`
- Contract evidence: `openapi.yaml`
- API test evidence: `tests/users.contract.test.ts`
- No database driver, ORM, migration script, Dockerfile, Kubernetes, Terraform, monitoring, or alert config.

## User Confirmation

- Ask the user to confirm the `api` dimension before generating API governance rules.
- Present API evidence and confidence rather than silently enabling hard rules.
- If auth entrypoints are not detected, mark authentication as unknown or a risk; do not infer that the API is internal.

## Expected Rules

- `constitution.md` should include API safety and contract compatibility red lines.
- `AGENTS.md` should list API frameworks, route paths, contract files, API tests, and confidence.
- Generated documents should not invent database migrations or deployment procedures.
- API responses, breaking changes, idempotency, and contract drift should be covered by the API dimension.
