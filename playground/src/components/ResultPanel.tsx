import { useState } from 'react'

interface ResultPanelProps {
  astContent: React.ReactNode
  errorContent: React.ReactNode
  errorCount: number
  warningCount: number
}

export function ResultPanel({ astContent, errorContent, errorCount, warningCount }: ResultPanelProps) {
  const [tab, setTab] = useState<'ast' | 'errors'>('ast')
  const total = errorCount + warningCount
  const badgeClass = errorCount > 0 ? 'has-error' : warningCount > 0 ? 'has-warning' : ''

  return (
    <div className="result-panel">
      <div className="result-tabs">
        <button
          className={`result-tab ${tab === 'ast' ? 'active' : ''}`}
          onClick={() => setTab('ast')}
        >
          AST
        </button>
        <button
          className={`result-tab ${tab === 'errors' ? 'active' : ''} ${badgeClass}`}
          onClick={() => setTab('errors')}
        >
          Errors
          {total > 0 && <span className="tab-badge">{total}</span>}
        </button>
      </div>
      <div className="result-content">{tab === 'ast' ? astContent : errorContent}</div>
    </div>
  )
}
