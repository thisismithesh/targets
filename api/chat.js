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
    const safeContext = typeof context === 'string' ? context.slice(0, 120000) : ''

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
      "You are a sharp, friendly colleague helping a manager understand their team's weekly task data. " +
      "You answer using ONLY the data provided below.\n\n" +
      "HOW TO WRITE (very important):\n" +
      "- Sound like a thoughtful human professional talking to a coworker, NOT like an AI generating a report.\n" +
      "- Lead with a direct, natural-language answer to the actual question, in plain sentences. " +
      "For example, if asked which projects take the most time, start with something like: " +
      "\"Project X, Project Y, and Project Z are taking up most of the time this week.\" Then add a little useful detail.\n" +
      "- Keep it conversational and concise. Write in flowing prose and short paragraphs.\n" +
      "- Do NOT dump data into tables. Do NOT produce big structured breakdowns unless the user explicitly asks for a full list or table.\n" +
      "- Weave specific numbers into sentences naturally (e.g. \"Kandou is the biggest at 18.5h, almost all on Harishma\") rather than listing rows.\n\n" +
      "FORMATTING (strict):\n" +
      "- You may ONLY use **bold**, *italics*, and __underline__ for emphasis. Use them sparingly.\n" +
      "- Do NOT use any other formatting: no markdown tables, no headings (#, ##, ###), no bullet lists, no numbered lists, no blockquotes (>), no horizontal rules (---), no code blocks, and no emojis.\n" +
      "- Just write clean sentences and paragraphs.\n\n" +
      "ACCURACY (strict):\n" +
      "- When counting or summing, work through the relevant items one by one before stating a figure. Verify every number against the data; never state a figure you have not checked.\n" +
      "- If you rank people or projects by a number, make sure the order matches the actual numbers.\n" +
      "- Work out the correct figures first, then give one clean final answer. Do NOT correct yourself mid-answer.\n" +
      "- If the answer isn't in the data, say so plainly rather than guessing.\n\n" +
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
        model: 'claude-sonnet-4-6',
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
