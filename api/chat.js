// Vercel serverless function: /api/chat
// Holds the secret Anthropic API key (server-side) and proxies questions to Claude.
// The browser never sees the key - it only calls this endpoint.
//
// Prompt caching: the instructions + dataset are sent as a cacheable system
// block (cache_control), so repeated questions over the same data pay ~10%
// for that block instead of full price. The question/history stay dynamic.

export default async function handler(req, res) {
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

    // Sanitize conversation history (last 10 turns, valid roles, length-capped).
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

    // Static instructions — identical on every request, so they cache cleanly.
    const instructions =
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
      "Earlier messages in this conversation are provided for context so you can answer follow-up questions."

    // System prompt as blocks. The combined instructions+data block is marked
    // cacheable, so identical repeat requests read it at ~10% input price.
    const system = [
      {
        type: 'text',
        text: instructions + "\n\n=== CURRENT DATA ===\n" + safeContext,
        cache_control: { type: 'ephemeral' },
      },
    ]

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
        system,
        messages,
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, errText)
      return res.status(502).json({ error: 'AI service error. Please try again.' })
    }

    const data = await anthropicRes.json()

    // Log cache usage so we can confirm caching is actually working.
    if (data.usage) {
      console.log('cache usage:', JSON.stringify(data.usage))
    }

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
