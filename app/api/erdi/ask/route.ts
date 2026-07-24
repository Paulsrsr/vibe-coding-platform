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

const INDICATOR_CONTEXT: Record<string, { what: string; drivers: string; adb: string }> = {
  'government debt': {
    what: 'Government Debt as % of GDP measures the stock of public borrowing relative to economic output.',
    drivers: 'Rising debt typically reflects fiscal deficits driven by infrastructure spending, post-disaster reconstruction, or revenue shortfalls from commodity price shocks. In Pacific SIDS, grant financing and concessional loans from ADB and bilateral partners keep borrowing costs low, but debt sustainability remains a concern for smaller island economies with narrow revenue bases.',
    adb: 'ADB monitors debt sustainability through Debt Management Performance Assessments and provides budget support under the Pacific Financial Technical Assistance Programme.',
  },
  'gdp growth': {
    what: 'Real GDP Growth measures the annual percentage change in economic output, adjusted for inflation.',
    drivers: 'In Pacific economies, growth is driven by tourism receipts, commodity exports (LNG, gold, palm oil), remittance inflows, and donor-funded public investment. Cyclone damage, global commodity price swings, and slowdowns in key remittance-source countries (Australia, New Zealand) are the main downside risks.',
    adb: 'ADB\'s Asian Development Outlook (ADO) provides twice-yearly GDP growth forecasts for all Asia-Pacific economies. The KIDB tracks real GDP growth under the PPL flow.',
  },
  'inflation': {
    what: 'Consumer Price Inflation (CPI) measures the annual percentage change in the average price level of goods and services.',
    drivers: 'In small open Pacific economies, inflation is predominantly imported — driven by global food and fuel prices. Domestic supply constraints, post-cyclone rebuilding demand, and elevated freight costs amplify imported inflation. Central banks in larger economies (PNG, Fiji) use reserve money targeting and interest rate policy to anchor expectations.',
    adb: 'ADB tracks CPI inflation via the KIDB PCPI_PC_PP_PT indicator (MFP flow). ADO supplement tables provide annual inflation forecasts.',
  },
  'remittance': {
    what: 'Remittance inflows measure the personal transfers and compensation sent home by workers abroad.',
    drivers: 'Pacific SIDS are among the most remittance-dependent economies globally. Tonga and Samoa receive remittances exceeding 20% of GDP, primarily from diaspora communities in Australia and New Zealand. Australia\'s Pacific Labour Scheme and Seasonal Worker Programme have been major drivers of recent growth in remittance receipts.',
    adb: 'ADB tracks remittances under the KIDB GLB flow (BX_TRF_PWKR_CD_DT). The Pacific Economic Monitor includes dedicated remittance analysis each issue.',
  },
  'fdi': {
    what: 'Foreign Direct Investment (FDI) inflows measure cross-border investment in productive capacity — equity, reinvested earnings, and debt instruments.',
    drivers: 'Pacific FDI is concentrated in mining (PNG), tourism infrastructure (Fiji, Palau), and telecommunications. Chinese investment has grown significantly in infrastructure. Investment climate constraints include land tenure complexity, small domestic markets, and distance from global supply chains.',
    adb: 'ADB supports FDI facilitation through the Pacific Private Sector Development Initiative and Public-Private Partnership frameworks. KIDB tracks FDI via BX_KLT_DINV_CD_WD (GLB flow).',
  },
  'current account': {
    what: 'The Current Account Balance measures the net flow of goods, services, income, and transfers between an economy and the rest of the world.',
    drivers: 'Pacific SIDS typically run current account deficits reflecting import dependence for food, fuel, and manufactured goods. Tourism surpluses (Fiji, Palau) and remittance inflows (Tonga, Samoa) partially offset trade deficits. Post-cyclone years see wider deficits due to import surges for reconstruction materials.',
    adb: 'KIDB tracks current account balance under BN_CAB_XOKA_GD_ZS (GLB flow). ADB\'s annual Key Indicators publication includes balance of payments tables for all DMCs.',
  },
  'exchange rate': {
    what: 'The exchange rate measures the price of one currency in terms of another (here, domestic currency per USD).',
    drivers: 'Most Pacific SIDS maintain pegged or tightly managed exchange rates to limit imported inflation and support remittance value. PNG\'s kina and Fiji\'s dollar are managed floats. Currency depreciation raises import costs and can widen fiscal deficits through higher external debt servicing.',
    adb: 'KIDB tracks exchange rates via ENDE_XDC_USD_RATE (MFP flow). ADB provides foreign exchange technical assistance through the Pacific Financial Technical Assistance Centre.',
  },
  'unemployment': {
    what: 'The unemployment rate measures the share of the labour force actively seeking but unable to find employment.',
    drivers: 'Pacific labour markets are characterised by large informal sectors, subsistence agriculture, and urban-rural migration. Youth unemployment is structurally elevated. Seasonal labour schemes to Australia and New Zealand provide an important safety valve for surplus labour in Samoa, Tonga, and Vanuatu.',
    adb: 'KIDB tracks unemployment under LUR_PT (PPL flow). ADB\'s Asia-Pacific labour market analysis is published in the Key Indicators annual flagship.',
  },
  'household consumption': {
    what: 'Household Final Consumption Expenditure Growth measures the annual change in spending by households on goods and services.',
    drivers: 'Consumption growth in Pacific economies tracks remittance flows, tourism-linked income, and public sector wages. Post-cyclone household spending typically falls sharply before recovering as reconstruction wages circulate. In PNG, resource boom spillovers (LNG royalties, contractor wages) have boosted urban consumption.',
    adb: 'KIDB tracks household consumption growth via NC_HFC_PTX_PS (PPL flow). ADB\'s country poverty assessments include household consumption and welfare analysis.',
  },
  'money supply': {
    what: 'Broad Money (M2) as % of GDP measures the depth of the financial system and the stock of liquid financial assets relative to economic output.',
    drivers: 'Rising M2/GDP signals financial deepening and expanding credit. In Pacific SIDS, foreign reserves accumulation (from remittances and aid inflows) and central bank liquidity injections drive money supply growth. Rapid M2 growth without matching output growth typically leads to inflationary pressure.',
    adb: 'KIDB tracks M2/GDP under FM_LBL_MONY_GD_ZS (MFP flow). ADB supports financial sector development through Pacific financial stability assessments.',
  },
  'gdp per capita': {
    what: 'GDP per capita (in local currency) measures average economic output per person, a basic proxy for living standards.',
    drivers: 'Pacific per-capita income growth reflects a combination of aggregate output performance and demographic change. Population growth (PNG) can dilute per-capita gains even when headline GDP expands. Fiji and Palau, with stronger tourism sectors, have higher per-capita incomes than resource-rich but populous PNG.',
    adb: 'KIDB tracks GDP per capita via NGDPPC_XDC (PPL flow). ADB\'s annual Key Indicators flags per-capita milestones for all DMCs.',
  },
}

function buildChartExplanation(chartTitle: string): string {
  const t = chartTitle.toLowerCase()
  let match: typeof INDICATOR_CONTEXT[string] | undefined

  for (const [key, val] of Object.entries(INDICATOR_CONTEXT)) {
    if (t.includes(key)) { match = val; break }
  }

  if (!match) {
    return `This chart tracks economic performance across the selected Pacific economies using ADB Key Indicators Database (KIDB) data. Trends typically reflect a combination of domestic policy choices, external demand conditions, and structural vulnerabilities common to small open economies. Use the Data Explorer to compare across different time periods or add more economies to the view.`
  }

  return `${match.what}\n\n${match.drivers}\n\n${match.adb}`
}

function buildGeneralAnswer(q: string): string | null {
  for (const [key, val] of Object.entries(INDICATOR_CONTEXT)) {
    if (q.includes(key)) {
      return `${val.what}\n\n${val.drivers}`
    }
  }
  return null
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

  // No AI, no context — try keyword responses or generate from chart data embedded in the question
  const q = question.toLowerCase().trim()

  if (q.match(/^(hi|hello|hey|good morning|good afternoon|howdy|greetings)[\s!?.,]*$/)) {
    return NextResponse.json({ answer: "Hello! I'm the ERDI Intelligence Assistant. I can help with economics concepts, ADB data, Pacific SIDS analysis, and more. What would you like to explore?" })
  }
  if (q.match(/what (are|can) you do|who are you|what is erdi/)) {
    return NextResponse.json({ answer: "I'm the ERDI Intelligence Assistant — an AI economist for the ERDI Intelligence Hub. Ask me about economic indicators, country analysis, ADB publications, or use the Data Explorer for live charts." })
  }
  if (q.match(/what is gdp|define gdp/)) {
    return NextResponse.json({ answer: "GDP (Gross Domestic Product) measures the total value of goods and services produced in an economy. Real GDP growth — adjusted for inflation — is the primary gauge of economic expansion. View GDP growth trends for any economy in the Data Explorer." })
  }
  if (q.match(/what is adb|asian development bank/)) {
    return NextResponse.json({ answer: "The Asian Development Bank (ADB) is a multilateral development bank with 68 member countries, headquartered in Manila. It finances infrastructure, social development, and policy reform across Asia and the Pacific. This portal runs on ADB's Key Indicators Database." })
  }

  // Chart explain queries — synthesise an answer from indicator knowledge
  const explainMatch = question.match(/explain the trends shown in:\s*(.+)/i)
  if (explainMatch) {
    const title = explainMatch[1].trim()
    const answer = buildChartExplanation(title)
    return NextResponse.json({ answer })
  }

  // General economics questions — answer from indicator knowledge base
  const generalAnswer = buildGeneralAnswer(q)
  if (generalAnswer) return NextResponse.json({ answer: generalAnswer })

  return NextResponse.json({
    answer: 'For a deeper analysis, add ANTHROPIC_API_KEY to .env.local. The Data Explorer and Portfolio Map work fully without an API key using live ADB Data.'
  })
}
