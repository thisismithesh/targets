import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, getSubtasks, getTeamMemberById, getWeekById, createTask, deleteTask } from '../lib/supabase'
import Task from '../components/Task'
import { getWeekLabelShort } from '../lib/utils'

export default function TeamMemberDetail() {
  const { memberId, weekId } = useParams()
  const [teamMember, setTeamMember] = useState(null)
  const [week, setWeek] = useState(null)
  const [tasks, setTasks] = useState([])
  const [subtaskMap, setSubtaskMap] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Add task form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTask, setNewTask] = useState({
    task_name: '',
    heading: 'General',
    deadline: '',
    estimated_hours: '',
  })
  const [addMessage, setAddMessage] = useState('')

  // Inline add-task state (used by the per-heading "+ Add" buttons)
  const [inlineHeading, setInlineHeading] = useState(null)
  const [inlineTask, setInlineTask] = useState({
    task_name: '',
    deadline: '',
    estimated_hours: '',
  })

  useEffect(() => {
    loadData()
  }, [memberId, weekId, refreshKey])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [member, w] = await Promise.all([
        getTeamMemberById(memberId),
        getWeekById(weekId),
      ])
      setTeamMember(member)
      setWeek(w)

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('team_member_id', memberId)
        .eq('week_id', weekId)
        .is('parent_task_id', null)
        .order('heading', { ascending: true })

      if (tasksError) throw tasksError
      setTasks(tasksData || [])

      const map = {}
      for (const task of tasksData || []) {
        map[task.id] = await getSubtasks(task.id)
      }
      setSubtaskMap(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTaskUpdate = () => setRefreshKey((prev) => prev + 1)

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTask.task_name) {
      setAddMessage('Please enter a task name')
      return
    }
    try {
      await createTask({
        team_member_id: memberId,
        week_id: weekId,
        task_name: newTask.task_name,
        heading: newTask.heading || 'General',
        deadline: newTask.deadline || null,
        estimated_hours: newTask.estimated_hours ? parseFloat(newTask.estimated_hours) : null,
        status: 'pending',
        position: tasks.length,
      })
      setNewTask({ task_name: '', heading: 'General', deadline: '', estimated_hours: '' })
      setAddMessage('')
      setShowAddForm(false)
      handleTaskUpdate()
    } catch (err) {
      setAddMessage('Error adding task')
      console.error(err)
    }
  }

  const handleAddInlineTask = async (heading) => {
    if (!inlineTask.task_name) return
    try {
      await createTask({
        team_member_id: memberId,
        week_id: weekId,
        task_name: inlineTask.task_name,
        heading: heading || 'General',
        deadline: inlineTask.deadline || null,
        estimated_hours: inlineTask.estimated_hours ? parseFloat(inlineTask.estimated_hours) : null,
        status: 'pending',
        position: tasks.length,
      })
      setInlineTask({ task_name: '', deadline: '', estimated_hours: '' })
      setInlineHeading(null)
      handleTaskUpdate()
    } catch (err) {
      console.error('Error adding task:', err)
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return
    try {
      await deleteTask(taskId)
      handleTaskUpdate()
    } catch (err) {
      console.error('Error deleting task:', err)
    }
  }

  // Group tasks by heading
  const tasksByHeading = {}
  tasks.forEach((task) => {
    if (!tasksByHeading[task.heading]) tasksByHeading[task.heading] = []
    tasksByHeading[task.heading].push(task)
  })

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const onHoldCount = tasks.filter((t) => t.status === 'on-hold').length
  const pendingCount = tasks.filter((t) => t.status === 'pending').length

  if (isLoading) return <div className="text-center py-8">Loading...</div>

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
        <p className="font-medium">Error loading data</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div>
      <Link to="/" className="text-blue-600 hover:text-blue-700 mb-6 inline-block">
        ← Back to Dashboard
      </Link>

      {teamMember && week && (
        <>
          <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">{teamMember.name}</h1>
              <p className="text-gray-500 text-sm mb-1">{teamMember.team}</p>
              <p className="text-lg text-gray-600">{getWeekLabelShort(week.week_start_date)}</p>
            </div>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
            >
              {showAddForm ? 'Cancel' : '+ Add Task'}
            </button>
          </div>

          {/* Add Task Form */}
          {showAddForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-3">New Task</h3>
              {addMessage && (
                <p className="mb-3 text-sm text-red-600">{addMessage}</p>
              )}
              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Task Name *</label>
                    <input
                      type="text"
                      value={newTask.task_name}
                      onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Complete project report"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project/Category</label>
                    <input
                      type="text"
                      value={newTask.heading}
                      onChange={(e) => setNewTask({ ...newTask, heading: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., General"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Est. Hours</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={newTask.estimated_hours}
                      onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 4.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deadline</label>
                    <input
                      type="date"
                      value={newTask.deadline}
                      onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 font-medium"
                  >
                    Add Task
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setAddMessage('') }}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Stats */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-3 gap-4">
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

          {/* Task List */}
          {tasks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500 mb-3">No tasks assigned for this week yet.</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                + Add the first task
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {Object.entries(tasksByHeading).map(([heading, headingTasks]) => (
                <div key={heading} className="mb-6">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {heading}
                    </h2>
                    <button
                      onClick={() => {
                        setInlineHeading(heading)
                        setInlineTask({ task_name: '', deadline: '', estimated_hours: '' })
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      title={`Add task to ${heading}`}
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {headingTasks.map((task) => (
                      <Task
                        key={task.id}
                        task={task}
                        subtasks={subtaskMap[task.id] || []}
                        onTaskUpdate={handleTaskUpdate}
                        onDeleteTask={handleDeleteTask}
                      />
                    ))}
                    {inlineHeading === heading && (
                      <div className="flex gap-2 items-center bg-blue-50 border border-blue-200 rounded-md p-2">
                        <input
                          type="text"
                          value={inlineTask.task_name}
                          onChange={(e) => setInlineTask({ ...inlineTask, task_name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddInlineTask(heading)
                            if (e.key === 'Escape') setInlineHeading(null)
                          }}
                          className="flex-[7] min-w-0 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Task name"
                          autoFocus
                        />
                        <input
                          type="date"
                          value={inlineTask.deadline}
                          onChange={(e) => setInlineTask({ ...inlineTask, deadline: e.target.value })}
                          className="flex-[1.5] min-w-0 px-1 py-1 border border-gray-300 rounded text-xs"
                        />
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={inlineTask.estimated_hours}
                          onChange={(e) => setInlineTask({ ...inlineTask, estimated_hours: e.target.value })}
                          placeholder="h"
                          className="flex-[1] min-w-0 px-1 py-1 border border-gray-300 rounded text-xs"
                        />
                        <button
                          onClick={() => handleAddInlineTask(heading)}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex-shrink-0"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setInlineHeading(null)}
                          className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    )}
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
