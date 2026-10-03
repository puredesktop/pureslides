/** One app-owned boundary for open/new. Never install content before its old save settles. */
export function createDeckTransitions(
  flush: () => Promise<void>,
  onBusy: (busy: boolean) => void,
) {
  let generation = 0
  let busy = false
  return {
    get busy() {
      return busy
    },
    dispose() {
      generation++
      busy = false
    },
    async run<T>(
      load: () => Promise<T>,
      install: (value: T) => void,
      saveCurrent = true,
    ): Promise<boolean> {
      const attempt = ++generation
      busy = true
      onBusy(true)
      try {
        if (saveCurrent) await flush()
        if (attempt !== generation) return false
        const value = await load()
        if (attempt !== generation) return false
        install(value)
        return true
      } catch (error) {
        if (attempt !== generation) return false
        throw error
      } finally {
        if (attempt === generation) {
          busy = false
          onBusy(false)
        }
      }
    },
  }
}
