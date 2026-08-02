// Presumed-line bookkeeping for the dynamic predefined macros: __LINE__ and
// __FILE__ need the 1-based line number (and presentation file name) of a
// source offset, adjusted by the #line directives seen so far in stream
// order (C11 6.10.4).

export interface LineOverride {
  // Stream offset from which this override applies: the end of the #line
  // directive's own logical line.
  offset: number
  // The line number the next physical line after `offset` presents as.
  line: number
  file: string | null
}

export class LineMap {
  private starts: number[] | null = null
  private overrides: LineOverride[] = []

  constructor(private source: string) {}

  private lineStarts(): number[] {
    if (this.starts === null) {
      const starts = [0]
      const src = this.source
      for (let i = 0; i < src.length; i++) {
        const c = src.charCodeAt(i)
        if (c === 0x0a /* \n */) {
          starts.push(i + 1)
        } else if (c === 0x0d /* \r */) {
          if (i + 1 < src.length && src.charCodeAt(i + 1) === 0x0a) i++
          starts.push(i + 1)
        }
      }
      this.starts = starts
    }
    return this.starts
  }

  /** 1-based physical line of a source offset. */
  physicalLine(offset: number): number {
    const starts = this.lineStarts()
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  /**
   * Record a #line directive. A null `file` keeps the name from the
   * previous override (#line without a file name does not change the
   * presumed file). Offsets arrive in stream order, so the list stays
   * sorted by construction.
   */
  addOverride(offset: number, line: number, file: string | null): void {
    if (file === null) {
      const prev = this.overrides[this.overrides.length - 1]
      if (prev !== undefined) file = prev.file
    }
    this.overrides.push({ offset, line, file })
  }

  private overrideAt(offset: number): LineOverride | null {
    const ovs = this.overrides
    let lo = -1
    let hi = ovs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ovs[mid].offset <= offset) lo = mid
      else hi = mid - 1
    }
    return lo >= 0 ? ovs[lo] : null
  }

  /** Presumed (#line-adjusted) line number of an offset. */
  lineAt(offset: number): number {
    const ov = this.overrideAt(offset)
    if (ov === null) return this.physicalLine(offset)
    // ov.line names the line following the directive, whose own line ends
    // at ov.offset.
    return ov.line + this.physicalLine(offset) - this.physicalLine(ov.offset) - 1
  }

  /** Presumed file name of an offset, or the default when never set. */
  fileAt(offset: number, dflt: string): string {
    const ov = this.overrideAt(offset)
    return ov !== null && ov.file !== null ? ov.file : dflt
  }
}

/** Everything the expander needs to compute a dynamic predefined macro. */
export interface BuiltinState {
  lines: LineMap
  fileName: string
  counter: number
}
