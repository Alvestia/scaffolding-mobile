import { useState } from 'react'
import { Redirect, router } from 'expo-router'
import { View } from 'react-native'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import {
  SearchSelectionStep,
  type SearchSelectionItem,
} from '@/components/context/search-selection-step'
import { Banner } from '@/components/ui/banner'
import { useOrganizationScope } from '@/hooks/use-organization-scope'
import { useAuthStore } from '@/store/auth-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { getErrorMessage } from '@/utils/error'

export default function UnitSelectionPage() {
  const user = useAuthStore((state) => state.user)
  const currentUnitId = useOperationalContextStore((state) => state.unitId)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(currentUnitId)
  const scopeQuery = useOrganizationScope()
  const units = scopeQuery.availableUnits
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null

  const unitItems: SearchSelectionItem[] = units.map((unit) => ({
    id: unit.id,
    title: `${unit.code} - ${unit.name}`,
    subtitle: unit.company?.name ?? 'Empresa nao informada',
    keywords: [unit.code, unit.name, unit.company?.name].filter(Boolean).join(' '),
  }))

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  const content = (
    <SearchSelectionStep
      title="Selecione uma unidade"
      items={scopeQuery.isLoading || scopeQuery.error ? [] : unitItems}
      selectedId={selectedUnitId}
      onSelect={setSelectedUnitId}
      onAdvance={() => {
        if (!selectedUnitId) {
          return
        }

        if (!selectedUnit) {
          return
        }

        router.push({
          pathname: '/(app)/context/contract',
          params: { unitId: selectedUnit.id },
        } as never)
      }}
      advanceDisabled={!selectedUnit}
      helperText="Escolha a unidade operacional que vai abastecer o aparelho."
      emptyTitle={
        scopeQuery.isLoading ? 'Carregando unidades' : 'Nenhuma unidade encontrada'
      }
      emptyDescription={
        scopeQuery.isLoading
          ? 'Buscando as unidades liberadas para este usuario.'
          : 'Esse usuario precisa ter acesso a pelo menos uma unidade para operar no mobile.'
      }
    />
  )

  if (scopeQuery.error) {
    return (
      <View style={{ flex: 1 }}>
        <NetworkStatusIndicator />
        <Banner
          tone="danger"
          title="Nao foi possivel carregar as unidades"
          description={getErrorMessage(scopeQuery.error, 'Tente novamente em instantes.')}
        />
        {content}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <NetworkStatusIndicator />
      {content}
    </View>
  )
}
