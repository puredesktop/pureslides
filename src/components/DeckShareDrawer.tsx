/**
 * PureCloud Live Deck Share + Audience Q&A Drawer.
 *
 * Connects to PureServer's `publish` service (`publishDeck`, `get`, `update`,
 * `remove`, `replyComment`, `resolveComment`) with graceful offline fallback
 * offering Portable HTML export when PureServer is not attached.
 */
import { useCallback, useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import {
  buildPublishDeckPayload,
  getPublishedDeck,
  getPublishStatus,
  publishDeck,
  removePublishedDeck,
  replyDeckComment,
  resolveDeckComment,
  updatePublishedDeck,
  type PublishedDeckComment,
  type PublishedDeckItem,
  type PublishStatusResult,
} from '../lib/pureCloudDeckClient'
import type { Slide } from '../lib/slides'
import { containDialogFocus } from './dialogFocus'
import { primaryLook, quiet } from '../ui/look'
import {
  buildCommentResolutionCard,
  sendTransformEnvelope,
  SuggestionCardsPanel,
  type SuggestionCard,
  type SuiteAppId,
} from '@purescience/platform-ui/suite'

export interface DeckShareDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  html: string
  slides: Slide[]
  publishedDeck: PublishedDeckItem | null
  onPublishedDeckChange: (item: PublishedDeckItem | null) => void
  broadcastLive: boolean
  onBroadcastLiveChange: (enabled: boolean) => void
  onSelectSlide: (slideIndex: number) => void
  onExportPortableHtml: () => void
  onApplySuggestion?: (slideIndex: number, card: SuggestionCard) => void
}

export function DeckShareDrawer({
  open,
  onClose,
  title,
  html,
  slides,
  publishedDeck,
  onPublishedDeckChange,
  broadcastLive,
  onBroadcastLiveChange,
  onSelectSlide,
  onExportPortableHtml,
  onApplySuggestion,
}: DeckShareDrawerProps): React.ReactElement | null {
  const [status, setStatus] = useState<PublishStatusResult | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ slideIndex: number; card: SuggestionCard }>>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [passcode, setPasscode] = useState('')
  const [expiresDays, setExpiresDays] = useState('')
  const [allowComments, setAllowComments] = useState(true)
  const [versionNote, setVersionNote] = useState('')
  const [copied, setCopied] = useState(false)

  const [comments, setComments] = useState<PublishedDeckComment[]>([])
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  const loadComments = useCallback(async (id: string) => {
    try {
      const detail = await getPublishedDeck(id)
      setComments(detail.comments)
      if (detail.item) onPublishedDeckChange(detail.item)
    } catch {
      /* ignore transient fetch errors */
    }
  }, [onPublishedDeckChange])

  useEffect(() => {
    if (!open) return
    let live = true
    setLoading(true)
    setError(null)
    setNotice(null)
    void getPublishStatus().then(result => {
      if (!live) return
      setStatus(result)
      setLoading(false)
      if (result.connected && publishedDeck?.id) {
        void loadComments(publishedDeck.id)
      }
    })
    return () => {
      live = false
    }
  }, [open, publishedDeck?.id, loadComments])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handlePublish = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const payload = buildPublishDeckPayload(html, slides, title)
      let expiresAt: string | undefined
      const days = Number(expiresDays)
      if (Number.isFinite(days) && days > 0) {
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
      }
      const res = await publishDeck({
        ...payload,
        ...(publishedDeck?.id ? { id: publishedDeck.id } : {}),
        ...(passcode.trim() ? { passcode: passcode.trim() } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        allowComments,
        ...(versionNote.trim() ? { note: versionNote.trim() } : {}),
      })
      onPublishedDeckChange(res.item)
      setVersionNote('')
      setNotice(
        publishedDeck?.id
          ? `Updated live deck (v${res.version ?? res.item.activeVersion ?? 1}).`
          : 'Published live deck to PureCloud.',
      )
      if (res.item?.id) void loadComments(res.item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!publishedDeck?.url) return
    try {
      await navigator.clipboard?.writeText(publishedDeck.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setNotice(`Share link: ${publishedDeck.url}`)
    }
  }

  const handleToggleComments = async (next: boolean) => {
    setAllowComments(next)
    if (!publishedDeck?.id) return
    try {
      await updatePublishedDeck({ id: publishedDeck.id, allowComments: next })
      onPublishedDeckChange({ ...publishedDeck, allowComments: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUnpublish = async () => {
    if (!publishedDeck?.id) return
    setBusy(true)
    setError(null)
    try {
      await removePublishedDeck(publishedDeck.id)
      onPublishedDeckChange(null)
      onBroadcastLiveChange(false)
      setComments([])
      setNotice('Live deck link removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleReply = async (comment: PublishedDeckComment) => {
    if (!publishedDeck?.id) return
    const body = (replyDrafts[comment.id] ?? '').trim()
    if (!body) return
    try {
      await replyDeckComment({
        id: publishedDeck.id,
        parentId: comment.id,
        targetIndex: comment.targetIndex,
        body,
      })
      setReplyDrafts(prev => ({ ...prev, [comment.id]: '' }))
      await loadComments(publishedDeck.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleResolve = async (comment: PublishedDeckComment) => {
    if (!publishedDeck?.id) return
    try {
      await resolveDeckComment({
        id: publishedDeck.id,
        commentId: comment.id,
        resolved: !comment.resolved,
      })
      await loadComments(publishedDeck.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const connected = Boolean(status?.connected)

  return (
    <Scrim onClick={onClose}>
      <Drawer
        role="dialog"
        aria-modal="true"
        aria-label="Share Deck"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <div>
            <Title>Live Share &amp; Audience Q&amp;A</Title>
            <Subtitle>
              {loading
                ? 'Checking PureServer connection…'
                : connected
                  ? `Connected · ${status?.publicUrl ?? 'PureCloud'}`
                  : 'PureServer offline — Portable HTML ready'}
            </Subtitle>
          </div>
          <span style={{ flex: 1 }} />
          <QuietBtn type="button" onClick={onClose}>
            Close
          </QuietBtn>
        </Head>

        <Body>
          {!loading && !connected ? (
            <OfflineCard>
              <OfflineTitle>PureServer is not attached</OfflineTitle>
              <OfflineText>
                Live web links, presenter SSE sync, and audience comments require a connected PureServer host.
                {status?.offlineReason ? ` (${status.offlineReason})` : ''}
              </OfflineText>
              <OfflineText>
                You can still share this deck anywhere offline as a single self-contained Portable HTML presentation with keyboard, touch, grid, and fullscreen support.
              </OfflineText>
              <PrimaryBtn
                type="button"
                onClick={() => {
                  onExportPortableHtml()
                  onClose()
                }}
              >
                Export Portable HTML
              </PrimaryBtn>
            </OfflineCard>
          ) : null}

          {connected ? (
            <>
              {publishedDeck ? (
                <LiveCard>
                  <SectionHead>Published link</SectionHead>
                  <UrlRow>
                    <UrlInput readOnly value={publishedDeck.url} aria-label="Published deck URL" />
                    <QuietBtn type="button" onClick={() => void handleCopyUrl()}>
                      {copied ? 'Copied' : 'Copy'}
                    </QuietBtn>
                  </UrlRow>
                  <ToggleRow>
                    <input
                      id="share-broadcast-live"
                      type="checkbox"
                      checked={broadcastLive}
                      onChange={event => onBroadcastLiveChange(event.currentTarget.checked)}
                    />
                    <label htmlFor="share-broadcast-live">
                      Broadcast live slide, step, blackout &amp; laser to viewers while presenting
                    </label>
                  </ToggleRow>
                  <MetaRow>
                    <span>Version {publishedDeck.activeVersion ?? 1}</span>
                    <span style={{ flex: 1 }} />
                    <DangerLink type="button" disabled={busy} onClick={() => void handleUnpublish()}>
                      Remove link
                    </DangerLink>
                  </MetaRow>
                </LiveCard>
              ) : null}

              <Section>
                <SectionHead>{publishedDeck ? 'Update published deck' : 'Publish to PureCloud'}</SectionHead>
                <Field>
                  <label htmlFor="share-passcode">Passcode (optional)</label>
                  <Input
                    id="share-passcode"
                    type="text"
                    placeholder="Leave blank for open link"
                    value={passcode}
                    onChange={event => setPasscode(event.currentTarget.value)}
                  />
                </Field>
                <Field>
                  <label htmlFor="share-expires">Expires in days (optional)</label>
                  <Input
                    id="share-expires"
                    type="number"
                    min="1"
                    placeholder="No expiry"
                    value={expiresDays}
                    onChange={event => setExpiresDays(event.currentTarget.value)}
                  />
                </Field>
                <Field>
                  <label htmlFor="share-note">Version note (optional)</label>
                  <Input
                    id="share-note"
                    type="text"
                    placeholder="e.g. Updated Q4 metrics"
                    value={versionNote}
                    onChange={event => setVersionNote(event.currentTarget.value)}
                  />
                </Field>
                <ToggleRow>
                  <input
                    id="share-allow-comments"
                    type="checkbox"
                    checked={allowComments}
                    onChange={event => void handleToggleComments(event.currentTarget.checked)}
                  />
                  <label htmlFor="share-allow-comments">Allow audience slide comments</label>
                </ToggleRow>
                <PrimaryBtn type="button" disabled={busy} onClick={() => void handlePublish()}>
                  {busy
                    ? 'Publishing…'
                    : publishedDeck
                      ? 'Publish update'
                      : 'Publish live link'}
                </PrimaryBtn>
              </Section>

              {publishedDeck ? (
                <Section>
                  <CommentHeader>
                    <SectionHead>Audience Q&amp;A ({comments.length})</SectionHead>
                    <QuietBtn type="button" onClick={() => void loadComments(publishedDeck.id)}>
                      Refresh
                    </QuietBtn>
                  </CommentHeader>
                  {comments.length === 0 ? (
                    <EmptyNote>No audience comments yet.</EmptyNote>
                  ) : (
                    comments.map(comment => (
                      <CommentCard key={comment.id} $resolved={Boolean(comment.resolved)}>
                        <CommentTop>
                          <SlideJump
                            type="button"
                            onClick={() => {
                              onSelectSlide(Math.max(0, Math.min(slides.length - 1, comment.targetIndex)))
                              onClose()
                            }}
                          >
                            Slide {comment.targetIndex + 1}
                          </SlideJump>
                          <Author>{comment.author || 'Viewer'}</Author>
                          <span style={{ flex: 1 }} />
                          <SmallBtn
                            type="button"
                            onClick={() => {
                              const targetSlide = slides[Math.max(0, Math.min(slides.length - 1, comment.targetIndex))]
                              const card = buildCommentResolutionCard({
                                app: 'pureslides',
                                targetLabel: `Slide ${comment.targetIndex + 1}${targetSlide?.headline ? ` · ${targetSlide.headline}` : ''}`,
                                commentId: comment.id,
                                commentAuthor: comment.author || 'Viewer',
                                commentBody: comment.body,
                                currentText: targetSlide?.headline || targetSlide?.support || '',
                              })
                              setSuggestions(prev => [{ slideIndex: comment.targetIndex, card }, ...prev])
                              if (card.draftReply) {
                                setReplyDrafts(prev => ({ ...prev, [comment.id]: card.draftReply! }))
                              }
                            }}
                          >
                            Fix with Agent
                          </SmallBtn>
                          <SmallBtn type="button" onClick={() => void handleResolve(comment)}>
                            {comment.resolved ? 'Reopen' : 'Resolve'}
                          </SmallBtn>
                        </CommentTop>
                        <CommentBody>{comment.body}</CommentBody>
                        <ReplyRow>
                          <Input
                            placeholder="Reply to audience…"
                            value={replyDrafts[comment.id] ?? ''}
                            onChange={event =>
                              setReplyDrafts(prev => ({
                                ...prev,
                                [comment.id]: event.currentTarget.value,
                              }))
                            }
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void handleReply(comment)
                              }
                            }}
                          />
                          <SmallBtn type="button" onClick={() => void handleReply(comment)}>
                            Reply
                          </SmallBtn>
                        </ReplyRow>
                      </CommentCard>
                    ))
                  )}
                </Section>
              ) : null}
            </>
          ) : null}

          {suggestions.length > 0 ? (
            <Section>
              <SuggestionCardsPanel
                cards={suggestions.map(s => s.card)}
                onAccept={card => {
                  const hit = suggestions.find(s => s.card.id === card.id)
                  if (hit) onApplySuggestion?.(hit.slideIndex, card)
                  setSuggestions(prev =>
                    prev.map(s => (s.card.id === card.id ? { ...s, card: { ...s.card, status: 'accepted' } } : s)),
                  )
                  setNotice(`Applied agent edit on ${card.targetLabel}.`)
                }}
                onReject={card => {
                  setSuggestions(prev =>
                    prev.map(s => (s.card.id === card.id ? { ...s, card: { ...s.card, status: 'rejected' } } : s)),
                  )
                }}
              />
            </Section>
          ) : null}

          <Section>
            <SectionHead>Transform / Send to another Pure app</SectionHead>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(
                [
                  { target: 'puresite', label: 'Send to PureSite' },
                  { target: 'canvas2', label: 'Send to PureCanvas' },
                  { target: 'purewriter', label: 'Send to PureWriter' },
                ] as Array<{ target: SuiteAppId; label: string }>
              ).map(dest => (
                <QuietBtn
                  key={dest.target}
                  type="button"
                  onClick={() => {
                    void sendTransformEnvelope({
                      sourceApp: 'pureslides',
                      targetApp: dest.target,
                      title,
                      subtitle: `${slides.length}-slide presentation`,
                      sections: slides.map((s, idx) => ({
                        heading: s.headline || `Slide ${idx + 1}`,
                        ...(s.support ? { body: s.support } : {}),
                        ...(s.notes ? { notes: s.notes } : {}),
                      })),
                    }).then(() => setNotice(`Sent "${title}" to ${dest.label.replace('Send to ', '')}.`))
                  }}
                >
                  {dest.label}
                </QuietBtn>
              ))}
            </div>
          </Section>

          {notice ? <Notice>{notice}</Notice> : null}
          {error ? <ErrorMsg role="alert">{error}</ErrorMsg> : null}
        </Body>
      </Drawer>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 42;
  display: flex;
  justify-content: flex-end;
  background: rgb(12 14 18 / 0.36);
`

const Drawer = styled.div`
  width: min(440px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--n-line, var(--platform-colors-border));
  background: var(--n-sheet, var(--platform-colors-elevated));
  color: var(--n-ink, var(--platform-colors-text));
  box-shadow: -12px 0 36px rgb(0 0 0 / 0.2);
`

const Head = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--n-line, var(--pure-chrome-line));
  background: var(--n-panel, var(--platform-colors-surface));
`

const Title = styled.h2`
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
`

const Subtitle = styled.div`
  font-size: 11.5px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionHead = styled.div`
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const OfflineCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-panel, var(--platform-colors-surface));
`

const OfflineTitle = styled.div`
  font-size: 13.5px;
  font-weight: 700;
`

const OfflineText = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const LiveCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid ${ACCENT};
  border-radius: 3px;
  background: var(--n-panel, var(--platform-colors-surface));
`

const UrlRow = styled.div`
  display: flex;
  gap: 6px;
`

const UrlInput = styled.input`
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11.5px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  label {
    font-size: 11.5px;
    color: var(--n-soft, var(--pure-chrome-soft));
  }
`

const Input = styled.input`
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font: inherit;
  font-size: 12px;
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--n-ink, var(--platform-colors-text));
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const DangerLink = styled.button`
  border: 0;
  background: transparent;
  color: var(--p-failed-text, var(--platform-colors-danger));
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
`

const CommentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const EmptyNote = styled.div`
  padding: 12px;
  border: 1px dashed var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  font-size: 12px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const CommentCard = styled.div<{ $resolved: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-panel, var(--platform-colors-surface));
  opacity: ${props => (props.$resolved ? 0.62 : 1)};
`

const CommentTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const SlideJump = styled.button`
  padding: 1px 6px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 2px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: ${ACCENT};
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
`

const Author = styled.span`
  font-size: 12px;
  font-weight: 600;
`

const CommentBody = styled.div`
  font-size: 12.5px;
  line-height: 1.45;
`

const ReplyRow = styled.div`
  display: flex;
  gap: 6px;
`

const SmallBtn = styled.button`
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
`

const Notice = styled.div`
  padding: 8px 10px;
  border: 1px solid var(--p-done-text, #2e7d32);
  border-radius: 3px;
  font-size: 12px;
  color: var(--p-done-text, #2e7d32);
`

const ErrorMsg = styled.div`
  padding: 8px 10px;
  border: 1px solid var(--p-failed-text, var(--platform-colors-danger));
  border-radius: 3px;
  font-size: 12px;
  color: var(--p-failed-text, var(--platform-colors-danger));
`

const QuietBtn = styled.button`
  ${quiet}
  height: 26px;
  font-size: 11.5px;
`

const PrimaryBtn = styled.button`
  ${quiet}
  ${primaryLook}
`
