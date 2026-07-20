#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const examplesRoot = path.join(root, 'examples')
const failures = []
const allowedStrategies = ['merge', 'overwrite', 'skip']
const dimensions = ['api', 'code', 'database', 'deploy', 'maintenance']
const governanceFiles = [
  '.kimi-code/AGENTS.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'GEMINI.md',
  'KIMI.md',
  'KIRO.md',
  'constitution.md',
]
const toolOrder = ['claude', 'gemini', 'codex', 'kiro', 'kimi']
const toolEntries = {
  claude: ['CLAUDE.md'],
  gemini: ['GEMINI.md'],
  codex: ['CODEX.md'],
  kiro: ['KIRO.md'],
  kimi: ['KIMI.md', '.kimi-code/AGENTS.md'],
}

function fail(fieldPath, message) {
  failures.push(`${fieldPath}: ${message}`)
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function walkFiles(directory, base = directory) {
  const files = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, base))
    } else {
      files.push(toPosix(path.relative(base, absolute)))
    }
  }

  return files.sort()
}

function readJson(file, fieldPath) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(fieldPath, `invalid JSON: ${error.message}`)
    return null
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireObject(value, fieldPath) {
  if (!isObject(value)) {
    fail(fieldPath, 'expected object')
    return false
  }
  return true
}

function requireArray(value, fieldPath) {
  if (!Array.isArray(value)) {
    fail(fieldPath, 'expected array')
    return false
  }
  return true
}

function compare(actual, expected, fieldPath) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      fail(fieldPath, `expected array, received ${typeof actual}`)
      return
    }
    if (actual.length !== expected.length) {
      fail(fieldPath, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
      return
    }
    for (let index = 0; index < expected.length; index += 1) {
      compare(actual[index], expected[index], `${fieldPath}[${index}]`)
    }
    return
  }

  if (isObject(expected)) {
    if (!isObject(actual)) {
      fail(fieldPath, `expected object, received ${typeof actual}`)
      return
    }
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (!(key in actual)) {
        fail(`${fieldPath}.${key}`, 'missing actual field')
      } else {
        compare(actual[key], expectedValue, `${fieldPath}.${key}`)
      }
    }
    return
  }

  if (actual !== expected) {
    fail(fieldPath, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function readManifest(directory) {
  const manifestPath = path.join(directory, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    return { dependencies: new Set(), scripts: {} }
  }

  const manifest = readJson(manifestPath, `${path.basename(directory)}.package.json`)
  if (!manifest) {
    return { dependencies: new Set(), scripts: {} }
  }

  const dependencyGroups = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ].filter(isObject)
  const dependencyNames = dependencyGroups.flatMap((group) => Object.keys(group))

  return {
    dependencies: new Set(dependencyNames),
    scripts: isObject(manifest.scripts) ? manifest.scripts : {},
  }
}

function hasDependency(dependencies, patterns) {
  return [...dependencies].some((name) => patterns.some((pattern) => pattern.test(name)))
}

function classifyProject(directory) {
  const files = walkFiles(directory)
  const fileSet = new Set(files)
  const manifest = readManifest(directory)
  const apiSignals = {
    framework: hasDependency(manifest.dependencies, [
      /^express$/,
      /^fastify$/,
      /^@nestjs\//,
      /^next$/,
      /^fastapi$/,
      /^flask$/,
      /^django$/,
      /^spring-web/,
      /^actix-web$/,
      /^axum$/,
    ]),
    route: files.some((file) => /(^|\/)(routes?|controllers?|handlers?|endpoints?)(\/|\.)/i.test(file) || /(^|\/)app\/api\//i.test(file) || /(^|\/)pages\/api\//i.test(file)),
    schema: files.some((file) => /(^|\/)(openapi\.(ya?ml)|swagger\.json|schema\.graphql|asyncapi\.ya?ml)$/i.test(file) || /\.proto$/i.test(file)),
    test: files.some((file) => /(^|\/)(tests?|__tests__)(\/|$)/i.test(file) && /(api|contract|e2e|integration|handler|controller|request|response)/i.test(file)),
  }
  const apiSignalCount = Object.values(apiSignals).filter(Boolean).length
  const hasApi = apiSignalCount > 0
  const hasAuth = hasDependency(manifest.dependencies, [/jwt/i, /passport/i, /oauth/i, /auth/i]) || files.some((file) => /(^|\/)(auth|authorization|permissions?)(\/|\.|$)/i.test(file))
  const hasDatabase = hasDependency(manifest.dependencies, [
    /^pg$/,
    /postgres/i,
    /mysql/i,
    /mariadb/i,
    /mongo/i,
    /mongoose/i,
    /prisma/i,
    /sequelize/i,
    /typeorm/i,
    /sqlalchemy/i,
    /gorm/i,
  ]) || files.some((file) => /(^|\/)(migrations?|migrate)(\/|\.|$)/i.test(file)) || Object.keys(manifest.scripts).some((script) => /migrat/i.test(script))
  const hasDeploy = files.some((file) => /(^|\/)Dockerfile$/i.test(file) || /(^|\/)docker-compose.*\.ya?ml$/i.test(file) || /(^|\/)k8s\//i.test(file) || /\.tf(vars)?$/i.test(file) || /(^|\/)\.github\/workflows\/.*deploy.*\.ya?ml$/i.test(file)) || Object.keys(manifest.scripts).some((script) => /deploy/i.test(script))
  const hasMaintenance = files.some((file) => /(^|\/)(monitoring|alerts|grafana|prometheus|alertmanager)(\/|\.|$)/i.test(file) || /(^|\/)(prometheus|alertmanager|rules)\.ya?ml$/i.test(file))
  const enabled = ['code']
  if (hasDatabase) enabled.push('database')
  if (hasApi) enabled.push('api')
  if (hasDeploy) enabled.push('deploy')
  if (hasMaintenance) enabled.push('maintenance')
  enabled.sort()

  return {
    files,
    fileSet,
    dependencies: manifest.dependencies,
    dimensions: {
      enabled,
      disabled: dimensions.filter((dimension) => !enabled.includes(dimension)),
    },
    api: {
      confidence: hasApi ? (apiSignalCount >= 2 ? 'HIGH' : 'LOW') : 'UNKNOWN',
      auth_state: hasAuth ? 'DETECTED' : 'UNKNOWN',
      assumed_internal: false,
    },
    governance: observeGovernance(directory),
  }
}

function observeGovernance(directory) {
  const existingFiles = governanceFiles.filter((file) => fs.existsSync(path.join(directory, file))).sort()
  const userCustomFiles = existingFiles.filter((file) => {
    const content = fs.readFileSync(path.join(directory, file), 'utf8')
    return content.includes('<!-- user-custom -->') && content.includes('<!-- /user-custom -->')
  })
  const groupedTools = toolOrder.filter((tool) => toolEntries[tool].some((file) => existingFiles.includes(file)))
  const requiresToolChoice = groupedTools.length > 1
  const recommendedTool = groupedTools[0] ?? 'claude'
  const suggestedCreations = []

  if (!requiresToolChoice && recommendedTool === 'kimi') {
    if (!existingFiles.includes('KIMI.md')) suggestedCreations.push('KIMI.md')
    if (!existingFiles.includes('.kimi-code/AGENTS.md')) suggestedCreations.push('.kimi-code/AGENTS.md')
  }

  return {
    existing_files: existingFiles,
    user_custom_files: userCustomFiles,
    protected_files: existingFiles,
    grouped_tools: groupedTools,
    recommended_tool: recommendedTool,
    requires_tool_choice: requiresToolChoice,
    requires_confirmation: true,
    suggested_creations: suggestedCreations.sort(),
  }
}

function validateEvidence(observation, expected, suiteName) {
  if (!requireObject(expected, `${suiteName}.evidence`)) return
  if (requireArray(expected.required_paths, `${suiteName}.evidence.required_paths`)) {
    for (const requiredPath of expected.required_paths) {
      if (!observation.fileSet.has(requiredPath)) {
        fail(`${suiteName}.evidence.required_paths`, `missing ${requiredPath}`)
      }
    }
  }
  if (requireArray(expected.required_dependencies, `${suiteName}.evidence.required_dependencies`)) {
    for (const dependency of expected.required_dependencies) {
      if (!observation.dependencies.has(dependency)) {
        fail(`${suiteName}.evidence.required_dependencies`, `missing ${dependency}`)
      }
    }
  }
}

function validateForbiddenInferences(observation, expected, suiteName) {
  if (!requireArray(expected, `${suiteName}.forbidden_inferences`)) return
  const supported = new Set(['api_from_governance_docs', 'api_without_evidence', 'internal_api_without_auth'])

  for (const inference of expected) {
    if (!supported.has(inference)) {
      fail(`${suiteName}.forbidden_inferences`, `unsupported invariant ${inference}`)
      continue
    }
    if (inference === 'api_from_governance_docs' && observation.dimensions.enabled.includes('api')) {
      fail(`${suiteName}.forbidden_inferences`, 'governance documents must not enable api')
    }
    if (inference === 'api_without_evidence' && observation.dimensions.enabled.includes('api')) {
      fail(`${suiteName}.forbidden_inferences`, 'api enabled without fixture evidence')
    }
    if (inference === 'internal_api_without_auth' && observation.api.auth_state === 'UNKNOWN' && observation.api.assumed_internal) {
      fail(`${suiteName}.forbidden_inferences`, 'missing auth evidence must not imply an internal API')
    }
  }
}

function validateProjectSuite(directory, expected, suiteName) {
  const requiredSections = ['dimensions', 'evidence', 'api', 'governance']
  for (const section of requiredSections) {
    if (!requireObject(expected[section], `${suiteName}.${section}`)) return
  }

  const observation = classifyProject(directory)
  compare(observation.dimensions, expected.dimensions, `${suiteName}.dimensions`)
  compare(observation.api, expected.api, `${suiteName}.api`)

  const governanceProjection = {
    existing_files: observation.governance.existing_files,
    user_custom_files: observation.governance.user_custom_files,
    protected_files: observation.governance.protected_files,
    recommended_tool: observation.governance.recommended_tool,
    requires_tool_choice: observation.governance.requires_tool_choice,
    requires_confirmation: observation.governance.requires_confirmation,
  }
  compare(governanceProjection, expected.governance, `${suiteName}.governance`)
  validateEvidence(observation, expected.evidence, suiteName)
  validateForbiddenInferences(observation, expected.forbidden_inferences, suiteName)
}

function validateToolEntrySuite(directory, expected, suiteName) {
  if (!requireArray(expected.allowed_strategies, `${suiteName}.allowed_strategies`)) return
  compare(expected.allowed_strategies, allowedStrategies, `${suiteName}.allowed_strategies`)
  if (!requireObject(expected.cases, `${suiteName}.cases`)) return

  const casesDirectory = path.join(directory, 'cases')
  const actualCaseNames = fs.readdirSync(casesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  compare(actualCaseNames, Object.keys(expected.cases).sort(), `${suiteName}.cases`)

  for (const [caseName, expectedCase] of Object.entries(expected.cases)) {
    const casePath = `${suiteName}.cases.${caseName}`
    if (!requireObject(expectedCase, casePath)) continue
    const observation = observeGovernance(path.join(casesDirectory, caseName))
    compare(observation, expectedCase, casePath)

    for (const protectedFile of observation.protected_files) {
      if (allowedStrategies.length !== 3) {
        fail(`${casePath}.protected_files.${protectedFile}`, 'must support merge, overwrite, and skip')
      }
    }
  }
}

const suites = fs.readdirSync(examplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

let scenarioCount = 0
for (const suiteName of suites) {
  const directory = path.join(examplesRoot, suiteName)
  const expectedPath = path.join(directory, 'expected.json')
  if (!fs.existsSync(expectedPath)) {
    fail(`${suiteName}.expected.json`, 'missing fixture contract')
    continue
  }

  const expected = readJson(expectedPath, `${suiteName}.expected.json`)
  if (!expected || !requireObject(expected, suiteName)) continue

  if (expected.kind === 'project') {
    scenarioCount += 1
    validateProjectSuite(directory, expected, suiteName)
  } else if (expected.kind === 'tool-entry-cases') {
    scenarioCount += isObject(expected.cases) ? Object.keys(expected.cases).length : 0
    validateToolEntrySuite(directory, expected, suiteName)
  } else {
    fail(`${suiteName}.kind`, `unsupported fixture kind ${JSON.stringify(expected.kind)}`)
  }
}

if (failures.length > 0) {
  console.error('Fixture eval failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`Fixture eval passed: ${suites.length} suites, ${scenarioCount} scenarios.`)
}
