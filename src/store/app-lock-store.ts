import { create } from 'zustand'

/** Away from the app longer than this, a field account unlocks again. */
export const RELOCK_AFTER_MS = 5 * 60_000

type AppLockState = {
  /** In memory only: every cold start begins locked. */
  unlocked: boolean
  backgroundedAt: number | null
  unlock: () => void
  lock: () => void
  markBackground: () => void
  /** Called when the app returns to the foreground. */
  resume: () => void
}

/**
 * Lock for field accounts, which have no password: the phone's own PIN,
 * pattern or biometrics is asked when the app opens.
 */
export const useAppLockStore = create<AppLockState>((set, get) => ({
  unlocked: false,
  backgroundedAt: null,
  unlock: () => set({ unlocked: true, backgroundedAt: null }),
  lock: () => set({ unlocked: false, backgroundedAt: null }),
  markBackground: () => {
    if (get().backgroundedAt === null) set({ backgroundedAt: Date.now() })
  },
  resume: () => {
    const { backgroundedAt } = get()
    if (backgroundedAt !== null && Date.now() - backgroundedAt > RELOCK_AFTER_MS) {
      set({ unlocked: false, backgroundedAt: null })
      return
    }
    set({ backgroundedAt: null })
  },
}))
