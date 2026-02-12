// Public API for the C parser.
// Usage: import { parse } from 'c-parser-ts';

import { Scanner } from './lexer/scanner'
import { Token, TokenKind } from './lexer/token'
import { Parser } from './parser/parser'
import * as AST from './ast/nodes'

// Import all parser extensions to register prototype methods
import './parser/expressions'
import './parser/types'
import './parser/statements'
import './parser/declarations'
import './parser/declarators'

export interface ParseOptions {
  gnuExtensions?: boolean
}

export function parse(source: string, options?: ParseOptions): AST.TranslationUnit {
  const gnuExtensions = options?.gnuExtensions ?? true
  const scanner = new Scanner(source, gnuExtensions)
  const tokens = scanner.scan()
  const parser = new Parser(tokens)

  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  const decls: AST.ExternalDeclaration[] = []

  while (!parser.atEof()) {
    const decl = parser.parseExternalDecl()
    if (decl !== null) {
      decls.push(decl)
    } else {
      // Skip unrecognized token to avoid infinite loop
      if (!parser.atEof()) {
        parser.advance()
      }
    }
  }

  return {
    type: 'TranslationUnit',
    decls,
    start: 0,
    end: source.length,
    loc,
  }
}

// Re-export types for consumers
export { AST }
export type { TokenKind, Token } from './lexer/token'
export { Scanner } from './lexer/scanner'
export { Parser } from './parser/parser'
