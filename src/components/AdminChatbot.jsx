import { useState, useRef, useEffect } from 'react'
import { getWeeklyTasks } from '../lib/supabase'
import { getWeekLabelShort } from '../lib/utils'

// AI chatbox for the admin view.
// Scope: ALWAYS the most recent 4 weeks, gathered independently of the
// "Total Estimated Hours" week selector. Sends a data snapshot + the
// question to the /api/chat serverless function.
export default function AdminChatbot({ teamMembers, weeks, starCounts }) {
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', text }
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // The 4 most recent weeks (weeks arrive newest-first).
  const recentWeeks = (weeks || []).slice(0, 4)
  const scopeLabel =
    recentWeeks.length > 0
      ? `Last ${recentWeeks.length} week${recentWeeks.length > 1 ? 's' : ''}`
      : 'No weeks'

  // Gather a compact text snapshot of the last 4 weeks for the AI.
  const buildContext = async () => {
    const lines = [`Scope: most recent ${recentWeeks.length} week(s).`, `Team members: ${teamMembers.length}`, '']

    for (const w of recentWeeks) {
      const weekName = getWeekLabelShort(w.week_start_date)
      let tasks = []
      try {
        tasks = await getWeeklyTasks(w.id)
      } catch (e) {
        console.error('context fetch failed for week', w.id, e)
      }

      lines.push(`### Week: ${weekName}`)
      teamMembers.forEach((m) => {
        const myTasks = tasks.filter((t) => t.team_member_id === m.id)
        const totalHours = myTasks
          .reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
          .toFixed(1)
        const stars = starCounts?.[m.id] || 0
        lines.push(`- ${m.name} (team: ${m.team || 'n/a'}) — ${myTasks.length} task(s), ${totalHours}h, ${stars} total star(s)`)
        myTasks.forEach((t) => {
          const parts = [`"${t.task_name}"`, `status: ${t.status}`]
          if (t.heading) parts.push(`category: ${t.heading}`)
          if (t.deadline) parts.push(`deadline: ${t.deadline}`)
          if (t.estimated_hours) parts.push(`${t.estimated_hours}h`)
          lines.push(`    - ${parts.join(', ')}`)
        })
      })
      lines.push('')
    }

    return lines.join('\n')
  }

  const send = async () => {
    const question = input.trim()
    if (!question || isLoading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setIsLoading(true)

    try {
      const context = await buildContext()
      // Send prior turns so Claude can answer follow-up questions.
      const history = messages.map((m) => ({
        role: m.role,
        content: m.text,
      }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, history }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `\u26A0\uFE0F ${err.message || 'Something went wrong.'}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const newChat = () => {
    if (isLoading) return
    setMessages([])
    setInput('')
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-900">Ask about the data</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{scopeLabel}</span>
          {messages.length > 0 && (
            <button
              onClick={newChat}
              disabled={isLoading}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium underline disabled:opacity-50"
            >
              New chat
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Ask questions about the last 4 weeks - tasks, hours, who's behind, stars, and more.
      </p>

      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto rounded-md bg-gray-50 border border-gray-100 p-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-sm text-gray-400 space-y-1">
            <p>Try asking:</p>
            <p>- "Who has the most incomplete tasks recently?"</p>
            <p>- "Summarise how the team did over the last few weeks."</p>
            <p>- "Who is overloaded on hours?"</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 text-gray-400 rounded-lg px-3 py-2 text-sm">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a question..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={send}
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}
