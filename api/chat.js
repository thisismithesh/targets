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
      "- Be CRISP. Answer the question in as few sentences as possible - often one or two is enough. " +
      "Give the direct answer and stop. Do not pad it out.\n" +
      "- Do NOT volunteer a full breakdown, per-item lists, or extra detail unless the user explicitly asks for it " +
      "(e.g. they say \"break it down\", \"give me the details\", \"list them\", \"per project\"). " +
      "If they only ask a simple question, give a simple answer.\n" +
      "- Lead with the direct answer in plain language. Example: \"Project X, Y, and Z are taking up most of the time this week.\" " +
      "Only add a short clause of context if it genuinely helps.\n" +
      "- Weave any numbers naturally into the sentence rather than listing rows.\n\n" +
      "FORMATTING (strict):\n" +
      "- You may ONLY use **bold**, *italics*, and __underline__ for emphasis, and sparingly.\n" +
      "- Do NOT use markdown tables, headings, bullet lists, numbered lists, blockquotes, horizontal rules, code blocks, or emojis. Just clean sentences and short paragraphs.\n\n" +
      "ACCURACY (strict):\n" +
      "- Do all counting and summing SILENTLY in your head. Never show your working, never write out calculations like \"4 + 0.5 + 12\", and never say things like \"let me recount\" or correct yourself mid-answer.\n" +
      "- Work out the correct figures first, then give one clean final answer with only the final numbers.\n" +
      "- Make sure any ranking matches the actual numbers. If the answer isn't in the data, say so plainly.\n\n" +
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
