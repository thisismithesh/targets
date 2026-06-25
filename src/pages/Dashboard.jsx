import { useState, useEffect } from 'react'
import { supabase, getTeamMembers, getCurrentWeek, getOrCreateWeek } from '../lib/supabase'
import TeamMemberRow from '../components/TeamMemberRow'
import { getWeekLabelShort } from '../lib/utils'
import { addWeeks, subWeeks, startOfWeek, format, parseISO } from 'date-fns'

function getMondayOf(date) {
  const d = startOfWeek(date, { weekStartsOn: 1 })
  return format(d, 'yyyy-MM-dd')
}

export default function Dashboard() {
  const [currentWeekStart, setCurrentWeekStart] = useState(null) // 'YYYY-MM-DD' of Monday
  const [todayWeekStart, setTodayWeekStart] = useState(null)    // always today's week
  const [week, setWeek] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [tasksByMember, setTasksByMember] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // On first load, determine today's week
  useEffect(() => {
    const todayMonday = getMondayOf(new Date())
    setTodayWeekStart(todayMonday)
    setCurrentWeekStart(todayMonday)
  }, [])

  useEffect(() => {
    if (currentWeekStart) loadData()
  }, [currentWeekStart, refreshKey])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [w, members] = await Promise.all([
        getOrCreateWeek(currentWeekStart),
        getTeamMembers(),
      ])
      setWeek(w)
      setTeamMembers(members)

      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('week_id', w.id)
        .is('parent_task_id', null)

      if (taskError) throw taskError

      const grouped = {}
      members.forEach((member) => { grouped[member.id] = [] })
      if (tasks) {
        tasks.forEach((task) => {
          if (grouped[task.team_member_id]) {
            grouped[task.team_member_id].push(task)
          }
        })
      }
      setTasksByMember(grouped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTaskUpdate = () => setRefreshKey((prev) => prev + 1)

  const goToPrevWeek = () => {
    const d = subWeeks(parseISO(currentWeekStart), 1)
    setCurrentWeekStart(format(d, 'yyyy-MM-dd'))
  }

  const goToNextWeek = () => {
    const d = addWeeks(parseISO(currentWeekStart), 1)
    setCurrentWeekStart(format(d, 'yyyy-MM-dd'))
  }

  const goToCurrentWeek = () => setCurrentWeekStart(todayWeekStart)

  const isThisWeek = currentWeekStart === todayWeekStart
  const adjacentNextWeekStart = todayWeekStart
    ? format(addWeeks(parseISO(todayWeekStart), 1), 'yyyy-MM-dd')
    : null
  const adjacentPrevWeekStart = todayWeekStart
    ? format(subWeeks(parseISO(todayWeekStart), 1), 'yyyy-MM-dd')
    : null
  const isNextWeek = currentWeekStart === adjacentNextWeekStart
  const isPastWeek = currentWeekStart === adjacentPrevWeekStart

  const weekLabel = week ? getWeekLabelShort(week.week_start_date) : ''

  if (isLoading) {
    return (
      <div className="max-w-[600px] mx-auto space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="h-1.5 bg-gray-200 rounded w-24 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[600px] mx-auto">
      <div className="mb-6">
        {/* Week navigation */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={goToPrevWeek}
            className="px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-medium flex-shrink-0"
          >
            ← Previous
          </button>

          <div className="flex flex-1 items-center justify-center gap-1.5 flex-wrap min-w-0">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{weekLabel}</span>
            {isThisWeek && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                Current Week
              </span>
            )}
            {isNextWeek && (
              <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                Next Week
              </span>
            )}
            {!isThisWeek && !isNextWeek && isPastWeek && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full font-medium">
                Past Week
              </span>
            )}
            {!isThisWeek && (
              <button
                onClick={goToCurrentWeek}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Back to This Week
              </button>
            )}
          </div>

          <button
            onClick={goToNextWeek}
            className="px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-medium flex-shrink-0"
          >
            Next →
          </button>
        </div>
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
          <a href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin to add team members
          </a>
        </div>
      ) : (
        <div>
          {teamMembers.map((member) => (
            <TeamMemberRow
              key={member.id}
              teamMember={member}
              weekId={week?.id}
              tasks={tasksByMember[member.id] || []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
