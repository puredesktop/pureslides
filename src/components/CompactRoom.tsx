/**
 * What the app frame does while PureSlides sits beside Executive
 * (useCompactInRoom). The board's own compact layout lives in SlideBoardView.
 */
import { createGlobalStyle, styled } from 'styled-components'
import { DECK_APP_SLUG } from '../constants'

/**
 * The app's header row is hidden rather than removed, so what it holds (the
 * document registration, sharing, the assistant's controls) stays alive.
 * Mounted only while compact, so the full app carries none of this.
 */
export const CompactFrameStyle = createGlobalStyle`
  div[data-app='${DECK_APP_SLUG}'] > header { display: none !important; }
`

/** With no deck open, compact offers no deck list: the full app is where one is chosen. */
export function CompactNoDeck(): React.ReactElement {
  return (
    <Note>
      <NoteTitle>No deck open</NoteTitle>
      <NoteBody>Expand this pane to choose one.</NoteBody>
    </Note>
  )
}

const Note = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 24px;
  text-align: center;
  color: var(--platform-colors-text);
  background: #ffffff;
`

const NoteTitle = styled.div`
  font-size: 13px;
  font-weight: 500;
`

const NoteBody = styled.div`
  font-size: 12px;
  color: var(--pure-chrome-soft);
`
