// Statement parsing: all C statement types including inline assembly.
//
// Handles: return, if/else, while, do-while, for, switch/case/default,
// break, continue, goto (including computed goto), labels, compound
// statements, and inline assembly (GCC syntax).

import { Parser, ATTR_CONST } from './parser'
import { TokenKind } from '../lexer/token'
import * as AST from '../ast/nodes'

// Extend Parser prototype
declare module './parser' {
  interface Parser {
    parseCompoundStmt(): AST.CompoundStatement
    parseStmt(): AST.Statement
    parseForStmt(): AST.Statement
    parseInlineAsm(): AST.Statement
    parseAsmString(): string
    parseAsmOperands(): AST.AsmOperand[]
    parseOneAsmOperand(): AST.AsmOperand
    parseAsmClobbers(): string[]
    parseAsmGotoLabels(): string[]
  }
}

// === parseCompoundStmt ===
// Parse a compound statement (block) with { }. Handles typedef shadowing save/restore,
// attr flags save/restore, __label__ declarations, pragma pack/visibility,
// _Static_assert, local declarations, and statements.
Parser.prototype.parseCompoundStmt = function (this: Parser): AST.CompoundStatement {
  const open = this.peekSpan()
  this.expect(TokenKind.LBrace)
  const items: AST.BlockItem[] = []
  const localLabels: string[] = []

  // Save typedef shadowing state for this scope
  const savedShadowed = new Set(this.shadowedTypedefs)

  // Save declaration attribute flags so that storage-class specifiers
  // from declarations inside this compound statement do not leak
  const savedAttrFlags = this.saveAttrFlags()

  // Parse GNU __label__ declarations at the start of the block.
  // These must appear before any statements or declarations.
  while (this.peek() === TokenKind.GnuLabel) {
    this.advance() // consume __label__
    // Parse comma-separated list of label names
    while (true) {
      if (this.peek() === TokenKind.Identifier) {
        const name = (this.peekValue() as string) ?? ''
        localLabels.push(name)
        this.advance()
      }
      if (!this.consumeIf(TokenKind.Comma)) {
        break
      }
    }
    this.expectAfter(TokenKind.Semicolon, 'after __label__ declaration')
  }

  while (this.peek() !== TokenKind.RBrace && this.peek() !== TokenKind.Eof) {
    this.skipGccExtensions()

    // Handle #pragma pack directives within function bodies
    while (this.handlePragmaPackToken()) {
      this.consumeIf(TokenKind.Semicolon)
    }

    // Handle #pragma GCC visibility push/pop within function bodies
    while (this.handlePragmaVisibilityToken()) {
      this.consumeIf(TokenKind.Semicolon)
    }

    if (this.peek() === TokenKind.RBrace || this.peek() === TokenKind.Eof) {
      break
    }

    // Handle __label__ declarations that appear after __extension__
    if (this.peek() === TokenKind.GnuLabel) {
      this.advance()
      while (true) {
        if (this.peek() === TokenKind.Identifier) {
          const name = (this.peekValue() as string) ?? ''
          localLabels.push(name)
          this.advance()
        }
        if (!this.consumeIf(TokenKind.Comma)) {
          break
        }
      }
      this.expectAfter(TokenKind.Semicolon, 'after __label__ declaration')
      continue
    }

    if (this.peek() === TokenKind.StaticAssert) {
      this.parseStaticAssert()
    } else if (this.isTypeSpecifier() && !this.isTypedefLabel()) {
      const decl = this.parseLocalDeclaration()
      if (decl !== null) {
        items.push(decl)
      }
    } else {
      const stmt = this.parseStmt()
      items.push(stmt)
    }
  }

  this.expectClosing(TokenKind.RBrace, open)
  this.shadowedTypedefs = savedShadowed
  this.restoreAttrFlags(savedAttrFlags)

  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  return {
    type: 'CompoundStatement',
    items,
    localLabels,
    start: open.start,
    end: open.end,
    loc,
  }
}

// === parseStmt ===
// Dispatches on token kind to all statement types. Handles C23 declarations
// in statement position.
Parser.prototype.parseStmt = function (this: Parser): AST.Statement {
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

  // C23 / GNU extension: declarations are allowed in statement position.
  this.skipGccExtensions()
  if (this.isTypeSpecifier() && !this.isTypedefLabel()) {
    const decl = this.parseLocalDeclaration()
    if (decl !== null) {
      return {
        type: 'DeclarationStatement',
        declaration: decl,
        start: decl.start,
        end: decl.end,
        loc,
      }
    }
    // If parseLocalDeclaration returns null (e.g. _Static_assert),
    // fall through to parse a null statement
    return { type: 'ExpressionStatement', expr: null, start: 0, end: 0, loc }
  }

  switch (this.peek()) {
    case TokenKind.Return: {
      const span = this.peekSpan()
      this.advance()
      let expr: AST.Expression | null = null
      if (this.peek() !== TokenKind.Semicolon) {
        expr = this.parseExpr()
      }
      this.expectAfter(TokenKind.Semicolon, 'after return statement')
      return { type: 'ReturnStatement', expr, start: span.start, end: span.end, loc }
    }

    case TokenKind.If: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after 'if'")
      const cond = this.parseExpr()
      this.expectClosing(TokenKind.RParen, open)
      const thenStmt = this.parseStmt()
      let elseStmt: AST.Statement | null = null
      if (this.consumeIf(TokenKind.Else)) {
        elseStmt = this.parseStmt()
      }
      return {
        type: 'IfStatement',
        condition: cond,
        consequent: thenStmt,
        alternate: elseStmt,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.While: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after 'while'")
      const cond = this.parseExpr()
      this.expectClosing(TokenKind.RParen, open)
      const body = this.parseStmt()
      return {
        type: 'WhileStatement',
        condition: cond,
        body,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Do: {
      const span = this.peekSpan()
      this.advance()
      const body = this.parseStmt()
      this.expectAfter(TokenKind.While, 'at end of do-while statement')
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after 'while'")
      const cond = this.parseExpr()
      this.expectClosing(TokenKind.RParen, open)
      this.expectAfter(TokenKind.Semicolon, 'after do-while statement')
      return {
        type: 'DoWhileStatement',
        body,
        condition: cond,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.For:
      return this.parseForStmt()

    case TokenKind.LBrace: {
      const compound = this.parseCompoundStmt()
      return compound
    }

    case TokenKind.Break: {
      const span = this.peekSpan()
      this.advance()
      this.expectAfter(TokenKind.Semicolon, 'after break statement')
      return { type: 'BreakStatement', start: span.start, end: span.end, loc }
    }

    case TokenKind.Continue: {
      const span = this.peekSpan()
      this.advance()
      this.expectAfter(TokenKind.Semicolon, 'after continue statement')
      return { type: 'ContinueStatement', start: span.start, end: span.end, loc }
    }

    case TokenKind.Switch: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after 'switch'")
      const expr = this.parseExpr()
      this.expectClosing(TokenKind.RParen, open)
      const body = this.parseStmt()
      return {
        type: 'SwitchStatement',
        discriminant: expr,
        body,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Case: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseExpr()
      if (this.consumeIf(TokenKind.Ellipsis)) {
        // GNU case range extension: case low ... high:
        const high = this.parseExpr()
        this.expectContext(TokenKind.Colon, "after 'case' expression")
        const stmt = this.parseStmt()
        return {
          type: 'CaseRangeStatement',
          low: expr,
          high,
          body: stmt,
          start: span.start,
          end: span.end,
          loc,
        }
      }
      this.expectContext(TokenKind.Colon, "after 'case' expression")
      const stmt = this.parseStmt()
      return {
        type: 'CaseStatement',
        test: expr,
        body: stmt,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Default: {
      const span = this.peekSpan()
      this.advance()
      this.expectContext(TokenKind.Colon, "after 'default'")
      const stmt = this.parseStmt()
      return {
        type: 'DefaultStatement',
        body: stmt,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Goto: {
      const span = this.peekSpan()
      this.advance()
      if (this.peek() === TokenKind.Star) {
        // Computed goto: goto *expr;
        this.advance()
        const expr = this.parseExpr()
        this.expectAfter(TokenKind.Semicolon, 'after goto statement')
        return {
          type: 'GotoIndirectStatement',
          expr,
          start: span.start,
          end: span.end,
          loc,
        }
      }
      let label = ''
      if (this.peek() === TokenKind.Identifier) {
        label = (this.peekValue() as string) ?? ''
        this.advance()
      }
      this.expectAfter(TokenKind.Semicolon, 'after goto statement')
      return {
        type: 'GotoStatement',
        label,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Identifier: {
      const nameVal = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      // Check for label (identifier followed by colon)
      if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].kind === TokenKind.Colon) {
        this.advance() // identifier
        this.advance() // colon
        // Skip optional label attributes
        this.skipLabelAttributes()
        const stmt = this.parseStmt()
        return {
          type: 'LabelStatement',
          label: nameVal,
          body: stmt,
          start: span.start,
          end: span.end,
          loc,
        }
      }
      const expr = this.parseExpr()
      this.expectAfter(TokenKind.Semicolon, 'after expression')
      return {
        type: 'ExpressionStatement',
        expr,
        start: span.start,
        end: span.end,
        loc,
      }
    }

    case TokenKind.Asm:
      return this.parseInlineAsm()

    case TokenKind.Semicolon: {
      const span = this.peekSpan()
      this.advance()
      return { type: 'ExpressionStatement', expr: null, start: span.start, end: span.end, loc }
    }

    default: {
      const span = this.peekSpan()
      const expr = this.parseExpr()
      this.expectAfter(TokenKind.Semicolon, 'after expression')
      return {
        type: 'ExpressionStatement',
        expr,
        start: span.start,
        end: span.end,
        loc,
      }
    }
  }
}

// === parseForStmt ===
// Parse a for loop with declaration or expression init.
Parser.prototype.parseForStmt = function (this: Parser): AST.Statement {
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  const span = this.peekSpan()
  this.advance() // consume 'for'

  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, "after 'for'")

  // Save typedef shadowing for the for-init scope (C99 for-scope)
  const savedShadowed = new Set(this.shadowedTypedefs)
  const savedAttrFlags = this.saveAttrFlags()

  // Parse init: either a declaration or an expression
  let init: AST.ForInit | null = null
  if (this.peek() === TokenKind.Semicolon) {
    // Empty init
    this.advance()
  } else if (this.isTypeSpecifier() && !this.isTypedefLabel()) {
    // Declaration init (e.g., for (int i = 0; ...))
    const decl = this.parseLocalDeclaration()
    if (decl !== null) {
      init = { kind: 'Declaration', declaration: decl }
    }
    // parseLocalDeclaration already consumed the semicolon
  } else {
    // Expression init
    const expr = this.parseExpr()
    init = { kind: 'Expression', expr }
    this.expectAfter(TokenKind.Semicolon, "in 'for' statement")
  }

  // Parse condition
  let condition: AST.Expression | null = null
  if (this.peek() !== TokenKind.Semicolon) {
    condition = this.parseExpr()
  }
  this.expectAfter(TokenKind.Semicolon, "in 'for' statement")

  // Parse update
  let update: AST.Expression | null = null
  if (this.peek() !== TokenKind.RParen) {
    update = this.parseExpr()
  }
  this.expectClosing(TokenKind.RParen, open)

  const body = this.parseStmt()

  // Restore for-init scope
  this.shadowedTypedefs = savedShadowed
  this.restoreAttrFlags(savedAttrFlags)

  return {
    type: 'ForStatement',
    init,
    condition,
    update,
    body,
    start: span.start,
    end: span.end,
    loc,
  }
}

// === parseInlineAsm ===
// Parse GCC extended inline assembly statement.
// Syntax: asm [volatile] [goto] ( template [: outputs [: inputs [: clobbers [: goto-labels]]]] );
Parser.prototype.parseInlineAsm = function (this: Parser): AST.Statement {
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  const span = this.peekSpan()
  this.advance() // consume 'asm'

  // Optional qualifiers: volatile, goto, inline
  let isGoto = false
  while (true) {
    if (this.peek() === TokenKind.Volatile) {
      this.advance()
    } else if (this.peek() === TokenKind.Goto) {
      this.advance()
      isGoto = true
    } else if (this.peek() === TokenKind.Inline) {
      this.advance()
    } else {
      break
    }
  }

  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, "after 'asm'")

  // Parse the asm template string (may be concatenated string literals)
  const template = this.parseAsmString()

  let outputs: AST.AsmOperand[] = []
  let inputs: AST.AsmOperand[] = []
  let clobbers: string[] = []
  let gotoLabels: string[] = []

  // Parse optional sections separated by colons
  if (this.consumeIf(TokenKind.Colon)) {
    // Output operands
    if (this.peek() !== TokenKind.Colon && this.peek() !== TokenKind.RParen) {
      outputs = this.parseAsmOperands()
    }

    if (this.consumeIf(TokenKind.Colon)) {
      // Input operands
      if (this.peek() !== TokenKind.Colon && this.peek() !== TokenKind.RParen) {
        inputs = this.parseAsmOperands()
      }

      if (this.consumeIf(TokenKind.Colon)) {
        // Clobbers
        if (this.peek() !== TokenKind.Colon && this.peek() !== TokenKind.RParen) {
          clobbers = this.parseAsmClobbers()
        }

        if (isGoto && this.consumeIf(TokenKind.Colon)) {
          // Goto labels
          if (this.peek() !== TokenKind.RParen) {
            gotoLabels = this.parseAsmGotoLabels()
          }
        }
      }
    }
  }

  this.expectClosing(TokenKind.RParen, open)
  this.expectAfter(TokenKind.Semicolon, 'after asm statement')

  return {
    type: 'InlineAsmStatement',
    template,
    outputs,
    inputs,
    clobbers,
    gotoLabels,
    start: span.start,
    end: span.end,
    loc,
  }
}

// === parseAsmString ===
// Parse concatenated string literals for asm template.
// GCC allows adjacent string literals to be concatenated:
//   asm("mov %0, %1\n\t" "add %2, %0" : ...)
Parser.prototype.parseAsmString = function (this: Parser): string {
  let result = ''
  while (this.peek() === TokenKind.StringLiteral || this.peek() === TokenKind.WideStringLiteral) {
    const val = this.peekValue()
    if (typeof val === 'string') {
      result += val
    }
    this.advance()
  }
  return result
}

// === parseAsmOperands ===
// Parse a comma-separated list of asm operands.
Parser.prototype.parseAsmOperands = function (this: Parser): AST.AsmOperand[] {
  const operands: AST.AsmOperand[] = []
  while (true) {
    operands.push(this.parseOneAsmOperand())
    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
    // Stop if we hit a colon or closing paren (next section)
    if (this.peek() === TokenKind.Colon || this.peek() === TokenKind.RParen) {
      break
    }
  }
  return operands
}

// === parseOneAsmOperand ===
// Parse a single asm operand: [name] "constraint" (expr)
Parser.prototype.parseOneAsmOperand = function (this: Parser): AST.AsmOperand {
  let name: string | null = null

  // Optional symbolic name: [name]
  if (this.peek() === TokenKind.LBracket) {
    const openBracket = this.peekSpan()
    this.advance() // consume '['
    if (this.peek() === TokenKind.Identifier) {
      name = (this.peekValue() as string) ?? null
      this.advance()
    }
    this.expectClosing(TokenKind.RBracket, openBracket)
  }

  // Constraint string (may be concatenated)
  const constraint = this.parseAsmString()

  // Expression in parentheses
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, 'in asm operand')
  const expr = this.parseExpr()
  this.expectClosing(TokenKind.RParen, open)

  return { name, constraint, expr }
}

// === parseAsmClobbers ===
// Parse a comma-separated list of clobber strings.
Parser.prototype.parseAsmClobbers = function (this: Parser): string[] {
  const clobbers: string[] = []
  while (true) {
    const clobber = this.parseAsmString()
    if (clobber.length > 0) {
      clobbers.push(clobber)
    }
    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
    // Stop if we hit a colon or closing paren (next section)
    if (this.peek() === TokenKind.Colon || this.peek() === TokenKind.RParen) {
      break
    }
  }
  return clobbers
}

// === parseAsmGotoLabels ===
// Parse a comma-separated list of goto label names for asm goto.
Parser.prototype.parseAsmGotoLabels = function (this: Parser): string[] {
  const labels: string[] = []
  while (true) {
    if (this.peek() === TokenKind.Identifier) {
      const name = (this.peekValue() as string) ?? ''
      labels.push(name)
      this.advance()
    } else {
      break
    }
    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
    // Stop if we hit a closing paren
    if (this.peek() === TokenKind.RParen) {
      break
    }
  }
  return labels
}
