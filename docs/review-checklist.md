# Governance Skill Review Checklist

This checklist covers professional judgment that should stay human-reviewed. Automated checks live in `scripts/check-consistency.mjs` and only validate deterministic consistency rules.

## Scope

- Keep this project a pure skill: templates, instructions, fixtures, and static checks only.
- Do not introduce a full document generator, merge engine, or runtime renderer without a separate design review.
- Generated planning/spec documents under `docs/superpowers/` are local working artifacts and should stay ignored.

## Rule Hierarchy

- Platform, system, developer, and tool safety instructions must not be overridden by generated project documents.
- Within project governance documents, `constitution.md` is the highest project-level policy, including the conditional mutual-exclusion red line when both Superpowers and OpenSpec are confirmed.
- `AGENTS.md` should hold project facts, capability summaries, capability policies, and workflow routing policies (it must not restate red-line bodies).
- Tool entry files should only describe tool-specific behavior and refer back to `constitution.md` and `AGENTS.md`.
- `KIMI.md` should contain Kimi-specific behavior; `.kimi-code/AGENTS.md` should only bridge to root governance files and must not duplicate project facts or Kimi capability rules.

## Dimension Quality

- Every enabled dimension must be based on scan evidence or explicit user confirmation.
- Low-confidence detection must be presented as a confirmation question, not silently converted into a hard rule.
- New dimensions must add both `constitution/dim-*.md` and `agents/dim-*.md`.
- Dimension templates must not duplicate base red lines unless they add domain-specific precision.
- Dimension H3 sections must nest under the AGENTS dimension-facts H2, not under the capabilities or workflow sections.

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

- MCP, skill, and workflow capability rules may be generated only when the capability is detected and confirmed by the user.
- Missing capabilities must not become project requirements. When only one of Superpowers/OpenSpec is confirmed, the single-party block must not name the other workflow anywhere in the rendered AGENTS; the mutual-exclusion cross-reference is emitted only under the combined condition.
- Capability rules should describe use boundaries and fallback behavior.
- Clear small tasks must not automatically enter Superpowers; `grill-me` requires task-level confirmation.
- Superpowers completeness is strict: `suite_metadata` requires an explicit `metadata_complete: true`; `using-superpowers` computes the missing set from referenced/resolved members (caller-supplied missing_members is not trusted). A lone `brainstorming` is never complete. Detected-but-unconfirmed or incomplete suites must not generate full workflow rules.
- `CapabilityProfile` entries must be objects and required fields (`kind`, `detection_basis`) must be validated; malformed entries, unknown ids, and invalid kinds fail rather than being silently skipped or coerced.
- Superpowers and OpenSpec must remain mutually exclusive; neither workflow may invoke the other, and mid-task switching between them is forbidden. The mutual-exclusion red line lives in `constitution.md` once, gated by both being confirmed.
- OpenSpec installation and initialization require explicit approval. On refusal with unchanged scope, the task can only be cancelled, deferred, or rescoped and reclassified; it must not silently fall back to Superpowers or direct.
- Workflow routing is fail-closed: unknown workflow names, unknown OpenSpec states, unconfirmed workflows, and active workflows incompatible with the current task size are rejected (never coerced to direct or allowed to bypass reclassification). New routing inputs must add fixtures for the rejected path.
- New capability aliases must be added to the SKILL capability mapping table (parsed by the shared `capability-map.mjs`; do not duplicate the token table). New workflow transitions must add both forward and reverse direction fixtures.
- The Phase 1-D degraded path must detect `semble` and prefer semantic search; Grep/Glob/Read is a fallback only. The `allowed-tools` must include the semble MCP tools.
- File strategies are parsed from SKILL.md (single source of truth); each protected file is an independent strategy target. Unknown or duplicate dimensions must fail composition rather than being silently dropped.

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
| Capability mapping | SKILL mapping table (parsed by `capability-map.mjs`) | `checkCapabilityMappings`, `checkCapabilityMappingParserContract` | Single source of truth; duplicate detection names and conflicting id/kind/token/group declarations fail; grouped capabilities declare semantics |
| Template layering | constitution/AGENTS templates | `checkTemplateLayering` | One `{{DIMENSION_SECTIONS}}`; no abandoned tokens; single-party blocks must not name the other workflow; unique mutual-exclusion red line |
| Dimension composition | AGENTS `{{DIMENSION_SECTIONS}}` + dim templates (both AGENTS and constitution) | `template-contract.mjs` (`validateDimensions`, `composeDimensionSections`) + composition fixture cases | dim H3 under dimension-facts H2; capabilities after dimensions; unknown/duplicate dimensions fail |
| Semble-first degraded path | SKILL Phase 1-D + `allowed-tools` | `checkSembleFirstContract` | Prefer semantic search in Phase 1-D; Grep/Glob/Read is fallback only |
| Workflow skill routing | SKILL + AGENTS template | `checkWorkflowSkillRoutingContract` + routing fixture cases | Route only Superpowers, `grill-me`, and OpenSpec; mutual exclusion only when both confirmed |
| Workflow transitions | SKILL + routing fixtures | `classifySkillRoute` decomposition + routing fixture cases | Fail-closed state migration; unknown workflow/state rejected; forward+reverse fixtures |
| Superpowers completeness | SKILL CapabilityProfile + fixture cases | `normalizeCapabilityProfile`, `evaluateSuperpowersCompleteness` | Strict metadata_complete; referenced/resolved diff; field validation; completeness independent from confirmation |
| File strategies | SKILL file-strategy section (parsed by `capability-map.mjs`) + tool-entry fixtures | `validateToolEntrySuite` | Single source of truth; per-file confirmation semantics; not runtime merge |
| Dimension and evidence rules | Workflow prompts + SKILL fallback scan | `eval-fixtures.mjs` | Offline eval checks deterministic evidence only, not model quality |
| Unique safety rules | constitution and dimension templates | Human review in this checklist | Keep until behavioral evaluation supports removal |

## Release Review

- `README.md`, `CHANGELOG.md`, package `files`, and install behavior should describe the same shipped capability set.
- `npm pack --dry-run` should not include local planning docs, IDE metadata, or release drafting files.
- New fixtures under `examples/` should include human-readable `expected.md` and machine-readable `expected.json` assertions.
- Kimi templates should use Kimi-native capabilities and must not present Claude-specific terms as Kimi features.
