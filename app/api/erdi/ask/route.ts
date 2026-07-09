import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { Models } from '@/ai/constants'

const SYSTEM = `You are the ERDI Intelligence Assistant — an AI economist embedded in the ADB ERDI (Economic Research and Development Impact) Intelligence Hub.

WHO YOU ARE:
- You are an expert in development economics covering Asia, the Pacific, and emerging markets globally
- You are integrated with live ADB Data (Key Indicators Database) data, which powers the Data Explorer and Portfolio Map in this portal
- You can help users understand economic indicators, interpret data, and navigate the portal's features

WHAT YOU CAN DO:
- Answer questions about economics concepts: GDP, inflation, debt, remittances, FDI, exchange rates, monetary policy, trade, labour markets
- Discuss economies across Asia and the Pacific, as well as global macroeconomic trends
- Explain ADB publications and tools: ADO (Asian Development Outlook), ADB Data, Key Indicators, Economic Monitor series
- Help users find the right indicator or data query — suggest using the Data Explorer for live ADB Data data
- Answer general questions on any topic while prioritising economic and development relevance

PORTAL FEATURES YOU KNOW ABOUT:
- Portfolio Map: shows live ADB Data indicator data with country-by-country breakdowns
- Data Explorer: natural language queries mapped to ADB Data SDMX data, rendered as charts with PNG/CSV export
- Intelligence Briefing: curated economic articles with indicator-linked "Why has this changed?" analysis
- Publications: ADB flagship reports including ADO and Economic Monitor series

DATA SOURCES IN THIS PORTAL:
The Data Explorer and Portfolio Map are powered by the ADB Key Indicators Database (ADB Data), accessed via the ADB Data SDMX REST API at adb.org.

RESPONSE STYLE:
- Be warm, concise, and direct. Lead with the answer, then add context.
- Keep responses under 200 words unless the user asks for depth
- No markdown bold (**text**) — plain text only
- Write for a professional economist audience but stay accessible`

// Stream Anthropic API directly via fetch — avoids SDK version conflicts
async function streamAnthropic(system: string, prompt: string, apiKey: string): Promise<Response> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      stream: true,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)

  // Transform Anthropic SSE stream → plain text stream (what the client expects)
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const evt = JSON.parse(data)
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              controller.enqueue(encoder.encode(evt.delta.text))
            }
          } catch { /* skip malformed */ }
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function runAI(system: string, prompt: string): Promise<Response | null> {
  // 1. Try AI gateway (production)
  const hasGateway = process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_BASE_URL
  if (hasGateway) {
    try {
      const { model } = getModelOptions(Models.AnthropicClaudeSonnet46)
      const result = streamText({ model, system, prompt })
      return result.toTextStreamResponse()
    } catch (err) {
      console.warn('[erdi/ask] gateway failed:', err)
    }
  }

  // 2. Try direct Anthropic API (local dev with ANTHROPIC_API_KEY)
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) {
    try {
      return await streamAnthropic(system, prompt, anthropicKey)
    } catch (err) {
      console.warn('[erdi/ask] anthropic direct failed:', err)
    }
  }

  return null
}

// Question-topic → section-header keyword mappings (ordered: more specific first)
const TOPIC_MAP: { test: RegExp; headers: string[] }[] = [
  { test: /pacific|fiji|png|papua|solomon|tonga|samoa|vanuatu|kiribati|nauru|palau|micronesia|marshall|cook island|tuvalu/i, headers: ['PACIFIC'] },
  { test: /artificial intelligence|ai chapter|ai and|digital|semiconductor|automation/i, headers: ['ARTIFICIAL INTELLIGENCE', 'SPECIAL THEME', 'AI'] },
  { test: /inflation|price|cpi|cost of living|food price/i, headers: ['INFLATION'] },
  { test: /risk|uncertainty|downside|threat|red sea|shipping|geopolit/i, headers: ['EXTERNAL RISK', 'RISK'] },
  { test: /trade|export|import|shipping|global trade/i, headers: ['GLOBAL TRADE', 'TRADE', 'EXTERNAL'] },
  { test: /fiscal|debt|budget|deficit|government spend|public debt/i, headers: ['FISCAL'] },
  { test: /monetary|interest rate|central bank|fed|federal reserve/i, headers: ['MONETARY'] },
  { test: /south asia|india|pakistan|bangladesh|sri lanka/i, headers: ['SOUTH ASIA'] },
  { test: /southeast asia|asean|indonesia|vietnam|thailand|philippines/i, headers: ['SOUTHEAST ASIA'] },
  { test: /east asia|china|prc|korea|japan|taiwan/i, headers: ['EAST ASIA'] },
  { test: /central asia|kazakhstan|uzbekistan|kyrgyz/i, headers: ['CENTRAL ASIA'] },
  { test: /subregion|region|breakdown|by region|subregional/i, headers: ['SUBREGIONAL'] },
  { test: /growth|gdp|forecast|project|outlook|economy|economic/i, headers: ['HEADLINE FORECAST', 'GROWTH', 'SUBREGIONAL'] },
  { test: /key finding|main finding|summary|overview|highlight|key point|what does|what did|tell me about/i, headers: ['HEADLINE FORECAST', 'OVERVIEW', 'PUBLICATION'] },
]

function parseSections(content: string): { title: string; body: string; page?: number }[] {
  // Match "SOME HEADER [p.N]:" or "SOME HEADER:" — capture title and optional page number
  const headerRe = /^([A-Z][A-Za-z0-9\s,()—–\-]+?)(?:\s*\[p\.(\d+)\])?:\s*/m
  const parts = content.split(/\n(?=[A-Z][A-Za-z0-9\s,()—–\-]+?(?:\s*\[p\.\d+\])?:\s*\n|[A-Z][A-Za-z0-9\s,()—–\-]+?(?:\s*\[p\.\d+\])?:[^\n])/m)
  const sections: { title: string; body: string; page?: number }[] = []
  for (const part of parts) {
    const m = headerRe.exec(part)
    if (m) {
      sections.push({ title: m[1].trim(), body: part.trim(), page: m[2] ? parseInt(m[2]) : undefined })
    } else if (sections.length === 0) {
      sections.push({ title: 'OVERVIEW', body: part.trim() })
    }
  }
  return sections.filter(s => s.body.length > 20)
}

function answerFromContext(question: string, context: string): { answer: string; page?: number } {
  // Strip the "PUBLICATION: ..." first-line preamble if present
  const bodyStart = context.indexOf('\n\n')
  const body = bodyStart >= 0 ? context.slice(bodyStart + 2).trim() : context.trim()

  const sections = parseSections(body)

  // Find which topic the question matches
  let targetHeaders: string[] = []
  for (const { test, headers } of TOPIC_MAP) {
    if (test.test(question)) { targetHeaders = headers; break }
  }

  // Score sections: exact header prefix match > partial match > body keyword match
  const q = question.toLowerCase()
  const scored = sections.map(s => {
    const titleUp = s.title.toUpperCase()
    const exact   = targetHeaders.some(h => titleUp.startsWith(h)) ? 10 : 0
    const partial = targetHeaders.some(h => titleUp.includes(h))   ?  5 : 0
    const body    = targetHeaders.some(h => s.body.toUpperCase().includes(h)) ? 2 : 0
    const words   = q.split(/\s+/).filter(w => w.length > 3)
    const wordHit = words.reduce((n, w) => n + (s.body.toLowerCase().includes(w) ? 1 : 0), 0)
    return { s, score: exact + partial + body + wordHit }
  }).sort((a, b) => b.score - a.score)

  const top = scored.filter(x => x.score > 0).slice(0, 2).map(x => x.s)
  const chosen = top.length > 0 ? top : sections.slice(0, 2)

  return {
    answer: chosen.map(s => s.body).join('\n\n').trim(),
    page: (top.length > 0 ? top[0] : sections[0])?.page,
  }
}

export async function POST(req: NextRequest) {
  const { question, context } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question required' }, { status: 400 })
  }

  const system = context
    ? `You are an ADB economist answering questions about a specific publication. Answer ONLY using the document content provided — do not use general knowledge or anything outside the provided content. If a specific detail is not in the document, say so explicitly. Cite exact figures, dates, and findings. Be direct and specific.`
    : SYSTEM

  const prompt = context
    ? `DOCUMENT CONTENT:\n${context}\n\n---\n\nQuestion: ${question}`
    : question

  // Pre-score sections to find cited page (fast, before AI call)
  const fallback = context ? answerFromContext(question, context) : undefined

  const aiResponse = await runAI(system, prompt)
  if (aiResponse) {
    if (fallback?.page) {
      const headers = new Headers(aiResponse.headers)
      headers.set('X-Cited-Page', String(fallback.page))
      headers.set('Access-Control-Expose-Headers', 'X-Cited-Page')
      return new Response(aiResponse.body, { headers, status: aiResponse.status })
    }
    return aiResponse
  }

  // No AI — answer from the publication context using keyword-aware section matching
  if (fallback) {
    return NextResponse.json({ answer: fallback.answer, page: fallback.page })
  }

  // No AI, no context — keyword-match very short simple questions
  if (question.length > 200) {
    return NextResponse.json({
      answer: 'Briefing notes are available without an API key for Pacific Island countries — try: "generate a briefing note for Papua New Guinea", Fiji, Tonga, Samoa, Solomon Islands, or Vanuatu.'
    })
  }

  const q = question.toLowerCase().trim()
  let answer = ''

  if (q.match(/^(hi|hello|hey|good morning|good afternoon|howdy|greetings)[\s!?.,]*$/)) {
    answer = "Hello! I'm the ERDI Intelligence Assistant. I can help with economics concepts, ADB data, Pacific SIDS analysis, and more. What would you like to explore?"
  } else if (q.match(/what (are|can) you do|who are you|what is erdi/)) {
    answer = "I'm the ERDI Intelligence Assistant — an AI economist for the ERDI Intelligence Hub. Ask me about economic indicators, country analysis, ADB publications, or use the Data Explorer for live charts."
  } else if (q.match(/what is gdp|define gdp/)) {
    answer = "GDP (Gross Domestic Product) measures the total value of goods and services produced in an economy. Real GDP growth — adjusted for inflation — is the primary gauge of economic expansion. View GDP growth trends for any economy in the Data Explorer."
  } else if (q.match(/what is adb|asian development bank/)) {
    answer = "The Asian Development Bank (ADB) is a multilateral development bank with 68 member countries, headquartered in Manila. It finances infrastructure, social development, and policy reform across Asia and the Pacific. This portal runs on ADB's Key Indicators Database."
  } else {
    answer = "I need the AI service to answer this. Please visit erdi-portal.vercel.app for the fully configured version, or add ANTHROPIC_API_KEY to .env.local for local development."
  }

  return NextResponse.json({ answer })
}
