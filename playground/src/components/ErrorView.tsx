import { useMemo } from 'react'
import type { Diagnostic } from '../worker/protocol'

interface ErrorViewProps {
  // A thrown parser exception (parser bug); recovered syntax/preprocessor
  // problems arrive as diagnostics instead.
  error: string | null
  diagnostics: Diagnostic[]
  source: string
  elapsed: number | null
  onDiagnosticClick?: (d: Diagnostic) => void
}

export function ErrorView({ error, diagnostics, source, elapsed, onDiagnosticClick }: ErrorViewProps) {
  const time = elapsed != null ? `${elapsed.toFixed(1)}ms` : ''

  // Offsets of each line start, for offset → line:col display.
  const lineStarts = useMemo(() => {
    const starts = [0]
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) starts.push(i + 1)
    }
    return starts
  }, [source])

  const locOf = (offset: number): string => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return `${lo + 1}:${offset - lineStarts[lo] + 1}`
  }

  if (error) {
    return (
      <div className="error-view">
        <div className="error-message">{error}</div>
        {time && <div className="error-elapsed">Parsed in {time}</div>}
      </div>
    )
  }

  if (diagnostics.length > 0) {
    return (
      <div className="error-view">
        <ul className="diag-list">
          {diagnostics.map((d, i) => (
            <li
              key={i}
              className="diag-item"
              onClick={() => onDiagnosticClick?.(d)}
              title="Click to highlight in the editor"
            >
              <span className={`diag-sev diag-sev-${d.severity}`}>{d.severity}</span>
              <span className="diag-loc">{locOf(d.start)}</span>
              <span className="diag-phase">{d.phase}</span>
              <span className="diag-msg">{d.message}</span>
            </li>
          ))}
        </ul>
        {time && <div className="error-elapsed">Parsed in {time}</div>}
      </div>
    )
  }

  return (
    <div className="error-view success">
      <div className="error-ok">Parsed successfully</div>
      {time && <div className="error-elapsed">{time}</div>}
    </div>
  )
}
