export function nowIso() {
  return new Date().toISOString()
}

const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/
const timeRegex = /^(\d{2}):(\d{2})$/
const isoDateRegex = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/

export function formatTime(value: Date) {
  return value.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000)
}

export function formatDate(value: Date) {
  return value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 8),
  ].filter(Boolean)

  return parts.join('/')
}

export function maskTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  const parts = [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean)
  return parts.join(':')
}

export function parseDateInput(value: string) {
  const match = value.match(dateRegex)
  if (!match) {
    return null
  }

  const [, dayRaw, monthRaw, yearRaw] = match
  const day = Number(dayRaw)
  const month = Number(monthRaw)
  const year = Number(yearRaw)

  const date = new Date(year, month - 1, day, 0, 0, 0, 0)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function parseTimeInput(value: string) {
  const match = value.match(timeRegex)
  if (!match) {
    return null
  }

  const [, hoursRaw, minutesRaw] = match
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  return { hours, minutes }
}

export function parseDateTimeInput(dateValue: string, timeValue: string) {
  const parsedDate = parseDateInput(dateValue)
  const parsedTime = parseTimeInput(timeValue)

  if (!parsedDate || !parsedTime) {
    return null
  }

  const combined = new Date(parsedDate)
  combined.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)

  return combined
}

export function toIsoFromDateTime(dateValue: string, timeValue: string) {
  const parsed = parseDateTimeInput(dateValue, timeValue)

  if (!parsed) {
    throw new Error('Data ou horario invalido.')
  }

  return parsed.toISOString()
}

export function getDateTimeFieldsFromIso(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Data invalida.')
  }

  return {
    date: formatDate(date),
    time: formatTime(date),
  }
}

export function toTodayIsoFromTime(value: string) {
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error('Horario invalido.')
  }

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

/**
 * Converte uma data no formato de entrada brasileiro (dd/mm/aaaa)
 * para o formato ISO date (YYYY-MM-DD) aceito pela API.
 * Retorna null se o valor não for válido.
 */
export function dateInputToIsoDate(value: string): string | null {
  const parsed = parseDateInput(value)
  if (!parsed) {
    return null
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Extrai a data civil de um valor ISO sem convertê-lo para o fuso do aparelho.
 * Campos de planejamento representam um dia do calendário, não um instante.
 */
export function getBusinessDateKey(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const match = value.match(isoDateRegex)
  if (!match) {
    return null
  }

  const [, yearRaw, monthRaw, dayRaw] = match
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${yearRaw}-${monthRaw}-${dayRaw}`
}

export function formatBusinessDate(value?: string | null): string | null {
  const dateKey = getBusinessDateKey(value)
  if (!dateKey) {
    return null
  }

  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

export function formatShortDateTime(value?: string | null) {
  if (!value) return '-'

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
