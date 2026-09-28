import { api } from '@/api/client'

type PaginatedPayload<T> = {
  items: T[]
  hasNextPage?: boolean
  page?: number
  totalPages?: number
  pageSize?: number
}

export async function getAllPages<T>(
  url: string,
  config: Record<string, unknown> = {},
  maxPages = 1_000,
) {
  const result: T[] = []
  const baseParams = (config.params as Record<string, unknown> | undefined) ?? {}

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await api.get<T[] | PaginatedPayload<T>>(url, {
      ...config,
      params: { ...baseParams, page, pageSize: 100 },
    } as never)
    if (Array.isArray(response.data)) return response.data
    const payload = response.data
    if (payload.page !== undefined && payload.page !== page) {
      throw new Error('A base mudou durante o download. Atualize novamente.')
    }
    result.push(...payload.items)
    const hasNextPage =
      payload.hasNextPage ??
      (payload.totalPages !== undefined
        ? page < payload.totalPages
        : payload.items.length >= (payload.pageSize ?? 100))
    if (!hasNextPage) return result
    if (payload.items.length === 0) {
      throw new Error('O servidor retornou uma base incompleta. Atualize novamente.')
    }
  }
  throw new Error('A base é muito grande para concluir o download neste aparelho.')
}
