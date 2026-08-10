import { fetchCrews } from '@/services/crews.service'
import { fetchDeviationTypes } from '@/services/deviation-types.service'
import { fetchEmployees } from '@/services/employees.service'
import { fetchScaffoldTypes } from '@/services/scaffold-types.service'
import { fetchLatestScaffold } from '@/services/scaffolds.service'
import { fetchQueueServices } from '@/services/scaffold-services.service'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'

type Scope = {
  contractId: string
  unitId: string
}

// Dispara o download dos catálogos globais (sem escopo) para que fiquem no
// cache local e possam ser usados sem conexão. Falhas são silenciadas porque
// o hook de cada catálogo já sabe cair para o cache.
export async function prefetchOfflineCatalogs() {
  await Promise.allSettled([fetchScaffoldTypes(), fetchDeviationTypes()])
}

// Baixa dados de referência dependentes do escopo (equipes, funcionários,
// fila operacional). Chamado logo após o usuário definir unidade e
// contrato, garantindo que a aplicação funcione offline a partir daí.
export async function prefetchScopedReferenceData(scope: Scope) {
  await Promise.allSettled([
    prefetchOfflineCatalogs(),
    fetchCrews(scope),
    fetchEmployees(scope),
    fetchLatestScaffold(scope),
    (async () => {
      const items = await fetchQueueServices(scope)
      await queueCacheRepository.replaceForScope(items, scope)
    })(),
  ])
}
