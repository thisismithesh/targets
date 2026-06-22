import Task from './Task'

export default function TaskSection({ heading, tasks, subtaskMap, onTaskUpdate }) {
  if (tasks.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200">
        {heading}
      </h3>
      <div className="space-y-2">
        {tasks.map((task) => (
          <Task
            key={task.id}
            task={task}
            subtasks={subtaskMap[task.id] || []}
            onTaskUpdate={onTaskUpdate}
          />
        ))}
      </div>
    </div>
  )
}
