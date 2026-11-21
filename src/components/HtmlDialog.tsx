/**
 * The escape hatch.
 *
 * There used to be a whole HTML view; everything it held now lives in the
 * storyboard, the preview window or the export dialog — except this. The raw
 * markup matters most exactly when the structured views fail: a composition
 * the storyboard cannot read is one you can only fix by looking at what is
 * actually there. So the source stays reachable, as a dialog rather than a
 * destination.
 *
 * Edits land through the door once typing settles (and on blur), not per
 * keystroke: every landed edit re-renders every frame and takes its place
 * in the history, and a half-typed tag is neither a revision nor a deck.
 * The dialog remembers which version it is editing; if the deck moved
 * underneath it — an agent, an ask — the commit is refused in plain words
 * and the text is re-synced to the current document.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { containDialogFocus } from './dialogFocus'

/** How long typing has to settle before the source lands as an edit. */
export const HTML_DIALOG_SETTLE_MS = 500

export interface HtmlCommitResult {
  ok: boolean
  /** Distinguishes a concurrent stale-base refusal from a markup validation error. */
  reason?: 'stale' | 'invalid'
  /** The refusal's words when `ok` is false. */
  message?: string
}

/** Locate the approximate 1-based line number of a structural HTML problem when possible. */
function locateHtmlHint(source: string): string | null {
  const lines = source.split('\n')
  const deckLine = lines.findIndex(line => /data-deck-id|id=["']deck["']/i.test(line))
  if (deckLine === -1) return 'Line 1: missing <div id="deck" data-deck-id="deck"> root'
  const slideLine = lines.findIndex(line => /data-slide\b/i.test(line))
  if (slideLine === -1) return `Line ${deckLine + 1}: deck root has no [data-slide] child`
  const writeLine = lines.findIndex(line => /\bdocument\.write\b/.test(line))
  if (writeLine !== -1) return `Line ${writeLine + 1}: remove document.write`
  return null
}

interface HtmlDialogProps {
  open: boolean
  onClose: () => void
  html: string
  /** The hash of `html` — what a commit names as its base. */
  hash: string
  onCommit: (html: string, baseHash: string) => HtmlCommitResult
}

export function HtmlDialog({
  open,
  onClose,
  html,
  hash,
  onCommit,
}: HtmlDialogProps): React.ReactElement | null {
  const [text, setText] = useState(html)
  // The version the text was last synced from — the base every commit names.
  const [baseHash, setBaseHash] = useState(hash)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const timerRef = useRef<number | null>(null)
  const textRef = useRef(text)
  textRef.current = text
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const baseRef = useRef(baseHash)
  baseRef.current = baseHash
  // The settle timer fires later than the keystroke that armed it; it must
  // commit against the props as they are THEN, not as they were.
  const commitRef = useRef<() => boolean>(() => true)

  // Clear stale timers/notices whenever the dialog closes or opens fresh.
  useEffect(() => {
    if (!open) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setDirty(false)
      setNotice(null)
      setApplied(false)
      setText(html)
      setBaseHash(hash)
      return
    }
    setNotice(null)
    setApplied(false)
    if (!dirtyRef.current) {
      setText(html)
      setBaseHash(hash)
    }
  }, [open, html, hash])

  // Outside changes (an agent, an ask, an undo) show up while nothing is
  // half-typed; a dirty editor keeps its text and its base, and the commit
  // decides.
  useEffect(() => {
    if (dirtyRef.current) return
    if (textRef.current !== html) setText(html)
    setBaseHash(hash)
  }, [html, hash])

  const commit = useCallback((): boolean => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return true
    const result = onCommit(textRef.current, baseRef.current)
    if (!result.ok) {
      setApplied(false)
      if (result.reason === 'stale') {
        setDirty(false)
        setNotice(result.message ?? 'The deck changed elsewhere; reloaded latest HTML.')
        setText(html)
        setBaseHash(hash)
        return false
      }
      // Keep the user's in-progress buffer intact on validation errors so
      // half-typed markup is never destroyed!
      const hint = locateHtmlHint(textRef.current)
      const msg = result.message ?? 'The edit was not applied.'
      setNotice(hint && !msg.includes(hint) ? `${msg} (${hint})` : msg)
      return false
    }
    setDirty(false)
    setNotice(null)
    setApplied(true)
    return true
  }, [onCommit, html, hash])
  commitRef.current = commit

  const revert = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setText(html)
    setBaseHash(hash)
    setDirty(false)
    setNotice(null)
    setApplied(false)
  }, [html, hash])

  const change = useCallback(
    (next: string): void => {
      setText(next)
      setDirty(true)
      setApplied(false)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        commitRef.current()
      }, HTML_DIALOG_SETTLE_MS)
    },
    [],
  )

  const close = useCallback((): void => {
    if (!commit()) return
    onClose()
  }, [commit, onClose])

  const discardAndClose = useCallback((): void => {
    revert()
    onClose()
  }, [revert, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  if (!open) return null
  return (
    <Scrim onClick={close}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-label="The document HTML"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <Title>The document</Title>
          <span style={{ flex: 1 }} />
          <Note role="status">
            {notice && dirty
              ? 'Fix the markup error to apply.'
              : notice
                ? 'Reloaded latest deck HTML.'
                : dirty
                  ? 'Unsaved edits — applies when you pause or click Apply.'
                  : applied
                    ? 'Applied to deck.'
                    : 'Edits apply when you pause typing.'}
          </Note>
          {dirty ? (
            <>
              <CloseButton type="button" onClick={commit}>
                Apply
              </CloseButton>
              <CloseButton type="button" onClick={revert}>
                Revert
              </CloseButton>
            </>
          ) : null}
          {notice && dirty ? (
            <CloseButton type="button" onClick={discardAndClose}>
              Discard &amp; Close
            </CloseButton>
          ) : (
            <CloseButton type="button" onClick={close}>
              Close
            </CloseButton>
          )}
        </Head>
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        <Editor
          value={text}
          spellCheck={false}
          aria-label="Composition HTML"
          onChange={event => change(event.currentTarget.value)}
          onBlur={commit}
        />
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 35;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(880px, calc(100vw - 48px));
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  /* The popover surface, opaque: the chrome surface is glass on a glass desk, and the editor showed through. */
  background: var(--platform-colors-elevated, #fff);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.28);
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const Title = styled.h2`
  margin: 0;
  font-size: 16px;
`

const Note = styled.span`
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
`

const Notice = styled.div`
  padding: 8px 10px;
  border: 1px solid var(--platform-colors-danger, #b4340e);
  font-size: 12px;
  color: var(--platform-colors-danger, #b4340e);
`

const CloseButton = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const Editor = styled.textarea`
  flex: 1;
  min-height: 0;
  resize: none;
  padding: 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
`
