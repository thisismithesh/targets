import { useState, useEffect } from 'react'
import { supabase, getTeamMembers, getCurrentWeek, createTeamMember, createTask } from '../lib/supabase'

export default function AdminPanel() {
  const [teamMembers, setTeamMembers] = useState([])
  const [currentWeek, setCurrentWeek] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [newTask, setNewTask] = useState({
    task_name: '',
    heading: 'General',
    deadline: '',
    estimated_hours: '',
  })
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const members = await getTeamMembers()
      setTeamMembers(members)
      
      const week = await getCurrentWeek()
      setCurrentWeek(week)
      
      if (members.length > 0) {
        setSelectedMemberId(members[0].id)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setMessage('Error loading data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTeamMember = async (e) => {
    e.preventDefault()
    if (!newMemberName || !newMemberEmail) {
      setMessage('Please fill in all fields')
      return
    }

    try {
      await createTeamMember({
        name: newMemberName,
        email: newMemberEmail,
      })
      setNewMemberName('')
      setNewMemberEmail('')
      setMessage('Team member added successfully!')
      await loadData()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage('Error adding team member')
      console.error(err)
    }
  }

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!selectedMemberId || !newTask.task_name || !currentWeek) {
      setMessage('Please select a team member and enter a task name')
      return
    }

    try {
      await createTask({
        team_member_id: selectedMemberId,
        week_id: currentWeek.id,
        task_name: newTask.task_name,
        heading: newTask.heading,
        deadline: newTask.deadline || null,
        estimated_hours: newTask.estimated_hours ? parseFloat(newTask.estimated_hours) : null,
        status: 'pending',
        position: 0,
      })
      setNewTask({
        task_name: '',
        heading: 'General',
        deadline: '',
        estimated_hours: '',
      })
      setMessage('Task added successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage('Error adding task')
      console.error(err)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>

      {message && (
        <div className={`mb-6 p-4 rounded ${message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Add Team Member */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add Team Member</h2>
          <form onSubmit={handleAddTeamMember} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., john@company.com"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Add Team Member
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Team Members</h3>
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div key={member.id} className="p-2 bg-gray-50 rounded">
                  <p className="font-medium text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-600">{member.email}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Task */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add Task</h2>
          {currentWeek ? (
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Member
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a team member</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Name
                </label>
                <input
                  type="text"
                  value={newTask.task_name}
                  onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Complete project report"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category/Heading
                </label>
                <input
                  type="text"
                  value={newTask.heading}
                  onChange={(e) => setNewTask({ ...newTask, heading: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Development"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={newTask.estimated_hours}
                  onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 4.5"
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Add Task
              </button>
            </form>
          ) : (
            <p className="text-gray-500">No current week found. Please set up a week first.</p>
          )}
        </div>
      </div>
    </div>
  )
}
