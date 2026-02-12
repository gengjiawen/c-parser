// Expression parsing: precedence climbing from comma expression down to primary.
//
// Call hierarchy (loosest to tightest binding):
//   parseExpr -> parseAssignmentExpr -> parseConditionalExpr
//   -> parseBinaryExpr(LogicalOr) -> ... -> parseBinaryExpr(Multiplicative)
//   -> parseCastExpr -> parseUnaryExpr -> parsePostfixExpr
//   -> parsePrimaryExpr

import { Parser, ATTR_CONST, ATTR_TYPEDEF } from './parser'
import { TokenKind } from '../lexer/token'
import * as AST from '../ast/nodes'

// C operator precedence levels (loosest to tightest binding).
const enum PrecedenceLevel {
  LogicalOr,
  LogicalAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseAnd,
  Equality,
  Relational,
  Shift,
  Additive,
  Multiplicative,
}

// Extend Parser prototype
declare module './parser' {
  interface Parser {
    parseExpr(): AST.Expression
    parseAssignmentExpr(): AST.Expression
    parseCastExpr(): AST.Expression
    parseUnaryExpr(): AST.Expression
    parseSizeofExpr(): AST.Expression
    parsePostfixExpr(): AST.Expression
    parsePostfixOps(expr: AST.Expression): AST.Expression
    parsePrimaryExpr(): AST.Expression
    parseGenericSelection(): AST.Expression
    applyPendingVectorAttr(ts: AST.TypeSpecifier): AST.TypeSpecifier
    estimateTypeSize(ts: AST.TypeSpecifier): number
    compoundAssignOp(): AST.BinOp | null
  }
}

const LOC: AST.SourceLocation = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

// === parseExpr ===
// Comma expression (lowest precedence).
Parser.prototype.parseExpr = function (this: Parser): AST.Expression {
  const lhs = this.parseAssignmentExpr()
  if (this.peek() === TokenKind.Comma) {
    const span = this.peekSpan()
    this.advance()
    const rhs = this.parseExpr()
    return {
      type: 'CommaExpression',
      left: lhs,
      right: rhs,
      start: span.start,
      end: span.end,
      loc: LOC,
    }
  }
  return lhs
}

// === parseAssignmentExpr ===
Parser.prototype.parseAssignmentExpr = function (this: Parser): AST.Expression {
  const lhs = parseConditionalExpr.call(this)

  if (this.peek() === TokenKind.Assign) {
    const span = this.peekSpan()
    this.advance()
    const rhs = this.parseAssignmentExpr()
    return {
      type: 'AssignExpression',
      left: lhs,
      right: rhs,
      start: span.start,
      end: span.end,
      loc: LOC,
    }
  }

  const op = this.compoundAssignOp()
  if (op !== null) {
    const span = this.peekSpan()
    this.advance()
    const rhs = this.parseAssignmentExpr()
    return {
      type: 'CompoundAssignExpression',
      operator: op,
      left: lhs,
      right: rhs,
      start: span.start,
      end: span.end,
      loc: LOC,
    }
  }

  return lhs
}

// === compoundAssignOp ===
Parser.prototype.compoundAssignOp = function (this: Parser): AST.BinOp | null {
  switch (this.peek()) {
    case TokenKind.PlusAssign:
      return 'Add'
    case TokenKind.MinusAssign:
      return 'Sub'
    case TokenKind.StarAssign:
      return 'Mul'
    case TokenKind.SlashAssign:
      return 'Div'
    case TokenKind.PercentAssign:
      return 'Mod'
    case TokenKind.AmpAssign:
      return 'BitAnd'
    case TokenKind.PipeAssign:
      return 'BitOr'
    case TokenKind.CaretAssign:
      return 'BitXor'
    case TokenKind.LessLessAssign:
      return 'Shl'
    case TokenKind.GreaterGreaterAssign:
      return 'Shr'
    default:
      return null
  }
}

// === parseConditionalExpr (module-private) ===
function parseConditionalExpr(this: Parser): AST.Expression {
  const cond = parseBinaryExpr.call(this, PrecedenceLevel.LogicalOr)
  if (this.consumeIf(TokenKind.Question)) {
    const span = { start: cond.start, end: cond.end }
    // GNU extension: `cond ? : else_expr` (omitted middle operand)
    if (this.peek() === TokenKind.Colon) {
      this.expectContext(TokenKind.Colon, 'in conditional expression')
      const elseExpr = parseConditionalExpr.call(this)
      return {
        type: 'GnuConditionalExpression',
        condition: cond,
        alternate: elseExpr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    const thenExpr = this.parseExpr()
    this.expectContext(TokenKind.Colon, 'in conditional expression')
    const elseExpr = parseConditionalExpr.call(this)
    return {
      type: 'ConditionalExpression',
      condition: cond,
      consequent: thenExpr,
      alternate: elseExpr,
      start: span.start,
      end: span.end,
      loc: LOC,
    }
  }
  return cond
}

// === tokenToBinop (module-private) ===
function tokenToBinop(token: TokenKind, level: PrecedenceLevel): AST.BinOp | null {
  switch (level) {
    case PrecedenceLevel.LogicalOr:
      return token === TokenKind.PipePipe ? 'LogicalOr' : null
    case PrecedenceLevel.LogicalAnd:
      return token === TokenKind.AmpAmp ? 'LogicalAnd' : null
    case PrecedenceLevel.BitwiseOr:
      return token === TokenKind.Pipe ? 'BitOr' : null
    case PrecedenceLevel.BitwiseXor:
      return token === TokenKind.Caret ? 'BitXor' : null
    case PrecedenceLevel.BitwiseAnd:
      return token === TokenKind.Amp ? 'BitAnd' : null
    case PrecedenceLevel.Equality:
      if (token === TokenKind.EqualEqual) return 'Eq'
      if (token === TokenKind.BangEqual) return 'Ne'
      return null
    case PrecedenceLevel.Relational:
      if (token === TokenKind.Less) return 'Lt'
      if (token === TokenKind.LessEqual) return 'Le'
      if (token === TokenKind.Greater) return 'Gt'
      if (token === TokenKind.GreaterEqual) return 'Ge'
      return null
    case PrecedenceLevel.Shift:
      if (token === TokenKind.LessLess) return 'Shl'
      if (token === TokenKind.GreaterGreater) return 'Shr'
      return null
    case PrecedenceLevel.Additive:
      if (token === TokenKind.Plus) return 'Add'
      if (token === TokenKind.Minus) return 'Sub'
      return null
    case PrecedenceLevel.Multiplicative:
      if (token === TokenKind.Star) return 'Mul'
      if (token === TokenKind.Slash) return 'Div'
      if (token === TokenKind.Percent) return 'Mod'
      return null
  }
}

// === parseBinaryExpr (module-private) ===
// Left-associative binary expression at the given precedence level.
function parseBinaryExpr(this: Parser, level: PrecedenceLevel): AST.Expression {
  let lhs = parseNextTighter.call(this, level)
  let op: AST.BinOp | null
  while ((op = tokenToBinop(this.peek(), level)) !== null) {
    const span = this.peekSpan()
    this.advance()
    const rhs = parseNextTighter.call(this, level)
    lhs = {
      type: 'BinaryExpression',
      operator: op,
      left: lhs,
      right: rhs,
      start: span.start,
      end: span.end,
      loc: LOC,
    }
  }
  return lhs
}

// === parseNextTighter (module-private) ===
function parseNextTighter(this: Parser, level: PrecedenceLevel): AST.Expression {
  switch (level) {
    case PrecedenceLevel.LogicalOr:
      return parseBinaryExpr.call(this, PrecedenceLevel.LogicalAnd)
    case PrecedenceLevel.LogicalAnd:
      return parseBinaryExpr.call(this, PrecedenceLevel.BitwiseOr)
    case PrecedenceLevel.BitwiseOr:
      return parseBinaryExpr.call(this, PrecedenceLevel.BitwiseXor)
    case PrecedenceLevel.BitwiseXor:
      return parseBinaryExpr.call(this, PrecedenceLevel.BitwiseAnd)
    case PrecedenceLevel.BitwiseAnd:
      return parseBinaryExpr.call(this, PrecedenceLevel.Equality)
    case PrecedenceLevel.Equality:
      return parseBinaryExpr.call(this, PrecedenceLevel.Relational)
    case PrecedenceLevel.Relational:
      return parseBinaryExpr.call(this, PrecedenceLevel.Shift)
    case PrecedenceLevel.Shift:
      return parseBinaryExpr.call(this, PrecedenceLevel.Additive)
    case PrecedenceLevel.Additive:
      return parseBinaryExpr.call(this, PrecedenceLevel.Multiplicative)
    case PrecedenceLevel.Multiplicative:
      return this.parseCastExpr()
  }
}

// === parseCastExpr ===
// Parse a cast expression: (type-name)expr, compound literal (type-name){...},
// or fall through to unary expression.
Parser.prototype.parseCastExpr = function (this: Parser): AST.Expression {
  if (this.peek() === TokenKind.LParen) {
    const save = this.pos
    const saveTypedef = this.getAttrFlag(ATTR_TYPEDEF)
    const saveConst = this.getAttrFlag(ATTR_CONST)
    const saveVectorSize = this.attrs.parsingVectorSize
    const saveExtVector = this.attrs.parsingExtVectorNelem
    this.attrs.parsingVectorSize = null
    this.attrs.parsingExtVectorNelem = null
    this.advance() // consume '('
    if (this.isTypeSpecifier()) {
      const typeSpec = this.parseTypeSpecifier()
      if (typeSpec !== null) {
        let resultType = this.parseAbstractDeclaratorSuffix(typeSpec)
        resultType = this.applyPendingVectorAttr(resultType)
        if (this.peek() === TokenKind.RParen) {
          const span = this.peekSpan()
          this.advance()
          // Check for compound literal: (type){...}
          if (this.peek() === TokenKind.LBrace) {
            const init = this.parseInitializer()
            const lit: AST.Expression = {
              type: 'CompoundLiteralExpression',
              typeSpec: resultType,
              init,
              start: span.start,
              end: span.end,
              loc: LOC,
            }
            this.setAttrFlag(ATTR_CONST, saveConst)
            this.attrs.parsingVectorSize = saveVectorSize
            this.attrs.parsingExtVectorNelem = saveExtVector
            return this.parsePostfixOps(lit)
          }
          const expr = this.parseCastExpr()
          this.setAttrFlag(ATTR_CONST, saveConst)
          this.attrs.parsingVectorSize = saveVectorSize
          this.attrs.parsingExtVectorNelem = saveExtVector
          return {
            type: 'CastExpression',
            typeSpec: resultType,
            operand: expr,
            start: span.start,
            end: span.end,
            loc: LOC,
          }
        }
      }
    }
    // Not a cast — backtrack
    this.pos = save
    this.setAttrFlag(ATTR_TYPEDEF, saveTypedef)
    this.setAttrFlag(ATTR_CONST, saveConst)
    this.attrs.parsingVectorSize = saveVectorSize
    this.attrs.parsingExtVectorNelem = saveExtVector
  }
  return this.parseUnaryExpr()
}

// === parseUnaryExpr ===
Parser.prototype.parseUnaryExpr = function (this: Parser): AST.Expression {
  switch (this.peek()) {
    case TokenKind.AmpAmp: {
      // GCC extension: &&label (address of label, for computed goto)
      const span = this.peekSpan()
      if (
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1].kind === TokenKind.Identifier
      ) {
        const labelName = (this.tokens[this.pos + 1].value as string) ?? ''
        this.advance() // consume &&
        this.advance() // consume identifier
        return {
          type: 'LabelAddrExpression',
          label: labelName,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      }
      return this.parsePostfixExpr()
    }
    case TokenKind.RealPart: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'RealPart',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.ImagPart: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'ImagPart',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.PlusPlus: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseUnaryExpr()
      return {
        type: 'UnaryExpression',
        operator: 'PreInc',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.MinusMinus: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseUnaryExpr()
      return {
        type: 'UnaryExpression',
        operator: 'PreDec',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Plus: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'Plus',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Minus: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'Neg',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Tilde: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'BitNot',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Bang: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'UnaryExpression',
        operator: 'LogicalNot',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Amp: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return {
        type: 'AddressOfExpression',
        operand: expr,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Star: {
      const span = this.peekSpan()
      this.advance()
      const expr = this.parseCastExpr()
      return { type: 'DerefExpression', operand: expr, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.Sizeof:
      return this.parseSizeofExpr()
    case TokenKind.Alignof: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after '_Alignof'")
      if (this.isTypeSpecifier()) {
        const ts = this.parseTypeSpecifier()
        if (ts !== null) {
          let resultType = this.parseAbstractDeclaratorSuffix(ts)
          resultType = this.applyPendingVectorAttr(resultType)
          this.expectClosing(TokenKind.RParen, open)
          return {
            type: 'AlignofExpression',
            typeSpec: resultType,
            start: span.start,
            end: span.end,
            loc: LOC,
          }
        }
      }
      const expr = this.parseAssignmentExpr()
      this.expectClosing(TokenKind.RParen, open)
      return { type: 'AlignofExprExpression', expr, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.GnuAlignof: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after '__alignof__'")
      if (this.isTypeSpecifier()) {
        const ts = this.parseTypeSpecifier()
        if (ts !== null) {
          let resultType = this.parseAbstractDeclaratorSuffix(ts)
          resultType = this.applyPendingVectorAttr(resultType)
          this.expectClosing(TokenKind.RParen, open)
          return {
            type: 'GnuAlignofExpression',
            typeSpec: resultType,
            start: span.start,
            end: span.end,
            loc: LOC,
          }
        }
      }
      const expr = this.parseAssignmentExpr()
      this.expectClosing(TokenKind.RParen, open)
      return { type: 'GnuAlignofExprExpression', expr, start: span.start, end: span.end, loc: LOC }
    }
    default:
      return this.parsePostfixExpr()
  }
}

// === parseSizeofExpr ===
Parser.prototype.parseSizeofExpr = function (this: Parser): AST.Expression {
  const span = this.peekSpan()
  this.advance() // consume 'sizeof'
  if (this.peek() === TokenKind.LParen) {
    const save = this.pos
    const saveTypedef = this.getAttrFlag(ATTR_TYPEDEF)
    const saveConst = this.getAttrFlag(ATTR_CONST)
    const saveVectorSize = this.attrs.parsingVectorSize
    const saveExtVector = this.attrs.parsingExtVectorNelem
    this.attrs.parsingVectorSize = null
    this.attrs.parsingExtVectorNelem = null
    this.advance() // consume '('
    if (this.isTypeSpecifier()) {
      const ts = this.parseTypeSpecifier()
      if (ts !== null) {
        let resultType = this.parseAbstractDeclaratorSuffix(ts)
        resultType = this.applyPendingVectorAttr(resultType)
        if (this.peek() === TokenKind.RParen) {
          this.expect(TokenKind.RParen)
          this.setAttrFlag(ATTR_CONST, saveConst)
          this.attrs.parsingVectorSize = saveVectorSize
          this.attrs.parsingExtVectorNelem = saveExtVector
          return {
            type: 'SizeofExpression',
            argument: { kind: 'Type', typeSpec: resultType },
            start: span.start,
            end: span.end,
            loc: LOC,
          }
        }
      }
    }
    // Not a type — backtrack
    this.pos = save
    this.setAttrFlag(ATTR_TYPEDEF, saveTypedef)
    this.setAttrFlag(ATTR_CONST, saveConst)
    this.attrs.parsingVectorSize = saveVectorSize
    this.attrs.parsingExtVectorNelem = saveExtVector
  }
  const expr = this.parseUnaryExpr()
  return {
    type: 'SizeofExpression',
    argument: { kind: 'Expr', expr },
    start: span.start,
    end: span.end,
    loc: LOC,
  }
}

// === parsePostfixExpr ===
Parser.prototype.parsePostfixExpr = function (this: Parser): AST.Expression {
  const expr = this.parsePrimaryExpr()
  return this.parsePostfixOps(expr)
}

// === parsePostfixOps ===
Parser.prototype.parsePostfixOps = function (this: Parser, expr: AST.Expression): AST.Expression {
  let result = expr
  while (true) {
    switch (this.peek()) {
      case TokenKind.LParen: {
        // Function call
        const open = this.peekSpan()
        this.advance()
        const args: AST.Expression[] = []
        if (this.peek() !== TokenKind.RParen) {
          args.push(this.parseAssignmentExpr())
          while (this.consumeIf(TokenKind.Comma)) {
            args.push(this.parseAssignmentExpr())
          }
        }
        this.expectClosing(TokenKind.RParen, open)
        result = {
          type: 'FunctionCallExpression',
          callee: result,
          args,
          start: open.start,
          end: open.end,
          loc: LOC,
        }
        continue
      }
      case TokenKind.LBracket: {
        const open = this.peekSpan()
        this.advance()
        const index = this.parseExpr()
        this.expectClosing(TokenKind.RBracket, open)
        result = {
          type: 'ArraySubscriptExpression',
          object: result,
          index,
          start: open.start,
          end: open.end,
          loc: LOC,
        }
        continue
      }
      case TokenKind.Dot: {
        const span = this.peekSpan()
        this.advance()
        let field = ''
        if (this.peek() === TokenKind.Identifier) {
          field = (this.peekValue() as string) ?? ''
          this.advance()
        }
        result = {
          type: 'MemberAccessExpression',
          object: result,
          member: field,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
        continue
      }
      case TokenKind.Arrow: {
        const span = this.peekSpan()
        this.advance()
        let field = ''
        if (this.peek() === TokenKind.Identifier) {
          field = (this.peekValue() as string) ?? ''
          this.advance()
        }
        result = {
          type: 'PointerMemberAccessExpression',
          object: result,
          member: field,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
        continue
      }
      case TokenKind.PlusPlus: {
        const span = this.peekSpan()
        this.advance()
        result = {
          type: 'PostfixExpression',
          operator: 'PostInc',
          operand: result,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
        continue
      }
      case TokenKind.MinusMinus: {
        const span = this.peekSpan()
        this.advance()
        result = {
          type: 'PostfixExpression',
          operator: 'PostDec',
          operand: result,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
        continue
      }
      default:
        return result
    }
  }
}

// === parsePrimaryExpr ===
Parser.prototype.parsePrimaryExpr = function (this: Parser): AST.Expression {
  switch (this.peek()) {
    case TokenKind.IntLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'IntLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.UIntLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'UIntLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.LongLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'LongLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.ULongLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'ULongLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.LongLongLiteral: {
      const tok = this.peekToken()
      const val = tok.bigValue ?? BigInt(0)
      const span = this.peekSpan()
      this.advance()
      return { type: 'LongLongLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.ULongLongLiteral: {
      const tok = this.peekToken()
      const val = tok.bigValue ?? BigInt(0)
      const span = this.peekSpan()
      this.advance()
      return { type: 'ULongLongLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.FloatLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'FloatLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.FloatLiteralF32: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'FloatLiteralF32', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.FloatLiteralLongDouble: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return {
        type: 'FloatLiteralLongDouble',
        value: val,
        f128Bytes: new Uint8Array(16),
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.ImaginaryLiteral: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'ImaginaryLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.ImaginaryLiteralF32: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return { type: 'ImaginaryLiteralF32', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.ImaginaryLiteralLongDouble: {
      const val = (this.peekValue() as number) ?? 0
      const span = this.peekSpan()
      this.advance()
      return {
        type: 'ImaginaryLiteralLongDouble',
        value: val,
        f128Bytes: new Uint8Array(16),
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    // String literals (with concatenation) handled below
    // continued in next segment...
    case TokenKind.StringLiteral: {
      let result = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      this.advance()
      let isWide = false
      let isChar16 = false
      while (true) {
        if (this.peek() === TokenKind.StringLiteral) {
          result += (this.peekValue() as string) ?? ''
          this.advance()
        } else if (this.peek() === TokenKind.WideStringLiteral) {
          result += (this.peekValue() as string) ?? ''
          isWide = true
          this.advance()
        } else if (this.peek() === TokenKind.Char16StringLiteral) {
          result += (this.peekValue() as string) ?? ''
          isChar16 = true
          this.advance()
        } else {
          break
        }
      }
      if (isWide)
        return {
          type: 'WideStringLiteral',
          value: result,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      if (isChar16)
        return {
          type: 'Char16StringLiteral',
          value: result,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      return { type: 'StringLiteral', value: result, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.WideStringLiteral: {
      let result = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      this.advance()
      while (
        this.peek() === TokenKind.StringLiteral ||
        this.peek() === TokenKind.WideStringLiteral ||
        this.peek() === TokenKind.Char16StringLiteral
      ) {
        result += (this.peekValue() as string) ?? ''
        this.advance()
      }
      return {
        type: 'WideStringLiteral',
        value: result,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Char16StringLiteral: {
      let result = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      this.advance()
      let isWide = false
      while (true) {
        if (
          this.peek() === TokenKind.StringLiteral ||
          this.peek() === TokenKind.Char16StringLiteral
        ) {
          result += (this.peekValue() as string) ?? ''
          this.advance()
        } else if (this.peek() === TokenKind.WideStringLiteral) {
          result += (this.peekValue() as string) ?? ''
          isWide = true
          this.advance()
        } else {
          break
        }
      }
      if (isWide)
        return {
          type: 'WideStringLiteral',
          value: result,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      return {
        type: 'Char16StringLiteral',
        value: result,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.CharLiteral: {
      const val = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      this.advance()
      return { type: 'CharLiteral', value: val, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.Identifier: {
      const name = (this.peekValue() as string) ?? ''
      const span = this.peekSpan()
      this.advance()
      return { type: 'Identifier', name, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.LParen: {
      const open = this.peekSpan()
      this.advance()
      // Check for GCC statement expression: ({ stmt; stmt; expr; })
      if (this.peek() === TokenKind.LBrace) {
        const span = this.peekSpan()
        const compound = this.parseCompoundStmt()
        this.expectClosing(TokenKind.RParen, open)
        return {
          type: 'StmtExpression',
          body: compound,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      }
      const expr = this.parseExpr()
      this.expectClosing(TokenKind.RParen, open)
      return expr
    }
    case TokenKind.Generic:
      return this.parseGenericSelection()
    case TokenKind.Asm: {
      // GCC asm expression in expression context — skip and return 0
      const span = this.peekSpan()
      this.advance()
      this.consumeIf(TokenKind.Volatile)
      if (this.peek() === TokenKind.LParen) {
        this.skipBalancedParens()
      }
      return { type: 'IntLiteral', value: 0, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.BuiltinVaArg: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after '__builtin_va_arg'")
      const apExpr = this.parseAssignmentExpr()
      this.expectContext(TokenKind.Comma, "between '__builtin_va_arg' arguments")
      const typeSpec = this.parseVaArgType()
      this.expectClosing(TokenKind.RParen, open)
      return {
        type: 'VaArgExpression',
        expr: apExpr,
        typeSpec,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.BuiltinTypesCompatibleP: {
      const span = this.peekSpan()
      this.advance()
      const open = this.peekSpan()
      this.expectContext(TokenKind.LParen, "after '__builtin_types_compatible_p'")
      const type1 = this.parseVaArgType()
      this.expectContext(TokenKind.Comma, "between '__builtin_types_compatible_p' arguments")
      const type2 = this.parseVaArgType()
      this.expectClosing(TokenKind.RParen, open)
      return {
        type: 'BuiltinTypesCompatiblePExpression',
        typeSpec1: type1,
        typeSpec2: type2,
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Typeof: {
      // typeof in expression context — skip and return 0
      const span = this.peekSpan()
      this.advance()
      if (this.peek() === TokenKind.LParen) {
        this.skipBalancedParens()
      }
      return { type: 'IntLiteral', value: 0, start: span.start, end: span.end, loc: LOC }
    }
    case TokenKind.Builtin: {
      const span = this.peekSpan()
      this.advance()
      return {
        type: 'Identifier',
        name: '__builtin_va_list',
        start: span.start,
        end: span.end,
        loc: LOC,
      }
    }
    case TokenKind.Extension: {
      this.advance()
      return this.parseCastExpr()
    }
    default: {
      const span = this.peekSpan()
      this.emitError(`expected expression before '${this.peek()}'`, span)
      this.advance()
      return { type: 'IntLiteral', value: 0, start: span.start, end: span.end, loc: LOC }
    }
  }
}

// === parseGenericSelection ===
// Parse _Generic(controlling_expr, type: expr, ..., default: expr)
Parser.prototype.parseGenericSelection = function (this: Parser): AST.Expression {
  const span = this.peekSpan()
  this.advance() // consume _Generic
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, "after '_Generic'")
  const controlling = this.parseAssignmentExpr()
  this.expectContext(TokenKind.Comma, "after '_Generic' controlling expression")
  const associations: AST.GenericAssociation[] = []
  while (true) {
    if (this.peek() === TokenKind.RParen) break
    const savedConst = this.getAttrFlag(ATTR_CONST)
    this.setAttrFlag(ATTR_CONST, false)
    let typeSpec: AST.TypeSpecifier | null = null
    let isConst = false
    if (this.peek() === TokenKind.Default) {
      this.advance()
    } else {
      const ts = this.parseTypeSpecifier()
      if (ts !== null) {
        isConst = this.getAttrFlag(ATTR_CONST)
        typeSpec = this.parseAbstractDeclaratorSuffix(ts)
      }
    }
    this.setAttrFlag(ATTR_CONST, savedConst)
    this.expectContext(TokenKind.Colon, "in '_Generic' association")
    const expr = this.parseAssignmentExpr()
    associations.push({ typeSpec, expr, isConst })
    if (!this.consumeIf(TokenKind.Comma)) break
  }
  this.expectClosing(TokenKind.RParen, open)
  return {
    type: 'GenericSelectionExpression',
    controlling,
    associations,
    start: span.start,
    end: span.end,
    loc: LOC,
  }
}

// === applyPendingVectorAttr ===
Parser.prototype.applyPendingVectorAttr = function (
  this: Parser,
  ts: AST.TypeSpecifier,
): AST.TypeSpecifier {
  if (this.attrs.parsingVectorSize !== null) {
    const totalBytes = this.attrs.parsingVectorSize
    this.attrs.parsingVectorSize = null
    return { type: 'VectorType', element: ts, totalBytes }
  }
  if (this.attrs.parsingExtVectorNelem !== null) {
    const nelem = this.attrs.parsingExtVectorNelem
    this.attrs.parsingExtVectorNelem = null
    const elemSize = this.estimateTypeSize(ts)
    return { type: 'VectorType', element: ts, totalBytes: nelem * elemSize }
  }
  return ts
}

// === estimateTypeSize ===
Parser.prototype.estimateTypeSize = function (this: Parser, ts: AST.TypeSpecifier): number {
  switch (ts.type) {
    case 'CharType':
    case 'UnsignedCharType':
    case 'BoolType':
      return 1
    case 'ShortType':
    case 'UnsignedShortType':
      return 2
    case 'IntType':
    case 'UnsignedIntType':
    case 'SignedType':
    case 'UnsignedType':
      return 4
    case 'LongType':
    case 'UnsignedLongType':
      return 8
    case 'LongLongType':
    case 'UnsignedLongLongType':
      return 8
    case 'FloatType':
      return 4
    case 'DoubleType':
      return 8
    case 'LongDoubleType':
      return 16
    default:
      return 4
  }
}
