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

// Helper: get or create a week by its Monday start date (YYYY-MM-DD)
export async function getOrCreateWeek(weekStartDate) {
  // weekStartDate must be a Monday in 'YYYY-MM-DD' format
  const d = new Date(weekStartDate)
  const endDate = new Date(d)
  endDate.setDate(d.getDate() + 6)
  const weekEndDate = endDate.toISOString().split('T')[0]

  // Try to fetch first
  const { data: existing } = await supabase
    .from('weeks')
    .select('*')
    .eq('week_start_date', weekStartDate)
    .maybeSingle()

  if (existing) return existing

  // Create if missing
  const { data, error } = await supabase
    .from('weeks')
    .insert([{ week_start_date: weekStartDate, week_end_date: weekEndDate }])
    .select()
    .single()

  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()

  if (error) throw error
  return data?.[0]
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
