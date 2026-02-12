import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'

// Decoration for AST→editor highlight
const setHighlight = StateEffect.define<{ from: number; to: number } | null>()

const highlightMark = Decoration.mark({ class: 'cm-ast-highlight' })

const highlightField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decos, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        if (e.value) {
          return Decoration.set([highlightMark.range(e.value.from, e.value.to)])
        }
        return Decoration.none
      }
    }
    if (tr.docChanged) return Decoration.none
    return decos
  },
  provide: (f) => EditorView.decorations.from(f),
})

const highlightTheme = EditorView.baseTheme({
  '.cm-ast-highlight': {
    backgroundColor: 'rgba(203, 166, 247, 0.18)',
    borderBottom: '1.5px solid rgba(203, 166, 247, 0.5)',
  },
})

export interface EditorHandle {
  highlightRange: (from: number, to: number) => void
}

interface EditorPanelProps {
  value: string
  onChange: (value: string) => void
  onSelectionChange?: (selection: { from: number; to: number }) => void
}

export const EditorPanel = forwardRef<EditorHandle, EditorPanelProps>(
  function EditorPanel({ value, onChange, onSelectionChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const onSelectionRef = useRef(onSelectionChange)
    onChangeRef.current = onChange
    onSelectionRef.current = onSelectionChange

    useImperativeHandle(ref, () => ({
      highlightRange(from: number, to: number) {
        const view = viewRef.current
        if (!view) return
        const len = view.state.doc.length
        const a = Math.min(from, len)
        const b = Math.min(to, len)
        view.dispatch({
          effects: setHighlight.of({ from: a, to: b }),
          scrollIntoView: true,
        })
      },
    }))

    useEffect(() => {
      if (!containerRef.current) return

      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          oneDark,
          cpp(),
          highlightField,
          highlightTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main
              onSelectionRef.current?.({ from, to })
            }
          }),
        ],
      })

      const view = new EditorView({ state, parent: containerRef.current })
      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current !== value) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        })
      }
    }, [value])

    return <div ref={containerRef} className="editor-panel" />
  },
)
