import { fetchCrews } from '@/services/crews.service'
import { fetchDeviationTypes } from '@/services/deviation-types.service'
import { fetchEmployees } from '@/services/employees.service'
import { fetchAreas } from '@/services/areas.service'
import { fetchProjects } from '@/services/projects.service'
import { fetchScaffoldTypes } from '@/services/scaffold-types.service'
import { fetchScaffoldComponentTypes } from '@/services/scaffold-component-types.service'
import { fetchLatestScaffold } from '@/services/scaffolds.service'
import { fetchWorkFunctions } from '@/services/work-functions.service'
import { fetchWorkOrders } from '@/services/work-orders.service'
import { fetchQueueServices } from '@/services/scaffold-services.service'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'

type Scope = {
  contractId: string
  unitId: string
  companyId?: string | null
}

// Dispara o download dos catálogos globais (sem escopo) para que fiquem no
// cache local e possam ser usados sem conexão. Falhas são silenciadas porque
// o hook de cada catálogo já sabe cair para o cache.
export async function prefetchOfflineCatalogs() {
  await Promise.allSettled([
    fetchScaffoldTypes(),
    fetchScaffoldComponentTypes(),
    fetchDeviationTypes(),
  ])
}

// Baixa dados de referência dependentes do escopo (equipes, funcionários,
// fila operacional). Chamado logo após o usuário definir unidade e
// contrato, garantindo que a aplicação funcione offline a partir daí.
export async function prefetchScopedReferenceData(scope: Scope) {
  await Promise.allSettled([
    prefetchOfflineCatalogs(),
    fetchCrews(scope),
    fetchEmployees(scope),
    fetchWorkFunctions(scope),
    fetchProjects(scope),
    fetchAreas({
      companyId: scope.companyId,
      contractId: scope.contractId,
      unitId: scope.unitId,
    }),
    fetchWorkOrders(scope),
    fetchLatestScaffold(scope),
    (async () => {
      const items = await fetchQueueServices(scope)
      await queueCacheRepository.replaceForScope(items, scope)
    })(),
  ])
}
