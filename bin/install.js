#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'generate-governance'
const REQUIRED_ITEMS = ['skill.md', 'workflow-analyze.js', 'templates', 'README.md', 'LICENSE']

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')

function usage() {
  return `Usage:
  generate-governance-skill install [options]

Options:
  --target <path>   Install into a skills directory or an existing skill directory.
                    Default: ~/.agents/skills
  --project <path>  Install into <path>/.agents/skills/generate-governance.
  --codex           Install into ~/.codex/skills/generate-governance.
  --force           Replace an existing installation.
  --dry-run         Print the planned install without writing files.
  -h, --help        Show this help.
`
}

function parseArgs(argv) {
  const args = {
    command: 'install',
    target: null,
    project: null,
    codex: false,
    force: false,
    dryRun: false,
    help: false,
  }

  const rest = [...argv]
  if (rest[0] && !rest[0].startsWith('-')) {
    args.command = rest.shift()
  }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--target') {
      args.target = requireValue(rest, ++i, '--target')
    } else if (arg === '--project') {
      args.project = requireValue(rest, ++i, '--project')
    } else if (arg === '--codex') {
      args.codex = true
    } else if (arg === '--force') {
      args.force = true
    } else if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '-h' || arg === '--help') {
      args.help = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return args
}

function requireValue(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a path value`)
  }
  return value
}

function expandHome(inputPath) {
  if (inputPath === '~') return os.homedir()
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2))
  return inputPath
}

function resolveDestination(args) {
  if (args.project && (args.target || args.codex)) {
    throw new Error('Use only one of --project, --target, or --codex')
  }
  if (args.target && args.codex) {
    throw new Error('Use only one of --target or --codex')
  }

  if (args.project) {
    return path.resolve(expandHome(args.project), '.agents', 'skills', SKILL_NAME)
  }

  const baseTarget = args.codex
    ? path.join(os.homedir(), '.codex', 'skills')
    : path.resolve(expandHome(args.target ?? path.join(os.homedir(), '.agents', 'skills')))

  return path.basename(baseTarget) === SKILL_NAME ? baseTarget : path.join(baseTarget, SKILL_NAME)
}

function ensurePackageShape() {
  for (const item of REQUIRED_ITEMS) {
    const source = path.join(packageRoot, item)
    if (!fs.existsSync(source)) {
      throw new Error(`Package is missing required item: ${item}`)
    }
  }
}

function removeExisting(destination) {
  fs.rmSync(destination, { recursive: true, force: true })
}

function copyItem(source, destination) {
  const stat = fs.statSync(source)
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true })
    for (const entry of fs.readdirSync(source)) {
      copyItem(path.join(source, entry), path.join(destination, entry))
    }
  } else {
    fs.copyFileSync(source, destination)
  }
}

function install(args) {
  ensurePackageShape()
  const destination = resolveDestination(args)
  const exists = fs.existsSync(destination)

  if (args.dryRun) {
    console.log(`Would install ${SKILL_NAME} to ${destination}`)
    console.log(`Existing installation: ${exists ? 'yes' : 'no'}`)
    console.log(`Force overwrite: ${args.force ? 'yes' : 'no'}`)
    return
  }

  if (exists && !args.force) {
    throw new Error(`Destination already exists: ${destination}\nRe-run with --force to replace it.`)
  }

  if (exists) {
    removeExisting(destination)
  }

  fs.mkdirSync(destination, { recursive: true })
  for (const item of REQUIRED_ITEMS) {
    copyItem(path.join(packageRoot, item), path.join(destination, item))
  }

  console.log(`Installed ${SKILL_NAME} to ${destination}`)
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      console.log(usage())
      return
    }
    if (args.command !== 'install') {
      throw new Error(`Unknown command: ${args.command}`)
    }
    install(args)
  } catch (error) {
    console.error(error.message)
    console.error('')
    console.error(usage())
    process.exitCode = 1
  }
}

main()
