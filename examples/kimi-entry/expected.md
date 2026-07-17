# Kimi Entry Detection Expectations

## KIMI-only

- Existing entry: `KIMI.md`.
- Should recommend Kimi as the target tool.
- Should suggest creating `.kimi-code/AGENTS.md` as the native bridge.
- Must not overwrite `KIMI.md` before its file strategy is confirmed.

## native-only

- Existing entry: `.kimi-code/AGENTS.md`.
- Should recommend Kimi as the target tool.
- Should suggest creating the complete `KIMI.md` entry.
- Must not overwrite `.kimi-code/AGENTS.md` before its file strategy is confirmed.

## both

- Existing entries: `KIMI.md` and `.kimi-code/AGENTS.md`.
- Should count them as one Kimi tool, not two different tool entries.
- Should report both `user-custom` sections.
- Must ask the user to 分别确认 a `merge`, `overwrite`, or `skip` strategy for each file.
- `merge` preserves the matching file's `user-custom` block, `overwrite` creates a backup first, and `skip` leaves that file unchanged.

## Kimi + Kiro

- Existing entries: `KIMI.md` and `KIRO.md`.
- Should recommend Kiro because Kiro precedes Kimi in the detection order.
- Because two different tools are present, must still ask the user which tool entry to generate or update.

## Safety invariant

- No existing Kimi entry may be overwritten or rewritten until its own file strategy is confirmed.
