/**
 * Which code points may appear in an identifier — C11 Annex D, as GCC
 * actually implements it for `-std=gnu11` (verified against
 * `gcc -std=gnu11 -fsyntax-only`, GCC 15.2).
 *
 * C11 6.4.2.1 spells an identifier out of basic letters, digits, `_`, and
 * *universal character names*; GCC additionally lets the extended characters
 * appear literally (UTF-8 in the source, so single code points here). Both
 * spellings draw from the same table, which is the one below.
 *
 * Everything in this file is reached only for a code point >= 0x80 or for a
 * `\uXXXX` / `\UXXXXXXXX` escape, never from the scanner's ASCII hot loop.
 */

/**
 * C11 Annex D.1, "Ranges of characters allowed", as sorted [lo, hi] pairs.
 *
 * One deliberate deviation from the printed standard: D.1 reads
 * `F900−FD3D, FD40−FDCF`, leaving U+FD3E/U+FD3F (the ORNATE PARENTHESES)
 * out. `gcc -std=gnu11` accepts them — only `-pedantic` rejects them — so
 * the range is stored contiguously as F900−FDCF to match the compiler this
 * parser models. Every other bound below was probed at both edges and
 * agrees with Annex D exactly.
 */
// prettier-ignore
const ALLOWED: readonly number[] = [
  0x00a8, 0x00a8,
  0x00aa, 0x00aa,
  0x00ad, 0x00ad,
  0x00af, 0x00af,
  0x00b2, 0x00b5,
  0x00b7, 0x00ba,
  0x00bc, 0x00be,
  0x00c0, 0x00d6,
  0x00d8, 0x00f6,
  0x00f8, 0x00ff,
  0x0100, 0x167f,
  0x1681, 0x180d,
  0x180f, 0x1fff,
  0x200b, 0x200d,
  0x202a, 0x202e,
  0x203f, 0x2040,
  0x2054, 0x2054,
  0x2060, 0x206f,
  0x2070, 0x218f,
  0x2460, 0x24ff,
  0x2776, 0x2793,
  0x2c00, 0x2dff,
  0x2e80, 0x2fff,
  0x3004, 0x3007,
  0x3021, 0x302f,
  0x3031, 0x303f,
  0x3040, 0xd7ff,
  0xf900, 0xfdcf, // Annex D.1: F900-FD3D, FD40-FDCF; GCC gnu11 also takes FD3E/FD3F
  0xfdf0, 0xfe44,
  0xfe47, 0xfffd,
  0x10000, 0x1fffd,
  0x20000, 0x2fffd,
  0x30000, 0x3fffd,
  0x40000, 0x4fffd,
  0x50000, 0x5fffd,
  0x60000, 0x6fffd,
  0x70000, 0x7fffd,
  0x80000, 0x8fffd,
  0x90000, 0x9fffd,
  0xa0000, 0xafffd,
  0xb0000, 0xbfffd,
  0xc0000, 0xcfffd,
  0xd0000, 0xdfffd,
  0xe0000, 0xefffd,
]

/**
 * C11 Annex D.2, "Ranges of characters disallowed initially" — the combining
 * marks. They may continue an identifier but may not open one; GCC enforces
 * exactly these four ranges ("… is not valid at the start of an identifier").
 */
// prettier-ignore
const DISALLOWED_INITIAL: readonly number[] = [
  0x0300, 0x036f,
  0x1dc0, 0x1dff,
  0x20d0, 0x20ff,
  0xfe20, 0xfe2f,
]

/** `$`, which GCC allows in identifiers and therefore also as `$`. */
const CP_DOLLAR = 0x24

function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0
  let hi = (ranges.length >> 1) - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cp < ranges[mid * 2]) hi = mid - 1
    else if (cp > ranges[mid * 2 + 1]) lo = mid + 1
    else return true
  }
  return false
}

/** May `cp` appear anywhere in an identifier (C11 Annex D.1)? */
export function isExtendedIdentContinue(cp: number): boolean {
  return cp === CP_DOLLAR || inRanges(ALLOWED, cp)
}

/** May `cp` open an identifier (Annex D.1 minus D.2)? */
export function isExtendedIdentStart(cp: number): boolean {
  return isExtendedIdentContinue(cp) && !inRanges(DISALLOWED_INITIAL, cp)
}

/**
 * Render `cp` for a diagnostic. Printable code points speak for themselves;
 * an unpaired surrogate has no textual form, so it is shown escaped rather
 * than smuggled into the message as a lone code unit.
 */
export function describeCodePoint(cp: number): string {
  if (cp >= 0xd800 && cp <= 0xdfff) return '\\u' + cp.toString(16).padStart(4, '0')
  return String.fromCodePoint(cp)
}
