import type { MeasurementUnit, ScaffoldServiceType } from '@/types/scaffold-service'
import { SyncStatus } from '@/types/sync'
import { getMeasurementUnitLabel } from '@/utils/execution'

/**
 * "Meu dia": what the signed-in person recorded, day by day.
 * Days are calendar days of the phone (YYYY-MM-DD), the same clock the
 * person used to type the start and end times of each entry.
 */

export type MyDayActivity = {
  /** Server id, or the local id while the entry is only on this phone. */
  id: string
  clientMutationId?: string | null
  scaffoldId: string
  scaffoldCode: string
  scaffoldPlace: string | null
  serviceType: ScaffoldServiceType | null
  operationType: string
  inputType: string
  inputValue: number
  unit: MeasurementUnit | null
  startTime: string
  endTime: string | null
  manHours: number | null
  workOrderCode: string | null
  /** Approval status of a sent entry. */
  approvalStatus?: string | null
  /** Sync status of an entry still on this phone. */
  syncStatus?: SyncStatus | null
}

export const WEEKDAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

const pad = (value: number) => String(value).padStart(2, '0')

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of a YYYY-MM-DD key. */
export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(key: string, days: number) {
  const date = parseDateKey(key)
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** Monday of the week of the day. */
export function startOfWeek(key: string) {
  const offset = (parseDateKey(key).getDay() + 6) % 7
  return addDays(key, -offset)
}

export type WeekDay = {
  key: string
  weekday: (typeof WEEKDAY_LABELS)[number]
  dayOfMonth: number
  isToday: boolean
  isFuture: boolean
}

export function weekDays(selectedKey: string, todayKey: string): WeekDay[] {
  const monday = startOfWeek(selectedKey)
  return WEEKDAY_LABELS.map((weekday, index) => {
    const key = addDays(monday, index)
    return {
      key,
      weekday,
      dayOfMonth: parseDateKey(key).getDate(),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    }
  })
}

export function monthTitle(key: string) {
  const date = parseDateKey(key)
  return `${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`
}

export function dayTitle(key: string, todayKey: string) {
  if (key === todayKey) return 'Hoje'
  if (key === addDays(todayKey, -1)) return 'Ontem'
  const date = parseDateKey(key)
  const weekday = WEEKDAY_LABELS[(date.getDay() + 6) % 7]
  return `${weekday.charAt(0)}${weekday.slice(1).toLowerCase()}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

/** First day of the month of the key, moved by `months`. */
export function shiftMonth(key: string, months: number) {
  const date = parseDateKey(key)
  return dateKey(new Date(date.getFullYear(), date.getMonth() + months, 1))
}

/** Calendar of a month in rows of 7, Monday first; null fills the edges. */
export function monthGrid(monthKey: string): (string | null)[][] {
  const first = parseDateKey(shiftMonth(monthKey, 0))
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const leading = (first.getDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(dateKey(new Date(first.getFullYear(), first.getMonth(), day)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (string | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7))
  return rows
}

/**
 * Period asked to the server: the visible days with one day of margin on
 * each side, because the server cuts days on São Paulo time and the phone
 * may be on another time zone.
 */
export function weekRange(selectedKey: string) {
  const monday = startOfWeek(selectedKey)
  return { from: addDays(monday, -1), to: addDays(monday, 7) }
}

export function monthRange(monthKey: string) {
  const first = shiftMonth(monthKey, 0)
  return { from: addDays(first, -1), to: shiftMonth(first, 1) }
}

export function activityDayKey(activity: Pick<MyDayActivity, 'startTime'>) {
  return dateKey(new Date(activity.startTime))
}

/**
 * Sent entries plus the ones still on this phone. An entry that was just sent
 * can be in both for a moment: the server copy wins.
 */
export function mergeActivities(sent: MyDayActivity[], onDevice: MyDayActivity[]) {
  const sentMutations = new Set(sent.map((item) => item.clientMutationId).filter(Boolean))
  const pending = onDevice.filter((item) => !sentMutations.has(item.clientMutationId ?? item.id))
  return [...sent, ...pending].sort(
    (left, right) =>
      left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id),
  )
}

export function countByDay(activities: MyDayActivity[]) {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    const key = activityDayKey(activity)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export type ScaffoldDay = {
  scaffoldId: string
  scaffoldCode: string
  scaffoldPlace: string | null
  activities: MyDayActivity[]
}

/** The day's entries, one card per scaffold, in the order the work began. */
export function scaffoldsOfDay(activities: MyDayActivity[], key: string): ScaffoldDay[] {
  const groups = new Map<string, ScaffoldDay>()
  for (const activity of activities) {
    if (activityDayKey(activity) !== key) continue
    const group = groups.get(activity.scaffoldId) ?? {
      scaffoldId: activity.scaffoldId,
      scaffoldCode: activity.scaffoldCode,
      scaffoldPlace: activity.scaffoldPlace,
      activities: [],
    }
    group.activities.push(activity)
    groups.set(activity.scaffoldId, group)
  }
  return [...groups.values()]
}

export function dayTotals(scaffolds: ScaffoldDay[]) {
  const activities = scaffolds.flatMap((scaffold) => scaffold.activities)
  return {
    scaffolds: scaffolds.length,
    entries: activities.length,
    manHours: activities.reduce((sum, activity) => sum + (activity.manHours ?? 0), 0),
  }
}

export function formatNumber(value: number) {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

export function operationLabel(operationType: string) {
  switch (operationType) {
    case 'MONTAGEM':
      return 'Montagem'
    case 'DESMONTAGEM':
      return 'Desmontagem'
    case 'MODIFICACAO':
      return 'Modificação'
    default:
      return 'Execução'
  }
}

export function advanceLabel(activity: Pick<MyDayActivity, 'inputType' | 'inputValue' | 'unit'>) {
  if (activity.inputType === 'PERCENTUAL') return `${formatNumber(activity.inputValue)}%`
  const unit = activity.unit ? ` ${getMeasurementUnitLabel(activity.unit)}` : ''
  return `${formatNumber(activity.inputValue)}${unit}`
}

function clock(value: string) {
  const date = new Date(value)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function timeRangeLabel(activity: Pick<MyDayActivity, 'startTime' | 'endTime'>) {
  return activity.endTime
    ? `${clock(activity.startTime)} – ${clock(activity.endTime)}`
    : `desde ${clock(activity.startTime)}`
}

export type ActivityStatus = {
  label: string
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function activityStatus(activity: MyDayActivity): ActivityStatus {
  if (activity.syncStatus) {
    return activity.syncStatus === SyncStatus.FAILED ||
      activity.syncStatus === SyncStatus.CONFLICT ||
      activity.syncStatus === SyncStatus.DEAD_LETTER
      ? { label: 'Erro no envio', tone: 'danger' }
      : { label: 'Aguardando envio', tone: 'warning' }
  }
  switch (activity.approvalStatus) {
    case 'PENDING_PLANNER':
      return { label: 'Pend. planejador', tone: 'warning' }
    case 'PENDING_FISCAL':
      return { label: 'Pend. fiscal', tone: 'info' }
    case 'RETURNED':
      return { label: 'Devolvido', tone: 'danger' }
    case 'APPROVED':
      return { label: 'Aprovado', tone: 'success' }
    default:
      return { label: 'Enviado', tone: 'neutral' }
  }
}
