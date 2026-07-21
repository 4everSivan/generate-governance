#!/usr/bin/env node

// In-memory template composition contract helpers. These are TEST-ONLY helpers
// used by the offline eval to validate that the governance templates compose
// correctly. They deliberately do NOT:
//   - write target-project files
//   - perform merge/overwrite/skip
//   - create backups
//   - scan real environment capabilities
//   - act as an npm CLI generation entry point
//
// They support only the two syntaxes the project templates declare:
//   - scalar placeholders  {{TOKEN}}
//   - boolean conditions    {{#condition}}...{{/condition}}

export function validateBalancedConditions(text) {
  const stack = []
  const pattern = /\{\{(#|\/)([a-z0-9_-]+)\}\}/gi
  let match
  while ((match = pattern.exec(text)) !== null) {
    const [, kind, name] = match
    if (kind === '#') {
      stack.push({ name, index: match.index })
    } else if (kind === '/') {
      if (stack.length === 0) {
        return { ok: false, error: `unmatched closing {{/${name}}} at index ${match.index}` }
      }
      const top = stack.pop()
      if (top.name !== name) {
        return { ok: false, error: `mismatched: {{#${top.name}}} closed by {{/${name}}} at index ${match.index}` }
      }
    }
  }
  if (stack.length > 0) {
    const unclosed = stack.map((entry) => `{{#${entry.name}}}`)
    return { ok: false, error: `unclosed condition(s): ${unclosed.join(', ')}` }
  }
  return { ok: true }
}

// Fixed dimension ordering for AGENTS composition.
const dimensionOrder = ['code', 'database', 'api', 'deploy', 'maintenance']

// Validate the selected dimensions: reject unknown names and duplicates. Throws
// on the first violation (fail-closed) rather than silently dropping dimensions.
export function validateDimensions(selectedDimensions) {
  const known = new Set(dimensionOrder)
  const seen = new Set()
  for (const dimension of selectedDimensions) {
    if (!known.has(dimension)) {
      throw new Error(`unknown dimension: ${dimension}`)
    }
    if (seen.has(dimension)) {
      throw new Error(`duplicate dimension: ${dimension}`)
    }
    seen.add(dimension)
  }
}

// Compose the dimension sections string by concatenating the dim templates for
// the selected dimensions, in fixed order. Pure: reads templates from disk.
// Throws on unknown or duplicate dimensions (fail-closed).
export function composeDimensionSections(selectedDimensions, readDim) {
  validateDimensions(selectedDimensions)
  const sections = []
  for (const dimension of dimensionOrder) {
    if (!selectedDimensions.includes(dimension)) continue
    sections.push(readDim(dimension).trimEnd())
  }
  return sections.join('\n\n')
}

// Render a template against scalar values and boolean conditions. Fails (throws)
// on unknown scalar token, unbalanced condition, or missing scalar value.
// Boolean conditions default to false when not provided (an absent condition
// means "not satisfied"); scalars never get a default and must be provided.
export function renderContractFixture(template, conditions = {}, scalarValues = {}) {
  let result = template

  // First, resolve boolean condition blocks from the inside out (no nesting
  // in current templates, but handle one level of nesting safely).
  // Process closed blocks; repeat until stable.
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const before = result
    result = result.replace(
      /\{\{#([a-z0-9_-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi,
      (_whole, name, body) => {
        // Conditions default to false (absent == not satisfied).
        return conditions[name] ? body : ''
      }
    )
    if (result === before) break
  }

  // Validate no leftover condition tags.
  const leftover = result.match(/\{\{[#/][a-z0-9_-]+\}\}/i)
  if (leftover) {
    throw new Error(`unbalanced condition tag remains: ${leftover[0]}`)
  }

  // Resolve scalar placeholders.
  result = result.replace(/\{\{([a-z0-9_-]+)\}\}/gi, (_whole, name) => {
    if (!(name in scalarValues)) {
      throw new Error(`unknown scalar token: {{${name}}}`)
    }
    return String(scalarValues[name])
  })

  // Final check: no unresolved tokens remain.
  const unresolved = result.match(/\{\{[^}]+\}\}/)
  if (unresolved) {
    throw new Error(`unresolved token remains: ${unresolved[0]}`)
  }

  return result
}

// Extract the heading hierarchy as an array of { level, title, line }.
export function extractHeadingHierarchy(text) {
  const hierarchy = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    if (match) {
      hierarchy.push({ level: match[1].length, title: match[2].trim(), line: index + 1 })
    }
  })
  return hierarchy
}
