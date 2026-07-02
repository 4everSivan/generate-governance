#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []

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

function extractEnumAfter(content, anchor) {
  const start = content.indexOf(anchor)
  if (start === -1) {
    fail(`Could not find enum anchor: ${anchor}`)
    return []
  }

  const slice = content.slice(start, start + 1500)
  const match = slice.match(/enum:\s*\[([^\]]+)\]/m)
  if (!match) {
    fail(`Could not find enum after anchor: ${anchor}`)
    return []
  }

  return unique([...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
}

function checkTemplateTokens() {
  const skillMd = read('skill.md')
  const declared = new Set(extractDeclaredTokens(skillMd))
  const templateFiles = walk('templates').filter((file) => file.endsWith('.md'))
  const usedTokens = unique(templateFiles.flatMap((file) => extractTemplateTokens(read(file))))

  for (const token of usedTokens) {
    if (!declared.has(token)) {
      fail(`Template token {{${token}}} is not declared in skill.md`)
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

function checkApiConfidenceEnums() {
  const workflow = read('workflow-analyze.js')
  const apiSchema = extractEnumAfter(workflow, "confidence: { type: 'string'")
  const apiSummary = extractEnumAfter(workflow, 'api_summary:')
  const confidenceApi = extractEnumAfter(workflow, 'api: { type:')

  const serialized = [apiSchema, apiSummary, confidenceApi].map((values) => values.join('|'))
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
  const required = ['bin', 'scripts', 'skill.md', 'workflow-analyze.js', 'templates', 'README.md', 'CHANGELOG.md', 'LICENSE']

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

checkTemplateTokens()
checkDimensionTemplates()
checkApiConfidenceEnums()
checkAgentCount()
checkGitignore()
checkPackageFiles()
checkExamples()

if (errors.length > 0) {
  console.error('Consistency check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log('Consistency check passed.')
}
