import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import { copyEntryDefaults, type EntryDefaults } from '@/types/entry-defaults'

type Preferences = EntryDefaults & { shiftChosen: boolean }
const EMPTY_MEMBERS: string[] = []
function initial(defaults?: EntryDefaults | null): Preferences {
  return { ...copyEntryDefaults(defaults), shiftChosen: defaults?.shiftId !== undefined }
}

/** Defaults seed new forms once; edits and reopened drafts are never replaced. */
export function useEntryPreferences(
  defaults: EntryDefaults | null | undefined,
  {
    contextKey,
    draft = false,
    resetKey = 0,
    pristine = true,
  }: { contextKey: string; draft?: boolean; resetKey?: number; pristine?: boolean },
) {
  const [preferences, setPreferences] = useState(() => initial(draft ? null : defaults))
  const touched = useRef(false)
  const previous = useRef({ contextKey, resetKey, defaults })
  useEffect(() => {
    const reset =
      previous.current.contextKey !== contextKey || previous.current.resetKey !== resetKey
    const changed = previous.current.defaults !== defaults
    previous.current = { contextKey, resetKey, defaults }
    if (!draft && (reset || (changed && pristine && !touched.current))) {
      touched.current = false
      setPreferences(initial(defaults))
    }
  }, [contextKey, resetKey, defaults, draft, pristine])

  const change = useCallback(
    <K extends keyof Preferences>(key: K, value: SetStateAction<Preferences[K]>, manual = true) => {
      if (manual) touched.current = true
      setPreferences((current) => {
        const next = typeof value === 'function' ? value(current[key]) : value
        return Object.is(current[key], next) ? current : { ...current, [key]: next }
      })
    },
    [],
  )
  const actions = useMemo(
    () => ({
      setLaborMode: (value: SetStateAction<Preferences['laborMode']>) => change('laborMode', value),
      setSelectedCrewId: (value: string) => {
        touched.current = true
        setPreferences((current) =>
          current.crewId === value
            ? current
            : { ...current, crewId: value, memberEmployeeIds: undefined },
        )
      },
      setSelectedMemberIds: (value: SetStateAction<string[]>) =>
        change(
          'memberEmployeeIds',
          (current) => (typeof value === 'function' ? value(current ?? EMPTY_MEMBERS) : value),
          false,
        ),
      setFunctionQuantities: (value: SetStateAction<Preferences['functionQuantities']>) =>
        change('functionQuantities', value),
      // Automatic time suggestions do not turn into a manual preference.
      setShiftId: (value: string | null) => change('shiftId', value, false),
      setShiftChosen: (value: boolean) => change('shiftChosen', value),
      markEdited: () => {
        touched.current = true
      },
    }),
    [change],
  )
  return {
    ...actions,
    laborMode: preferences.laborMode,
    selectedCrewId: preferences.crewId ?? '',
    selectedMemberIds: preferences.memberEmployeeIds ?? EMPTY_MEMBERS,
    membersChosen: preferences.memberEmployeeIds !== undefined,
    functionQuantities: preferences.functionQuantities,
    shiftId: preferences.shiftId ?? null,
    shiftChosen: preferences.shiftChosen,
  }
}
