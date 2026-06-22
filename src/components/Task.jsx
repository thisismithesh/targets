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
  const [showSubtasks, setShowSubtasks] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(task.task_name)
  const [editedDeadline, setEditedDeadline] = useState(task.deadline || '')
  const [editedHours, setEditedHours] = useState(task.estimated_hours || '')
  const [showHoldTooltip, setShowHoldTooltip] = useState(false)
  const [showCarryForwardTooltip, setShowCarryForwardTooltip] = useState(false)
  const [holdReason, setHoldReason] = useState(task.on_hold_reason || '')
  const [showHoldEditor, setShowHoldEditor] = useState(false)
  const [carryForwardWeeks, setCarryForwardWeeks] = useState(task.carry_forward_weeks || 0)
  const [showCarryForwardEditor, setShowCarryForwardEditor] = useState(false)
  const holdTooltipRef = useRef(null)
  const carryForwardTooltipRef = useRef(null)
  const statusColor = getStatusColor(task.status, task.carry_forward_weeks)
  let holdTooltipTimer = null
  let carryForwardTooltipTimer = null

  const handleHoldMouseEnter = () => {
    if (task.status === 'on-hold') {
      holdTooltipTimer = setTimeout(() => {
        setShowHoldTooltip(true)
      }, 1000)
    }
  }

  const handleHoldMouseLeave = () => {
    if (holdTooltipTimer) clearTimeout(holdTooltipTimer)
    setShowHoldTooltip(false)
  }

  const handleCarryForwardMouseEnter = () => {
    if (task.carry_forward_weeks > 0) {
      carryForwardTooltipTimer = setTimeout(() => {
        setShowCarryForwardTooltip(true)
      }, 1000)
    }
  }

  const handleCarryForwardMouseLeave = () => {
    if (carryForwardTooltipTimer) clearTimeout(carryForwardTooltipTimer)
    setShowCarryForwardTooltip(false)
  }

  const toggleOnHold = async () => {
    const newStatus = task.status === 'on-hold' ? 'pending' : 'on-hold'
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        on_hold_reason: newStatus === 'on-hold' ? task.on_hold_reason || '' : null
      })
      .eq('id', task.id)

    if (!error) {
      onTaskUpdate()
    }
  }

  const toggleCarryForward = async () => {
    const newWeeks = task.carry_forward_weeks > 0 ? 0 : 1
    const { error } = await supabase
      .from('tasks')
      .update({ 
        carry_forward_weeks: newWeeks
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

  const saveHoldReason = async () => {
    const { error } = await supabase
      .from('tasks')
      .update({ on_hold_reason: holdReason })
      .eq('id', task.id)

    if (!error) {
      setShowHoldEditor(false)
    }
  }

  const saveCarryForwardWeeks = async () => {
    const { error } = await supabase
      .from('tasks')
      .update({ carry_forward_weeks: carryForwardWeeks })
      .eq('id', task.id)

    if (!error) {
      setShowCarryForwardEditor(false)
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={task.status === 'completed'}
              onChange={toggleCompleted}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer flex-shrink-0"
            />
            
            {isEditing ? (
              <div className="flex-1 flex gap-2 items-center">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  autoFocus
                />
                <input
                  type="date"
                  value={editedDeadline}
                  onChange={(e) => setEditedDeadline(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm w-32"
                />
                <input
                  type="number"
                  step="0.5"
                  value={editedHours}
                  onChange={(e) => setEditedHours(e.target.value)}
                  placeholder="h"
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={saveTaskEdit}
                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex-shrink-0"
                >
                  ✓
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 
                    onClick={() => setIsEditing(true)}
                    className={`text-sm font-medium text-gray-900 cursor-pointer hover:underline truncate ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}
                  >
                    {task.task_name}
                  </h3>
                  {overdue && task.status !== 'completed' && (
                    <span className="badge bg-red-100 text-red-800 text-xs flex-shrink-0">
                      Overdue
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-xs text-gray-600 whitespace-nowrap">
                {task.deadline && (
                  <span>{formatDate(task.deadline)}</span>
                )}
                {task.deadline && task.estimated_hours && <span className="mx-1">•</span>}
                {task.estimated_hours && (
                  <span>{task.estimated_hours}h</span>
                )}
              </div>

              {/* Hold Icon Button */}
              <div className="relative">
                <button
                  onClick={toggleOnHold}
                  onMouseEnter={handleHoldMouseEnter}
                  onMouseLeave={handleHoldMouseLeave}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    task.status === 'on-hold'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-red-200'
                  }`}
                  title="Hold status"
                >
                  •
                </button>
                {showHoldTooltip && task.status === 'on-hold' && (
                  <div
                    ref={holdTooltipRef}
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 w-48 z-50 text-xs"
                  >
                    <p className="font-medium text-gray-700 mb-1">Hold Reason:</p>
                    {showHoldEditor ? (
                      <div className="space-y-1">
                        <textarea
                          value={holdReason}
                          onChange={(e) => setHoldReason(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded resize-none"
                          rows="2"
                          autoFocus
                        />
                        <button
                          onClick={saveHoldReason}
                          className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-gray-600 break-words">{holdReason || 'No reason provided'}</p>
                        <button
                          onClick={() => setShowHoldEditor(true)}
                          className="text-blue-600 text-xs hover:text-blue-700 font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Carry Forward Icon Button */}
              <div className="relative">
                <button
                  onClick={toggleCarryForward}
                  onMouseEnter={handleCarryForwardMouseEnter}
                  onMouseLeave={handleCarryForwardMouseLeave}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    task.carry_forward_weeks > 0
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-purple-200'
                  }`}
                  title="Carry forward status"
                >
                  •
                </button>
                {showCarryForwardTooltip && task.carry_forward_weeks > 0 && (
                  <div
                    ref={carryForwardTooltipRef}
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 w-48 z-50 text-xs"
                  >
                    <p className="font-medium text-gray-700 mb-1">Carry Forward:</p>
                    {showCarryForwardEditor ? (
                      <div className="space-y-1">
                        <input
                          type="number"
                          min="1"
                          value={carryForwardWeeks}
                          onChange={(e) => setCarryForwardWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          autoFocus
                        />
                        <button
                          onClick={saveCarryForwardWeeks}
                          className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-gray-600">{carryForwardWeeks} week{carryForwardWeeks !== 1 ? 's' : ''}</p>
                        <button
                          onClick={() => setShowCarryForwardEditor(true)}
                          className="text-blue-600 text-xs hover:text-blue-700 font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delete Button */}
              {onDeleteTask && (
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0"
                  title="Delete task"
                >
                  ✕
                </button>
              )}
            </div>
          )}
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
