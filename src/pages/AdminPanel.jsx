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
  saveTeamMemberPositions,
} from '../lib/supabase'
import { getWeekLabelShort } from '../lib/utils'
import Stars from '../components/Stars'
import AdminChatbot from '../components/AdminChatbot'

export default function AdminPanel() {
  const [teamMembers, setTeamMembers] = useState([])
  const [weeks, setWeeks] = useState([])
  const [selectedWeekId, setSelectedWeekId] = useState('')
  const [currentWeekId, setCurrentWeekId] = useState('')
  const [selectedTeamForHours, setSelectedTeamForHours] = useState(null)
  const [starCounts, setStarCounts] = useState({})
  const [hoursByMember, setHoursByMember] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberTeam, setNewMemberTeam] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [editName, setEditName] = useState('')
  const [editTeam, setEditTeam] = useState('')
  const [message, setMessage] = useState('')
  const [teams, setTeams] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedWeekId) loadHours()
  }, [selectedWeekId, teamMembers, selectedTeamForHours])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [members, allWeeks] = await Promise.all([getTeamMembers(), getAllWeeks()])
      setTeamMembers(members)
      setWeeks(allWeeks)

      // Extract unique teams and sort
      const uniqueTeams = [...new Set(members.map(m => m.team))].sort()
      setTeams(uniqueTeams)

      // Set first team as selected for hours view if not already set
      if (!selectedTeamForHours && uniqueTeams.length > 0) {
        setSelectedTeamForHours(uniqueTeams[0])
      }

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

  const handleMoveMember = async (currentIndex, direction) => {
    const newMembers = [...teamMembers]
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    
    if (swapIndex >= 0 && swapIndex < newMembers.length) {
      [newMembers[currentIndex], newMembers[swapIndex]] = [newMembers[swapIndex], newMembers[currentIndex]]
      setTeamMembers(newMembers)
      
      // Save the new order to the database
      try {
        await saveTeamMemberPositions(newMembers)
        showMessage('Team member order saved!')
      } catch (err) {
        console.error('Error saving member order:', err)
        showMessage('Error: Make sure the "position" column exists in team_members table. Run the migration first.')
        // Revert the change
        setTeamMembers(teamMembers)
      }
    }
  }

  // Group members by team
  const membersByTeam = {}
  teamMembers.forEach((member) => {
    if (!membersByTeam[member.team]) membersByTeam[member.team] = []
    membersByTeam[member.team].push(member)
  })

  // Filter members for hours section by selected team
  const filteredMembersForHours = selectedTeamForHours
    ? teamMembers.filter(m => m.team === selectedTeamForHours)
    : teamMembers

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
            <div className="space-y-4">
              {Object.entries(membersByTeam).map(([team, members]) => (
                <div key={team}>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{team}</h4>
                  <div className="space-y-2">
                    {members.map((member, memberIndex) => {
                      const memberIndexInAllList = teamMembers.findIndex(m => m.id === member.id)
                      const teamStartIndex = teamMembers.findIndex(m => m.team === team)
                      const isFirstInTeam = memberIndex === 0
                      const isLastInTeam = memberIndex === members.length - 1

                      return (
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
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <div className="flex flex-col -my-1">
                                  <button
                                    onClick={() => handleMoveMember(memberIndexInAllList, 'up')}
                                    disabled={memberIndexInAllList === 0}
                                    className={`px-1.5 leading-none text-xs ${
                                      memberIndexInAllList > 0 ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                                    }`}
                                    title="Move up"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={() => handleMoveMember(memberIndexInAllList, 'down')}
                                    disabled={memberIndexInAllList === teamMembers.length - 1}
                                    className={`px-1.5 leading-none text-xs ${
                                      memberIndexInAllList < teamMembers.length - 1 ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                                    }`}
                                    title="Move down"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                  <span>{member.name}</span>
                                  <Stars count={starCounts[member.id] || 0} />
                                </p>
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
                      )
                    })}
                  </div>
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

          {/* Team filter pills for hours section */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {teams.map((team) => (
                <button
                  key={team}
                  onClick={() => setSelectedTeamForHours(team)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedTeamForHours === team
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          </div>

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
                {selectedWeekId === currentWeekId && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                    Current Week
                  </span>
                )}
                {currentWeekId && selectedWeekId !== currentWeekId && (
                  <button
                    onClick={() => setSelectedWeekId(currentWeekId)}
                    className="px-2 py-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                  >
                    Back to this week
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
            {filteredMembersForHours.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                    <span>{member.name}</span>
                    <Stars count={starCounts[member.id] || 0} />
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-600">
                    {(hoursByMember[member.id] || 0).toFixed(1)}h <span className="text-xs font-normal text-gray-500">est.</span>
                  </span>
                </div>
              </div>
            ))}
            {filteredMembersForHours.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No team members in {selectedTeamForHours}.</p>
            )}
          </div>
        </div>
      </div>

      <AdminChatbot
        teamMembers={teamMembers}
        weeks={weeks}
        starCounts={starCounts}
      />
    </div>
  )
}
