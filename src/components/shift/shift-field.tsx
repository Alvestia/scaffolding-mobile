import { useEffect, useState } from 'react'
import { SelectField } from '@/components/ui/select-field'
import { SelectionModal } from '@/components/ui/selection-modal'
import { useContractShifts } from '@/hooks/use-contract-shifts'
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
  chosen: controlledChosen,
  onChosen,
}: {
  contractId: string | null
  unitId: string | null
  isConnected: boolean
  /** "HH:mm" start, used for the suggestion. */
  startTime: string
  value: string | null
  onChange: (shiftId: string | null) => void
  /** A choice from this form, a reopened draft or the Home defaults. */
  chosen?: boolean
  onChosen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [localChosen, setLocalChosen] = useState(false)
  const chosen = controlledChosen ?? localChosen
  const shiftsQuery = useContractShifts(contractId, unitId, isConnected)
  const shifts = shiftsQuery.data ?? []
  const suggested = suggestShiftId(shifts, startTime)

  useEffect(() => {
    // Only a confirmed online empty catalog can invalidate a previously saved choice.
    // Missing offline data or an unfinished request must never discard the shift.
    if (isConnected && shiftsQuery.isSuccess && shifts.length === 0 && value !== null) {
      onChange(null)
    }
  }, [isConnected, shiftsQuery.isSuccess, shifts.length, value, onChange])

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
        value={
          selected
            ? `${selected.name} (${selected.startTime}–${selected.endTime})`
            : value
              ? 'Turno indisponível — selecione outro'
              : 'Sem turno'
        }
        error={shiftsQuery.isError ? 'Não foi possível atualizar os turnos.' : undefined}
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
          setLocalChosen(true)
          onChosen?.()
          onChange(next === NONE ? null : next)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
