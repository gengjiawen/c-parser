// Macro table: #define/#undef bookkeeping with C11 redefinition semantics.

import { Token, TokenFlags } from '../lexer/token'
import { spellingOf } from './directives'

export interface MacroDef {
  name: string
  functionLike: boolean
  // Parameter names in order; when variadic, the last name receives the
  // trailing arguments ('__VA_ARGS__' for a standard `...`).
  params: string[]
  variadic: boolean
  // Replacement tokens with their original source spans. Spelling reads
  // depend on these spans; expansion clones get remapped spans, the stored
  // body never does.
  body: Token[]
  nameToken: Token
}

export type DefineStatus = 'defined' | 'same' | 'redefined'

export class MacroTable {
  private map = new Map<string, MacroDef>()

  get(name: string): MacroDef | undefined {
    return this.map.get(name)
  }

  isDefined(name: string): boolean {
    return this.map.has(name)
  }

  /**
   * Register a definition. An identical redefinition (C11 6.10.3p2) is
   * silently accepted ('same'); a different one replaces the old definition
   * and reports 'redefined' so the caller can warn — GCC's default behavior,
   * which real code (X-macro tables redefining DEF/BREAK/CASE) relies on.
   */
  define(def: MacroDef, source: string): DefineStatus {
    const prev = this.map.get(def.name)
    this.map.set(def.name, def)
    if (prev === undefined) return 'defined'
    return macroDefsEqual(prev, def, source) ? 'same' : 'redefined'
  }

  undef(name: string): boolean {
    return this.map.delete(name)
  }

  entries(): IterableIterator<[string, MacroDef]> {
    return this.map.entries()
  }

  get size(): number {
    return this.map.size
  }
}

/**
 * C11 6.10.3p1-2 identity: same kind of macro, identical parameter spellings,
 * and replacement lists that match token-for-token in spelling, where any
 * white-space separation counts the same but presence vs. absence differs.
 */
export function macroDefsEqual(a: MacroDef, b: MacroDef, source: string): boolean {
  if (a.functionLike !== b.functionLike || a.variadic !== b.variadic) return false
  if (a.params.length !== b.params.length) return false
  for (let i = 0; i < a.params.length; i++) {
    if (a.params[i] !== b.params[i]) return false
  }
  if (a.body.length !== b.body.length) return false
  for (let i = 0; i < a.body.length; i++) {
    const ta = a.body[i]
    const tb = b.body[i]
    if (ta.kind !== tb.kind) return false
    if (spellingOf(ta, source) !== spellingOf(tb, source)) return false
    if (i > 0) {
      const sa = ((ta.flags ?? 0) & TokenFlags.SpaceBefore) !== 0
      const sb = ((tb.flags ?? 0) & TokenFlags.SpaceBefore) !== 0
      if (sa !== sb) return false
    }
  }
  return true
}
