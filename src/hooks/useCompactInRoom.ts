import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'

/**
 * True only while it is held in a page (the Executive room, the Personal agent's): then it shows the fewest controls. Beside
 * any app in split view, or alone, it is the whole app.
 */
export function useCompactInRoom(): boolean {
  return useAdjacentApp()?.heldInRoom === true
}
