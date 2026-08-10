export type WorkOrder = {
  id: string
  code: string
  type?: string | null
  status?: string | null
  projectId?: string | null
  unitId?: string | null
  contractId?: string | null
  project?: {
    id: string
    name: string
  } | null
}
