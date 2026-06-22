import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, getSubtasks, getTeamMemberById, getWeekById } from '../lib/supabase'
import Task from '../components/Task'
import { getWeekLabel } from '../lib/utils'

export default function TeamMemberDetail() {
  const { memberId, weekId } = useParams()
  const [teamMember, setTeamMember] = useState(null)
  const [week, setWeek] = useState(null)
  const [tasks, setTasks] = useState([])
  const [subtaskMap, setSubtaskMap] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    loadData()
  }, [memberId, weekId, refreshKey])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get team member
      const member = await getTeamMemberById(memberId)
      setTeamMember(member)

      // Get week
      const w = await getWeekById(weekId)
      setWeek(w)

      // Get tasks for this team member and week
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('team_member_id', memberId)
        .eq('week_id', weekId)
        .is('parent_task_id', null)
        .order('heading', { ascending: true })

      if (tasksError) throw tasksError

      setTasks(tasksData || [])

      // Load subtasks for each task
      const map = {}
      for (const task of tasksData || []) {
        const subtasks = await getSubtasks(task.id)
        map[task.id] = subtasks
      }
      setSubtaskMap(map)
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

  // Group tasks by heading
  const tasksByHeading = {}
  tasks.forEach((task) => {
    if (!tasksByHeading[task.heading]) {
      tasksByHeading[task.heading] = []
    }
    tasksByHeading[task.heading].push(task)
  })

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
        <p className="font-medium">Error loading data</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  const completedCount = tasks.filter(t => t.status === 'completed').length
  const onHoldCount = tasks.filter(t => t.status === 'on-hold').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const totalHours = tasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0)

  return (
    <div>
      <Link to="/" className="text-blue-600 hover:text-blue-700 mb-6 inline-block">
        ← Back to Dashboard
      </Link>

      {teamMember && week && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{teamMember.name}</h1>
            <p className="text-gray-600 mb-2">{teamMember.email}</p>
            {week && (
              <p className="text-lg text-gray-600">
                {getWeekLabel(week.week_start_date)}
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}</div>
                <div className="text-xs text-gray-500">Total Hours</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{completedCount}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{onHoldCount}</div>
                <div className="text-xs text-gray-500">On Hold</div>
              </div>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No tasks assigned for this week yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {Object.entries(tasksByHeading).map(([heading, headingTasks]) => (
                <div key={heading} className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
                    {heading}
                  </h2>
                  <div className="space-y-2">
                    {headingTasks.map((task) => (
                      <Task
                        key={task.id}
                        task={task}
                        subtasks={subtaskMap[task.id] || []}
                        onTaskUpdate={handleTaskUpdate}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
