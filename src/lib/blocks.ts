/**
 * Slide compositions worth reaching for.
 *
 * A deck written from nothing tends to come out as fifteen headline-and-
 * bullets slides, because that is the shape that always fits. This is a
 * catalogue of layouts that carry meaning in their arrangement — a comparison
 * reads as a comparison, a number reads as a number — so drafting has
 * somewhere to go and "+ Add a slide" is a choice rather than a blank.
 *
 * They are ordinary markup: absolute inside the frame, an `<h1>` for the
 * headline and a `<p>` for the line under it so the board can edit them, and
 * `data-step` where the composition wants to arrive in pieces. Nothing here
 * is a template engine — a block is a starting point you then edit.
 */

export interface SlideBlock {
  id: string
  label: string
  /** What it is FOR — the reason to pick this one over the next. */
  description: string
  /** How many presses it takes as written. */
  steps: number
  /** The kind of file the block has a slot for, when it has one. */
  media?: 'video'
  html: string
}

/** A file from the package to put in the block's slot as it is added. */
export interface BlockFill {
  /** File name inside `assets/` — `demo.mp4`, not a path. */
  asset?: string
}

/**
 * The block's markup with its slot filled: a video block gets
 * `src="assets/<name>"` on its `[data-video]` element and loses the
 * "replace with a video" cover. A block with no slot, or no fill, is
 * returned as written.
 */
export function blockHtmlWith(block: SlideBlock, fill: BlockFill = {}): string {
  const asset = fill.asset?.trim()
  if (!asset || block.media !== 'video' || typeof DOMParser === 'undefined') return block.html
  const doc = new DOMParser().parseFromString(`<body>${block.html}</body>`, 'text/html')
  const video = doc.querySelector('[data-video]')
  if (!video) return block.html
  video.setAttribute('src', `assets/${asset}`)
  doc.querySelectorAll('[data-video-empty]').forEach(node => node.remove())
  return doc.body.innerHTML.trim()
}

const FRAME =
  'position: absolute; inset: 0; font-family: var(--slide-body-font, system-ui, sans-serif); display: flex; flex-direction: column; background: var(--slide-bg, #f8f9fc); color: var(--slide-ink, #192338)'

/**
 * The type, by level. Every size, weight, leading, tracking and measure is
 * a token the look sets on the deck root, so a block written once reads
 * right in every look; the fallbacks are the Auto look, for a block pasted
 * into a deck that has no tokens.
 */
const HEADING = 'font-family: var(--slide-heading-font, system-ui, sans-serif); font-weight: var(--slide-heading-weight, 700)'
const BODY = 'font-family: var(--slide-body-font, system-ui, sans-serif)'
const DISPLAY = `margin: 0; ${HEADING}; font-size: var(--slide-size-display, 76px); line-height: var(--slide-leading-display, 1.04); letter-spacing: var(--slide-tracking-display, -0.035em); max-width: var(--slide-measure-display, 16ch); text-wrap: balance`
const HEADLINE = `margin: 0; ${HEADING}; font-size: var(--slide-size-headline, 57px); line-height: var(--slide-leading-headline, 1.08); letter-spacing: var(--slide-tracking-headline, -0.025em); max-width: var(--slide-measure-headline, 24ch); text-wrap: balance`
const LEAD = `margin: 0; ${BODY}; font-size: var(--slide-size-lead, 32px); line-height: var(--slide-leading-lead, 1.32); letter-spacing: var(--slide-tracking-body, 0em); max-width: var(--slide-measure-lead, 36ch); text-wrap: pretty`
const TEXT = `margin: 0; ${BODY}; font-size: var(--slide-size-body, 24px); line-height: var(--slide-leading-body, 1.45); letter-spacing: var(--slide-tracking-body, 0em); max-width: var(--slide-measure-body, 58ch); text-wrap: pretty`
/** The emphasised line of a pair: a card's title over its sentence. */
const STRONG = `${BODY}; font-size: var(--slide-size-lead, 32px); font-weight: var(--slide-strong-weight, 620); line-height: var(--slide-leading-headline, 1.1); letter-spacing: var(--slide-tracking-headline, -0.015em); text-wrap: balance`
/** Tracked capitals for the small words above things: a kicker, a step, a figure's unit. */
const LABEL = `${BODY}; font-size: var(--slide-size-label, 18px); font-weight: var(--slide-label-weight, 600); line-height: 1.2; letter-spacing: var(--slide-tracking-label, 0.12em); text-transform: uppercase; font-variant-numeric: tabular-nums lining-nums`
const MUTED = 'color: var(--slide-muted, #4f5d76)'
const ACCENT = 'color: var(--slide-accent, #2f52c8)'
const PAD = 'padding: 80px 96px'

function card(number: string, title: string, text: string): string {
  return `<div style="display: flex; flex-direction: column; gap: 12px; padding: 26px 24px 28px; border-top: 3px solid var(--slide-accent, #2f52c8); background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${ACCENT}">${number}</div>
      <div style="${BODY}; font-size: var(--slide-size-body, 24px); font-weight: var(--slide-strong-weight, 620); line-height: 1.2; letter-spacing: var(--slide-tracking-headline, -0.015em); text-wrap: balance">${title}</div>
      <div style="${TEXT}; font-size: var(--slide-size-label, 18px); ${MUTED}">${text}</div>
    </div>`
}

function stage(step: number, label: string, text: string): string {
  return `<div data-step="${step}" style="flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 26px 26px 30px; border-top: 3px solid var(--slide-accent, #2f52c8); background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${ACCENT}">${label}</div>
      <div style="${STRONG}">${text}</div>
    </div>`
}

function agendaRow(number: string, text: string): string {
  return `<div style="display: flex; align-items: baseline; gap: 28px; padding: 20px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)"><span style="${LABEL}; ${ACCENT}; min-width: 2.5em">${number}</span><span style="${BODY}; font-size: var(--slide-size-lead, 32px); line-height: var(--slide-leading-lead, 1.32); letter-spacing: var(--slide-tracking-body, 0em)">${text}</span></div>`
}

function figure(value: string, text: string): string {
  return `<div style="display: flex; flex-direction: column; gap: 14px; padding-top: 22px; border-top: 1px solid var(--slide-line, #cdd6e6)">
      <div style="${HEADING}; font-size: var(--slide-size-display, 76px); line-height: 1; letter-spacing: var(--slide-tracking-display, -0.035em); font-variant-numeric: tabular-nums lining-nums; ${ACCENT}">${value}</div>
      <div style="${TEXT}; ${MUTED}; max-width: 22ch">${text}</div>
    </div>`
}

export const SLIDE_BLOCKS: SlideBlock[] = [
  {
    id: 'title',
    label: 'Title',
    description: 'Opens the deck: the promise in one line, and who is making it.',
    steps: 0,
    html: `<div data-slide data-block="title" style="${FRAME}; align-items: flex-start; justify-content: center; gap: 30px; padding: 80px 104px">
  <div style="${LABEL}; ${ACCENT}">A new perspective</div>
  <h1 style="${DISPLAY}">The promise, in one line</h1>
  <p style="${LEAD}; ${MUTED}">Who is making it, and to whom.</p>
</div>`,
  },
  {
    id: 'statement',
    label: 'Statement',
    description: 'One sentence, large. For the idea the room should leave with.',
    steps: 0,
    html: `<div data-slide data-block="statement" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 112px">
  <h1 style="${DISPLAY}; max-width: 18ch">Work lives in projects, not chat threads</h1>
  <div style="width: 96px; height: 4px; background: var(--slide-accent, #2f52c8)"></div>
  <p style="${LEAD}; ${MUTED}">The line that makes it land.</p>
</div>`,
  },
  {
    id: 'points',
    label: 'Points that build',
    description: 'Three or four points arriving one press at a time.',
    steps: 3,
    html: `<div data-slide data-block="points" style="${FRAME}; justify-content: center; gap: 22px; ${PAD}">
  <h1 style="${HEADLINE}">Three things</h1>
  <p style="${TEXT}; ${MUTED}">The line under the headline.</p>
  <div style="display: flex; flex-direction: column; max-width: 860px; margin-top: 18px; border-top: 1px solid var(--slide-line, #cdd6e6)">
    <div data-step="1" style="${LEAD}; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)">The first one</div>
    <div data-step="2" style="${LEAD}; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)">The second one</div>
    <div data-step="3" style="${LEAD}; max-width: none; padding: 16px 0; border-bottom: 1px solid var(--slide-line, #cdd6e6)">And the third</div>
  </div>
</div>`,
  },
  {
    id: 'cards',
    label: 'Cards',
    description: 'Three or four parallel ideas side by side, numbered.',
    steps: 0,
    html: `<div data-slide data-block="cards" style="${FRAME}; justify-content: center; gap: 40px; ${PAD}">
  <div style="display: flex; flex-direction: column; gap: 14px">
    <h1 style="${HEADLINE}">Four parallel ideas</h1>
    <p style="${TEXT}; ${MUTED}">The line under the headline.</p>
  </div>
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px">
    ${card('01', 'First idea', 'What it means in a sentence.')}
    ${card('02', 'Second idea', 'What it means in a sentence.')}
    ${card('03', 'Third idea', 'What it means in a sentence.')}
    ${card('04', 'Fourth idea', 'What it means in a sentence.')}
  </div>
</div>`,
  },
  {
    id: 'two-column',
    label: 'Two column',
    description: 'Words on one side, a picture or a list on the other.',
    steps: 0,
    html: `<div data-slide data-block="two-column" style="${FRAME}; flex-direction: row; align-items: center; gap: 64px; padding: 0 96px">
  <div style="flex: 5; display: flex; flex-direction: column; gap: 22px">
    <h1 style="${HEADLINE}">The point, on the left</h1>
    <p style="${TEXT}; ${MUTED}">Two or three sentences that carry the argument. The picture is the evidence.</p>
  </div>
  <div style="flex: 6; align-self: stretch; margin: 72px 0; border-radius: 4px; background: var(--slide-surface, #eaf0fb); display: grid; place-items: center; ${LABEL}; ${ACCENT}">Replace with an image</div>
</div>`,
  },
  {
    id: 'image-full',
    label: 'Full-bleed image',
    description: 'A picture edge to edge, with the words laid over it.',
    steps: 0,
    html: `<div data-slide data-block="image-full" style="position: absolute; inset: 0; background: #192338; color: #ffffff; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 76px">
  <div data-bg style="position: absolute; inset: 0; background: #2a2a30; display: grid; place-items: center; color: #b8c8d8; ${LABEL}">Replace with an image</div>
  <div data-bg style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,8,10,0.84) 0%, rgba(8,8,10,0) 58%)"></div>
  <div style="position: relative; padding: 0 96px; display: flex; flex-direction: column; gap: 16px">
    <h1 style="${HEADLINE}">Words over the picture</h1>
    <p style="${TEXT}; color: #e2e8f0">The line that says what it shows.</p>
  </div>
</div>`,
  },
  {
    id: 'video-full',
    label: 'Full-bleed video',
    description: 'A clip edge to edge, with the words laid over it. Plays when the slide comes up.',
    steps: 0,
    media: 'video',
    html: `<div data-slide data-block="video-full" style="position: absolute; inset: 0; background: #192338; color: #ffffff; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 76px">
  <video data-video data-bg playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #192338"></video>
  <div data-video-empty data-bg style="position: absolute; inset: 0; display: grid; place-items: center; color: #b8c8d8; ${LABEL}">Replace with a video</div>
  <div data-bg style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,8,10,0.84) 0%, rgba(8,8,10,0) 58%); pointer-events: none"></div>
  <div style="position: relative; padding: 0 96px; display: flex; flex-direction: column; gap: 16px">
    <h1 style="${HEADLINE}">What the room is about to watch</h1>
    <p style="${TEXT}; color: #e2e8f0">One line on why it matters.</p>
  </div>
</div>`,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'A clip in a frame under a headline, like a screenshot that moves. Plays when the slide comes up.',
    steps: 0,
    media: 'video',
    html: `<div data-slide data-block="video" style="${FRAME}; gap: 24px; padding: 64px 96px 56px">
  <div style="display: flex; flex-direction: column; gap: 10px">
    <h1 style="${HEADLINE}">Watch it happen</h1>
    <p style="${TEXT}; ${MUTED}">The one thing to notice in it.</p>
  </div>
  <div style="position: relative; flex: 1; min-height: 0; border: 1px solid var(--slide-line, #cdd6e6); border-radius: 6px; background: var(--slide-inverse, #192b55); overflow: hidden">
    <video data-video playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"></video>
    <div data-video-empty style="position: absolute; inset: 0; display: grid; place-items: center; color: var(--slide-inverse-muted, #cad5ed); ${LABEL}">Replace with a video</div>
  </div>
</div>`,
  },
  {
    id: 'screenshot',
    label: 'Screenshot',
    description: 'A shot of the thing, captioned. What most product decks need.',
    steps: 0,
    html: `<div data-slide data-block="screenshot" style="${FRAME}; gap: 24px; padding: 64px 96px 56px">
  <div style="display: flex; flex-direction: column; gap: 10px">
    <h1 style="${HEADLINE}">What it looks like</h1>
    <p style="${TEXT}; ${MUTED}">The one thing to notice in it.</p>
  </div>
  <div style="flex: 1; min-height: 0; border: 1px solid var(--slide-line, #cdd6e6); border-radius: 6px; background: var(--slide-surface, #eaf0fb); display: grid; place-items: center; ${LABEL}; ${ACCENT}; overflow: hidden">Replace with an image</div>
</div>`,
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Someone else’s words, and who said them.',
    steps: 0,
    html: `<div data-slide data-block="quote" style="${FRAME}; justify-content: center; gap: 34px; padding: 80px 136px; background: var(--slide-surface, #eaf0fb)">
  <h1 style="${HEADLINE}; max-width: 26ch; font-style: var(--slide-quote-style, normal); font-weight: var(--slide-quote-weight, 480); text-indent: -0.42em">“The sentence that made the case better than we could.”</h1>
  <p style="${LABEL}; ${MUTED}">Who said it · where they work</p>
</div>`,
  },
  {
    id: 'stat',
    label: 'Number',
    description: 'One figure, big, with the sentence that gives it meaning.',
    steps: 0,
    html: `<div data-slide data-block="stat" style="${FRAME}; justify-content: center; gap: 24px; padding: 80px 112px">
  <h1 style="margin: 0; ${HEADING}; font-size: var(--slide-size-stat, 135px); line-height: 0.92; letter-spacing: var(--slide-tracking-display, -0.035em); font-variant-numeric: tabular-nums lining-nums; ${ACCENT}">80%</h1>
  <p style="${LEAD}; max-width: 26ch">What the number is of, and why it matters.</p>
</div>`,
  },
  {
    id: 'figures',
    label: 'Key figures',
    description: 'Three numbers side by side, each with what it counts. For results and evidence.',
    steps: 0,
    html: `<div data-slide data-block="figures" style="${FRAME}; justify-content: center; gap: 48px; ${PAD}">
  <h1 style="${HEADLINE}">What changed, in numbers</h1>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px">
    ${figure('3×', 'What the first number counts.')}
    ${figure('42%', 'What the second number counts.')}
    ${figure('12 d', 'What the third number counts.')}
  </div>
</div>`,
  },
  {
    id: 'compare',
    label: 'Before and after',
    description: 'Two states side by side. The arrangement carries the argument.',
    steps: 1,
    html: `<div data-slide data-block="compare" style="${FRAME}; justify-content: center; gap: 36px; ${PAD}">
  <h1 style="${HEADLINE}">Before, and after</h1>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px">
    <div style="display: flex; flex-direction: column; gap: 14px; padding: 32px; background: var(--slide-surface, #eaf0fb)">
      <div style="${LABEL}; ${MUTED}">Before</div>
      <div style="${STRONG}">How it works today</div>
      <div style="${TEXT}; ${MUTED}">And what that costs.</div>
    </div>
    <div data-step="1" style="display: flex; flex-direction: column; gap: 14px; padding: 32px; background: var(--slide-inverse, #192b55); color: var(--slide-on-inverse, #ffffff)">
      <div style="${LABEL}; color: var(--slide-inverse-muted, #cad5ed)">After</div>
      <div style="${STRONG}">How it works instead</div>
      <div style="${TEXT}; color: var(--slide-inverse-muted, #cad5ed)">And what that buys.</div>
    </div>
  </div>
</div>`,
  },
  {
    id: 'steps',
    label: 'Sequence',
    description: 'A process in order, arriving one stage at a time.',
    steps: 3,
    html: `<div data-slide data-block="steps" style="${FRAME}; justify-content: center; gap: 36px; ${PAD}">
  <h1 style="${HEADLINE}">How it goes</h1>
  <div style="display: flex; align-items: stretch; gap: 18px">
    ${stage(1, 'Step one', 'What happens first')}
    ${stage(2, 'Step two', 'Then this')}
    ${stage(3, 'Step three', 'And it ends here')}
  </div>
</div>`,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'What the next ten minutes hold. Also works as a recap.',
    steps: 0,
    html: `<div data-slide data-block="agenda" style="${FRAME}; justify-content: center; gap: 28px; padding: 80px 112px">
  <h1 style="${HEADLINE}">What we will cover</h1>
  <div style="display: flex; flex-direction: column; border-top: 1px solid var(--slide-line, #cdd6e6)">
    ${agendaRow('01', 'The first thing')}
    ${agendaRow('02', 'The second thing')}
    ${agendaRow('03', 'The third thing')}
  </div>
</div>`,
  },
  {
    id: 'divider',
    label: 'Section divider',
    description: 'A breath between parts. Says where the room has got to.',
    steps: 0,
    html: `<div data-slide data-block="divider" style="position: absolute; inset: 0; ${BODY}; background: var(--slide-inverse, #192b55); color: var(--slide-on-inverse, #ffffff); display: flex; flex-direction: column; justify-content: center; gap: 22px; padding: 80px 104px">
  <div style="${LABEL}; color: var(--slide-inverse-muted, #cad5ed)">Part two</div>
  <h1 style="${DISPLAY}">What it costs</h1>
</div>`,
  },
  {
    id: 'end',
    label: 'End card',
    description: 'Closes: where to go next, and one way to act.',
    steps: 0,
    html: `<div data-slide data-block="end" style="position: absolute; inset: 0; ${BODY}; background: var(--slide-inverse, #192b55); color: var(--slide-on-inverse, #ffffff); display: flex; flex-direction: column; justify-content: center; gap: 26px; padding: 80px 104px">
  <h1 style="${DISPLAY}">Thank you</h1>
  <p style="${LEAD}; color: var(--slide-inverse-muted, #cad5ed)">where.to@go.next</p>
</div>`,
  },
]

export function blockCatalogue(): { id: string; label: string; description: string; steps: number; media?: 'video' }[] {
  return SLIDE_BLOCKS.map(({ id, label, description, steps, media }) => ({
    id,
    label,
    description,
    steps,
    ...(media ? { media } : {}),
  }))
}

export function findBlock(id: string): SlideBlock | undefined {
  return SLIDE_BLOCKS.find(block => block.id === id)
}
