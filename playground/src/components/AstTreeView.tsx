import { useRef, useEffect, useMemo } from 'react'

interface AstTreeViewProps {
  data: unknown
  selection: { from: number; to: number } | null
  onNodeSelect?: (start: number, end: number) => void
}

interface NodeMatch {
  path: string[]
  depth: number
  span: number
}

interface VisitResult {
  best: NodeMatch | null
  start: number
  end: number
}

function isAstNode(value: unknown): value is Record<string, unknown> & { start: number; end: number } {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.type === 'string' && typeof obj.start === 'number' && typeof obj.end === 'number'
}

function isSelectionWithinNode(selFrom: number, selTo: number, nodeStart: number, nodeEnd: number): boolean {
  if (nodeEnd <= nodeStart) return selFrom === selTo && selFrom === nodeStart
  if (selFrom === selTo) {
    return selFrom >= nodeStart && selFrom < nodeEnd
  }
  return selFrom >= nodeStart && selTo <= nodeEnd
}

/** Walk the AST and return the key-path to the deepest node containing the current selection. */
function findNodePathForSelection(data: unknown, from: number, to: number): string[] | null {
  const selFrom = Math.min(from, to)
  const selTo = Math.max(from, to)

  const pickBetter = (a: NodeMatch | null, b: NodeMatch | null): NodeMatch | null => {
    if (!a) return b
    if (!b) return a
    // Primary goal for selection linkage:
    // choose the smallest AST node range that fully covers the selection.
    if (b.span !== a.span) return b.span < a.span ? b : a
    // Secondary tie-breaker: prefer deeper nodes when span is equal.
    if (b.depth !== a.depth) return b.depth > a.depth ? b : a
    return a
  }

  const visit = (value: unknown, path: string[]): VisitResult => {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) {
      return { best: null, start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY }
    }

    if (Array.isArray(value)) {
      let best: NodeMatch | null = null
      let start = Number.POSITIVE_INFINITY
      let end = Number.NEGATIVE_INFINITY
      for (let i = 0; i < value.length; i++) {
        const child = visit(value[i], [...path, String(i)])
        best = pickBetter(best, child.best)
        start = Math.min(start, child.start)
        end = Math.max(end, child.end)
      }
      return { best, start, end }
    }

    const obj = value as Record<string, unknown>
    const astNode = isAstNode(obj)

    let best: NodeMatch | null = null
    let start = astNode ? obj.start : Number.POSITIVE_INFINITY
    let end = astNode ? obj.end : Number.NEGATIVE_INFINITY

    for (const key of Object.keys(obj)) {
      const child = visit(obj[key], [...path, key])
      best = pickBetter(best, child.best)
      start = Math.min(start, child.start)
      end = Math.max(end, child.end)
    }

    if (
      astNode &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      isSelectionWithinNode(selFrom, selTo, start, end)
    ) {
      best = pickBetter(best, {
        path,
        depth: path.length,
        span: Math.max(0, end - start),
      })
    }

    return { best, start, end }
  }

  return visit(data, []).best?.path ?? null
}

export function AstTreeView({ data, selection, onNodeSelect }: AstTreeViewProps) {
  const activePath = useMemo(() => {
    if (selection == null) return null
    return findNodePathForSelection(data, selection.from, selection.to)
  }, [data, selection])
  const pathKey = activePath?.join('.') ?? ''
  const targetRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    targetRef.current?.scrollIntoView({ block: 'nearest' })
  }, [pathKey])

  return (
    <div className="ast-tree">
      <TreeNode
        value={data}
        depth={0}
        activePath={activePath}
        pathIndex={0}
        targetRef={targetRef}
        onNodeSelect={onNodeSelect}
      />
    </div>
  )
}

interface TreeNodeProps {
  label?: string
  value: unknown
  depth: number
  activePath: string[] | null
  pathIndex: number
  targetRef: React.MutableRefObject<HTMLElement | null>
  onNodeSelect?: (start: number, end: number) => void
}

function TreeNode({ label, value, depth, activePath, pathIndex, targetRef, onNodeSelect }: TreeNodeProps) {
  const isTarget = activePath !== null && pathIndex === activePath.length
  const isOnPath = activePath !== null && pathIndex < activePath.length
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  // Imperatively force-open <details> when this node is on the active path.
  // React can't control <details> open state after first render — the browser owns it.
  useEffect(() => {
    if (isOnPath && detailsRef.current) {
      detailsRef.current.open = true
    }
  })

  // Register the target summary for scrollIntoView
  useEffect(() => {
    if (isTarget && summaryRef.current) {
      targetRef.current = summaryRef.current
    }
  })

  if (value === null || value === undefined) {
    return (
      <div className="tree-leaf">
        {label && <span className="tree-key">{label}: </span>}
        <span className="tree-null">null</span>
      </div>
    )
  }

  if (typeof value === 'bigint') {
    return (
      <div className="tree-leaf">
        {label && <span className="tree-key">{label}: </span>}
        <span className="tree-number">{String(value)}n</span>
      </div>
    )
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return (
      <div className="tree-leaf">
        {label && <span className="tree-key">{label}: </span>}
        <span className="tree-number">{String(value)}</span>
      </div>
    )
  }

  if (typeof value === 'string') {
    return (
      <div className="tree-leaf">
        {label && <span className="tree-key">{label}: </span>}
        <span className="tree-string">"{value}"</span>
      </div>
    )
  }

  if (value instanceof Uint8Array) {
    return (
      <div className="tree-leaf">
        {label && <span className="tree-key">{label}: </span>}
        <span className="tree-null">[bytes({value.length})]</span>
      </div>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="tree-leaf">
          {label && <span className="tree-key">{label}: </span>}
          <span className="tree-null">[]</span>
        </div>
      )
    }
    const nextKey = activePath?.[pathIndex]
    return (
      <details ref={detailsRef} open={depth < 2}>
        <summary className="tree-summary">
          {label && <span className="tree-key">{label}: </span>}
          <span className="tree-bracket">[{value.length}]</span>
        </summary>
        <div className="tree-children">
          {value.map((item, i) => {
            const childOnPath = nextKey === String(i)
            return (
              <TreeNode
                key={i}
                label={String(i)}
                value={item}
                depth={depth + 1}
                activePath={childOnPath ? activePath : null}
                pathIndex={childOnPath ? pathIndex + 1 : 0}
                targetRef={targetRef}
                onNodeSelect={onNodeSelect}
              />
            )
          })}
        </div>
      </details>
    )
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    const typeName = typeof obj.type === 'string' ? obj.type : null
    const isAstNode =
      typeName && typeof obj.start === 'number' && typeof obj.end === 'number'

    const handleClick = (e: React.MouseEvent) => {
      if (!isAstNode || !onNodeSelect) return
      e.stopPropagation()
      onNodeSelect(obj.start as number, obj.end as number)
    }

    const nextKey = activePath?.[pathIndex]

    return (
      <details ref={detailsRef} open={depth < 2}>
        <summary
          ref={summaryRef}
          className={`tree-summary ${isAstNode ? 'tree-clickable' : ''} ${isTarget ? 'tree-active' : ''}`}
          onClick={handleClick}
        >
          {label && <span className="tree-key">{label}: </span>}
          {typeName ? (
            <span className="tree-type">{typeName}</span>
          ) : (
            <span className="tree-bracket">{`{${keys.length}}`}</span>
          )}
        </summary>
        <div className="tree-children">
          {keys.map((key) => {
            const childOnPath = nextKey === key
            return (
              <TreeNode
                key={key}
                label={key}
                value={obj[key]}
                depth={depth + 1}
                activePath={childOnPath ? activePath : null}
                pathIndex={childOnPath ? pathIndex + 1 : 0}
                targetRef={targetRef}
                onNodeSelect={onNodeSelect}
              />
            )
          })}
        </div>
      </details>
    )
  }

  return (
    <div className="tree-leaf">
      {label && <span className="tree-key">{label}: </span>}
      <span>{String(value)}</span>
    </div>
  )
}
