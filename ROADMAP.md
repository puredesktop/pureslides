# pureslides roadmap

## Scope

Keep a single HTML deck as source of truth, the slide board, markup editing, presentation and existing export paths.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Slide position labels.** Display the selected slide's position and total deck count consistently in the board, details and presentation controls.

2. **Long headline handling.** Wrap long slide headlines in board captions while preserving the full text in the slide editor.

3. **Duplicate slide feedback.** After duplication, select the new slide and briefly identify its position so users can distinguish it from the source.

4. **Delete slide context.** Show the slide number and headline in the delete confirmation, retaining the existing rule that a deck keeps at least one slide.

5. **Speaker note snippets.** Provide a short note preview beside the existing notes indicator so users can identify slides needing rehearsal without opening each one.

6. **Build-step counts.** Show the current and total build steps together in slide preview controls and disable unavailable step navigation clearly.

7. **Slide duration validation.** Explain invalid or unsupported duration values beside the seconds input rather than letting them surface only during video export.

8. **Readable deck duration summary.** Format the existing total video runtime as minutes and seconds as well as raw seconds, and state whether build-step timing is included.

9. **Overflow warning navigation.** Make each existing overflow or overlap warning select the affected slide and identify the problematic element when available.

10. **Empty slide guidance.** Explain how to add content to an empty slide through the existing headline, markup or agent controls without introducing a second editing model.

11. **HTML editor error location.** Show a useful line or element location for supported markup validation failures while retaining the user's document text.

12. **HTML editor save state.** Distinguish pending edits from applied markup in the existing editor so users can see when a paused-typing update has taken effect.

13. **Asset metadata display.** Show image dimensions, media duration when known and file size in the assets pane before users choose a resource.

14. **Missing media summary.** List unresolved asset references with their slide numbers before presentation or export, using the existing verification result.

15. **Asset reference copy feedback.** Confirm copying an existing asset reference and keep the selected asset visible afterward.

16. **History timestamp detail.** Show exact timestamps and existing change summaries in the deck history dialog to make similar versions easier to distinguish.

17. **Restore history context.** Repeat the selected version's date and slide count in the restore flow without changing the single-document history model.

18. **Presentation keyboard hints.** Expose the existing next, previous, build-step and exit shortcuts in a compact help panel available during presentation.

19. **Export capability explanations.** Explain why an export format is unavailable in the current host beside the disabled choice, rather than only after a failed attempt.

20. **Export result summary.** After export, show the output name, format and slide count and offer the existing open-output action where the host supports it.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/SlideBoardView.tsx)
