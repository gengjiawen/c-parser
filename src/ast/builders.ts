// ---------------------------------------------------------------------------
// NodeBuilder -- factory for creating AST nodes with source locations
// ---------------------------------------------------------------------------

import type {
  SourceLocation,
  SourcePosition,
  TranslationUnit,
  ExternalDeclaration,
  FunctionDefinition,
  FunctionAttributes,
  Declaration,
  InitDeclarator,
  DeclAttributes,
  DerivedDeclarator,
  PointerDeclarator,
  ArrayDeclarator,
  FunctionDeclarator,
  FunctionPointerDeclarator,
  ParamDeclaration,
  Initializer,
  ExpressionInitializer,
  ListInitializer,
  InitializerItem,
  Designator,
  IndexDesignator,
  RangeDesignator,
  FieldDesignator,
  TypeSpecifier,
  StructType,
  UnionType,
  EnumType,
  TypedefNameType,
  PointerType,
  ArrayType,
  FunctionPointerType,
  BareFunctionType,
  TypeofExprType,
  TypeofTypeType,
  VectorType,
  StructFieldDeclaration,
  EnumVariant,
  CompoundStatement,
  BlockItem,
  Statement,
  ExpressionStatement,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  BreakStatement,
  ContinueStatement,
  SwitchStatement,
  CaseStatement,
  CaseRangeStatement,
  DefaultStatement,
  GotoStatement,
  GotoIndirectStatement,
  LabelStatement,
  DeclarationStatement,
  InlineAsmStatement,
  ForInit,
  ForInitDeclaration,
  ForInitExpression,
  AsmOperand,
  TopLevelAsm,
  Expression,
  IntLiteral,
  UIntLiteral,
  LongLiteral,
  ULongLiteral,
  LongLongLiteral,
  ULongLongLiteral,
  FloatLiteral,
  FloatLiteralF32,
  FloatLiteralLongDouble,
  ImaginaryLiteral,
  ImaginaryLiteralF32,
  ImaginaryLiteralLongDouble,
  StringLiteral,
  WideStringLiteral,
  Char16StringLiteral,
  CharLiteral,
  Identifier,
  BinaryExpression,
  UnaryExpression,
  PostfixExpression,
  AssignExpression,
  CompoundAssignExpression,
  ConditionalExpression,
  GnuConditionalExpression,
  FunctionCallExpression,
  ArraySubscriptExpression,
  MemberAccessExpression,
  PointerMemberAccessExpression,
  CastExpression,
  CompoundLiteralExpression,
  StmtExpression,
  SizeofExpression,
  VaArgExpression,
  AlignofExpression,
  AlignofExprExpression,
  GnuAlignofExpression,
  GnuAlignofExprExpression,
  CommaExpression,
  AddressOfExpression,
  DerefExpression,
  GenericSelectionExpression,
  LabelAddrExpression,
  BuiltinTypesCompatiblePExpression,
  SizeofArg,
  GenericAssociation,
  BinOp,
  UnaryOp,
  PostfixOp,
  AddressSpace,
} from './nodes'

export class NodeBuilder {
  private lineOffsets: number[]

  constructor(source: string) {
    this.lineOffsets = [0]
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) {
        // '\n'
        this.lineOffsets.push(i + 1)
      }
    }
  }

  loc(start: number, end: number): SourceLocation {
    const startPos = this.positionFor(start)
    const endPos = this.positionFor(end)
    return { start: startPos, end: endPos }
  }

  private withTypeSpan<T extends TypeSpecifier>(node: Omit<T, 'start' | 'end'>): T {
    return { ...node, start: 0, end: 0 } as T
  }

  private positionFor(offset: number): SourcePosition {
    // Binary search for the line containing this offset
    let lo = 0
    let hi = this.lineOffsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (this.lineOffsets[mid] <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return { line: lo + 1, column: offset - this.lineOffsets[lo] }
  }

  // ---- Default attribute helpers ----
  defaultFunctionAttributes(): FunctionAttributes {
    return {
      isStatic: false,
      isInline: false,
      isExtern: false,
      isGnuInline: false,
      isAlwaysInline: false,
      isNoinline: false,
      isConstructor: false,
      isDestructor: false,
      isWeak: false,
      isUsed: false,
      isFastcall: false,
      isNaked: false,
      isNoreturn: false,
      section: null,
      visibility: null,
      symver: null,
    }
  }

  defaultDeclAttributes(): DeclAttributes {
    return {
      isConstructor: false,
      isDestructor: false,
      isWeak: false,
      isErrorAttr: false,
      isNoreturn: false,
      isUsed: false,
      isFastcall: false,
      isNaked: false,
      aliasTarget: null,
      visibility: null,
      section: null,
      asmRegister: null,
      cleanupFn: null,
      symver: null,
    }
  }

  // ---- Top-level nodes ----
  translationUnit(start: number, end: number, decls: ExternalDeclaration[]): TranslationUnit {
    return { type: 'TranslationUnit', start, end, loc: this.loc(start, end), decls }
  }

  functionDef(
    start: number,
    end: number,
    returnType: TypeSpecifier,
    name: string,
    params: ParamDeclaration[],
    variadic: boolean,
    body: CompoundStatement,
    attrs: FunctionAttributes,
    isKr: boolean,
  ): FunctionDefinition {
    return {
      type: 'FunctionDefinition',
      start,
      end,
      loc: this.loc(start, end),
      returnType,
      name,
      params,
      variadic,
      body,
      attrs,
      isKr,
    }
  }

  topLevelAsm(start: number, end: number, asm: string): TopLevelAsm {
    return { type: 'TopLevelAsm', start, end, loc: this.loc(start, end), asm }
  }

  // ---- Declarations ----
  declaration(
    start: number,
    end: number,
    typeSpec: TypeSpecifier,
    declarators: InitDeclarator[],
    opts: {
      isStatic?: boolean
      isExtern?: boolean
      isTypedef?: boolean
      isConst?: boolean
      isVolatile?: boolean
      isCommon?: boolean
      isThreadLocal?: boolean
      isTransparentUnion?: boolean
      isInline?: boolean
      alignment?: number | null
      alignasType?: TypeSpecifier | null
      alignmentSizeofType?: TypeSpecifier | null
      addressSpace?: AddressSpace
      vectorSize?: number | null
      extVectorNelem?: number | null
    } = {},
  ): Declaration {
    return {
      type: 'Declaration',
      start,
      end,
      loc: this.loc(start, end),
      typeSpec,
      declarators,
      isStatic: opts.isStatic ?? false,
      isExtern: opts.isExtern ?? false,
      isTypedef: opts.isTypedef ?? false,
      isConst: opts.isConst ?? false,
      isVolatile: opts.isVolatile ?? false,
      isCommon: opts.isCommon ?? false,
      isThreadLocal: opts.isThreadLocal ?? false,
      isTransparentUnion: opts.isTransparentUnion ?? false,
      isInline: opts.isInline ?? false,
      alignment: opts.alignment ?? null,
      alignasType: opts.alignasType ?? null,
      alignmentSizeofType: opts.alignmentSizeofType ?? null,
      addressSpace: opts.addressSpace ?? 'Default',
      vectorSize: opts.vectorSize ?? null,
      extVectorNelem: opts.extVectorNelem ?? null,
    }
  }

  initDeclarator(
    start: number,
    end: number,
    name: string,
    derived: DerivedDeclarator[],
    init: Initializer | null,
    attrs: DeclAttributes,
  ): InitDeclarator {
    return {
      type: 'InitDeclarator',
      start,
      end,
      loc: this.loc(start, end),
      name,
      derived,
      init,
      attrs,
    }
  }

  // ---- Derived Declarators ----
  pointerDeclarator(): PointerDeclarator {
    return { kind: 'Pointer' }
  }

  arrayDeclarator(size: Expression | null): ArrayDeclarator {
    return { kind: 'Array', size }
  }

  functionDeclarator(params: ParamDeclaration[], variadic: boolean): FunctionDeclarator {
    return { kind: 'Function', params, variadic }
  }

  functionPointerDeclarator(
    params: ParamDeclaration[],
    variadic: boolean,
  ): FunctionPointerDeclarator {
    return { kind: 'FunctionPointer', params, variadic }
  }

  // ---- Parameter Declaration ----
  paramDeclaration(
    typeSpec: TypeSpecifier,
    name: string | null,
    fptrParams: ParamDeclaration[] | null,
    isConst: boolean,
    vlaSizeExprs: Expression[],
    fptrInnerPtrDepth: number,
  ): ParamDeclaration {
    return { typeSpec, name, nameNode: null, fptrParams, isConst, vlaSizeExprs, fptrInnerPtrDepth }
  }

  // ---- Initializers ----
  exprInitializer(expr: Expression): ExpressionInitializer {
    return { kind: 'Expr', expr }
  }

  listInitializer(items: InitializerItem[]): ListInitializer {
    return { kind: 'List', items }
  }

  initializerItem(designators: Designator[], init: Initializer): InitializerItem {
    return { designators, init }
  }

  // ---- Designators ----
  indexDesignator(index: Expression): IndexDesignator {
    return { kind: 'Index', index }
  }

  rangeDesignator(low: Expression, high: Expression): RangeDesignator {
    return { kind: 'Range', low, high }
  }

  fieldDesignator(name: string): FieldDesignator {
    return { kind: 'Field', name }
  }

  // ---- Type Specifiers ----
  voidType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'VoidType' })
  }
  charType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'CharType' })
  }
  shortType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'ShortType' })
  }
  intType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'IntType' })
  }
  longType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'LongType' })
  }
  longLongType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'LongLongType' })
  }
  floatType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'FloatType' })
  }
  doubleType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'DoubleType' })
  }
  longDoubleType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'LongDoubleType' })
  }
  signedType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'SignedType' })
  }
  unsignedType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedType' })
  }
  unsignedCharType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedCharType' })
  }
  unsignedShortType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedShortType' })
  }
  unsignedIntType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedIntType' })
  }
  unsignedLongType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedLongType' })
  }
  unsignedLongLongType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedLongLongType' })
  }
  int128Type(): TypeSpecifier {
    return this.withTypeSpan({ type: 'Int128Type' })
  }
  unsignedInt128Type(): TypeSpecifier {
    return this.withTypeSpan({ type: 'UnsignedInt128Type' })
  }
  boolType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'BoolType' })
  }
  complexFloatType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'ComplexFloatType' })
  }
  complexDoubleType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'ComplexDoubleType' })
  }
  complexLongDoubleType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'ComplexLongDoubleType' })
  }
  autoTypeType(): TypeSpecifier {
    return this.withTypeSpan({ type: 'AutoTypeType' })
  }

  structType(
    name: string | null,
    fields: StructFieldDeclaration[] | null,
    isPacked: boolean,
    maxFieldAlign: number | null,
    structAligned: number | null,
  ): StructType {
    return this.withTypeSpan({
      type: 'StructType',
      name,
      fields,
      isPacked,
      maxFieldAlign,
      structAligned,
    })
  }

  unionType(
    name: string | null,
    fields: StructFieldDeclaration[] | null,
    isPacked: boolean,
    maxFieldAlign: number | null,
    structAligned: number | null,
  ): UnionType {
    return this.withTypeSpan({
      type: 'UnionType',
      name,
      fields,
      isPacked,
      maxFieldAlign,
      structAligned,
    })
  }

  enumType(name: string | null, variants: EnumVariant[] | null, isPacked: boolean): EnumType {
    return this.withTypeSpan({ type: 'EnumType', name, variants, isPacked })
  }

  typedefNameType(name: string): TypedefNameType {
    return this.withTypeSpan({ type: 'TypedefNameType', name })
  }

  pointerType(base: TypeSpecifier, addressSpace: AddressSpace = 'Default'): PointerType {
    return this.withTypeSpan({ type: 'PointerType', base, addressSpace })
  }

  arrayType(element: TypeSpecifier, size: Expression | null): ArrayType {
    return this.withTypeSpan({ type: 'ArrayType', element, size })
  }

  functionPointerType(
    returnType: TypeSpecifier,
    params: ParamDeclaration[],
    variadic: boolean,
  ): FunctionPointerType {
    return this.withTypeSpan({ type: 'FunctionPointerType', returnType, params, variadic })
  }

  bareFunctionType(
    returnType: TypeSpecifier,
    params: ParamDeclaration[],
    variadic: boolean,
  ): BareFunctionType {
    return this.withTypeSpan({ type: 'BareFunctionType', returnType, params, variadic })
  }

  typeofExprType(expr: Expression): TypeofExprType {
    return this.withTypeSpan({ type: 'TypeofExprType', expr })
  }

  typeofTypeType(typeSpec: TypeSpecifier): TypeofTypeType {
    return this.withTypeSpan({ type: 'TypeofTypeType', typeSpec })
  }

  vectorType(element: TypeSpecifier, totalBytes: number): VectorType {
    return this.withTypeSpan({ type: 'VectorType', element, totalBytes })
  }

  // ---- Struct / Enum helpers ----
  structField(
    typeSpec: TypeSpecifier,
    name: string | null,
    bitWidth: Expression | null,
    derived: DerivedDeclarator[],
    alignment: number | null,
    isPacked: boolean,
  ): StructFieldDeclaration {
    const start = typeSpec.start
    const end = bitWidth?.end ?? typeSpec.end
    return {
      type: 'StructFieldDeclaration',
      typeSpec,
      name,
      nameNode: null,
      bitWidth,
      derived,
      alignment,
      isPacked,
      start,
      end,
    }
  }

  enumVariant(name: string, value: Expression | null): EnumVariant {
    return { name, value }
  }

  // ---- Statements ----
  compoundStatement(
    start: number,
    end: number,
    items: BlockItem[],
    localLabels: string[],
  ): CompoundStatement {
    return {
      type: 'CompoundStatement',
      start,
      end,
      loc: this.loc(start, end),
      items,
      localLabels,
    }
  }

  expressionStatement(start: number, end: number, expr: Expression | null): ExpressionStatement {
    return { type: 'ExpressionStatement', start, end, loc: this.loc(start, end), expr }
  }

  returnStatement(start: number, end: number, expr: Expression | null): ReturnStatement {
    return { type: 'ReturnStatement', start, end, loc: this.loc(start, end), expr }
  }

  ifStatement(
    start: number,
    end: number,
    condition: Expression,
    consequent: Statement,
    alternate: Statement | null,
  ): IfStatement {
    return {
      type: 'IfStatement',
      start,
      end,
      loc: this.loc(start, end),
      condition,
      consequent,
      alternate,
    }
  }

  whileStatement(
    start: number,
    end: number,
    condition: Expression,
    body: Statement,
  ): WhileStatement {
    return { type: 'WhileStatement', start, end, loc: this.loc(start, end), condition, body }
  }

  doWhileStatement(
    start: number,
    end: number,
    body: Statement,
    condition: Expression,
  ): DoWhileStatement {
    return { type: 'DoWhileStatement', start, end, loc: this.loc(start, end), body, condition }
  }

  forStatement(
    start: number,
    end: number,
    init: ForInit | null,
    condition: Expression | null,
    update: Expression | null,
    body: Statement,
  ): ForStatement {
    return {
      type: 'ForStatement',
      start,
      end,
      loc: this.loc(start, end),
      init,
      condition,
      update,
      body,
    }
  }

  breakStatement(start: number, end: number): BreakStatement {
    return { type: 'BreakStatement', start, end, loc: this.loc(start, end) }
  }

  continueStatement(start: number, end: number): ContinueStatement {
    return { type: 'ContinueStatement', start, end, loc: this.loc(start, end) }
  }

  switchStatement(
    start: number,
    end: number,
    discriminant: Expression,
    body: Statement,
  ): SwitchStatement {
    return { type: 'SwitchStatement', start, end, loc: this.loc(start, end), discriminant, body }
  }

  caseStatement(start: number, end: number, test: Expression, body: Statement): CaseStatement {
    return { type: 'CaseStatement', start, end, loc: this.loc(start, end), test, body }
  }

  caseRangeStatement(
    start: number,
    end: number,
    low: Expression,
    high: Expression,
    body: Statement,
  ): CaseRangeStatement {
    return { type: 'CaseRangeStatement', start, end, loc: this.loc(start, end), low, high, body }
  }

  defaultStatement(start: number, end: number, body: Statement): DefaultStatement {
    return { type: 'DefaultStatement', start, end, loc: this.loc(start, end), body }
  }

  gotoStatement(start: number, end: number, label: string): GotoStatement {
    return { type: 'GotoStatement', start, end, loc: this.loc(start, end), label }
  }

  gotoIndirectStatement(start: number, end: number, expr: Expression): GotoIndirectStatement {
    return { type: 'GotoIndirectStatement', start, end, loc: this.loc(start, end), expr }
  }

  labelStatement(start: number, end: number, label: string, body: Statement): LabelStatement {
    return { type: 'LabelStatement', start, end, loc: this.loc(start, end), label, body }
  }

  declarationStatement(start: number, end: number, decl: Declaration): DeclarationStatement {
    return {
      type: 'DeclarationStatement',
      start,
      end,
      loc: this.loc(start, end),
      declaration: decl,
    }
  }

  inlineAsmStatement(
    start: number,
    end: number,
    template: string,
    outputs: AsmOperand[],
    inputs: AsmOperand[],
    clobbers: string[],
    gotoLabels: string[],
  ): InlineAsmStatement {
    return {
      type: 'InlineAsmStatement',
      start,
      end,
      loc: this.loc(start, end),
      template,
      outputs,
      inputs,
      clobbers,
      gotoLabels,
    }
  }

  // ---- For Init ----
  forInitDeclaration(declaration: Declaration): ForInitDeclaration {
    return { kind: 'Declaration', declaration }
  }

  forInitExpression(expr: Expression): ForInitExpression {
    return { kind: 'Expression', expr }
  }

  // ---- Asm Operand ----
  asmOperand(name: string | null, constraint: string, expr: Expression): AsmOperand {
    return { name, constraint, expr }
  }

  // ---- Generic Association ----
  genericAssociation(
    typeSpec: TypeSpecifier | null,
    expr: Expression,
    isConst: boolean,
  ): GenericAssociation {
    return { typeSpec, expr, isConst }
  }

  // ---- Sizeof Arg ----
  sizeofType(typeSpec: TypeSpecifier): SizeofArg {
    return { kind: 'Type', typeSpec }
  }

  sizeofExpr(expr: Expression): SizeofArg {
    return { kind: 'Expr', expr }
  }

  // ---- Expression Nodes ----
  intLiteral(start: number, end: number, value: number): IntLiteral {
    return { type: 'IntLiteral', start, end, loc: this.loc(start, end), value }
  }

  uintLiteral(start: number, end: number, value: number): UIntLiteral {
    return { type: 'UIntLiteral', start, end, loc: this.loc(start, end), value }
  }

  longLiteral(start: number, end: number, value: number): LongLiteral {
    return { type: 'LongLiteral', start, end, loc: this.loc(start, end), value }
  }

  ulongLiteral(start: number, end: number, value: number): ULongLiteral {
    return { type: 'ULongLiteral', start, end, loc: this.loc(start, end), value }
  }

  longLongLiteral(start: number, end: number, value: bigint): LongLongLiteral {
    return { type: 'LongLongLiteral', start, end, loc: this.loc(start, end), value }
  }

  ulongLongLiteral(start: number, end: number, value: bigint): ULongLongLiteral {
    return { type: 'ULongLongLiteral', start, end, loc: this.loc(start, end), value }
  }

  floatLiteral(start: number, end: number, value: number): FloatLiteral {
    return { type: 'FloatLiteral', start, end, loc: this.loc(start, end), value }
  }

  floatLiteralF32(start: number, end: number, value: number): FloatLiteralF32 {
    return { type: 'FloatLiteralF32', start, end, loc: this.loc(start, end), value }
  }

  floatLiteralLongDouble(
    start: number,
    end: number,
    value: number,
    f128Bytes: Uint8Array,
  ): FloatLiteralLongDouble {
    return {
      type: 'FloatLiteralLongDouble',
      start,
      end,
      loc: this.loc(start, end),
      value,
      f128Bytes,
    }
  }

  imaginaryLiteral(start: number, end: number, value: number): ImaginaryLiteral {
    return { type: 'ImaginaryLiteral', start, end, loc: this.loc(start, end), value }
  }

  imaginaryLiteralF32(start: number, end: number, value: number): ImaginaryLiteralF32 {
    return { type: 'ImaginaryLiteralF32', start, end, loc: this.loc(start, end), value }
  }

  imaginaryLiteralLongDouble(
    start: number,
    end: number,
    value: number,
    f128Bytes: Uint8Array,
  ): ImaginaryLiteralLongDouble {
    return {
      type: 'ImaginaryLiteralLongDouble',
      start,
      end,
      loc: this.loc(start, end),
      value,
      f128Bytes,
    }
  }

  stringLiteral(start: number, end: number, value: string): StringLiteral {
    return { type: 'StringLiteral', start, end, loc: this.loc(start, end), value }
  }

  wideStringLiteral(start: number, end: number, value: string): WideStringLiteral {
    return { type: 'WideStringLiteral', start, end, loc: this.loc(start, end), value }
  }

  char16StringLiteral(start: number, end: number, value: string): Char16StringLiteral {
    return { type: 'Char16StringLiteral', start, end, loc: this.loc(start, end), value }
  }

  charLiteral(start: number, end: number, value: string): CharLiteral {
    return { type: 'CharLiteral', start, end, loc: this.loc(start, end), value }
  }

  identifier(start: number, end: number, name: string): Identifier {
    return { type: 'Identifier', start, end, loc: this.loc(start, end), name }
  }

  binaryExpression(
    start: number,
    end: number,
    operator: BinOp,
    left: Expression,
    right: Expression,
  ): BinaryExpression {
    return {
      type: 'BinaryExpression',
      start,
      end,
      loc: this.loc(start, end),
      operator,
      left,
      right,
    }
  }

  unaryExpression(
    start: number,
    end: number,
    operator: UnaryOp,
    operand: Expression,
  ): UnaryExpression {
    return { type: 'UnaryExpression', start, end, loc: this.loc(start, end), operator, operand }
  }

  postfixExpression(
    start: number,
    end: number,
    operator: PostfixOp,
    operand: Expression,
  ): PostfixExpression {
    return { type: 'PostfixExpression', start, end, loc: this.loc(start, end), operator, operand }
  }

  assignExpression(
    start: number,
    end: number,
    left: Expression,
    right: Expression,
  ): AssignExpression {
    return { type: 'AssignExpression', start, end, loc: this.loc(start, end), left, right }
  }

  compoundAssignExpression(
    start: number,
    end: number,
    operator: BinOp,
    left: Expression,
    right: Expression,
  ): CompoundAssignExpression {
    return {
      type: 'CompoundAssignExpression',
      start,
      end,
      loc: this.loc(start, end),
      operator,
      left,
      right,
    }
  }

  conditionalExpression(
    start: number,
    end: number,
    condition: Expression,
    consequent: Expression,
    alternate: Expression,
  ): ConditionalExpression {
    return {
      type: 'ConditionalExpression',
      start,
      end,
      loc: this.loc(start, end),
      condition,
      consequent,
      alternate,
    }
  }

  gnuConditionalExpression(
    start: number,
    end: number,
    condition: Expression,
    alternate: Expression,
  ): GnuConditionalExpression {
    return {
      type: 'GnuConditionalExpression',
      start,
      end,
      loc: this.loc(start, end),
      condition,
      alternate,
    }
  }

  functionCallExpression(
    start: number,
    end: number,
    callee: Expression,
    args: Expression[],
  ): FunctionCallExpression {
    return { type: 'FunctionCallExpression', start, end, loc: this.loc(start, end), callee, args }
  }

  arraySubscriptExpression(
    start: number,
    end: number,
    object: Expression,
    index: Expression,
  ): ArraySubscriptExpression {
    return {
      type: 'ArraySubscriptExpression',
      start,
      end,
      loc: this.loc(start, end),
      object,
      index,
    }
  }

  memberAccessExpression(
    start: number,
    end: number,
    object: Expression,
    member: string,
  ): MemberAccessExpression {
    return { type: 'MemberAccessExpression', start, end, loc: this.loc(start, end), object, member }
  }

  pointerMemberAccessExpression(
    start: number,
    end: number,
    object: Expression,
    member: string,
  ): PointerMemberAccessExpression {
    return {
      type: 'PointerMemberAccessExpression',
      start,
      end,
      loc: this.loc(start, end),
      object,
      member,
    }
  }

  castExpression(
    start: number,
    end: number,
    typeSpec: TypeSpecifier,
    operand: Expression,
  ): CastExpression {
    return { type: 'CastExpression', start, end, loc: this.loc(start, end), typeSpec, operand }
  }

  compoundLiteralExpression(
    start: number,
    end: number,
    typeSpec: TypeSpecifier,
    init: Initializer,
  ): CompoundLiteralExpression {
    return {
      type: 'CompoundLiteralExpression',
      start,
      end,
      loc: this.loc(start, end),
      typeSpec,
      init,
    }
  }

  stmtExpression(start: number, end: number, body: CompoundStatement): StmtExpression {
    return { type: 'StmtExpression', start, end, loc: this.loc(start, end), body }
  }

  sizeofExpression(start: number, end: number, argument: SizeofArg): SizeofExpression {
    return { type: 'SizeofExpression', start, end, loc: this.loc(start, end), argument }
  }

  vaArgExpression(
    start: number,
    end: number,
    expr: Expression,
    typeSpec: TypeSpecifier,
  ): VaArgExpression {
    return { type: 'VaArgExpression', start, end, loc: this.loc(start, end), expr, typeSpec }
  }

  alignofExpression(start: number, end: number, typeSpec: TypeSpecifier): AlignofExpression {
    return { type: 'AlignofExpression', start, end, loc: this.loc(start, end), typeSpec }
  }

  alignofExprExpression(start: number, end: number, expr: Expression): AlignofExprExpression {
    return { type: 'AlignofExprExpression', start, end, loc: this.loc(start, end), expr }
  }

  gnuAlignofExpression(start: number, end: number, typeSpec: TypeSpecifier): GnuAlignofExpression {
    return { type: 'GnuAlignofExpression', start, end, loc: this.loc(start, end), typeSpec }
  }

  gnuAlignofExprExpression(start: number, end: number, expr: Expression): GnuAlignofExprExpression {
    return { type: 'GnuAlignofExprExpression', start, end, loc: this.loc(start, end), expr }
  }

  commaExpression(
    start: number,
    end: number,
    left: Expression,
    right: Expression,
  ): CommaExpression {
    return { type: 'CommaExpression', start, end, loc: this.loc(start, end), left, right }
  }

  addressOfExpression(start: number, end: number, operand: Expression): AddressOfExpression {
    return { type: 'AddressOfExpression', start, end, loc: this.loc(start, end), operand }
  }

  derefExpression(start: number, end: number, operand: Expression): DerefExpression {
    return { type: 'DerefExpression', start, end, loc: this.loc(start, end), operand }
  }

  genericSelectionExpression(
    start: number,
    end: number,
    controlling: Expression,
    associations: GenericAssociation[],
  ): GenericSelectionExpression {
    return {
      type: 'GenericSelectionExpression',
      start,
      end,
      loc: this.loc(start, end),
      controlling,
      associations,
    }
  }

  labelAddrExpression(start: number, end: number, label: string): LabelAddrExpression {
    return { type: 'LabelAddrExpression', start, end, loc: this.loc(start, end), label }
  }

  builtinTypesCompatiblePExpression(
    start: number,
    end: number,
    typeSpec1: TypeSpecifier,
    typeSpec2: TypeSpecifier,
  ): BuiltinTypesCompatiblePExpression {
    return {
      type: 'BuiltinTypesCompatiblePExpression',
      start,
      end,
      loc: this.loc(start, end),
      typeSpec1,
      typeSpec2,
    }
  }
}
