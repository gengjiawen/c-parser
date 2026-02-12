interface ErrorViewProps {
  error: string | null
  elapsed: number | null
}

export function ErrorView({ error, elapsed }: ErrorViewProps) {
  const time = elapsed != null ? `${elapsed.toFixed(1)}ms` : ''

  if (error) {
    return (
      <div className="error-view">
        <div className="error-message">{error}</div>
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
