import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, getSubtasks, getTeamMemberById, getWeekById, createTask, updateTask, deleteTask, recordCleanSweep, removeCleanSweep, getStarCount, getCommentCounts, getHeadingOrders, saveHeadingOrder } from '../lib/supabase'
import Task from '../components/Task'
import CleanSweepPopup from '../components/CleanSweepPopup'
import Stars from '../components/Stars'
import { getWeekLabelShort, openDatePicker } from '../lib/utils'

export default function TeamMemberDetail() {
  const { memberId, weekId } = useParams()
  const [teamMember, setTeamMember] = useState(null)
  const [week, setWeek] = useState(null)
  const [tasks, setTasks] = useState([])
  const [subtaskMap, setSubtaskMap] = useState({})
  const [commentCounts, setCommentCounts] = useState({})
  const [headingOrders, setHeadingOrders] = useState({}) // { heading: position }
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Clean-sweep (star) detection
  const [showSweep, setShowSweep] = useState(false)
  const [wasSwept, setWasSwept] = useState(null) // null until first load establishes baseline
  const [starCount, setStarCount] = useState(0)

  const refreshStars = async () => {
    try {
      setStarCount(await getStarCount(memberId))
    } catch (err) {
      console.error('Error loading stars:', err)
    }
  }

  // Add project form state
  const [showAddProjectForm, setShowAddProjectForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
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
  }, [memberId, weekId])

  const fetchTasks = async () => {
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('team_member_id', memberId)
      .eq('week_id', weekId)
      .is('parent_task_id', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (tasksError) throw tasksError

    const list = tasksData || []
    const map = {}
    for (const task of list) {
      map[task.id] = await getSubtasks(task.id)
    }
    // Comment counts for all top-level tasks
    let counts = {}
    try {
      counts = await getCommentCounts(list.map((t) => t.id))
    } catch (e) {
      console.error('Error loading comment counts:', e)
    }
    return { list, map, counts }
  }

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

      const { list, map, counts } = await fetchTasks()
      setTasks(list)
      setSubtaskMap(map)
      setCommentCounts(counts)
      // Load any saved heading order for this member+week
      try {
        const orders = await getHeadingOrders(memberId, weekId)
        const orderMap = {}
        orders.forEach((o) => { orderMap[o.heading] = o.position })
        setHeadingOrders(orderMap)
      } catch (e) {
        console.error('Error loading heading order:', e)
      }
      // Establish the sweep baseline silently (no popup on initial load,
      // so revisiting an already-completed week doesn't re-congratulate)
      setWasSwept(computeSwept(list))
      refreshStars()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // A clean sweep = at least one task and every task completed.
  const computeSwept = (list) =>
    list.length > 0 && list.every((t) => t.status === 'completed')

  // Silent reload: refresh task data in the background without the loading spinner
  const handleTaskUpdate = async () => {
    try {
      const { list, map, counts } = await fetchTasks()
      setTasks(list)
      setSubtaskMap(map)
      setCommentCounts(counts)

      const swept = computeSwept(list)
      // Fire only on the transition into a swept state
      if (swept && wasSwept === false) {
        try {
          await recordCleanSweep(memberId, weekId)
          setShowSweep(true)
          refreshStars()
        } catch (err) {
          console.error('Error recording clean sweep:', err)
        }
      } else if (!swept && wasSwept === true) {
        // No longer a clean sweep — drop the star for this week
        try {
          await removeCleanSweep(memberId, weekId)
          refreshStars()
        } catch (err) {
          console.error('Error removing clean sweep:', err)
        }
      }
      setWasSwept(swept)
    } catch (err) {
      console.error('Error refreshing tasks:', err)
    }
  }

  // Add a new project (heading)
  const handleAddProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) {
      setAddMessage('Please enter a project name')
      return
    }

    try {
      // Create a dummy task to establish the heading
      const created = await createTask({
        team_member_id: memberId,
        week_id: weekId,
        task_name: '', // Empty for now - this is just to create the heading
        heading: newProjectName.trim(),
        deadline: null,
        estimated_hours: null,
        status: 'pending',
        position: nextPosition(),
      })
      if (created) {
        setTasks((prev) => [...prev, created])
        setSubtaskMap((prev) => ({ ...prev, [created.id]: [] }))
      }
      setNewProjectName('')
      setAddMessage('')
      setShowAddProjectForm(false)
    } catch (err) {
      setAddMessage('Error adding project')
      console.error(err)
    }
  }

  const handleAddInlineTask = async (heading) => {
    if (!inlineTask.task_name) return
    try {
      const created = await createTask({
        team_member_id: memberId,
        week_id: weekId,
        task_name: inlineTask.task_name,
        heading: heading || 'General',
        deadline: inlineTask.deadline || null,
        estimated_hours: inlineTask.estimated_hours ? parseFloat(inlineTask.estimated_hours) : null,
        status: 'pending',
        position: nextPosition(),
      })
      if (created) {
        setTasks((prev) => [...prev, created])
        setSubtaskMap((prev) => ({ ...prev, [created.id]: [] }))
      }
      setInlineTask({ task_name: '', deadline: '', estimated_hours: '' })
      setInlineHeading(null)
    } catch (err) {
      console.error('Error adding task:', err)
    }
  }

  const handleDeleteTask = async (taskId) => {
    // Optimistically remove from local state for an immediate, clean update
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSubtaskMap((prev) => {
      const next = { ...prev }
      delete next[taskId]
      return next
    })
    try {
      await deleteTask(taskId)
    } catch (err) {
      console.error('Error deleting task:', err)
      handleTaskUpdate() // resync on failure
    }
  }

  // Next position value = one past the current highest position
  const nextPosition = () =>
    tasks.reduce((max, t) => Math.max(max, t.position ?? 0), -1) + 1

  // Move a task one slot up or down within its heading group, then persist.
  // `orderedGroup` is the currently displayed (sorted) list for the heading.
  const moveTask = async (orderedGroup, index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= orderedGroup.length) return

    // Reorder within the heading group
    const reordered = [...orderedGroup]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    const heading = moved.heading

    // Rebuild the full tasks array: keep tasks from other headings in place,
    // but replace this heading's tasks with the newly-reordered slice.
    // We must preserve the relative position of the heading block inside the
    // full list, so we iterate tasks once and substitute in order.
    const reorderedIter = reordered[Symbol.iterator]()
    const updatedTasks = tasks.map((t) =>
      t.heading === heading ? reorderedIter.next().value : t
    )

    setTasks(updatedTasks)

    // Persist positions sequentially across all tasks
    try {
      await Promise.all(updatedTasks.map((t, i) => updateTask(t.id, { position: i })))
    } catch (err) {
      console.error('Error saving task order:', err)
      handleTaskUpdate() // resync on failure
    }
  }

  // Visual indent toggle (purely cosmetic; persisted via is_indented)
  const setIndent = async (taskId, value) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, is_indented: value } : t)))
    try {
      await updateTask(taskId, { is_indented: value })
    } catch (err) {
      console.error('Error saving indent:', err)
      handleTaskUpdate()
    }
  }

  // Group tasks by heading, sorted by heading order
  const tasksByHeading = {}
  const allHeadings = new Set()
  tasks.forEach((t) => {
    allHeadings.add(t.heading)
    if (!tasksByHeading[t.heading]) tasksByHeading[t.heading] = []
    tasksByHeading[t.heading].push(t)
  })

  // Sort headings: use saved order if available, else fall back to alphabetical
  const orderedHeadings = Array.from(allHeadings).sort((a, b) => {
    const orderA = headingOrders[a] ?? Infinity
    const orderB = headingOrders[b] ?? Infinity
    if (orderA !== Infinity || orderB !== Infinity) return orderA - orderB
    return a.localeCompare(b)
  })

  // Move a heading section up or down
  const moveHeading = async (headings, index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= headings.length) return

    const reordered = [...headings]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    // Update local state immediately so the UI re-renders without waiting for DB
    const newOrderMap = {}
    reordered.forEach((h, i) => { newOrderMap[h] = i })
    setHeadingOrders(newOrderMap)

    // Persist new order
    try {
      await saveHeadingOrder(memberId, weekId, reordered)
    } catch (err) {
      console.error('Error saving heading order:', err)
    }
  }

  // Calculate totals
  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const pendingCount = tasks.filter((t) => t.status === 'pending').length
  const onHoldCount = tasks.filter((t) => t.status === 'on-hold').length

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse mt-2"></div>
      </div>
    )

  return (
    <div className="max-w-4xl mx-auto">
      <CleanSweepPopup show={showSweep} onClose={() => setShowSweep(false)} />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {teamMember && week && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link to="/" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                  ← Back to Dashboard
                </Link>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{teamMember.name}</h1>
              <p className="text-lg text-gray-600">{getWeekLabelShort(week.week_start_date)}</p>
            </div>
            <button
              onClick={() => setShowAddProjectForm((v) => !v)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
            >
              {showAddProjectForm ? 'Cancel' : '+ Add Project'}
            </button>
          </div>

          {/* Add Project Form */}
          {showAddProjectForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-3">New Project</h3>
              {addMessage && (
                <p className="mb-3 text-sm text-red-600">{addMessage}</p>
              )}
              <form onSubmit={handleAddProject} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Project Name *</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Backend Development"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 font-medium"
                  >
                    Add Project
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddProjectForm(false); setAddMessage('') }}
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
              <p className="text-gray-500 mb-3">No projects or tasks for this week yet.</p>
              <button
                onClick={() => setShowAddProjectForm(true)}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                + Create the first project
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {orderedHeadings.map((heading, hIndex) => {
                const headingTasks = tasksByHeading[heading]
                return (
                <div key={heading} className="mb-10 last:mb-0">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col -my-1">
                        <button
                          onClick={() => moveHeading(orderedHeadings, hIndex, 'up')}
                          disabled={hIndex === 0}
                          className={`px-1 leading-none text-[10px] ${
                            hIndex > 0 ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                          }`}
                          title="Move section up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveHeading(orderedHeadings, hIndex, 'down')}
                          disabled={hIndex === orderedHeadings.length - 1}
                          className={`px-1 leading-none text-[10px] ${
                            hIndex < orderedHeadings.length - 1 ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                          }`}
                          title="Move section down"
                        >
                          ▼
                        </button>
                      </div>
                      <h2 className="text-base font-bold text-gray-900 tracking-wide">
                        {heading}
                      </h2>
                    </div>
                  </div>
                  <div className="space-y-0">
                    {headingTasks.map((task, index) => (
                      <Task
                        key={task.id}
                        task={task}
                        subtasks={subtaskMap[task.id] || []}
                        onTaskUpdate={handleTaskUpdate}
                        onDeleteTask={handleDeleteTask}
                        commentCount={commentCounts[task.id] || 0}
                        canMoveUp={index > 0}
                        canMoveDown={index < headingTasks.length - 1}
                        onMoveUp={() => moveTask(headingTasks, index, 'up')}
                        onMoveDown={() => moveTask(headingTasks, index, 'down')}
                        onIndent={() => setIndent(task.id, true)}
                        onOutdent={() => setIndent(task.id, false)}
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
                          onClick={openDatePicker}
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
                    {inlineHeading !== heading && (
                      <button
                        onClick={() => {
                          setInlineHeading(heading)
                          setInlineTask({ task_name: '', deadline: '', estimated_hours: '' })
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-4 pt-3 block w-full"
                        title={`Add task to ${heading}`}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
