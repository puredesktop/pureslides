/**
 * Read an inline style attribute without a layout engine.
 *
 * The checks and the type stylesheet read declarations straight off the
 * markup — the deck root's tokens, a heading's size — and both must work
 * under a bare DOMParser, where computed style does not exist.
 */
export function parseStyle(text: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!text) return out
  let depth = 0
  let quote = ''
  let start = 0
  const parts: string[] = []
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ';' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  for (const part of parts) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    const name = part.slice(0, colon).trim()
    const value = part.slice(colon + 1).trim().replace(/\s*!important$/i, '')
    if (name && value) out.set(name.startsWith('--') ? name : name.toLowerCase(), value)
  }
  return out
}

/**
 * Substitute `var(--x, fallback)` from a token map, innermost first. A
 * variable with no token and no fallback resolves to null: unknown.
 */
export function resolveVars(value: string, tokens: Map<string, string>, depth = 0): string | null {
  if (depth > 8) return null
  const at = value.lastIndexOf('var(')
  if (at < 0) return value
  let level = 0
  let end = -1
  for (let i = at + 3; i < value.length; i += 1) {
    if (value[i] === '(') level += 1
    else if (value[i] === ')') {
      level -= 1
      if (level === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null
  const inner = value.slice(at + 4, end)
  const comma = inner.indexOf(',')
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim()
  const fallback = comma < 0 ? null : inner.slice(comma + 1).trim()
  const replacement = tokens.get(name) ?? fallback
  if (replacement == null) return null
  return resolveVars(value.slice(0, at) + replacement + value.slice(end + 1), tokens, depth + 1)
}
