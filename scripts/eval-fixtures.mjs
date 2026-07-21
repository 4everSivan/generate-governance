#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {
  validateBalancedConditions,
  composeDimensionSections,
  renderContractFixture,
  extractHeadingHierarchy,
} from './template-contract.mjs'
import {
  tokenForCapability,
  kindForCapability,
  groupForCapability,
  parseFileStrategies,
} from './capability-map.mjs'

const root = process.cwd()
const examplesRoot = path.join(root, 'examples')
const failures = []
// File strategies are parsed from SKILL.md (single source of truth), not
// hardcoded here, so the evaluator cannot drift from the declared contract.
const skillMd = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8')
const allowedStrategies = parseFileStrategies(skillMd)
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
  if (!requireArray(expected.existing_file_strategies, `${suiteName}.existing_file_strategies`)) return
  if (!requireArray(expected.missing_file_strategies, `${suiteName}.missing_file_strategies`)) return
  // Strategy applicability is split by target existence: existing protected
  // files support merge/overwrite/skip only; `create` applies only to files
  // that do not exist yet.
  const existingStrategies = allowedStrategies.filter((strategy) => strategy !== 'create')
  const missingStrategies = allowedStrategies.filter((strategy) => strategy === 'create')
  compare(existingStrategies, expected.existing_file_strategies, `${suiteName}.existing_file_strategies`)
  compare(missingStrategies, expected.missing_file_strategies, `${suiteName}.missing_file_strategies`)
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

    // Each existing protected file is an independent strategy target and any
    // unresolved file requires confirmation. This asserts the PROCESS declares
    // the three strategies; it is not an end-to-end merge/overwrite/skip test.
    for (const protectedFile of observation.protected_files) {
      if (!existingStrategies.includes('merge') || !existingStrategies.includes('overwrite') || !existingStrategies.includes('skip')) {
        fail(`${casePath}.protected_files.${protectedFile}`, 'process must declare merge, overwrite, and skip strategies')
      }
      if (observation.requires_confirmation !== true) {
        fail(`${casePath}.protected_files.${protectedFile}`, 'unconfirmed protected file strategy must require confirmation')
      }
    }
  }
}

const largeWorkTypes = new Set([
  'greenfield',
  'major-refactor',
  'new-feature-module',
  'public-contract-change',
])

const workflowActions = {
  executeDirectly: () => ({ selected_workflow: 'direct', action: 'execute-directly', requires_confirmation: false }),
  startGrillMe: () => ({ selected_workflow: 'grill-me', action: 'start-grill-me', requires_confirmation: false }),
  requestGrillMeConfirmation: () => ({ selected_workflow: 'grill-me', action: 'request-grill-me-confirmation', requires_confirmation: true }),
  requestWorkflowSwitch: (target) => ({ selected_workflow: target, action: 'request-workflow-switch', requires_confirmation: true }),
  startSuperpowers: () => ({ selected_workflow: 'superpowers', action: 'start-superpowers', requires_confirmation: false }),
  requestOpenspecInstallation: () => ({ selected_workflow: 'openspec', action: 'request-openspec-installation', requires_confirmation: true }),
  requestOpenspecInitialization: () => ({ selected_workflow: 'openspec', action: 'request-openspec-initialization', requires_confirmation: true }),
  startOpenspec: () => ({ selected_workflow: 'openspec', action: 'start-openspec', requires_confirmation: false }),
  rejectWorkflowConflict: () => ({ selected_workflow: 'none', action: 'reject-workflow-conflict', requires_confirmation: true }),
  rejectWorkflowMismatch: () => ({ selected_workflow: 'none', action: 'reject-workflow-mismatch', requires_confirmation: true }),
  reportSuperpowersUnavailable: () => ({ selected_workflow: 'none', action: 'report-superpowers-unavailable', requires_confirmation: true }),
  reportOpenspecUnavailable: () => ({ selected_workflow: 'none', action: 'report-openspec-unavailable', requires_confirmation: true }),
  rejectUnknownWorkflow: () => ({ selected_workflow: 'none', action: 'reject-unknown-workflow', requires_confirmation: true }),
  rejectInvalidState: () => ({ selected_workflow: 'none', action: 'reject-invalid-state', requires_confirmation: true }),
  cancelOrRescope: () => ({ selected_workflow: 'none', action: 'cancel-or-rescope', requires_confirmation: true }),
}

// The set of recognized workflow names. Any requested_workflow or
// active/previous workflow outside this set is rejected rather than silently
// coerced to direct.
const knownWorkflows = new Set(['direct', 'grill-me', 'superpowers', 'openspec'])

// Recognized OpenSpec availability states.
const knownOpenspecStates = new Set(['not-installed', 'not-initialized', 'ready', 'declined'])

// Classify the task into a size and a suggested workflow (before capability
// gating). Pure over input.
function classifyTask(input) {
  const size = input.size
  const isLarge = size === 'large' || largeWorkTypes.has(input.work_type)
  if (isLarge) return { size: 'large', suggested: 'openspec' }
  if (input.work_type === 'bug' && input.diagnosis_required === true) return { size: size ?? 'small', suggested: 'superpowers' }
  if (size === 'medium') return { size: 'medium', suggested: 'superpowers' }
  if (size === 'small' && input.ambiguous === true) return { size: 'small', suggested: 'grill-me' }
  return { size: size ?? 'small', suggested: 'direct' }
}

function isWorkflowSizeMismatch(workflow, classification) {
  return classification.size === 'large' && (workflow === 'superpowers' || workflow === 'direct')
}

// Validate an explicit workflow request against the classified task size.
// Returns { ok, reason } where reason is 'conflict' | 'mismatch' | null.
function validateRequestedWorkflow(input, classification) {
  const requests = Array.isArray(input.requested_workflows)
    ? input.requested_workflows
    : input.requested_workflow
      ? [input.requested_workflow]
      : []
  if (requests.length === 0) return { ok: true, reason: null, requested: null }
  const unique = new Set(requests)
  // Any requested workflow outside the known set is rejected (fail-closed).
  for (const workflow of unique) {
    if (!knownWorkflows.has(workflow)) {
      return { ok: false, reason: 'unknown', requested: workflow }
    }
  }
  if (unique.has('superpowers') && unique.has('openspec')) {
    return { ok: false, reason: 'conflict', requested: [...unique] }
  }
  // An explicit request must be size-appropriate.
  for (const workflow of unique) {
    if (isWorkflowSizeMismatch(workflow, classification)) {
      return { ok: false, reason: 'mismatch', requested: workflow }
    }
  }
  return { ok: true, reason: null, requested: requests[0] }
}

// Resolve OpenSpec's availability state from input. Returns the state string or
// 'invalid' when an explicit openspec_state is not a recognized value.
function resolveOpenspecState(input) {
  if (typeof input.openspec_state === 'string') {
    return knownOpenspecStates.has(input.openspec_state) ? input.openspec_state : 'invalid'
  }
  if (input.openspec_available === true) {
    return input.openspec_initialized === true ? 'ready' : 'not-initialized'
  }
  return 'not-installed'
}

// Check whether a workflow capability is confirmed and usable.
function validateWorkflowAvailability(workflow, input) {
  const caps = isObject(input.capabilities) ? input.capabilities : {}
  if (workflow === 'superpowers') {
    const sp = isObject(caps.superpowers) ? caps.superpowers : {}
    const confirmed = sp.confirmed === true
    const complete = sp.complete === true
    return { confirmed, complete, usable: confirmed && complete }
  }
  if (workflow === 'openspec') {
    const op = isObject(caps.openspec) ? caps.openspec : {}
    return { confirmed: op.confirmed === true, complete: true, usable: op.confirmed === true }
  }
  if (workflow === 'grill-me' || workflow === 'direct') {
    return { confirmed: true, complete: true, usable: true }
  }
  return { confirmed: false, complete: false, usable: false }
}

// Resolve a transition from an active workflow to a target workflow.
// Returns { reject } when the transition is forbidden (Superpowers <-> OpenSpec).
function resolveWorkflowTransition(activeWorkflow, targetWorkflow) {
  const forbidden = new Set(['superpowers:openspec', 'openspec:superpowers'])
  if (activeWorkflow && targetWorkflow && forbidden.has(`${activeWorkflow}:${targetWorkflow}`)) {
    return { reject: true }
  }
  return { reject: false }
}

// Orchestrate the routing decision in a fixed rule order. Pure over input.
function classifySkillRoute(input) {
  const classification = classifyTask(input)
  const activeWorkflow = input.active_workflow ?? input.previous_workflow ?? null

  // 1. Reject simultaneous Superpowers + OpenSpec requests, size mismatches,
  //    and unknown workflow names.
  const validation = validateRequestedWorkflow(input, classification)
  if (!validation.ok) {
    if (validation.reason === 'conflict') return workflowActions.rejectWorkflowConflict()
    if (validation.reason === 'unknown') return workflowActions.rejectUnknownWorkflow()
    return workflowActions.rejectWorkflowMismatch()
  }

  // 1b. Reject an unknown active/previous workflow (fail-closed); an
  //     unrecognized value must not silently degrade to direct.
  if (activeWorkflow && !knownWorkflows.has(activeWorkflow)) {
    return workflowActions.rejectUnknownWorkflow()
  }

  // 2. Reject a mid-task cross-workflow switch (Superpowers <-> OpenSpec).
  if (activeWorkflow && validation.requested) {
    const transition = resolveWorkflowTransition(activeWorkflow, validation.requested)
    if (transition.reject) return workflowActions.rejectWorkflowConflict()
  }

  // 2b. Without an explicit target, an active direct/Superpowers workflow must
  //     not bypass the large-task route. Stop and reclassify instead of silently
  //     continuing the now-incompatible active workflow.
  if (activeWorkflow && !validation.requested && isWorkflowSizeMismatch(activeWorkflow, classification)) {
    return workflowActions.rejectWorkflowMismatch()
  }

  // Determine the candidate workflow: explicit request, else active (when still
  // viable), else the task-size suggestion. An active workflow that has become
  // non-viable (e.g. OpenSpec declined, user rescoped to medium) is abandoned in
  // favour of the reclassification suggested by the new task size.
  let candidate = validation.requested ?? null
  if (!candidate && activeWorkflow && activeWorkflow !== 'grill-me') {
    if (activeWorkflow === 'openspec' && resolveOpenspecState(input) === 'declined') {
      candidate = classification.suggested
    } else {
      candidate = activeWorkflow
    }
  }
  if (!candidate) candidate = classification.suggested

  // 3. grill-me reclassification: if active is grill-me and the candidate is a
  //    heavier workflow, request a confirmed switch. Downgrade to direct does
  //    not require a second confirmation.
  if (activeWorkflow === 'grill-me' && ['superpowers', 'openspec'].includes(candidate)) {
    return workflowActions.requestWorkflowSwitch(candidate)
  }

  // 3b. Any other active -> different heavier workflow switch also needs a
  //     confirmed transition (e.g. OpenSpec declined and rescoped to Superpowers).
  //     A downgrade to direct never requires a second confirmation.
  if (activeWorkflow && activeWorkflow !== candidate && ['superpowers', 'openspec'].includes(candidate)) {
    return workflowActions.requestWorkflowSwitch(candidate)
  }

  // 4. grill-me entry requires task-level confirmation.
  if (candidate === 'grill-me') {
    const explicitlyRequested = validation.requested === 'grill-me'
    return explicitlyRequested || input.grill_me_confirmed === true
      ? workflowActions.startGrillMe()
      : workflowActions.requestGrillMeConfirmation()
  }

  // 5. Validate the candidate workflow's availability.
  if (candidate === 'superpowers') {
    const availability = validateWorkflowAvailability('superpowers', input)
    if (!availability.usable) return workflowActions.reportSuperpowersUnavailable()
    return workflowActions.startSuperpowers()
  }

  if (candidate === 'openspec') {
    const availability = validateWorkflowAvailability('openspec', input)
    if (!availability.usable) return workflowActions.reportOpenspecUnavailable()
    const state = resolveOpenspecState(input)
    if (state === 'invalid') return workflowActions.rejectInvalidState()
    if (state === 'declined') return workflowActions.cancelOrRescope()
    if (state === 'not-installed') return workflowActions.requestOpenspecInstallation()
    if (state === 'not-initialized') return workflowActions.requestOpenspecInitialization()
    return workflowActions.startOpenspec()
  }

  return workflowActions.executeDirectly()
}

function validateSkillRoutingSuite(expected, suiteName) {
  if (!requireObject(expected.cases, `${suiteName}.cases`)) return

  for (const [caseName, expectedCase] of Object.entries(expected.cases)) {
    const casePath = `${suiteName}.cases.${caseName}`
    if (!requireObject(expectedCase, casePath)) continue
    if (!requireObject(expectedCase.input, `${casePath}.input`)) continue
    if (!requireObject(expectedCase.expected, `${casePath}.expected`)) continue

    const observation = classifySkillRoute(expectedCase.input)
    compare(observation, expectedCase.expected, `${casePath}.expected`)
  }
}

// Resolve a capability id to its template condition token via the shared
// capability map (single source of truth shared with check-consistency.mjs).
function capabilityToken(id) {
  return tokenForCapability(id) ?? (groupForCapability(id) ? 'has_skill_artifacts' : null)
}

function isArtifactMember(id) {
  return groupForCapability(id) === 'artifacts'
}

// Normalize a raw capability signal into a CapabilityProfile. Pure: no env scan,
// no installs. Returns { profiles, conditions } or { error } on unknown id.
// Validates the CapabilityProfile contract fields (id/kind/detection_basis).
function normalizeCapabilityProfile(input) {
  const detected = Array.isArray(input.detected) ? input.detected : []
  const confirmedSet = new Set(Array.isArray(input.confirmed) ? input.confirmed : [])
  const profiles = {}
  const conditions = {}

  for (const [index, raw] of detected.entries()) {
    if (!isObject(raw)) {
      return { error: 'invalid_capability_profile', index }
    }
    const id = raw.id
    const token = capabilityToken(id)
    if (!token) {
      return { error: 'unknown_capability_id', id }
    }

    // Validate required CapabilityProfile fields.
    if (typeof raw.kind !== 'string' || !raw.kind) {
      return { error: 'missing_capability_field', id, field: 'kind' }
    }
    if (typeof raw.detection_basis !== 'string' || !raw.detection_basis) {
      return { error: 'missing_capability_field', id, field: 'detection_basis' }
    }
    const expectedKinds = kindForCapability(id)
    if (!expectedKinds || !expectedKinds.includes(raw.kind)) {
      return { error: 'invalid_capability_kind', id, kind: raw.kind, expected: (expectedKinds ?? []).join('|') }
    }

    const confirmed = confirmedSet.has(id)
    let complete = true
    let members = []
    let missingMembers = []
    if (id === 'superpowers') {
      const result = evaluateSuperpowersCompleteness(raw)
      if (result.error) return result
      complete = result.complete
      members = result.members
      missingMembers = result.missingMembers
    }
    profiles[id] = {
      id,
      kind: raw.kind,
      detection_basis: raw.detection_basis,
      template_condition: token,
      detected: true,
      confirmed,
      ...(id === 'superpowers'
        ? { complete, members, missing_members: missingMembers }
        : {}),
    }
  }

  // Derive conditions for every detected capability's token: true only when
  // detected && confirmed (Superpowers also needs complete). Explicit false
  // makes the confirmed/complete gate observable in the contract.
  for (const [id, profile] of Object.entries(profiles)) {
    const token = capabilityToken(id)
    if (!token) continue
    if (id === 'superpowers') {
      conditions[token] = profile.confirmed && profile.complete
    } else if (isArtifactMember(id)) {
      // artifact member conditions are aggregated below; set a per-member value.
      conditions[token] = profile.confirmed
    } else {
      conditions[token] = profile.confirmed
    }
  }

  // has_skill_artifacts: true if ANY artifact member confirmed (overrides false
  // values set per-member above).
  const artifactMemberIds = Object.keys(profiles).filter((id) => isArtifactMember(id))
  const anyArtifact = artifactMemberIds.some((member) => profiles[member]?.confirmed)
  if (artifactMemberIds.length > 0) conditions.has_skill_artifacts = anyArtifact

  // Derived: has_workflow_superpowers_and_openspec (explicit false when not both).
  conditions.has_workflow_superpowers_and_openspec = Boolean(
    conditions.has_skill_superpowers && conditions.has_workflow_openspec
  )

  return { profiles, conditions }
}

// Evaluate Superpowers suite completeness. Strict, fail-closed semantics:
//   - suite_metadata basis: only complete when metadata explicitly declares
//     metadata_complete === true. Presence of metadata alone is insufficient.
//   - using-superpowers basis: the caller supplies referenced_members (required)
//     AND resolved_members (required). Without an explicit resolved_members the
//     members are unverified, so every referenced member counts as missing and
//     complete = false. The evaluator computes the missing set as the
//     difference; the caller-provided missing_members is NOT trusted as the
//     source of truth.
//   - Any other detection_basis is rejected (fail-closed).
//   - A lone brainstorming member is never complete.
// Returns { complete, members, missingMembers } or { error }.
function evaluateSuperpowersCompleteness(raw) {
  const basis = raw.detection_basis
  const referencedMembers = Array.isArray(raw.referenced_members) ? raw.referenced_members
    : Array.isArray(raw.members) ? raw.members
    : []

  if (basis === 'suite_metadata') {
    const resolvedMembers = Array.isArray(raw.resolved_members) ? raw.resolved_members : referencedMembers
    const resolvedSet = new Set(resolvedMembers)
    const missingMembers = referencedMembers.filter((member) => !resolvedSet.has(member))
    const complete = raw.metadata_complete === true && referencedMembers.length > 0
    return { complete, members: referencedMembers, missingMembers }
  }

  if (basis !== 'using-superpowers') {
    return { error: 'invalid_detection_basis', id: raw.id, basis }
  }

  // using-superpowers path: resolved_members must be provided explicitly;
  // unverified members are not evidence of resolvability.
  if (!Array.isArray(raw.resolved_members)) {
    return { complete: false, members: referencedMembers, missingMembers: referencedMembers }
  }
  const resolvedSet = new Set(raw.resolved_members)
  const missingMembers = referencedMembers.filter((member) => !resolvedSet.has(member))

  // complete only if all referenced members resolve and the suite is not a
  // lone brainstorming.
  if (referencedMembers.length === 1 && referencedMembers[0] === 'brainstorming') {
    return { complete: false, members: referencedMembers, missingMembers }
  }
  const complete = referencedMembers.length > 0 && missingMembers.length === 0
  return { complete, members: referencedMembers, missingMembers }
}

function deriveCapabilityConditions(profile) {
  return profile.conditions ?? {}
}

function validateCapabilityProfileSuite(expected, suiteName) {
  if (!requireObject(expected.cases, `${suiteName}.cases`)) return

  for (const [caseName, expectedCase] of Object.entries(expected.cases)) {
    const casePath = `${suiteName}.cases.${caseName}`
    if (!requireObject(expectedCase, casePath)) continue
    if (!requireObject(expectedCase.input, `${casePath}.input`)) continue
    if (!requireObject(expectedCase.expected, `${casePath}.expected`)) continue

    const result = normalizeCapabilityProfile(expectedCase.input)
    if (expectedCase.expected.error) {
      if (result.error !== expectedCase.expected.error) {
        fail(`${casePath}.expected`, `expected error ${expectedCase.expected.error}, received ${result.error ?? 'none'}`)
      }
      continue
    }
    if (result.error) {
      fail(`${casePath}.expected`, `unexpected error ${result.error}`)
      continue
    }
    const conditions = deriveCapabilityConditions(result)
    compare(conditions, expectedCase.expected.conditions, `${casePath}.expected.conditions`)
    if (expectedCase.expected.profiles) {
      compare(result.profiles, expectedCase.expected.profiles, `${casePath}.expected.profiles`)
    }
  }
}

function validateTemplateCompositionSuite(expected, suiteName) {
  if (!requireObject(expected.cases, `${suiteName}.cases`)) return

  const agentsBase = fs.readFileSync(path.join(root, 'templates/governance/agents/base.md'), 'utf8')
  const constitutionBase = fs.readFileSync(path.join(root, 'templates/governance/constitution/base.md'), 'utf8')
  const readDim = (dimension) => fs.readFileSync(
    path.join(root, `templates/governance/agents/dim-${dimension}.md`), 'utf8'
  )

  for (const [caseName, expectedCase] of Object.entries(expected.cases)) {
    const casePath = `${suiteName}.cases.${caseName}`
    if (!requireObject(expectedCase, casePath)) continue
    if (!requireObject(expectedCase.input, `${casePath}.input`)) continue
    if (!requireObject(expectedCase.expected, `${casePath}.expected`)) continue

    const input = expectedCase.input
    const dimensions = Array.isArray(input.dimensions) ? input.dimensions : []
    const conditions = isObject(input.conditions) ? input.conditions : {}
    const fixtureScalars = isObject(expected.scalars) ? expected.scalars : {}
    const caseScalars = isObject(input.scalars) ? input.scalars : {}
    const scalars = { ...fixtureScalars, ...caseScalars }

    // Dimension composition validates unknown/duplicate dimensions (fail-closed).
    let dimensionSections = ''
    let constitutionDimensionSections = ''
    let dimensionError = null
    const readConstitutionDim = (dimension) => fs.readFileSync(
      path.join(root, `templates/governance/constitution/dim-${dimension}.md`), 'utf8'
    )
    try {
      dimensionSections = composeDimensionSections(dimensions, readDim)
      constitutionDimensionSections = composeDimensionSections(dimensions, readConstitutionDim)
    } catch (error) {
      dimensionError = error.message
    }

    if (expectedCase.expected.dimension_error !== undefined) {
      if (dimensionError === null) {
        fail(`${casePath}.expected.dimension_error`, `expected a dimension error, received none`)
      } else if (!dimensionError.includes(expectedCase.expected.dimension_error)) {
        fail(`${casePath}.expected.dimension_error`, `expected ${expectedCase.expected.dimension_error}, received ${dimensionError}`)
      }
      continue
    }
    if (dimensionError !== null) {
      fail(`${casePath}.dimensions`, dimensionError)
      continue
    }

    // Render AGENTS with dimension sections + condition-derived capability body.
    let agentsRendered
    let unresolvedAgents = 0
    let unbalancedAgents = 0
    try {
      const balanced = validateBalancedConditions(agentsBase)
      if (!balanced.ok) unbalancedAgents += 1
      const withDimensions = agentsBase.replace('{{DIMENSION_SECTIONS}}', dimensionSections)
      agentsRendered = renderContractFixture(withDimensions, conditions, scalars)
    } catch (error) {
      unresolvedAgents += 1
      fail(`${casePath}.agents`, error.message)
    }

    // Render constitution: base + concatenated dim sections for selected dimensions.
    let constitutionRendered
    let unresolvedConstitution = 0
    try {
      const fullConstitution = `${constitutionBase}\n\n${constitutionDimensionSections}`.trimEnd()
      constitutionRendered = renderContractFixture(fullConstitution, conditions, scalars)
    } catch (error) {
      unresolvedConstitution += 1
      fail(`${casePath}.constitution`, error.message)
    }

    const exp = expectedCase.expected
    const compareCount = (actual, expected, field) => {
      if (expected !== undefined && actual !== expected) {
        fail(`${casePath}.expected.${field}`, `expected ${expected}, received ${actual}`)
      }
    }

    if (exp.unresolved_tokens !== undefined) {
      compareCount(unresolvedAgents + unresolvedConstitution, exp.unresolved_tokens, 'unresolved_tokens')
    }
    if (exp.unbalanced_conditions !== undefined) {
      compareCount(unbalancedAgents, exp.unbalanced_conditions, 'unbalanced_conditions')
    }

    if (exp.mutex_red_lines !== undefined && constitutionRendered !== undefined) {
      const count = (constitutionRendered.match(/Superpowers 与 OpenSpec 互斥/g) ?? []).length
      compareCount(count, exp.mutex_red_lines, 'mutex_red_lines')
    }

    if (exp.agents_has_mutex_body !== undefined && agentsRendered !== undefined) {
      const has = /Superpowers 与 OpenSpec 互斥/.test(agentsRendered)
      if (has !== exp.agents_has_mutex_body) {
        fail(`${casePath}.expected.agents_has_mutex_body`, `expected ${exp.agents_has_mutex_body}, received ${has}`)
      }
    }
    if (exp.agents_mutex_reference_count !== undefined && agentsRendered !== undefined) {
      const count = (agentsRendered.match(/Superpowers 与 OpenSpec 互斥/g) ?? []).length
      if (count !== exp.agents_mutex_reference_count) {
        fail(`${casePath}.expected.agents_mutex_reference_count`, `expected ${exp.agents_mutex_reference_count}, received ${count}`)
      }
    }

    if (exp.agents_has_superpowers_reference !== undefined && agentsRendered !== undefined) {
      const has = /Superpowers/.test(agentsRendered)
      if (has !== exp.agents_has_superpowers_reference) {
        fail(`${casePath}.expected.agents_has_superpowers_reference`, `expected ${exp.agents_has_superpowers_reference}, received ${has}`)
      }
    }
    if (exp.agents_has_openspec_reference !== undefined && agentsRendered !== undefined) {
      const has = /OpenSpec/.test(agentsRendered)
      if (has !== exp.agents_has_openspec_reference) {
        fail(`${casePath}.expected.agents_has_openspec_reference`, `expected ${exp.agents_has_openspec_reference}, received ${has}`)
      }
    }
    if (exp.agents_has_superpowers_reference_in_mutex !== undefined && agentsRendered !== undefined) {
      // Only counts Superpowers mentions inside a mutual-exclusion rule line, which should not exist.
      const mutexLines = agentsRendered.split('\n').filter((line) => /互斥/.test(line))
      const has = mutexLines.some((line) => /Superpowers/.test(line))
      if (has !== exp.agents_has_superpowers_reference_in_mutex) {
        fail(`${casePath}.expected.agents_has_superpowers_reference_in_mutex`, `expected ${exp.agents_has_superpowers_reference_in_mutex}, received ${has}`)
      }
    }
    if (exp.agents_has_openspec_reference_in_mutex !== undefined && agentsRendered !== undefined) {
      const mutexLines = agentsRendered.split('\n').filter((line) => /互斥/.test(line))
      const has = mutexLines.some((line) => /OpenSpec/.test(line))
      if (has !== exp.agents_has_openspec_reference_in_mutex) {
        fail(`${casePath}.expected.agents_has_openspec_reference_in_mutex`, `expected ${exp.agents_has_openspec_reference_in_mutex}, received ${has}`)
      }
    }

    if (exp.dim_sections_under_dimension_facts !== undefined && agentsRendered !== undefined) {
      const hierarchy = extractHeadingHierarchy(agentsRendered)
      const dimFactsIdx = hierarchy.findIndex((h) => h.title.includes('治理维度事实'))
      const capIdx = hierarchy.findIndex((h) => h.title.includes('已确认环境能力'))
      const dimH3s = hierarchy.filter((h) => h.level === 3 && /^(代码结构|数据库|API|部署|运维)$/.test(h.title))
      const allUnder = dimFactsIdx !== -1 && capIdx !== -1 && dimH3s.every((h) => {
        const hIdx = hierarchy.indexOf(h)
        return hIdx > dimFactsIdx && hIdx < capIdx
      })
      if (allUnder !== exp.dim_sections_under_dimension_facts) {
        fail(`${casePath}.expected.dim_sections_under_dimension_facts`, `expected ${exp.dim_sections_under_dimension_facts}, received ${allUnder}`)
      }
    }
    if (exp.capabilities_after_dimensions !== undefined && agentsRendered !== undefined) {
      const hierarchy = extractHeadingHierarchy(agentsRendered)
      const dimFactsIdx = hierarchy.findIndex((h) => h.title.includes('治理维度事实'))
      const capIdx = hierarchy.findIndex((h) => h.title.includes('已确认环境能力'))
      const after = dimFactsIdx !== -1 && capIdx !== -1 && capIdx > dimFactsIdx
      if (after !== exp.capabilities_after_dimensions) {
        fail(`${casePath}.expected.capabilities_after_dimensions`, `expected ${exp.capabilities_after_dimensions}, received ${after}`)
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
  } else if (expected.kind === 'skill-routing-cases') {
    scenarioCount += isObject(expected.cases) ? Object.keys(expected.cases).length : 0
    validateSkillRoutingSuite(expected, suiteName)
  } else if (expected.kind === 'capability-profile-cases') {
    scenarioCount += isObject(expected.cases) ? Object.keys(expected.cases).length : 0
    validateCapabilityProfileSuite(expected, suiteName)
  } else if (expected.kind === 'template-composition-cases') {
    scenarioCount += isObject(expected.cases) ? Object.keys(expected.cases).length : 0
    validateTemplateCompositionSuite(expected, suiteName)
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
