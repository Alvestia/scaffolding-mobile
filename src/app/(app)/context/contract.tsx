import { useMemo, useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import {
  SearchSelectionStep,
  type SearchSelectionItem,
} from '@/components/context/search-selection-step'
import { Banner } from '@/components/ui/banner'
import { useOrganizationScope } from '@/hooks/use-organization-scope'
import { prefetchScopedReferenceData } from '@/services/catalog-preload.service'
import { useAuthStore } from '@/store/auth-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { getErrorMessage } from '@/utils/error'

export default function ContractSelectionPage() {
  const user = useAuthStore((state) => state.user)
  const context = useOperationalContextStore()
  const setScope = useOperationalContextStore((state) => state.setScope)
  const params = useLocalSearchParams<{ unitId?: string }>()
  const scopeQuery = useOrganizationScope()
  const resolvedUnitId = params.unitId ?? context.unitId ?? null

  const selectedUnit = useMemo(
    () => scopeQuery.availableUnits.find((unit) => unit.id === resolvedUnitId) ?? null,
    [resolvedUnitId, scopeQuery.availableUnits],
  )

  const availableContracts = useMemo(
    () =>
      resolvedUnitId
        ? scopeQuery.availableContracts.filter((contract) => contract.unitId === resolvedUnitId)
        : [],
    [resolvedUnitId, scopeQuery.availableContracts],
  )

  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    context.unitId === resolvedUnitId ? context.contractId : null,
  )
  const [isPreparingOfflineData, setIsPreparingOfflineData] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedContract = useMemo(
    () => availableContracts.find((contract) => contract.id === selectedContractId) ?? null,
    [availableContracts, selectedContractId],
  )

  const contractItems: SearchSelectionItem[] = availableContracts.map((contract) => ({
    id: contract.id,
    title: `${contract.code} - ${contract.description ?? 'Contrato operacional'}`,
    subtitle:
      [contract.clientName, contract.clientPlantName].filter(Boolean).join(' • ') ||
      'Contexto do contrato',
    keywords: [
      contract.code,
      contract.description,
      contract.clientName,
      contract.clientPlantName,
      contract.contractObject,
    ]
      .filter(Boolean)
      .join(' '),
  }))

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  if (!resolvedUnitId) {
    return <Redirect href={'/(app)/context/unit' as never} />
  }

  const handleAdvance = async () => {
    if (!selectedUnit || !selectedContract || isPreparingOfflineData) {
      return
    }

    setSubmitError(null)
    setIsPreparingOfflineData(true)

    try {
      await prefetchScopedReferenceData({
        contractId: selectedContract.id,
        unitId: selectedUnit.id,
      })

      setScope({
        companyId: selectedUnit.companyId ?? null,
        companyName: selectedUnit.company?.name ?? null,
        unitId: selectedUnit.id,
        unitCode: selectedUnit.code ?? null,
        unitName: selectedUnit.name ?? null,
        contractId: selectedContract.id,
        contractCode: selectedContract.code ?? null,
        contractDescription: selectedContract.description ?? null,
        contractClientName: selectedContract.clientName ?? null,
        contractPlantName: selectedContract.clientPlantName ?? null,
      })

      router.replace('/(app)/(tabs)' as never)
    } catch (error) {
      setSubmitError(
        getErrorMessage(
          error,
          'Não foi possível preparar os dados desse contrato para uso offline.',
        ),
      )
    } finally {
      setIsPreparingOfflineData(false)
    }
  }

  const content = (
    <SearchSelectionStep
      title="Selecione um contrato"
      items={scopeQuery.isLoading || scopeQuery.error ? [] : contractItems}
      selectedId={selectedContractId}
      onSelect={setSelectedContractId}
      onBack={() => router.back()}
      onAdvance={() => {
        void handleAdvance()
      }}
      advanceDisabled={!selectedContract || isPreparingOfflineData}
      advanceLoading={isPreparingOfflineData}
      helperText={
        isPreparingOfflineData
          ? 'Preparando última placa, tipos, equipes, funcionários e fila para uso offline.'
          : selectedUnit
            ? `Unidade selecionada: ${selectedUnit.code} - ${selectedUnit.name}`
            : 'Escolha o contrato que sera usado nesta jornada.'
      }
      emptyTitle={
        scopeQuery.isLoading ? 'Carregando contratos' : 'Nenhum contrato encontrado'
      }
      emptyDescription={
        scopeQuery.isLoading
          ? 'Buscando os contratos liberados para a unidade selecionada.'
          : 'Nao encontramos contratos disponiveis para esta unidade.'
      }
    />
  )

  if (scopeQuery.error) {
    return (
      <View style={{ flex: 1 }}>
        <Banner
          tone="danger"
          title="Nao foi possivel carregar os contratos"
          description={getErrorMessage(scopeQuery.error, 'Tente novamente em instantes.')}
        />
        {submitError ? (
          <Banner tone="danger" title="Não foi possível continuar" description={submitError} />
        ) : null}
        {content}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {submitError ? (
        <Banner tone="danger" title="Não foi possível continuar" description={submitError} />
      ) : null}
      {content}
    </View>
  )
}
