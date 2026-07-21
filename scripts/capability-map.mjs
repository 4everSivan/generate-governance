#!/usr/bin/env node

import fs from 'node:fs'

// Shared capability-mapping parser. Both the consistency checker and the
// fixture evaluator consume this so the mapping table has a single source of
// truth in SKILL.md (no duplicated token table that can drift).

// Recognized CapabilityProfile kinds (declared in SKILL.md "能力规范化映射").
export const capabilityKinds = ['mcp', 'skill', 'skill-suite', 'workflow']

// Parse the SKILL.md capability mapping table. Returns a structured result with
// duplicate-detection: raw rows are collected first, conflicts are surfaced,
// and only then is the Map built (so a later row cannot silently overwrite an
// earlier one). Each row carries the canonical id, kind, token, and optional
// aggregate group, so the runtime capability meta is generated from the table
// instead of being hardcoded here.
//
// Returns:
//   { rows: [{detectionName, id, kind, token, group}], duplicateDetections, duplicateIds, derivedTokens, aggregateBuckets }
// where `duplicateDetections` lists every repeated detection name and
// `duplicateIds` lists canonical ids declared with conflicting token/kind/group.
export function parseCapabilityMappings(skillMd) {
  const rows = []
  const aggregateBuckets = new Map()
  let currentAggregate = null

  const lines = skillMd.split(/\r?\n/)
  for (const line of lines) {
    const aggMatch = line.match(/^#\s*capability:\s*([a-z0-9_-]+)\s+\((all|any)\)/i)
    if (aggMatch) {
      currentAggregate = { id: aggMatch[1], semantics: aggMatch[2], members: [] }
      aggregateBuckets.set(currentAggregate.id, currentAggregate)
      continue
    }
    const closeMatch = line.match(/^#\s*\/capability\b/i)
    if (closeMatch) {
      currentAggregate = null
      continue
    }
    // Row form (four cells, trailing pipe required):
    //   | <detection text> | `id` | `kind` | `token` |
    const rowMatch = line.match(/^\|\s*`?([^|`]+?)`?\s*\|\s*`([a-z0-9_-]+)`\s*\|\s*`([a-z]+(?:-[a-z]+)*)`\s*\|\s*`(has_[a-z0-9_-]+)`\s*\|\s*$/i)
    if (rowMatch) {
      const detectionName = rowMatch[1].trim()
      const id = rowMatch[2].trim()
      const kind = rowMatch[3].trim()
      const token = rowMatch[4].trim()
      rows.push({ detectionName, id, kind, token, group: currentAggregate?.id ?? null })
      if (currentAggregate) currentAggregate.members.push(detectionName)
    }
  }

  // Derived conditions: tokens of form has_* declared in the derived-conditions
  // table (first column is the bare token name; second column references
  // dependencies joined by 与).
  const derivedTokens = new Set()
  for (const match of skillMd.matchAll(/^\|\s*`?(has_[a-z0-9_-]+)`?\s*\|\s*`?has_[a-z0-9_-]+`?\s+与/gim)) {
    derivedTokens.add(match[1])
  }

  // A detection name is one lookup key and therefore may be declared only once.
  // Comparing only the token would miss an ambiguous declaration that reuses the
  // same token with a different canonical id, kind, or group.
  const seen = new Map()
  const duplicateDetections = []
  for (const row of rows) {
    const prev = seen.get(row.detectionName)
    if (prev !== undefined) {
      duplicateDetections.push({
        detectionName: row.detectionName,
        declarations: [prev, { id: row.id, kind: row.kind, token: row.token, group: row.group }],
      })
    } else {
      seen.set(row.detectionName, { id: row.id, kind: row.kind, token: row.token, group: row.group })
    }
  }

  // Detect duplicate canonical ids declared with conflicting token/kind/group.
  const seenIds = new Map()
  const duplicateIds = []
  for (const row of rows) {
    const prev = seenIds.get(row.id)
    if (prev !== undefined) {
      if (prev.token !== row.token || prev.kind !== row.kind || prev.group !== row.group) {
        duplicateIds.push({
          id: row.id,
          declarations: [prev, { token: row.token, kind: row.kind, group: row.group }],
        })
      }
    } else {
      seenIds.set(row.id, { token: row.token, kind: row.kind, group: row.group })
    }
  }

  return { rows, duplicateDetections, duplicateIds, derivedTokens, aggregateBuckets }
}

// Build a detection-name -> token Map from parsed rows. Callers that need to
// check "each detection maps to one token" should use duplicateDetections first.
export function buildMapping(rows) {
  const map = new Map()
  for (const row of rows) {
    map.set(row.detectionName, { id: row.id, kind: row.kind, token: row.token, group: row.group })
  }
  return map
}

// Build canonical capability metadata from parsed rows:
//   { <id>: { token, kind: [<kind>], group? } }
// `token` is the template condition token; `kind` is the set of accepted
// CapabilityProfile kinds; `group` (optional) marks a grouped capability whose
// members share one token under `any` semantics.
export function capabilityMetaFromRows(rows) {
  const meta = {}
  for (const row of rows) {
    meta[row.id] = { token: row.token, kind: [row.kind], ...(row.group ? { group: row.group } : {}) }
  }
  return meta
}

// Runtime capability meta, generated from the SKILL.md mapping table (the
// single source of truth) and cached per process.
let runtimeCache = null
function runtimeMappings() {
  if (runtimeCache === null) {
    const skillMd = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
    const { rows } = parseCapabilityMappings(skillMd)
    runtimeCache = capabilityMetaFromRows(rows)
  }
  return runtimeCache
}

export function tokenForCapability(id) {
  return runtimeMappings()[id]?.token ?? null
}

export function kindForCapability(id) {
  return runtimeMappings()[id]?.kind ?? null
}

export function groupForCapability(id) {
  return runtimeMappings()[id]?.group ?? null
}

// Parse the file-strategy contract from SKILL.md (the "文件策略语义" section).
// Returns the declared strategy names in declaration order. This is the single
// source of truth shared with the fixture evaluator so the two cannot drift.
export function parseFileStrategies(skillMd) {
  const strategies = []
  const headingIdx = skillMd.indexOf('文件策略语义:')
  if (headingIdx === -1) return strategies
  // Walk lines after the heading, collecting contiguous "- **<name>**: " entries.
  const lines = skillMd.slice(headingIdx).split(/\r?\n/)
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    const match = line.match(/^-\s+\*\*([a-z]+)\*\*:/)
    if (!match) {
      // Stop at the first non-list line (blank lines inside the list are allowed).
      if (line.trim() === '') continue
      break
    }
    strategies.push(match[1])
  }
  return strategies
}
