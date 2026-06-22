import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to get all tasks for current week
export async function getWeeklyTasks(weekId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('week_id', weekId)
    .is('parent_task_id', null) // Only main tasks
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

// Helper function to get team members
export async function getTeamMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
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
