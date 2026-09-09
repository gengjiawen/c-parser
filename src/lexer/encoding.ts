/** UTF-8 execution bytes, stored as one JavaScript code unit per byte. */
export function utf8Bytes(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out += ch
    else if (cp < 0x800) out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 63))
    else if (cp < 0x10000)
      out += String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    else
      out += String.fromCharCode(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      )
  }
  return out
}

/** Convert execution bytes back to text for filenames and pragma operands. */
export function utf8Text(bytes: string): string {
  try {
    let escaped = ''
    for (let i = 0; i < bytes.length; i++)
      escaped += '%' + bytes.charCodeAt(i).toString(16).padStart(2, '0')
    return decodeURIComponent(escaped)
  } catch {
    return bytes
  }
}
