# Template Composition Expectations

This fixture protects the in-memory composition contract. It renders BOTH the AGENTS and the constitution templates against the selected dimensions and conditions, and asserts: no leftover tokens, balanced condition blocks, dimension H3 sections nested under the AGENTS dimension-facts H2, capabilities H2 after dimensions, the mutual-exclusion red line appearing exactly once in the constitution only when both Superpowers and OpenSpec are confirmed, and single-party blocks never naming the other workflow.

| Scenario | Expected behavior |
|---|---|
| No optional capabilities | Minimal output; no condition blocks; no mutual-exclusion red line |
| Only Superpowers confirmed | AGENTS workflow policy present; no OpenSpec references anywhere; no mutual-exclusion red line |
| Only OpenSpec confirmed | AGENTS workflow policy present; no Superpowers references anywhere; no mutual-exclusion red line |
| Both Superpowers and OpenSpec confirmed | Constitution has exactly one mutual-exclusion red line; AGENTS has exactly one cross-reference |
| code + database + api + deploy dimensions | Both AGENTS and constitution render with all dim sections; dim H3 under dimension-facts H2 |
| Validation gaps confirmed | AGENTS renders the bounded fact-review table; constitution remains unchanged |
| Unknown dimension | Composition fails (no silent drop) |
| Duplicate dimension | Composition fails (no silent dedup) |

Single-confirmation must never name the other workflow anywhere in the rendered AGENTS. AGENTS must reference the mutual-exclusion red line at most once, inside the combined condition block. Constitution and AGENTS dimension sections are composed together from the same selected dimensions.

Validation gaps are final factual boundaries only. They are conditional in AGENTS and must not be emitted into constitution or tool-entry templates.
