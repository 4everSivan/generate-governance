# Skill Routing Expectations

This fixture protects the scenario routing contract for three workflow capabilities only: Superpowers, `grill-me`, and OpenSpec.

| Scenario | Expected behavior |
|---|---|
| Clear small change or trivial bug | Execute directly |
| Ambiguous small change | Confirm before starting `grill-me` |
| Diagnostic bug or medium change | Start Superpowers |
| Major refactor, greenfield build, new module, or public contract change | Start OpenSpec |
| Missing OpenSpec installation or initialization | Request approval; do not mutate or fall back silently |
| `grill-me` reveals medium scope | End grilling and confirm the workflow switch |
| Superpowers and OpenSpec requested together | Reject the conflict; never cross-use the workflows |

An explicit request for one workflow counts as confirmation for that workflow. It never permits Superpowers and OpenSpec to run together.
