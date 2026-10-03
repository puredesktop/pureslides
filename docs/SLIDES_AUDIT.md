# PureSlides reliability and loading audit — 2026-10-03

The canonical editable source remains the package's `index.html`; `manifest.json`
keeps the title, brief, wizard choices and asset notes. Every content edit still
passes through `editDeck` and its hash/history/scope checks. These changes belong
in the app. No shared SDK, shell behaviour or installer changed.

## Fixed

- Opening another deck previously replaced the bound source before the old
  lifecycle flushed. This could write the newly opened HTML into the previous
  package. Open and New now await a successful strict flush before replacement.
  A failed save keeps the original source and metadata available.
- A package is read and validated completely before its state is adopted.
  Missing legacy manifests remain supported; unreadable, malformed and non-object
  manifests are refused rather than silently replaced with defaults.
- Overlapping opens honour the newest request. An unsuccessful host resource is
  retained with an explicit Retry opening action. Disposal invalidates unfinished
  reads. React StrictMode does not consume the same request twice.
- UI and drawer mutations wait during switching. Revision restores and asset
  imports check their originating deck before applying delayed results.
- Preview loading belongs to one package and one attempt. Pictures use up to three
  concurrent readers; referenced clips use one reader, preserving byte caps and
  stable ordering. The completed map is published together instead of repeatedly
  rebuilding every slide iframe for individual files. Late results from another
  package are ignored, and newly hydrated referenced clips survive an older batch.
- Presentation keys are forwarded from the focused sandboxed slide iframe to the
  existing presentation controller. Only that frame's messages are accepted;
  editable controls keep their own keys. Slide/step seeks retain the iframe
  document. Invalid starting positions and positions after shrink are clamped,
  and partial numeric jumps reset when a presentation opens again.
- The app resolves its own compatible pinned SWC compiler/plugin pair for builds.

## Verification

- 166 Vitest tests in 23 files; TypeScript check and production build pass.
- Seven App integration tests use the actual shared document lifecycle with
  disposable in-memory filesystem/bridge mocks. Six earlier regression cases
  failed against the original App implementation, then passed with these fixes.
  The asset race additionally verifies two packages sharing a filename.
- Dedicated tests cover save ordering/failure, latest-open wins, disposal,
  manifest errors, preview concurrency/caps, drawer mutation gating, source-bound
  iframe messages, stable iframe seeks and presentation keyboard/position state.
- A disposable browser fixture exercised the actual PresentWindow and SlideFrame
  at 1280×720 and 390×844. With focus inside the opaque slide iframe, arrow keys
  advanced through a build and onto the next slide; Escape closed the presentation.
  The 390px view had no horizontal overflow. Temporary fixtures were removed.

## Limits

Browser verification used the embedded presentation fallback: this automation
browser does not retain native fullscreen. Native fullscreen, real installed-host
filesystem/watchers, draft creation, exports and paid assistant workflows require
an installed desktop check. No real user decks were opened or modified and no
assistant requests were sent. The existing large production bundle warning and
happy-dom warnings for intentionally disabled embedded-page loading remain.
