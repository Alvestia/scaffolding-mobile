export type ScaffoldComponentType = {
  id: string
  code: string
  name: string
  description?: string | null
  defaultMeasurementUnit?: 'M3' | 'M2' | 'UNIDADE' | null
  aliases?: string[] | null
  active: boolean
}
