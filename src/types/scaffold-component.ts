/* eslint-disable @typescript-eslint/no-redeclare */
export const ScaffoldComponentCategory = {
  PATAMAR: 'PATAMAR',
  TABUADO: 'TABUADO',
  LINHA_DE_VIDA: 'LINHA_DE_VIDA',
  GUARDA_CORPO: 'GUARDA_CORPO',
  RODAPE: 'RODAPE',
  ESCADA: 'ESCADA',
  TRAVAMENTO: 'TRAVAMENTO',
  ACESSORIO: 'ACESSORIO',
  OUTRO: 'OUTRO',
} as const

export type ScaffoldComponentCategory =
  (typeof ScaffoldComponentCategory)[keyof typeof ScaffoldComponentCategory]

export type ScaffoldComponent = {
  id: string
  scaffoldId: string
  lineCode: string
  category?: ScaffoldComponentCategory | string
  name: string
  notes?: string | null
  description?: string | null
  measurementUnit?: string | null
  repeatCount?: number | null
  quantity?: number | null
  quantityPerItem?: number | null
  height?: number | null
  width?: number | null
  length?: number | null
  currentStatus?: 'PLANEJADO' | 'MONTADO' | 'DESMONTADO' | 'CANCELLED' | 'NOT_EXECUTED'
  executionProgress?: Partial<Record<'MONTAGEM' | 'DESMONTAGEM', {
    measuredQuantity: number
    remainingQuantity: number
    progressPercent: number
  }>>
  isAvailableForOperation?: boolean
}
