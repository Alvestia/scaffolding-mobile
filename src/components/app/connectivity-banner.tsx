import { Banner } from '@/components/ui/banner'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useSyncStore } from '@/store/sync-store'

export function ConnectivityBanner() {
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const apiReachable = useConnectivityStore((state) => state.apiReachable)
  const pendingCount = useSyncStore((state) => state.pendingCount)
  const failedCount = useSyncStore((state) => state.failedCount)

  if (!isConnected) {
    return (
      <Banner
        tone="warning"
        title="Modo offline"
        description="Os apontamentos continuam funcionando e serao enviados quando a conexao voltar."
      />
    )
  }

  if (!apiReachable) {
    return (
      <Banner
        tone="danger"
        title="API indisponivel"
        description="O aparelho esta com rede, mas o backend nao respondeu. Confira a URL da API no .env e se o Scaffold API esta rodando."
      />
    )
  }

  if (failedCount > 0) {
    return (
      <Banner
        tone="danger"
        title="Pendencias com erro"
        description={`Existem ${failedCount} registro(s) precisando de nova tentativa.`}
      />
    )
  }

  if (pendingCount > 0) {
    return (
      <Banner
        tone="info"
        title="Sincronizacao pendente"
        description={`Existem ${pendingCount} registro(s) aguardando envio.`}
      />
    )
  }

  return null
}
