import type { SourceLocation, SourcePosition } from './nodes'

type AstNodeLike = {
  type: string
  start: number
  end: number
  loc?: SourceLocation
}

function buildLineOffsets(source: string): number[] {
  const offsets = [0]
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      // '\n'
      offsets.push(i + 1)
    }
  }
  return offsets
}

function clampOffset(offset: number, sourceLength: number): number {
  if (!Number.isFinite(offset)) return 0
  if (offset <= 0) return 0
  if (offset >= sourceLength) return sourceLength
  return Math.trunc(offset)
}

function positionFor(offset: number, lineOffsets: number[], sourceLength: number): SourcePosition {
  const clamped = clampOffset(offset, sourceLength)

  // Binary search for the line containing this offset.
  let lo = 0
  let hi = lineOffsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (lineOffsets[mid] <= clamped) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return { line: lo + 1, column: clamped - lineOffsets[lo] }
}

function isAstNodeLike(value: unknown): value is AstNodeLike {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.type === 'string' && typeof obj.start === 'number' && typeof obj.end === 'number'
}

export function normalizeAstLocations(root: unknown, source: string, includeLoc: boolean): void {
  const lineOffsets = includeLoc ? buildLineOffsets(source) : []
  const sourceLength = source.length
  const stack: unknown[] = [root]
  const seen = new Set<object>()

  while (stack.length > 0) {
    const current = stack.pop()
    if (typeof current !== 'object' || current === null) continue
    if (seen.has(current)) continue
    seen.add(current)

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    if (isAstNodeLike(current)) {
      if (includeLoc) {
        current.loc = {
          start: positionFor(current.start, lineOffsets, sourceLength),
          end: positionFor(current.end, lineOffsets, sourceLength),
        }
      } else {
        delete current.loc
      }
    }

    for (const value of Object.values(current)) {
      if (typeof value === 'object' && value !== null) {
        stack.push(value)
      }
    }
  }
}
