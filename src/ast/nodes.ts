// ---------------------------------------------------------------------------
// C AST Node Types -- TypeScript port of ast.rs
// ---------------------------------------------------------------------------

// ---- Source Location ----
export interface SourcePosition {
  line: number // 1-based
  column: number // 0-based
}

export interface SourceLocation {
  start: SourcePosition
  end: SourcePosition
}

export interface BaseNode {
  type: string
  start: number
  end: number
  loc: SourceLocation
}

// ---- Operators ----
export type BinOp =
  | 'Add'
  | 'Sub'
  | 'Mul'
  | 'Div'
  | 'Mod'
  | 'BitAnd'
  | 'BitOr'
  | 'BitXor'
  | 'Shl'
  | 'Shr'
  | 'Eq'
  | 'Ne'
  | 'Lt'
  | 'Le'
  | 'Gt'
  | 'Ge'
  | 'LogicalAnd'
  | 'LogicalOr'

export type UnaryOp =
  | 'Plus'
  | 'Neg'
  | 'BitNot'
  | 'LogicalNot'
  | 'PreInc'
  | 'PreDec'
  | 'RealPart'
  | 'ImagPart'

export type PostfixOp = 'PostInc' | 'PostDec'

// ---- Address Space ----
export type AddressSpace = 'Default' | 'SegGs' | 'SegFs'

// ---- Forward references (recursive types) ----
export type Expression =
  | IntLiteral
  | UIntLiteral
  | LongLiteral
  | ULongLiteral
  | LongLongLiteral
  | ULongLongLiteral
  | FloatLiteral
  | FloatLiteralF32
  | FloatLiteralLongDouble
  | ImaginaryLiteral
  | ImaginaryLiteralF32
  | ImaginaryLiteralLongDouble
  | StringLiteral
  | WideStringLiteral
  | Char16StringLiteral
  | CharLiteral
  | Identifier
  | BinaryExpression
  | UnaryExpression
  | PostfixExpression
  | AssignExpression
  | CompoundAssignExpression
  | ConditionalExpression
  | GnuConditionalExpression
  | FunctionCallExpression
  | ArraySubscriptExpression
  | MemberAccessExpression
  | PointerMemberAccessExpression
  | CastExpression
  | CompoundLiteralExpression
  | StmtExpression
  | SizeofExpression
  | VaArgExpression
  | AlignofExpression
  | AlignofExprExpression
  | GnuAlignofExpression
  | GnuAlignofExprExpression
  | CommaExpression
  | AddressOfExpression
  | DerefExpression
  | GenericSelectionExpression
  | LabelAddrExpression
  | BuiltinTypesCompatiblePExpression

// ---- Expression Nodes ----
export interface IntLiteral extends BaseNode {
  type: 'IntLiteral'
  value: number
}

export interface UIntLiteral extends BaseNode {
  type: 'UIntLiteral'
  value: number
}

export interface LongLiteral extends BaseNode {
  type: 'LongLiteral'
  value: number
}

export interface ULongLiteral extends BaseNode {
  type: 'ULongLiteral'
  value: number
}

export interface LongLongLiteral extends BaseNode {
  type: 'LongLongLiteral'
  value: bigint
}

export interface ULongLongLiteral extends BaseNode {
  type: 'ULongLongLiteral'
  value: bigint
}

export interface FloatLiteral extends BaseNode {
  type: 'FloatLiteral'
  value: number
}

export interface FloatLiteralF32 extends BaseNode {
  type: 'FloatLiteralF32'
  value: number
}

export interface FloatLiteralLongDouble extends BaseNode {
  type: 'FloatLiteralLongDouble'
  value: number
  f128Bytes: Uint8Array
}

export interface ImaginaryLiteral extends BaseNode {
  type: 'ImaginaryLiteral'
  value: number
}

export interface ImaginaryLiteralF32 extends BaseNode {
  type: 'ImaginaryLiteralF32'
  value: number
}

export interface ImaginaryLiteralLongDouble extends BaseNode {
  type: 'ImaginaryLiteralLongDouble'
  value: number
  f128Bytes: Uint8Array
}

export interface StringLiteral extends BaseNode {
  type: 'StringLiteral'
  value: string
}

export interface WideStringLiteral extends BaseNode {
  type: 'WideStringLiteral'
  value: string
}

export interface Char16StringLiteral extends BaseNode {
  type: 'Char16StringLiteral'
  value: string
}

export interface CharLiteral extends BaseNode {
  type: 'CharLiteral'
  value: string
}

export interface Identifier extends BaseNode {
  type: 'Identifier'
  name: string
}

export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression'
  operator: BinOp
  left: Expression
  right: Expression
}

export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression'
  operator: UnaryOp
  operand: Expression
}

export interface PostfixExpression extends BaseNode {
  type: 'PostfixExpression'
  operator: PostfixOp
  operand: Expression
}

export interface AssignExpression extends BaseNode {
  type: 'AssignExpression'
  left: Expression
  right: Expression
}

export interface CompoundAssignExpression extends BaseNode {
  type: 'CompoundAssignExpression'
  operator: BinOp
  left: Expression
  right: Expression
}

export interface ConditionalExpression extends BaseNode {
  type: 'ConditionalExpression'
  condition: Expression
  consequent: Expression
  alternate: Expression
}

export interface GnuConditionalExpression extends BaseNode {
  type: 'GnuConditionalExpression'
  condition: Expression
  alternate: Expression
}

export interface FunctionCallExpression extends BaseNode {
  type: 'FunctionCallExpression'
  callee: Expression
  args: Expression[]
}

export interface ArraySubscriptExpression extends BaseNode {
  type: 'ArraySubscriptExpression'
  object: Expression
  index: Expression
}

export interface MemberAccessExpression extends BaseNode {
  type: 'MemberAccessExpression'
  object: Expression
  member: string
}

export interface PointerMemberAccessExpression extends BaseNode {
  type: 'PointerMemberAccessExpression'
  object: Expression
  member: string
}

export interface CastExpression extends BaseNode {
  type: 'CastExpression'
  typeSpec: TypeSpecifier
  operand: Expression
}

export interface CompoundLiteralExpression extends BaseNode {
  type: 'CompoundLiteralExpression'
  typeSpec: TypeSpecifier
  init: Initializer
}

export interface StmtExpression extends BaseNode {
  type: 'StmtExpression'
  body: CompoundStatement
}

export interface SizeofExpression extends BaseNode {
  type: 'SizeofExpression'
  argument: SizeofArg
}

export interface VaArgExpression extends BaseNode {
  type: 'VaArgExpression'
  expr: Expression
  typeSpec: TypeSpecifier
}

export interface AlignofExpression extends BaseNode {
  type: 'AlignofExpression'
  typeSpec: TypeSpecifier
}

export interface AlignofExprExpression extends BaseNode {
  type: 'AlignofExprExpression'
  expr: Expression
}

export interface GnuAlignofExpression extends BaseNode {
  type: 'GnuAlignofExpression'
  typeSpec: TypeSpecifier
}

export interface GnuAlignofExprExpression extends BaseNode {
  type: 'GnuAlignofExprExpression'
  expr: Expression
}

export interface CommaExpression extends BaseNode {
  type: 'CommaExpression'
  left: Expression
  right: Expression
}

export interface AddressOfExpression extends BaseNode {
  type: 'AddressOfExpression'
  operand: Expression
}

export interface DerefExpression extends BaseNode {
  type: 'DerefExpression'
  operand: Expression
}

export interface GenericSelectionExpression extends BaseNode {
  type: 'GenericSelectionExpression'
  controlling: Expression
  associations: GenericAssociation[]
}

export interface LabelAddrExpression extends BaseNode {
  type: 'LabelAddrExpression'
  label: string
}

export interface BuiltinTypesCompatiblePExpression extends BaseNode {
  type: 'BuiltinTypesCompatiblePExpression'
  typeSpec1: TypeSpecifier
  typeSpec2: TypeSpecifier
}

// ---- Generic Association ----
export interface GenericAssociation {
  typeSpec: TypeSpecifier | null
  expr: Expression
  isConst: boolean
}

// ---- Sizeof Arg ----
export type SizeofArg = SizeofType | SizeofExpr

export interface SizeofType {
  kind: 'Type'
  typeSpec: TypeSpecifier
}

export interface SizeofExpr {
  kind: 'Expr'
  expr: Expression
}

// ---- Type Specifiers ----
export type TypeSpecifier =
  | VoidType
  | CharType
  | ShortType
  | IntType
  | LongType
  | LongLongType
  | FloatType
  | DoubleType
  | LongDoubleType
  | SignedType
  | UnsignedType
  | UnsignedCharType
  | UnsignedShortType
  | UnsignedIntType
  | UnsignedLongType
  | UnsignedLongLongType
  | Int128Type
  | UnsignedInt128Type
  | BoolType
  | ComplexFloatType
  | ComplexDoubleType
  | ComplexLongDoubleType
  | StructType
  | UnionType
  | EnumType
  | TypedefNameType
  | PointerType
  | ArrayType
  | FunctionPointerType
  | BareFunctionType
  | TypeofExprType
  | TypeofTypeType
  | AutoTypeType
  | VectorType

export interface VoidType {
  type: 'VoidType'
}
export interface CharType {
  type: 'CharType'
}
export interface ShortType {
  type: 'ShortType'
}
export interface IntType {
  type: 'IntType'
}
export interface LongType {
  type: 'LongType'
}
export interface LongLongType {
  type: 'LongLongType'
}
export interface FloatType {
  type: 'FloatType'
}
export interface DoubleType {
  type: 'DoubleType'
}
export interface LongDoubleType {
  type: 'LongDoubleType'
}
export interface SignedType {
  type: 'SignedType'
}
export interface UnsignedType {
  type: 'UnsignedType'
}
export interface UnsignedCharType {
  type: 'UnsignedCharType'
}
export interface UnsignedShortType {
  type: 'UnsignedShortType'
}
export interface UnsignedIntType {
  type: 'UnsignedIntType'
}
export interface UnsignedLongType {
  type: 'UnsignedLongType'
}
export interface UnsignedLongLongType {
  type: 'UnsignedLongLongType'
}
export interface Int128Type {
  type: 'Int128Type'
}
export interface UnsignedInt128Type {
  type: 'UnsignedInt128Type'
}
export interface BoolType {
  type: 'BoolType'
}
export interface ComplexFloatType {
  type: 'ComplexFloatType'
}
export interface ComplexDoubleType {
  type: 'ComplexDoubleType'
}
export interface ComplexLongDoubleType {
  type: 'ComplexLongDoubleType'
}

export interface StructType {
  type: 'StructType'
  name: string | null
  fields: StructFieldDeclaration[] | null
  isPacked: boolean
  maxFieldAlign: number | null
  structAligned: number | null
}

export interface UnionType {
  type: 'UnionType'
  name: string | null
  fields: StructFieldDeclaration[] | null
  isPacked: boolean
  maxFieldAlign: number | null
  structAligned: number | null
}

export interface EnumType {
  type: 'EnumType'
  name: string | null
  variants: EnumVariant[] | null
  isPacked: boolean
}

export interface TypedefNameType {
  type: 'TypedefNameType'
  name: string
}

export interface PointerType {
  type: 'PointerType'
  base: TypeSpecifier
  addressSpace: AddressSpace
}

export interface ArrayType {
  type: 'ArrayType'
  element: TypeSpecifier
  size: Expression | null
}

export interface FunctionPointerType {
  type: 'FunctionPointerType'
  returnType: TypeSpecifier
  params: ParamDeclaration[]
  variadic: boolean
}

export interface BareFunctionType {
  type: 'BareFunctionType'
  returnType: TypeSpecifier
  params: ParamDeclaration[]
  variadic: boolean
}

export interface TypeofExprType {
  type: 'TypeofExprType'
  expr: Expression
}

export interface TypeofTypeType {
  type: 'TypeofTypeType'
  typeSpec: TypeSpecifier
}

export interface AutoTypeType {
  type: 'AutoTypeType'
}

export interface VectorType {
  type: 'VectorType'
  element: TypeSpecifier
  totalBytes: number
}

// ---- Struct / Enum helpers ----

export interface StructFieldDeclaration {
  typeSpec: TypeSpecifier
  name: string | null
  bitWidth: Expression | null
  derived: DerivedDeclarator[]
  alignment: number | null
  isPacked: boolean
}

export interface EnumVariant {
  name: string
  value: Expression | null
}

// ---- Derived Declarators ----

export type DerivedDeclarator =
  | PointerDeclarator
  | ArrayDeclarator
  | FunctionDeclarator
  | FunctionPointerDeclarator

export interface PointerDeclarator {
  kind: 'Pointer'
}

export interface ArrayDeclarator {
  kind: 'Array'
  size: Expression | null
}

export interface FunctionDeclarator {
  kind: 'Function'
  params: ParamDeclaration[]
  variadic: boolean
}

export interface FunctionPointerDeclarator {
  kind: 'FunctionPointer'
  params: ParamDeclaration[]
  variadic: boolean
}

// ---- Parameter Declaration ----

export interface ParamDeclaration {
  typeSpec: TypeSpecifier
  name: string | null
  fptrParams: ParamDeclaration[] | null
  isConst: boolean
  vlaSizeExprs: Expression[]
  fptrInnerPtrDepth: number
}

// ---- Initializers ----

export type Initializer = ExpressionInitializer | ListInitializer

export interface ExpressionInitializer {
  kind: 'Expr'
  expr: Expression
}

export interface ListInitializer {
  kind: 'List'
  items: InitializerItem[]
}

export interface InitializerItem {
  designators: Designator[]
  init: Initializer
}

// ---- Designators ----

export type Designator = IndexDesignator | RangeDesignator | FieldDesignator

export interface IndexDesignator {
  kind: 'Index'
  index: Expression
}

export interface RangeDesignator {
  kind: 'Range'
  low: Expression
  high: Expression
}

export interface FieldDesignator {
  kind: 'Field'
  name: string
}

// ---- Declarations ----

export interface FunctionAttributes {
  isStatic: boolean
  isInline: boolean
  isExtern: boolean
  isGnuInline: boolean
  isAlwaysInline: boolean
  isNoinline: boolean
  isConstructor: boolean
  isDestructor: boolean
  isWeak: boolean
  isUsed: boolean
  isFastcall: boolean
  isNaked: boolean
  isNoreturn: boolean
  section: string | null
  visibility: string | null
  symver: string | null
}

export interface DeclAttributes {
  isConstructor: boolean
  isDestructor: boolean
  isWeak: boolean
  isErrorAttr: boolean
  isNoreturn: boolean
  isUsed: boolean
  isFastcall: boolean
  isNaked: boolean
  aliasTarget: string | null
  visibility: string | null
  section: string | null
  asmRegister: string | null
  cleanupFn: string | null
  symver: string | null
}

export interface InitDeclarator extends BaseNode {
  type: 'InitDeclarator'
  name: string
  derived: DerivedDeclarator[]
  init: Initializer | null
  attrs: DeclAttributes
}

export interface Declaration extends BaseNode {
  type: 'Declaration'
  typeSpec: TypeSpecifier
  declarators: InitDeclarator[]
  isStatic: boolean
  isExtern: boolean
  isTypedef: boolean
  isConst: boolean
  isVolatile: boolean
  isCommon: boolean
  isThreadLocal: boolean
  isTransparentUnion: boolean
  isInline: boolean
  alignment: number | null
  alignasType: TypeSpecifier | null
  alignmentSizeofType: TypeSpecifier | null
  addressSpace: AddressSpace
  vectorSize: number | null
  extVectorNelem: number | null
}

// ---- Function Definition ----

export interface FunctionDefinition extends BaseNode {
  type: 'FunctionDefinition'
  returnType: TypeSpecifier
  name: string
  params: ParamDeclaration[]
  variadic: boolean
  body: CompoundStatement
  attrs: FunctionAttributes
  isKr: boolean
}

// ---- Top-level ASM ----

export interface TopLevelAsm extends BaseNode {
  type: 'TopLevelAsm'
  asm: string
}

// ---- External Declaration ----

export type ExternalDeclaration = FunctionDefinition | Declaration | TopLevelAsm

// ---- Translation Unit ----

export interface TranslationUnit extends BaseNode {
  type: 'TranslationUnit'
  decls: ExternalDeclaration[]
}

// ---- Compound Statement ----

export interface CompoundStatement extends BaseNode {
  type: 'CompoundStatement'
  items: BlockItem[]
  localLabels: string[]
}

// ---- Block Item ----

export type BlockItem = Declaration | Statement

// ---- Statements ----

export type Statement =
  | ExpressionStatement
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | CompoundStatement
  | BreakStatement
  | ContinueStatement
  | SwitchStatement
  | CaseStatement
  | CaseRangeStatement
  | DefaultStatement
  | GotoStatement
  | GotoIndirectStatement
  | LabelStatement
  | DeclarationStatement
  | InlineAsmStatement

export interface ExpressionStatement extends BaseNode {
  type: 'ExpressionStatement'
  expr: Expression | null
}

export interface ReturnStatement extends BaseNode {
  type: 'ReturnStatement'
  expr: Expression | null
}

export interface IfStatement extends BaseNode {
  type: 'IfStatement'
  condition: Expression
  consequent: Statement
  alternate: Statement | null
}

export interface WhileStatement extends BaseNode {
  type: 'WhileStatement'
  condition: Expression
  body: Statement
}

export interface DoWhileStatement extends BaseNode {
  type: 'DoWhileStatement'
  body: Statement
  condition: Expression
}

export interface ForStatement extends BaseNode {
  type: 'ForStatement'
  init: ForInit | null
  condition: Expression | null
  update: Expression | null
  body: Statement
}

export interface BreakStatement extends BaseNode {
  type: 'BreakStatement'
}

export interface ContinueStatement extends BaseNode {
  type: 'ContinueStatement'
}

export interface SwitchStatement extends BaseNode {
  type: 'SwitchStatement'
  discriminant: Expression
  body: Statement
}

export interface CaseStatement extends BaseNode {
  type: 'CaseStatement'
  test: Expression
  body: Statement
}

export interface CaseRangeStatement extends BaseNode {
  type: 'CaseRangeStatement'
  low: Expression
  high: Expression
  body: Statement
}

export interface DefaultStatement extends BaseNode {
  type: 'DefaultStatement'
  body: Statement
}

export interface GotoStatement extends BaseNode {
  type: 'GotoStatement'
  label: string
}

export interface GotoIndirectStatement extends BaseNode {
  type: 'GotoIndirectStatement'
  expr: Expression
}

export interface LabelStatement extends BaseNode {
  type: 'LabelStatement'
  label: string
  body: Statement
}

export interface DeclarationStatement extends BaseNode {
  type: 'DeclarationStatement'
  declaration: Declaration
}

export interface InlineAsmStatement extends BaseNode {
  type: 'InlineAsmStatement'
  template: string
  outputs: AsmOperand[]
  inputs: AsmOperand[]
  clobbers: string[]
  gotoLabels: string[]
}

// ---- For Init ----

export type ForInit = ForInitDeclaration | ForInitExpression

export interface ForInitDeclaration {
  kind: 'Declaration'
  declaration: Declaration
}

export interface ForInitExpression {
  kind: 'Expression'
  expr: Expression
}

// ---- Asm Operand ----

export interface AsmOperand {
  name: string | null
  constraint: string
  expr: Expression
}
