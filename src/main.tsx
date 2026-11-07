import './heldInRoom'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SlidesLook } from './ui/look'

// The enterprise look is the look everywhere now, on the desktop as on Pure Server.
document.documentElement.setAttribute('data-pure-look', 'enterprise')

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('PureSlides4 root element #root not found')
}

createRoot(rootElement).render(
  <>
    <SlidesLook />
    <App />
  </>,
)
