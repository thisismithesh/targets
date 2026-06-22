import { useState, useRef, useEffect } from 'react'
import { getWeeklyTasks } from '../lib/supabase'
import { getWeekLabelShort } from '../lib/utils'

// Convert a small subset of markdown to React nodes:
// - **bold** becomes <strong>
// - lines are preserved (the container uses whitespace-pre-wrap)
function renderText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/)
    if (m) return <strong key={i}>{m[1]}</strong>
    return <span key={i}>{part}</span>
  })
}

// Floating AI chatbox for the admin view.
// Scope: ALWAYS the most recent 4 weeks (up to today), gathered independently
// of the "Total Estimated Hours" week selector.
export default function AdminChatbot({ teamMembers, weeks, starCounts }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', text }
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [scope, setScope] = useState(1) // number of recent weeks: 1, 4, or 12
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading, isOpen])

  // Recent weeks up to today (weeks arrive newest-first).
  // Exclude future weeks (which may exist in the DB but have no tasks yet).
  const todayStr = new Date().toISOString().split('T')[0]
  const pastOrCurrentWeeks = (weeks || []).filter(
    (w) => w.week_start_date <= todayStr
  )
  const recentWeeks = pastOrCurrentWeeks.slice(0, scope)

  const scopeOptions = [
    { value: 1, label: 'This week' },
    { value: 4, label: 'Last 4 weeks' },
    { value: 12, label: 'Last 12 weeks' },
  ]

  // Gather a compact text snapshot of the selected scope for the AI.
  const buildContext = async () => {
    const lines = [`Scope: most recent ${recentWeeks.length} week(s) (up to today).`, `Team members: ${teamMembers.length}`, '']

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
        lines.push(`- ${m.name} (team: ${m.team || 'n/a'}) - ${myTasks.length} task(s), ${totalHours}h, ${stars} total star(s)`)
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
      const history = messages.map((m) => ({ role: m.role, content: m.text }))
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
    <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end">
      {/* Chat panel */}
      {isOpen && (
        <div className="chat-pop relative mb-3 w-[420px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-7rem)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
          {/* Close button — top-right corner */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-lg leading-none"
            title="Close"
          >
            &times;
          </button>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">Ask anything</h2>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="relative inline-block">
                  <select
                    value={scope}
                    onChange={(e) => setScope(Number(e.target.value))}
                    className="appearance-none w-auto text-xs text-gray-600 bg-white border border-gray-300 rounded-md pl-2 pr-7 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    title="Choose how much data to include"
                  >
                    {scopeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">
                    &#9660;
                  </span>
                </div>
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
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-[520px] overflow-y-auto bg-gray-50 p-4 space-y-3"
          >
            {messages.length === 0 && (
              <div className="text-sm text-gray-400 space-y-1">
                <p>Try asking:</p>
                <p>- "Who has the most incomplete tasks recently?"</p>
                <p>- "Summarise how the team did recently."</p>
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
                  {renderText(m.text)}
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

          {/* Input */}
          <div className="p-3 flex gap-2 border-t border-gray-100">
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
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105"
        title={isOpen ? 'Close chat' : 'Ask about the data'}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        ) : (
          <span style={{ fontSize: '24px', lineHeight: 1 }}>{'\uD83D\uDCAC'}</span>
        )}
      </button>
    </div>
  )
}
