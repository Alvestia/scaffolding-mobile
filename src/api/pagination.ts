import { api } from '@/api/client'

type PaginatedPayload<T> = {
  items: T[]
  hasNextPage?: boolean
  page?: number
  totalPages?: number
}

export async function getAllPages<T>(
  url: string,
  config: Record<string, unknown> = {},
  maxPages = 5,
) {
  const result: T[] = []
  const baseParams = (config.params as Record<string, unknown> | undefined) ?? {}

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await api.get<T[] | PaginatedPayload<T>>(url, {
      ...config,
      params: { ...baseParams, page, pageSize: 100 },
    } as never)
    if (Array.isArray(response.data)) return response.data
    result.push(...response.data.items)
    if (
      response.data.hasNextPage === false ||
      (response.data.totalPages !== undefined && page >= response.data.totalPages) ||
      response.data.items.length < 100
    ) {
      break
    }
  }
  return result
}

