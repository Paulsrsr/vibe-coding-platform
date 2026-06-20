'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChartConfigType } from '@/app/api/kidb/explore/route'
// ECONOMIES imported for type safety but ECO_LABELS defined locally for display
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ECONOMIES } from '@/app/api/kidb/route'
import { D3LineChart, D3BarChart, ChartLegend, type ChartData, type KidbObs } from './_d3-charts'

const adb = {
  navy: 'var(--th-bg)', navyCard: 'var(--th-card)', navyBorder: 'var(--th-border)',
  blue: '#007DB7', blueLight: '#68C5EA', green: '#8DC63F',
  amber: '#FDB915', red: '#E9532B', teal: '#00A5D2',
  white: '#FFFFFF', muted: 'var(--th-muted)',
  font: '"Ideal Sans", "Helvetica Neue", Arial, sans-serif',
}

const SUGGESTIONS = [
  'GDP growth for India, China, and Indonesia since 2019',
  'Compare debt-to-GDP across Pacific SIDS',
  'Inflation trends in Tonga, Fiji, and Samoa',
  'Remittance inflows for Philippines, Bangladesh, and Pakistan',
  'Which Pacific country has the highest unemployment rate?',
  'FDI inflows for Southeast Asia since 2019',
  'GDP per capita for South Asian economies',
  'Current account balance for Korea and Malaysia over time',
  'Exchange rate trends for Indonesia and Vietnam',
  'Household consumption growth across Pacific islands',
]

const FOLLOW_UP_MAP: Record<string, (ecos: string[], yr?: number) => string[]> = {
  NGDP_R_PTX_PS:     (e, yr) => [`Why is GDP growth changing in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare inflation over the same period`, `Government debt trajectory for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')}`, `FDI inflows for ${ECO_LABELS[e[0]] ?? e[0]} since ${yr ?? 2019}`, `Household consumption growth across the same economies`],
  PCPI_PC_PP_PT:      (e, yr) => [`What drives inflation in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Exchange rate trends for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')} since ${yr ?? 2019}`, `Compare GDP growth over the same period`, `M2 money supply growth for ${ECO_LABELS[e[0]] ?? e[0]}`, `Remittance inflows for ${ECO_LABELS[e[0]] ?? e[0]}`],
  GC_DOD_TOTL_GD_ZS:  (e, yr) => [`Why is government debt rising in ${ECO_LABELS[e[0]] ?? e[0]}?`, `GDP growth for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')} since ${yr ?? 2019}`, `Current account balance for the same economies`, `FDI inflows for ${ECO_LABELS[e[0]] ?? e[0]}`, `Compare inflation over the same period`],
  BX_TRF_PWKR_CD_DT:  (e, yr) => [`How do remittances affect GDP in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare FDI inflows for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')}`, `Household consumption growth for the same economies`, `GDP per capita for ${ECO_LABELS[e[0]] ?? e[0]} since ${yr ?? 2019}`, `Current account balance for ${ECO_LABELS[e[0]] ?? e[0]}`],
  BX_KLT_DINV_CD_WD:  (e, yr) => [`Why is FDI changing in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare GDP growth for the same economies`, `Exchange rate trends for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')} since ${yr ?? 2019}`, `Current account balance for ${ECO_LABELS[e[0]] ?? e[0]}`, `Remittances vs FDI for the Pacific`],
  LUR_PT:             (e)     => [`What's driving unemployment in ${ECO_LABELS[e[0]] ?? e[0]}?`, `GDP growth vs unemployment for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')}`, `Household consumption growth for the same economies`, `Compare remittance inflows`],
  BN_CAB_XOKA_GD_ZS:  (e, yr) => [`What explains the current account deficit in ${ECO_LABELS[e[0]] ?? e[0]}?`, `FDI inflows for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')} since ${yr ?? 2019}`, `Exchange rate trends for the same economies`, `Government debt as % of GDP for ${ECO_LABELS[e[0]] ?? e[0]}`],
  NC_HFC_PTX_PS:      (e, yr) => [`What's driving consumption growth in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare inflation for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')} since ${yr ?? 2019}`, `Remittance inflows for ${ECO_LABELS[e[0]] ?? e[0]}`, `GDP growth for the same economies`],
  ENDE_XDC_USD_RATE:   (e, yr) => [`How does exchange rate affect inflation in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Current account balance for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')}`, `FDI inflows for ${ECO_LABELS[e[0]] ?? e[0]} since ${yr ?? 2019}`, `M2 money supply growth for the same economies`],
  FM_LBL_MONY_GD_ZS:  (e)     => [`How does money supply growth affect inflation in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare CPI inflation for the same economies`, `Exchange rate trends for ${ECO_LABELS[e[0]] ?? e[0]}`, `GDP growth for the same economies`],
  NGDPPC_XDC:         (e, yr) => [`What's driving GDP per capita growth in ${ECO_LABELS[e[0]] ?? e[0]}?`, `Compare real GDP growth for the same economies since ${yr ?? 2019}`, `Household consumption growth for ${(e.slice(0,2).map(c => ECO_LABELS[c] ?? c)).join(' and ')}`, `FDI inflows for ${ECO_LABELS[e[0]] ?? e[0]}`],
}

function getFollowUps(cfg: ChartConfigType): string[] {
  const yr = cfg.startPeriod ? parseInt(cfg.startPeriod) : undefined
  const fn = FOLLOW_UP_MAP[cfg.indicator]
  return fn ? fn(cfg.economies, yr) : SUGGESTIONS.slice(0, 5)
}

const ECO_LABELS: Record<string, string> = {
  PNG: 'Papua New Guinea', FIJ: 'Fiji',   VAN: 'Vanuatu', SOL: 'Solomon Islands',
  TON: 'Tonga',  SAM: 'Samoa', KIR: 'Kiribati', TUV: 'Tuvalu', NZL: 'New Zealand',
  AUS: 'Australia', IND: 'India', PAK: 'Pakistan', BAN: 'Bangladesh', SRI: 'Sri Lanka',
  NEP: 'Nepal', INO: 'Indonesia', PHI: 'Philippines', VIE: 'Viet Nam', THA: 'Thailand',
  MAL: 'Malaysia', SIN: 'Singapore', CAM: 'Cambodia', MYA: 'Myanmar',
  PRC: 'China', JPN: 'Japan', KOR: 'Korea', MON: 'Mongolia',
  KAZ: 'Kazakhstan', UZB: 'Uzbekistan', AZE: 'Azerbaijan', GEO: 'Georgia', ARM: 'Armenia',
  PA: 'Pacific',
}

const INDICATOR_CONTEXT: Record<string, string> = {
  NGDP_R_PTX_PS:    'Real GDP growth measures the annual percentage change in total economic output adjusted for inflation. It is the primary gauge of an economy\'s expansion or contraction.',
  NGDPPC_XDC:       'GDP per capita reflects average economic output per person in local currency units and serves as a key proxy for living standards and development progress.',
  PCPI_PC_PP_PT:    'Consumer price inflation (CPI) captures the average rate of price change for a representative basket of goods and services. Elevated inflation erodes purchasing power and can destabilise economic conditions.',
  GC_DOD_TOTL_GD_ZS:'Government debt as a share of GDP is a primary fiscal sustainability indicator. Ratios persistently above 60% are generally considered elevated for developing economies.',
  BX_TRF_PWKR_CD_DT:'Remittance inflows represent money sent home by overseas workers. For many Pacific and South Asian economies, remittances exceed official development assistance and are a vital household income cushion.',
  BX_KLT_DINV_CD_WD:'Foreign direct investment (FDI) inflows reflect investor confidence in growth prospects and drive capital formation, technology transfer, and employment creation.',
  LUR_PT:           'The unemployment rate measures the share of the labour force actively seeking but unable to find work — a key barometer of labour market health and social welfare.',
  BN_CAB_XOKA_GD_ZS:'The current account balance captures net trade in goods, services, and income flows. Persistent and wide deficits signal import dependence and vulnerability to changes in external financing conditions.',
  NC_HFC_PTX_PS:    'Household consumption growth tracks the pace of private spending and is a direct indicator of consumer confidence and domestic demand momentum.',
  ENDE_XDC_USD_RATE:'The exchange rate determines the relative value of a country\'s currency against the US dollar, affecting trade competitiveness, import costs, and debt servicing burdens.',
  FM_LBL_MONY_GD_ZS:'Broad money (M2) growth tracks the expansion rate of the money supply, providing signals about monetary policy stance and potential inflationary or stimulative pressures.',
}

const INDICATOR_UNIT_FMT: Record<string, (v: number) => string> = {
  NGDPPC_XDC:       v => `USD ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  BX_TRF_PWKR_CD_DT:v => v > 1000 ? `USD ${(v/1000).toFixed(1)}bn` : `USD ${v.toFixed(0)}mn`,
  BX_KLT_DINV_CD_WD:v => v > 1000 ? `USD ${(v/1000).toFixed(1)}bn` : `USD ${v.toFixed(0)}mn`,
}
const defaultFmt = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v.toFixed(1)} ${unit}`

function fmt(indicator: string, v: number, unit: string): string {
  return INDICATOR_UNIT_FMT[indicator]?.(v) ?? defaultFmt(v, unit)
}

function ecoName(code: string) { return ECO_LABELS[code] ?? code }

type EcoStat = {
  eco: string
  latest: { economy: string; period: string; value: number }
  first:  { economy: string; period: string; value: number }
  maxPt:  { economy: string; period: string; value: number }
  minPt:  { economy: string; period: string; value: number }
  change: number
  pts:    { economy: string; period: string; value: number }[]
  values: number[]
}
type InsightResult = { lead: string; paragraphs: string[]; bullets: { label: string; value: string }[]; citations: string[] }

// ── Natural language insight generator ────────────────────────────────────────
function generateInsight(config: ChartConfigType, chartData: ChartData): InsightResult {
  const { indicator, unit, economies, startPeriod, endPeriod } = config
  const { series, periods } = chartData

  // Per-economy stats — build typed stat objects
  const stats: EcoStat[] = economies.flatMap(eco => {
    const pts = series
      .filter(d => d.economy === eco && d.value !== null)
      .sort((a, b) => a.period.localeCompare(b.period)) as { economy: string; period: string; value: number }[]
    if (!pts.length) return []
    const values = pts.map((p: { value: number }) => p.value)
    const latest = pts[pts.length - 1]
    const first  = pts[0]
    const maxPt  = pts.reduce((a: typeof pts[0], b: typeof pts[0]) => a.value > b.value ? a : b)
    const minPt  = pts.reduce((a: typeof pts[0], b: typeof pts[0]) => a.value < b.value ? a : b)
    const change = latest.value - first.value
    return [{ eco, latest, first, maxPt, minPt, change, pts, values }]
  })

  if (!stats.length) {
    return { lead: 'No data available for the selected query.', paragraphs: [], bullets: [], citations: [] }
  }

  // Sort by latest value
  const sorted = [...stats].sort((a: EcoStat, b: EcoStat) => b.latest.value - a.latest.value)
  const top    = sorted[0]
  const bottom = sorted[sorted.length - 1]

  // Detect COVID shock (2020 data)
  const has2020 = periods.includes('2020')
  const covidEcos = stats.filter((s: EcoStat) => {
    const p2020 = s.pts.find((p: { period: string }) => p.period === '2020')
    const p2019 = s.pts.find((p: { period: string }) => p.period === '2019')
    return p2020 && p2019 && p2020.value < p2019.value
  })

  const context = INDICATOR_CONTEXT[indicator] ?? ''

  // Build lead
  const lead = context

  // Build paragraphs
  const paragraphs: string[] = []

  // COVID paragraph (if relevant)
  if (has2020 && covidEcos.length > 0 &&
      ['NGDP_R_PTX_PS', 'NC_HFC_PTX_PS', 'LUR_PT', 'BX_TRF_PWKR_CD_DT', 'BX_KLT_DINV_CD_WD'].includes(indicator)) {
    const covidNames = covidEcos.slice(0, 3).map((s: EcoStat) => {
      const p2020 = s.pts.find((p: { period: string }) => p.period === '2020')!
      return `${ecoName(s.eco)} (${fmt(indicator, p2020.value, unit)} in 2020)`
    }).join(', ')
    paragraphs.push(
      `The COVID-19 pandemic caused significant disruption in 2020 across the observed economies. ` +
      `${covidNames} recorded notable setbacks as tourism collapsed, supply chains were disrupted, and fiscal ` +
      `pressures mounted. The recovery trajectory from 2021 onward has varied substantially depending on each ` +
      `economy's export structure, remittance reliance, and fiscal space.`
    )
  }

  // Performance comparison paragraph
  if (sorted.length >= 2) {
    paragraphs.push(
      `Over the ${startPeriod}–${endPeriod} period, ${ecoName(top.eco)} recorded the strongest ${config.indicatorLabel.toLowerCase()} ` +
      `at ${fmt(indicator, top.latest.value, unit)} (${top.latest.period}), ` +
      `while ${ecoName(bottom.eco)} registered ${fmt(indicator, bottom.latest.value, unit)} in the same period. ` +
      (top.change > 0
        ? `${ecoName(top.eco)} has shown a positive trend, improving by ${Math.abs(top.change).toFixed(1)} ${unit} since ${top.first.period}.`
        : `${ecoName(bottom.eco)} faces headwinds, with readings declining from ${fmt(indicator, bottom.first.value, unit)} in ${bottom.first.period}.`)
    )
  }

  // Trend paragraph for line charts
  if (config.chartType === 'line' && periods.length >= 3) {
    const risingEcos  = stats.filter((s: EcoStat) => s.change > 0.5).map((s: EcoStat) => ecoName(s.eco))
    const fallingEcos = stats.filter((s: EcoStat) => s.change < -0.5).map((s: EcoStat) => ecoName(s.eco))
    if (risingEcos.length > 0 || fallingEcos.length > 0) {
      const parts: string[] = []
      if (risingEcos.length) parts.push(`${risingEcos.join(' and ')} ${risingEcos.length > 1 ? 'have' : 'has'} trended upward`)
      if (fallingEcos.length) parts.push(`${fallingEcos.join(' and ')} ${fallingEcos.length > 1 ? 'have' : 'has'} trended downward`)
      paragraphs.push(
        `Looking at directional trends across the period, ${parts.join(', while ')}. ` +
        `These dynamics are consistent with ADB's regional economic outlook, which highlights structural differences ` +
        `in trade exposure, domestic policy capacity, and climate vulnerability among ADB member economies.`
      )
    }
  }

  // Build key bullets
  const bullets: { label: string; value: string }[] = []
  if (sorted.length >= 1) bullets.push({ label: `Highest (${top.latest.period})`,  value: `${ecoName(top.eco)}: ${fmt(indicator, top.latest.value, unit)}` })
  if (sorted.length >= 2) bullets.push({ label: `Lowest (${bottom.latest.period})`, value: `${ecoName(bottom.eco)}: ${fmt(indicator, bottom.latest.value, unit)}` })
  const allMax = stats.reduce((a: EcoStat, b: EcoStat) => a.maxPt.value > b.maxPt.value ? a : b)
  const allMin = stats.reduce((a: EcoStat, b: EcoStat) => a.minPt.value < b.minPt.value ? a : b)
  if (allMax.eco !== top.eco || allMax.maxPt.period !== allMax.latest.period)
    bullets.push({ label: `Peak across series`, value: `${ecoName(allMax.eco)} ${allMax.maxPt.period}: ${fmt(indicator, allMax.maxPt.value, unit)}` })
  if (allMin.minPt.value < 0)
    bullets.push({ label: `Trough across series`, value: `${ecoName(allMin.eco)} ${allMin.minPt.period}: ${fmt(indicator, allMin.minPt.value, unit)}` })

  // Citations
  const citations = [
    `ADB Key Indicators Database (KIDB) · Indicator: ${indicator} · Dataflow: ${config.flow} · kidb.adb.org`,
    `ADB Asian Development Outlook ${endPeriod} · adb.org/publications/series/asian-development-outlook`,
  ]

  return { lead, paragraphs, bullets, citations }
}

function first_period(s: { pts: { period: string }[] }) { return s.pts[0]?.period ?? '' }

// ── Insight panel ─────────────────────────────────────────────────────────────
function InsightPanel({ config, chartData }: { config: ChartConfigType; chartData: ChartData }) {
  const [expanded, setExpanded] = useState(true)
  const { lead, paragraphs, bullets, citations } = generateInsight(config, chartData)

  return (
    <div style={{
      background: 'var(--th-chart)', border: `1px solid ${adb.navyBorder}`,
      borderLeft: `3px solid ${adb.blue}`, borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: adb.blue, background: `${adb.blue}18`, padding: '2px 8px', borderRadius: 2,
          }}>✦ Analysis</span>
          <span style={{ fontSize: 11, color: adb.muted }}>Data-driven insights · KIDB</span>
        </div>
        <span style={{ fontSize: 11, color: adb.muted }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Lead sentence — what this indicator means */}
          <p style={{
            margin: 0, fontSize: 12.5, color: 'var(--th-text)', lineHeight: 1.7, fontWeight: 300,
            borderBottom: `1px solid ${adb.navyBorder}`, paddingBottom: 12,
          }}>{lead}</p>

          {/* Analysis paragraphs */}
          {paragraphs.map((p, i) => (
            <p key={i} style={{
              margin: 0, fontSize: 12, color: adb.muted, lineHeight: 1.75, fontWeight: 300,
            }}>{p}</p>
          ))}

          {/* Key observations */}
          {bullets.length > 0 && (
            <div style={{
              background: 'var(--th-chart)', borderRadius: 4, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: adb.blueLight, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Key Observations
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'baseline' }}>
                    <span style={{ color: adb.muted, flexShrink: 0, minWidth: 140 }}>{b.label}</span>
                    <span style={{ color: 'var(--th-text)', fontWeight: 500 }}>{b.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Citations */}
          <div style={{ borderTop: `1px solid ${adb.navyBorder}`, paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#4a6a88', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Data Sources &amp; References
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {citations.map((c, i) => (
                <div key={i} style={{ fontSize: 10, color: '#3a5a78', fontFamily: 'monospace', lineHeight: 1.5 }}>
                  [{i + 1}] {c}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildChartData(raw: KidbObs[]): ChartData {
  const economies = [...new Set(raw.map(d => d.economy))].sort()
  const periods   = [...new Set(raw.map(d => d.period))].sort()
  return { economies, periods, series: raw }
}

// ── Query metadata panel ───────────────────────────────────────────────────
function QueryMeta({ config }: { config: ChartConfigType }) {
  const endpoint = `/api/v3/sdmx/data/${config.flow}/A.${config.indicator}.${config.economies.join('+')}?startPeriod=${config.startPeriod}&endPeriod=${config.endPeriod}`
  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--th-chart)', borderRadius: 4, borderLeft: `2px solid ${adb.blue}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
        {[
          { label: 'Indicator', value: config.indicator },
          { label: 'Dataflow',  value: config.flow },
          { label: 'Economies', value: config.economies.join(', ') },
          { label: 'Period',    value: `${config.startPeriod}–${config.endPeriod}` },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: adb.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: adb.blueLight, fontFamily: 'monospace' }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#4a6a88', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        kidb.adb.org{endpoint}
      </div>
    </div>
  )
}

// ── Intent detection ──────────────────────────────────────────────────────────
function detectIntent(q: string): 'explain' | 'chart' {
  const lower = q.toLowerCase()
  const explainSignals = [
    /^what (is|are|does|do|was|were|causes?|drives?|affects?|impacts?)\b/,
    /^why (is|are|does|do|did|has|have)\b/,
    /^how (does|do|is|are|can|would|should)\b/,
    /^(explain|define|describe|tell me about|what does .* mean|what is the (meaning|definition|significance|impact|effect|role|importance))/,
    /\b(meaning|definition|significance|implication|concept|theory|policy|background|overview|context)\b/,
    /^(who|when|where) (is|are|was|were)\b/,
  ]
  if (explainSignals.some(re => re.test(lower))) return 'explain'
  return 'chart'
}

// ── Main DataExplorer ──────────────────────────────────────────────────────
export function DataExplorer({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery]           = useState(initialQuery)
  const [loading, setLoading]       = useState(false)
  const [aiError, setAiError]       = useState<string | null>(null)
  const [config, setConfig]         = useState<ChartConfigType | null>(null)
  const [chartData, setChartData]   = useState<ChartData | null>(null)
  const [dataSource, setDataSource] = useState<'live' | 'mock' | null>(null)
  const [configSource, setConfigSource] = useState<'ai' | 'rules' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const [intentType, setIntentType]     = useState<'chart' | 'explain' | null>(null)
  const [explainAnswer, setExplainAnswer] = useState<string>('')
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainCitations, setExplainCitations] = useState<string[]>([])

  function exportAsPng() {
    const container = chartRef.current
    if (!container || !config) return
    const svg = container.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width  = (svg.clientWidth  || 700) * scale
      canvas.height = (svg.clientHeight || 320) * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.fillStyle = '#0f2033'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${config.title ?? 'chart'}.png`
        a.click()
      })
    }
    img.src = url
  }

  function exportAsCsv() {
    if (!chartData || !config) return
    const rows: string[][] = [
      ['Economy', 'Economy Code', 'Period', config.indicatorLabel, config.unit],
      ...chartData.series
        .filter(d => d.value !== null)
        .sort((a, b) => a.economy.localeCompare(b.economy) || a.period.localeCompare(b.period))
        .map(d => [ecoName(d.economy), d.economy, d.period, String(d.value), config.unit]),
    ]
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(config.title ?? 'data').replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
  }

  const runQuery = useCallback(async (q: string) => {
    if (!q.trim()) return
    const intent = detectIntent(q)
    setIntentType(intent)
    setAiError(null)
    setConfig(null)
    setChartData(null)
    setExplainAnswer('')
    setExplainCitations([])

    if (intent === 'explain') {
      setExplainLoading(true)
      try {
        const res = await fetch('/api/erdi/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        })
        if (!res.ok) throw new Error('Failed to get answer')
        const contentType = res.headers.get('content-type') ?? ''
        if (contentType.includes('text/plain') && res.body) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let accumulated = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            accumulated += decoder.decode(value, { stream: true })
            setExplainAnswer(accumulated)
          }
        } else {
          const data = await res.json()
          setExplainAnswer(data.answer ?? '')
        }
        setExplainCitations([
          'ADB Key Indicators Database (KIDB) · kidb.adb.org',
          'ADB Asian Development Outlook · adb.org/publications/series/asian-development-outlook',
          'ADB Pacific Economic Monitor · adb.org/publications/pacific-economic-monitor',
        ])
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setExplainLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const configRes = await fetch('/api/kidb/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!configRes.ok) throw new Error('Failed to interpret query')
      const cfg: ChartConfigType & { _source?: string } = await configRes.json()
      setConfigSource(cfg._source === 'ai' ? 'ai' : 'rules')
      setConfig(cfg)

      const dataRes = await fetch(
        `/api/kidb?flow=${cfg.flow}&indicator=${cfg.indicator}&economies=${cfg.economies.join('+')}&start=${cfg.startPeriod}&end=${cfg.endPeriod}`
      )
      const { series, source } = await dataRes.json()
      setChartData(buildChartData(series))
      setDataSource(source)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-run when initialQuery is pushed in from the home search
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery)
      runQuery(initialQuery)
    }
  }, [initialQuery, runQuery])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runQuery(query)
  }

  function useSuggestion(s: string) {
    setQuery(s)
    runQuery(s)
    inputRef.current?.focus()
  }

  return (
    <div style={{ fontFamily: adb.font }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 300 }}>ERDI Data Explorer</h2>
        <div style={{ fontSize: 12, color: adb.muted, marginTop: 4 }}>
          Ask a question for an explanation, or describe data you want to see — the explorer understands the difference.
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', gap: 0,
          background: adb.navyCard,
          border: `1px solid ${config ? adb.blue : adb.navyBorder}`,
          borderRadius: 6, overflow: 'hidden', transition: 'border-color 0.2s',
        }}>
          <span style={{ padding: '0 14px', display: 'flex', alignItems: 'center', color: adb.blue, fontSize: 18, flexShrink: 0 }}>✦</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='"What causes inflation?" or "Compare debt-to-GDP across Pacific SIDS"'
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--th-text)', fontSize: 13, fontFamily: adb.font,
              padding: '13px 0',
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: '0 22px', background: loading ? '#1a3550' : adb.blue,
              border: 'none', color: adb.white, fontSize: 12, fontWeight: 500,
              cursor: loading ? 'default' : 'pointer', transition: 'background 0.15s', flexShrink: 0,
            }}
          >
            {loading || explainLoading ? 'Working…' : intentType === 'explain' && !config ? 'Ask ERDI AI' : 'Run Query'}
          </button>
        </div>
      </form>

      {/* Suggestions / follow-ups — always visible below search bar */}
      {!loading && !explainLoading && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: adb.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            {config ? 'Suggested follow-ups' : 'Try these'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {(config ? getFollowUps(config) : SUGGESTIONS.slice(0, 6)).map(s => (
              <button key={s} onClick={() => useSuggestion(s)} style={{
                fontSize: 11, color: config ? adb.blueLight : adb.muted,
                padding: '5px 13px', borderRadius: 16,
                border: `1px solid ${config ? adb.blueLight + '55' : 'var(--th-border)'}`,
                background: config ? `${adb.blueLight}0d` : 'none',
                cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = adb.blue; e.currentTarget.style.borderColor = adb.blue }}
              onMouseLeave={e => { e.currentTarget.style.color = config ? adb.blueLight : adb.muted; e.currentTarget.style.borderColor = config ? adb.blueLight + '55' : 'var(--th-border)' }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          marginTop: 24, padding: '40px 16px', background: 'var(--th-card)',
          border: '1px solid var(--th-border)', borderRadius: 6,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 13, color: adb.muted }}>{intentType === 'explain' ? 'Researching your question…' : 'Selecting KIDB indicators…'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%', background: adb.blue,
                animation: `dotpulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <style>{`@keyframes dotpulse{0%,80%,100%{opacity:.2}40%{opacity:1}}`}</style>
        </div>
      )}

      {/* Error */}
      {aiError && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: `${adb.red}11`, border: `1px solid ${adb.red}44`, borderRadius: 6, fontSize: 12, color: adb.red }}>
          {aiError}
        </div>
      )}

      {/* Explanation panel */}
      {intentType === 'explain' && (explainLoading || explainAnswer) && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'var(--th-card)', border: `1px solid ${adb.blue}44`,
            borderLeft: `3px solid ${adb.blue}`, borderRadius: 6, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px', borderBottom: `1px solid var(--th-border)`,
              background: `${adb.blue}0d`,
            }}>
              <span style={{ fontSize: 13, color: adb.blue }}>✦</span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: adb.blue, background: `${adb.blue}18`, padding: '2px 8px', borderRadius: 2,
              }}>ERDI AI · Analysis</span>
              <span style={{ fontSize: 11, color: adb.muted, marginLeft: 4 }}>{query}</span>
            </div>
            {/* Answer body */}
            <div style={{ padding: '16px 18px' }}>
              {explainLoading && !explainAnswer
                ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: adb.muted }}>Researching</span>
                    {[0,1,2].map(i => (
                      <span key={i} style={{
                        width: 4, height: 4, borderRadius: '50%', background: adb.blue, display: 'inline-block',
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                : <div style={{ fontSize: 13, color: 'var(--th-subtle)', lineHeight: 1.8 }}>
                    {explainAnswer.split('\n').map((line, i, arr) => (
                      <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                    ))}
                  </div>
              }
            </div>
            {/* Citations */}
            {explainCitations.length > 0 && explainAnswer && (
              <div style={{
                borderTop: `1px solid var(--th-border)`, padding: '10px 18px',
                background: 'var(--th-chart)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4a6a88', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Sources &amp; References
                </div>
                {explainCitations.map((c, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#3a5a78', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    [{i + 1}] {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Option to also view as chart */}
          {explainAnswer && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: adb.muted }}>Want to explore this as data?</span>
              <button
                onClick={() => { setIntentType('chart'); runQuery(query) }}
                style={{
                  fontSize: 11, color: adb.blueLight, background: `${adb.blue}18`,
                  border: `1px solid ${adb.blue}44`, borderRadius: 4,
                  padding: '4px 12px', cursor: 'pointer',
                }}
              >View as chart →</button>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {config && chartData && !loading && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Chart header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{config.title}</h3>
              <div style={{ fontSize: 12, color: adb.muted, marginTop: 3 }}>{config.description}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 2, fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                background: configSource === 'ai' ? `${adb.blue}22` : `${adb.teal}22`,
                color: configSource === 'ai' ? adb.blueLight : adb.teal,
                border: `1px solid ${configSource === 'ai' ? adb.blue : adb.teal}44`,
              }}>{configSource === 'ai' ? '✦ Claude' : '⚙ Rules'}</span>
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 2, fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                background: dataSource === 'live' ? `${adb.green}22` : `${adb.amber}22`,
                color: dataSource === 'live' ? adb.green : adb.amber,
                border: `1px solid ${dataSource === 'live' ? adb.green : adb.amber}44`,
              }}>{dataSource === 'live' ? 'KIDB Live' : 'KIDB Schema'}</span>
              <button
                onClick={exportAsPng}
                title="Export chart as PNG"
                style={{
                  fontSize: 11, color: adb.muted, padding: '3px 9px',
                  background: 'var(--th-card)', border: '1px solid var(--th-border)',
                  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >↓ PNG</button>
              <button
                onClick={exportAsCsv}
                title="Export data as Excel/CSV"
                style={{
                  fontSize: 11, color: adb.muted, padding: '3px 9px',
                  background: 'var(--th-card)', border: '1px solid var(--th-border)',
                  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >↓ XLS</button>
              <button onClick={() => runQuery(query)} style={{ fontSize: 11, color: adb.blueLight, background: 'none', border: 'none', cursor: 'pointer' }}>↻</button>
            </div>
          </div>

          {/* D3 Chart */}
          <div ref={chartRef} style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)', borderRadius: 6, padding: '16px 12px 12px' }}>
            {config.chartType === 'line'
              ? <D3LineChart data={chartData} unit={config.unit} />
              : <D3BarChart  data={chartData} unit={config.unit} />
            }
            <ChartLegend economies={chartData.economies} />
          </div>

          {/* Natural language insight + citations */}
          <InsightPanel config={config} chartData={chartData} />

          {/* KIDB technical meta */}
          <QueryMeta config={config} />

          {/* More suggestions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: adb.muted }}>Try also:</span>
            {SUGGESTIONS.filter(s => s !== query).slice(0, 3).map(s => (
              <button key={s} onClick={() => useSuggestion(s)} style={{
                fontSize: 11, color: adb.muted, padding: '3px 10px', borderRadius: 12,
                border: '1px solid var(--th-border)', background: 'none', cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
