import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, getStatusColor, getStatusLabel, isOverdue, isDueToday } from '../lib/utils'

export default function Task({ 
  task, 
  subtasks = [], 
  onTaskUpdate,
  onDeleteTask,
  isSubtask = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
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
  const [localTaskStatus, setLocalTaskStatus] = useState(task.status)
  const [localCarryForwardWeeks, setLocalCarryForwardWeeks] = useState(task.carry_forward_weeks || 0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const holdTooltipRef = useRef(null)
  const carryForwardTooltipRef = useRef(null)
  const tooltipContainerRef = useRef(null)
  const statusColor = getStatusColor(localTaskStatus, localCarryForwardWeeks)
  const holdTooltipTimer = useRef(null)
  const carryForwardTooltipTimer = useRef(null)
  const holdWrapperRef = useRef(null)
  const carryForwardWrapperRef = useRef(null)

  const handleHoldMouseEnter = () => {
    if (localTaskStatus === 'on-hold') {
      holdTooltipTimer.current = setTimeout(() => {
        setShowHoldTooltip(true)
      }, 1000)
    }
  }

  const handleHoldMouseLeave = () => {
    if (holdTooltipTimer.current) clearTimeout(holdTooltipTimer.current)
  }

  const handleCarryForwardMouseEnter = () => {
    if (localCarryForwardWeeks > 0) {
      carryForwardTooltipTimer.current = setTimeout(() => {
        setShowCarryForwardTooltip(true)
      }, 1000)
    }
  }

  const handleCarryForwardMouseLeave = () => {
    if (carryForwardTooltipTimer.current) clearTimeout(carryForwardTooltipTimer.current)
  }

  // Dismiss either tooltip when clicking anywhere outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showHoldTooltip &&
        holdWrapperRef.current &&
        !holdWrapperRef.current.contains(event.target)
      ) {
        setShowHoldTooltip(false)
        setShowHoldEditor(false)
      }
      if (
        showCarryForwardTooltip &&
        carryForwardWrapperRef.current &&
        !carryForwardWrapperRef.current.contains(event.target)
      ) {
        setShowCarryForwardTooltip(false)
        setShowCarryForwardEditor(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHoldTooltip, showCarryForwardTooltip])

  const toggleOnHold = async () => {
    const newStatus = localTaskStatus === 'on-hold' ? 'pending' : 'on-hold'
    setLocalTaskStatus(newStatus)
    
    await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        on_hold_reason: newStatus === 'on-hold' ? holdReason || '' : null
      })
      .eq('id', task.id)
  }

  const toggleCarryForward = async () => {
    const newWeeks = localCarryForwardWeeks > 0 ? 0 : 1
    setLocalCarryForwardWeeks(newWeeks)
    
    await supabase
      .from('tasks')
      .update({ 
        carry_forward_weeks: newWeeks
      })
      .eq('id', task.id)
  }

  const toggleCompleted = async () => {
    const newStatus = localTaskStatus === 'completed' ? 'pending' : 'completed'
    setLocalTaskStatus(newStatus)
    
    await supabase
      .from('tasks')
      .update({ 
        status: newStatus,
        completed_date: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
      })
      .eq('id', task.id)
  }

  const saveHoldReason = async () => {
    await supabase
      .from('tasks')
      .update({ on_hold_reason: holdReason })
      .eq('id', task.id)

    setShowHoldEditor(false)
  }

  const saveCarryForwardWeeks = async () => {
    await supabase
      .from('tasks')
      .update({ carry_forward_weeks: carryForwardWeeks })
      .eq('id', task.id)

    setShowCarryForwardEditor(false)
  }

  const saveTaskEdit = async () => {
    await supabase
      .from('tasks')
      .update({
        task_name: editedName,
        deadline: editedDeadline || null,
        estimated_hours: editedHours ? parseFloat(editedHours) : null
      })
      .eq('id', task.id)

    setIsEditing(false)
    onTaskUpdate()
  }

  const overdue = isOverdue(task.deadline, task.completed_date, localTaskStatus)
  const dueToday = isDueToday(task.deadline, task.completed_date, localTaskStatus)

  return (
    <>
      <div 
        onDragOver={draggable ? onDragOver : undefined}
        onDrop={draggable ? onDrop : undefined}
        className={`task-card ${
          localTaskStatus === 'on-hold' ? 'on-hold' : 
          localTaskStatus === 'carry-forward' || localCarryForwardWeeks > 0 ? 'carry-forward' :
          localTaskStatus === 'completed' ? 'completed' : ''
        } ${isSubtask ? 'ml-8 border-l-4' : ''} ${isDragging ? 'opacity-40' : ''} transition-shadow`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {draggable && !isEditing && (
              <span
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none flex-shrink-0 leading-none"
                title="Drag to reorder"
              >
                ⠿
              </span>
            )}
            <input
              type="checkbox"
              checked={localTaskStatus === 'completed'}
              onChange={toggleCompleted}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer flex-shrink-0"
            />
            
            {isEditing ? (
              <div className="flex-1 flex gap-2 items-center">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-[7] min-w-0 px-2 py-1 border border-gray-300 rounded text-sm"
                  autoFocus
                  placeholder="Task name"
                />
                <input
                  type="date"
                  value={editedDeadline}
                  onChange={(e) => setEditedDeadline(e.target.value)}
                  className="flex-[1.5] min-w-0 px-1 py-1 border border-gray-300 rounded text-xs"
                />
                <input
                  type="number"
                  step="any"
                  value={editedHours}
                  onChange={(e) => setEditedHours(e.target.value)}
                  placeholder="h"
                  className="flex-[1] min-w-0 px-1 py-1 border border-gray-300 rounded text-xs"
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
                    className={`text-sm font-medium text-gray-900 cursor-pointer hover:underline truncate ${localTaskStatus === 'completed' ? 'line-through text-gray-500' : ''}`}
                  >
                    {task.task_name}
                  </h3>
                  {overdue && localTaskStatus !== 'completed' && (
                    <span className="badge bg-red-100 text-red-800 text-xs flex-shrink-0">
                      Overdue
                    </span>
                  )}
                  {dueToday && localTaskStatus !== 'completed' && (
                    <span className="badge bg-yellow-100 text-yellow-800 text-xs flex-shrink-0">
                      Due today
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
              <div 
                ref={holdWrapperRef}
                className="relative"
                onMouseEnter={handleHoldMouseEnter}
                onMouseLeave={handleHoldMouseLeave}
              >
                <button
                  onClick={toggleOnHold}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-white border ${
                    localTaskStatus === 'on-hold'
                      ? 'border-gray-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  title="Hold status"
                >
                  <span
                    className={`block w-4 h-4 rounded-full ${
                      localTaskStatus === 'on-hold' ? 'bg-red-600' : 'bg-red-300'
                    }`}
                  />
                </button>
                {showHoldTooltip && localTaskStatus === 'on-hold' && (
                  <div
                    ref={holdTooltipRef}
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 w-48 z-50 text-xs"
                    onMouseEnter={handleHoldMouseEnter}
                    onMouseLeave={handleHoldMouseLeave}
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
              <div 
                ref={carryForwardWrapperRef}
                className="relative"
                onMouseEnter={handleCarryForwardMouseEnter}
                onMouseLeave={handleCarryForwardMouseLeave}
              >
                <button
                  onClick={toggleCarryForward}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-white border ${
                    localCarryForwardWeeks > 0
                      ? 'border-gray-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  title="Carry forward status"
                >
                  <span
                    className={`block w-4 h-4 rounded-full ${
                      localCarryForwardWeeks > 0 ? 'bg-purple-600' : 'bg-purple-300'
                    }`}
                  />
                </button>
                {showCarryForwardTooltip && localCarryForwardWeeks > 0 && (
                  <div
                    ref={carryForwardTooltipRef}
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 w-48 z-50 text-xs"
                    onMouseEnter={handleCarryForwardMouseEnter}
                    onMouseLeave={handleCarryForwardMouseLeave}
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

              {/* Delete Button (inline two-step confirm) */}
              {onDeleteTask && (
                confirmingDelete ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setConfirmingDelete(false); onDeleteTask(task.id) }}
                      className="px-1.5 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      title="Confirm delete"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="px-2 text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0"
                    title="Delete task"
                  >
                    ✕
                  </button>
                )
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
