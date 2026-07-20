#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

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
  for (const sharedToken of ['{{CAPABILITIES_SUMMARY}}', '{{SKILLS_INDEX}}']) {
    if (!agentsTemplate.includes(sharedToken)) {
      fail(`AGENTS template missing shared capability token: ${sharedToken}`)
    }
    for (const tool of supportedToolEntries) {
      const toolTemplate = read(`templates/governance/tool-entry/${tool}.md`)
      if (toolTemplate.includes(sharedToken)) {
        fail(`Tool entry ${tool} duplicates AGENTS shared token: ${sharedToken}`)
      }
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

if (errors.length > 0) {
  console.error('Consistency check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log('Consistency check passed.')
}
