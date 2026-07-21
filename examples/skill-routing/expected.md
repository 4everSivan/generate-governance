# Skill Routing Expectations

This fixture protects the scenario routing contract for three workflow capabilities only: Superpowers, `grill-me`, and OpenSpec.

| Scenario | Expected behavior |
|---|---|
| Clear small change or trivial bug | Execute directly |
| Ambiguous small change | Confirm before starting `grill-me` |
| Diagnostic bug or medium change | Start Superpowers (requires confirmed, complete suite) |
| Major refactor, greenfield build, new module, or public contract change | Start OpenSpec (requires confirmed OpenSpec) |
| OpenSpec not-installed / not-initialized | Request installation or initialization; do not fall back silently |
| OpenSpec declined by user, scope unchanged | Cancel or rescope; do not keep large scope on Superpowers or direct |
| User rescopes large -> medium | Reclassify and confirm the workflow switch |
| `grill-me` reveals medium or large scope | End grilling and confirm the workflow switch |
| `grill-me` reveals small clear scope | Execute directly (no second confirmation) |
| Superpowers/direct requested or still active for a large task | Reject as a size/workflow mismatch; active state cannot bypass reclassification |
| Active workflow switches to the other (Superpowers <-> OpenSpec) | Reject the cross-workflow transition |
| Superpowers incomplete or not confirmed | Report unavailable; do not silently fall back |
| Superpowers and OpenSpec requested together | Reject the conflict; never cross-use the workflows |
| Unknown requested or active workflow | Reject; never silently degrade to direct |

Workflow capability state is explicit: Superpowers needs both `confirmed` and `complete`; OpenSpec needs `confirmed` plus a ready/not-installed/not-initialized/declined state. An explicit request for one workflow does NOT count as confirmation for that workflow — the corresponding `capabilities.*.confirmed` (and, for Superpowers, `complete`) must still hold. It never permits Superpowers and OpenSpec to run together.
