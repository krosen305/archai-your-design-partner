import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Snapshot } from '../types.ts'

const SNAPSHOTS_DIR = join(import.meta.dir, '..', 'snapshots')

/** Regression-threshold: score-fald over denne grænse = regression */
const REGRESSION_DELTA = 0.1

export function hashOutput(output: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(output))
    .digest('hex')
    .slice(0, 16)
}

function snapshotPath(caseId: string): string {
  return join(SNAPSHOTS_DIR, `${caseId}.snap.json`)
}

export function loadSnapshot(caseId: string): Snapshot | null {
  const path = snapshotPath(caseId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Snapshot
  } catch {
    return null
  }
}

export function saveSnapshot(caseId: string, score: number, output: unknown): void {
  mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  const snap: Snapshot = {
    caseId,
    score,
    timestamp: new Date().toISOString(),
    outputHash: hashOutput(output),
  }
  writeFileSync(snapshotPath(caseId), JSON.stringify(snap, null, 2))
}

export interface RegressionCheck {
  isRegression: boolean
  previous: Snapshot | null
  delta: number
  message: string
}

export function checkRegression(
  caseId: string,
  currentScore: number,
  currentOutput: unknown
): RegressionCheck {
  const prev = loadSnapshot(caseId)

  if (!prev) {
    return {
      isRegression: false,
      previous: null,
      delta: 0,
      message: 'Første kørsel — gemmer snapshot som baseline',
    }
  }

  const delta = prev.score - currentScore
  const outputChanged = hashOutput(currentOutput) !== prev.outputHash

  if (delta > REGRESSION_DELTA) {
    return {
      isRegression: true,
      previous: prev,
      delta,
      message: `REGRESSION: Score faldet ${(delta * 100).toFixed(1)}pp (${(prev.score * 100).toFixed(0)}% → ${(currentScore * 100).toFixed(0)}%)`,
    }
  }

  if (outputChanged && delta > 0) {
    return {
      isRegression: false,
      previous: prev,
      delta,
      message: `Output ændret men score OK (delta: ${(delta * 100).toFixed(1)}pp)`,
    }
  }

  return {
    isRegression: false,
    previous: prev,
    delta,
    message: `Score stabilt (prev: ${(prev.score * 100).toFixed(0)}%, current: ${(currentScore * 100).toFixed(0)}%)`,
  }
}
