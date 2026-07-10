import { Link } from 'react-router-dom'
import Stars from './Stars'

export default function TeamMemberRow({ teamMember, weekId, weekStart, tasks = [], starCount = 0, unavailableDays = [] }) {
  // Exclude on-hold tasks entirely from the progress count
  const relevantTasks = tasks.filter((t) => t.status !== 'on-hold')
  const totalCount = relevantTasks.length
  const completedCount = relevantTasks.filter((t) => t.status === 'completed').length
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <Link
      to={{
        pathname: `/team/${teamMember.id}/week/${weekId}`,
        search: weekStart ? `?dashWeek=${weekStart}` : '',
      }}
      className="group flex items-center justify-between gap-4 py-3 px-1 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-base font-medium text-gray-900 truncate group-hover:underline">{teamMember.name}</span>
        <Stars count={starCount} />
        {unavailableDays.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 flex-shrink-0"
            title="Not available this week"
          >
            Out: {unavailableDays.join(', ')}
          </span>
        )}
      </span>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="text-sm text-gray-500 tabular-nums">
          {completedCount}/{totalCount}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Link>
  )
}
