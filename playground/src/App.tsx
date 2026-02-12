import { useState, useEffect, useRef, useCallback } from 'react'
import { useAtom } from 'jotai'
import { Header } from './components/Header'
import { EditorPanel, EditorHandle } from './components/EditorPanel'
import { ResultPanel } from './components/ResultPanel'
import { AstTreeView } from './components/AstTreeView'
import { ErrorView } from './components/ErrorView'
import { useParser } from './hooks/useParser'
import { examples } from './examples'
import { lastSelectedExampleAtom } from './store'

function decodeHash(): string | null {
  try {
    const hash = location.hash.slice(1)
    if (!hash) return null
    const params = new URLSearchParams(hash)
    const code = params.get('code')
    if (!code) return null
    return decodeURIComponent(atob(code))
  } catch {
    return null
  }
}

function encodeHash(source: string): string {
  return `#code=${btoa(encodeURIComponent(source))}`
}

export function App() {
  const [lastSelected] = useAtom(lastSelectedExampleAtom)
  const [source, setSource] = useState(() => decodeHash() ?? examples[0].code)
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null)
  const { ast, error, elapsed, doParse } = useParser()
  const editorRef = useRef<EditorHandle>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const hasLoadedFromStorageRef = useRef(false)

  useEffect(() => {
    if (hasLoadedFromStorageRef.current) return
    if (decodeHash()) {
      hasLoadedFromStorageRef.current = true
      return
    }
    if (lastSelected) {
      const ex = examples.find((x) => x.name === lastSelected)
      if (ex) {
        setSource(ex.code)
      }
      hasLoadedFromStorageRef.current = true
    }
  }, [lastSelected])

  // Debounced parse
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      doParse(source, { gnuExtensions: true })
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [source, doParse])

  const handleNodeSelect = useCallback((start: number, end: number) => {
    editorRef.current?.highlightRange(start, end)
  }, [])

  const handleShare = useCallback(() => {
    const hash = encodeHash(source)
    history.replaceState(null, '', hash)
    navigator.clipboard.writeText(location.href).catch(() => {})
  }, [source])

  const handleExampleSelect = useCallback((code: string) => {
    setSource(code)
  }, [])

  return (
    <div className="app">
      <Header
        onExampleSelect={handleExampleSelect}
        onShare={handleShare}
      />
      <div className="panels">
        <EditorPanel
          ref={editorRef}
          value={source}
          onChange={setSource}
          onSelectionChange={setSelection}
        />
        <ResultPanel
          hasError={error != null}
          astContent={
            ast ? (
              <AstTreeView data={ast} selection={selection} onNodeSelect={handleNodeSelect} />
            ) : error ? (
              <div className="ast-placeholder">Parse error — see Errors tab</div>
            ) : (
              <div className="ast-placeholder">Parsing…</div>
            )
          }
          errorContent={<ErrorView error={error} elapsed={elapsed} />}
        />
      </div>
    </div>
  )
}
