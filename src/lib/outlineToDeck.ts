/**
 * Deterministic Zero-AI Markdown-to-Deck Compiler.
 *
 * Turns a clean Markdown outline into structured PureSlides markup:
 * - `---` separates slides
 * - `#` / `##` sets the slide headline
 * - `- ` / `* ` bullets (with optional `[step]` suffix/prefix) build a `points` slide
 * - `> ` quotes (with optional `— attribution`) build a `quote` slide
 * - `80% | label` stat lines build a `stat` (1) or `figures` (2–3+) slide
 * - `| col |` markdown tables build a clean table slide
 * - `Notes:` captures speaker notes for presenter view
 *
 * Also builds the rich 5-slide Standalone Dev Mode sample deck.
 */
import { createDefaultDeckDocument, type DeckDocument } from './deckDocument'
import { addSlide, clearSlides } from './slides'

export type ParsedSlideKind =
  | 'title'
  | 'statement'
  | 'points'
  | 'quote'
  | 'stat'
  | 'figures'
  | 'table'

export interface ParsedOutlineSlide {
  kind: ParsedSlideKind
  kicker?: string
  headline: string
  support: string
  bullets: Array<{ text: string; step: boolean }>
  stats: Array<{ value: string; label: string }>
  quote?: { text: string; attribution: string }
  table?: { headers: string[]; rows: string[][] }
  notes: string
  steps: number
  html: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FRAME =
  'position: absolute; inset: 0; font-family: var(--slide-body-font, system-ui, sans-serif); display: flex; flex-direction: column; background: var(--slide-bg, #f8f9fc); color: var(--slide-ink, #192338)'
const HEADING =
  'font-family: var(--slide-heading-font, system-ui, sans-serif); font-weight: var(--slide-heading-weight, 700)'
const BODY = 'font-family: var(--slide-body-font, system-ui, sans-serif)'
const DISPLAY = `margin: 0; ${HEADING}; font-size: var(--slide-size-display, 76px); line-height: var(--slide-leading-display, 1.04); letter-spacing: var(--slide-tracking-display, -0.035em); max-width: var(--slide-measure-display, 16ch); text-wrap: balance`
const HEADLINE = `margin: 0; ${HEADING}; font-size: var(--slide-size-headline, 57px); line-height: var(--slide-leading-headline, 1.08); letter-spacing: var(--slide-tracking-headline, -0.025em); max-width: var(--slide-measure-headline, 24ch); text-wrap: balance`
const LEAD = `margin: 0; ${BODY}; font-size: var(--slide-size-lead, 32px); line-height: var(--slide-leading-lead, 1.32); letter-spacing: var(--slide-tracking-body, 0em); max-width: var(--slide-measure-lead, 36ch); text-wrap: pretty`
const TEXT = `margin: 0; ${BODY}; font-size: var(--slide-size-body, 24px); line-height: var(--slide-leading-body, 1.45); letter-spacing: var(--slide-tracking-body, 0em); max-width: var(--slide-measure-body, 58ch); text-wrap: pretty`
const LABEL = `font-family: var(--slide-label-font, var(--slide-body-font, system-ui, sans-serif)); font-size: var(--slide-size-label, 18px); font-weight: var(--slide-label-weight, 600); line-height: 1.2; letter-spacing: var(--slide-tracking-label, 0.12em); text-transform: uppercase; font-variant-numeric: tabular-nums lining-nums`
const MUTED = 'color: var(--slide-muted, #4f5d76)'
const ACCENT = 'color: var(--slide-accent, #2f52c8)'
const PAD = 'padding: 80px 96px'

function notesHtml(notes: string): string {
  if (!notes.trim()) return ''
  return `\n  <div data-notes hidden style="display: none">${escapeHtml(notes.trim())}</div>`
}

function isTableDividerRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{2,}:?$/.test(cell.trim()))
}

function parseTableLine(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

const STAT_LINE = /^([^\s|][^|]{0,16})\s*\|\s*(.+)$/

function parseSingleSlide(rawBlock: string, slideIndex: number): ParsedOutlineSlide | null {
  const lines = rawBlock.replace(/\r\n/g, '\n').split('\n')
  let headline = ''
  let kicker = ''
  const paragraphs: string[] = []
  const bullets: Array<{ text: string; step: boolean }> = []
  const stats: Array<{ value: string; label: string }> = []
  const quoteLines: string[] = []
  const tableLines: string[] = []
  const notesLines: string[] = []
  let inNotes = false

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (inNotes) {
      notesLines.push(rawLine)
      continue
    }
    if (!trimmed) continue

    const notesMatch = /^notes\s*:\s*(.*)$/i.exec(trimmed)
    if (notesMatch) {
      inNotes = true
      if (notesMatch[1].trim()) notesLines.push(notesMatch[1].trim())
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      if (!headline) {
        headline = headingMatch[2].trim()
      } else if (!kicker && headingMatch[1].length >= 2) {
        paragraphs.push(headingMatch[2].trim())
      } else {
        paragraphs.push(headingMatch[2].trim())
      }
      continue
    }

    const kickerMatch = /^kicker\s*:\s*(.+)$/i.exec(trimmed)
    if (kickerMatch) {
      kicker = kickerMatch[1].trim()
      continue
    }

    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      tableLines.push(trimmed)
      continue
    }

    const quoteMatch = /^>\s*(.+)$/.exec(trimmed)
    if (quoteMatch) {
      quoteLines.push(quoteMatch[1].trim())
      continue
    }

    const bulletMatch = /^[-*•]\s+(.+)$/.exec(trimmed)
    if (bulletMatch) {
      let text = bulletMatch[1].trim()
      let step = false
      if (/^\[step\]\s*/i.test(text)) {
        step = true
        text = text.replace(/^\[step\]\s*/i, '').trim()
      } else if (/\s*\[step\]$/i.test(text)) {
        step = true
        text = text.replace(/\s*\[step\]$/i, '').trim()
      }
      if (text) bullets.push({ text, step })
      continue
    }

    const statMatch = STAT_LINE.exec(trimmed)
    if (statMatch && /\d/.test(statMatch[1])) {
      stats.push({ value: statMatch[1].trim(), label: statMatch[2].trim() })
      continue
    }

    paragraphs.push(trimmed)
  }

  const notes = notesLines.join('\n').trim()
  if (
    !headline &&
    !paragraphs.length &&
    !bullets.length &&
    !stats.length &&
    !quoteLines.length &&
    !tableLines.length
  ) {
    return null
  }

  const support = paragraphs.join(' ').trim()

  // 1. Table slide
  if (tableLines.length >= 2) {
    const parsedRows = tableLines.map(parseTableLine)
    const headers = parsedRows[0]
    const bodyRows = parsedRows
      .slice(1)
      .filter(row => !isTableDividerRow(row))
    const finalHeadline = headline || 'Summary'
    const headerCells = headers
      .map(
        (cell, idx) =>
          `<th style="padding: 12px 16px; ${LABEL}; ${idx === headers.length - 1 ? ACCENT : MUTED}">${escapeHtml(cell)}</th>`,
      )
      .join('')
    const rowsMarkup = bodyRows
      .map(
        row =>
          `<tr style="border-bottom: 1px solid var(--slide-line, #cdd6e6)">${headers
            .map((_h, colIdx) => {
              const val = row[colIdx] ?? ''
              const weight = colIdx === 0 ? 'font-weight: 600;' : ''
              return `<td style="padding: 14px 16px; ${weight}">${escapeHtml(val)}</td>`
            })
            .join('')}</tr>`,
      )
      .join('\n      ')
    const html = `<div data-slide data-block="table" style="${FRAME}; justify-content: center; gap: 28px; ${PAD}">
  <h1 style="${HEADLINE}">${escapeHtml(finalHeadline)}</h1>
  ${support ? `<p style="${TEXT}; ${MUTED}">${escapeHtml(support)}</p>` : ''}
  <table style="width: 100%; border-collapse: collapse; ${BODY}; font-size: var(--slide-size-body, 24px); font-variant-numeric: tabular-nums">
    <thead>
      <tr style="border-bottom: 2px solid var(--slide-ink, #192338); text-align: left">${headerCells}</tr>
    </thead>
    <tbody>
      ${rowsMarkup}
    </tbody>
  </table>${notesHtml(notes)}
</div>`
    return {
      kind: 'table',
      headline: finalHeadline,
      support,
      bullets: [],
      stats: [],
      table: { headers, rows: bodyRows },
      notes,
      steps: 0,
      html,
    }
  }

  // 2. Quote slide
  if (quoteLines.length) {
    let quoteText = ''
    let attribution = support
    const bodyParts: string[] = []
    for (const q of quoteLines) {
      if (/^[—–-]{1,2}\s*/.test(q)) {
        attribution = q.replace(/^[—–-]{1,2}\s*/, '').trim()
      } else {
        bodyParts.push(q)
      }
    }
    quoteText = bodyParts.join(' ').replace(/^[“"']+|[”"']+$/g, '').trim() || headline
    const attrText = attribution || headline || 'Attribution'
    const html = `<div data-slide data-block="quote" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 136px; background: var(--slide-surface, #eaf0fb)">
  <h1 style="${HEADLINE}; max-width: 26ch; font-style: var(--slide-quote-style, normal); font-weight: var(--slide-quote-weight, 480); text-indent: -0.42em">“${escapeHtml(quoteText)}”</h1>
  <p style="${LABEL}; ${MUTED}">${escapeHtml(attrText)}</p>${notesHtml(notes)}
</div>`
    return {
      kind: 'quote',
      headline: quoteText,
      support: attrText,
      bullets: [],
      stats: [],
      quote: { text: quoteText, attribution: attrText },
      notes,
      steps: 0,
      html,
    }
  }

  // 3. Stat / Figures slide
  if (stats.length === 1 && !bullets.length) {
    const [only] = stats
    const html = `<div data-slide data-block="stat" style="${FRAME}; justify-content: center; gap: 24px; padding: 80px 112px">
  ${headline ? `<div style="${LABEL}; ${MUTED}">${escapeHtml(headline)}</div>` : ''}
  <h1 style="margin: 0; ${HEADING}; font-size: var(--slide-size-stat, 135px); line-height: 0.92; letter-spacing: var(--slide-tracking-display, -0.035em); font-variant-numeric: tabular-nums lining-nums; ${ACCENT}">${escapeHtml(only.value)}</h1>
  <p style="${LEAD}; max-width: 28ch">${escapeHtml(only.label)}</p>${notesHtml(notes)}
</div>`
    return {
      kind: 'stat',
      headline: headline || only.value,
      support: only.label,
      bullets: [],
      stats,
      notes,
      steps: 0,
      html,
    }
  }

  if (stats.length >= 2) {
    const shown = stats.slice(0, 4)
    const finalHeadline = headline || 'Key figures'
    const cols = shown
      .map(
        item => `<div style="display: flex; flex-direction: column; gap: 14px; padding-top: 22px; border-top: 1px solid var(--slide-line, #cdd6e6)">
      <div style="${HEADING}; font-size: var(--slide-size-display, 76px); line-height: 1; letter-spacing: var(--slide-tracking-display, -0.035em); font-variant-numeric: tabular-nums lining-nums; ${ACCENT}">${escapeHtml(item.value)}</div>
      <div style="${TEXT}; ${MUTED}; max-width: 22ch">${escapeHtml(item.label)}</div>
    </div>`,
      )
      .join('\n    ')
    const html = `<div data-slide data-block="figures" style="${FRAME}; justify-content: center; gap: 48px; ${PAD}">
  <h1 style="${HEADLINE}">${escapeHtml(finalHeadline)}</h1>
  <div style="display: grid; grid-template-columns: repeat(${Math.min(3, shown.length)}, minmax(0, 1fr)); gap: 40px">
    ${cols}
  </div>${notesHtml(notes)}
</div>`
    return {
      kind: 'figures',
      headline: finalHeadline,
      support,
      bullets: [],
      stats: shown,
      notes,
      steps: 0,
      html,
    }
  }

  // 4. Bullets / Points slide
  if (bullets.length) {
    const finalHeadline = headline || 'Key points'
    let stepCounter = 0
    const rows = bullets
      .map(bullet => {
        const stepAttr = bullet.step ? ` data-step="${++stepCounter}"` : ''
        return `<div${stepAttr} style="${LEAD}; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)">${escapeHtml(bullet.text)}</div>`
      })
      .join('\n    ')
    const html = `<div data-slide data-block="points" style="${FRAME}; justify-content: center; gap: 22px; ${PAD}">
  <h1 style="${HEADLINE}">${escapeHtml(finalHeadline)}</h1>
  ${support ? `<p style="${TEXT}; ${MUTED}">${escapeHtml(support)}</p>` : ''}
  <div style="display: flex; flex-direction: column; max-width: 860px; margin-top: 16px; border-top: 1px solid var(--slide-line, #cdd6e6)">
    ${rows}
  </div>${notesHtml(notes)}
</div>`
    return {
      kind: 'points',
      headline: finalHeadline,
      support,
      bullets,
      stats: [],
      notes,
      steps: stepCounter,
      html,
    }
  }

  // 5. Title (first slide) vs Statement slide
  const finalHeadline = headline || support || 'Untitled slide'
  const finalSupport = headline ? support : ''
  if (slideIndex === 0) {
    const html = `<div data-slide data-block="title" style="${FRAME}; align-items: flex-start; justify-content: center; gap: 30px; padding: 80px 104px">
  ${kicker ? `<div style="${LABEL}; ${ACCENT}">${escapeHtml(kicker)}</div>` : `<div style="${LABEL}; ${ACCENT}">Presentation</div>`}
  <h1 style="${DISPLAY}">${escapeHtml(finalHeadline)}</h1>
  ${finalSupport ? `<p style="${LEAD}; ${MUTED}">${escapeHtml(finalSupport)}</p>` : ''}${notesHtml(notes)}
</div>`
    return {
      kind: 'title',
      kicker: kicker || 'Presentation',
      headline: finalHeadline,
      support: finalSupport,
      bullets: [],
      stats: [],
      notes,
      steps: 0,
      html,
    }
  }

  const html = `<div data-slide data-block="statement" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 112px">
  <h1 style="${DISPLAY}; max-width: 18ch">${escapeHtml(finalHeadline)}</h1>
  <div style="width: 96px; height: 4px; background: var(--slide-accent, #2f52c8)"></div>
  ${finalSupport ? `<p style="${LEAD}; ${MUTED}">${escapeHtml(finalSupport)}</p>` : ''}${notesHtml(notes)}
</div>`
  return {
    kind: 'statement',
    headline: finalHeadline,
    support: finalSupport,
    bullets: [],
    stats: [],
    notes,
    steps: 0,
    html,
  }
}

/** Parse a Markdown outline separated by `---` into structured slide objects. */
export function parseOutlineToSlides(markdown: string): ParsedOutlineSlide[] {
  const sections = markdown
    .replace(/\r\n/g, '\n')
    .split(/^\s*---+\s*$/m)
    .map(chunk => chunk.trim())
    .filter(Boolean)

  const slides: ParsedOutlineSlide[] = []
  sections.forEach(chunk => {
    const parsed = parseSingleSlide(chunk, slides.length)
    if (parsed) slides.push(parsed)
  })
  return slides
}

/** Compile Markdown outline into deck HTML (replacing or appending to `baseHtml`). */
export function outlineToDeckHtml(
  baseHtml: string,
  markdown: string,
  mode: 'replace' | 'append' = 'replace',
): { html: string; slides: ParsedOutlineSlide[] } {
  const parsed = parseOutlineToSlides(markdown)
  if (!parsed.length) return { html: baseHtml, slides: [] }
  let next = mode === 'replace' ? clearSlides(baseHtml) : baseHtml
  for (const slide of parsed) {
    next = addSlide(next, slide.html)
  }
  return { html: next, slides: parsed }
}

export const DEFAULT_OUTLINE_SAMPLE = `Kicker: Q4 Architecture Review
# Built for clarity at speed
A calm, zero-dependency presentation workflow for technical teams.
Notes: Welcome everyone. Today we will walk through why we rebuilt our slide workflow around clean HTML, Swiss typography, and zero vendor lock-in.

---

# Three principles that shaped the work
Every decision optimizes for legibility in the room.
- One document drives stage, print, and live web broadcast [step]
- Typography scales deterministically with bundled open-source fonts [step]
- Speaker notes, pacing, and laser sync stay private to the presenter [step]
Notes: Pause after each step so the audience absorbs the architecture before seeing the next point.

---

# Impact in numbers
3.4× | Faster deck preparation from Markdown outlines
100% | Offline fidelity with portable single-file HTML
18 ms | Median frame switch latency during live sync
Notes: Highlight that 100% offline fidelity means no broken web fonts in conference rooms.

---

# Comparison by workflow
| Capability | Legacy Suites | PureSlides |
| --- | --- | --- |
| Format | Proprietary binary | Clean HTML & CSS tokens |
| Live sync | External plugin | Built-in Broadcast + SSE |
| Offline export | Heavy desktop app | Single portable HTML file |
Notes: Walk down each row briefly and invite questions at the end.

---

> Clarity is not decoration — it is the fastest path to shared conviction.
> — Editorial Design System Principles
Notes: Close on this principle and transition to Q&A.`

/** Rich 5-slide sample deck booted automatically in Standalone Dev Mode. */
export function createStandaloneSampleDeck(): DeckDocument {
  const base = createDefaultDeckDocument('PureSlides Editorial Overview')
  const compiled = outlineToDeckHtml(base.html, DEFAULT_OUTLINE_SAMPLE, 'replace')
  return {
    title: 'PureSlides Editorial Overview',
    html: compiled.html,
  }
}
