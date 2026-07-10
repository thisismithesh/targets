import { format, startOfWeek, endOfWeek, addWeeks, parseISO } from 'date-fns'

export function getWeekStartDate(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 1 }) // Monday as start
}

export function getWeekEndDate(date = new Date()) {
  return endOfWeek(date, { weekStartsOn: 1 }) // Sunday as end
}

export function formatDate(date) {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'MMM dd, yyyy')
}

export function formatDateShort(date) {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'MMM dd')
}

export function isOverdue(deadline, completedDate, status) {
  if (status === 'completed' || completedDate) return false
  if (!deadline) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = parseISO(deadline)
  deadlineDate.setHours(0, 0, 0, 0)
  return deadlineDate < today
}

export function isDueToday(deadline, completedDate, status) {
  if (status === 'completed' || completedDate) return false
  if (!deadline) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = parseISO(deadline)
  deadlineDate.setHours(0, 0, 0, 0)
  return deadlineDate.getTime() === today.getTime()
}

export function getWeekLabel(weekStartDate) {
  const date = parseISO(weekStartDate)
  const endDate = addWeeks(date, 1)
  return `${formatDate(date)} - ${formatDate(endDate)}`
}

export function getWeekLabelShort(weekStartDate) {
  const date = parseISO(weekStartDate)
  const monthName = format(date, 'MMMM')
  const weekNumber = Math.ceil(parseInt(format(date, 'd')) / 7)
  return `${monthName} Week ${weekNumber}`
}

// e.g. "July 6 to July 12" (drops the repeated month if both dates share one:
// "July 6 to 12"). Falls back gracefully if only a start date is available.
export function getWeekRangeLabel(weekStartDate, weekEndDate) {
  const start = parseISO(weekStartDate)
  const end = weekEndDate ? parseISO(weekEndDate) : addWeeks(start, 1)
  const sameMonth = format(start, 'MMMM') === format(end, 'MMMM')
  const startLabel = format(start, 'MMMM d')
  const endLabel = sameMonth ? format(end, 'd') : format(end, 'MMMM d')
  return `${startLabel} to ${endLabel}`
}

export function getStatusColor(status, carryForwardWeeks = 0) {
  if (status === 'on-hold') return 'red'
  if (status === 'carry-forward' || carryForwardWeeks > 0) return 'purple'
  if (status === 'completed') return 'green'
  return 'gray'
}

// Clicking anywhere on a date input (not just the tiny calendar icon)
// opens the native date picker. Falls back to default behavior in
// browsers that don't support showPicker() (e.g. Firefox, Safari).
export function openDatePicker(e) {
  const input = e.currentTarget
  if (input && typeof input.showPicker === 'function') {
    try {
      input.showPicker()
    } catch {
      // Ignore — browser declined (e.g. input disabled), default click still works
    }
  }
}

export function getStatusLabel(status, carryForwardWeeks = 0) {
  if (status === 'on-hold') return 'On Hold'
  if (status === 'carry-forward' || carryForwardWeeks > 0) return `Carried Forward (${carryForwardWeeks}w)`
  if (status === 'completed') return 'Completed'
  return 'Pending'
}
