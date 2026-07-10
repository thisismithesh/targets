import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  supabase,
  getSubtasks,
  getTeamMemberById,
  getWeekById,
  createTask,
  updateTask,
  deleteTask,
  recordCleanSweep,
  removeCleanSweep,
  getStarCount,
  getCommentCounts,
  getHeadingOrders,
  saveHeadingOrder,
  deleteProjectHeading,
  getProjects,
  ensureDeadlineReflections,
  getUpcomingLeavePlans,
  createLeavePlan,
  deleteLeavePlan,
  subscribeToChanges,
} from '../lib/supabase'
import Task from '../components/Task'
import CleanSweepPopup from '../components/CleanSweepPopup'
import Stars from '../components/Stars'
import { getWeekRangeLabel, formatDate, openDatePicker } from '../lib/utils'

const CUSTOM_PROJECT_OPTION = '__custom__'

export default function TeamMemberDetail() {
  const { memberId, weekId } = useParams()
  const [searchParams] = useSearchParams()
  const dashWeek = searchParams.get('dashWeek')
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
  const [projectOptions, setProjectOptions] = useState([])
  const [projectSelectValue, setProjectSelectValue] = useState('')

  // Leave plans
  const [leavePlans, setLeavePlans] = useState([])
  const [showAddLeaveForm, setShowAddLeaveForm] = useState(false)
  const [newLeave, setNewLeave] = useState({ start_date: '', end_date: '', reason: '' })
  const [leaveMessage, setLeaveMessage] = useState('')

  // Delete-project (heading) confirmation
  const [confirmDeleteHeading, setConfirmDeleteHeading] = useState(null)

  // Editing coordination: only one task's editor may be open at a time, and
  // none is open by default. `saveHandlersRef` lets us auto-save whatever
  // was in progress in a task before switching to another or clicking away.
  const [editingTaskId, setEditingTaskId] = useState(null)
  const saveHandlersRef = useRef({})
  const editingCardRef = useRef(null)

  const registerEditSave = (taskId, fn) => {
    saveHandlersRef.current[taskId] = fn
  }
  const unregisterEditSave = (taskId) => {
    delete saveHandlersRef.current[taskId]
  }

  const startEditingTask = async (taskId) => {
    if (editingTaskId && editingTaskId !== taskId) {
      const prevSave = saveHandlersRef.current[editingTaskId]
      if (prevSave) {
        try {
          await prevSave()
        } catch (err) {
          console.error('Error auto-saving previous edit:', err)
        }
      }
    }
    setEditingTaskId(taskId)
  }

  const stopEditingTask = (taskId) => {
    setEditingTaskId((curr) => (curr === taskId ? null : curr))
  }

  // Close (and auto-save) the open editor when clicking anywhere outside it.
  useEffect(() => {
    if (!editingTaskId) return
    const handleClickOutside = (e) => {
      if (editingCardRef.current && !editingCardRef.current.contains(e.target)) {
        const fn = saveHandlersRef.current[editingTaskId]
        if (fn) {
          Promise.resolve(fn()).catch((err) => console.error('Error saving on outside click:', err))
        }
        setEditingTaskId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingTaskId])

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

  // Reset the editor when navigating to a different member/week.
  useEffect(() => {
    setEditingTaskId(null)
    saveHandlersRef.current = {}
  }, [memberId, weekId])

  // Admin-managed project name suggestions for the "Add Project" dropdown.
  const loadProjectOptions = async () => {
    try {
      setProjectOptions(await getProjects())
    } catch (e) {
      console.error('Error loading projects:', e)
    }
  }

  useEffect(() => {
    loadProjectOptions()
  }, [])

  const loadLeavePlans = async () => {
    try {
      setLeavePlans(await getUpcomingLeavePlans(memberId))
    } catch (e) {
      console.error('Error loading leave plans:', e)
    }
  }

  useEffect(() => {
    if (memberId) loadLeavePlans()
  }, [memberId])

  const handleAddLeave = async (e) => {
    e.preventDefault()
    if (!newLeave.start_date || !newLeave.end_date) {
      setLeaveMessage('Please pick both a start and end date')
      return
    }
    if (newLeave.end_date < newLeave.start_date) {
      setLeaveMessage('End date must be on or after the start date')
      return
    }
    try {
      await createLeavePlan(memberId, newLeave.start_date, newLeave.end_date, newLeave.reason)
      setNewLeave({ start_date: '', end_date: '', reason: '' })
      setLeaveMessage('')
      setShowAddLeaveForm(false)
      await loadLeavePlans()
    } catch (err) {
      setLeaveMessage('Error adding leave plan')
      console.error(err)
    }
  }

  const handleDeleteLeave = async (leaveId) => {
    setLeavePlans((prev) => prev.filter((l) => l.id !== leaveId))
    try {
      await deleteLeavePlan(leaveId)
    } catch (err) {
      console.error('Error deleting leave plan:', err)
      loadLeavePlans() // resync on failure
    }
  }

  // Does this leave plan overlap the week currently being viewed?
  const leaveOverlapsCurrentWeek = (leave) =>
    !!week && leave.start_date <= week.week_end_date && leave.end_date >= week.week_start_date

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

  // A clean sweep = at least one non-on-hold task and every non-on-hold task completed.
  const computeSwept = (list) => {
    const actionable = list.filter((t) => t.status !== 'on-hold')
    return actionable.length > 0 && actionable.every((t) => t.status === 'completed')
  }

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

  const refreshHeadingOrders = async () => {
    try {
      const orders = await getHeadingOrders(memberId, weekId)
      const orderMap = {}
      orders.forEach((o) => { orderMap[o.heading] = o.position })
      setHeadingOrders(orderMap)
    } catch (e) {
      console.error('Error refreshing heading order:', e)
    }
  }

  // Live-sync: reflect changes made on other devices/tabs without needing
  // a manual page refresh.
  useEffect(() => {
    if (!memberId || !weekId) return
    const unsubscribe = subscribeToChanges(
      `team-member-${memberId}-${weekId}`,
      [
        { table: 'tasks', filter: `team_member_id=eq.${memberId}` },
        { table: 'task_comments' },
        { table: 'clean_sweeps', filter: `team_member_id=eq.${memberId}` },
        { table: 'heading_orders', filter: `team_member_id=eq.${memberId}` },
        { table: 'project_options' },
        { table: 'leave_plans', filter: `team_member_id=eq.${memberId}` },
      ],
      () => {
        handleTaskUpdate()
        refreshHeadingOrders()
        loadProjectOptions()
        loadLeavePlans()
      }
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, weekId])

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
        // Open the new (blank) task's editor right away so the user can name
        // it — this is an explicit user action, not something opened by
        // default on page load.
        startEditingTask(created.id)
      }
      setNewProjectName('')
      setProjectSelectValue('')
      setAddMessage('')
      setShowAddProjectForm(false)
    } catch (err) {
      setAddMessage('Error adding project')
      console.error(err)
    }
  }

  const handleProjectSelectChange = (e) => {
    const val = e.target.value
    setProjectSelectValue(val)
    setNewProjectName(val === CUSTOM_PROJECT_OPTION ? '' : val)
  }

  // Delete an entire project (heading) and all of its tasks for this week.
  const handleDeleteProject = async (heading) => {
    // Optimistic UI removal
    const removedIds = tasks.filter((t) => t.heading === heading).map((t) => t.id)
    setTasks((prev) => prev.filter((t) => t.heading !== heading))
    setSubtaskMap((prev) => {
      const next = { ...prev }
      removedIds.forEach((id) => delete next[id])
      return next
    })
    setConfirmDeleteHeading(null)
    try {
      await deleteProjectHeading(memberId, weekId, heading)
    } catch (err) {
      console.error('Error deleting project:', err)
      handleTaskUpdate() // resync on failure
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
        if (created.deadline) {
          ensureDeadlineReflections(created).catch((e) =>
            console.error('Error syncing deadline reflections:', e)
          )
        }
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
    if (editingTaskId === taskId) setEditingTaskId(null)
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

  // Sort headings: honor the user's saved order if present; otherwise the
  // default 'Internal' project sits at the bottom and everything else stays
  // alphabetical. (Keep 'Internal' in sync with INTERNAL_PROJECT in supabase.js.)
  const INTERNAL_PROJECT = 'Internal'
  const orderedHeadings = Array.from(allHeadings).sort((a, b) => {
    const orderA = headingOrders[a]
    const orderB = headingOrders[b]
    const hasA = orderA !== undefined
    const hasB = orderB !== undefined

    // Both explicitly ordered → honor it fully (lets a user move 'Internal').
    if (hasA && hasB) return orderA - orderB
    // An explicitly-ordered heading always precedes an unordered one.
    if (hasA) return -1
    if (hasB) return 1

    // Neither ordered: pin 'Internal' last, rest alphabetical.
    if (a === INTERNAL_PROJECT && b !== INTERNAL_PROJECT) return 1
    if (b === INTERNAL_PROJECT && a !== INTERNAL_PROJECT) return -1
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
  const carryForwardCount = tasks.filter((t) => (t.carry_forward_weeks || 0) > 0).length

  if (isLoading)
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse mt-2"></div>
      </div>
    )

  return (
    <div className="max-w-6xl mx-auto">
      <CleanSweepPopup show={showSweep} onClose={() => setShowSweep(false)} />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {teamMember && week && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Sidebar */}
          <aside className="w-full lg:w-80 flex-shrink-0 space-y-6 lg:sticky lg:top-6">
            <div>
              <Link to={dashWeek ? `/?week=${dashWeek}` : '/'} className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                ← Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 mt-3">
                <span>{teamMember.name}</span>
                <Stars count={starCount} />
              </h1>
              <p className="text-lg text-gray-600 mt-1">{getWeekRangeLabel(week.week_start_date, week.week_end_date)}</p>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => setShowAddProjectForm((v) => !v)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
                >
                  {showAddProjectForm ? 'Cancel' : '+ Add Project'}
                </button>
                <button
                  onClick={() => { setShowAddLeaveForm((v) => !v); setLeaveMessage('') }}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm"
                >
                  {showAddLeaveForm ? 'Cancel' : '+ Add Leave'}
                </button>
              </div>
            </div>

            {/* Leave Plans */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Leave Plans</h3>

            {showAddLeaveForm && (
              <form onSubmit={handleAddLeave} className="mb-4 p-3 bg-gray-50 rounded-md space-y-3">
                {leaveMessage && <p className="text-sm text-red-600">{leaveMessage}</p>}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                    <input
                      type="date"
                      value={newLeave.start_date}
                      onChange={(e) => setNewLeave({ ...newLeave, start_date: e.target.value })}
                      className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={newLeave.end_date}
                      onChange={(e) => setNewLeave({ ...newLeave, end_date: e.target.value })}
                      className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    value={newLeave.reason}
                    onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                    className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Vacation"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 font-medium"
                >
                  Save
                </button>
              </form>
            )}

            {leavePlans.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming leave plans.</p>
            ) : (
              <div className="space-y-2">
                {leavePlans.map((leave) => {
                  const isThisWeek = leaveOverlapsCurrentWeek(leave)
                  return (
                    <div
                      key={leave.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-md text-sm ${
                        isThisWeek ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'
                      }`}
                    >
                      <span className="min-w-0">
                        {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                        {leave.reason ? ` · ${leave.reason}` : ''}
                        {isThisWeek && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-800">
                            This week
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => handleDeleteLeave(leave.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Progress</h3>
            {(() => {
              const total = completedCount + pendingCount + onHoldCount
              const pct = (n) => (total > 0 ? (n / total) * 100 : 0)
              return (
                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mb-5">
                  <div className="bg-green-500" style={{ width: `${pct(completedCount)}%` }} />
                  <div className="bg-yellow-500" style={{ width: `${pct(pendingCount)}%` }} />
                  <div className="bg-red-500" style={{ width: `${pct(onHoldCount)}%` }} />
                </div>
              )
            })()}
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-green-600 font-medium">Completed</span>
                <span className="text-gray-900 font-semibold">{completedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-yellow-600 font-medium">Pending</span>
                <span className="text-gray-900 font-semibold">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-red-600 font-medium">On Hold</span>
                <span className="text-gray-900 font-semibold">{onHoldCount}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 mt-1 flex items-center justify-between">
                <span className="text-purple-600 font-medium">Carry Forwards</span>
                <span className="text-gray-900 font-semibold">{carryForwardCount}</span>
              </div>
            </div>
          </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 w-full space-y-6">

          {/* Add Project Form */}
          {showAddProjectForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-3">New Project</h3>
              {addMessage && (
                <p className="mb-3 text-sm text-red-600">{addMessage}</p>
              )}
              <form onSubmit={handleAddProject} className="space-y-3">
                <div>
                  <select
                    value={projectSelectValue}
                    onChange={handleProjectSelectChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    autoFocus
                  >
                    <option value="">Select a project…</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                    <option value={CUSTOM_PROJECT_OPTION}>+ Custom project name…</option>
                  </select>

                  {(projectSelectValue === CUSTOM_PROJECT_OPTION || projectOptions.length === 0) && (
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Backend Development"
                    />
                  )}
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
                    onClick={() => { setShowAddProjectForm(false); setAddMessage(''); setProjectSelectValue(''); setNewProjectName('') }}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

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

                    {confirmDeleteHeading === heading ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-500">Delete project & its tasks?</span>
                        <button
                          onClick={() => handleDeleteProject(heading)}
                          className="px-2 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 font-medium"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteHeading(null)}
                          className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteHeading(heading)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0"
                        title="Delete this project and all its tasks"
                      >
                        Delete Project
                      </button>
                    )}
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
                        editingTaskId={editingTaskId}
                        onStartEdit={startEditingTask}
                        onStopEdit={stopEditingTask}
                        onRegisterSave={registerEditSave}
                        onUnregisterSave={unregisterEditSave}
                        editingCardRef={editingCardRef}
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
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-4 pt-3 block"
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
          </main>
        </div>
      )}
    </div>
  )
}
