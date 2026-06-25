import { useState, useRef, useEffect } from 'react'
import { supabase, getTaskComments, addTaskComment, deleteTaskComment } from '../lib/supabase'
import { formatDate, getStatusColor, getStatusLabel, isOverdue, isDueToday, openDatePicker } from '../lib/utils'

export default function Task({ 
  task, 
  subtasks = [], 
  onTaskUpdate,
  onDeleteTask,
  isSubtask = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onIndent,
  onOutdent,
  commentCount = 0,
}) {
  const [showSubtasks, setShowSubtasks] = useState(true)
  const [isEditing, setIsEditing] = useState(!task.task_name)
  const [editedName, setEditedName] = useState(task.task_name)
  const [editedDeadline, setEditedDeadline] = useState(task.deadline || '')
  const [editedHours, setEditedHours] = useState(task.estimated_hours || '')
  const [holdReason, setHoldReason] = useState(task.on_hold_reason || '')
  const [carryForwardWeeks, setCarryForwardWeeks] = useState(task.carry_forward_weeks || 0)
  const [localTaskStatus, setLocalTaskStatus] = useState(task.status)
  const [localCarryForwardWeeks, setLocalCarryForwardWeeks] = useState(task.carry_forward_weeks || 0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Comments
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [localCommentCount, setLocalCommentCount] = useState(commentCount)
  const [commentsAbove, setCommentsAbove] = useState(false)
  const commentWrapperRef = useRef(null)
  const commentButtonRef = useRef(null)

  const statusColor = getStatusColor(localTaskStatus, localCarryForwardWeeks)

  // Load comments when the popover opens (once)
  useEffect(() => {
    if (showComments && !commentsLoaded) {
      getTaskComments(task.id)
        .then((rows) => {
          setComments(rows)
          setLocalCommentCount(rows.length)
          setCommentsLoaded(true)
        })
        .catch((e) => console.error('Error loading comments:', e))
    }
  }, [showComments, commentsLoaded, task.id])

  // Close comment popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showComments &&
        commentWrapperRef.current &&
        !commentWrapperRef.current.contains(event.target)
      ) {
        setShowComments(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showComments])

  const toggleComments = () => {
    if (!showComments) {
      // Decide whether to open upward: if the button is in the lower part of
      // the viewport, the popover would overflow below — flip it above.
      const btn = commentButtonRef.current
      if (btn) {
        const rect = btn.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        setCommentsAbove(spaceBelow < 320) // popover needs ~300px
      }
    }
    setShowComments((v) => !v)
  }

  const formatCommentTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const handleAddComment = async () => {
    const body = newComment.trim()
    if (!body) return
    try {
      const created = await addTaskComment(task.id, body)
      setComments((prev) => [...prev, created])
      setLocalCommentCount((c) => c + 1)
      setNewComment('')
    } catch (e) {
      console.error('Error adding comment:', e)
    }
  }

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteTaskComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      setLocalCommentCount((c) => Math.max(0, c - 1))
    } catch (e) {
      console.error('Error deleting comment:', e)
    }
  }

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

    if (onTaskUpdate) onTaskUpdate()
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

    if (onTaskUpdate) onTaskUpdate()
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

    if (onTaskUpdate) onTaskUpdate()
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
        className={`task-card ${
          localTaskStatus === 'on-hold' ? 'on-hold' : 
          localTaskStatus === 'carry-forward' || localCarryForwardWeeks > 0 ? 'carry-forward' :
          localTaskStatus === 'completed' ? 'completed' : ''
        } ${isSubtask ? 'ml-8 border-l-4' : ''} ${task.is_indented ? 'ml-8' : ''} transition-shadow`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {(onMoveUp || onMoveDown) && !isEditing && (
              <div className="flex flex-col flex-shrink-0 -my-1">
                <button
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className={`px-1.5 leading-none text-xs ${
                    canMoveUp ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                  }`}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className={`px-1.5 leading-none text-xs ${
                    canMoveDown ? 'text-gray-400 hover:text-gray-700' : 'text-gray-200 cursor-default'
                  }`}
                  title="Move down"
                >
                  ▼
                </button>
              </div>
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
                  onClick={openDatePicker}
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
                    className={`text-sm font-medium cursor-pointer hover:underline truncate ${
                      !task.task_name
                        ? 'text-gray-400'
                        : localCarryForwardWeeks > 0
                        ? `text-purple-600 ${localTaskStatus === 'completed' ? 'line-through' : ''}`
                        : localTaskStatus === 'completed'
                        ? 'line-through text-gray-500'
                        : localTaskStatus === 'on-hold'
                        ? 'text-red-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {task.task_name || 'Add name'}
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
              <div className="flex items-center gap-1 text-sm text-gray-500 whitespace-nowrap mr-3">
                <span
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer hover:underline"
                  title="Click to edit"
                >
                  {task.deadline ? formatDate(task.deadline) : 'Add deadline'}
                </span>
                <span className="text-gray-300">•</span>
                <span
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer hover:underline"
                  title="Click to edit"
                >
                  {task.estimated_hours ? `${task.estimated_hours}h` : 'Add hours'}
                </span>
              </div>

              {/* Hold dot (status toggle, no hover tooltip) */}
              <button
                onClick={toggleOnHold}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-white border ${
                  localTaskStatus === 'on-hold'
                    ? 'border-gray-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                title="Toggle on-hold"
              >
                <span
                  className={`block w-4 h-4 rounded-full ${
                    localTaskStatus === 'on-hold' ? 'bg-red-600' : 'bg-red-300'
                  }`}
                />
              </button>

              {/* Carry-forward dot (status toggle, no hover tooltip) */}
              <button
                onClick={toggleCarryForward}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-white border ${
                  localCarryForwardWeeks > 0
                    ? 'border-gray-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                title="Toggle carry-forward"
              >
                <span
                  className={`block w-4 h-4 rounded-full ${
                    localCarryForwardWeeks > 0 ? 'bg-purple-600' : 'bg-purple-300'
                  }`}
                />
              </button>

              {/* Comment button + popover (same size as the dots) */}
              <div ref={commentWrapperRef} className="relative flex-shrink-0">
                <button
                  ref={commentButtonRef}
                  onClick={toggleComments}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors bg-white border ${
                    showComments || localCommentCount > 0
                      ? 'border-gray-500 text-gray-700'
                      : 'border-gray-300 hover:border-gray-400 text-gray-400'
                  }`}
                  title="Comments"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  {localCommentCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] leading-none rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1">
                      {localCommentCount}
                    </span>
                  )}
                </button>

                {showComments && (
                  <div className={`absolute right-0 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col ${
                    commentsAbove ? 'bottom-full mb-2' : 'top-full mt-2'
                  }`}>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-700">Comments</p>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-3 space-y-3">
                      {comments.length === 0 && (
                        <p className="text-xs text-gray-400">No comments yet.</p>
                      )}
                      {comments.map((c) => (
                        <div key={c.id} className="group flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 break-words whitespace-pre-wrap">{c.body}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{formatCommentTime(c.created_at)}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-gray-300 hover:text-red-500 text-xs leading-none opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Delete comment"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t border-gray-100 flex gap-1.5">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment() }}
                        placeholder="Add a comment…"
                        className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Indent toggle (indent / outdent) — icon, x-button style */}
              {(onIndent || onOutdent) && (
                <button
                  onClick={() => (task.is_indented ? onOutdent && onOutdent() : onIndent && onIndent())}
                  className="pl-2 pr-0.5 text-gray-400 hover:text-gray-700 flex-shrink-0 flex items-center"
                  title={task.is_indented ? 'Outdent' : 'Indent'}
                >
                  {task.is_indented ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
              )}

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
