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
  const deadlineDate = parseISO(deadline)
  return deadlineDate < today
}

export function getWeekLabel(weekStartDate) {
  const date = parseISO(weekStartDate)
  const endDate = addWeeks(date, 1)
  return `${formatDate(date)} - ${formatDate(endDate)}`
}

export function getStatusColor(status, carryForwardWeeks = 0) {
  if (status === 'on-hold') return 'red'
  if (status === 'carry-forward' || carryForwardWeeks > 0) return 'purple'
  if (status === 'completed') return 'green'
  return 'gray'
}

export function getStatusLabel(status, carryForwardWeeks = 0) {
  if (status === 'on-hold') return 'On Hold'
  if (status === 'carry-forward' || carryForwardWeeks > 0) return `Carried Forward (${carryForwardWeeks}w)`
  if (status === 'completed') return 'Completed'
  return 'Pending'
}
