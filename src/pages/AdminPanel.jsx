import { useState, useEffect } from 'react'
import {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getAllWeeks,
  getWeeklyTasks,
  getCurrentWeek,
  getStarCounts,
} from '../lib/supabase'
import { getWeekLabelShort } from '../lib/utils'
import Stars from '../components/Stars'
import AdminChatbot from '../components/AdminChatbot'

export default function AdminPanel() {
  const [teamMembers, setTeamMembers] = useState([])
  const [weeks, setWeeks] = useState([])
  const [selectedWeekId, setSelectedWeekId] = useState('')
  const [currentWeekId, setCurrentWeekId] = useState('')
  const [starCounts, setStarCounts] = useState({})
  const [hoursByMember, setHoursByMember] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberTeam, setNewMemberTeam] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [editName, setEditName] = useState('')
  const [editTeam, setEditTeam] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedWeekId) loadHours()
  }, [selectedWeekId, teamMembers])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [members, allWeeks] = await Promise.all([getTeamMembers(), getAllWeeks()])
      setTeamMembers(members)
      setWeeks(allWeeks)

      try {
        setStarCounts(await getStarCounts())
      } catch (e) {
        console.error('Error loading stars:', e)
      }
      
      // Set current week as default
      if (allWeeks.length > 0) {
        const currentWeek = await getCurrentWeek()
        const weekToSelect = allWeeks.find(w => w.id === currentWeek.id) || allWeeks[0]
        setCurrentWeekId(currentWeek?.id || '')
        setSelectedWeekId(weekToSelect.id)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setMessage('Error loading data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadHours = async () => {
    if (!selectedWeekId) return
    try {
      const tasks = await getWeeklyTasks(selectedWeekId)
      const hours = {}
      teamMembers.forEach((m) => { hours[m.id] = 0 })
      tasks.forEach((t) => {
        if (hours[t.team_member_id] !== undefined) {
          hours[t.team_member_id] += t.estimated_hours || 0
        }
      })
      setHoursByMember(hours)
    } catch (err) {
      console.error('Error loading hours:', err)
    }
  }

  const showMessage = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  // Week navigation for the hours section.
  // weeks are ordered newest-first, so a lower index = newer week.
  const selectedWeekIndex = weeks.findIndex((w) => w.id === selectedWeekId)
  const selectedWeek = weeks[selectedWeekIndex]
  const goToOlderWeek = () => {
    if (selectedWeekIndex < weeks.length - 1) setSelectedWeekId(weeks[selectedWeekIndex + 1].id)
  }
  const goToNewerWeek = () => {
    if (selectedWeekIndex > 0) setSelectedWeekId(weeks[selectedWeekIndex - 1].id)
  }

  const handleAddTeamMember = async (e) => {
    e.preventDefault()
    if (!newMemberName || !newMemberTeam) {
      setMessage('Please fill in all fields')
      return
    }
    try {
      await createTeamMember({ name: newMemberName, team: newMemberTeam })
      setNewMemberName('')
      setNewMemberTeam('')
      showMessage('Team member added successfully!')
      await loadData()
    } catch (err) {
      setMessage('Error adding team member')
      console.error(err)
    }
  }

  const handleEditTeamMember = (member) => {
    setEditingMember(member)
    setEditName(member.name)
    setEditTeam(member.team)
  }

  const handleSaveEdit = async () => {
    if (!editName || !editTeam) {
      setMessage('Please fill in all fields')
      return
    }
    try {
      await updateTeamMember(editingMember.id, { name: editName, team: editTeam })
      setEditingMember(null)
      showMessage('Team member updated successfully!')
      await loadData()
    } catch (err) {
      setMessage('Error updating team member')
      console.error(err)
    }
  }

  const handleDeleteTeamMember = async (memberId) => {
    if (!window.confirm('Delete this team member? Their tasks will also be removed.')) return
    try {
      await deleteTeamMember(memberId)
      showMessage('Team member deleted.')
      await loadData()
    } catch (err) {
      setMessage('Error deleting team member')
      console.error(err)
    }
  }

  if (isLoading) return <div className="text-center py-8">Loading...</div>

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>

      {message && (
        <div className={`mb-6 p-4 rounded ${message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Team Member Management */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add Team Member</h2>
          <form onSubmit={handleAddTeamMember} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <input
                type="text"
                value={newMemberTeam}
                onChange={(e) => setNewMemberTeam(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Engineering"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Add Team Member
            </button>
          </form>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Team Members ({teamMembers.length})</h3>
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div key={member.id} className="p-3 bg-gray-50 rounded">
                  {editingMember?.id === member.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Name"
                      />
                      <input
                        type="text"
                        value={editTeam}
                        onChange={(e) => setEditTeam(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Team"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMember(null)}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 flex items-center gap-1.5">
                          <span>{member.name}</span>
                          <Stars count={starCounts[member.id] || 0} />
                        </p>
                        <p className="text-xs text-gray-500">{member.team}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditTeamMember(member)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTeamMember(member.id)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {teamMembers.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No team members yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Total Hours by Week */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Total Estimated Hours by Members</h2>
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goToOlderWeek}
                disabled={selectedWeekIndex >= weeks.length - 1}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-medium flex-shrink-0 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white"
              >
                ←
              </button>

              <div className="flex flex-1 items-center justify-center gap-2">
                <span className="text-base font-medium text-gray-700">
                  {selectedWeek ? getWeekLabelShort(selectedWeek.week_start_date) : ''}
                </span>
                {currentWeekId && selectedWeekId !== currentWeekId && (
                  <button
                    onClick={() => setSelectedWeekId(currentWeekId)}
                    className="px-2 py-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    Back to This Week
                  </button>
                )}
              </div>

              <button
                onClick={goToNewerWeek}
                disabled={selectedWeekIndex <= 0}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-medium flex-shrink-0 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white"
              >
                →
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                    <span>{member.name}</span>
                    <Stars count={starCounts[member.id] || 0} />
                  </p>
                  <p className="text-xs text-gray-500">{member.team}</p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-600">
                    {(hoursByMember[member.id] || 0).toFixed(1)}h <span className="text-xs font-normal text-gray-500">est.</span>
                  </span>
                </div>
              </div>
            ))}
            {teamMembers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No team members yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <AdminChatbot
          teamMembers={teamMembers}
          weeks={weeks}
          starCounts={starCounts}
        />
      </div>
    </div>
  )
}
