/**
 * What the deck was before each rewrite.
 *
 * Every ask, agent update, draft and restore copies the deck AS IT WAS into
 * the package's history/ folder first (the kit's revision history: capped,
 * deduped, restore-current-first). This is that list, newest first, with
 * one verb — Restore — and the words that say what each entry is the state
 * before. A restore snapshots the current deck first, so it is itself
 * undoable.
 */
import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { revisionLabel, type RevisionEntry } from '@purescience/platform-ui/editing'
import { DECK_REASON_LABELS } from '../lib/deckDoor'
import { revisionAgentRefs } from '../agentRefs'
import { containDialogFocus } from './dialogFocus'

export interface RevisionPreview {
  slides: number
  headlines: string[]
}

interface HistoryDialogProps {
  open: boolean
  onClose: () => void
  entries: RevisionEntry[]
  /** Visible text characters of the deck as it is now — the yardstick each entry is compared to. */
  currentTextChars: number
  onRestore: (file: string) => void | Promise<boolean>
  onPreview?: (file: string) => Promise<RevisionPreview | null>
  busy: boolean
}

export function HistoryDialog({
  open,
  onClose,
  entries,
  currentTextChars,
  onRestore,
  onPreview,
  busy,
}: HistoryDialogProps): React.ReactElement | null {
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, RevisionPreview | null>>({})
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const [confirmFile, setConfirmFile] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setConfirmFile(null)
      setPreviewFile(null)
      setPreviews({})
      setFeedback(null)
      return
    }
    setConfirmFile(null)
    setFeedback(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const now = Date.now()

  const togglePreview = async (file: string): Promise<void> => {
    if (previewFile === file) {
      setPreviewFile(null)
      return
    }
    setPreviewFile(file)
    if (!onPreview || previews[file]) return
    setLoadingPreview(file)
    try {
      const info = await onPreview(file)
      if (info) {
        setPreviews(current => ({ ...current, [file]: info }))
      }
    } catch {
      /* transient error: leave uncached so user can retry */
    } finally {
      setLoadingPreview(current => (current === file ? null : current))
    }
  }

  const handleRestore = async (file: string): Promise<void> => {
    try {
      const result = await onRestore(file)
      if (result === false) {
        setFeedback('Could not restore that version.')
      } else {
        setFeedback('Version restored. The previous state was saved to history.')
      }
    } catch {
      setFeedback('Could not restore that version.')
    } finally {
      setConfirmFile(null)
    }
  }

  return (
    <Scrim onClick={onClose}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-label="Deck history"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <Title>History</Title>
          <span style={{ flex: 1 }} />
          <Mono>{entries.length ? `${entries.length} kept` : 'nothing yet'}</Mono>
          <CloseButton type="button" onClick={onClose}>
            Close
          </CloseButton>
        </Head>
        <Note>
          Each entry is the deck as it was before a rewrite. Restore puts it back —
          the deck as it is now is kept first, so a restore can itself be undone.
        </Note>
        {feedback ? <Note role="status">{feedback}</Note> : null}
        {entries.length ? (
          <List>
            {entries.map(entry => {
              const delta = entry.textChars - currentTextChars
              const expanded = previewFile === entry.file
              const preview = previews[entry.file]
              const confirming = confirmFile === entry.file
              return (
                <EntryBlock key={entry.file}>
                  <Row
                    {...revisionAgentRefs(entry.file, revisionLabel(entry, now, DECK_REASON_LABELS))}
                  >
                    <RowText>
                      <RowLabel>{revisionLabel(entry, now, DECK_REASON_LABELS)}</RowLabel>
                      <RowMeta>
                        {entry.textChars.toLocaleString()} characters of text
                        {delta > 0 ? ` · ${delta.toLocaleString()} more than now` : ''}
                        {delta < 0 ? ` · ${Math.abs(delta).toLocaleString()} fewer than now` : ''}
                        {entry.scope ? ` · ${entry.scope}` : ''}
                      </RowMeta>
                    </RowText>
                    {onPreview ? (
                      <CloseButton type="button" onClick={() => void togglePreview(entry.file)}>
                        {expanded ? 'Hide' : 'Inspect'}
                      </CloseButton>
                    ) : null}
                    {confirming ? (
                      <>
                        <RestoreButton
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRestore(entry.file)}
                        >
                          Confirm restore
                        </RestoreButton>
                        <CloseButton type="button" onClick={() => setConfirmFile(null)}>
                          Cancel
                        </CloseButton>
                      </>
                    ) : (
                      <RestoreButton
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirmFile(entry.file)
                          if (onPreview && !expanded) void togglePreview(entry.file)
                        }}
                      >
                        Restore
                      </RestoreButton>
                    )}
                  </Row>
                  {expanded ? (
                    <PreviewBox>
                      {loadingPreview === entry.file ? (
                        <RowMeta>Loading version summary…</RowMeta>
                      ) : preview ? (
                        <>
                          <RowMeta>
                            {preview.slides} {preview.slides === 1 ? 'slide' : 'slides'}
                          </RowMeta>
                          {preview.headlines.length ? (
                            <PreviewList>
                              {preview.headlines.slice(0, 6).map((headline, idx) => (
                                <li key={idx}>
                                  {idx + 1}. {headline || '(Untitled slide)'}
                                </li>
                              ))}
                              {preview.headlines.length > 6 ? (
                                <li>+{preview.headlines.length - 6} more slides</li>
                              ) : null}
                            </PreviewList>
                          ) : null}
                        </>
                      ) : (
                        <RowMeta>Preview unavailable for this revision.</RowMeta>
                      )}
                    </PreviewBox>
                  ) : null}
                </EntryBlock>
              )
            })}
          </List>
        ) : (
          <Empty>
            No revisions yet. One is kept before every ask, agent update and draft.
          </Empty>
        )}
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 34;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
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

const Note = styled.div`
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--platform-colors-text-secondary);
`

const Mono = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string): Record<string, string> => ({ 'data-chrome': kind })

const List = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--platform-colors-border);
`

/** One revision per platform list row; two lines of text, so it grows past 36. */
const Row = styled.div.attrs(chrome('list-row'))`
  && {
    padding: 8px 0;
  }
`

const RowText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`

const RowLabel = styled.span`
  font-size: var(--pure-chrome-ui-size);
`

const RowMeta = styled.span.attrs(chrome('meta'))`
  white-space: normal;
`

const RestoreButton = styled.button`
  padding: 6px 12px;
  border: 1px solid ${ACCENT};
  border-radius: 0;
  background: none;
  color: ${ACCENT};
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
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

const Empty = styled.div`
  padding: 18px 0;
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
`

const EntryBlock = styled.div`
  border-bottom: 1px solid var(--platform-colors-border);
`

const PreviewBox = styled.div`
  padding: 6px 10px 10px;
  background: var(--platform-colors-surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const PreviewList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--platform-colors-text);
`
