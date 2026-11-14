type Window = { startTime: string; endTime: string }

const minutes = (hhmm: string) => {
  const [hours, mins] = hhmm.split(':').map(Number)
  return hours * 60 + mins
}

export function shiftContains(shift: Window, value: number) {
  const start = minutes(shift.startTime)
  const end = minutes(shift.endTime)
  return end <= start ? value >= start || value < end : value >= start && value < end
}

/** Same rule as the API: the only shift that holds the "HH:mm" start, else null. */
export function suggestShiftId(shifts: (Window & { id: string })[], startTime: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec((startTime ?? '').trim())
  if (!match) return null
  const value = Number(match[1]) * 60 + Number(match[2])
  const fits = shifts.filter((shift) => shiftContains(shift, value))
  return fits.length === 1 ? fits[0].id : null
}
