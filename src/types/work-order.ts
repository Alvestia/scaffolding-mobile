export type WorkOrder = {
  id: string
  code: string
  type?: string | null
  status?: string | null
  projectId?: string | null
  areaId?: string | null
  unitId?: string | null
  contractId?: string | null
  project?: {
    id: string
    name: string
  } | null
  areaRef?: {
    id: string
    code?: string | null
    name: string
  } | null
}
