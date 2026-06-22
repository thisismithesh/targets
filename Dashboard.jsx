import { useState, useEffect } from 'react'
import { supabase, getTeamMembers, getCurrentWeek } from '../lib/supabase'
import TeamMemberCard from '../components/TeamMemberCard'
import { getWeekLabel } from '../lib/utils'

export default function Dashboard() {
  const [currentWeek, setCurrentWeek] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [tasksByMember, setTasksByMember] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get current week
      const week = await getCurrentWeek()
      setCurrentWeek(week)

      // Get all team members
      const members = await getTeamMembers()
      setTeamMembers(members)

      // Get all tasks for current week
      if (week) {
        const { data: tasks, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('week_id', week.id)
          .is('parent_task_id', null) // Only main tasks for dashboard

        if (taskError) throw taskError

        // Group tasks by team member
        const grouped = {}
        members.forEach((member) => {
          grouped[member.id] = []
        })

        if (tasks) {
          tasks.forEach((task) => {
            if (grouped[task.team_member_id]) {
              grouped[task.team_member_id].push(task)
            }
          })
        }

        setTasksByMember(grouped)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTaskUpdate = () => {
    setRefreshKey((prev) => prev + 1)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Weekly Targets</h1>
        {currentWeek && (
          <p className="text-lg text-gray-600">
            {getWeekLabel(currentWeek.week_start_date)}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-800">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={handleTaskUpdate}
            className="mt-2 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )}

      {teamMembers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No team members found.</p>
          <a
            href="/admin"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to Admin to add team members
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teamMembers.map((member) => (
            <TeamMemberCard
              key={member.id}
              teamMember={member}
              weekId={currentWeek?.id}
              tasks={tasksByMember[member.id] || []}
              onTaskUpdate={handleTaskUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
