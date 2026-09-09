import { TokenKind, type Token } from './token'
import type { Diagnostic } from '../diagnostics'
import { spellingOf } from '../preprocessor/directives'

const INTEGER =
  /^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[0-7]*|[1-9]\d*)(?:[uU](?:ll|LL|[lL])?|(?:ll|LL|[lL])[uU]?)?[iIjJ]?$/
const DECIMAL_FLOAT = /^(?:(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)[fFlL]?[iIjJ]?$/
const HEX_FLOAT = /^0[xX](?:[\da-fA-F]+(?:\.[\da-fA-F]*)?|\.[\da-fA-F]+)[pP][+-]?\d+[fFlL]?[iIjJ]?$/

/** Validate C literals only after macro substitution/stringification has run.
 * A preprocessing number need not be a valid C constant in an unused macro,
 * discarded argument, or skipped conditional branch. */
export function validateLiteralTokens(
  tokens: Token[],
  source: string,
  diagnostics: Diagnostic[],
): void {
  for (const token of tokens) {
    if (token.kind > TokenKind.CharLiteral) continue
    const text = spellingOf(token, source)
    const report = (message: string): void => {
      diagnostics.push({
        message,
        start: token.start,
        end: token.end,
        phase: 'lexer',
        severity: 'error',
      })
    }
    if (/^[\d.]/.test(text)) {
      if (!INTEGER.test(text) && !DECIMAL_FLOAT.test(text) && !HEX_FLOAT.test(text))
        report('invalid numeric constant')
      continue
    }
    const prefix = /^(?:u8|u|U|L)?(["'])/.exec(text)
    if (!prefix) continue
    const quote = prefix[1]
    if (!text.endsWith(quote)) continue // scanner already diagnoses untermination
    const end = text.length - 1
    if (quote === "'" && prefix[0].length === end) report('empty character constant')
    for (let i = prefix[0].length; i < end; i++) {
      if (text[i] !== '\\') continue
      const escaped = text[++i]
      if (escaped === 'x') {
        if (!/[\da-fA-F]/.test(text[i + 1] ?? '')) report('hex escape requires at least one digit')
        while (i + 1 < end && /[\da-fA-F]/.test(text[i + 1])) i++
      } else if (escaped === 'u' || escaped === 'U') {
        const count = escaped === 'u' ? 4 : 8
        const digits = text.slice(i + 1, i + 1 + count)
        if (digits.length !== count || !/^[\da-fA-F]+$/.test(digits))
          report('incomplete universal character escape')
        else {
          const value = parseInt(digits, 16)
          if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff))
            report('invalid Unicode code point in escape')
          i += count
        }
      }
    }
  }
}
