# Decision-Gate Expectations

This fixture models the approved confirmation boundary only. It performs no project scan, history lookup, merge, overwrite, or file write.

| Scenario | Expected behavior |
|---|---|
| Fresh high-confidence files | The normal single confirmation is sufficient; no preview or `Apply` gate |
| Protected merge/overwrite without a semantic map | Block writing and ask the existing-file group |
| Protected merge/overwrite with a map | Require preview and explicit `Apply`; a preview alone cannot write |
| Weak-evidence enablement | Ask for explicit evidence/policy confirmation, then still require `Apply` |
| More than three unresolved groups | Present only the three highest-priority groups; all remaining groups still block writes |
| History unavailable | Record `unavailable` only; do not infer a safe history or trigger a default history scan |

The fixture retains no decision log. `history_status` is informational state (`not-checked`, `unavailable`, or `checked`), not evidence that a write is safe.
