import type { ExecutionComponentAdvanceInput, ExecutionInputType } from '@/types/execution'
import type { ScaffoldComponent } from '@/types/scaffold-component'

type ComponentOperationType = 'MONTAGEM' | 'DESMONTAGEM'

function getRemainingQuantity(component: ScaffoldComponent, operationType: ComponentOperationType) {
  return Math.max(
    0,
    component.executionProgress?.[operationType]?.remainingQuantity ?? component.quantity ?? 0,
  )
}

export function buildInheritedComponentAdvances(
  components: ScaffoldComponent[],
  operationType: ComponentOperationType,
  parentInputType: ExecutionInputType,
  parentInputValue: number,
): ExecutionComponentAdvanceInput[] {
  return components
    .map((component): ExecutionComponentAdvanceInput | null => {
      const total = component.quantity ?? 0
      const remaining = getRemainingQuantity(component, operationType)

      if (total <= 0 || remaining <= 0) return null

      const maxPercent = (remaining / total) * 100
      const inheritedPercent =
        parentInputType === 'PERCENTUAL' ? Math.min(Math.max(parentInputValue, 0), maxPercent) : 0

      return {
        scaffoldComponentId: component.id,
        inputType: 'PERCENTUAL',
        inputValue: Number(inheritedPercent.toFixed(2)),
      }
    })
    .filter((advance): advance is ExecutionComponentAdvanceInput => Boolean(advance))
}
