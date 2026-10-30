import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { DECK_LOOKS } from '../lib/deckLooks'
import { installAppFonts } from '../fonts/packageFonts'

/** The same palettes are used for these previews, starter slides and AI guidance. */
export function LookPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  // The samples are set in the faces the decks get.
  installAppFonts()
  return (
    <Choices role="group" aria-label="Presentation style">
      {DECK_LOOKS.map(look => (
        <Choice
          key={look.id}
          type="button"
          aria-pressed={value === look.id}
          disabled={disabled}
          onClick={() => onChange(look.id)}
        >
          <Sample
            aria-hidden="true"
            style={{ background: look.bg, color: look.ink }}
          >
            <span
              style={{
                color: look.accent,
                fontFamily: look.bodyFont,
                fontWeight: Number(look.type.labelWeight),
                fontSize: 6,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
              }}
            >
              A new perspective
            </span>
            <strong
              style={{
                fontFamily: look.font,
                fontWeight: Number(look.weight),
                letterSpacing: look.type.tracking.display,
                lineHeight: look.type.leading.display,
              }}
            >
              Ideas that
              <br />
              move us.
            </strong>
            <Swatches>
              {[look.accent, look.ink, look.surface].map(color => (
                <i key={color} style={{ background: color }} />
              ))}
            </Swatches>
          </Sample>
          <Name>
            {look.label}
            <Check aria-hidden="true">{value === look.id ? '✓' : ''}</Check>
          </Name>
          <Note>{look.note}</Note>
        </Choice>
      ))}
    </Choices>
  )
}
const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`
const Choice = styled.button`
  min-width: 0;
  padding: 5px 5px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: 10px;
  background: var(--platform-colors-elevated);
  color: var(--platform-colors-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  &[aria-pressed='true'] {
    border-color: ${ACCENT};
    box-shadow: 0 0 0 1px ${ACCENT};
  }
  &:hover:not(:disabled) {
    border-color: ${ACCENT};
  }
  &:focus-visible {
    outline: 2px solid ${ACCENT};
    outline-offset: 3px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`
const Sample = styled.span`
  align-self: stretch;
  aspect-ratio: 16 / 11;
  padding: 8px;
  container-type: inline-size;
  min-height: 0;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  strong {
    font-size: clamp(13px, 17cqw, 28px);
  }
`
const Swatches = styled.span`
  display: flex;
  gap: 4px;
  i {
    width: 13px;
    height: 5px;
    border-radius: 2px;
  }
`
const Name = styled.span`
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0 5px;
  font-size: 12px;
  font-weight: 600;
`
const Check = styled.span`
  color: ${ACCENT};
`
const Note = styled.span`
  padding: 0 5px;
  color: var(--pure-chrome-soft);
  font-size: 11px;
  line-height: 1.4;
`
