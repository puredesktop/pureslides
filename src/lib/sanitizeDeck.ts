/**
 * Security and safety helpers for untrusted deck markup and package paths.
 */

const DANGEROUS_ATTR = /^on[a-z]/i
const DANGEROUS_SCHEME = /^(?:javascript|vbscript):/i
const DANGEROUS_DATA_URL = /^data:(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml)/i

function isDangerousUrl(attrName: string, rawValue: string): boolean {
  const collapsed = rawValue.replace(/[\u0000-\u0020]+/g, '')
  if (DANGEROUS_SCHEME.test(collapsed)) return true
  if (DANGEROUS_DATA_URL.test(collapsed)) return true
  if (
    (attrName === 'href' || attrName === 'xlink:href' || attrName === 'formaction' || attrName === 'action') &&
    /^data:/i.test(collapsed)
  ) {
    return true
  }
  return false
}

/** Escape plain text so it is safe to interpolate into HTML text or attributes. */
export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip executable markup from deck HTML before mounting it in a same-origin
 * measuring frame (measureDeck / measureVideoPlacements). PureSlides' own
 * seek script is injected AFTER sanitization so only our trusted measurement
 * code can run with same-origin DOM access.
 */
export function sanitizeForSameOriginMeasure(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<(script|noscript|template|iframe|object|embed|applet|base|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(meta|base|embed)\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Strip executable / mXSS-prone / navigation / SVG animation elements.
  // <noscript> MUST be removed because DOMParser parses with scripting OFF
  // while the measuring frame mounts with scripting ON (scripting-flag mXSS).
  doc
    .querySelectorAll('script, noscript, template, iframe, object, embed, applet, base, meta, animate, set')
    .forEach(node => node.remove())
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (DANGEROUS_ATTR.test(name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (
        (name === 'src' || name === 'href' || name === 'xlink:href' || name === 'formaction' || name === 'action') &&
        isDangerousUrl(name, attr.value)
      ) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

/**
 * Validate and normalize a relative path inside a deck package (never absolute,
 * never a URL scheme, never containing `..`, backslashes, or NUL bytes — even
 * after percent-decoding). Returns the clean normalized path without leading `./`,
 * or `null` when unsafe.
 */
export function resolveSafePackageRelativePath(raw: string): string | null {
  if (!raw) return null
  const stripped = raw.split(/[?#]/)[0].trim()
  if (!stripped) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped)) return null
  let decoded = stripped
  try {
    decoded = decodeURIComponent(stripped)
  } catch {
    return null
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\')) return null
  // Re-check for URL schemes / drive letters AFTER percent-decoding (e.g. C%3A/... or javascript%3A...).
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded.trim())) return null
  const normalized = decoded.replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/')) return null
  const parts = normalized.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) return null
  return normalized
}

/**
 * Validate a single filename or relative path inside `assets/` (rejects traversal,
 * leading slashes, backslashes, NUL bytes, and URL schemes).
 */
export function resolveSafeAssetSubpath(raw: string): string | null {
  const withoutPrefix = raw.trim().replace(/^(?:\.\/)?assets\//, '')
  return resolveSafePackageRelativePath(withoutPrefix)
}

/**
 * Validate a single asset filename (no directory separators, no `.` or `..`).
 */
export function isSafeAssetFileName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return false
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) return false
  return true
}
