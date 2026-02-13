import { parse } from '../index'

export default {
  id: 'c-parser-ts',
  displayName: 'C (c-parser-ts)',
  version: '1.0.0',
  showInMenu: true,

  locationProps: new Set(['start', 'end', 'loc']),

  loadParser(callback: (parser: { parse: typeof parse }) => void) {
    callback({ parse })
  },

  parse(
    parser: { parse: typeof parse },
    code: string,
    options?: { gnuExtensions?: boolean; loc?: boolean },
  ) {
    return parser.parse(code, options)
  },

  nodeToRange(node: { start?: number; end?: number }): [number, number] | null {
    if (node.start != null && node.end != null) {
      return [node.start, node.end]
    }
    return null
  },

  getDefaultOptions() {
    return { gnuExtensions: true, loc: false }
  },
}
