# Expected Governance Detection

## Dimensions

- Should enable: `code`
- Should not enable: `api`, `database`, `deploy`, `maintenance`

## Evidence

- JavaScript/Node.js project evidence: `package.json`, `src/cli.js`
- CLI entry evidence: `package.json` `bin`
- No route, controller, handler, OpenAPI, GraphQL, protobuf, or API test files.
- No database driver or migration script.
- No Dockerfile, Kubernetes, Terraform, CI deploy workflow, monitoring, or alert config.

## User Confirmation

- Confirm language/framework summary.
- Do not ask the user to confirm API governance unless they explicitly add API context.
- Do not generate MCP/skill capability rules unless the capability is detected and user-confirmed.

## Expected Rules

- `constitution.md` should include base rules and code quality rules.
- `AGENTS.md` should include project facts and code facts.
- Generated documents should not invent service topology, API contracts, database migration commands, or deployment procedures.
