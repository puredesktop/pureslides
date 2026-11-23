/**
 * Smart Layout Remix & Quick Element Insertion.
 *
 * Transforms any slide between compatible SLIDE_BLOCKS while preserving its
 * headline, support text, bullet/item list, figures, media, speaker notes,
 * duration, and live slide id. Also provides deterministic, look-token-styled
 * element snippets for the Content inspector's Insert Element Quick-Bar.
 */
import { findBlock } from './blocks'
import { slideElementAt, wordsOf } from './slides'

export const REMIXABLE_BLOCK_IDS = [
  'title',
  'statement',
  'points',
  'cards',
  'two-column',
  'compare',
  'figures',
  'quote',
  'agenda',
  'steps',
] as const

export type RemixableBlockId = (typeof REMIXABLE_BLOCK_IDS)[number]

export interface ExtractedSlideItem {
  title: string
  detail: string
  value?: string
}

export interface ExtractedSlideContent {
  kicker: string
  headline: string
  support: string
  items: ExtractedSlideItem[]
  mediaSrc: string
  mediaKind: 'image' | 'video' | null
  notes: string
  seconds: string | null
  slideId: string | null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isStatToken(text: string): boolean {
  const trimmed = text.trim()
  return (
    trimmed.length > 0 &&
    trimmed.length <= 14 &&
    /\d/.test(trimmed) &&
    /^[\p{Sc}+\-−–~<>]?[\d\s.,:/]+\s*(?:%|×|x|k|m|b|ms|s|d|h|yr|yrs|mo|\+)?$/iu.test(trimmed)
  )
}

function isStepOrIndexLabel(text: string): boolean {
  const trimmed = text.trim()
  return (
    /^(?:0?\d{1,2}\.?|step\s+(?:\d+|one|two|three|four|five|six)|before|after)$/i.test(trimmed)
  )
}

/** Extract structured semantic content from a slide DOM element. */
export function extractSlideContent(slide: Element): ExtractedSlideContent {
  const notesEl = slide.querySelector('[data-notes]')
  const notes = wordsOf(notesEl)
  const seconds = slide.getAttribute('data-seconds')
  const slideId = slide.getAttribute('data-slide-id')

  const clone = slide.cloneNode(true) as Element
  clone.querySelectorAll('style, script, [data-notes]').forEach(node => node.remove())

  const img = clone.querySelector('img[src]')
  const video = clone.querySelector('video')
  const videoSrc =
    video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || ''
  const mediaSrc = img?.getAttribute('src') || videoSrc || ''
  const mediaKind: 'image' | 'video' | null = img?.getAttribute('src')
    ? 'image'
    : videoSrc
      ? 'video'
      : null

  const headingEl = clone.querySelector('h1, h2, h3, [data-headline]')
  let headline = wordsOf(headingEl)
  // Strip outer smart quotes when remixing from a quote block.
  if (slide.getAttribute('data-block') === 'quote') {
    headline = headline.replace(/^[“"']+|[”"']+$/g, '').trim()
  }

  const supportEl = clone.querySelector('[data-support], p, .subtitle')
  const support = supportEl && supportEl !== headingEl ? wordsOf(supportEl) : ''

  // Detect kicker (short uppercase/small label before headline)
  let kicker = ''
  if (headingEl) {
    const firstChild = clone.firstElementChild
    if (
      firstChild &&
      firstChild !== headingEl &&
      !firstChild.contains(headingEl) &&
      firstChild.children.length === 0 &&
      !firstChild.hasAttribute('data-bg') &&
      !firstChild.hasAttribute('data-image-slot')
    ) {
      const candidate = wordsOf(firstChild)
      if (candidate && candidate.length <= 48 && candidate !== headline && candidate !== support) {
        kicker = candidate
      }
    }
  }

  const items: ExtractedSlideItem[] = []
  const seen = new Set<string>([headline, support, kicker].filter(Boolean))

  const pushItem = (title: string, detail = '', value?: string) => {
    const t = title.trim()
    const d = detail.trim()
    const v = value?.trim()
    if (!t && !d && !v) return
    const key = `${v ?? ''}|${t}|${d}`
    if (seen.has(key) || (t && !d && !v && seen.has(t))) return
    seen.add(key)
    items.push({ title: t || d, detail: t ? d : '', ...(v ? { value: v } : {}) })
  }

  // 1. Explicit list items <li>
  const listItems = [...clone.querySelectorAll('li')]
  if (listItems.length) {
    for (const li of listItems) {
      const text = wordsOf(li)
      if (text) pushItem(text)
    }
  }

  // 2. Grid / row containers holding card/figure/stage/compare cells
  if (!items.length) {
    const containers = [...clone.querySelectorAll('div')].filter(el => {
      if (el.contains(headingEl) && el.children.length <= 3) return false
      const style = el.getAttribute('style') ?? ''
      const isGridOrFlex = /display\s*:\s*(grid|flex)/i.test(style)
      return isGridOrFlex && el.children.length >= 2
    })

    // Prefer the most specific multi-child container that does NOT wrap the headline
    const itemContainer = containers
      .filter(el => (!headingEl || !el.contains(headingEl)) && !el.hasAttribute('data-bg'))
      .find(el => {
        const children = [...el.children].filter(
          c => !c.hasAttribute('data-bg') && !c.hasAttribute('data-image-slot'),
        )
        return children.length >= 2
      })

    if (itemContainer) {
      for (const child of [...itemContainer.children]) {
        if (child.hasAttribute('data-bg') || child.hasAttribute('data-image-slot')) continue
        const parts = [...child.children]
          .map(c => wordsOf(c))
          .filter(Boolean)
        if (!parts.length) {
          const whole = wordsOf(child)
          if (whole) pushItem(whole)
          continue
        }
        // Filter out purely decorative numbers / labels like "01", "Step one"
        const filtered = parts.filter((part, idx) => !(idx === 0 && isStepOrIndexLabel(part) && parts.length >= 2))
        if (filtered.length >= 2 && isStatToken(filtered[0])) {
          pushItem(filtered[1], filtered.slice(2).join(' '), filtered[0])
        } else if (filtered.length >= 2) {
          pushItem(filtered[0], filtered.slice(1).join(' '))
        } else if (filtered.length === 1) {
          pushItem(filtered[0])
        }
      }
    }
  }

  // 3. Fallback: elements with data-step
  if (!items.length) {
    const stepped = [...clone.querySelectorAll('[data-step]')]
    for (const el of stepped) {
      const text = wordsOf(el)
      if (text) pushItem(text)
    }
  }

  return {
    kicker,
    headline: headline || 'Key idea',
    support,
    items,
    mediaSrc,
    mediaKind,
    notes,
    seconds,
    slideId,
  }
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
const STRONG = `${BODY}; font-size: var(--slide-size-lead, 32px); font-weight: var(--slide-strong-weight, 620); line-height: var(--slide-leading-headline, 1.1); letter-spacing: var(--slide-tracking-headline, -0.015em); text-wrap: balance`
const LABEL = `font-family: var(--slide-label-font, var(--slide-body-font, system-ui, sans-serif)); font-size: var(--slide-size-label, 18px); font-weight: var(--slide-label-weight, 600); line-height: 1.2; letter-spacing: var(--slide-tracking-label, 0.12em); text-transform: uppercase; font-variant-numeric: tabular-nums lining-nums`
const MUTED = 'color: var(--slide-muted, #4f5d76)'
const ACCENT = 'color: var(--slide-accent, #2f52c8)'
const PAD = 'padding: 80px 96px'

function ensureItems(content: ExtractedSlideContent, count: number): ExtractedSlideItem[] {
  const out = [...content.items]
  if (!out.length && content.support) {
    // Split sentences if support has multiple clauses
    const parts = content.support
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean)
    for (const part of parts) out.push({ title: part, detail: '' })
  }
  const defaults = [
    { title: 'First point', detail: 'Key supporting detail.' },
    { title: 'Second point', detail: 'Key supporting detail.' },
    { title: 'Third point', detail: 'Key supporting detail.' },
    { title: 'Fourth point', detail: 'Key supporting detail.' },
  ]
  while (out.length < count) {
    out.push(defaults[out.length % defaults.length])
  }
  return out
}

function renderRemixedSlideMarkup(
  content: ExtractedSlideContent,
  targetBlockId: RemixableBlockId,
): string {
  const h = escapeHtml(content.headline)
  const s = escapeHtml(content.support || (content.items[0]?.title ?? 'Supporting context.'))
  const k = escapeHtml(content.kicker || 'Overview')

  switch (targetBlockId) {
    case 'title':
      return `<div data-slide data-block="title" style="${FRAME}; align-items: flex-start; justify-content: center; gap: 30px; padding: 80px 104px">
  <div style="${LABEL}; ${ACCENT}">${k}</div>
  <h1 style="${DISPLAY}">${h}</h1>
  <p style="${LEAD}; ${MUTED}">${s}</p>
</div>`

    case 'statement':
      return `<div data-slide data-block="statement" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 112px">
  <h1 style="${DISPLAY}; max-width: 18ch">${h}</h1>
  <div style="width: 96px; height: 4px; background: var(--slide-accent, #2f52c8)"></div>
  <p style="${LEAD}; ${MUTED}">${s}</p>
</div>`

    case 'points': {
      const items = ensureItems(content, 3).slice(0, 5)
      const rows = items
        .map(
          (item, i) =>
            `<div data-step="${i + 1}" style="${LEAD}; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)">${escapeHtml(
              item.detail ? `${item.title} — ${item.detail}` : item.title,
            )}</div>`,
        )
        .join('\n    ')
      return `<div data-slide data-block="points" style="${FRAME}; justify-content: center; gap: 22px; ${PAD}">
  <h1 style="${HEADLINE}">${h}</h1>
  ${content.support ? `<p style="${TEXT}; ${MUTED}">${escapeHtml(content.support)}</p>` : ''}
  <div style="display: flex; flex-direction: column; max-width: 860px; margin-top: 14px; border-top: 1px solid var(--slide-line, #cdd6e6)">
    ${rows}
  </div>
</div>`
    }

    case 'cards': {
      const items = ensureItems(content, 3).slice(0, 4)
      const cols = Math.min(4, Math.max(2, items.length))
      const cardsHtml = items
        .map((item, i) => {
          const num = String(i + 1).padStart(2, '0')
          const detail = item.detail || 'Clear supporting rationale.'
          return `<div style="display: flex; flex-direction: column; gap: 12px; padding: 26px 24px 28px; border-top: 3px solid var(--slide-accent, #2f52c8); border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${ACCENT}">${num}</div>
      <div style="${BODY}; font-size: var(--slide-size-body, 24px); font-weight: var(--slide-strong-weight, 620); line-height: 1.2; letter-spacing: var(--slide-tracking-headline, -0.015em); text-wrap: balance">${escapeHtml(item.title)}</div>
      <div style="${TEXT}; font-size: var(--slide-size-label, 18px); ${MUTED}">${escapeHtml(detail)}</div>
    </div>`
        })
        .join('\n    ')
      return `<div data-slide data-block="cards" style="${FRAME}; justify-content: center; gap: 40px; ${PAD}">
  <div style="display: flex; flex-direction: column; gap: 14px">
    <h1 style="${HEADLINE}">${h}</h1>
    ${content.support ? `<p style="${TEXT}; ${MUTED}">${escapeHtml(content.support)}</p>` : ''}
  </div>
  <div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 20px">
    ${cardsHtml}
  </div>
</div>`
    }

    case 'two-column': {
      const rightSlot =
        content.mediaKind === 'image' && content.mediaSrc
          ? `<div style="flex: 6; align-self: stretch; margin: 72px 0; border-radius: var(--slide-radius, 4px); overflow: hidden; background: var(--slide-surface, #eaf0fb)"><img src="${escapeHtml(content.mediaSrc)}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block" /></div>`
          : content.items.length
            ? `<div style="flex: 6; display: flex; flex-direction: column; gap: 14px; padding: 28px; border-radius: var(--slide-radius, 4px); background: var(--slide-surface, #eaf0fb)">${content.items
                .slice(0, 4)
                .map(
                  (item, idx) =>
                    `<div style="display: flex; gap: 14px; align-items: baseline; padding-bottom: 12px; border-bottom: 1px solid var(--slide-line, #cdd6e6)"><span style="${LABEL}; ${ACCENT}">${String(idx + 1).padStart(2, '0')}</span><span style="${TEXT}">${escapeHtml(item.detail ? `${item.title} — ${item.detail}` : item.title)}</span></div>`,
                )
                .join('')}</div>`
            : `<div data-image-slot style="flex: 6; align-self: stretch; margin: 72px 0; border-radius: var(--slide-radius, 4px); background: var(--slide-surface, #eaf0fb); display: grid; place-items: center; ${LABEL}; ${ACCENT}">Replace with an image</div>`
      return `<div data-slide data-block="two-column" style="${FRAME}; flex-direction: row; align-items: center; gap: 64px; padding: 0 96px">
  <div style="flex: 5; display: flex; flex-direction: column; gap: 22px">
    <h1 style="${HEADLINE}">${h}</h1>
    <p style="${TEXT}; ${MUTED}">${s}</p>
  </div>
  ${rightSlot}
</div>`
    }

    case 'compare': {
      const items = ensureItems(content, 2)
      const left = items[0]
      const right = items[1]
      return `<div data-slide data-block="compare" style="${FRAME}; justify-content: center; gap: 36px; ${PAD}">
  <h1 style="${HEADLINE}">${h}</h1>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px">
    <div style="display: flex; flex-direction: column; gap: 14px; padding: 32px; border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${MUTED}">Before</div>
      <div style="${STRONG}">${escapeHtml(left.title)}</div>
      <div style="${TEXT}; ${MUTED}">${escapeHtml(left.detail || content.support || 'How it works today.')}</div>
    </div>
    <div data-step="1" style="display: flex; flex-direction: column; gap: 14px; padding: 32px; border-radius: var(--slide-radius, 0px); background: var(--slide-inverse, #192b55); color: var(--slide-on-inverse, #ffffff)">
      <div style="${LABEL}; color: var(--slide-inverse-muted, #cad5ed)">After</div>
      <div style="${STRONG}">${escapeHtml(right.title)}</div>
      <div style="${TEXT}; color: var(--slide-inverse-muted, #cad5ed)">${escapeHtml(right.detail || 'What the new approach unlocks.')}</div>
    </div>
  </div>
</div>`
    }

    case 'figures': {
      const items = ensureItems(content, 3).slice(0, 3)
      const defaultVals = ['3×', '42%', '12 d']
      const cols = items
        .map((item, i) => {
          const val = item.value || (isStatToken(item.title) ? item.title : defaultVals[i])
          const desc =
            item.value || !isStatToken(item.title)
              ? item.detail || item.title
              : item.detail || 'Key metric.'
          return `<div style="display: flex; flex-direction: column; gap: 14px; padding-top: 22px; border-top: 1px solid var(--slide-line, #cdd6e6)">
      <div style="${HEADING}; font-size: var(--slide-size-display, 76px); line-height: 1; letter-spacing: var(--slide-tracking-display, -0.035em); font-variant-numeric: tabular-nums lining-nums; ${ACCENT}">${escapeHtml(val)}</div>
      <div style="${TEXT}; ${MUTED}; max-width: 22ch">${escapeHtml(desc)}</div>
    </div>`
        })
        .join('\n    ')
      return `<div data-slide data-block="figures" style="${FRAME}; justify-content: center; gap: 48px; ${PAD}">
  <h1 style="${HEADLINE}">${h}</h1>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px">
    ${cols}
  </div>
</div>`
    }

    case 'quote': {
      const quoteText = content.headline.replace(/^[“"']+|[”"']+$/g, '').trim()
      return `<div data-slide data-block="quote" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 136px; background: var(--slide-surface, #eaf0fb)">
  <h1 style="${HEADLINE}; max-width: 26ch; font-style: var(--slide-quote-style, normal); font-weight: var(--slide-quote-weight, 480); text-indent: -0.42em">“${escapeHtml(quoteText)}”</h1>
  <p style="${LABEL}; ${MUTED}">${s}</p>
</div>`
    }

    case 'agenda': {
      const items = ensureItems(content, 3).slice(0, 5)
      const rows = items
        .map(
          (item, i) =>
            `<div style="display: flex; align-items: baseline; gap: 28px; padding: 20px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)"><span style="${LABEL}; ${ACCENT}; min-width: 2.5em">${String(i + 1).padStart(2, '0')}</span><span style="${BODY}; font-size: var(--slide-size-lead, 32px); line-height: var(--slide-leading-lead, 1.32); letter-spacing: var(--slide-tracking-body, 0em)">${escapeHtml(item.title)}</span></div>`,
        )
        .join('\n    ')
      return `<div data-slide data-block="agenda" style="${FRAME}; justify-content: center; gap: 28px; padding: 80px 112px">
  <h1 style="${HEADLINE}">${h}</h1>
  <div style="display: flex; flex-direction: column; border-top: 1px solid var(--slide-line, #cdd6e6)">
    ${rows}
  </div>
</div>`
    }

    case 'steps': {
      const items = ensureItems(content, 3).slice(0, 4)
      const stepLabels = ['Step one', 'Step two', 'Step three', 'Step four']
      const stages = items
        .map(
          (item, i) =>
            `<div data-step="${i + 1}" style="flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 26px 26px 30px; border-top: 3px solid var(--slide-accent, #2f52c8); border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${ACCENT}">${stepLabels[i] ?? `Step ${i + 1}`}</div>
      <div style="${STRONG}">${escapeHtml(item.title)}</div>
      ${item.detail ? `<div style="${TEXT}; font-size: var(--slide-size-label, 18px); ${MUTED}">${escapeHtml(item.detail)}</div>` : ''}
    </div>`,
        )
        .join('\n    ')
      return `<div data-slide data-block="steps" style="${FRAME}; justify-content: center; gap: 36px; ${PAD}">
  <h1 style="${HEADLINE}">${h}</h1>
  <div style="display: flex; align-items: stretch; gap: 18px">
    ${stages}
  </div>
</div>`
    }
  }
}

/**
 * Transform slide `slideIndex` into `targetBlockId` while intelligently
 * preserving its existing headline, support text, items/bullets, media,
 * speaker notes, timing, and slide id.
 */
export function remixSlideLayout(
  html: string,
  slideIndex: number,
  targetBlockId: RemixableBlockId,
): string {
  if (typeof DOMParser === 'undefined') return html
  if (!REMIXABLE_BLOCK_IDS.includes(targetBlockId)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html
  const slide = slideElementAt(root, slideIndex)
  if (!slide) return html

  const content = extractSlideContent(slide)
  const nextMarkup = renderRemixedSlideMarkup(content, targetBlockId)
  const holder = doc.createElement('div')
  holder.innerHTML = nextMarkup
  const nextSlide = holder.firstElementChild
  if (!nextSlide) return html

  if (content.slideId) nextSlide.setAttribute('data-slide-id', content.slideId)
  if (content.seconds) nextSlide.setAttribute('data-seconds', content.seconds)
  if (content.notes) {
    const notes = doc.createElement('div')
    notes.setAttribute('data-notes', '')
    notes.setAttribute('hidden', '')
    notes.setAttribute('style', 'display: none')
    notes.textContent = content.notes
    nextSlide.appendChild(notes)
  }

  if (slide === root) {
    root.textContent = ''
    root.appendChild(nextSlide)
  } else {
    slide.replaceWith(nextSlide)
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

export function remixOptions(): Array<{ id: RemixableBlockId; label: string; description: string }> {
  return REMIXABLE_BLOCK_IDS.map(id => {
    const block = findBlock(id)
    return {
      id,
      label: block?.label ?? id,
      description: block?.description ?? '',
    }
  })
}

// ---- Insert Element Quick-Bar ----------------------------------------------

export type InsertableElementKind =
  | 'heading'
  | 'paragraph'
  | 'stat'
  | 'callout'
  | 'table'
  | 'bar-chart'
  | 'code'
  | 'divider'

export interface InsertableElementDef {
  id: InsertableElementKind
  label: string
  short: string
  html: string
}

export const INSERTABLE_ELEMENTS: InsertableElementDef[] = [
  {
    id: 'heading',
    label: 'Heading',
    short: 'H2',
    html: `<h2 style="margin: 0; ${HEADING}; font-size: var(--slide-size-lead, 32px); line-height: 1.15; letter-spacing: var(--slide-tracking-headline, -0.02em)">New section heading</h2>`,
  },
  {
    id: 'paragraph',
    label: 'Paragraph',
    short: 'Text',
    html: `<p style="${TEXT}; ${MUTED}">Add a concise supporting sentence that advances the point.</p>`,
  },
  {
    id: 'stat',
    label: 'KPI Stat',
    short: 'KPI',
    html: `<div style="display: inline-flex; flex-direction: column; gap: 6px; padding: 18px 24px; border-left: 3px solid var(--slide-accent, #2f52c8); border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb); align-self: flex-start">
  <div style="${HEADING}; font-size: var(--slide-size-headline, 57px); line-height: 1; font-variant-numeric: tabular-nums; ${ACCENT}">94%</div>
  <div style="${LABEL}; ${MUTED}">Metric label</div>
</div>`,
  },
  {
    id: 'callout',
    label: 'Callout',
    short: 'Note',
    html: `<div style="padding: 20px 24px; border-left: 4px solid var(--slide-accent, #2f52c8); border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb); ${TEXT}">Key takeaway highlighted for the room.</div>`,
  },
  {
    id: 'table',
    label: '2×3 Table',
    short: 'Table',
    html: `<table style="width: 100%; max-width: 920px; border-collapse: collapse; ${BODY}; font-size: var(--slide-size-label, 18px); font-variant-numeric: tabular-nums">
  <thead>
    <tr style="border-bottom: 2px solid var(--slide-ink, #192338); text-align: left">
      <th style="padding: 10px 14px; ${LABEL}; ${MUTED}">Metric</th>
      <th style="padding: 10px 14px; ${LABEL}; ${MUTED}">Baseline</th>
      <th style="padding: 10px 14px; ${LABEL}; ${ACCENT}">Target</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid var(--slide-line, #cdd6e6)">
      <td style="padding: 12px 14px; font-weight: 600">Latency</td>
      <td style="padding: 12px 14px; ${MUTED}">420 ms</td>
      <td style="padding: 12px 14px; font-weight: 600">85 ms</td>
    </tr>
    <tr style="border-bottom: 1px solid var(--slide-line, #cdd6e6)">
      <td style="padding: 12px 14px; font-weight: 600">Throughput</td>
      <td style="padding: 12px 14px; ${MUTED}">1.2×</td>
      <td style="padding: 12px 14px; font-weight: 600">4.8×</td>
    </tr>
  </tbody>
</table>`,
  },
  {
    id: 'bar-chart',
    label: 'Bar Chart',
    short: 'Chart',
    html: `<div style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 760px; padding: 20px 24px; border-radius: var(--slide-radius, 0px); background: var(--slide-surface, #eaf0fb)">
  <div style="${LABEL}; ${MUTED}">Quarterly performance</div>
  <svg viewBox="0 0 600 180" style="width: 100%; height: auto; display: block" role="img" aria-label="Bar chart">
    <line x1="0" y1="150" x2="600" y2="150" stroke="var(--slide-line, #cdd6e6)" stroke-width="2" />
    <rect x="30" y="96" width="90" height="54" rx="2" fill="var(--slide-muted, #4f5d76)" opacity="0.5" />
    <rect x="170" y="72" width="90" height="78" rx="2" fill="var(--slide-muted, #4f5d76)" opacity="0.7" />
    <rect x="310" y="48" width="90" height="102" rx="2" fill="var(--slide-accent, #2f52c8)" opacity="0.82" />
    <rect x="450" y="20" width="90" height="130" rx="2" fill="var(--slide-accent, #2f52c8)" />
    <text x="75" y="172" text-anchor="middle" fill="var(--slide-muted, #4f5d76)" font-size="14" font-family="var(--slide-body-font, system-ui, sans-serif)">Q1</text>
    <text x="215" y="172" text-anchor="middle" fill="var(--slide-muted, #4f5d76)" font-size="14" font-family="var(--slide-body-font, system-ui, sans-serif)">Q2</text>
    <text x="355" y="172" text-anchor="middle" fill="var(--slide-muted, #4f5d76)" font-size="14" font-family="var(--slide-body-font, system-ui, sans-serif)">Q3</text>
    <text x="495" y="172" text-anchor="middle" fill="var(--slide-ink, #192338)" font-size="14" font-weight="700" font-family="var(--slide-body-font, system-ui, sans-serif)">Q4</text>
  </svg>
</div>`,
  },
  {
    id: 'code',
    label: 'Code Block',
    short: 'Code',
    html: `<pre style="margin: 0; padding: 20px 24px; border-radius: var(--slide-radius, 0px); background: var(--slide-inverse, #192b55); color: var(--slide-on-inverse, #ffffff); font-family: var(--slide-mono-font, ui-monospace, monospace); font-size: var(--slide-size-label, 18px); line-height: 1.5; overflow: hidden"><code>const ready = await publishDeck({ live: true })</code></pre>`,
  },
  {
    id: 'divider',
    label: 'Divider',
    short: 'Rule',
    html: `<div style="width: 100%; height: 2px; background: var(--slide-line, #cdd6e6)"></div>`,
  },
]

/** Append an element snippet cleanly into slide `slideIndex` (before hidden speaker notes). */
export function insertSlideElement(
  html: string,
  slideIndex: number,
  kind: InsertableElementKind,
): string {
  if (typeof DOMParser === 'undefined') return html
  const def = INSERTABLE_ELEMENTS.find(item => item.id === kind)
  if (!def) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html
  const slide = slideElementAt(root, slideIndex)
  if (!slide) return html

  const holder = doc.createElement('div')
  holder.innerHTML = def.html.trim()
  const node = holder.firstElementChild
  if (!node) return html

  const notes = slide.querySelector('[data-notes]')
  if (notes && notes.parentElement === slide) {
    slide.insertBefore(node, notes)
  } else {
    slide.appendChild(node)
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}
