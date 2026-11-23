import PptxGenJS from 'pptxgenjs'

/**
 * The deck as a PowerPoint file: one slide per slide, each a full-bleed
 * picture of the board's verified render, with the speaker notes attached
 * as real notes, and every video laid over its picture as a real media
 * object at the same box, so it plays in PowerPoint. It looks exactly like
 * the board and opens anywhere; the text is a picture, not type — a
 * faithful print, not an editable copy.
 *
 * The slide size follows the deck's geometry, so a 16:9 deck stays 16:9
 * and a 4:3 one stays 4:3; PowerPoint measures in inches, and 13.333 in
 * wide is its own widescreen default.
 */

/** A clip laid over the picture slide, where the board shows it. */
export interface PptxVideo {
  /** The clip's bytes, bare base64. */
  base64: string
  /** File extension — `mp4`; PowerPoint plays H.264 MP4. */
  extn: string
  /** The clip's box as fractions of the slide, 0–1. */
  x: number
  y: number
  w: number
  h: number
  /** A `data:image/…;base64,…` poster shown until the clip plays. */
  cover?: string
}

export interface PptxFrame {
  /** A `data:image/png;base64,…` URL, as the frame reader returns it. */
  dataUrl: string
  /** Speaker notes for this slide, if any. */
  notes?: string
  /** Real video, placed over the picture at the board's geometry. */
  videos?: PptxVideo[]
}

export interface PptxDeckInput {
  title: string
  width: number
  height: number
  frames: PptxFrame[]
}

/** Slide width in inches; the height follows the deck's own aspect. */
export const PPTX_WIDTH_IN = 13.333

export function pptxLayout(width: number, height: number): { width: number; height: number } {
  const w = PPTX_WIDTH_IN
  const h = Math.round((w * (height / Math.max(1, width))) * 1000) / 1000
  return { width: w, height: Math.max(1, h) }
}

/** The base64 payload of a data URL; a bare base64 string passes through. */
export function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return dataUrl.startsWith('data:') && comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl
}

/** Build the file and return its bytes as base64, ready for the file bridge. */
export async function buildDeckPptx(input: PptxDeckInput): Promise<string> {
  if (!input.frames.length) throw new Error('a deck with no slides has nothing to export')
  const pres = new PptxGenJS()
  const layout = pptxLayout(input.width, input.height)
  pres.defineLayout({ name: 'DECK', width: layout.width, height: layout.height })
  pres.layout = 'DECK'
  pres.title = input.title
  for (const frame of input.frames) {
    const slide = pres.addSlide()
    slide.addImage({
      data: `image/png;base64,${base64Of(frame.dataUrl)}`,
      x: 0,
      y: 0,
      w: layout.width,
      h: layout.height,
    })
    for (const video of frame.videos ?? []) {
      // The picture underneath shows the clip's first frame; the media
      // object on top plays. Same box, so nothing shifts when it starts.
      slide.addMedia({
        type: 'video',
        data: `video/${video.extn};base64,${base64Of(video.base64)}`,
        extn: video.extn,
        x: video.x * layout.width,
        y: video.y * layout.height,
        w: video.w * layout.width,
        h: video.h * layout.height,
        ...(video.cover ? { cover: video.cover } : {}),
      })
    }
    const notes = frame.notes?.trim()
    if (notes) slide.addNotes(notes)
  }
  const out = await pres.write({ outputType: 'base64' })
  if (typeof out !== 'string') throw new Error('the PowerPoint writer returned no file')
  return out
}

// =============================================================================
// True Native Editable PowerPoint Export (Item 5)
// Maps PureSlides HTML DOM -> native editable text boxes, KPI cards, quotes,
// tables, embedded images, videos, and speaker notes via pptxgenjs.
// =============================================================================

export function extractSlideHtmlList(deckHtml: string): string[] {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(deckHtml, 'text/html')
    const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    if (root) {
      const children = [...root.children].filter(child => child.matches('[data-slide]'))
      if (children.length) return children.map(c => c.outerHTML)
    }
  }
  const matches = [...deckHtml.matchAll(/<section\b[^>]*\bdata-slide\b[^>]*>[\s\S]*?<\/section>/gi)].map(m => m[0])
  return matches.length ? matches : [deckHtml]
}

export function appendSnippetToSlide(deckHtml: string, slideIndex: number, snippet: string): string {
  const list = extractSlideHtmlList(deckHtml)
  const target = list[slideIndex]
  if (!target) return deckHtml
  const next = /<\/section>\s*$/i.test(target)
    ? target.replace(/<\/section>\s*$/i, `${snippet}</section>`)
    : `${target}${snippet}`
  return deckHtml.replace(target, next)
}

export interface EditablePptxTheme {
  bg: string
  ink: string
  muted: string
  accent: string
  surface: string
  headingFont: string
  bodyFont: string
}

export interface EditablePptxSlideInput {
  html: string
  notes?: string
  videos?: PptxVideo[]
}

export interface EditablePptxDeckInput {
  title: string
  width: number
  height: number
  look?: string
  theme?: Partial<EditablePptxTheme>
  slides: EditablePptxSlideInput[]
}

const LOOK_THEMES: Record<string, EditablePptxTheme> = {
  auto: { bg: 'FFFFFF', ink: '14171A', muted: '525866', accent: '936C00', surface: 'F5F6F8', headingFont: 'Inter', bodyFont: 'Inter' },
  ink: { bg: '111318', ink: 'F5F6F8', muted: 'A1A7B3', accent: 'D4A72C', surface: '1B1F27', headingFont: 'Space Grotesk', bodyFont: 'IBM Plex Sans' },
  paper: { bg: 'FAF7F2', ink: '1F1B16', muted: '655D52', accent: '8C5A2B', surface: 'F1EAE0', headingFont: 'Newsreader', bodyFont: 'Inter' },
  signal: { bg: 'FFFFFF', ink: '111318', muted: '4B5262', accent: 'B8332A', surface: 'F4F5F7', headingFont: 'Bricolage Grotesque', bodyFont: 'Inter' },
  brief: { bg: 'FFFFFF', ink: '181A1F', muted: '5A606E', accent: '1D4ED8', surface: 'F3F5F8', headingFont: 'Archivo', bodyFont: 'Inter' },
  gallery: { bg: 'FAF9F7', ink: '191817', muted: '66625C', accent: '7A5C3E', surface: 'EFECE6', headingFont: 'Instrument Serif', bodyFont: 'Instrument Sans' },
  clear: { bg: 'FFFFFF', ink: '000000', muted: '333333', accent: '0047AB', surface: 'F2F4F8', headingFont: 'Atkinson Hyperlegible Next', bodyFont: 'Atkinson Hyperlegible Next' },
}

function cleanHex(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  const m = /#?([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(raw.trim())
  if (!m?.[1]) return fallback
  const hex = m[1]
  if (hex.length === 3) {
    return `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase()
  }
  return hex.toUpperCase()
}

interface ParsedSlideElements {
  kicker: string
  headline: string
  paragraphs: string[]
  bullets: string[]
  metrics: Array<{ value: string; label: string }>
  tables: Array<{ headers: string[]; rows: string[][] }>
  quotes: string[]
  images: string[]
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

export function extractEditableSlideElements(slideHtml: string): ParsedSlideElements {
  const result: ParsedSlideElements = {
    kicker: '',
    headline: '',
    paragraphs: [],
    bullets: [],
    metrics: [],
    tables: [],
    quotes: [],
    images: [],
  }

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(slideHtml, 'text/html')
    // Remove speaker notes so they never appear on slide canvas
    for (const n of Array.from(doc.querySelectorAll('[data-notes], aside.notes'))) n.remove()

    const kickerEl = doc.querySelector('.kicker, .eyebrow, [data-role="kicker"], [data-kicker]')
    if (kickerEl) {
      result.kicker = (kickerEl.textContent ?? '').trim()
      kickerEl.remove()
    }

    const headEl = doc.querySelector('h1, h2')
    if (headEl) {
      result.headline = (headEl.textContent ?? '').trim()
      headEl.remove()
    }

    // Extract tables first so their cell text doesn't duplicate into paragraphs
    for (const tbl of Array.from(doc.querySelectorAll('table'))) {
      const headers = Array.from(tbl.querySelectorAll('thead th, tr:first-child th')).map(th => (th.textContent ?? '').trim())
      const bodyRows = Array.from(tbl.querySelectorAll('tbody tr'))
      const allRows = bodyRows.length ? bodyRows : Array.from(tbl.querySelectorAll('tr')).slice(headers.length ? 1 : 0)
      const rows = allRows
        .map(tr => Array.from(tr.querySelectorAll('td, th')).map(c => (c.textContent ?? '').trim()))
        .filter(r => r.some(Boolean))
      if (headers.length || rows.length) result.tables.push({ headers, rows })
      tbl.remove()
    }

    // Extract quotes
    for (const bq of Array.from(doc.querySelectorAll('blockquote'))) {
      const t = (bq.textContent ?? '').trim()
      if (t) result.quotes.push(t)
      bq.remove()
    }

    // Extract KPI / stat / metric cards
    for (const stat of Array.from(doc.querySelectorAll('.figure, .stat, .metric, [data-kpi], [data-stat]'))) {
      const valEl = stat.querySelector('strong, .num, .value, .stat-num, h3, [data-live-bind]')
      const val = (valEl?.textContent ?? '').trim()
      const full = (stat.textContent ?? '').replace(val, '').trim()
      if (val) {
        result.metrics.push({ value: val, label: full || 'Metric' })
        stat.remove()
      }
    }

    // Extract images (data URLs)
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      const src = img.getAttribute('src') ?? ''
      if (src.startsWith('data:image/')) result.images.push(src)
    }

    // Extract bullets
    for (const li of Array.from(doc.querySelectorAll('li'))) {
      const t = (li.textContent ?? '').trim()
      if (t) result.bullets.push(t)
      li.remove()
    }

    // Extract remaining paragraphs & card headings
    for (const p of Array.from(doc.querySelectorAll('p, h3, h4, figcaption'))) {
      const t = (p.textContent ?? '').trim()
      if (t && !result.paragraphs.includes(t)) result.paragraphs.push(t)
    }

    return result
  }

  // Fallback parser for non-DOM Node environments
  const noNotes = slideHtml.replace(/<[^>]+data-notes[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, '')
  const hMatch = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(noNotes)
  if (hMatch?.[1]) result.headline = stripTags(hMatch[1])
  for (const m of noNotes.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = stripTags(m[1] ?? '')
    if (t) result.bullets.push(t)
  }
  for (const m of noNotes.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1] ?? '')
    if (t && t !== result.headline) result.paragraphs.push(t)
  }
  for (const m of noNotes.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const t = stripTags(m[1] ?? '')
    if (t) result.quotes.push(t)
  }
  return result
}

/**
 * Build a TRUE NATIVE EDITABLE PowerPoint (.pptx) where headlines, bullets,
 * KPI cards, tables, quotes, images, and speaker notes are real PowerPoint objects.
 */
export async function buildEditableDeckPptx(input: EditablePptxDeckInput): Promise<string> {
  if (!input.slides.length) throw new Error('a deck with no slides has nothing to export')
  const pres = new PptxGenJS()
  const layout = pptxLayout(input.width, input.height)
  pres.defineLayout({ name: 'DECK', width: layout.width, height: layout.height })
  pres.layout = 'DECK'
  pres.title = input.title

  const baseTheme = LOOK_THEMES[input.look ?? 'auto'] ?? LOOK_THEMES.auto!
  const theme: EditablePptxTheme = {
    bg: cleanHex(input.theme?.bg, baseTheme.bg),
    ink: cleanHex(input.theme?.ink, baseTheme.ink),
    muted: cleanHex(input.theme?.muted, baseTheme.muted),
    accent: cleanHex(input.theme?.accent, baseTheme.accent),
    surface: cleanHex(input.theme?.surface, baseTheme.surface),
    headingFont: input.theme?.headingFont || baseTheme.headingFont,
    bodyFont: input.theme?.bodyFont || baseTheme.bodyFont,
  }

  const marginX = 0.75
  const contentW = layout.width - marginX * 2

  for (let i = 0; i < input.slides.length; i++) {
    const slideIn = input.slides[i]!
    const parsed = extractEditableSlideElements(slideIn.html)
    const slide = pres.addSlide()
    slide.background = { color: theme.bg }

    let cursorY = 0.65

    // Subtle top accent bar
    slide.addShape(pres.ShapeType.rect, {
      x: marginX,
      y: 0.42,
      w: 0.65,
      h: 0.05,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 },
    })

    if (parsed.kicker) {
      slide.addText(parsed.kicker.toUpperCase(), {
        x: marginX,
        y: cursorY,
        w: contentW,
        h: 0.35,
        fontFace: theme.bodyFont,
        fontSize: 11,
        bold: true,
        color: theme.accent,
        charSpacing: 1.5,
      })
      cursorY += 0.38
    }

    if (parsed.headline) {
      const isCover = i === 0 && !parsed.bullets.length && !parsed.tables.length
      slide.addText(parsed.headline, {
        x: marginX,
        y: isCover ? layout.height * 0.28 : cursorY,
        w: contentW,
        h: isCover ? 1.5 : 1.0,
        fontFace: theme.headingFont,
        fontSize: isCover ? 40 : 30,
        bold: true,
        color: theme.ink,
        valign: 'top',
      })
      cursorY = isCover ? layout.height * 0.28 + 1.55 : cursorY + 1.05
    }

    // Quotes
    if (parsed.quotes.length > 0) {
      const q = parsed.quotes[0]!
      slide.addShape(pres.ShapeType.rect, {
        x: marginX,
        y: cursorY,
        w: 0.08,
        h: 1.4,
        fill: { color: theme.accent },
        line: { color: theme.accent, width: 0 },
      })
      slide.addText(`“${q}”`, {
        x: marginX + 0.28,
        y: cursorY,
        w: contentW - 0.28,
        h: 1.5,
        fontFace: theme.headingFont,
        fontSize: 24,
        italic: true,
        color: theme.ink,
        valign: 'middle',
      })
      cursorY += 1.65
    }

    // Lead paragraph(s)
    if (parsed.paragraphs.length > 0) {
      const lead = parsed.paragraphs.slice(0, 2).join('\n\n')
      slide.addText(lead, {
        x: marginX,
        y: cursorY,
        w: parsed.images.length ? contentW * 0.58 : contentW,
        h: 1.1,
        fontFace: theme.bodyFont,
        fontSize: 18,
        color: theme.muted,
        valign: 'top',
      })
      cursorY += 1.15
    }

    // Native KPI / Metric cards
    if (parsed.metrics.length > 0) {
      const cards = parsed.metrics.slice(0, 4)
      const gap = 0.25
      const cardW = (contentW - gap * (cards.length - 1)) / cards.length
      cards.forEach((m, idx) => {
        const cx = marginX + idx * (cardW + gap)
        slide.addShape(pres.ShapeType.rect, {
          x: cx,
          y: cursorY,
          w: cardW,
          h: 1.65,
          fill: { color: theme.surface },
          line: { color: theme.accent, width: 1 },
        })
        slide.addText(m.value, {
          x: cx + 0.18,
          y: cursorY + 0.18,
          w: cardW - 0.36,
          h: 0.72,
          fontFace: theme.headingFont,
          fontSize: 30,
          bold: true,
          color: theme.accent,
        })
        slide.addText(m.label, {
          x: cx + 0.18,
          y: cursorY + 0.96,
          w: cardW - 0.36,
          h: 0.55,
          fontFace: theme.bodyFont,
          fontSize: 13,
          color: theme.muted,
        })
      })
      cursorY += 1.9
    }

    // Native PowerPoint bullet list
    if (parsed.bullets.length > 0) {
      const textItems = parsed.bullets.slice(0, 8).map(b => ({
        text: b,
        options: { bullet: true, breakLine: true, paraSpaceAfter: 8 },
      }))
      slide.addText(textItems, {
        x: marginX,
        y: cursorY,
        w: parsed.images.length ? contentW * 0.58 : contentW,
        h: Math.max(1.4, layout.height - cursorY - 0.65),
        fontFace: theme.bodyFont,
        fontSize: 17,
        color: theme.ink,
        valign: 'top',
      })
    }

    // Native PowerPoint table
    if (parsed.tables.length > 0) {
      const tbl = parsed.tables[0]!
      const tableRows: PptxGenJS.TableRow[] = []
      if (tbl.headers.length) {
        tableRows.push(
          tbl.headers.map(h => ({
            text: h,
            options: { bold: true, fill: { color: theme.surface }, color: theme.ink, fontSize: 13, fontFace: theme.bodyFont },
          })),
        )
      }
      for (const r of tbl.rows.slice(0, 8)) {
        tableRows.push(
          r.map(cell => ({
            text: cell,
            options: { color: theme.ink, fontSize: 12, fontFace: theme.bodyFont },
          })),
        )
      }
      if (tableRows.length) {
        slide.addTable(tableRows, {
          x: marginX,
          y: cursorY,
          w: contentW,
          border: { type: 'solid', pt: 0.75, color: 'D4D7DC' },
          rowH: 0.42,
        })
      }
    }

    // Embedded data-URL image
    if (parsed.images.length > 0) {
      slide.addImage({
        data: parsed.images[0]!,
        x: marginX + contentW * 0.62,
        y: 1.65,
        w: contentW * 0.38,
        h: layout.height - 2.35,
        sizing: { type: 'contain', w: contentW * 0.38, h: layout.height - 2.35 },
      })
    }

    // Videos
    for (const video of slideIn.videos ?? []) {
      slide.addMedia({
        type: 'video',
        data: `video/${video.extn};base64,${base64Of(video.base64)}`,
        extn: video.extn,
        x: video.x * layout.width,
        y: video.y * layout.height,
        w: video.w * layout.width,
        h: video.h * layout.height,
        ...(video.cover ? { cover: video.cover } : {}),
      })
    }

    // Footer slide number
    slide.addText(`${i + 1} / ${input.slides.length}`, {
      x: layout.width - 1.5,
      y: layout.height - 0.42,
      w: 0.75,
      h: 0.25,
      fontFace: theme.bodyFont,
      fontSize: 10,
      color: theme.muted,
      align: 'right',
    })

    const notes = slideIn.notes?.trim()
    if (notes) slide.addNotes(notes)
  }

  const out = await pres.write({ outputType: 'base64' })
  if (typeof out !== 'string') throw new Error('the PowerPoint writer returned no file')
  return out
}
