# Governance Skill Review Checklist

This checklist covers professional judgment that should stay human-reviewed. Automated checks live in `scripts/check-consistency.mjs` and only validate deterministic consistency rules.

## Scope

- Keep this project a pure skill: templates, instructions, fixtures, and static checks only.
- Do not introduce a full document generator, merge engine, or runtime renderer without a separate design review.
- Generated planning/spec documents under `docs/superpowers/` are local working artifacts and should stay ignored.

## Rule Hierarchy

- Platform, system, developer, and tool safety instructions must not be overridden by generated project documents.
- Within project governance documents, `constitution.md` is the highest project-level policy.
- `AGENTS.md` should hold project facts, scripts, topology, and confirmed environment capabilities.
- Tool entry files should only describe tool-specific behavior and refer back to `constitution.md` and `AGENTS.md`.
- `KIMI.md` should contain Kimi-specific behavior; `.kimi-code/AGENTS.md` should only bridge to root governance files and must not duplicate project facts or Kimi capability rules.

## Dimension Quality

- Every enabled dimension must be based on scan evidence or explicit user confirmation.
- Low-confidence detection must be presented as a confirmation question, not silently converted into a hard rule.
- New dimensions must add both `constitution/dim-*.md` and `agents/dim-*.md`.
- Dimension templates must not duplicate base red lines unless they add domain-specific precision.

## API Governance

- Do not infer "internal API" only from missing auth entrypoints; missing auth evidence is an uncertainty or risk.
- Public API changes should preserve authentication, authorization, response privacy, and contract compatibility.
- Contract drift should be resolved by explicit user confirmation, not by assuming implementation or schema always wins.
- API tests should not be invented. If absent, mark them as a validation gap.

## Existing Documents

- Existing `constitution.md`, `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `KIRO.md`, `KIMI.md`, or `.kimi-code/AGENTS.md` must trigger a merge/overwrite/skip decision.
- Multiple existing tool entries must trigger a target tool confirmation.
- `KIMI.md` and `.kimi-code/AGENTS.md` together count as one Kimi tool, but their file strategies must be confirmed separately.
- Merge mode may preserve `<!-- user-custom -->...<!-- /user-custom -->` sections, but should not silently drop user text outside those sections without warning.

## Environment Capabilities

- MCP and skill rules may be generated only when the capability is detected and confirmed by the user.
- Missing capabilities must not become project requirements.
- Capability rules should describe use boundaries and fallback behavior.

## Language Standards

- Language-specific templates should complement existing formatter, linter, and architecture conventions.
- Do not let generic language guidance override stronger project-local standards.
- Keep language standards concise enough to be useful in generated documents.

## Rule Traceability

| Rule group | Source of truth | Offline guard | Simplification boundary |
|------------|-----------------|---------------|-------------------------|
| Instruction hierarchy | constitution/AGENTS templates | `checkInstructionHierarchy` | Never place project files above platform or system instructions |
| ProjectProfile and template fields | `workflow-analyze.js` + SKILL source table | `checkTemplateTokenSources`, `checkProfileTokenSources` | Move schemas to machine checks; do not invent missing facts |
| Consolidated confirmation | SKILL Phase 2 | `checkConsolidatedConfirmationContract` + fixture governance expectations | Remove repeated prompts, not existing-file or ambiguity gates |
| Kimi dual entry | SKILL + Kimi templates | `checkKimiSkillContract`, Kimi fixture cases | Share tool detection; preserve per-file strategies and failure reporting |
| Shared capabilities | AGENTS template | `checkToolEntryTemplates` | Keep one shared source; tool entries only reference it |
| Dimension and evidence rules | Workflow prompts + SKILL fallback scan | `eval-fixtures.mjs` | Offline eval checks deterministic evidence only, not model quality |
| Unique safety rules | constitution and dimension templates | Human review in this checklist | Keep until behavioral evaluation supports removal |

## Release Review

- `README.md`, `CHANGELOG.md`, package `files`, and install behavior should describe the same shipped capability set.
- `npm pack --dry-run` should not include local planning docs, IDE metadata, or release drafting files.
- New fixtures under `examples/` should include human-readable `expected.md` and machine-readable `expected.json` assertions.
- Kimi templates should use Kimi-native capabilities and must not present Claude-specific terms as Kimi features.
