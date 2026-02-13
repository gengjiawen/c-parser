#!/usr/bin/env node
/**
 * Generate playground/src/examples.ts from fixtures/*.c
 *
 * Usage: node scripts/sync-examples.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'fixtures')
const outFile = join(root, 'playground', 'src', 'examples.ts')

const SKIP = new Set(['quickjs-amalgam.c'])

/** filename → display name (order matters) */
const NAME_MAP = {
  'basic.c': 'Basic',
  'control-flow.c': 'Control Flow',
  'types.c': 'Types & Structs',
  'c11-features.c': 'C11 Features',
  'declarators.c': 'Declarators',
  'gcc-extensions.c': 'GCC Extensions',
  'realistic.c': 'Hash Map',
}

const files = Object.keys(NAME_MAP).filter((f) => {
  // verify the fixture actually exists
  try {
    readFileSync(join(fixturesDir, f))
    return true
  } catch {
    console.warn(`warning: ${f} not found in fixtures/, skipping`)
    return false
  }
})

// check for new fixtures not in NAME_MAP
for (const f of readdirSync(fixturesDir)) {
  if (!f.endsWith('.c') || SKIP.has(f)) continue
  if (!NAME_MAP[f]) {
    console.error(`error: ${f} has no entry in NAME_MAP, please add one`)
    process.exit(1)
  }
}

const entries = files.map((f) => {
  const code = readFileSync(join(fixturesDir, f), 'utf8').replace(/\n$/, '')
  // escape backticks and ${} for template literal
  const escaped = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `  {\n    name: '${NAME_MAP[f]}',\n    code: \`\\\n${escaped}\n\`,\n  }`
})

const output = `\
/**
 * DO NOT EDIT — generated from fixtures/*.c by scripts/sync-examples.js
 * Edit source fixtures or NAME_MAP instead.
 */
export interface Example {
  name: string
  code: string
}

export const examples: Example[] = [
${entries.join(',\n')},
]
`

writeFileSync(outFile, output)
console.log(`wrote ${basename(outFile)} (${files.length} examples)`)
