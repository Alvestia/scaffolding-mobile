import { Banner } from '@/components/ui/banner'
import { useAvailabilityMap, usePendingInspectionWork } from '@/hooks/use-inspections'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { AVAILABILITY_LABELS } from '@/utils/inspection-rules'

type ScaffoldAvailabilityWarningProps = {
  scaffoldId: string | null | undefined
}

/**
 * Banner for whoever executes services on the scaffold: interdicted, waiting
 * for release, released with restrictions or with the inspection overdue.
 */
export function ScaffoldAvailabilityWarning({ scaffoldId }: ScaffoldAvailabilityWarningProps) {
  const { contractId, unitId } = useOperationalContextStore()
  const { byScaffold } = useAvailabilityMap({ contractId, unitId })
  const pending = usePendingInspectionWork()
  if (!scaffoldId) return null

  const localInterdiction = pending.interdictions.get(scaffoldId)
  if (localInterdiction) {
    return (
      <Banner
        tone="danger"
        title="Andaime interditado neste aparelho"
        description={`${localInterdiction.payload.reason}. A interdição ainda não foi enviada ao servidor.`}
      />
    )
  }

  const availability = byScaffold.get(scaffoldId)
  if (!availability || availability.status === 'NOT_APPLICABLE') return null
  if (availability.status === 'RELEASED' && !availability.overdue) return null

  const details = [
    availability.reason,
    availability.restrictions ? `Restrições: ${availability.restrictions}` : null,
    availability.overdue ? 'Inspeção vencida.' : null,
  ].filter(Boolean)

  return (
    <Banner
      tone={availability.status === 'INTERDICTED' ? 'danger' : 'warning'}
      title={`Andaime ${AVAILABILITY_LABELS[availability.status].toLowerCase()}`}
      description={
        (details.length > 0 ? `${details.join(' ')} ` : '') +
        'Confirme com o responsável antes de usar o andaime.'
      }
    />
  )
}
