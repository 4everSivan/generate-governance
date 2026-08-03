#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { parseCapabilityMappings, buildMapping, capabilityKinds } from './capability-map.mjs'

const root = process.cwd()
const errors = []
const supportedToolEntries = ['claude', 'gemini', 'codex', 'kiro', 'kimi']

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function fail(message) {
  errors.push(message)
}

function walk(dir) {
  const absolute = path.join(root, dir)
  const result = []

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...walk(relative))
    } else {
      result.push(relative)
    }
  }

  return result
}

function unique(values) {
  return [...new Set(values)].sort()
}

function extractTemplateTokens(content) {
  const tokens = []
  const pattern = /\{\{([^}]+)\}\}/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    tokens.push(match[1].trim())
  }

  return tokens
}

function extractDeclaredTokens(skillMd) {
  return unique(extractTemplateTokens(skillMd).flatMap((token) => {
    if (token.includes('...')) {
      return token
        .split('...')
        .map((part) => part.trim())
        .filter(Boolean)
    }
    return [token]
  }))
}

function extractDeclaredTokenSources(skillMd) {
  const sources = new Map()
  const pattern = /^\|\s*`\{\{([^{}]+)\}\}`\s*\|\s*([^|]+?)\s*\|/gm
  let match

  while ((match = pattern.exec(skillMd)) !== null) {
    const token = match[1].trim()
    const source = match[2].trim()
    const tokenSources = sources.get(token) ?? new Set()
    tokenSources.add(source)
    sources.set(token, tokenSources)
  }

  return sources
}

function parseDimensions(workflow) {
  const match = workflow.match(/items:\s*\{\s*type:\s*'string',\s*enum:\s*\[([^\]]+)\]/m)
  if (!match) {
    fail('Could not find workflow dimensions enum')
    return []
  }

  return unique([...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
}

function checkTemplateTokens() {
  const skillMd = read('SKILL.md')
  const declared = new Set(extractDeclaredTokens(skillMd))
  const templateFiles = walk('templates').filter((file) => file.endsWith('.md'))
  const usedTokens = unique(templateFiles.flatMap((file) => extractTemplateTokens(read(file))))

  for (const token of usedTokens) {
    if (!declared.has(token)) {
      fail(`Template token {{${token}}} is not declared in SKILL.md`)
    }
  }
}

function checkTemplateTokenSources() {
  const skillMd = read('SKILL.md')
  const sources = extractDeclaredTokenSources(skillMd)
  const templateFiles = walk('templates').filter((file) => file.endsWith('.md'))
  const usedTokens = unique(templateFiles.flatMap((file) => extractTemplateTokens(read(file))))

  for (const token of usedTokens) {
    if (token.startsWith('#') || token.startsWith('/')) {
      continue
    }

    const tokenSources = sources.get(token)
    if (!tokenSources || tokenSources.size === 0) {
      fail(`Template token {{${token}}} has no declared source row in SKILL.md`)
    } else if (tokenSources.size > 1) {
      fail(`Template token {{${token}}} has multiple declared sources: ${[...tokenSources].join(', ')}`)
    }
  }
}

function checkProfileTokenSources() {
  const skillMd = read('SKILL.md')
  const workflow = read('workflow-analyze.js')
  const sources = extractDeclaredTokenSources(skillMd)
  const summarizeBlock = sliceSchemaBlock(workflow, 'SUMMARIZE_SCHEMA')
  const requiredMatch = summarizeBlock.match(/^ {2}required:\s*\[([^\]]+)\]/m)

  if (!requiredMatch) {
    fail('Could not find top-level required fields in SUMMARIZE_SCHEMA')
    return
  }

  const requiredFields = new Set([...requiredMatch[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
  for (const [token, tokenSources] of sources) {
    for (const source of tokenSources) {
      for (const match of source.matchAll(/profile\.([a-z_]+)/g)) {
        if (!requiredFields.has(match[1])) {
          fail(`Template token {{${token}}} references non-required ProjectProfile field: ${match[1]}`)
        }
      }
    }
  }
}

function checkDimensionTemplates() {
  const dimensions = parseDimensions(read('workflow-analyze.js'))

  for (const dimension of dimensions) {
    const constitution = `templates/governance/constitution/dim-${dimension}.md`
    const agents = `templates/governance/agents/dim-${dimension}.md`

    if (!exists(constitution)) {
      fail(`Missing constitution template for dimension: ${dimension}`)
    }
    if (!exists(agents)) {
      fail(`Missing agents template for dimension: ${dimension}`)
    }
  }
}

function checkToolEntryTemplates() {
  for (const tool of supportedToolEntries) {
    const template = `templates/governance/tool-entry/${tool}.md`
    if (!exists(template)) {
      fail(`Missing tool entry template: ${tool}`)
    }
  }

  const kimiTemplatePath = 'templates/governance/tool-entry/kimi.md'
  if (exists(kimiTemplatePath)) {
    const kimiTemplate = read(kimiTemplatePath)
    const requiredKimiContent = [
      'AGENTS.md',
      'explore',
      'plan',
      'coder',
    ]
    for (const content of requiredKimiContent) {
      if (!kimiTemplate.includes(content)) {
        fail(`Kimi tool entry template missing required content: ${content}`)
      }
    }
  }

  const agentsTemplate = read('templates/governance/agents/base.md')
  const sharedToken = '{{CAPABILITIES_SUMMARY}}'
  if (!agentsTemplate.includes(sharedToken)) {
    fail(`AGENTS template missing shared capability token: ${sharedToken}`)
  }
  for (const tool of supportedToolEntries) {
    const toolTemplate = read(`templates/governance/tool-entry/${tool}.md`)
    if (toolTemplate.includes(sharedToken)) {
      fail(`Tool entry ${tool} duplicates AGENTS shared token: ${sharedToken}`)
    }
  }

  const nativeTemplatePath = 'templates/governance/tool-entry/kimi-native-agents.md'
  if (!exists(nativeTemplatePath)) {
    fail('Missing Kimi native AGENTS bridge template')
    return
  }

  const nativeTemplate = read(nativeTemplatePath)
  for (const governancePath of ['../constitution.md', '../AGENTS.md', '../KIMI.md']) {
    if (!nativeTemplate.includes(governancePath)) {
      fail(`Kimi native AGENTS bridge missing governance path: ${governancePath}`)
    }
  }
}

function checkKimiSkillContract() {
  const skillMd = read('SKILL.md')
  const requiredFragments = new Map([
    ['tool argument', '--tool claude|gemini|codex|kiro|kimi'],
    ['grouped entry detection', 'Kimi 双入口算一个工具'],
    ['native template selection', 'templates/governance/tool-entry/kimi-native-agents.md'],
    ['native output path', '<target-path>/.kimi-code/AGENTS.md'],
    ['blocked native directory handling', '`.kimi-code` 是普通文件或目录不可创建'],
    ['dual-entry self-check', 'Kimi 双入口'],
  ])

  for (const [label, fragment] of requiredFragments) {
    if (!skillMd.includes(fragment)) {
      fail(`SKILL.md missing Kimi ${label}: ${fragment}`)
    }
  }
}

// Extract the enum values of the FIRST `confidence: { type: 'string', enum: [...] }`
// field that appears within `block` (a pre-sliced snippet of the workflow source).
// Slicing to the exact schema block first avoids matching an unrelated `confidence`
// field elsewhere in the file (e.g. CODE_STRUCTURE_SCHEMA.confidence).
function extractConfidenceEnum(block, label) {
  const match = block.match(/confidence:\s*\{\s*type:\s*'string',\s*enum:\s*\[([^\]]+)\]/m)
  if (!match) {
    fail(`Could not find confidence enum in ${label}`)
    return []
  }
  return unique([...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
}

// Slice the workflow source from `const NAME = {` up to the next top-level
// `const ` declaration (or end of file), returning just that schema block.
function sliceSchemaBlock(workflow, name) {
  const startMatch = workflow.match(new RegExp(`const ${name} = \\{`))
  if (!startMatch) {
    fail(`Could not find schema block: ${name}`)
    return ''
  }
  const start = startMatch.index
  const rest = workflow.slice(start + startMatch[0].length)
  const nextConst = rest.search(/\nconst \w+ = /)
  const blockEnd = nextConst === -1 ? rest.length : nextConst
  return workflow.slice(start, start + startMatch[0].length + blockEnd)
}

function checkApiConfidenceEnums() {
  const workflow = read('workflow-analyze.js')

  // API_SCHEMA.confidence — anchor inside the API_SCHEMA block only.
  const apiSchemaEnum = extractConfidenceEnum(sliceSchemaBlock(workflow, 'API_SCHEMA'), 'API_SCHEMA')

  // api_summary.confidence — anchor inside the SUMMARIZE_SCHEMA.api_summary sub-object.
  const summarizeBlock = sliceSchemaBlock(workflow, 'SUMMARIZE_SCHEMA')
  const apiSummaryMatch = summarizeBlock.match(/api_summary:\s*\{([\s\S]*?)\n\s{4}\},/m)
  if (!apiSummaryMatch) {
    fail('Could not find api_summary block inside SUMMARIZE_SCHEMA')
    return
  }
  const apiSummaryEnum = extractConfidenceEnum(apiSummaryMatch[1], 'api_summary')

  // SUMMARIZE_SCHEMA.confidence.api — the `api:` field inside the confidence object.
  // Anchor on the top-level `confidence:` (4-space indent) to avoid matching the
  // nested `api_summary.confidence` string field (8-space indent).
  const confidenceMatch = summarizeBlock.match(/\n {4}confidence:\s*\{([\s\S]*?)\n {4}\},/m)
  if (!confidenceMatch) {
    fail('Could not find confidence block inside SUMMARIZE_SCHEMA')
    return
  }
  const apiFieldMatch = confidenceMatch[1].match(/api:\s*\{\s*type:\s*'string',\s*enum:\s*\[([^\]]+)\]/m)
  if (!apiFieldMatch) {
    fail('Could not find confidence.api enum inside SUMMARIZE_SCHEMA.confidence')
    return
  }
  const confidenceApiEnum = unique([...apiFieldMatch[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))

  const serialized = [apiSchemaEnum, apiSummaryEnum, confidenceApiEnum].map((values) => values.join('|'))
  if (new Set(serialized).size !== 1) {
    fail(`API confidence enums differ: ${serialized.join(' / ')}`)
  }
}

function checkAgentCount() {
  const workflow = read('workflow-analyze.js')
  const readme = read('README.md')
  const parallelMatch = workflow.match(/await parallel\(\[\s*([\s\S]*?)\n\]\)/m)
  if (!parallelMatch) {
    fail('Could not find workflow parallel Analyze block')
    return
  }

  const analyzeCalls = [...parallelMatch[1].matchAll(/agent\([^)]*\{\s*label:/g)].length
  const readmeMatch = readme.match(/启动\s*(\d+)\s*个并行 Agent/)

  if (!readmeMatch) {
    fail('README does not declare the parallel Agent count')
    return
  }

  const readmeCount = Number(readmeMatch[1])
  if (analyzeCalls !== readmeCount) {
    fail(`README Agent count (${readmeCount}) does not match workflow agent calls (${analyzeCalls})`)
  }
}

function checkGitignore() {
  const gitignore = read('.gitignore')
  const required = ['RELEASE.md', '.idea/', 'docs/superpowers/']

  for (const entry of required) {
    if (!gitignore.split(/\r?\n/).includes(entry)) {
      fail(`.gitignore missing required local artifact entry: ${entry}`)
    }
  }
}

function checkPackageFiles() {
  const pkg = JSON.parse(read('package.json'))
  const files = new Set(pkg.files ?? [])
  const required = ['bin', 'scripts', 'SKILL.md', 'workflow-analyze.js', 'templates', 'README.md', 'CHANGELOG.md', 'LICENSE']

  for (const item of required) {
    if (!files.has(item)) {
      fail(`package.json files missing required asset: ${item}`)
    }
  }

  if (!pkg.scripts?.check) {
    fail('package.json missing scripts.check')
  }
  if (!pkg.scripts?.eval) {
    fail('package.json missing scripts.eval')
  }
  if (!pkg.scripts?.test?.includes('npm run check') || !pkg.scripts.test.includes('npm run eval')) {
    fail('package.json test script must run check and eval')
  }
  if (!exists('scripts/eval-fixtures.mjs')) {
    fail('Missing offline fixture evaluator: scripts/eval-fixtures.mjs')
  }
}

function checkExamples() {
  const examplesDir = path.join(root, 'examples')
  if (!fs.existsSync(examplesDir)) {
    fail('Missing examples directory')
    return
  }

  const examples = fs.readdirSync(examplesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  for (const example of examples) {
    const expected = path.join('examples', example.name, 'expected.md')
    if (!exists(expected)) {
      fail(`Example missing expected.md: ${example.name}`)
    }
    const expectedJson = path.join('examples', example.name, 'expected.json')
    if (!exists(expectedJson)) {
      fail(`Example missing expected.json: ${example.name}`)
    }
  }
}

function checkKimiExamples() {
  const requiredFiles = [
    'examples/kimi-entry/expected.md',
    'examples/kimi-entry/cases/kimi-md-only/KIMI.md',
    'examples/kimi-entry/cases/native-only/.kimi-code/AGENTS.md',
    'examples/kimi-entry/cases/both/KIMI.md',
    'examples/kimi-entry/cases/both/.kimi-code/AGENTS.md',
    'examples/kimi-entry/cases/kimi-and-kiro/KIMI.md',
    'examples/kimi-entry/cases/kimi-and-kiro/KIRO.md',
  ]

  for (const file of requiredFiles) {
    if (!exists(file)) {
      fail(`Missing Kimi entry fixture file: ${file}`)
    }
  }

  const expectedPath = 'examples/kimi-entry/expected.md'
  if (!exists(expectedPath)) {
    return
  }

  const expected = read(expectedPath)
  for (const scenario of ['KIMI-only', 'native-only', 'both', 'Kimi + Kiro']) {
    if (!expected.includes(scenario)) {
      fail(`Kimi entry fixture missing scenario: ${scenario}`)
    }
  }
  for (const strategy of ['merge', 'overwrite', 'skip']) {
    if (!expected.includes(strategy)) {
      fail(`Kimi entry fixture missing file strategy: ${strategy}`)
    }
  }
  if (!expected.includes('分别确认')) {
    fail('Kimi entry fixture must require per-file strategy confirmation')
  }
}

function checkKimiDocumentationContract() {
  const readme = read('README.md')
  for (const fragment of ['KIMI.md', '.kimi-code/AGENTS.md', '--tool kimi']) {
    if (!readme.includes(fragment)) {
      fail(`README missing Kimi documentation: ${fragment}`)
    }
  }

  const reviewChecklist = read('docs/review-checklist.md')
  for (const protectedFile of ['KIMI.md', '.kimi-code/AGENTS.md']) {
    if (!reviewChecklist.includes(protectedFile)) {
      fail(`Review checklist missing Kimi protected file: ${protectedFile}`)
    }
  }

  const pkg = JSON.parse(read('package.json'))
  const keywords = new Set(pkg.keywords ?? [])
  for (const keyword of ['kimi', 'kimi-code']) {
    if (!keywords.has(keyword)) {
      fail(`package.json keywords missing Kimi keyword: ${keyword}`)
    }
  }

  const changelog = read('CHANGELOG.md')
  if (!changelog.includes('Kimi Code CLI')) {
    fail('CHANGELOG missing Kimi Code CLI entry')
  }
}

function checkReadmeVersion() {
  const readme = read('README.md')
  const pkg = JSON.parse(read('package.json'))
  const expected = `当前 npm 包版本为 \`${pkg.version}\``

  if (!readme.includes(expected)) {
    fail(`README package version does not match package.json: ${pkg.version}`)
  }
}

function checkInstructionHierarchy() {
  const constitution = read('templates/governance/constitution/base.md')
  const agents = read('templates/governance/agents/base.md')
  const checklist = read('docs/review-checklist.md')
  const requiredConstitutionText = '平台, 系统, 开发者和工具强制安全指令始终优先'
  const requiredAgentsText = '平台/System/Developer/工具强制安全指令 > `constitution.md`'

  if (!constitution.includes(requiredConstitutionText)) {
    fail(`Constitution must preserve platform/system authority: ${requiredConstitutionText}`)
  }
  if (!agents.includes(requiredAgentsText)) {
    fail(`AGENTS hierarchy must preserve platform/system authority: ${requiredAgentsText}`)
  }
  if (!checklist.includes('Platform, system, developer, and tool safety instructions must not be overridden')) {
    fail('Review checklist must preserve platform/system authority')
  }

  const combined = `${constitution}\n${agents}`
  for (const forbidden of ['constitution.md` > 工具系统指令', '`constitution.md` 红线高于工具系统指令']) {
    if (combined.includes(forbidden)) {
      fail(`Unsafe instruction hierarchy found: ${forbidden}`)
    }
  }
}

function checkConsolidatedConfirmationContract() {
  const skillMd = read('SKILL.md')
  const readme = read('README.md')
  const requiredFragments = [
    '## Phase 2: 建议设置确认',
    '`proposed_settings`',
    '`file_strategies`',
    '`confirmed_dimensions`',
    '`confirmed_capabilities`',
    '`user_redlines`',
    '按建议生成',
    '只有以下情况允许追加提问',
  ]

  for (const fragment of requiredFragments) {
    if (!skillMd.includes(fragment)) {
      fail(`SKILL.md missing consolidated confirmation contract: ${fragment}`)
    }
  }
  for (const obsolete of ['## Phase 3: 第二轮交互', '## Phase 4: 第三轮交互']) {
    if (skillMd.includes(obsolete)) {
      fail(`SKILL.md still contains obsolete confirmation phase: ${obsolete}`)
    }
  }
  if (!readme.includes('建议设置确认 (文件+维度+能力+红线)')) {
    fail('README missing consolidated confirmation workflow')
  }
}

function checkDecisionGateContract() {
  const skillMd = read('SKILL.md')
  const agents = read('templates/governance/agents/base.md')
  const checklist = read('docs/review-checklist.md')
  const templateFiles = walk('templates').filter((file) => file.endsWith('.md'))

  for (const fragment of [
    '### Phase 2.1: 审查上下文与受限决策门控',
    '### Phase 2.5: 高风险预览与 Apply',
    '`semantic_map`',
    '`history_status`',
    '`validation_gaps`',
    '最多呈现三组',
    '不新增扫描 agent',
    '新建且高置信度的文件保持原有的一次确认',
    '当前轮明确选择 `Apply`',
    '不创建持久化决策日志',
  ]) {
    if (!skillMd.includes(fragment)) {
      fail(`SKILL.md missing decision-gate safeguard: ${fragment}`)
    }
  }

  const validationBlock = agents.match(/\{\{#has_validation_gaps\}\}([\s\S]*?)\{\{\/has_validation_gaps\}\}/)
  if (!validationBlock) {
    fail('AGENTS must conditionally render the validation-gap fact boundary')
  } else {
    for (const fragment of [
      '## 11. 事实置信度与验证边界',
      '{{VALIDATION_GAPS_TABLE}}',
      '不得据此补造项目事实',
    ]) {
      if (!validationBlock[1].includes(fragment)) {
        fail(`AGENTS validation-gap block missing required content: ${fragment}`)
      }
    }
    for (const forbidden of ['history_status', 'semantic_map', 'Apply', 'review_context']) {
      if (validationBlock[1].includes(forbidden)) {
        fail(`AGENTS validation-gap block must not persist temporary gate state: ${forbidden}`)
      }
    }
  }

  const validationConsumers = templateFiles.filter((file) => {
    const content = read(file)
    return content.includes('{{#has_validation_gaps}}') || content.includes('{{VALIDATION_GAPS_TABLE}}')
  })
  const allowedConsumer = 'templates/governance/agents/base.md'
  if (validationConsumers.length !== 1 || validationConsumers[0] !== allowedConsumer) {
    fail(`Validation-gap tokens must be consumed only by ${allowedConsumer}; found ${validationConsumers.join(', ') || 'none'}`)
  }

  for (const fragment of [
    '## Decision Gates',
    'Git history is not a default scan',
    '`validation_gaps` may contain only final, still-unverified project facts',
    'checkDecisionGateContract',
  ]) {
    if (!checklist.includes(fragment)) {
      fail(`Review checklist missing decision-gate guard: ${fragment}`)
    }
  }
}

// Collect every {{#has_mcp_*}} / {{#has_skill_*}} / {{#has_workflow_*}} capability
// condition token actually used in templates. Dimension inline tokens (has_db,
// has_api, has_deploy, has_maintenance) are NOT capability tokens.
function extractCapabilityConditionTokens(templateFiles) {
  const tokens = new Set()
  for (const file of templateFiles) {
    const content = read(file)
    for (const match of content.matchAll(/\{\{#(has_(?:mcp|skill|workflow)_[a-z0-9_-]+)\}\}/gi)) {
      tokens.add(match[1])
    }
  }
  return tokens
}

function checkCapabilityMappings() {
  const skillMd = read('SKILL.md')
  const { rows, duplicateDetections, duplicateIds, derivedTokens, aggregateBuckets } = parseCapabilityMappings(skillMd)
  const mappings = buildMapping(rows)
  const templateFiles = walk('templates').filter((file) => file.endsWith('.md'))
  const usedTokens = extractCapabilityConditionTokens(templateFiles)

  if (rows.length === 0) {
    fail('Capability mapping table is missing from SKILL.md Phase 2')
    return
  }

  // Surface duplicate detection-name declarations (a later row used to silently
  // overwrite an earlier one). This is checked from raw rows, not the Map.
  for (const dup of duplicateDetections) {
    const rendered = dup.declarations
      .map((decl) => `${decl.id}/${decl.kind}/${decl.token}/${decl.group ?? '-'}`)
      .join(', ')
    fail(`Capability detection name ${dup.detectionName} is declared more than once: ${rendered}`)
  }

  // Surface canonical ids declared with conflicting token/kind/group, and kinds
  // outside the CapabilityProfile contract (mcp|skill|skill-suite|workflow).
  for (const dup of duplicateIds) {
    const rendered = dup.declarations
      .map((decl) => `${decl.kind}/${decl.token}/${decl.group ?? '-'}`)
      .join(', ')
    fail(`Capability id ${dup.id} is declared with conflicting kind/token/group: ${rendered}`)
  }
  for (const row of rows) {
    if (!capabilityKinds.includes(row.kind)) {
      fail(`Capability id ${row.id} declares unknown kind: ${row.kind}`)
    }
  }

  // Every has_mcp_* / has_skill_* / has_workflow_* token used in a template must
  // be declared in the mapping table or as a derived condition.
  for (const token of usedTokens) {
    const isDeclared = [...mappings.values()].some((entry) => entry.token === token) || derivedTokens.has(token)
    if (!isDeclared) {
      fail(`Capability condition token {{#${token}}} is used in a template but has no mapping in SKILL.md`)
    }
  }

  // Every mapped token must be consumed by at least one template. Derived
  // conditions are gated by their dependency logic, not presence, so they are
  // exempt from the must-be-consumed rule unless a template actually uses them.
  const declaredTokens = new Set([...mappings.values()].map((entry) => entry.token))
  for (const token of declaredTokens) {
    if (!usedTokens.has(token)) {
      fail(`Capability condition token {{#${token}}} is declared in the mapping but consumed by no template`)
    }
  }

  // Grouped capabilities must declare their aggregation semantics.
  for (const [, bucket] of aggregateBuckets) {
    if (!['all', 'any'].includes(bucket.semantics)) {
      fail(`Capability group ${bucket.id} must declare 'all' or 'any' aggregation semantics`)
    }
    if (bucket.members.length < 2) {
      fail(`Capability group ${bucket.id} declares a group but has fewer than 2 members`)
    }
  }
}

function checkCapabilityMappingParserContract() {
  const repeatedDetection = [
    '| `same-name` | `first-id` | `skill` | `has_skill_example` |',
    '| `same-name` | `second-id` | `skill` | `has_skill_example` |',
  ].join('\n')
  const detectionResult = parseCapabilityMappings(repeatedDetection)
  if (detectionResult.duplicateDetections.length !== 1) {
    fail('Capability mapping parser must reject a repeated detection name even when its token is unchanged')
  }

  const conflictingGroup = [
    '| `plain-alias` | `shared-id` | `skill` | `has_skill_example` |',
    '# capability: examples (any)',
    '| `grouped-alias` | `shared-id` | `skill` | `has_skill_example` |',
    '# /capability',
  ].join('\n')
  const idResult = parseCapabilityMappings(conflictingGroup)
  if (idResult.duplicateIds.length !== 1) {
    fail('Capability mapping parser must reject a canonical id declared with conflicting groups')
  }
}

function checkTemplateLayering() {
  const skillMd = read('SKILL.md')
  const agents = read('templates/governance/agents/base.md')
  const constitution = read('templates/governance/constitution/base.md')

  // AGENTS base must contain exactly one dimension-section insertion point.
  const dimensionMarkers = agents.match(/\{\{DIMENSION_SECTIONS\}\}/g) ?? []
  if (dimensionMarkers.length !== 1) {
    fail(`AGENTS base must contain exactly one {{DIMENSION_SECTIONS}}, found ${dimensionMarkers.length}`)
  }

  // {{DIMENSION_SECTIONS}} must precede the confirmed-capabilities section.
  const dimIdx = agents.indexOf('{{DIMENSION_SECTIONS}}')
  const capIdx = agents.indexOf('{{CAPABILITIES_SUMMARY}}')
  if (dimIdx !== -1 && capIdx !== -1 && dimIdx > capIdx) {
    fail('{{DIMENSION_SECTIONS}} must precede the confirmed-capabilities section in AGENTS base')
  }

  // Abandoned tokens must not appear anywhere in SKILL or templates.
  const abandoned = ['{{SKILLS_INDEX}}', '{{TOOL_NAME}}', 'capability_scan.skills', '{{DIM_INDEX}}']
  for (const token of abandoned) {
    if (skillMd.includes(token)) {
      fail(`Abandoned token ${token} still present in SKILL.md`)
    }
    if (agents.includes(token)) {
      fail(`Abandoned token ${token} still present in agents/base.md`)
    }
  }
  // {{#dim-*}} / {{/dim-*}} conditional block tags must not appear anywhere.
  const allTemplateFiles = walk('templates').filter((file) => file.endsWith('.md'))
  for (const file of [...allTemplateFiles, 'SKILL.md']) {
    const content = file === 'SKILL.md' ? skillMd : read(file)
    const dimBlock = content.match(/\{\{#?dim-[a-z]+\}\}/i)
    if (dimBlock) {
      fail(`Abandoned {{#dim-*}} conditional tag present in ${file}`)
    }
  }

  // Headroom capability block must not restate the constitution evidence red line.
  const headroomMatch = agents.match(/\{\{#has_mcp_headroom\}\}([\s\S]*?)\{\{\/has_mcp_headroom\}\}/)
  if (headroomMatch && /摘要不替代证据/.test(headroomMatch[1])) {
    fail('Headroom block must not duplicate the constitution "摘要不替代证据" red line')
  }

  // Mutual-exclusion rule body must appear in the constitution at most once,
  // and only inside the Superpowers+OpenSpec combined condition.
  const mutexBody = 'Superpowers 与 OpenSpec 互斥'
  const constitutionMutex = constitution.match(new RegExp(mutexBody, 'g')) ?? []
  if (constitutionMutex.length > 1) {
    fail(`Constitution must define the mutual-exclusion red line at most once, found ${constitutionMutex.length}`)
  }
  if (constitutionMutex.length === 1 && !/\{\{#has_workflow_superpowers_and_openspec\}\}/.test(constitution)) {
    fail('Constitution mutual-exclusion red line must be gated by {{#has_workflow_superpowers_and_openspec}}')
  }

  // AGENTS may reference the mutex only inside the combined condition block,
  // and only as a cross-reference (never the full red-line body). Count
  // occurrences of the mutex phrase; at most one is allowed, and it must be
  // inside the {{#has_workflow_superpowers_and_openspec}} block.
  const agentsMutex = agents.match(new RegExp(mutexBody, 'g')) ?? []
  if (agentsMutex.length > 1) {
    fail(`AGENTS must reference the mutual-exclusion red line at most once, found ${agentsMutex.length}`)
  }
  if (agentsMutex.length === 1) {
    const combinedBlock = agents.match(/\{\{#has_workflow_superpowers_and_openspec\}\}([\s\S]*?)\{\{\/has_workflow_superpowers_and_openspec\}\}/)
    if (!combinedBlock || !combinedBlock[1].includes(mutexBody)) {
      fail('AGENTS mutex reference must live inside {{#has_workflow_superpowers_and_openspec}} block')
    }
  }

  // dim templates must start with an H3 heading (the base H2 container holds them).
  // Leading HTML source comments are skipped before checking the first real line.
  for (const dimension of parseDimensions(read('workflow-analyze.js'))) {
    const dimFile = `templates/governance/agents/dim-${dimension}.md`
    if (!exists(dimFile)) continue
    const dimContent = read(dimFile).replace(/^<!--[^>]*-->\s*/, '').trimStart()
    if (!/^#{3}\s/.test(dimContent)) {
      fail(`agents/dim-${dimension}.md must start with an H3 heading`)
    }
  }
}

function checkSembleFirstContract() {
  const skillMd = read('SKILL.md')
  // allowed-tools must include the semble MCP tools so the Phase 1-D path can
  // use them when available (otherwise the skill's own semble-first rule is
  // unreachable in environments that have semble but no Workflow).
  for (const tool of ['mcp__semble__search', 'mcp__semble__find_related']) {
    if (!skillMd.includes(`  - ${tool}\n`)) {
      fail(`SKILL.md allowed-tools must include ${tool} for the Phase 1-D semble-first path`)
    }
  }
  // The Phase 1-D path must describe the semble-first selection, not treat
  // Grep/Glob/Read as the unconditional default.
  const degradedSection = skillMd.indexOf('### Phase 1-D: Codex 降级路径')
  if (degradedSection === -1) {
    fail('SKILL.md missing Phase 1-D degraded path section')
    return
  }
  const section = skillMd.slice(degradedSection, skillMd.indexOf('## Phase 2', degradedSection))
  if (!/semble.+MCP/.test(section) || !/mcp__semble__search/.test(section)) {
    fail('Phase 1-D must detect semble MCP and prefer semantic search over unconditional Grep/Glob/Read')
  }
}

function checkDocConsistency() {
  const readme = read('README.md')
  const checklist = read('docs/review-checklist.md')
  const changelog = read('CHANGELOG.md')

  if (!readme.includes('已确认环境能力策略')) {
    fail('README must declare AGENTS responsibility for project facts and confirmed capability policies')
  }

  for (const token of ['{{SKILLS_INDEX}}', '{{TOOL_NAME}}', '{{DIM_INDEX}}', 'capability_scan.skills']) {
    if (readme.includes(token)) {
      fail(`README still references abandoned token: ${token}`)
    }
  }

  for (const fragment of [
    'checkCapabilityMappings',
    'checkDecisionGateContract',
    'checkTemplateLayering',
    'template-contract.mjs',
    'Workflow transitions',
    'Superpowers completeness',
    'File strategies',
  ]) {
    if (!checklist.includes(fragment)) {
      fail(`Review checklist missing review item: ${fragment}`)
    }
  }

  const targetSection = changelog.match(/## \[(Unreleased|0\.4\.0)\]([\s\S]*?)(?=\n## \[|\n$|$)/)
  if (!targetSection || !/规则分层收敛/.test(targetSection[2])) {
    fail('CHANGELOG [Unreleased] or [0.4.0] must summarize the contract-repair changes')
  }
}

function checkWorkflowSkillRoutingContract() {
  const skillMd = read('SKILL.md')
  const agents = read('templates/governance/agents/base.md')
  const constitution = read('templates/governance/constitution/base.md')
  const readme = read('README.md')
  const checklist = read('docs/review-checklist.md')

  for (const token of [
    'has_skill_superpowers',
    'has_skill_grill_me',
    'has_workflow_openspec',
  ]) {
    if (!skillMd.includes(`{{#${token}}}`) || !agents.includes(`{{#${token}}}`)) {
      fail(`Workflow skill routing token is not declared and used: ${token}`)
    }
  }

  // The mutual-exclusion red line body lives in the constitution, gated by the
  // combined condition. AGENTS must only reference it, not restate the body.
  if (!constitution.includes('{{#has_workflow_superpowers_and_openspec}}')) {
    fail('Constitution must gate the mutual-exclusion red line with {{#has_workflow_superpowers_and_openspec}}')
  }
  for (const fragment of [
    'Superpowers 与 OpenSpec 互斥',
    '不得调用或切换到另一工作流',
    '用户同时请求两者时停止',
  ]) {
    if (!constitution.includes(fragment)) {
      fail(`Constitution missing mutual-exclusion red line fragment: ${fragment}`)
    }
  }

  const requiredAgentFragments = [
    '小型任务不得因 Superpowers 可用而自动进入',
    '完整遵循已安装版本的内部 skill 规则与后续调用',
    '开始 `grill-me` 前必须获得用户明确确认',
    '不得自动安装或初始化',
    '不得保持大型任务范围改走其他工作流',
  ]
  for (const fragment of requiredAgentFragments) {
    if (!agents.includes(fragment)) {
      fail(`AGENTS template missing workflow skill routing safeguard: ${fragment}`)
    }
  }

  // The single-party Superpowers/OpenSpec blocks must NOT name the other
  // (unconfirmed) workflow. Only the combined block may reference the mutex.
  const superpowersBlock = agents.match(/\{\{#has_skill_superpowers\}\}([\s\S]*?)\{\{\/has_skill_superpowers\}\}/)
  if (superpowersBlock && /OpenSpec/.test(superpowersBlock[1])) {
    fail('Superpowers single-party block must not name OpenSpec (violates conservative generation)')
  }
  const openspecBlock = agents.match(/\{\{#has_workflow_openspec\}\}([\s\S]*?)\{\{\/has_workflow_openspec\}\}/)
  if (openspecBlock && /Superpowers/.test(openspecBlock[1])) {
    fail('OpenSpec single-party block must not name Superpowers (violates conservative generation)')
  }
  // The combined block must exist in AGENTS and reference the constitution mutex.
  if (!agents.includes('{{#has_workflow_superpowers_and_openspec}}')) {
    fail('AGENTS must gate its mutex reference with {{#has_workflow_superpowers_and_openspec}}')
  }

  if (agents.includes('{{#has_skill_brainstorming}}')) {
    fail('AGENTS template still has standalone brainstorming routing that can bypass scenario classification')
  }
  for (const fragment of ['Superpowers', '`grill-me`', 'OpenSpec / OPSX']) {
    if (!readme.includes(fragment)) {
      fail(`README missing workflow skill routing capability: ${fragment}`)
    }
  }
  if (!checklist.includes('Superpowers and OpenSpec must remain mutually exclusive')) {
    fail('Review checklist missing Superpowers/OpenSpec mutual-exclusion guard')
  }
}

checkTemplateTokens()
checkTemplateTokenSources()
checkProfileTokenSources()
checkDimensionTemplates()
checkToolEntryTemplates()
checkKimiSkillContract()
checkApiConfidenceEnums()
checkAgentCount()
checkGitignore()
checkPackageFiles()
checkExamples()
checkKimiExamples()
checkKimiDocumentationContract()
checkInstructionHierarchy()
checkReadmeVersion()
checkConsolidatedConfirmationContract()
checkDecisionGateContract()
checkCapabilityMappings()
checkCapabilityMappingParserContract()
checkTemplateLayering()
checkWorkflowSkillRoutingContract()
checkSembleFirstContract()
checkDocConsistency()

if (errors.length > 0) {
  console.error('Consistency check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log('Consistency check passed.')
}
