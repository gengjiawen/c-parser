import { useState } from 'react'

interface ResultPanelProps {
  astContent: React.ReactNode
  errorContent: React.ReactNode
  hasError: boolean
}

export function ResultPanel({ astContent, errorContent, hasError }: ResultPanelProps) {
  const [tab, setTab] = useState<'ast' | 'errors'>('ast')

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
          className={`result-tab ${tab === 'errors' ? 'active' : ''} ${hasError ? 'has-error' : ''}`}
          onClick={() => setTab('errors')}
        >
          Errors
        </button>
      </div>
      <div className="result-content">{tab === 'ast' ? astContent : errorContent}</div>
    </div>
  )
}
