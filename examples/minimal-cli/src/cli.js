#!/usr/bin/env node

const args = process.argv.slice(2)

if (args.includes('--check')) {
  console.log('ok')
} else {
  console.log('minimal-cli-fixture')
}
