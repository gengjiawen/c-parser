// Predefined-macro profiles. System #includes are recorded but never read,
// so alongside the compiler's own predefined macros the default profile
// also carries the header constants real sources rely on for #if
// arithmetic (<stdint.h>/<limits.h>), <stdbool.h>, and <stdarg.h> shims
// that forward to the __builtin_* forms the parser understands.

import { Scanner } from '../lexer/scanner'
import { Token, TokenKind, TokenFlags, tokenStaticSpelling } from '../lexer/token'
import type { Diagnostic } from '../diagnostics'
import type { MacroTable } from './macro-table'
import { DirectiveContext, handleDirectiveLine } from './directives'

export type ProfileName = 'gcc-linux-x64' | 'none'

// Modeled on gcc 12.2 -std=gnu11 for x86_64-linux (trimmed to what real
// code tests). Order matters only for readability; entries whose name
// contains `(` define function-like macros.
const GCC_LINUX_X64: ReadonlyArray<readonly [string, string]> = [
  // Compiler identity and standard version
  ['__GNUC__', '12'],
  ['__GNUC_MINOR__', '2'],
  ['__GNUC_PATCHLEVEL__', '0'],
  ['__STDC__', '1'],
  ['__STDC_VERSION__', '201112L'],
  ['__STDC_HOSTED__', '1'],
  ['__STDC_UTF_16__', '1'],
  ['__STDC_UTF_32__', '1'],
  // Target
  ['__ELF__', '1'],
  ['__gnu_linux__', '1'],
  ['__linux__', '1'],
  ['__linux', '1'],
  ['linux', '1'],
  ['__unix__', '1'],
  ['__unix', '1'],
  ['unix', '1'],
  ['__x86_64__', '1'],
  ['__x86_64', '1'],
  ['__amd64__', '1'],
  ['__amd64', '1'],
  ['__LP64__', '1'],
  ['_LP64', '1'],
  ['__CHAR_BIT__', '8'],
  ['__SIZEOF_SHORT__', '2'],
  ['__SIZEOF_INT__', '4'],
  ['__SIZEOF_LONG__', '8'],
  ['__SIZEOF_LONG_LONG__', '8'],
  ['__SIZEOF_POINTER__', '8'],
  ['__SIZEOF_SIZE_T__', '8'],
  ['__SIZEOF_PTRDIFF_T__', '8'],
  ['__SIZEOF_WCHAR_T__', '4'],
  ['__SIZEOF_FLOAT__', '4'],
  ['__SIZEOF_DOUBLE__', '8'],
  ['__SIZEOF_LONG_DOUBLE__', '16'],
  ['__ORDER_LITTLE_ENDIAN__', '1234'],
  ['__ORDER_BIG_ENDIAN__', '4321'],
  ['__ORDER_PDP_ENDIAN__', '3412'],
  ['__BYTE_ORDER__', '1234'],
  // <limits.h>
  ['CHAR_BIT', '8'],
  ['SCHAR_MIN', '(-128)'],
  ['SCHAR_MAX', '127'],
  ['UCHAR_MAX', '255'],
  ['CHAR_MIN', '(-128)'],
  ['CHAR_MAX', '127'],
  ['SHRT_MIN', '(-32768)'],
  ['SHRT_MAX', '32767'],
  ['USHRT_MAX', '65535'],
  ['INT_MIN', '(-2147483647 - 1)'],
  ['INT_MAX', '2147483647'],
  ['UINT_MAX', '4294967295U'],
  ['LONG_MIN', '(-9223372036854775807L - 1)'],
  ['LONG_MAX', '9223372036854775807L'],
  ['ULONG_MAX', '18446744073709551615UL'],
  ['LLONG_MIN', '(-9223372036854775807LL - 1)'],
  ['LLONG_MAX', '9223372036854775807LL'],
  ['ULLONG_MAX', '18446744073709551615ULL'],
  ['MB_LEN_MAX', '16'],
  // <stdint.h>
  ['INT8_MIN', '(-128)'],
  ['INT8_MAX', '127'],
  ['UINT8_MAX', '255'],
  ['INT16_MIN', '(-32768)'],
  ['INT16_MAX', '32767'],
  ['UINT16_MAX', '65535'],
  ['INT32_MIN', '(-2147483647 - 1)'],
  ['INT32_MAX', '2147483647'],
  ['UINT32_MAX', '4294967295U'],
  ['INT64_MIN', '(-9223372036854775807LL - 1)'],
  ['INT64_MAX', '9223372036854775807LL'],
  ['UINT64_MAX', '18446744073709551615ULL'],
  ['INTPTR_MIN', '(-9223372036854775807L - 1)'],
  ['INTPTR_MAX', '9223372036854775807L'],
  ['UINTPTR_MAX', '18446744073709551615UL'],
  ['INTMAX_MIN', '(-9223372036854775807LL - 1)'],
  ['INTMAX_MAX', '9223372036854775807LL'],
  ['UINTMAX_MAX', '18446744073709551615ULL'],
  ['PTRDIFF_MIN', '(-9223372036854775807L - 1)'],
  ['PTRDIFF_MAX', '9223372036854775807L'],
  ['SIZE_MAX', '18446744073709551615UL'],
  ['WCHAR_MIN', '(-2147483647 - 1)'],
  ['WCHAR_MAX', '2147483647'],
  ['WINT_MIN', '0U'],
  ['WINT_MAX', '4294967295U'],
  ['SIG_ATOMIC_MIN', '(-2147483647 - 1)'],
  ['SIG_ATOMIC_MAX', '2147483647'],
  ['INT8_C(c)', 'c'],
  ['INT16_C(c)', 'c'],
  ['INT32_C(c)', 'c'],
  ['INT64_C(c)', 'c ## LL'],
  ['UINT8_C(c)', 'c'],
  ['UINT16_C(c)', 'c'],
  ['UINT32_C(c)', 'c ## U'],
  ['UINT64_C(c)', 'c ## ULL'],
  ['INTMAX_C(c)', 'c ## LL'],
  ['UINTMAX_C(c)', 'c ## ULL'],
  // <inttypes.h> printf format macros (LP64: 64-bit/pointer widths take "l")
  ...inttypesFormatMacros(),
  // <stdbool.h>
  ['bool', '_Bool'],
  ['true', '1'],
  ['false', '0'],
  ['__bool_true_false_are_defined', '1'],
  // <stdarg.h> shims: forward to the builtins the parser knows
  ['va_start(v, l)', '__builtin_va_start(v, l)'],
  ['va_end(v)', '__builtin_va_end(v)'],
  ['va_arg(v, l)', '__builtin_va_arg(v, l)'],
  ['va_copy(d, s)', '__builtin_va_copy(d, s)'],
]

/** PRI{d,i,o,u,x,X}{8,16,32,64,PTR,MAX}, glibc x86_64 values. */
function inttypesFormatMacros(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = []
  const widths: ReadonlyArray<readonly [string, string]> = [
    ['8', ''],
    ['16', ''],
    ['32', ''],
    ['64', 'l'],
    ['PTR', 'l'],
    ['MAX', 'l'],
  ]
  for (const [width, prefix] of widths) {
    for (const conv of ['d', 'i', 'o', 'u', 'x', 'X']) {
      out.push([`PRI${conv}${width}`, `"${prefix}${conv}"`])
    }
  }
  return out
}

/**
 * Seed a macro table with the profile's macros plus user-supplied ones
 * (`macros` option, like -D on a compiler command line): string = body
 * text, number = that literal, true = `1`; false removes the macro even if
 * the profile defines it. A key like 'MAX(a, b)' defines a function-like
 * macro. Diagnostics from malformed user macros are reported at offset 0.
 */
export function seedPredefinedMacros(
  table: MacroTable,
  profile: ProfileName,
  userMacros: Record<string, string | number | boolean> | undefined,
  gnuExtensions: boolean,
  diagnostics: Diagnostic[],
): void {
  const lines: string[] = []
  const undefs: string[] = []
  if (profile !== 'none') {
    for (const [name, body] of GCC_LINUX_X64) lines.push(defineLine(name, body))
  }
  if (userMacros !== undefined) {
    for (const [name, value] of Object.entries(userMacros)) {
      if (value === false) {
        undefs.push(name.replace(/\(.*$/, ''))
        continue
      }
      const body = value === true ? '1' : String(value)
      lines.push(defineLine(name, body))
    }
  }
  if (lines.length > 0) {
    const src = lines.join('\n') + '\n'
    const scanner = new Scanner(src, gnuExtensions)
    const tokens = scanner.scan()
    const scratch: Diagnostic[] = []
    const ctx: DirectiveContext = {
      source: src,
      gnuExtensions,
      diagnostics: scratch,
      macros: table,
    }
    let i = 0
    while (tokens[i].kind !== TokenKind.Eof) {
      // Every line starts with a `#` by construction.
      const hash = tokens[i]
      let j = i + 1
      while (tokens[j].kind !== TokenKind.Eof && ((tokens[j].flags ?? 0) & TokenFlags.BOL) === 0) {
        j++
      }
      handleDirectiveLine(hash, tokens.slice(i + 1, j), ctx)
      i = j
    }
    // Detach every stored token from the synthetic source: spans point at
    // offset 0 and spellings that need one live in `value` (Synthetic).
    for (const [, def] of table.entries()) {
      def.nameToken = internToken(def.nameToken, src)
      def.body = def.body.map((t) => internToken(t, src))
    }
    for (const d of [...scanner.diagnostics, ...scratch]) {
      // A user macro overriding a profile macro is intentional, not a
      // redefinition worth warning about.
      if (d.message.includes('macro redefined')) continue
      diagnostics.push({
        message: `in predefined macros: ${d.message}`,
        start: 0,
        end: 0,
        phase: 'preprocessor',
        severity: d.severity,
      })
    }
  }
  for (const name of undefs) table.undef(name)
}

function defineLine(name: string, body: string): string {
  // Bodies come from trusted tables or user option values; keep each
  // definition on one logical line.
  return `#define ${name} ${body}`.replace(/[\n\r]+/g, ' ')
}

/**
 * Rebuild a profile token so nothing references the synthetic source:
 * zero span, spelling recoverable from the kind (keywords/punctuation),
 * `value` (identifiers), or the captured `spelling` (literals — keeping
 * the exact suffixed text, e.g. `9223372036854775807LL`). SpaceBefore
 * survives for macro-identity comparison.
 */
function internToken(t: Token, src: string): Token {
  const out: Token = { kind: t.kind, start: 0, end: 0 }
  if (t.value !== undefined) out.value = t.value
  if (t.bigValue !== undefined) out.bigValue = t.bigValue
  let flags = (t.flags ?? 0) & TokenFlags.SpaceBefore
  if (t.kind !== TokenKind.Identifier && tokenStaticSpelling(t.kind) === undefined) {
    flags |= TokenFlags.Synthetic
    out.spelling = src.slice(t.start, t.end)
    if (out.value === undefined && out.bigValue === undefined) {
      out.value = out.spelling
    }
  }
  if (flags !== 0) out.flags = flags
  return out
}
