/**
 * "Propose to organisation…": offer this deck's look as a brand, or its
 * slides as examples of the house style, for an administrator to approve.
 *
 * The two buttons call the same code as the drawer's
 * proposeBrandToOrganisation and proposeSamplesToOrganisation tools; the
 * dialog only shows what came back, in the organisation's own words, or
 * what went wrong.
 */
import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { containDialogFocus } from './dialogFocus'

type Choice = 'look' | 'slides'

interface ProposeDialogProps {
  open: boolean
  onClose: () => void
  /** The deck's own look's name, or null for a stock look. */
  lookName: string | null
  /** The organisation's house style's name, or null when it has none. */
  houseStyleName: string | null
  /** The deck is already in the house style. */
  deckIsHouseStyle: boolean
  /** The brand file saved from this deck, when there is one. */
  savedBrandPath: string | null
  onProposeLook: (note: string) => Promise<string>
  onProposeSlides: (note: string) => Promise<string>
}

export function ProposeDialog({
  open,
  onClose,
  lookName,
  houseStyleName,
  deckIsHouseStyle,
  savedBrandPath,
  onProposeLook,
  onProposeSlides,
}: ProposeDialogProps): React.ReactElement | null {
  const lookOffered = Boolean(lookName) && !deckIsHouseStyle
  const slidesOffered = Boolean(houseStyleName)
  const [choice, setChoice] = useState<Choice>('look')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setChoice(lookOffered ? 'look' : 'slides')
    setNote('')
    setAnswer(null)
    setBusy(false)
    // Only when it opens: what it offers is read fresh each time.
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const lookWords = !lookName
    ? 'This deck uses one of the built-in looks, so it has no brand of its own to offer.'
    : deckIsHouseStyle
      ? `This deck is already in ${lookName}, your organisation’s house style.`
      : savedBrandPath
        ? `${lookName}, as you saved it.`
        : `${lookName}, saved with this deck. When it has no reference image, its slides go along as examples.`
  const slidesWords = houseStyleName
    ? `Every slide (up to 12) is exported as a picture. Once approved, they join ${houseStyleName}’s examples, so everyone’s assistants see them.`
    : 'Your organisation has no house style yet.'

  const send = async (): Promise<void> => {
    setBusy(true)
    setAnswer(null)
    try {
      const text = choice === 'look' ? await onProposeLook(note) : await onProposeSlides(note)
      setAnswer({ ok: true, text })
    } catch (error) {
      setAnswer({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }
  const sent = answer?.ok === true

  return (
    <Scrim onClick={() => !busy && onClose()}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="propose-title"
        onClick={event => event.stopPropagation()}
        onKeyDown={containDialogFocus}
      >
        <Title id="propose-title">Propose to organisation</Title>
        <Note>An administrator looks at what you send before anyone else uses it.</Note>

        <Options role="radiogroup" aria-label="What to propose">
          <Option
            type="button"
            role="radio"
            aria-checked={choice === 'look'}
            disabled={!lookOffered || busy || sent}
            onClick={() => setChoice('look')}
          >
            <OptionName>This deck’s look, as a brand</OptionName>
            <OptionNote>{lookWords}</OptionNote>
          </Option>
          <Option
            type="button"
            role="radio"
            aria-checked={choice === 'slides'}
            disabled={!slidesOffered || busy || sent}
            onClick={() => setChoice('slides')}
          >
            <OptionName>
              {houseStyleName ? `This deck’s slides, as examples of ${houseStyleName}` : 'This deck’s slides, as examples'}
            </OptionName>
            <OptionNote>{slidesWords}</OptionNote>
          </Option>
        </Options>

        <Field>
          <label htmlFor="propose-note">A note for the administrator (optional)</label>
          <textarea
            id="propose-note"
            data-chrome="field"
            rows={3}
            value={note}
            disabled={busy || sent}
            placeholder="Why this is worth using"
            onChange={event => setNote(event.currentTarget.value)}
          />
        </Field>

        {answer ? (
          <Answer role={answer.ok ? 'status' : 'alert'} $ok={answer.ok}>
            {answer.text}
          </Answer>
        ) : null}

        <Actions>
          <GhostButton type="button" disabled={busy} onClick={onClose}>
            {sent ? 'Done' : 'Cancel'}
          </GhostButton>
          {sent ? null : (
            <PrimaryButton
              type="button"
              disabled={busy || (choice === 'look' ? !lookOffered : !slidesOffered)}
              onClick={() => void send()}
            >
              {busy ? (choice === 'slides' ? 'Exporting and sending…' : 'Sending…') : 'Propose'}
            </PrimaryButton>
          )}
        </Actions>
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  isolation: isolate;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 10px;
  background: var(--platform-colors-elevated, #fff);
  color: var(--platform-colors-text);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.28);
`

const Title = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 700;
`

const Note = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--platform-colors-text-secondary);
`

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Option = styled.button`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--pure-chrome-line, var(--platform-colors-border));
  border-radius: 8px;
  background: var(--platform-colors-elevated, #fff);
  color: var(--platform-colors-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  &[aria-checked='true'] {
    border-color: ${ACCENT};
    box-shadow: 0 0 0 1px ${ACCENT};
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${ACCENT};
    outline-offset: 2px;
  }
`

const OptionName = styled.span`
  font-size: 13px;
  font-weight: 600;
`

const OptionNote = styled.span`
  font-size: 12px;
  line-height: 1.45;
  color: var(--platform-colors-text-secondary);
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  label {
    font-size: 12px;
    font-weight: 500;
  }
  textarea {
    resize: vertical;
    font: inherit;
    font-size: 13px;
  }
`

const Answer = styled.p<{ $ok: boolean }>`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${props => (props.$ok ? 'var(--platform-colors-text)' : 'var(--platform-colors-danger)')};
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

const PrimaryButton = styled.button`
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: ${ACCENT};
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const GhostButton = styled.button`
  padding: 8px 14px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 8px;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
