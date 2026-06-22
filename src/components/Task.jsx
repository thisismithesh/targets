import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, getStatusColor, getStatusLabel, isOverdue } from '../lib/utils'

export default function Task({ 
  task, 
  subtasks = [], 
  onTaskUpdate,
  onDeleteTask,
  isSubtask = false 
}) {
  const [showOnHoldComment, setShowOnHoldComment] = useState(false)
  const [onHoldReason, setOnHoldReason] = useState(task.on_hold_reason || '')
  const [showSubtasks, setShowSubtasks] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(task.task_name)
  const [editedDeadline, setEditedDeadline] = useState(task.deadline || '')
  const [editedHours, setEditedHours] = useState(task.estimated_hours || '')
  const commentRef = useRef(null)
  const statusColor = getStatusColor(task.status, task.carry_forward_weeks)

  const toggleOnHold = async () => {
    const newStatus = task.status === 'on-hold' ? 'pending' : 'on-hold'
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        on_hold_reason: newStatus === 'on-hold' ? onHoldReason : null
      })
      .eq('id', task.id)

    if (!error) {
      onTaskUpdate()
    }
  }

  const toggleCompleted = async () => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        completed_date: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
      })
      .eq('id', task.id)

    if (!error) {
      onTaskUpdate()
    }
  }

  const saveOnHoldReason = async () => {
    const { error } = await supabase
      .from('tasks')
      .update({ on_hold_reason: onHoldReason })
      .eq('id', task.id)

    if (!error) {
      setShowOnHoldComment(false)
    }
  }

  const saveTaskEdit = async () => {
    const { error } = await supabase
      .from('tasks')
      .update({
        task_name: editedName,
        deadline: editedDeadline || null,
        estimated_hours: editedHours ? parseFloat(editedHours) : null
      })
      .eq('id', task.id)

    if (!error) {
      setIsEditing(false)
      onTaskUpdate()
    }
  }

  const handleClickOutside = (e) => {
    if (commentRef.current && !commentRef.current.contains(e.target)) {
      setShowOnHoldComment(false)
    }
  }

  useEffect(() => {
    if (showOnHoldComment) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOnHoldComment])

  const overdue = isOverdue(task.deadline, task.completed_date, task.status)

  return (
    <>
      <div 
        className={`task-card ${
          task.status === 'on-hold' ? 'on-hold' : 
          task.status === 'carry-forward' || task.carry_forward_weeks > 0 ? 'carry-forward' :
          task.status === 'completed' ? 'completed' : ''
        } ${isSubtask ? 'ml-8 border-l-4' : ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editedDeadline}
                    onChange={(e) => setEditedDeadline(e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={editedHours}
                    onChange={(e) => setEditedHours(e.target.value)}
                    placeholder="Hours"
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveTaskEdit}
                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={toggleCompleted}
                    className="w-5 h-5 rounded border-gray-300 cursor-pointer"
                  />
                  <h3 className={`font-semibold text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                    {task.task_name}
                  </h3>
                  {task.carry_forward_weeks > 0 && (
                    <span className="badge badge-carryforward">
                      {task.carry_forward_weeks}w
                    </span>
                  )}
                  {overdue && task.status !== 'completed' && (
                    <span className="badge bg-red-100 text-red-800">
                      Overdue
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-2">
                  {task.deadline && (
                    <div>
                      <span className="font-medium">Deadline:</span> {formatDate(task.deadline)}
                    </div>
                  )}
                  {task.estimated_hours && (
                    <div>
                      <span className="font-medium">Est. Hours:</span> {task.estimated_hours}h
                    </div>
                  )}
                  {task.completed_date && (
                    <div>
                      <span className="font-medium">Completed:</span> {formatDate(task.completed_date)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 items-start">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              title="Edit task"
            >
              ✏️
            </button>
            {onDeleteTask && (
              <button
                onClick={() => onDeleteTask(task.id)}
                className="px-2 py-1 text-xs bg-gray-200 text-red-600 rounded hover:bg-red-100"
                title="Delete task"
              >
                🗑️
              </button>
            )}
            <div className="relative">
              <button
                onClick={toggleOnHold}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  task.status === 'on-hold'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-red-100'
                }`}
                title="Mark as on hold"
              >
                Hold
              </button>
              {task.status === 'on-hold' && (
                <div
                  ref={commentRef}
                  className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-3 w-64 z-50 opacity-0 hover:opacity-100 transition-opacity"
                  onMouseEnter={() => setShowOnHoldComment(true)}
                  onMouseLeave={() => setShowOnHoldComment(false)}
                >
                  <p className="text-xs font-medium text-gray-700 mb-2">On Hold Reason:</p>
                  <textarea
                    value={onHoldReason}
                    onChange={(e) => setOnHoldReason(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2 resize-none"
                    rows="2"
                    placeholder="Why is this task on hold?"
                  />
                  <button
                    onClick={saveOnHoldReason}
                    className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {subtasks.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSubtasks(!showSubtasks)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-8"
          >
            {showSubtasks ? '▼' : '▶'} {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''}
          </button>
          {showSubtasks && (
            <div className="mt-2 space-y-2">
              {subtasks.map((subtask) => (
                <Task
                  key={subtask.id}
                  task={subtask}
                  onTaskUpdate={onTaskUpdate}
                  isSubtask={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
