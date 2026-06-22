// Vercel serverless function: /api/chat
// Holds the secret Anthropic API key (server-side) and proxies questions to Claude.
// The browser never sees the key - it only calls this endpoint.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' })
  }

  try {
    const { question, context, history } = req.body || {}

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' })
    }

    // Basic guardrails: cap how much we accept, to bound token cost.
    const safeQuestion = question.slice(0, 2000)
    const safeContext = typeof context === 'string' ? context.slice(0, 60000) : ''

    // Sanitize incoming conversation history. Keep only the last 10 turns,
    // only valid roles, and cap each message's length.
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (m) =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      : []

    const systemPrompt =
      "You are a helpful analytics assistant inside a weekly task-tracking admin tool. " +
      "You answer questions about the team's tasks, members, deadlines, estimated hours, " +
      "completion status, and clean-sweep stars, using ONLY the data provided below. " +
      "If the answer is not in the data, say so plainly rather than guessing. " +
      "Be concise and direct. When asked for counts or totals, compute carefully from the data. " +
      "Earlier messages in this conversation are provided for context so you can answer follow-up questions.\n\n" +
      "=== CURRENT DATA ===\n" + safeContext

    // Build the messages array: prior turns, then the new question.
    const messages = [...safeHistory, { role: 'user', content: safeQuestion }]

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, errText)
      return res.status(502).json({ error: 'AI service error. Please try again.' })
    }

    const data = await anthropicRes.json()
    const answer = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return res.status(200).json({ answer: answer || 'No answer returned.' })
  } catch (err) {
    console.error('chat function error:', err)
    return res.status(500).json({ error: 'Something went wrong.' })
  }
}
