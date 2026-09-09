import type * as AST from '../ast/nodes'

interface IntegerType {
  bits: number
  unsigned: boolean
}
interface Integer extends IntegerType {
  value: bigint
}
interface Context {
  enums: Map<string, number> | null
  sizeof: (type: AST.TypeSpecifier) => number | null
  alignof: (type: AST.TypeSpecifier, preferred: boolean) => number | null
}
const INT: IntegerType = { bits: 32, unsigned: false }
const SIZE: IntegerType = { bits: 64, unsigned: true }
function normalize(value: bigint, type: IntegerType): Integer {
  return {
    ...type,
    value: type.unsigned ? BigInt.asUintN(type.bits, value) : BigInt.asIntN(type.bits, value),
  }
}
function arithmetic(value: bigint, type: IntegerType): Integer | null {
  if (!type.unsigned && BigInt.asIntN(type.bits, value) !== value) return null
  return normalize(value, type)
}
function promote(type: IntegerType): IntegerType {
  return type.bits < 32 ? INT : type
}
function common(a: IntegerType, b: IntegerType): IntegerType {
  a = promote(a)
  b = promote(b)
  if (a.bits === b.bits) return { bits: a.bits, unsigned: a.unsigned || b.unsigned }
  // A wider signed type represents every value of a narrower unsigned type.
  return a.bits > b.bits ? a : b
}
function castType(type: AST.TypeSpecifier): IntegerType | null {
  switch (type.type) {
    case 'BoolType':
      return { bits: 1, unsigned: true }
    case 'CharType':
      return { bits: 8, unsigned: false }
    case 'UnsignedCharType':
      return { bits: 8, unsigned: true }
    case 'ShortType':
      return { bits: 16, unsigned: false }
    case 'UnsignedShortType':
      return { bits: 16, unsigned: true }
    case 'IntType':
    case 'SignedType':
      return INT
    case 'UnsignedType':
    case 'UnsignedIntType':
      return { bits: 32, unsigned: true }
    case 'LongType':
    case 'LongLongType':
      return { bits: 64, unsigned: false }
    case 'UnsignedLongType':
    case 'UnsignedLongLongType':
      return SIZE
    case 'Int128Type':
      return { bits: 128, unsigned: false }
    case 'UnsignedInt128Type':
      return { bits: 128, unsigned: true }
    default:
      return null
  }
}
function literal(value: number | bigint, type: IntegerType): Integer | null {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
  return normalize(BigInt(value), type)
}
function children(expr: AST.Expression): AST.Expression[] {
  switch (expr.type) {
    case 'BinaryExpression':
    case 'CommaExpression':
      return [expr.left, expr.right]
    case 'UnaryExpression':
    case 'CastExpression':
      return [expr.operand]
    case 'ConditionalExpression':
      return [expr.condition, expr.consequent, expr.alternate]
    default:
      return []
  }
}
// Iterative postorder evaluation also handles machine-generated left-associative
// chains without consuming JavaScript stack frames. Unknown values stay unknown.
export function evaluateInteger(expr: AST.Expression, ctx: Context): number | null {
  const values = new Map<AST.Expression, Integer | null>()
  const work: [AST.Expression, boolean][] = [[expr, false]]
  while (work.length) {
    const [node, ready] = work.pop()!
    if (values.has(node)) continue
    if (!ready) {
      work.push([node, true])
      for (const child of children(node)) work.push([child, false])
    } else values.set(node, evaluateNode(node, values, ctx))
  }
  const result = values.get(expr)
  if (!result) return null
  const n = Number(result.value)
  return Number.isSafeInteger(n) && BigInt(n) === result.value ? n : null
}
function evaluateNode(
  expr: AST.Expression,
  values: Map<AST.Expression, Integer | null>,
  ctx: Context,
): Integer | null {
  const get = (node: AST.Expression) => values.get(node) ?? null
  const truth = (v: boolean) => normalize(v ? 1n : 0n, INT)
  switch (expr.type) {
    case 'IntLiteral':
      return literal(expr.value, INT)
    case 'UIntLiteral':
      return literal(expr.value, { bits: 32, unsigned: true })
    case 'LongLiteral':
    case 'LongLongLiteral':
      return literal(expr.value, { bits: 64, unsigned: false })
    case 'ULongLiteral':
    case 'ULongLongLiteral':
      return literal(expr.value, SIZE)
    case 'CharLiteral':
      return typeof expr.value === 'string'
        ? normalize(BigInt.asIntN(8, BigInt(expr.value.charCodeAt(0))), INT)
        : null
    case 'Identifier': {
      const n = ctx.enums?.get(expr.name)
      if (n === undefined) return null
      return literal(
        n,
        n > 0xffffffff || n < -0x80000000
          ? { bits: 64, unsigned: false }
          : { bits: 32, unsigned: n > 0x7fffffff },
      )
    }
    case 'UnaryExpression': {
      const a = get(expr.operand)
      if (!a) return null
      const type = promote(a)
      const v = normalize(a.value, type).value
      switch (expr.operator) {
        case 'Plus':
          return normalize(v, type)
        case 'Neg':
          return arithmetic(-v, type)
        case 'BitNot':
          return normalize(~v, type)
        case 'LogicalNot':
          return truth(v === 0n)
        default:
          return null
      }
    }
    case 'CastExpression': {
      const a = get(expr.operand)
      const type = castType(expr.typeSpec)
      if (!a || !type) return null
      return expr.typeSpec.type === 'BoolType'
        ? normalize(a.value === 0n ? 0n : 1n, type)
        : normalize(a.value, type)
    }
    case 'ConditionalExpression': {
      const c = get(expr.condition),
        a = get(expr.consequent),
        b = get(expr.alternate)
      if (!c || !a || !b) return null
      return normalize(c.value !== 0n ? a.value : b.value, common(a, b))
    }
    case 'CommaExpression':
      return get(expr.right)
    case 'BinaryExpression': {
      const a = get(expr.left),
        b = get(expr.right)
      if (!a) return null
      if (expr.operator === 'LogicalAnd' && a.value === 0n) return truth(false)
      if (expr.operator === 'LogicalOr' && a.value !== 0n) return truth(true)
      if (!b) return null
      if (expr.operator === 'Shl' || expr.operator === 'Shr') {
        const type = promote(a)
        const l = normalize(a.value, type).value
        if (b.value < 0n || b.value >= BigInt(type.bits)) return null
        if (expr.operator === 'Shl' && !type.unsigned && l < 0n) return null
        return arithmetic(expr.operator === 'Shl' ? l << b.value : l >> b.value, type)
      }
      const type = common(a, b),
        l = normalize(a.value, type).value,
        r = normalize(b.value, type).value
      switch (expr.operator) {
        case 'Add':
          return arithmetic(l + r, type)
        case 'Sub':
          return arithmetic(l - r, type)
        case 'Mul':
          return arithmetic(l * r, type)
        case 'Div':
          return r === 0n ? null : arithmetic(l / r, type)
        case 'Mod':
          return r === 0n ? null : normalize(l % r, type)
        case 'BitAnd':
          return normalize(l & r, type)
        case 'BitOr':
          return normalize(l | r, type)
        case 'BitXor':
          return normalize(l ^ r, type)
        case 'Eq':
          return truth(l === r)
        case 'Ne':
          return truth(l !== r)
        case 'Lt':
          return truth(l < r)
        case 'Le':
          return truth(l <= r)
        case 'Gt':
          return truth(l > r)
        case 'Ge':
          return truth(l >= r)
        case 'LogicalAnd':
          return truth(l !== 0n && r !== 0n)
        case 'LogicalOr':
          return truth(l !== 0n || r !== 0n)
        default:
          return null
      }
    }
    case 'SizeofExpression': {
      const n = expr.argument.kind === 'Type' ? ctx.sizeof(expr.argument.typeSpec) : null
      return n === null ? null : literal(n, SIZE)
    }
    case 'AlignofExpression':
    case 'GnuAlignofExpression': {
      const n = ctx.alignof(expr.typeSpec, expr.type === 'GnuAlignofExpression')
      return n === null ? null : literal(n, SIZE)
    }
    default:
      return null
  }
}
