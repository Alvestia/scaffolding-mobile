/** Work shift of the contract; an end not after the start crosses midnight. */
export type ContractShift = {
  id: string
  name: string
  startTime: string
  endTime: string
  breakStart: string | null
  breakEnd: string | null
  active: boolean
  sortOrder: number
}
