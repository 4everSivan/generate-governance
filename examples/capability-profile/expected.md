# Capability Profile Expectations

This fixture protects the `CapabilityProfile` normalization contract. It is fail-closed: detected/confirmed are independent, Superpowers requires an explicitly complete suite, unknown ids and missing required fields fail rather than being silently ignored.

| Scenario | Expected behavior |
|---|---|
| Suite metadata explicitly declares `metadata_complete: true` | `complete = true`, usable when confirmed |
| Suite metadata present but no explicit `metadata_complete` | `complete = false` (metadata alone is insufficient) |
| `using-superpowers` members all resolvable | `complete = true` |
| `using-superpowers` without explicit `resolved_members` | `complete = false`; all referenced members count as missing (unverified is not resolvable) |
| `using-superpowers` with an unresolvable referenced member | `complete = false`, `missing_members` computed as the referenced/resolved difference |
| Caller-supplied `missing_members` is ignored | Completeness derived from referenced/resolved, not trusted input |
| Only `brainstorming` | Not a complete Superpowers suite |
| Capability detected but user not confirmed | `detected = true`, `confirmed = false`, condition not usable |
| Artifact group with one member confirmed | `has_skill_artifacts` condition usable |
| Unknown detection name | Validation failure (no silent ignore) |
| Missing required `CapabilityProfile` field (`kind`/`detection_basis`) | Validation failure |
| Invalid `kind` for the capability id | Validation failure |
| Unknown Superpowers `detection_basis` | Validation failure (`invalid_detection_basis`) |
| Non-object entry in `detected` | Validation failure (`invalid_capability_profile`); never silently skip it |

Superpowers completeness is strict: `suite_metadata` requires an explicit `metadata_complete: true`; `using-superpowers` requires an explicit `resolved_members` and computes the missing set from `referenced_members` and `resolved_members`. Every profile carries the full contract fields (`id`, `kind`, `detection_basis`, `template_condition`). Suite completeness and user confirmation are two independent conditions: neither alone makes Superpowers usable.
