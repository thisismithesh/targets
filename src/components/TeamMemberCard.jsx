import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getSubtasks } from '../lib/supabase'
import Stars from './Stars'

export default function TeamMemberCard({ teamMember, weekId, tasks, onTaskUpdate, starCount = 0 }) {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(false)
  }, [tasks, weekId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    )
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const onHoldCount = tasks.filter((t) => t.status === 'on-hold').length
  const pendingCount = tasks.filter((t) => t.status === 'pending').length

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>{teamMember.name}</span>
            <Stars count={starCount} />
          </h2>
          <p className="text-sm text-gray-500">{teamMember.team}</p>
        </div>
        <Link
          to={`/team/${teamMember.id}/week/${weekId}`}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          View Targets
        </Link>
      </div>

      <div className="flex gap-4 pb-4 border-b border-gray-200">
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-xs text-gray-500">Completed</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-red-600">{onHoldCount}</div>
          <div className="text-xs text-gray-500">On Hold</div>
        </div>
      </div>
    </div>
  )
}
