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
      '{{CAPABILITIES_SUMMARY}}',
      '{{SKILLS_INDEX}}',
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
    ['grouped entry detection', '`KIMI.md` 或 `.kimi-code/AGENTS.md` 任一存在'],
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
  if (!changelog.includes('## [Unreleased]') || !changelog.includes('Kimi Code CLI')) {
    fail('CHANGELOG missing unreleased Kimi Code CLI entry')
  }
}

checkTemplateTokens()
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

if (errors.length > 0) {
  console.error('Consistency check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log('Consistency check passed.')
}
