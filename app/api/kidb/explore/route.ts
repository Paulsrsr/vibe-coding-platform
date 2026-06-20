import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getModelOptions } from '@/ai/gateway'
import { Models } from '@/ai/constants'

const ChartConfig = z.object({
  indicator:      z.string(),
  indicatorLabel: z.string(),
  flow:           z.enum(['PPL', 'MFP', 'GLB', 'ENV', 'SDG']),
  economies:      z.array(z.string()),
  startPeriod:    z.number(),
  endPeriod:      z.number(),
  chartType:      z.enum(['line', 'bar']),
  unit:           z.string(),
  title:          z.string(),
  description:    z.string(),
})

export type ChartConfigType = z.infer<typeof ChartConfig>

// ── Economy labels (ADB codes) ─────────────────────────────────────────────
const ECO_LABELS: Record<string, string> = {
  // Pacific
  PNG: 'Papua New Guinea', FIJ: 'Fiji',   VAN: 'Vanuatu',
  SOL: 'Solomon Islands',  TON: 'Tonga',  SAM: 'Samoa',
  COO: 'Cook Islands',     KIR: 'Kiribati', MHL: 'Marshall Islands',
  FSM: 'Micronesia',       NAU: 'Nauru',  PAL: 'Palau', TUV: 'Tuvalu',
  NZL: 'New Zealand',      AUS: 'Australia', PA: 'Pacific',
  // South Asia
  AFG: 'Afghanistan', BAN: 'Bangladesh', BHU: 'Bhutan',
  IND: 'India', MLD: 'Maldives', NEP: 'Nepal', PAK: 'Pakistan', SRI: 'Sri Lanka',
  // Southeast Asia
  BRU: 'Brunei', CAM: 'Cambodia', INO: 'Indonesia',
  LAO: 'Lao PDR', MAL: 'Malaysia', MYA: 'Myanmar', PHI: 'Philippines',
  SIN: 'Singapore', THA: 'Thailand', TIM: 'Timor-Leste', VIE: 'Viet Nam',
  // East Asia
  PRC: 'China', HKG: 'Hong Kong, China', JPN: 'Japan',
  KOR: 'Korea', MON: 'Mongolia',
  // Central and West Asia
  ARM: 'Armenia', AZE: 'Azerbaijan', GEO: 'Georgia',
  KAZ: 'Kazakhstan', KGZ: 'Kyrgyz Republic', TAJ: 'Tajikistan', UZB: 'Uzbekistan',
}
const ALL_PACIFIC    = ['PNG', 'FIJ', 'VAN', 'SOL', 'TON', 'SAM']
const ALL_ASEAN      = ['INO', 'PHI', 'VIE', 'THA', 'MAL', 'SIN']
const ALL_SOUTH_ASIA = ['IND', 'PAK', 'BAN', 'SRI', 'NEP']

// ── Rule-based parser (no API key required) ────────────────────────────────
function parseWithRules(query: string): ChartConfigType {
  const q = query.toLowerCase()

  // Economy matching
  const ecos: string[] = []

  // Pacific
  if (q.match(/\bpng\b|\bpapua/))                      ecos.push('PNG')
  if (q.match(/\bfiji\b|\bfij\b/))                     ecos.push('FIJ')
  if (q.match(/\bvanuatu\b|\bvan\b/))                   ecos.push('VAN')
  if (q.match(/\bsolomon\b|\bsol\b/))                   ecos.push('SOL')
  if (q.match(/\btonga\b|\bton\b/))                     ecos.push('TON')
  if (q.match(/\bsamoa\b|\bsam\b/))                     ecos.push('SAM')
  if (q.match(/\bkiribati\b/))                          ecos.push('KIR')
  if (q.match(/\bnauru\b/))                             ecos.push('NAU')
  if (q.match(/\btuvalu\b/))                            ecos.push('TUV')
  if (q.match(/\bnew zealand\b|\bnzl\b/))              ecos.push('NZL')
  if (q.match(/\baustralia\b|\baus\b/))                 ecos.push('AUS')
  // South Asia
  if (q.match(/\bindia\b|\bind\b/))                    ecos.push('IND')
  if (q.match(/\bpakistan\b|\bpak\b/))                 ecos.push('PAK')
  if (q.match(/\bbangladesh\b|\bban\b/))               ecos.push('BAN')
  if (q.match(/\bsri lanka\b|\bsri\b/))               ecos.push('SRI')
  if (q.match(/\bnepal\b|\bnep\b/))                   ecos.push('NEP')
  if (q.match(/\bbhutan\b/))                           ecos.push('BHU')
  if (q.match(/\bmaldives\b/))                         ecos.push('MLD')
  if (q.match(/\bafghanistan\b|\bafg\b/))             ecos.push('AFG')
  // Southeast Asia
  if (q.match(/\bindonesia\b|\bino\b/))               ecos.push('INO')
  if (q.match(/\bphilippines\b|\bphil\b|\bphi\b/))   ecos.push('PHI')
  if (q.match(/\bviet.?nam\b|\bvietnam\b|\bvie\b/))  ecos.push('VIE')
  if (q.match(/\bthailand\b|\btha\b/))                ecos.push('THA')
  if (q.match(/\bmalaysia\b|\bmal\b/))                ecos.push('MAL')
  if (q.match(/\bsingapore\b|\bsin\b/))               ecos.push('SIN')
  if (q.match(/\bcambodia\b|\bcam\b/))                ecos.push('CAM')
  if (q.match(/\bmyanmar\b|\bburma\b/))               ecos.push('MYA')
  if (q.match(/\blao\b|\blaos\b/))                    ecos.push('LAO')
  if (q.match(/\btimor.?leste\b|\btimor\b/))          ecos.push('TIM')
  // East Asia
  if (q.match(/\bchina\b|\bprc\b/))                   ecos.push('PRC')
  if (q.match(/\bjapan\b|\bjpn\b/))                   ecos.push('JPN')
  if (q.match(/\bkorea\b|\bkor\b/))                   ecos.push('KOR')
  if (q.match(/\bmongolia\b|\bmon\b/))                ecos.push('MON')
  if (q.match(/\bhong kong\b/))                        ecos.push('HKG')
  // Central and West Asia
  if (q.match(/\bkazakhstan\b|\bkaz\b/))              ecos.push('KAZ')
  if (q.match(/\buzbekistan\b|\buzb\b/))              ecos.push('UZB')
  if (q.match(/\bazerbaijan\b/))                       ecos.push('AZE')
  if (q.match(/\bgeorgia\b|\bgeo\b/))                 ecos.push('GEO')
  if (q.match(/\barmenia\b/))                          ecos.push('ARM')
  if (q.match(/\bkyrgyz\b/))                           ecos.push('KGZ')
  if (q.match(/\btajikistan\b/))                       ecos.push('TAJ')
  // Region shortcuts
  if (q.match(/south.?east.?asian?|asean/))         ALL_ASEAN.forEach(e => ecos.includes(e) || ecos.push(e))
  if (q.match(/south.?asian?\b/))                   ALL_SOUTH_ASIA.forEach(e => ecos.includes(e) || ecos.push(e))
  if (q.match(/\bpacific\b|\bsids\b/))             ALL_PACIFIC.forEach(e => ecos.includes(e) || ecos.push(e))
  // Default: Pacific SIDS when no economy mentioned
  if (ecos.length === 0) ALL_PACIFIC.forEach(e => ecos.push(e))

  const economies = [...new Set(ecos)]

  // Indicator
  type IndDef = { code: string; label: string; flow: string; unit: string }
  let ind: IndDef = { code: 'NGDP_R_PTX_PS', label: 'Real GDP Growth Rate', flow: 'PPL', unit: '% chg' }

  if      (q.match(/gdp.per.capita|income.per.capita|gdp per person/))
    ind = { code: 'NGDPPC_XDC',         label: 'GDP per Capita',               flow: 'PPL', unit: 'USD' }
  else if (q.match(/inflation|cpi|consumer.price|price level/))
    ind = { code: 'PCPI_PC_PP_PT',      label: 'Consumer Price Inflation',      flow: 'MFP', unit: '% chg' }
  else if (q.match(/remittance/))
    ind = { code: 'BX_TRF_PWKR_CD_DT', label: 'Remittance Inflows',            flow: 'GLB', unit: 'USD mn' }
  else if (q.match(/\bfdi\b|foreign direct investment/))
    ind = { code: 'BX_KLT_DINV_CD_WD', label: 'FDI Inflows',                   flow: 'GLB', unit: 'USD mn' }
  else if (q.match(/debt|fiscal stress/))
    ind = { code: 'GC_DOD_TOTL_GD_ZS', label: 'Government Debt / GDP',         flow: 'GLB', unit: '%' }
  else if (q.match(/current account|trade balance|current acct/))
    ind = { code: 'BN_CAB_XOKA_GD_ZS', label: 'Current Account Balance',       flow: 'GLB', unit: '% GDP' }
  else if (q.match(/unemploy|employment rate/))
    ind = { code: 'LUR_PT',             label: 'Unemployment Rate',             flow: 'PPL', unit: '%' }
  else if (q.match(/consumption/))
    ind = { code: 'NC_HFC_PTX_PS',      label: 'Household Consumption Growth',  flow: 'PPL', unit: '% chg' }
  else if (q.match(/exchange.rate|currency|forex/))
    ind = { code: 'ENDE_XDC_USD_RATE',  label: 'Exchange Rate',                 flow: 'MFP', unit: 'LCU/USD' }
  else if (q.match(/\bm2\b|money supply/))
    ind = { code: 'FM_LBL_MONY_GD_ZS', label: 'M2 Money Supply Growth',        flow: 'MFP', unit: '%' }
  else if (q.match(/poverty|poor/))
    ind = { code: 'SI_POV_DDAY',        label: 'Population below $3/day',       flow: 'SDG', unit: '%' }
  else if (q.match(/gdp|growth|economy|economic/))
    ind = { code: 'NGDP_R_PTX_PS',     label: 'Real GDP Growth Rate',           flow: 'PPL', unit: '% chg' }

  // Time range
  let startPeriod = 2019, endPeriod = 2024
  const years = [...q.matchAll(/\b(20\d\d)\b/g)].map(m => parseInt(m[1]))
  if (years.length >= 2) { startPeriod = Math.min(...years); endPeriod = Math.max(...years) }
  else if (q.match(/10.year|decade/))   startPeriod = 2014
  else if (q.match(/5.year|five.year/)) startPeriod = 2019
  else if (q.match(/since (\d{4})/)) {
    const m = q.match(/since (20\d\d)/)
    if (m) startPeriod = parseInt(m[1])
  }

  // Chart type: bar for comparisons, line for trends
  const isBar = !!(q.match(/compare|rank|highest|lowest|which|top|most|least/) && !q.match(/over.time|trend|history|changed|since/))
  const chartType: 'line' | 'bar' = isBar ? 'bar' : 'line'

  const ecoNames = economies.map(e => ECO_LABELS[e] ?? e)
  const econLabel = economies.length > 3 ? `${economies.length} economies` : ecoNames.join(', ')

  return {
    indicator:      ind.code,
    indicatorLabel: ind.label,
    flow:           ind.flow as ChartConfigType['flow'],
    economies,
    startPeriod,
    endPeriod,
    chartType,
    unit:           ind.unit,
    title:          `${ind.label} — ${econLabel}`,
    description:    `Showing ${ind.label} (${ind.code}) for ${econLabel}, ${startPeriod}–${endPeriod}.`,
  }
}

// ── AI system prompt ───────────────────────────────────────────────────────
const SYSTEM = `You are an expert on the ADB Key Indicators Database (KIDB) SDMX REST API.
Convert the user's natural language question into a structured chart config using exact KIDB codes.

Dataflows: PPL (National Accounts), MFP (Money/Finance/Prices), GLB (Globalization), ENV (Environment), SDG (SDGs)

Indicator codes:
  NGDP_R_PTX_PS    Real GDP Growth (% chg) — PPL
  NGDPPC_XDC       GDP per Capita (USD) — PPL
  NC_HFC_PTX_PS    Household Consumption Growth (% chg) — PPL
  LUR_PT           Unemployment Rate (%) — PPL
  PCPI_PC_PP_PT    CPI Inflation (% chg) — MFP
  ENDE_XDC_USD_RATE Exchange Rate (LCU/USD) — MFP
  FM_LBL_MONY_GD_ZS M2 Growth (%) — MFP
  GC_DOD_TOTL_GD_ZS Govt Debt/GDP (%) — GLB
  BX_TRF_PWKR_CD_DT Remittances (USD mn) — GLB
  BX_KLT_DINV_CD_WD FDI Inflows (USD mn) — GLB
  BN_CAB_XOKA_GD_ZS Current Account (% GDP) — GLB

ADB economy codes — Pacific: PNG FIJ VAN SOL TON SAM KIR TUV NAU NZL AUS PA
South Asia: IND PAK BAN SRI NEP BHU MLD AFG
SE Asia: INO PHI VIE THA MAL SIN CAM MYA LAO TIM
East Asia: PRC JPN KOR MON HKG
Central/West Asia: KAZ UZB AZE GEO ARM KGZ TAJ

Default: all 6 Pacific SIDS (PNG FIJ VAN SOL TON SAM), 2019–2024. line=trends, bar=comparisons.`

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'Query required' }, { status: 400 })

    // Use AI only when gateway is fully configured
    const hasGateway = process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_BASE_URL
    if (hasGateway) {
      try {
        const { model } = getModelOptions(Models.AnthropicClaudeSonnet46)
        const { object } = await generateObject({ model, schema: ChartConfig, system: SYSTEM, prompt: query })
        return NextResponse.json({ ...object, _source: 'ai' })
      } catch (aiErr) {
        console.warn('[kidb/explore] AI failed, falling back to rules:', aiErr)
      }
    }

    // Rule-based fallback — works with zero configuration
    const result = parseWithRules(query)
    return NextResponse.json({ ...result, _source: 'rules' })
  } catch (err) {
    console.error('[kidb/explore]', err)
    return NextResponse.json({ error: 'Failed to parse query' }, { status: 500 })
  }
}
