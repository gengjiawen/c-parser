// Public API for the C parser.
// Usage: import { parse } from 'c-parser-ts';

import { Scanner } from './lexer/scanner'
import { Token, TokenKind } from './lexer/token'
import { Parser } from './parser/parser'
import * as AST from './ast/nodes'
import { normalizeAstLocations } from './ast/locations'

// Import all parser extensions to register prototype methods
import './parser/expressions'
import './parser/types'
import './parser/statements'
import './parser/declarations'
import './parser/declarators'

export interface ParseOptions {
  gnuExtensions?: boolean
  // Compute loc { line, column } for each node on demand. Default: false.
  loc?: boolean
}

export function parse(source: string, options?: ParseOptions): AST.TranslationUnit {
  const gnuExtensions = options?.gnuExtensions ?? true
  const includeLoc = options?.loc ?? false
  const scanner = new Scanner(source, gnuExtensions)
  const tokens = scanner.scan()
  const parser = new Parser(tokens)
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

  const ast: AST.TranslationUnit = {
    type: 'TranslationUnit',
    decls,
    start: 0,
    end: source.length,
  }

  normalizeAstLocations(ast, source, includeLoc)
  return ast
}

// Re-export types for consumers
export { AST }
export type { TokenKind, Token } from './lexer/token'
export { Scanner } from './lexer/scanner'
export { Parser } from './parser/parser'
