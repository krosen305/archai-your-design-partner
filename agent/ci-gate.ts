/**
 * CI QA-gate
 *
 * Læses af deploy.yml: `bun run agent/ci-gate.ts`
 * Afslutter med exit code 1 hvis QA-verdict er 'fail' eller mangler.
 * Ingen verdict (ingen agent-session) → deploy tilladt.
 * Forældet verdict (>2 timer) → deploy tilladt.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { QAVerdict } from './contracts.ts'

const verdictPath = join(process.cwd(), 'agent-traces', 'latest-verdict.json')

if (!existsSync(verdictPath)) {
  console.log('Ingen QA verdict fundet — deploy tilladt (ingen agent-session)')
  process.exit(0)
}

const verdict = JSON.parse(readFileSync(verdictPath, 'utf-8')) as QAVerdict

const verdictAge = Date.now() - new Date(verdict.timestamp).getTime()
const TWO_HOURS = 2 * 60 * 60 * 1000
if (verdictAge > TWO_HOURS) {
  console.log(
    `QA verdict er ${Math.round(verdictAge / 60000)} min gammel — deploy tilladt (forældet)`
  )
  process.exit(0)
}

if (verdict.status === 'pass') {
  console.log('✓ QA PASS — deploy tilladt')
  console.log(
    `  build=${verdict.checks.build}  tests=${verdict.checks.tests}  lint=${verdict.checks.lint}`
  )
  process.exit(0)
}

console.error('✗ QA FAIL — deploy blokeret')
console.error(
  `  build=${verdict.checks.build}  tests=${verdict.checks.tests}  lint=${verdict.checks.lint}`
)
if (verdict.blockers.length > 0) {
  console.error('\nBlockers:')
  verdict.blockers.forEach((b) => console.error(`  ✗ ${b}`))
}
process.exit(1)
