import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { SelectField } from '@/components/ui/select-field'
import { SelectionModal } from '@/components/ui/selection-modal'
import { fetchContractShifts, getCachedContractShifts } from '@/services/contract-shifts.service'
import { suggestShiftId } from '@/utils/shift-time'

const NONE = '__none__'

/**
 * Optional shift of an activity or deviation. Hidden when the contract has
 * no shifts. It follows the start time until the person picks one; "Sem
 * turno" is always allowed. Works offline with the last shifts loaded.
 */
export function ShiftField({
  contractId,
  unitId,
  isConnected,
  startTime,
  value,
  onChange,
  chosen: chosenFromDraft = false,
}: {
  contractId: string | null
  unitId: string | null
  isConnected: boolean
  /** "HH:mm" start, used for the suggestion. */
  startTime: string
  value: string | null
  onChange: (shiftId: string | null) => void
  /** A draft reopened with a shift already chosen. */
  chosen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState(chosenFromDraft)
  const shiftsQuery = useQuery({
    queryKey: ['contract-shifts', contractId, unitId, isConnected],
    enabled: Boolean(contractId && unitId),
    queryFn: async () => {
      if (!contractId || !unitId) return []
      const scope = { contractId, unitId }
      if (!isConnected) return getCachedContractShifts(scope)
      try {
        return await fetchContractShifts(scope)
      } catch (error) {
        const cached = await getCachedContractShifts(scope)
        if (cached.length > 0) return cached
        throw error
      }
    },
  })
  const shifts = shiftsQuery.data ?? []
  const suggested = suggestShiftId(shifts, startTime)

  useEffect(() => {
    if (chosenFromDraft) setChosen(true)
  }, [chosenFromDraft])

  useEffect(() => {
    if (chosen || shifts.length === 0) return
    if (suggested !== value) onChange(suggested)
  }, [chosen, onChange, shifts.length, suggested, value])

  if (shifts.length === 0) return null
  const selected = shifts.find((shift) => shift.id === value)

  return (
    <>
      <SelectField
        label="Turno (opcional)"
        value={selected ? `${selected.name} (${selected.startTime}–${selected.endTime})` : 'Sem turno'}
        placeholder="Sem turno"
        helper={!chosen && selected ? 'Sugerido pelo horário de início.' : undefined}
        onPress={() => setOpen(true)}
      />
      <SelectionModal
        visible={open}
        title="Turno"
        subtitle="Turno do contrato em que o trabalho foi feito."
        options={[
          { value: NONE, label: 'Sem turno' },
          ...shifts.map((shift) => ({
            value: shift.id,
            label: shift.name,
            sublabel: `${shift.startTime}–${shift.endTime}`,
          })),
        ]}
        selectedValue={value ?? NONE}
        onSelect={(next) => {
          setChosen(true)
          onChange(next === NONE ? null : next)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
