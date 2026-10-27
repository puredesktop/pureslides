# Presentation design and editor refresh

The editable source of truth is still the deck package's `index.html`. Changes
stay inside PureSlides; the shared shell, layout engine, save/history door and
export pipeline retain their ownership.

The Design inspector and new-deck wizard share visual previews for Auto, Ink,
Paper and Signal. Palette and heading tokens (`--slide-*`) are stored on the
deck root by `withDeckLook`, through `editHtml`. This preserves slide contents,
geometry, notes, builds, references and custom inline styles. The HTML's
`data-look` is authoritative when present, including after history restoration.
Legacy manifests remain a fallback. Existing hardcoded custom colors and fonts
are intentionally not rewritten; the panel explains that limitation.

All built-in compositions now use coordinated tokens. Media overlays retain
light text over a dark scrim independently of the selected style. The layout
picker renders real slide previews, with all build steps visible. The editor
separates Content and Design, offers a collapsible inspector, and adapts the
outline into a horizontal strip below 640px. The drafting guide uses the same
palette definitions and encourages deliberate whitespace and varied compositions.

Verification: 77 focused tests pass, including an actual App lifecycle test
that changes a style, switches documents, and checks the saved HTML and manifest.
Typecheck and production build pass (existing large-bundle warning). Browser
checks exercised light/dark rendering, palette changes, layout insertion and
layout measurement using the real components and shared theme in a disposable
fixture. Browser viewport automation stalled during the explicit 720px check;
installed-shell filesystem, paid generation, native full screen and exported
file visual parity still need an installed-desktop pass. No user decks were
opened and no model requests were sent.

The editing canvas now selects elements directly, with no Pick elements mode
button. Shift/Cmd/Ctrl-click adds or removes elements; a second plain click
edits selected leaf text. Blank slide space or Escape clears selection.
Escape while typing first cancels that text edit and restores its selection.
Selection opens the Content inspector. Presentation and thumbnail frames keep
selection disabled, including normal presentation media interaction.

Direct-selection verification: 44 focused tests pass (selection runtime, frame
message ownership, presentation controls, export). Typecheck and production
build pass, with the existing bundle-size warning. Browser checks confirmed
first-click selection, additive selection and Escape in the real board fixture.
