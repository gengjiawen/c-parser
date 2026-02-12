import { useAtom } from 'jotai'
import { examples } from '../examples'
import { lastSelectedExampleAtom } from '../store'

interface HeaderProps {
  onExampleSelect: (code: string) => void
  onShare: () => void
}

export function Header({ onExampleSelect, onShare }: HeaderProps) {
  const [lastSelected, setLastSelected] = useAtom(lastSelectedExampleAtom)

  return (
    <header className="header">
      <span className="header-title">C Parser Playground</span>
      <select
        className="header-select"
        value={lastSelected ?? ''}
        onChange={(e) => {
          const ex = examples.find((x) => x.name === e.target.value)
          if (ex) {
            setLastSelected(ex.name)
            onExampleSelect(ex.code)
          }
        }}
      >
        <option value="" disabled>
          Examples…
        </option>
        {examples.map((ex) => (
          <option key={ex.name} value={ex.name}>
            {ex.name}
          </option>
        ))}
      </select>
      <button className="header-btn" onClick={onShare}>
        Share
      </button>
    </header>
  )
}
