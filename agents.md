# PureSlides4 — for agents

## Mission stage completion

In a mission, execute only the assigned stage. Read actual upstream files before
using their contents; a handoff summary is a pointer, not verification. Reopen
saved output and perform the requested checks/export. Then return the final
result immediately. The scheduler starts later stages: do not ask whether to
continue to another app, whether to stop here, or whether to submit the result.
Saving, checking and reporting this assigned work are already authorized.
Ask only for genuinely missing input that prevents this stage from proceeding.
YOLO changes approval gates; it does not answer questions, so do not manufacture
a finalization question.

Return exactly one JSON object, without fences or surrounding prose:
`{"taskOutcome":"Verified outcome of this stage", "artifactPaths":[], "observations":[]}`.
Check the spelling `taskOutcome` and all field types. List only this stage's
verified, saved outputs. Do not repeat successful writes to repair a final response.
Report unfinished work honestly; a saved draft is not a verified export.


A deck is ONE HTML document. Every slide is a direct child of the deck root
carrying `data-slide`, and the board is a view of that markup — there is no
second model. Every tool here rewrites the document.

## The deck root — get this right or nothing renders

```html
<div id="deck" data-deck-id="deck" data-width="1280" data-height="720"
     style="width: 1280px; height: 720px; position: relative; overflow: hidden">
  <div data-slide data-block="title" style="position: absolute; inset: 0">…</div>
  <div data-slide data-block="point" style="position: absolute; inset: 0">…</div>
</div>
```

Geometry lives on the root and nowhere else. A document with no root cannot
be presented or exported, and `checkDeck` refuses it — so does the door:
a `setDeck` or `setSlideHtml` that leaves the deck without a root is
refused as invalid, and nothing lands.

## Slides are ordered, not timed

This is the one place a deck differs from a video. PureVideo's scenes are
sequential in seconds, so moving one rewrites every start after it. Slides
advance when a person presses a key, so `moveSlide` is a pure reorder and
nothing else has to be recomputed. Time appears only in a video export, and
it is derived then.

A slide's headline goes in an `<h1>` and its second line in a `<p>`. The
board reads those two elements to show and edit a slide's copy, so a slide
built from unlabelled divs cannot be edited without rewriting it.

## Builds — the dynamic part, and why it is seekable

A descendant carrying `data-step="N"` (N ≥ 1) arrives on the Nth press;
anything without one is on from the start. Number them from 1 with no gaps —
a gap is a press that does nothing, and `checkDeck` warns about it.

Revealing is a class the document styles (`.pv-in` / `.pv-out`), and the
state is SET rather than played. That is what makes step 2 look identical
whether you pressed twice or jumped straight there — and therefore what lets
one model serve the board's preview, presenting, the PDF (every step
revealed) and the video (steps spread across each slide's seconds).

Build lists and reveals. Do NOT build a headline in: the room needs to know
what it is looking at.

## Reach for a composition, don't invent one

`listBlocks` offers seventeen layouts that carry meaning in their arrangement
— title, statement, points that build, cards, two column, full-bleed image,
full-bleed video, video, screenshot, quote, number, key figures,
before-and-after, sequence, agenda, divider, end card. Each says what it is
FOR and how many presses it takes. `addBlock` adds one; then edit it like any
other slide.

Use them. A deck written from nothing comes out as fifteen headline-and-
bullets slides, because that is the shape that always fits — and a room can
feel it.

## Type — the look sets it; write with its tokens

A look is a palette AND a type voice: a heading face, a body face and a mono
face that ship with the app (open-licence, no network), a modular scale, and
the weight, leading, tracking and line length for each level. Seven looks:
Auto (Inter), Ink (Space Grotesk over IBM Plex Sans, dark), Paper (Newsreader
Display over Newsreader), Signal (Bricolage Grotesque over Inter), Brief
(Archivo, dense), Gallery (Instrument Serif over Instrument Sans) and Clear
(Atkinson Hyperlegible Next, larger). `setLook` picks one (`getDeckContext`
says which is set) — for a deck with no brand to match. An organisation's
own look is `setCustomLook` (next section): any palette roles, any bundled
or brand face, a motif. All of it lands on the deck root as
`--slide-*` tokens, and every block reads them, so a block reads right in
every look.

Write slides the same way — inline styles with the tokens, never raw sizes or
font names: `font-size: var(--slide-size-headline)` for an `<h1>`,
`--slide-size-display` for a title or statement, `--slide-size-lead`,
`--slide-size-body`, `--slide-size-label` (uppercase with
`--slide-tracking-label`) and `--slide-size-stat`; leading
`--slide-leading-*`, tracking `--slide-tracking-*`, line length
`max-width: var(--slide-measure-body)`; families `--slide-heading-font`,
`--slide-body-font`, `--slide-mono-font`. Never write `@font-face` or link a
font: the deck's `<style data-deck-type>` is derived from the tokens on every
edit, points at the faces in the package's `assets/fonts/`, and gives every
slide balanced headlines, pretty paragraphs, tabular figures in tables and
`[data-num]`, and no fake bold. A deck whose root has no type tokens (made
before looks had type) is left alone until a look is chosen.

`checkDeck` warns — never blocks — about type a room will notice:
`type-too-small` (under 18px on a 1280-wide slide, scaled for wider ones),
`type-measure` (body lines past 75 characters), `type-families` (more than two
typefaces; a mono face for code does not count), `type-widow` (a headline
ending on one word), `type-words` (over 60 words on a slide), `type-contrast`
(under 4.5:1, or 3:1 for large text) and `type-hierarchy` (a headline smaller
than the text under it; a figure may be larger). Fix them like layout
findings. It also warns `copy-thin-card`: a card (a box beside others in a
row or grid, or anything classed `card`) holding only a word or two. Give it
a claim from the brief or remove it (see "The words come from the brief"). For how to choose a look, pair, scale, align, colour and space a
deck, and for the final visual review, read the **Slide typography and
design** skill.

## The organisation's house style comes first

On a desktop in an organisation, the organisation has a default brand, its
house style (`listBrands` marks it `default: true`; `getDeckContext` reports
it as `houseStyle`). A new deck starts in it:

- `createDeck` with no `brand` puts the house style on the new deck (its
  colours, faces, logos and motif) and its reply names it and lists its
  `samples`. Do not pass `brand` unless the person named one; `brand:
  "none"` is only for a person who asked for a stock look.
- **Look at the samples first.** `view_image` each sample path before you
  write a slide: they show the brand in use, which tokens alone do not.
- **Keep it.** Do not call `setLook` on a deck in the house style: it refuses
  unless `ignoreHouseStyle: true`, which is only for a person who asked for
  that stock look.
- **The person's reference still wins.** A reference image or a brand the
  person gives replaces the house style: `setCustomLook` from it, as below.
- **Say which brand you used** in your reply: "In pure.science, your
  organisation's house style", or the brand the person chose.
- `setCustomLook` `brand` takes an id from `listBrands` as well as a path.
- **Proposing to the organisation.** `proposeBrandToOrganisation` sends a
  saved brand (an id or path; with neither, the brand saved from this deck,
  saved now if it never was) for an administrator to approve; a house style
  needs at least one sample image. `proposeSamplesToOrganisation` sends this
  deck's slides (exported as pictures, up to 12, or the `slides` you name) or
  `images` you name as examples of the house style. Both are refused in plain
  words when the desktop is not in an organisation; pass the reply's
  `message` on to the person. The person has the same action under Design ›
  "Propose to organisation…".

## An organisation's own look — from a reference or a brand

When the person gives a reference image (their website, a brochure, a
screenshot) or a brand (`.designsystem.json`), or asks for "our look and
feel", the deck is made in THAT look. The stock looks are never a substitute:
`setLook` refuses while a reference is attached. The method is the suite's
shared **Matching a house style** skill (read it with `read_skill`); here it
is with this app's tools:

1. **Look at the reference first.** `view_image` with its absolute path shows
   you the pixels. A filename is not evidence: never describe or match an
   image you have not seen. `addAsset` it and `setAssetRole` it `reference`
   so it stays with the deck and `viewSlide` can compare against it.
2. **Read it by role**: ground, text, muted text, the accent (the primary
   button), a second accent (a headline's second-colour line), a highlight (a
   small bright tag or node colour), surfaces and hairlines — as hex values
   picked from the pixels, not guessed.
3. **Read the type**: classify the headline face (geometric or grotesque sans,
   serif, mono; width; x-height; the a, g and t), its weight and tracking,
   whether tags are set in a monospace. `listLookFonts` lists the bundled open
   faces with what each is like; pick the closest. A brand's own woff2 files
   (from its `.designsystem.json`) travel in the deck instead.
4. **Set it**: `setCustomLook` with `brand`, or with `colors`, `fonts`,
   `scale`, `radius` read off the reference. Its notes report contrast
   failures and faces that would not travel; fix them.
5. **Generate the motif; do not draw it.** Do this before writing slides,
   whenever the reference has one; a deck without it is not the brand. A recurring graphic idea in the
   reference — a network of glowing nodes, a grain, a light field, a texture,
   hero or conceptual art — is made with the image model: `makeMotif`, with a
   prompt describing it from the reference, and `reference` set so the model
   matches it. It asks for the brand palette, a wide background-safe
   composition with quiet areas for type and no text, saves the picture in
   `assets/motifs/` and sets it behind every slide. Judge the returned picture
   against the reference; regenerate if it is off. Use ONE motif across the
   deck. SVG or CSS line art is only the fallback when `makeMotif` reports no
   image model (say so), or for exact diagrams and charts.
6. **Write the slides in it**: `--slide-accent-2` for the second line of a
   headline (`<span style="display: block; color: var(--slide-accent-2)">`),
   `--slide-label-font` with `--slide-highlight` for tracked tags like
   `// RESEARCH & PUBLISHING`, `--slide-radius` on cards and the button shape,
   `--slide-accent` for the one primary action. Keep slide grounds
   `var(--slide-bg)` so the motif shows; `data-motif="none"` on a slide that
   must stand clear (a dense table), `data-motif="right"` or `"faint"` where
   text needs more room.
7. **Compare before you finish.** `viewSlide` draws a slide and puts the
   reference beside it. Name every difference a person who knows the brand
   would see — ground, face, weight, second colour, labels, motif, shapes,
   space — fix it, and look again. Do this for the title slide and at least
   one content slide.
8. **Keep it.** `saveLookAsBrand` writes the look as a brand (the shared
   format, with fonts, logos, the motif art and the references beside it), so
   Canvas, PureSite and PureDesign make the next piece in the same look.

## The words come from the brief

When the brief gives claims or copy, the deck's words are the client's. The
rule is the suite's shared **Copy comes from the brief**, section 8 of the
**Matching a house style** skill (`read_skill`); in short:

- Every headline, subhead, card and call to action quotes a claim from the
  brief or restates it closely: no new facts, numbers, customers or
  capabilities, and no lines of your own ("From workshop to rollout.").
- A reference is for the look, not the words. Never put its headline or
  taglines on a slide unless the brief says to, even while `viewSlide` shows
  it beside your slide.
- No filler. A card carries a real claim or is removed; never a card with
  only a label ("Shape", "Learn"). A punchy cut of a claim is fine when it
  means the same.
- Before finishing, list each claim-bearing line next to the claim it comes
  from (in your reply), and fix any line that has none. `checkDeck`'s
  `copy-thin-card` catches the thin cards; the list catches the rest.

## Video on a slide

A slide can hold a clip: a `<video>` whose `src` is a file in the package's
`assets/` — `<video data-video src="assets/demo.mp4" playsinline
preload="metadata">`. Two compositions carry one: `video-full` (edge to
edge, words over it) and `video` (a clip in a frame under a headline).
The path is `addAsset` the clip, then `addBlock` with `asset: "demo.mp4"`
— the clip goes into the block's slot and the "replace with a video" cover
goes. `setElement` on an existing `<video>` does the same by hand.

The clip PLAYS when its slide comes up on a live surface (the stage,
presenting) and stops when the slide goes; a step press leaves it running.
Sound is tried first, muted is the fallback. `data-video-play="manual"`
keeps a clip from starting on its own. A card, a measurement, a print and a
frame capture show its first frame, never play.

What each export does with it:

- **PDF** — paper cannot play. The clip prints as its `poster` where it has
  one, otherwise as a dark panel with a play mark naming the file.
- **PowerPoint** — the real clip, laid over the slide's picture at the
  place the board shows it, with the picture's own pixels as its cover, so
  nothing shifts when it starts. MP4 (H.264) plays in PowerPoint; other
  formats are embedded but may show as a still.
- **Images and video** — the first frame, as captured.

`checkDeck` warns about a slot with nothing in it (`video-empty`), a clip
from the network (`remote-video`) and a format PowerPoint may not play
(`video-format`); none of them block.

## "This" and "these" mean something — find out what

A request that points rather than names is about whatever the author has
aimed at. `getDeckContext` returns it as `aim`:

- `{ scope: 'elements', slideIndex, elements: [{ path, label }] }` — change
  only those, with `setElement` or `deleteElement`.
- `{ scope: 'slides', slideIndexes }` — several slides; keep them consistent.
- `{ scope: 'slide', slideIndex }` — the slide on screen. The default.

`setSelection` is the same channel in reverse: select what you are about to
change so the author sees it first.

## Assets have a role

`listAssets` reports one for each file:

- **`content`** (default) — material a slide may show.
- **`reference`** — a design reference. Never placed on a slide; it is the
  look the deck is built to. Read the palette, type and spacing off it.
- **`logo`** — the brand mark, for the title and closing slides.

## Starting a deck from a brief

Not "write eight slides by hand". The author's path is:

1. `addAsset` each file, `setAssetRole` for references and logos,
   look at each with `view_image`, `describeAsset` every image — a description is what a slide gets written
   FROM, and an undescribed file is skipped rather than used badly.
2. `setBrief` with what the deck is for and roughly how many slides, and
   the look: `setCustomLook` (and `makeMotif`) when there is a reference or a
   brand; a deck already in the organisation's house style keeps it (look
   at its samples first); otherwise `setLook` with the stock look that suits
   the room.
3. `draftDeck`.

`draftDeck` now PREPARES a durable request and returns immediately. It never
runs another model. Its reply is a short receipt — `requestId`, `baseHash`,
`kind`, `status`, `path`, image count and the base html's size — not the
request itself. Read getDrawerRequest, use its design guide and base HTML,
compose here in the drawer, then call commitDrawerRequest with requestId,
baseHash and complete HTML (including notes/build attributes). A deck of more
than 6 slides goes in parts, because a whole long deck is more than one reply can
hold (the call is cut off and arrives empty): commit the first 4–6 slides, then
`addSlide` with each remaining slide's html, one call per slide, in order; then
`checkDeck`. For a draft,
replace the untouched starter; preserve existing slides unless asked to replace.
For edits, only the saved slide/element scope may change; head/CSS and other
slides are protected by a deterministic comparison. Pass the full valid deck.
Images supplied with UI requests are actual pixels. Tool-triggered requests
must use available image-viewing tools on the exact saved files; paths and
filenames alone are not evidence. Do not invent descriptions if pixels cannot
be viewed. A description request commits a descriptions array instead of HTML.
No nested model call or same-runner message dispatch is used by tools.
Commit results distinguish persisted from checked: run checkDeck afterward,
repair findings, export when requested, and reopen the saved output for handoff.
Retries of a committed request return the receipt; changed documents require
reconciliation and a fresh request. New requests replace the previous request.

## The hash — read, then edit, then read again

Every read (`getDeckContext`, `getSlide`, `listSlides`) returns `hash`, the
content hash of the deck as you saw it. Every mutating tool takes
`baseHash`. Pass it, always: an edit whose base is not the current hash is
REFUSED — the author typed, an ask landed, another tool ran — and the
refusal carries the current hash and says to re-read. Redo the edit
against the deck as it is now; never retry blind. Every landed edit
returns the new `hash`, which is the base for your next one.

`baseHash` is optional for one release so older prompts keep working; a
stale hash, when given, is refused all the same. There is one door for
every change — yours, the author's, the ask box's — so nothing you write
can overwrite something you did not read.

## Verification — what "checked" means, and the words

The board measures every slide as it renders it: an overflowing slide is
scaled to fit, and two elements that both carry content and sit on top of
each other are reported as an overlap that scaling cannot fix. That
measurement is only worth something under the right conditions, so the
deck's render is in one of three states (`getDeckContext.verification`,
`checkDeck.layout`):

- **verified** — "Layout checked": every slide measured cleanly, in a frame
  with geometry, with its fonts loaded.
- **checking** — "Layout being checked": some slide has not been measured
  in a visible frame with loaded fonts yet (the app was hidden, a web font
  was still arriving, the Files pane was up, the html just changed). Never
  treated as verified; it clears when a visible frame confirms it.
- **failed** — "Slide 4 has overlapping text": a clean measurement whose
  content overlaps. A fault in the slide, not the view — change the layout
  (`setElement`, `setSlideHtml`); scaling and re-checking will not fix it.

## Presenting and exporting

`present` opens the deck full screen from a slide. `exportDeck` takes
`pdf` (one page per slide, every build revealed — paper has no presses; a
clip prints as its poster or a labelled panel), `images` (a PNG per
slide), `pptx` (a PowerPoint file: one picture slide per slide, the
board's render, speaker notes attached, every clip placed as real video
that plays — it opens in PowerPoint, Keynote and Google Slides, but its
text is a picture, not type) or `video` (slides on a clock).

The export is the render: the PDF prints the same markup the board shows,
driven by the same seek script (one core for showing a slide, applying a
step and fitting it), so a page is the preview at its last step. The
pipeline measures every slide again before writing anything and REFUSES
when the layout is not verified — an overlapping slide, a check that could
not finish, a `checkDeck` error. The refusal names the slides and what to
do; there is no way around it, for you or the button. A PDF whose sheet
count does not match the deck is reported out loud, not handed over.

## History — every rewrite is undoable

Before an ask, a `setDeck`, any slide or element tool, a draft or a
restore lands, the deck AS IT WAS is copied into the package's `history/`
folder (12 kept, deduped). `listRevisions` lists them newest first with
`textChars` per entry; `restoreRevision` puts one back through the same
door, snapshotting the current deck first, so a restore is itself
undoable. An edit result reports `textRemoved` when more than about a
third of the visible text vanished and the request did not ask for
anything to be removed — that is your cue to restore and redo the edit
carrying the content forward.

## Reference mapping

| Task | Tools |
| --- | --- |
| See what is open, and what "this" means | `getDeckContext` |
| See the slides in order | `listSlides` |
| Read one slide's markup | `getSlide` |
| Add, retime, reorder or cut a slide | `addSlide`, `updateSlide`, `moveSlide`, `duplicateSlide`, `deleteSlide` |
| Rewrite one slide | `setSlideHtml` |
| Retype one element | `getDeckContext` → `setElementText` |
| Rewrite one element | `getDeckContext` → `setElement` |
| Add a ready-made layout | `listBlocks` → `addBlock` |
| Set the type | `setLook`; write sizes and faces with `--slide-*` tokens |
| Match an organisation's look | `view_image` → `setCustomLook` (`brand` or tokens) → `makeMotif` → `viewSlide` |
| See the bundled faces | `listLookFonts` |
| Look at a slide beside the reference | `viewSlide` |
| Keep the look for other apps | `saveLookAsBrand` |
| See the brands, the house style marked | `listBrands` |
| Start a deck (in the house style unless told otherwise) | `createDeck` → `view_image` its `samples` |
| Offer a brand to the organisation | `proposeBrandToOrganisation` |
| Offer this deck's slides as house-style examples | `proposeSamplesToOrganisation` |
| Put a clip on a slide | `addAsset` → `addBlock` (`video-full` or `video`, with `asset`) |
| Remove one element | `getDeckContext` → `deleteElement` |
| Make something arrive on a press | `setElementStep` |
| Speaker notes | `updateSlide` with `notes` |
| Files | `addAsset`, `setAssetRole`, `describeAsset`, `listAssets` |
| Start a deck | `setBrief` → `draftDeck` |
| Show the author what you mean | `setSelection` |
| Sanity-check, and read the layout state | `checkDeck` |
| Present it | `present` |
| Get it out (refused unless verified) | `exportDeck`, `stopExport` |
| See what a rewrite replaced | `listRevisions` |
| Put a previous version back | `listRevisions` → `restoreRevision` |

If the user abandons a saved request, cancelDrawerRequest with its requestId. It refuses late commits; stopping the runner alone preserves the request for later recovery.
