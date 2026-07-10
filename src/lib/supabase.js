import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to get all tasks for a week
export async function getWeeklyTasks(weekId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('week_id', weekId)
    .is('parent_task_id', null)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

// Helper function to get subtasks for a task
export async function getSubtasks(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('parent_task_id', taskId)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

// Helper function to get team members (ordered by position, then name)
export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('position', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) throw error
  return data
}

// Helper function to get current week
export async function getCurrentWeek() {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('weeks')
    .select('*')
    .lte('week_start_date', today)
    .gte('week_end_date', today)
    .single()

  if (error) throw error
  return data
}

// Helper function to get week by ID
export async function getWeekById(weekId) {
  const { data, error } = await supabase
    .from('weeks')
    .select('*')
    .eq('id', weekId)
    .single()

  if (error) throw error
  return data
}

// ── Date helpers (timezone-safe, operate on 'YYYY-MM-DD' strings) ─────
// Add (or subtract) whole days to an ISO date string without drifting
// across timezones. ISO date strings also compare correctly with < / >=,
// which we rely on below.
function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Monday (YYYY-MM-DD) of the week containing the given ISO date string.
function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Today's local date as 'YYYY-MM-DD'.
function isoToday() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Default 'Internal' project ───────────────────────────────────────
// Name of the default project (heading) added to every member's week.
// NOTE: this exact string is also pinned to the bottom of the project list
// in TeamMemberDetail.jsx — keep the two in sync.
export const INTERNAL_PROJECT = 'Internal'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Default career-journal task name for a given week start date (YYYY-MM-DD),
// e.g. 'Career progress journal for Week 2 of Jan'. The week number matches
// getWeekLabelShort(): ceil(day-of-month / 7) of the week's Monday.
export function internalJournalTaskName(weekStartDate) {
  const [, month, day] = weekStartDate.split('-').map((n) => parseInt(n, 10))
  const weekNumber = Math.ceil(day / 7)
  const monthName = MONTH_ABBR[month - 1] || ''
  return `Career progress journal for Week ${weekNumber} of ${monthName}`
}

// Guard against the same week being processed twice concurrently within a
// single tab (e.g. React StrictMode double-invokes effects in dev, or a
// rapid refresh). Without a DB unique constraint this is the cheap way to
// avoid inserting duplicate carried-forward tasks from overlapping runs.
const carryForwardInFlight = new Set()

// Helper: get or create a week by its Monday start date (YYYY-MM-DD)
export async function getOrCreateWeek(weekStartDate) {
  // weekStartDate must be a Monday in 'YYYY-MM-DD' format
  const weekEndDate = isoAddDays(weekStartDate, 6)

  // Try to fetch first
  const { data: existing } = await supabase
    .from('weeks')
    .select('*')
    .eq('week_start_date', weekStartDate)
    .maybeSingle()

  let week = existing

  if (!week) {
    // Create if missing
    const { data, error } = await supabase
      .from('weeks')
      .insert([{ week_start_date: weekStartDate, week_end_date: weekEndDate }])
      .select()
      .single()

    if (error) throw error
    week = data
  }

  // Ensure every team member has the default 'Internal' project + weekly
  // career-journal task for this week. Best-effort; runs before carry-forward
  // so the default task exists first.
  try {
    await ensureInternalProjectForWeek(week)
  } catch (err) {
    console.error('Ensure Internal project failed:', err)
  }

  // Auto carry-forward any unfinished tasks from the previous week into the
  // current week. Best-effort: a failure here must never block loading the
  // week, so we swallow errors after logging them.
  try {
    await carryForwardIntoWeek(week)
  } catch (err) {
    console.error('Carry-forward failed:', err)
  }

  return week
}

// Build an insert row that copies a task, preserving the data that should
// travel with a carry-forward: status (incl. on-hold + reason), position
// (order), the visual indent flag, deadline and hours. `overrides` sets the
// destination week, parent link and source pointer.
function copyTaskRow(src, overrides) {
  // Preserve on-hold; anything else carries as pending (purple via the
  // incremented carry_forward_weeks). 'completed' tasks are filtered out
  // before we ever get here.
  const status = src.status === 'on-hold' ? 'on-hold' : 'pending'
  return {
    team_member_id: src.team_member_id,
    week_id: src.week_id,
    heading: src.heading,
    task_name: src.task_name,
    deadline: src.deadline ?? null,
    completed_date: null,
    estimated_hours: src.estimated_hours ?? null,
    status,
    on_hold_reason: status === 'on-hold' ? (src.on_hold_reason ?? null) : null,
    carry_forward_weeks: (src.carry_forward_weeks || 0) + 1,
    parent_task_id: src.parent_task_id ?? null,
    position: src.position ?? 0,
    is_indented: src.is_indented ?? false,
    carried_from_task_id: null,
    carried_forward: false,
    ...overrides,
  }
}

// Copy task comments from source tasks onto their newly-created copies.
// `sourceToNew` maps a source task id → the new task id.
async function copyCommentsForTasks(sourceToNew) {
  const sourceIds = [...sourceToNew.keys()]
  if (sourceIds.length === 0) return
  const { data: comments } = await supabase
    .from('task_comments')
    .select('task_id, body, created_at')
    .in('task_id', sourceIds)
  if (!comments || comments.length === 0) return
  const rows = comments.map((c) => ({
    task_id: sourceToNew.get(c.task_id),
    body: c.body,
    created_at: c.created_at,
  }))
  await supabase.from('task_comments').insert(rows)
}

// Carry-forward orchestrator. Runs only for the CURRENT week (its previous
// week has ended and this week hasn't), so we never rewrite history or
// pre-fill future weeks. Two passes:
//   1. removeResolvedCarryForwards — drop copies whose source got completed.
//   2. createCarryForwards         — copy still-unfinished source tasks across
//                                    (once each), with order, indent, on-hold
//                                    state, subtasks and comments preserved.
async function carryForwardIntoWeek(week) {
  if (!week) return

  const today = isoToday()
  if (week.week_end_date < today) return // past week → leave history alone

  const prevStart = isoAddDays(week.week_start_date, -7)
  const { data: prevWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('week_start_date', prevStart)
    .maybeSingle()

  if (!prevWeek) return
  if (!(prevWeek.week_end_date < today)) return // prev hasn't ended → too early

  if (carryForwardInFlight.has(week.id)) return
  carryForwardInFlight.add(week.id)
  try {
    await removeResolvedCarryForwards(week)
    await createCarryForwards(week, prevWeek)
  } finally {
    carryForwardInFlight.delete(week.id)
  }
}

// Pass 1 — if a carried copy's source task has since been completed, remove
// the copy (it shouldn't keep nagging this week). The source is then un-marked
// so that re-opening it later will carry it forward again. Copies the user has
// already completed themselves are left untouched. If a source was deleted
// outright, the copy is left in place as an independent task.
async function removeResolvedCarryForwards(week) {
  const { data: copies } = await supabase
    .from('tasks')
    .select('id, status, carried_from_task_id')
    .eq('week_id', week.id)
    .not('carried_from_task_id', 'is', null)

  if (!copies || copies.length === 0) return

  const sourceIds = [...new Set(copies.map((c) => c.carried_from_task_id))]
  const { data: sources } = await supabase
    .from('tasks')
    .select('id, status')
    .in('id', sourceIds)
  const sourceStatus = new Map((sources || []).map((s) => [s.id, s.status]))

  const toDelete = []
  const sourcesToReopen = []
  for (const c of copies) {
    if (sourceStatus.get(c.carried_from_task_id) === 'completed' && c.status !== 'completed') {
      toDelete.push(c.id)
      sourcesToReopen.push(c.carried_from_task_id)
    }
  }
  if (toDelete.length === 0) return

  // Clean up comments on the copies (and any of their subtasks) first, then
  // delete the copies — subtasks cascade via parent_task_id.
  const { data: subs } = await supabase.from('tasks').select('id').in('parent_task_id', toDelete)
  const commentTaskIds = [...toDelete, ...(subs || []).map((s) => s.id)]
  await supabase.from('task_comments').delete().in('task_id', commentTaskIds)
  await supabase.from('tasks').delete().in('id', toDelete)
  await supabase
    .from('tasks')
    .update({ carried_forward: false })
    .in('id', [...new Set(sourcesToReopen)])
}

// Pass 2 — copy each still-unfinished top-level source task into this week
// exactly once. The one-time guard (`carried_forward` on the source) is what
// lets a user delete a carried task without it reappearing on the next load.
async function createCarryForwards(week, prevWeek) {
  const { data: prevTop } = await supabase
    .from('tasks')
    .select('*')
    .eq('week_id', prevWeek.id)
    .is('parent_task_id', null)

  const carryable = (prevTop || []).filter(
    (s) =>
      s.task_name &&
      s.task_name.trim() !== '' &&
      s.status !== 'completed' &&
      !s.carried_forward // not yet carried (or re-opened after completion)
  )
  if (carryable.length === 0) return

  // Existing top-level tasks in this week, for de-duplication / adoption.
  const { data: currTop } = await supabase
    .from('tasks')
    .select('id, team_member_id, heading, task_name, carry_forward_weeks, carried_from_task_id')
    .eq('week_id', week.id)
    .is('parent_task_id', null)

  const keyOf = (m, h, n) => `${m}||${h || ''}||${(n || '').trim().toLowerCase()}`
  const existingByKey = new Map()
  for (const t of currTop || []) existingByKey.set(keyOf(t.team_member_id, t.heading, t.task_name), t)

  const sourcesToCreate = []
  const adoptions = [] // { taskId, sourceId } — link pre-existing copies
  const flagDone = []  // source ids to mark carried_forward = true

  for (const s of carryable) {
    flagDone.push(s.id)
    const existing = existingByKey.get(keyOf(s.team_member_id, s.heading, s.task_name))
    if (existing) {
      // A carried copy already here but not linked (e.g. from an older
      // version) → adopt it so completion/removal can track it.
      if ((existing.carry_forward_weeks || 0) > 0 && !existing.carried_from_task_id) {
        adoptions.push({ taskId: existing.id, sourceId: s.id })
      }
      continue // don't duplicate
    }
    sourcesToCreate.push(s)
  }

  // 1) Insert the new top-level copies and map source id → new id.
  const newBySource = new Map()
  if (sourcesToCreate.length) {
    const rows = sourcesToCreate.map((s) =>
      copyTaskRow(s, { week_id: week.id, parent_task_id: null, carried_from_task_id: s.id })
    )
    const { data: inserted } = await supabase
      .from('tasks')
      .insert(rows)
      .select('id, carried_from_task_id')
    for (const r of inserted || []) newBySource.set(r.carried_from_task_id, r.id)
  }

  // 2) Carry subtasks of those newly-created parents.
  if (newBySource.size) {
    const parentSourceIds = [...newBySource.keys()]
    const { data: subSrc } = await supabase
      .from('tasks')
      .select('*')
      .in('parent_task_id', parentSourceIds)

    if (subSrc && subSrc.length) {
      const subRows = subSrc.map((ss) =>
        copyTaskRow(ss, {
          week_id: week.id,
          parent_task_id: newBySource.get(ss.parent_task_id),
          carried_from_task_id: ss.id,
        })
      )
      const { data: insertedSubs } = await supabase
        .from('tasks')
        .insert(subRows)
        .select('id, carried_from_task_id')
      for (const r of insertedSubs || []) newBySource.set(r.carried_from_task_id, r.id)
    }

    // 3) Carry comments for every copied task (parents + subtasks).
    await copyCommentsForTasks(newBySource)
  }

  // Link any adopted copies.
  for (const a of adoptions) {
    await supabase.from('tasks').update({ carried_from_task_id: a.sourceId }).eq('id', a.taskId)
  }

  // Mark all processed sources so they aren't carried again (this is what
  // makes a user's deletion of a carried task stick).
  if (flagDone.length) {
    await supabase.from('tasks').update({ carried_forward: true }).in('id', flagDone)
  }
}

// In-tab guard so the default project isn't inserted twice by overlapping
// loads (React StrictMode double-invoke, rapid refresh, etc.).
const internalProjectInFlight = new Set()

// Ensure every team member has the default 'Internal' project containing the
// weekly career-journal task for `week`. Idempotent — safe to call on every
// load. Applies to the current and future weeks only; past (already-ended)
// weeks are left untouched so historical records and clean-sweep stars aren't
// disturbed.
async function ensureInternalProjectForWeek(week) {
  if (!week) return

  // Don't backfill weeks that have already ended.
  if (week.week_end_date < isoToday()) return

  if (internalProjectInFlight.has(week.id)) return
  internalProjectInFlight.add(week.id)

  try {
    const members = await getTeamMembers()
    if (!members || members.length === 0) return

    const journalName = internalJournalTaskName(week.week_start_date)

    // All existing top-level tasks for this week: used to (a) detect which
    // members already have the journal task, and (b) find each member's
    // current max position so the new task lands at the bottom of their list.
    const { data: existingTasks, error: exErr } = await supabase
      .from('tasks')
      .select('team_member_id, heading, task_name, position')
      .eq('week_id', week.id)
      .is('parent_task_id', null)

    if (exErr) throw exErr

    const haveJournal = new Set()
    const maxPosByMember = {}
    for (const t of existingTasks || []) {
      if (t.heading === INTERNAL_PROJECT && t.task_name === journalName) {
        haveJournal.add(t.team_member_id)
      }
      const p = t.position ?? 0
      if (maxPosByMember[t.team_member_id] === undefined || p > maxPosByMember[t.team_member_id]) {
        maxPosByMember[t.team_member_id] = p
      }
    }

    const toInsert = []
    for (const member of members) {
      if (haveJournal.has(member.id)) continue
      const nextPos = (maxPosByMember[member.id] ?? -1) + 1
      toInsert.push({
        team_member_id: member.id,
        week_id: week.id,
        heading: INTERNAL_PROJECT,
        task_name: journalName,
        deadline: null,
        estimated_hours: null,
        status: 'pending',
        on_hold_reason: null,
        carry_forward_weeks: 0,
        parent_task_id: null,
        position: nextPos,
      })
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('tasks').insert(toInsert)
      if (insErr) throw insErr
    }
  } finally {
    internalProjectInFlight.delete(week.id)
  }
}

// Helper: get all weeks ordered by date (for navigation)
export async function getAllWeeks() {
  const { data, error } = await supabase
    .from('weeks')
    .select('*')
    .order('week_start_date', { ascending: false })

  if (error) throw error
  return data || []
}

// Helper function to calculate total estimated hours
export async function getTotalEstimatedHours(teamMemberId, weekId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('estimated_hours')
    .eq('team_member_id', teamMemberId)
    .eq('week_id', weekId)
    .is('parent_task_id', null)

  if (error) throw error

  return (data || []).reduce((total, task) => {
    return total + (task.estimated_hours || 0)
  }, 0)
}

// Helper function to create a task
export async function createTask(taskData) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([taskData])
    .select()

  if (error) throw error
  return data?.[0]
}

// Helper function to update a task
export async function updateTask(taskId, updates) {
  console.log(`🔄 Updating task ${taskId}:`, updates)
  
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)

  if (error) {
    console.error(`❌ Error updating task ${taskId}:`, error)
    throw error
  }
  
  console.log(`✅ Task ${taskId} updated successfully`)
  return data
}

// Helper function to delete a task
export async function deleteTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw error
}

// Helper function to create a team member
export async function createTeamMember(memberData) {
  const { data, error } = await supabase
    .from('team_members')
    .insert([memberData])
    .select()

  if (error) throw error
  return data?.[0]
}

// Helper function to get team member by ID
export async function getTeamMemberById(memberId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (error) throw error
  return data
}

// Helper function to update a team member
export async function updateTeamMember(memberId, updates) {
  const { data, error } = await supabase
    .from('team_members')
    .update(updates)
    .eq('id', memberId)

  if (error) throw error
  return data
}

// Helper function to delete a team member
export async function deleteTeamMember(memberId) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)

  if (error) throw error
}

// Helper function to save team member positions
export async function saveTeamMemberPositions(members) {
  try {
    // Update each member's position individually
    const updatePromises = members.map((member, index) =>
      updateTeamMember(member.id, { position: index })
    )
    
    await Promise.all(updatePromises)
  } catch (error) {
    console.error('Supabase error:', error)
    throw error
  }
}

// ── Clean sweeps (stars) ───────────────────────────────────────────
// A "clean sweep" = a member completed all tasks in a given week.
// One row per (team_member_id, week_id); unique so a week grants one star.

// Record a clean sweep. Uses upsert so repeat detections are no-ops.
export async function recordCleanSweep(teamMemberId, weekId) {
  const { data, error } = await supabase
    .from('clean_sweeps')
    .upsert(
      { team_member_id: teamMemberId, week_id: weekId },
      { onConflict: 'team_member_id,week_id', ignoreDuplicates: true }
    )
    .select()

  if (error) throw error
  return data
}

// Remove a clean sweep (e.g. a previously-swept week is no longer complete).
export async function removeCleanSweep(teamMemberId, weekId) {
  const { error } = await supabase
    .from('clean_sweeps')
    .delete()
    .eq('team_member_id', teamMemberId)
    .eq('week_id', weekId)

  if (error) throw error
}

// Star count for a single member.
export async function getStarCount(teamMemberId) {
  const { count, error } = await supabase
    .from('clean_sweeps')
    .select('*', { count: 'exact', head: true })
    .eq('team_member_id', teamMemberId)

  if (error) throw error
  return count || 0
}

// Star counts for all members → { [team_member_id]: count }.
export async function getStarCounts() {
  const { data, error } = await supabase
    .from('clean_sweeps')
    .select('team_member_id')

  if (error) throw error
  const counts = {}
  for (const row of data || []) {
    counts[row.team_member_id] = (counts[row.team_member_id] || 0) + 1
  }
  return counts
}

// ── Task comments ───────────────────────────────────────────────────
export async function getTaskComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function addTaskComment(taskId, body) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert([{ task_id: taskId, body }])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTaskComment(commentId) {
  const { error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', commentId)

  if (error) throw error
}

// Comment counts for a set of task ids → { [task_id]: count }
export async function getCommentCounts(taskIds) {
  if (!taskIds || taskIds.length === 0) return {}
  const { data, error } = await supabase
    .from('task_comments')
    .select('task_id')
    .in('task_id', taskIds)

  if (error) throw error
  const counts = {}
  for (const row of data || []) {
    counts[row.task_id] = (counts[row.task_id] || 0) + 1
  }
  return counts
}

// ── Heading order ───────────────────────────────────────────────────
export async function getHeadingOrders(teamMemberId, weekId) {
  const { data, error } = await supabase
    .from('heading_orders')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .eq('week_id', weekId)

  if (error) throw error
  return data || []
}

// Persist the full ordering for a member+week's headings.
export async function saveHeadingOrder(teamMemberId, weekId, orderedHeadings) {
  const rows = orderedHeadings.map((heading, i) => ({
    team_member_id: teamMemberId,
    week_id: weekId,
    heading,
    position: i,
  }))
  const { error } = await supabase
    .from('heading_orders')
    .upsert(rows, { onConflict: 'team_member_id,week_id,heading' })

  if (error) throw error
}

// ── Delete a project (heading) and all its tasks ────────────────────
// Removes every top-level task under `heading` for this member+week.
// Subtasks cascade automatically via the parent_task_id FK.
export async function deleteProjectHeading(teamMemberId, weekId, heading) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('team_member_id', teamMemberId)
    .eq('week_id', weekId)
    .eq('heading', heading)
    .is('parent_task_id', null)

  if (error) throw error

  // Best-effort cleanup of the saved heading order/position for this heading.
  try {
    await supabase
      .from('heading_orders')
      .delete()
      .eq('team_member_id', teamMemberId)
      .eq('week_id', weekId)
      .eq('heading', heading)
  } catch (e) {
    console.error('Error cleaning up heading order:', e)
  }
}

// ── Deadline reflections ─────────────────────────────────────────────
// If a task's deadline falls in a week later than the week it lives in,
// mirror a lightweight linked copy of it into every week in between (up to
// and including the deadline's week), so the upcoming deadline stays
// visible while the team member works toward it. Reflections are linked
// back to their source task via `deadline_reflection_source_id` and are
// removed automatically (DB cascade) if the source task is deleted.
//
// Call this after creating/updating a task whose deadline may have changed.
// It's a no-op (and cleans up any stale reflections) for tasks that are
// on-hold, completed, have no deadline, or are themselves a reflection.
export async function ensureDeadlineReflections(task) {
  if (!task || !task.id) return
  if (task.deadline_reflection_source_id) return // never cascade from a reflection

  const shouldHaveNoReflections =
    !task.deadline ||
    task.status === 'on-hold' ||
    task.status === 'completed' ||
    !task.task_name ||
    !task.task_name.trim()

  if (shouldHaveNoReflections) {
    try {
      await removeDeadlineReflections(task.id)
    } catch (e) {
      console.error('Error clearing deadline reflections:', e)
    }
    return
  }

  try {
    const taskWeek = await getWeekById(task.week_id)
    if (!taskWeek) return

    const deadlineMonday = mondayOf(task.deadline)

    if (deadlineMonday <= taskWeek.week_start_date) {
      // Deadline no longer stretches into a later week.
      await removeDeadlineReflections(task.id)
      return
    }

    // Every Monday strictly after the task's own week, up to and including
    // the deadline's week.
    const targetWeekStarts = []
    let cursor = isoAddDays(taskWeek.week_start_date, 7)
    while (cursor <= deadlineMonday) {
      targetWeekStarts.push(cursor)
      cursor = isoAddDays(cursor, 7)
    }

    const { data: existingReflections } = await supabase
      .from('tasks')
      .select('id, week_id')
      .eq('deadline_reflection_source_id', task.id)

    const existingByWeekId = new Map((existingReflections || []).map((r) => [r.week_id, r.id]))
    const wantedWeekIds = new Set()

    for (const weekStart of targetWeekStarts) {
      const w = await getOrCreateWeek(weekStart)
      wantedWeekIds.add(w.id)
      if (!existingByWeekId.has(w.id)) {
        await supabase.from('tasks').insert([{
          team_member_id: task.team_member_id,
          week_id: w.id,
          heading: task.heading,
          task_name: task.task_name,
          deadline: task.deadline,
          estimated_hours: task.estimated_hours ?? null,
          status: 'pending',
          parent_task_id: null,
          position: 0,
          deadline_reflection_source_id: task.id,
        }])
      } else {
        // Keep the reflection's display fields in sync with the source.
        await supabase
          .from('tasks')
          .update({
            task_name: task.task_name,
            heading: task.heading,
            estimated_hours: task.estimated_hours ?? null,
            deadline: task.deadline,
          })
          .eq('id', existingByWeekId.get(w.id))
      }
    }

    // Drop reflections in weeks we no longer need (e.g. deadline moved earlier).
    const staleIds = (existingReflections || [])
      .filter((r) => !wantedWeekIds.has(r.week_id))
      .map((r) => r.id)
    if (staleIds.length) {
      await supabase.from('tasks').delete().in('id', staleIds)
    }
  } catch (err) {
    console.error('ensureDeadlineReflections failed:', err)
  }
}

// Remove every reflection copy generated from a given source task.
export async function removeDeadlineReflections(sourceTaskId) {
  if (!sourceTaskId) return
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('deadline_reflection_source_id', sourceTaskId)
  if (error) throw error
}

// ── Projects (admin-managed dropdown list) ───────────────────────────
// A simple named list that populates the "Add Project" dropdown when
// creating a project/heading on a team member's week. Managed from the
// Admin panel; users can still type a custom name outside this list.
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createProject(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('Project name is required')

  const { data, error } = await supabase
    .from('projects')
    .insert([{ name: trimmed }])
    .select()

  if (error) throw error
  return data?.[0]
}

export async function deleteProject(projectId) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
}

// ── Realtime ──────────────────────────────────────────────────────────
// Subscribe to Postgres changes (insert/update/delete) on one or more
// tables and invoke `onChange` whenever any of them fire. Returns an
// unsubscribe function to call on cleanup (e.g. in a useEffect return).
//
// NOTE: Realtime must be enabled for these tables in the Supabase project
// (Database → Replication → supabase_realtime), e.g.:
//   ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
// See supabase-migration-v2.sql for the full list.
export function subscribeToChanges(channelName, subscriptions, onChange) {
  const channel = supabase.channel(channelName)
  subscriptions.forEach(({ table, filter }) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      onChange
    )
  })
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
