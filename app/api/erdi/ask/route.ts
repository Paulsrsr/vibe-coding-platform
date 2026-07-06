import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { Models } from '@/ai/constants'

const SYSTEM = `You are the ERDI Intelligence Assistant — an AI economist embedded in the ADB ERDI (Economic Research and Development Impact) Data Portal.

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
- Explain what the portal's features do (Map, Data Explorer, Briefings, Publications)

PORTAL FEATURES YOU KNOW ABOUT:
- Portfolio Map: shows live ADB Data indicator data with country-by-country breakdowns
- Data Explorer: natural language queries mapped to ADB Data SDMX data, rendered as charts with PNG/CSV export
- Intelligence Briefing: curated economic articles with indicator-linked "Why has this changed?" analysis
- Publications: ADB flagship reports including ADO and Economic Monitor series

DATA SOURCES IN THIS PORTAL (be specific when asked):
The Data Explorer and Portfolio Map are powered by the ADB Key Indicators Database (ADB Data), accessed via the ADB Data SDMX REST API at adb.org.

Available indicators and their ADB Data codes:
- Real GDP Growth (NGDP_R_PTX_PS) — Dataflow: PPL · Unit: % change
- GDP per Capita (NGDPPC_XDC) — Dataflow: PPL · Unit: USD
- Household Consumption Growth (NC_HFC_PTX_PS) — Dataflow: PPL · Unit: % change
- Unemployment Rate (LUR_PT) — Dataflow: PPL · Unit: %
- Consumer Price Inflation / CPI (PCPI_PC_PP_PT) — Dataflow: MFP · Unit: % change
- Exchange Rate (ENDE_XDC_USD_RATE) — Dataflow: MFP · Unit: LCU/USD
- M2 Money Supply Growth (FM_LBL_MONY_GD_ZS) — Dataflow: MFP · Unit: %
- Government Debt / GDP (GC_DOD_TOTL_GD_ZS) — Dataflow: GLB · Unit: %
- Remittance Inflows (BX_TRF_PWKR_CD_DT) — Dataflow: GLB · Unit: USD million
- FDI Inflows (BX_KLT_DINV_CD_WD) — Dataflow: GLB · Unit: USD million
- Current Account Balance (BN_CAB_XOKA_GD_ZS) — Dataflow: GLB · Unit: % of GDP

Dataflow categories: PPL = National Accounts & Labour, MFP = Money/Finance/Prices, GLB = Globalization & External Sector

Coverage: 40+ ADB member economies across Pacific, South Asia, Southeast Asia, East Asia, and Central/West Asia. Annual data, typically 2000–2024.

The Intelligence Briefing articles are based on ADB flagship publications: Asian Development Outlook (ADO), Pacific Economic Monitor, and ADB Economics Working Papers.

RESPONSE STYLE:
- Be warm, concise, and direct. Lead with the answer, then add context.
- For greetings or meta-questions about yourself, explain what you can do broadly — do not frame yourself as limited to any single region
- For data questions, point users to the Data Explorer for live figures
- Keep responses under 200 words unless the user asks for depth
- No markdown bold (**text**) — plain text only
- Write for a professional economist audience but stay accessible`

export async function POST(req: NextRequest) {
  const { question, context } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question required' }, { status: 400 })
  }

  const hasGateway = process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_BASE_URL

  if (hasGateway) {
    try {
      const { model } = getModelOptions(Models.AnthropicClaudeSonnet46)
      // When document context is provided, use a grounded system prompt
      const system = context
        ? `You are an ADB economist answering questions about a specific publication. Answer ONLY using the document content provided in the user message. Do not use general knowledge or information outside the provided content. If the specific detail is not in the document, say so explicitly. Cite exact figures, dates, and findings from the document. Be direct and specific — no generic explanations.`
        : SYSTEM
      const prompt = context
        ? `DOCUMENT CONTENT:\n${context}\n\n---\n\nQuestion: ${question}`
        : question
      const result = streamText({ model, system, prompt })
      return result.toTextStreamResponse()
    } catch (err) {
      console.warn('[erdi/ask] streaming failed, falling back:', err)
    }
  }

  // When context is provided but no gateway, return a clear message
  if (context) {
    return NextResponse.json({ answer: 'AI service is required to answer questions about this publication. Please ensure the AI gateway is configured.' })
  }

  // Fallback when no AI gateway is configured
  const q = question.toLowerCase().trim()
  let answer = ''

  if (q.match(/^(hi|hello|hey|good morning|good afternoon|howdy|greetings|sup|yo)[\s!?.,]*$/)) {
    answer = "Hello! I'm the ERDI Intelligence Assistant — your AI economist for the ADB Data Portal.\n\nI can help you with:\n• Economics concepts and indicators (GDP, inflation, debt, remittances, FDI)\n• Economic analysis across Asia, the Pacific, and emerging markets\n• ADB publications: ADO, Key Indicators, Economic Monitor series\n• Navigating this portal — the Map, Data Explorer, and Intelligence Briefing\n• General questions on any topic\n\nWhat would you like to explore?"
  } else if (q.match(/what (are|can) you do|what is erdi|who are you|what is this|help me|how does this work/)) {
    answer = "I'm the ERDI Intelligence Assistant, an AI economist embedded in this ADB Data Portal.\n\nHere's what I can help with:\n• Explain economic concepts and what indicators mean\n• Provide context on economies across Asia, the Pacific, and beyond\n• Point you to the right data — use the Data Explorer tab to chart live ADB Data figures for any indicator\n• Summarise ADB publications like the Asian Development Outlook (ADO)\n• Answer general questions beyond economics too\n\nTry asking something like: 'Why is government debt rising?' or 'What drives inflation in small island economies?'"
  } else if (q.match(/what is gdp|define gdp|explain gdp/)) {
    answer = "GDP (Gross Domestic Product) measures the total value of goods and services produced in an economy over a period. Real GDP growth — adjusted for inflation — is the primary gauge of economic expansion or contraction.\n\nGrowth drivers vary by economy: commodity exports, tourism receipts, remittance inflows, and public investment all play roles depending on a country's structure. You can view GDP growth trends for any economy in the Data Explorer."
  } else if (q.match(/inflation|cpi|consumer price/)) {
    answer = "Inflation measures how fast prices rise, tracked via the Consumer Price Index (CPI). Small open economies are especially exposed to imported inflation — they import most of their food, fuel, and manufactured goods, so global price shocks pass through rapidly.\n\nUse the Data Explorer to compare CPI trends across economies and time periods."
  } else if (q.match(/remittance/)) {
    answer = "Remittances are funds sent home by workers abroad. They are a critical income source for many developing economies — in some cases exceeding official development assistance and foreign direct investment combined.\n\nDigital transfer platforms have cut average transfer costs significantly since 2020, boosting net household receipts. Check the Data Explorer for remittance inflow trends by country."
  } else if (q.match(/debt|fiscal sustainability/)) {
    answer = "Government debt as a share of GDP measures fiscal sustainability. Many economies borrowed heavily during COVID-19 for emergency spending, pushing debt ratios sharply higher.\n\nADB uses Debt Sustainability Analysis (DSA) to classify distress risk, which determines whether countries receive loans or grants. The portfolio map tracks Debt/GDP in real time."
  } else if (q.match(/adb|asian development bank/)) {
    answer = "The Asian Development Bank (ADB) is a multilateral development bank headquartered in Manila with 68 member countries. It finances infrastructure, social development, and policy reform across Asia and the Pacific through concessional loans and grants.\n\nThis portal is built on ADB Data — the ADB Key Indicators Database — which underpins the Data Explorer and Portfolio Map."
  } else if (q.match(/fdi|foreign direct investment/)) {
    answer = "Foreign Direct Investment (FDI) is long-term investment by foreign entities into productive assets in a host economy. FDI drives capital formation, technology transfer, and employment creation.\n\nUse the Data Explorer to chart FDI inflows by country and compare trends since 2019."
  } else if (q.match(/what data (are you|do you|does this|is this)|where does (the )?data (come|originate)|data source|what (database|source|api)|where (is|does) (the )?data (come|sourced|from)|what information (do you|are you)|powered by|underpinned by/)) {
    answer = "The Data Explorer and Portfolio Map are powered by the ADB Key Indicators Database (ADB Data), accessed via the ADB Data SDMX REST API at adb.org.\n\nAvailable indicators:\n• Real GDP Growth (NGDP_R_PTX_PS)\n• GDP per Capita (NGDPPC_XDC)\n• Consumer Price Inflation / CPI (PCPI_PC_PP_PT)\n• Government Debt / GDP (GC_DOD_TOTL_GD_ZS)\n• Remittance Inflows (BX_TRF_PWKR_CD_DT)\n• FDI Inflows (BX_KLT_DINV_CD_WD)\n• Current Account Balance (BN_CAB_XOKA_GD_ZS)\n• Unemployment Rate (LUR_PT)\n• Exchange Rate (ENDE_XDC_USD_RATE)\n• M2 Money Supply Growth (FM_LBL_MONY_GD_ZS)\n• Household Consumption Growth (NC_HFC_PTX_PS)\n\nData spans 40+ ADB member economies across Asia and the Pacific. Coverage is annual, typically 2000–2024.\n\nThe Intelligence Briefing articles draw on ADB flagship publications: the Asian Development Outlook (ADO), Pacific Economic Monitor, and ADB Economics Working Papers."
  } else if (q.match(/data explorer|how do i search|how do i use|how does (the )?explorer work/)) {
    answer = "The Data Explorer lets you query live ADB Data data using plain English. Just describe what you want — for example: 'GDP growth since 2019' or 'Compare inflation across economies'.\n\nFor explanatory questions ('What is GDP?' or 'Why does inflation rise?'), the explorer routes your query to the ERDI AI which answers with cited sources. For data queries, it pulls the relevant ADB Data indicator and renders a chart you can export as PNG or CSV."
  } else {
    answer = `I don't have a tailored offline response for "${question}", but when the AI service is connected I can answer this fully.\n\nIn the meantime: if this is a data question, head to the Data Explorer tab and type it there — the ADB Data query engine will find the right indicator. For economics concepts or ADB context, try a more specific question and I'll do my best.`
  }

  return NextResponse.json({ answer })
}
