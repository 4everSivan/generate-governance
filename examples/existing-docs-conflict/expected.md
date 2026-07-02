# Expected Governance Detection

## Dimensions

- Should enable: `code`
- Should not enable: `api`, `database`, `deploy`, `maintenance`

## Existing Document Handling

- Should detect existing `constitution.md`, `AGENTS.md`, and `CLAUDE.md`.
- Should report that each existing file contains a `user-custom` section.
- Should ask the user to choose merge, overwrite, or skip.
- Should not overwrite any existing governance or tool-entry file without confirmation.
- Should recommend the existing `CLAUDE.md` entry as the detected tool target, while still allowing user override.

## Expected Rules

- Merge mode should preserve `<!-- user-custom -->...<!-- /user-custom -->` blocks.
- Skip mode should leave existing files unchanged.
- Overwrite mode should require backup behavior.
- Generated documents should not infer API, database, deploy, or maintenance dimensions from existing governance docs alone.
