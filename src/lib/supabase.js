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

// Bring incomplete tasks from the previous week into `week`, marked as
// carried-forward (purple). Idempotent — safe to call on every load.
//
// Rules:
//  • Only ever writes into the CURRENT week. We never modify a future week
//    (its previous week hasn't ended, so nothing is "incomplete by week's
//    end" yet) and never rewrite a past week (history stays as it was).
//    Both are enforced purely from the week's own end date vs. today.
//  • A task carries forward when it is NOT completed and NOT on hold. On-hold
//    tasks are intentionally parked and have their own (red) indicator, so we
//    leave them where they are. Empty heading-placeholder rows (blank
//    task_name) are skipped.
//  • Carried tasks reappear as a fresh 'pending' task with carry_forward_weeks
//    incremented — matching how the manual carry-forward toggle already marks
//    a task purple, and letting the "(Nw)" counter grow week over week.
//  • Subtasks are not copied (top-level weekly targets only).
async function carryForwardIntoWeek(week) {
  if (!week) return

  const today = isoToday()

  // Don't touch weeks that have already ended (past weeks). Comparing the
  // ISO end date string directly is valid.
  if (week.week_end_date < today) return

  // Find the immediately preceding week.
  const prevStart = isoAddDays(week.week_start_date, -7)
  const { data: prevWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('week_start_date', prevStart)
    .maybeSingle()

  if (!prevWeek) return

  // The previous week must have actually ended. This also prevents carrying
  // into a *future* week, whose previous week is the still-running current
  // week.
  if (!(prevWeek.week_end_date < today)) return

  if (carryForwardInFlight.has(week.id)) return
  carryForwardInFlight.add(week.id)

  try {
    // Top-level tasks from the previous week that didn't get finished.
    const { data: prevTasks, error: prevErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('week_id', prevWeek.id)
      .is('parent_task_id', null)

    if (prevErr) throw prevErr

    const carryable = (prevTasks || []).filter(
      (t) =>
        t.task_name &&
        t.task_name.trim() !== '' &&
        t.status !== 'completed' &&
        t.status !== 'on-hold'
    )

    if (carryable.length === 0) return

    // Existing top-level tasks already in the target week — used to dedupe so
    // repeat loads don't pile up copies.
    const { data: currTasks, error: currErr } = await supabase
      .from('tasks')
      .select('id, team_member_id, heading, task_name, position')
      .eq('week_id', week.id)
      .is('parent_task_id', null)

    if (currErr) throw currErr

    const dedupeKey = (memberId, heading, name) =>
      `${memberId}||${heading || ''}||${(name || '').trim().toLowerCase()}`

    const existingKeys = new Set(
      (currTasks || []).map((t) => dedupeKey(t.team_member_id, t.heading, t.task_name))
    )

    // Track the next position per member so carried tasks append cleanly.
    const maxPosByMember = {}
    for (const t of currTasks || []) {
      const p = t.position ?? 0
      if (maxPosByMember[t.team_member_id] === undefined || p > maxPosByMember[t.team_member_id]) {
        maxPosByMember[t.team_member_id] = p
      }
    }

    const toInsert = []
    for (const t of carryable) {
      const key = dedupeKey(t.team_member_id, t.heading, t.task_name)
      if (existingKeys.has(key)) continue
      existingKeys.add(key) // also dedupe within this batch

      const base = maxPosByMember[t.team_member_id] ?? -1
      const nextPos = base + 1
      maxPosByMember[t.team_member_id] = nextPos

      toInsert.push({
        team_member_id: t.team_member_id,
        week_id: week.id,
        heading: t.heading,
        task_name: t.task_name,
        deadline: t.deadline,
        estimated_hours: t.estimated_hours,
        status: 'pending',
        on_hold_reason: null,
        carry_forward_weeks: (t.carry_forward_weeks || 0) + 1,
        parent_task_id: null,
        position: nextPos,
      })
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('tasks').insert(toInsert)
      if (insErr) throw insErr
    }
  } finally {
    carryForwardInFlight.delete(week.id)
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
