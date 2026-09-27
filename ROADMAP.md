# pureslides contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep a single HTML deck as source of truth, the slide board, markup editing, presentation and existing export paths.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **See your slide number everywhere.** Display the selected slide's position and total deck count consistently in the board, details and presentation controls.
   <!-- contribution: {"id": "slide-position-labels", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/slide-position-labels.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/slide-position-labels.md)

2. **Read speaker-note previews on the board.** Provide a short note preview beside the existing notes indicator so users can identify slides needing rehearsal without opening each one.
   <!-- contribution: {"id": "speaker-note-snippets", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/speaker-note-snippets.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/speaker-note-snippets.md)

3. **See the deck’s running time in minutes.** Format the existing total video runtime as minutes and seconds as well as raw seconds, and state whether build-step timing is included.
   <!-- contribution: {"id": "readable-deck-duration-summary", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/readable-deck-duration-summary.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/readable-deck-duration-summary.md)

4. **See presentation keyboard shortcuts.** Expose the existing next, previous, build-step and exit shortcuts in a compact help panel available during presentation.
   <!-- contribution: {"id": "presentation-keyboard-hints", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/presentation-keyboard-hints.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/presentation-keyboard-hints.md)

5. **Read longer slide headlines on the board.** Wrap long slide headlines in board captions while preserving the full text in the slide editor.
   <!-- contribution: {"id": "long-headline-handling", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/long-headline-handling.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/long-headline-handling.md)

## More improvements

6. **Find a newly duplicated slide.** After duplication, select the new slide and briefly identify its position so users can distinguish it from the source.
   <!-- contribution: {"id": "duplicate-slide-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/duplicate-slide-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/duplicate-slide-feedback.md)

7. **Check which slide you are deleting.** Show the slide number and headline in the delete confirmation, retaining the existing rule that a deck keeps at least one slide.
   <!-- contribution: {"id": "delete-slide-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/delete-slide-context.md"} -->
   [Medium · Implementation brief](docs/contributions/delete-slide-context.md)

8. **See your place in a slide’s build steps.** Show the current and total build steps together in slide preview controls and disable unavailable step navigation clearly.
   <!-- contribution: {"id": "build-step-counts", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/build-step-counts.md"} -->
   [Small · Implementation brief](docs/contributions/build-step-counts.md)

9. **Correct slide timing before export.** Explain invalid or unsupported duration values beside the seconds input rather than letting them surface only during video export.
   <!-- contribution: {"id": "slide-duration-validation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/slide-duration-validation.md"} -->
   [Medium · Implementation brief](docs/contributions/slide-duration-validation.md)

10. **Jump to a slide with a layout warning.** Make each existing overflow or overlap warning select the affected slide and identify the problematic element when available.
   <!-- contribution: {"id": "overflow-warning-navigation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/overflow-warning-navigation.md"} -->
   [Medium · Implementation brief](docs/contributions/overflow-warning-navigation.md)

11. **Start an empty slide.** Explain how to add content to an empty slide through the existing headline, markup or agent controls without introducing a second editing model.
   <!-- contribution: {"id": "empty-slide-guidance", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/empty-slide-guidance.md"} -->
   [Small · Implementation brief](docs/contributions/empty-slide-guidance.md)

12. **Locate a markup error.** Show a useful line or element location for supported markup validation failures while retaining the user's document text.
   <!-- contribution: {"id": "html-editor-error-location", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/html-editor-error-location.md"} -->
   [Medium · Implementation brief](docs/contributions/html-editor-error-location.md)

13. **Know when HTML edits have applied.** Distinguish pending edits from applied markup in the existing editor so users can see when a paused-typing update has taken effect.
   <!-- contribution: {"id": "html-editor-save-state", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/html-editor-save-state.md"} -->
   [Medium · Implementation brief](docs/contributions/html-editor-save-state.md)

14. **Inspect image and media assets.** Show image dimensions, media duration when known and file size in the assets pane before users choose a resource.
   <!-- contribution: {"id": "asset-metadata-display", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/asset-metadata-display.md"} -->
   [Medium · Implementation brief](docs/contributions/asset-metadata-display.md)

15. **Find missing media before presenting.** List unresolved asset references with their slide numbers before presentation or export, using the existing verification result.
   <!-- contribution: {"id": "missing-media-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/missing-media-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/missing-media-summary.md)

16. **Copy an asset reference reliably.** Confirm copying an existing asset reference and keep the selected asset visible afterward.
   <!-- contribution: {"id": "asset-reference-copy-feedback", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/asset-reference-copy-feedback.md"} -->
   [Small · Implementation brief](docs/contributions/asset-reference-copy-feedback.md)

17. **Tell saved deck versions apart.** Show exact timestamps and existing change summaries in the deck history dialog to make similar versions easier to distinguish.
   <!-- contribution: {"id": "history-timestamp-detail", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/history-timestamp-detail.md"} -->
   [Medium · Implementation brief](docs/contributions/history-timestamp-detail.md)

18. **Check the version before restoring a deck.** Repeat the selected version's date and slide count in the restore flow without changing the single-document history model.
   <!-- contribution: {"id": "restore-history-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/restore-history-context.md"} -->
   [Medium · Implementation brief](docs/contributions/restore-history-context.md)

19. **Understand unavailable export formats.** Explain why an export format is unavailable in the current host beside the disabled choice, rather than only after a failed attempt.
   <!-- contribution: {"id": "export-capability-explanations", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-capability-explanations.md"} -->
   [Medium · Implementation brief](docs/contributions/export-capability-explanations.md)

20. **Find and open an exported deck.** After export, show the output name, format and slide count and offer the existing open-output action where the host supports it.
   <!-- contribution: {"id": "export-result-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-result-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/export-result-summary.md)

21. **Review your rehearsal timing slide by slide.** Extend the existing presenter view with a rehearsal timing report: time spent on each slide, visits and total duration, with pause/reset and an optional target duration. Reuse presenter navigation and keep speaker notes out of audience output.
   <!-- contribution: {"id": "rehearse-with-notes-and-a-next-slide-preview", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/rehearse-with-notes-and-a-next-slide-preview.md"} -->
   [Large · Implementation brief](docs/contributions/rehearse-with-notes-and-a-next-slide-preview.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
