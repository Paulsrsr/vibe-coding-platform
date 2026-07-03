'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ECONOMIES, INDICATORS } from '@/app/api/kidb/route'
import { DataExplorer } from './_data-explorer'
import { useIsMobile } from './_use-mobile'

const PacificMapLeaflet = dynamic(() => import('./_pacific-map-leaflet'), { ssr: false })

const adb = {
  navy: '#0d2137',
  navyCard: '#0f2033',
  navyBorder: '#1a3550',
  blue: '#007DB7',
  blueLight: '#68C5EA',
  green: '#8DC63F',
  amber: '#FDB915',
  red: '#E9532B',
  teal: '#00A5D2',
  white: '#FFFFFF',
  muted: '#7fa8c4',
  font: '"Ideal Sans", "Helvetica Neue", Arial, sans-serif',
}

type Theme = {
  bg: string; card: string; border: string; text: string; muted: string
  subtle: string; inputBg: string; chartBg: string; navBg: string
}
const DARK: Theme = {
  bg: '#0d2137', card: '#0f2033', border: '#1a3550', text: '#FFFFFF',
  muted: '#7fa8c4', subtle: '#b0c8d8', inputBg: '#0f2033',
  chartBg: '#091b2e', navBg: '#0f2033',
}
const LIGHT: Theme = {
  bg: '#EEF4FA', card: '#FFFFFF', border: '#C8D8E8', text: '#002569',
  muted: '#456484', subtle: '#456484', inputBg: '#FFFFFF',
  chartBg: '#F2F7FB', navBg: '#FFFFFF',
}

// ── types ──────────────────────────────────────────────────────────────────
type KidbObs = { economy: string; period: string; value: number | null }
type KidbResp = { source: 'live' | 'mock'; indicator: string; series: KidbObs[] }
type Article = {
  id: string; type: string; typeBg: string; date: string
  title: string; body: string; fullBody: string[]
  reasons: { indicator: string; points: string[] }[]
  sources: string[]; query: string
}
type Publication = {
  id: string; type: string; typeBg: string; coverBg: string
  title: string; subtitle: string; date: string; abstract: string
  url: string; series: string; pages?: number
  keyContent: string
}

// ── hook: fetch one indicator for a list of economies ─────────────────────
function useKidb(
  flow: string,
  indicator: string,
  economies: string[],
  enabled = true,
): { data: KidbObs[]; loading: boolean; source: 'live' | 'mock' | null } {
  const [data, setData] = useState<KidbObs[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'live' | 'mock' | null>(null)

  const fetch_ = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const url = `/api/kidb?flow=${flow}&indicator=${indicator}&economies=${economies.join('+')}`
      const res = await fetch(url)
      const json: KidbResp = await res.json()
      setData(json.series)
      setSource(json.source)
    } catch {
      setData([])
      setSource('mock')
    } finally {
      setLoading(false)
    }
  }, [flow, indicator, economies.join(',')])  // eslint-disable-line

  useEffect(() => { fetch_() }, [fetch_])
  return { data, loading, source }
}

// look up latest obs for one economy
function latest(series: KidbObs[], economy: string) {
  return series
    .filter(s => s.economy === economy)
    .sort((a, b) => b.period.localeCompare(a.period))[0]
}

// ── indicator type (outside ERDIPage so usable in function signatures) ────
type IndKey = keyof typeof INDICATORS

// ISO 2-letter codes for flagcdn.com image URLs (emoji flags don't render on Windows)
const FLAG_ISO: Record<string, string> = {
  PNG: 'pg', FIJ: 'fj', VAN: 'vu', SOL: 'sb', TON: 'to', SAM: 'ws',
  KIR: 'ki', TUV: 'tv', NZL: 'nz', AUS: 'au',
  IND: 'in', PAK: 'pk', BAN: 'bd', SRI: 'lk', NEP: 'np', BHU: 'bt', MLD: 'mv', AFG: 'af',
  INO: 'id', PHI: 'ph', VIE: 'vn', THA: 'th', MAL: 'my', SIN: 'sg',
  CAM: 'kh', MYA: 'mm', LAO: 'la', TIM: 'tl',
  PRC: 'cn', JPN: 'jp', KOR: 'kr', MON: 'mn', HKG: 'hk',
  KAZ: 'kz', UZB: 'uz', AZE: 'az', GEO: 'ge', ARM: 'am', KGZ: 'kg', TAJ: 'tj',
}
function flagUrl(code: string, w = 20): string {
  const iso = FLAG_ISO[code]
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : ''
}

// Short display labels for compact tabs
const IND_SHORT: Record<IndKey, string> = {
  GDP_GROWTH:   'GDP Growth',
  GDP_PC:       'GDP per Capita',
  CONSUMPTION:  'Consumption',
  UNEMPLOYMENT: 'Unemployment',
  CPI:          'Inflation (CPI)',
  EXCHANGE_RATE:'Exchange Rate',
  M2_GROWTH:    'M2 Growth',
  REMITTANCES:  'Remittances',
  FDI:          'FDI',
  CURRENT_ACCT: 'Current Acct.',
  DEBT_GDP:     'Debt / GDP',
}

// ── new hook: fetch ALL indicators upfront ────────────────────────────────
type MultiData = Record<string, { obs: KidbObs[]; source: 'live' | 'mock' | null }>

function useMultiKidb(economies: string[]): MultiData {
  const [data, setData] = useState<MultiData>({})
  const economiesStr = economies.join('+')
  useEffect(() => {
    ;(Object.entries(INDICATORS) as [IndKey, (typeof INDICATORS)[IndKey]][]).forEach(([key, ind]) => {
      fetch(`/api/kidb?flow=${ind.flow}&indicator=${ind.code}&economies=${economiesStr}`)
        .then(r => r.json())
        .then((json: KidbResp) => setData(prev => ({ ...prev, [key]: { obs: json.series, source: json.source } })))
        .catch(() => setData(prev => ({ ...prev, [key]: { obs: [], source: null } })))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economiesStr])
  return data
}

// ── indicator classification thresholds (shown in legend) ─────────────────
const IND_THRESHOLDS: Partial<Record<IndKey, Array<{ color: string; label: string; range: string }>>> = {
  GDP_GROWTH:   [{ color: '#8DC63F', label: 'Strong',        range: '≥ 4% growth' },
                 { color: '#FDB915', label: 'Moderate',      range: '0 – 4%' },
                 { color: '#E9532B', label: 'Contraction',   range: '< 0%' }],
  CPI:          [{ color: '#8DC63F', label: 'Stable',        range: '≤ 3%' },
                 { color: '#FDB915', label: 'Elevated',      range: '3 – 6%' },
                 { color: '#E9532B', label: 'High',          range: '> 6%' }],
  DEBT_GDP:     [{ color: '#8DC63F', label: 'Manageable',    range: '< 50% of GDP' },
                 { color: '#FDB915', label: 'Watch',         range: '50 – 70% of GDP' },
                 { color: '#E9532B', label: 'High Risk',     range: '≥ 70% of GDP' }],
  UNEMPLOYMENT: [{ color: '#8DC63F', label: 'Low',           range: '< 4%' },
                 { color: '#FDB915', label: 'Moderate',      range: '4 – 7%' },
                 { color: '#E9532B', label: 'High',          range: '≥ 7%' }],
  CURRENT_ACCT: [{ color: '#8DC63F', label: 'Surplus',       range: '> 0% of GDP' },
                 { color: '#FDB915', label: 'Deficit',       range: '0 – 5% of GDP' },
                 { color: '#E9532B', label: 'Wide Deficit',  range: '> 5% of GDP' }],
  GDP_PC:       [{ color: '#8DC63F', label: 'High',          range: '> USD 5,000' },
                 { color: '#FDB915', label: 'Middle',        range: 'USD 2,500 – 5,000' },
                 { color: '#E9532B', label: 'Low',           range: '< USD 2,500' }],
  M2_GROWTH:    [{ color: '#8DC63F', label: 'Controlled',    range: '< 8%' },
                 { color: '#FDB915', label: 'Moderate',      range: '8 – 12%' },
                 { color: '#E9532B', label: 'High',          range: '> 12%' }],
}

// ── indicator color thresholds ─────────────────────────────────────────────
function indicatorColor(key: IndKey, val: number | null): { color: string; status: string } {
  if (val === null) return { color: adb.muted, status: 'No data' }
  switch (key) {
    case 'GDP_GROWTH':    return val >= 4 ? { color: adb.green, status: 'Strong' }     : val >= 0 ? { color: adb.amber, status: 'Moderate' }   : { color: adb.red,   status: 'Contraction' }
    case 'CPI':           return val <= 3 ? { color: adb.green, status: 'Stable' }     : val <= 6 ? { color: adb.amber, status: 'Elevated' }    : { color: adb.red,   status: 'High' }
    case 'DEBT_GDP':      return val < 50 ? { color: adb.green, status: 'Manageable' } : val < 70 ? { color: adb.amber, status: 'Watch' }       : { color: adb.red,   status: 'High Risk' }
    case 'UNEMPLOYMENT':  return val < 4  ? { color: adb.green, status: 'Low' }        : val < 7  ? { color: adb.amber, status: 'Moderate' }    : { color: adb.red,   status: 'High' }
    case 'CURRENT_ACCT':  return val > 0  ? { color: adb.green, status: 'Surplus' }    : val > -5 ? { color: adb.amber, status: 'Deficit' }     : { color: adb.red,   status: 'Wide Deficit' }
    case 'GDP_PC':        return val > 5000 ? { color: adb.green, status: 'High' }     : val > 2500 ? { color: adb.amber, status: 'Middle' }    : { color: adb.red,   status: 'Low' }
    case 'REMITTANCES':
    case 'FDI':           return { color: adb.teal, status: 'Inflows' }
    case 'M2_GROWTH':     return val < 8 ? { color: adb.green, status: 'Controlled' } : val < 12 ? { color: adb.amber, status: 'Moderate' }    : { color: adb.red,   status: 'High' }
    default:              return { color: adb.blue, status: 'Monitor' }
  }
}

function formatIndValue(key: IndKey, val: number | null, ind: typeof INDICATORS[IndKey]): string {
  if (val === null) return '—'
  if (key === 'REMITTANCES' || key === 'FDI') return `$${val.toFixed(0)}M`
  if (key === 'GDP_PC') return `$${val.toLocaleString()}`
  if (key === 'EXCHANGE_RATE') return val.toFixed(2)
  return `${val.toFixed(1)}${ind.unit.includes('%') ? '%' : ''}`
}

function buildIndicatorDots(key: IndKey, obs: KidbObs[]): DotEntry[] {
  const ind = INDICATORS[key]
  return PACIFIC.filter(code => BASE_DOTS[code]).map(code => {
    const o = latest(obs, code)
    const val = o?.value ?? null
    const { color, status } = indicatorColor(key, val)
    return {
      ...BASE_DOTS[code],
      color,
      value: formatIndValue(key, val, ind),
      detail: `${ind.label} · ${o?.period ?? 'Latest'} · ${ECONOMIES[code]}`,
      status,
      flag: flagUrl(code, 32),
      code,
    }
  })
}

// ── small atoms ────────────────────────────────────────────────────────────
const MiniBar = ({ pct, color }: { pct: number; color: string }) => (
  <div style={{ height: 4, background: 'var(--th-border)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
  </div>
)


function SourceBadge({ source }: { source: 'live' | 'mock' | null }) {
  if (!source) return null
  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 600,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      background: source === 'live' ? `${adb.green}22` : `${adb.amber}22`,
      color: source === 'live' ? adb.green : adb.amber,
      border: `1px solid ${source === 'live' ? adb.green : adb.amber}44`,
    }}>{source === 'live' ? 'ADB Live' : 'ADB Schema'}</span>
  )
}

function RiskBar({ country, pct, color }: { country: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 36px', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--th-muted)' }}>{country}</span>
      <div style={{ height: 6, background: 'var(--th-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--th-text)', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── briefing card ──────────────────────────────────────────────────────────
function BriefingCard({ type, typeBg, title, body, sources }: {
  type: string; typeBg: string; title: string; body: string; sources: string[]
}) {
  return (
    <div style={{
      background: 'var(--th-card)', border: '1px solid var(--th-border)', borderRadius: 6,
      padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: typeBg, textTransform: 'uppercase' }}>{type}</span>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--th-text)', lineHeight: 1.45 }}>{title}</div>
      <div style={{ fontSize: 12, fontWeight: 300, color: 'var(--th-muted)', lineHeight: 1.6 }}>{body}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {sources.map(s => (
          <span key={s} style={{
            fontSize: 10, color: adb.blueLight, padding: '2px 8px',
            border: '1px solid var(--th-border)', borderRadius: 3, cursor: 'pointer',
          }}>{s}</span>
        ))}
      </div>
    </div>
  )
}

const PACIFIC = ['PNG', 'FIJ', 'VAN', 'SOL', 'TON', 'SAM']

const ARTICLES: Article[] = [
  {
    id: 'ado-2026',
    type: 'Economics', typeBg: adb.blueLight,
    date: 'April 2026',
    title: 'ADO April 2026 — Pacific growth resilient despite global headwinds',
    body: 'Pacific developing economies projected to grow 4.1% in 2026, supported by tourism recovery and infrastructure investment.',
    fullBody: [
      'Pacific developing member countries (DMCs) are projected to expand at 4.1% in 2026, a modest improvement over 2025\'s estimated 3.9%, according to the ADB Asian Development Outlook April 2026 edition. This growth trajectory remains below the broader Asia-Pacific average of 4.8%, reflecting structural constraints inherent to small island economies.',
      'Papua New Guinea leads regional growth at an estimated 4.3%, underpinned by expanded LNG production and rising gold output. Fiji\'s tourism recovery continues to drive 3.2% growth, though consumer price inflation at 6.5% is eroding household purchasing power. Vanuatu contracted by 1.1% amid reconstruction pressures following Cyclone Lola and a challenging fiscal consolidation programme.',
      'ADB disbursed USD 580 million across Pacific infrastructure, climate resilience, and social protection projects in 2025. Key downside risks include a sharper-than-expected slowdown in Australia and New Zealand — the primary remittance sources — continued global energy price volatility, and the increasing frequency of climate-related natural disasters.',
    ],
    reasons: [
      {
        indicator: 'Real GDP Growth',
        points: [
          'Expanded LNG production in Papua New Guinea added over 1.2 percentage points to regional output in 2024, with new wells coming online ahead of schedule.',
          'Fiji\'s tourism sector recovered to 90% of pre-COVID visitor levels, driving a broad-based services sector expansion and supporting employment.',
          'ADB disbursed USD 580 million across Pacific infrastructure and climate resilience projects in 2025, directly stimulating public investment and construction activity.',
          'Improved terms of trade as global commodity prices stabilised after the 2022 energy price spike, reducing import cost pressures and supporting real income growth.',
        ],
      },
    ],
    sources: ['Asian Development Outlook 2026', 'ADB Data — PPL Dataflow'],
    query: 'GDP growth for Pacific SIDS since 2019',
  },
  {
    id: 'cyclone-fiscal',
    type: 'Alert', typeBg: adb.red,
    date: 'March 2026',
    title: 'Cyclone season — fiscal stress escalating in 3 Pacific SIDS',
    body: 'Reconstruction and agricultural losses straining Vanuatu, Tonga, and Solomon Islands budgets. ADB deploys USD 50M emergency response.',
    fullBody: [
      'The 2025–26 South Pacific cyclone season has imposed an estimated USD 340 million in aggregate damages across Vanuatu, Tonga, and Solomon Islands. Infrastructure damage — roads, ports, and agricultural facilities — accounts for roughly 70% of total losses, according to ADB-led damage and needs assessments.',
      'Vanuatu carries the most acute fiscal stress, with public debt already at 85% of GDP before cyclone costs are included. The government has declared a national fiscal emergency, triggering ADB\'s Pacific Disaster Resilience Program. Tonga (68% debt/GDP) and Solomon Islands (54%) face similar, though less severe, consolidation pressures heading into 2026.',
      'ADB has deployed USD 50 million in emergency contingent financing under the Pacific Disaster Resilience Program. Medium-term debt sustainability assessments are being updated to reflect revised growth and revenue projections for all three economies, with formal reassessment scheduled for June 2026.',
    ],
    reasons: [
      {
        indicator: 'Government Debt / GDP',
        points: [
          'Emergency reconstruction spending on roads, ports, and public buildings following Category 4 cyclone damage inflated fiscal deficits in all three affected economies.',
          'Revenue shortfalls from disrupted agricultural exports and collapsed tourism receipts during and after the cyclone season reduced government income by an estimated 12–18%.',
          'Pre-existing debt elevated by COVID-19 emergency borrowing in 2020–21 had already eroded fiscal buffers, leaving little space to absorb new shocks without additional borrowing.',
          'Currency depreciation increased the local-currency value of foreign-denominated debt obligations, mechanically raising the debt-to-GDP ratio even before new borrowing.',
        ],
      },
    ],
    sources: ['GC_DOD_TOTL_GD_ZS · GLB', 'ENV Dataflow'],
    query: 'Government debt for Vanuatu, Tonga and Solomon Islands',
  },
  {
    id: 'remittances-record',
    type: 'Opportunity', typeBg: adb.green,
    date: 'February 2026',
    title: 'Record remittances to Tonga and Samoa — 14% surge in 2024',
    body: '2025 estimates show modest poverty reduction but remittance slowdown from Australia and New Zealand poses reversal risk in 2026.',
    fullBody: [
      'Remittance inflows to Tonga and Samoa reached record levels in 2024 at USD 410 million and USD 380 million respectively, representing year-on-year increases of 5.1% and 6.7%. These flows now constitute approximately 40% of Tonga\'s GDP, making it one of the most remittance-dependent economies globally.',
      'The surge is attributable to New Zealand\'s expanded Pacific Access Category visa programme and Australia\'s Pacific Australia Labour Mobility (PALM) scheme, both of which significantly expanded worker placements in 2022–24. Seasonal agricultural work in New Zealand\'s horticulture sector alone accounts for an estimated USD 95 million annually from Tongan workers.',
      'While remittance inflows provide a critical household income buffer and support domestic consumption, ADB economists caution against over-reliance. Dutch disease effects — where remittance-driven consumption supports imports rather than local production — have been observed in both economies. The 2026 outlook carries downside risk if Australian or New Zealand labour market conditions deteriorate.',
    ],
    reasons: [
      {
        indicator: 'Remittance Inflows (USD mn)',
        points: [
          'New Zealand\'s expanded Pacific Access Category visa programme increased registered worker placements by 34% over 2022–24, directly boosting remittance volumes.',
          'Australia\'s Pacific Australia Labour Mobility (PALM) scheme added approximately 12,000 new seasonal placements in horticulture and aged care, the largest single-year expansion on record.',
          'Improved digital transfer channels reduced average remittance costs from 8.2% to 5.4% of transfer value, increasing net receipts to Pacific households.',
          'Favourable exchange rate movements amplified the local-currency value of Australian and New Zealand dollar-denominated transfers, boosting household purchasing power.',
        ],
      },
    ],
    sources: ['BX_TRF_PWKR_CD_DT · GLB', 'SI_POV_DDAY · SDG'],
    query: 'Remittance inflows for Tonga and Samoa since 2019',
  },
  {
    id: 'fiji-inflation',
    type: 'Analysis', typeBg: adb.amber,
    date: 'January 2026',
    title: 'Fiji inflation at 6.5%: drivers, household impact, and ADB outlook',
    body: 'Imported energy and food costs drive Fiji CPI above target. ADB projects moderation to 4.5% by end-2026.',
    fullBody: [
      'Fiji\'s consumer price inflation reached 6.5% in 2024, its highest sustained rate in over a decade, driven by elevated global energy and food commodity prices feeding through to an import-dependent economy. Fiji imports approximately 85% of its fuel requirements and 65% of food consumption, creating high exposure to global commodity price shocks.',
      'The Fiji dollar\'s depreciation of 2.1% against the US dollar in 2024 compounded the import cost effect. The Reserve Bank of Fiji has maintained a cautiously accommodative monetary policy stance, prioritising credit growth and post-pandemic recovery over aggressive inflation containment.',
      'ADB projects CPI inflation to moderate to 4.5–5.0% by end-2026 as global commodity prices normalise and base effects fade. Key risks to this outlook include a renewed energy price spike and prolonged FJD weakness. Policy recommendations include targeted food subsidies for the lowest-income quintile and accelerated investment in domestic renewable energy generation.',
    ],
    reasons: [
      {
        indicator: 'Consumer Price Inflation (CPI)',
        points: [
          'Fiji imports approximately 85% of its fuel requirements — global energy price spikes feed directly and rapidly into domestic transport, electricity, and production costs.',
          'The Fiji dollar depreciated 2.1% against the US dollar in 2024, raising the landed cost of all import categories including food, machinery, and consumer goods.',
          'Drought conditions in the Western Division reduced domestic food production, pushing import dependence for food to 65% of consumption and amplifying global food price pass-through.',
          'Expansionary fiscal policy in 2022–23 boosted aggregate domestic demand faster than supply capacity could respond, creating demand-pull inflationary pressure on non-tradeable services.',
        ],
      },
    ],
    sources: ['PCPI_PC_PP_PT · MFP', 'ENDE_XDC_USD_RATE · MFP'],
    query: 'Inflation trends in Fiji since 2019',
  },
  {
    id: 'samoa-debt',
    type: 'Policy', typeBg: '#00A5D2',
    date: 'May 2026',
    title: 'Samoa\'s Debt Reduction Milestone: How a Small Island Economy Turned the Corner',
    body: 'Samoa\'s government debt fell to 52% of GDP in 2024, down from a COVID peak of 56%, marking the first sustained reduction in a Pacific SIDS outside of Fiji.',
    fullBody: [
      'Samoa achieved a notable fiscal milestone in 2024, reducing government debt to 52% of GDP — the first sustained multi-year reduction for a Pacific small island developing state (SIDS) outside of Fiji since the COVID-19 pandemic. The improvement reflects a combination of deliberate fiscal consolidation, external sector recovery, and favourable debt restructuring outcomes.',
      'The government\'s Medium-Term Expenditure Framework, introduced with ADB technical assistance in 2022, capped non-essential recurrent spending while protecting capital investment allocations. This approach preserved growth-enhancing public investment while gradually closing the primary fiscal deficit. By 2024, Samoa recorded a primary surplus of 1.2% of GDP for the first time since 2018.',
      'The tourism sector\'s full reopening in late 2022 restored government revenue from taxes, fees, and state enterprise dividends to pre-COVID levels by end-2023. Combined with strong remittance-fuelled household demand reducing dependence on government social transfers, the fiscal pressure from the expenditure side moderated significantly. ADB estimates the combined revenue and expenditure improvement to be worth approximately 4 percentage points of GDP between 2022 and 2024.',
    ],
    reasons: [
      {
        indicator: 'Government Debt / GDP',
        points: [
          'ADB-supported fiscal consolidation introduced a Medium-Term Expenditure Framework that capped non-essential spending while maintaining public investment, generating a primary surplus of 1.2% of GDP by 2024.',
          'Tourism revenue recovery from 2022 restored government receipts — including taxes, port fees, and state enterprise dividends — to pre-COVID levels by end-2023, improving fiscal balances organically.',
          'Remittance-fuelled household income growth reduced dependence on government social transfer programmes, lowering expenditure pressure on the welfare side of the budget.',
          'A bilateral debt relief agreement restructured USD 45 million in infrastructure loans on concessional terms, reducing near-term debt service obligations and improving the debt trajectory.',
        ],
      },
    ],
    sources: ['GC_DOD_TOTL_GD_ZS · GLB', 'ADB Pacific Economic Monitor Dec 2025'],
    query: 'Government debt for Samoa since 2019',
  },
  {
    id: 'fdi-pacific-2026',
    type: 'Markets', typeBg: '#8DC63F',
    date: 'June 2026',
    title: 'FDI into Pacific SIDS up 22% in 2025 — renewables and tourism drive gains',
    body: 'Foreign direct investment surged to USD 1.4bn across Pacific DMCs, led by solar energy projects in Fiji and PNG and hotel construction in Vanuatu.',
    fullBody: [
      'Foreign direct investment into Pacific developing member countries rose 22% year-on-year in 2025, reaching an estimated USD 1.4 billion — the highest level since ADB began systematic tracking in 2010. Renewable energy projects accounted for 38% of total inflows, reflecting both donor-supported blended finance structures and commercial viability improvements for solar and wind generation in island settings.',
      'Fiji attracted the largest single FDI commitment: a USD 280 million solar-plus-storage project co-financed by the Green Climate Fund and a Singapore-based infrastructure fund. PNG received USD 340 million across three mining-adjacent projects and a new international hotel development in Port Moresby. Vanuatu\'s tourism-linked FDI also recovered sharply, up 41%, following post-cyclone infrastructure restoration.',
      'Despite the aggregate improvement, FDI distribution remains highly uneven. Tonga, Kiribati, and Tuvalu collectively attracted less than USD 30 million, hampered by limited connectivity, small market size, and complex land tenure arrangements. ADB\'s Pacific Private Sector Development Initiative is piloting investment facilitation services to reduce transaction costs for smaller jurisdictions.',
    ],
    reasons: [
      {
        indicator: 'FDI Inflows (USD mn)',
        points: [
          'Green Climate Fund co-financing unlocked commercial renewable energy investment that would not have been bankable on pure market terms in small island contexts.',
          'PNG\'s expanded special economic zone framework reduced the regulatory burden for foreign investors in manufacturing and processing, accelerating project approvals by 40%.',
          'Post-cyclone reconstruction demand in Vanuatu created a pipeline of tourism infrastructure projects with clear risk-return profiles attractive to regional private equity.',
          'ADB\'s Pacific Private Sector Development Initiative provided transaction advisory services that reduced deal structuring costs and attracted first-time Pacific investors.',
        ],
      },
    ],
    sources: ['BX_KLT_DINV_CD_WD · GLB', 'ADB Private Sector Operations 2025'],
    query: 'FDI inflows for Pacific SIDS since 2019',
  },
]

// ── Per-country reasons for each tracked indicator ────────────────────────────
const PACIFIC_IND_REASONS: Partial<Record<IndKey, Partial<Record<string, string[]>>>> = {
  GDP_GROWTH: {
    PNG: ['LNG production expansion added ~1.2 ppt to GDP as new wells came online ahead of schedule.', 'Strong Asian demand for PNG commodities (gold, copper, timber) kept export revenues elevated.', 'ADB co-financed road and port upgrades stimulated construction activity and employment.', 'Post-COVID services sector recovery in Port Moresby boosted retail and finance output.'],
    FIJ: ['Tourism recovered to 90% of pre-COVID visitor arrivals, driving broad services expansion.', 'Fiji Sugar Corporation output stabilised after targeted input cost reforms in 2023.', 'Remittance-driven household consumption growth supported retail, transport, and hospitality.', 'Reduced fiscal drag as emergency COVID spending unwound freed private sector headroom.'],
    VAN: ['Category 4 cyclone damage in early 2024 disrupted agriculture, construction, and logistics.', 'Tourism revenue fell ~18% due to reduced regional air connectivity post-cyclone.', 'Supply-chain constraints delayed reconstruction, amplifying the output contraction.', 'Weak fiscal buffers limited counter-cyclical spending; debt service consumed 14% of revenue.'],
    SOL: ['Logging sector recovery supported foreign exchange earnings and rural incomes.', 'Chinese-financed road and port projects sustained construction sector activity.', 'Remittance inflows from NZ and AUS underpinned household consumption in Honiara.', 'Agricultural diversification into palm oil began contributing modest export receipts.'],
    TON: ['Remittances — equivalent to 40% of GDP — sustained domestic consumption and retail trade.', 'Public sector wage increases approved in 2023 supported household spending in Nuku\'alofa.', 'Tourism still 25% below pre-COVID levels, capping private investment and hotel revenues.', 'Tropical cyclone disruptions to taro and vanilla production reduced rural cash income.'],
    SAM: ['Fiscal consolidation generated a primary surplus of 1.2% of GDP for the first time since 2018.', 'Tourism recovery drove services sector expansion; visitor arrivals up 38% on 2022.', 'PALM scheme placements in Australia boosted remittance inflows to record USD 420 mn.', 'Improved revenue administration with ADB support raised tax-to-GDP by 1.4 ppt.'],
    KIR: ['Fishing licence fees from the Pacific tuna fleet provided stable sovereign revenue.', 'Taiwan and ADB infrastructure grants financed public investment without debt accumulation.', 'High food and fuel import costs kept consumption growth subdued despite income gains.', 'Climate adaptation spending crowded out growth-enhancing capital investment.'],
    TUV: ['New Zealand seasonal worker placements expanded, lifting remittance income.', 'Government spending funded by the Tuvalu Trust Fund supported public services.', 'Sea-level rise adaptation costs reduced fiscal space for productive investment.', 'Small population and geographic isolation keep private sector growth structurally limited.'],
  },
  DEBT_GDP: {
    PNG: ['Large LNG-backed infrastructure borrowing from 2014–19 continues to weigh on the debt stock.', 'Currency depreciation raised the local-currency value of USD-denominated obligations.', 'Slower-than-projected LNG revenue materialisation delayed fiscal consolidation.', 'ADB and World Bank concessional lending provided some relief compared to commercial alternatives.'],
    FIJ: ['COVID-19 emergency borrowing in 2020–21 raised debt from 49% to 87% of GDP.', 'Tourism revenue recovery is gradually restoring fiscal surpluses and debt trajectory.', 'Fiji\'s fiscal responsibility legislation caps new borrowing at 3% of GDP per year.', 'Multilateral refinancing of commercial debt at concessional rates reduced debt service costs.'],
    VAN: ['Low pre-COVID debt stock provided a modest buffer before cyclone-related borrowing.', 'Emergency reconstruction borrowing from ADB and World Bank added ~8% of GDP to the debt ratio.', 'Vanuatu\'s no-income-tax model limits revenue mobilisation capacity during fiscal stress.', 'Citizenship by investment revenue (CBI) provides some off-budget fiscal headroom.'],
    SOL: ['Chinese infrastructure loans — particularly Tina River Hydro — increased external debt rapidly.', 'Pre-existing ADB concessional debt remains manageable relative to the newer commercial exposure.', 'Logging revenue volatility makes debt service unpredictable during commodity downswings.', 'IMF DSA classifies Solomon Islands at high risk of debt distress.'],
    TON: ['ExIm Bank China loans for the Tonga Submarine Cable and roads dominate the debt stock.', 'Debt rescheduling negotiations with China extended maturities but did not reduce principal.', 'ADB grants provide grant-only financing, avoiding further debt accumulation on new projects.', 'Remittance inflows buffer the external position despite elevated debt ratios.'],
    SAM: ['ADB-supported Medium-Term Expenditure Framework capped non-essential spending.', 'Tourism-driven revenue recovery reduced the need for new deficit financing.', 'Bilateral debt restructuring with a creditor reduced debt service by USD 6 mn/year.', 'Samoa exited IMF debt distress high-risk classification in late 2024.'],
  },
  CPI: {
    PNG: ['Global energy price volatility passes through directly via fuel import dependence.', 'PNG Kina depreciation raised landed costs for food and manufactured imports.', 'Drought in Highlands provinces reduced domestic food supply and pushed market prices higher.', 'Monetary policy tightening by Bank of PNG helped dampen demand-pull inflation.'],
    FIJ: ['Fiji imports ~85% of fuel; global energy spikes translate directly to domestic CPI.', 'FJD depreciation of 2.1% against USD in 2024 raised import costs across categories.', 'Western Division drought reduced domestic food production, increasing food price pass-through.', 'Expansionary fiscal policy in 2022–23 created demand-pull pressure on non-tradeable services.'],
    VAN: ['Vatu depreciation raised the cost of Vanuatu\'s highly import-dependent consumer basket.', 'Post-cyclone logistics disruptions caused localised food price spikes in outer islands.', 'Global shipping costs remain elevated, adding ~4% to import landed costs vs. 2019.', 'Agricultural supply shocks from cyclone damage reduced domestic food availability.'],
    SOL: ['Solomon Islands imports over 90% of consumer goods; global price movements pass through fully.', 'SBD depreciation amplified the local-currency impact of global commodity inflation.', 'Fuel subsidy removal in 2023 triggered a one-off 3.5% increase in transport and utility prices.', 'Improved monetary coordination between CBSI and government reduced broad money growth.'],
    TON: ['Tonga imports nearly all manufactured goods and most food; CPI tracks global price cycles closely.', 'TOP nominal stability against AUD and NZD has helped contain imported inflation somewhat.', 'Remittance-driven consumption growth created domestic demand-pull pressures in urban Nuku\'alofa.', 'Global food prices (particularly rice and wheat) remain a key transmission channel.'],
    SAM: ['Samoa\'s import dependence for food and fuel exposes CPI directly to global price shifts.', 'WST has remained broadly stable against USD, limiting currency-driven import price inflation.', 'PALM scheme remittances boosted household income and aggregate demand beyond supply capacity.', 'Port congestion delays during peak shipping season added temporary supply-side cost pressures.'],
  },
  REMITTANCES: {
    PNG: ['Large diaspora in Australia, NZ and SE Asia maintains remittance flows despite distance.', 'Mobile money penetration improved, reducing transfer costs and increasing net receipts.', 'Seasonal Worker Programme placements from PNG to AUS increased by 22% in 2024.', 'Informal hawala-style transfers still significant; formal data likely underestimates total flows.'],
    FIJ: ['New Zealand\'s Pacific Access Category visa boosted registered Fijian worker placements.', 'Australia\'s PALM scheme added horticulture placements, particularly in Queensland.', 'Improved digital transfer channels (WorldRemit, Wise) cut average costs to 5.4%.', 'Favourable AUD/NZD exchange rates amplified local-currency value of inward transfers.'],
    VAN: ['Seasonal worker placements to Australia and NZ are Vanuatu\'s largest remittance driver.', 'Post-cyclone displacement temporarily reduced outbound worker mobility from outer islands.', 'Western Union and ANZ remain dominant transfer corridors despite high fees (~8%).', 'Remittances accounted for 21% of GDP in 2024, second only to tourism revenue.'],
    SOL: ['NZ Recognised Seasonal Employer scheme accounts for the majority of formal remittances.', 'PALM scheme placements in Australian horticulture grew 34% year-on-year in 2024.', 'Financial inclusion improvements allow more rural households to receive formal transfers.', 'Remittances provide critical income smoothing for rural families during commodity price cycles.'],
    TON: ['Tonga has the world\'s highest remittance-to-GDP ratio at ~40%.', 'Large Tongan diaspora in NZ, AUS, and USA provides durable remittance base.', 'Seasonal Worker Programme and PALM placements are the fastest-growing remittance source.', 'Digital transfer adoption accelerated; mobile wallet users grew 45% since 2022.'],
    SAM: ['PALM scheme added ~12,000 new seasonal placements in AUS — largest single-year expansion.', 'NZ Pacific Access Category visa programme expanded registered Samoan placements by 34%.', 'Average transfer cost fell from 8.2% to 5.4%, increasing net household receipts.', 'AUD/NZD strength boosted the tala-denominated value of inward transfers.'],
  },
}

function getPacificReasons(ind: IndKey, code: string): string[] {
  return PACIFIC_IND_REASONS[ind]?.[code] ?? []
}

const PUBLICATIONS: Publication[] = [
  {
    id: 'ado-2026',
    type: 'Flagship Report', typeBg: '#007DB7', coverBg: '#00256C',
    title: 'Asian Development Outlook 2026',
    subtitle: 'Navigating Uncertainty in Asia and the Pacific',
    date: 'April 2026', series: 'Asian Development Outlook',
    abstract: 'Projects 4.8% growth for developing Asia in 2026 amid subdued global trade and elevated debt. Dedicated chapter on Pacific SIDS fiscal sustainability.',
    url: 'https://www.adb.org/publications/asian-development-outlook-2026', pages: 302,
    keyContent: `GROWTH PROJECTIONS: ADB projects developing Asia to grow 4.8% in 2026, revised down from 5.0% in the April 2025 ADO due to weaker external demand from the US and Europe. China is projected at 4.5%, India at 6.7%. The Pacific subregion is forecast to grow 3.2% in 2026, supported by continued tourism recovery and infrastructure investment, but constrained by high debt levels and climate shocks.

PACIFIC HIGHLIGHTS: Fiji leads Pacific growth at an estimated 3.8% in 2026 as tourist arrivals approach pre-pandemic peaks. Papua New Guinea (PNG) grows 4.1% driven by LNG exports and construction activity. Tonga and Samoa expand modestly at 2.5–3.0%, underpinned by remittance inflows from Australia and New Zealand under the PALM Scheme. Vanuatu recovers slowly at 2.8% following Cyclone Judy (2024), with reconstruction supported by ADB and World Bank grant financing.

INFLATION: Regional inflation for developing Asia is projected to ease to 2.8% in 2026 from 3.1% in 2025 as global commodity prices stabilise. Pacific SIDS face imported inflation risks given their dependence on imported food and fuel, which account for 30–50% of CPI baskets. Fiji CPI is forecast at 3.2% for 2026; Tonga at 4.1%; PNG at 5.5% reflecting currency depreciation pressure.

RISKS AND UNCERTAINTY: Key downside risks include: (i) escalation of US tariffs reducing export demand for manufactured goods across Asia; (ii) prolonged high global interest rates raising debt-servicing costs for Pacific SIDS; (iii) more frequent and intense natural disasters (cyclones, flooding) disrupting growth in small island economies; (iv) delays in Chinese construction lending to PNG and Vanuatu affecting infrastructure pipelines.

PACIFIC SIDS FISCAL CHAPTER: The dedicated chapter on Pacific SIDS fiscal sustainability finds that average public debt in 14 Pacific developing member countries (DMCs) rose from 44% of GDP pre-pandemic to 58% of GDP in 2023. Five countries—Tonga, Samoa, Marshall Islands, Kiribati, and FSM—are assessed at high risk of debt distress by IMF/World Bank Debt Sustainability Analysis. The chapter recommends revenue mobilisation reforms (broadening VAT base, improving compliance), rationalization of fuel subsidies, and concessional climate finance to reduce fiscal pressure from disaster response.

MONETARY POLICY CONTEXT: Monetary policy remains accommodative across most Pacific DMCs. The Reserve Bank of Fiji (RBF) held its Overnight Policy Rate (OPR) at 0.25% through 2025 to support credit growth. The National Reserve Bank of Tonga (NRBT) maintained its statutory reserve deposit requirement. Countries without independent monetary policy (Marshall Islands, Palau, FSM, Timor-Leste using USD; Kiribati using AUD) rely entirely on fiscal policy as the stabilisation tool.`,
  },
  {
    id: 'key-indicators-2025',
    type: 'Statistics', typeBg: '#8DC63F', coverBg: '#163a10',
    title: 'Key Indicators for Asia and the Pacific 2025',
    subtitle: '56th Edition — Statistical Compendium',
    date: 'August 2025', series: 'Key Indicators',
    abstract: 'Comprehensive economic, financial, social, and environmental statistics for 49 ADB member economies. Includes KIDB data underlying this platform.',
    url: 'https://www.adb.org/publications/key-indicators-asia-pacific', pages: 448,
    keyContent: `OVERVIEW: The 56th edition of Key Indicators covers economic, financial, social, and environmental data for 49 ADB member economies across five regions: Central Asia, East Asia, South Asia, Southeast Asia, and the Pacific. Data is sourced from national statistical offices, ADB's KIDB SDMX API, IMF, World Bank, and UN agencies.

PACIFIC ECONOMIC DATA (selected 2024 figures from the compendium):
- Fiji: GDP $5.1 billion, GDP per capita $5,480, real GDP growth 3.5%, inflation 3.1%, fiscal deficit -4.2% of GDP, public debt 84% of GDP, current account -10.4% of GDP.
- Papua New Guinea: GDP $28.6 billion, GDP per capita $2,880, real GDP growth 4.3%, inflation 5.8%, fiscal deficit -2.9% of GDP, public debt 49% of GDP.
- Samoa: GDP $0.94 billion, GDP per capita $4,490, real GDP growth 4.2%, inflation 4.5%, remittances 34% of GDP, public debt 52% of GDP.
- Tonga: GDP $0.52 billion, GDP per capita $4,830, real GDP growth 2.8%, inflation 5.2%, remittances 44% of GDP (highest in Pacific), public debt 49% of GDP.
- Solomon Islands: GDP $1.73 billion, GDP per capita $2,290, real GDP growth 2.5%, inflation 6.4%, fiscal deficit -3.8% of GDP.
- Vanuatu: GDP $1.02 billion, GDP per capita $3,080, real GDP growth 1.9% (post-cyclone), fiscal deficit -5.1% of GDP.

SOCIAL INDICATORS (Pacific):
- Poverty headcount at $2.15/day (2017 PPP): PNG 36.9%, Solomon Islands 22.7%, Vanuatu 15.4%, Fiji 4.0%, Samoa 2.9%, Tonga 1.6%.
- Life expectancy: Pacific DMC average 69.4 years (2023), ranging from 65.8 in PNG to 73.2 in Fiji.
- Literacy rate (15+): Fiji 99.1%, Samoa 99.0%, Tonga 99.4%, PNG 64.2%, Solomon Islands 84.1%.
- Internet access: Fiji 57%, Samoa 40%, Tonga 52%, PNG 13%, Solomon Islands 19%.

ENVIRONMENTAL INDICATORS:
- CO2 emissions per capita: PNG 0.7 tonnes, Fiji 1.6 tonnes, Samoa 1.2 tonnes, Tonga 1.8 tonnes.
- Renewable energy share of electricity: Samoa 69% (hydropower + solar), Tonga 48% (solar), Fiji 60% (hydropower + solar), PNG 27%.
- Forest cover: PNG 74%, Solomon Islands 78%, Vanuatu 36%, Fiji 56%.

METHODOLOGY: Data compiled from KIDB SDMX API (the same underlying source as this ERDI Intelligence Hub), supplemented by IMF World Economic Outlook database (April 2025), World Bank World Development Indicators (2025), and UNSD National Accounts statistics. All monetary values in current USD unless otherwise noted. Growth rates in constant local currency prices.`,
  },
  {
    id: 'pacific-monitor-dec-2025',
    type: 'Regional Monitor', typeBg: '#00A5D2', coverBg: '#062030',
    title: 'Pacific Economic Monitor',
    subtitle: 'December 2025 Edition',
    date: 'December 2025', series: 'Pacific Economic Monitor',
    abstract: 'Bi-annual review of economic conditions across 14 Pacific developing member countries. Covers growth, inflation, fiscal positions, and ADB portfolio updates.',
    url: 'https://www.adb.org/publications/pacific-economic-monitor', pages: 52,
    keyContent: `OVERVIEW: The December 2025 Pacific Economic Monitor covers economic developments across ADB's 14 Pacific developing member countries (DMCs) through mid-2025. The Pacific subregion is estimated to have grown 3.4% in 2025, up from 3.1% in 2024, led by Fiji and PNG.

FIJI: Tourist arrivals reached 961,000 in the 12 months to September 2025, surpassing the pre-pandemic peak of 894,000 (2019). Tourism earnings contributed an estimated FJD 2.1 billion (approx. 27% of GDP) in 2025. The Reserve Bank of Fiji held the Overnight Policy Rate (OPR) at 0.25%. Headline CPI inflation moderated to 2.9% year-on-year in October 2025 from a peak of 6.1% in 2022, driven by lower global food and fuel prices. The fiscal deficit is estimated at 3.8% of GDP for FY2025/26, with public debt at 82% of GDP. The government targets a return to primary surplus by FY2027/28 under the Medium Term Fiscal Strategy.

PAPUA NEW GUINEA: Real GDP growth is estimated at 4.5% in 2025, supported by LNG export revenues (ExxonMobil PNG LNG project) and gold/copper mining (Lihir, Ok Tedi, Porgera re-opening). CPI inflation remains elevated at 5.4% YOY in Q3 2025, partly reflecting kina depreciation against the USD (approximately 3% in 2025). The Bank of Papua New Guinea maintained its Kina Facility Rate at 3.0%. Fiscal deficit estimated at 2.7% of GDP; total public debt at 51% of GDP.

TONGA: Real GDP growth of 3.0% in FY2025 (year ending June 2025), driven by construction activity related to Hunga Tonga–Hunga Ha'apai volcanic eruption reconstruction (completed mid-2025 with ADB, World Bank, and Australian support) and strong remittance inflows. Remittances reached TOP 558 million (approx. 44% of GDP) in 2024/25, a 7% increase YOY. The National Reserve Bank of Tonga (NRBT) maintained accommodative monetary policy. Headline inflation eased to 4.2% YOY in September 2025 from a peak of 12.4% in 2022.

SAMOA: Growth of 4.8% in FY2025, the highest in six years, driven by tourism (arrivals up 28% YOY to 183,000) and remittances (WST 901 million, ~34% of GDP). CPI inflation moderated to 3.8% YOY. The Central Bank of Samoa (CBS) held its monetary policy accommodative with the reference rate at 7.75%.

SOLOMON ISLANDS: GDP growth estimated at 2.5% in 2025. Post-earthquake reconstruction in Western Province supported construction activity. Fiscal deficit widened to 4.2% of GDP, partly due to emergency spending. Inflation at 5.9% YOY reflecting imported food price pressures. The Central Bank of Solomon Islands (CBSI) maintained tight liquidity conditions.

VANUATU: GDP growth of 2.2% in 2025 as reconstruction from Cyclone Judy (March 2024, Category 4) continues. ADB provided a USD 25 million emergency loan for infrastructure repair. Inflation moderated to 3.6% YOY. Fiscal deficit remained wide at 5.3% of GDP due to reconstruction spending and revenue shortfalls from the cyclone-hit tourism sector.

POLICY RECOMMENDATIONS: The Monitor recommends: (i) Pacific governments strengthen revenue mobilisation to create fiscal space for disaster response; (ii) accelerate renewable energy transition to reduce fuel import dependency; (iii) expand financial inclusion to maximise remittance multiplier effects; (iv) invest in climate-resilient infrastructure to reduce disaster reconstruction costs.

ADB PORTFOLIO: ADB's active sovereign portfolio in the Pacific totals approximately USD 2.1 billion across 67 projects as of December 2025. Key active projects include Fiji Urban Water Supply and Wastewater Management Project (USD 88M), PNG Highlands Highway Maintenance and Rehabilitation (USD 125M), Samoa Climate Resilience Improvement Project Phase 2 (USD 40M), and Tonga Renewable Energy Project (USD 31M).`,
  },
  {
    id: 'adr-2025',
    type: 'Journal', typeBg: '#E9532B', coverBg: '#2a0e00',
    title: 'Asian Development Review',
    subtitle: 'Vol. 42, No. 2 — 2025',
    date: 'September 2025', series: 'Asian Development Review',
    abstract: 'Peer-reviewed journal of economics and development. Vol. 42 No. 2 features papers on Pacific labour mobility, climate adaptation financing, and Central Asia trade corridors.',
    url: 'https://www.adb.org/publications/asian-development-review', pages: 180,
    keyContent: `OVERVIEW: The Asian Development Review (ADR), Vol. 42, No. 2 (September 2025) is a peer-reviewed journal published by ADB and MIT Press. It contains six research articles and two research notes on development economics in Asia and the Pacific.

ARTICLE 1 — Pacific Labour Mobility and Structural Transformation:
Authors: Terence Yong, Isabelle Rosales, and Nilufar Rashidova (ADB).
This paper examines whether Pacific Island labour mobility schemes (PALM, RSE) accelerate structural transformation in origin economies. Using difference-in-differences estimation with data from Tonga, Samoa, Vanuatu, and Fiji (2005–2023), the authors find that a 10% increase in PALM/RSE participation rates is associated with a 1.8% decline in subsistence agriculture employment and a 2.3% increase in service sector employment in receiving communities, suggesting moderate structural transformation effects. However, skill upgrading effects are limited; most returning workers re-enter informal employment rather than formal wage employment, pointing to inadequate domestic labour market absorption capacity.

ARTICLE 2 — Climate Adaptation Financing Gaps in Small Island Developing States:
Authors: Marcus Chambers and Sarah Fleming (ADB Pacific Department).
Uses a novel bottom-up costing model to estimate the climate adaptation investment need for Pacific SIDS at USD 3.2–4.7 billion per year through 2030, compared to current climate finance flows of approximately USD 285 million per year—a gap of USD 2.9–4.4 billion annually. The paper argues that parametric insurance (catastrophe bonds), blue economy bonds, and debt-for-climate swaps could close approximately 25% of the gap, with the remainder requiring scaled-up multilateral concessional finance.

ARTICLE 3 — Central Asia Trade Corridor Development and Economic Integration:
Authors: Amaru Pedraza, Bolat Turebekov, and Aiko Kikkawa (ADB CAREC).
Examines the economic impact of CAREC transport corridors on trade flows and regional integration in Central Asia. The paper finds that each USD 1 billion invested in CAREC corridors generates a 4.2% increase in bilateral trade among connected economies. The analysis uses a gravity model with 20 years of panel data.

RESEARCH NOTE 1 — Informality and Monetary Policy Transmission in Pacific Island Economies:
This note examines why conventional monetary policy instruments (interest rates, reserve requirements) have limited transmission in Pacific economies with large informal sectors (40–65% of employment in PNG, Solomon Islands, Vanuatu). Authors find that the credit channel of monetary policy operates primarily through the formal urban sector; rural and peri-urban households are largely unaffected by central bank rate decisions.

RESEARCH NOTE 2 — Gender Dimensions of Remittances in Tonga and Samoa:
Female remittance recipients in Tonga are found to allocate 68% of remittance income to food, education, and healthcare—significantly higher than the 41% allocation by male recipients. The paper recommends designing remittance products and financial literacy programmes with gender-differentiated approaches.

JOURNAL INFORMATION: The ADR is published twice yearly (March and September). It covers development economics, applied econometrics, public finance, trade, environment, and social policy across ADB's 68 member economies. Submission acceptance rate: approximately 12%.`,
  },
  {
    id: 'pacmon-jun-2025',
    type: 'Regional Monitor', typeBg: '#00A5D2', coverBg: '#062030',
    title: 'Pacific Economic Monitor',
    subtitle: 'July 2025 Edition',
    date: 'July 2025', series: 'Pacific Economic Monitor',
    abstract: 'Mid-year review covering tourism recovery in Fiji, reconstruction progress in Vanuatu post-cyclone, and remittance trends for Samoa and Tonga in H1 2025.',
    url: 'https://www.adb.org/publications/pacific-economic-monitor', pages: 48,
    keyContent: `OVERVIEW: The July 2025 Pacific Economic Monitor provides a mid-year update on economic conditions in ADB's 14 Pacific DMCs. The subregional growth estimate for 2025 is revised upward to 3.4% from 3.1% in the April 2025 ADO, reflecting stronger-than-expected tourism performance in Fiji and Vanuatu, and robust remittance inflows to Tonga and Samoa.

TOURISM RECOVERY — FIJI:
Fiji recorded 487,000 tourist arrivals in H1 2025 (Jan–June), a 9% increase over H1 2024. Australia remains the largest source market (41%), followed by New Zealand (22%), United States (14%), and other markets (23%). Tourism earnings for H1 2025 are estimated at FJD 1.05 billion. The Reserve Bank of Fiji's Business Confidence Survey (Q1 2025) shows hotel and accommodation sector confidence at its highest level since 2018. The Fiji government's Tourism 2025 strategy targets 1 million annual arrivals; the July Monitor notes this target is likely to be achieved by Q3 2025 based on current trends.

VANUATU RECONSTRUCTION:
Post-Cyclone Judy (Category 4, March 2024) reconstruction is approximately 60% complete as of June 2025. ADB's USD 25M emergency loan has been fully disbursed, funding road repairs on Santo and Malekula and school reconstruction in Shefa Province. The Vanuatu government estimates total reconstruction cost at VUV 18.5 billion (approx. USD 155M). Agriculture sector recovery is slower, with copra and kava production still 18% below pre-cyclone levels due to damaged plantations. Tourism arrivals to Vanuatu reached 142,000 in H1 2025, recovering to 78% of pre-cyclone levels.

REMITTANCES — TONGA AND SAMOA H1 2025:
- Tonga: Remittance inflows of TOP 271 million in H1 2025, a 6.2% YOY increase. PALM Scheme participants (18,400 workers) continue to be the primary driver of growth. The National Reserve Bank of Tonga reports that 71% of remittances are received via mobile money platforms (MPaisa, TongaPay), up from 48% in 2022, reflecting rapid fintech adoption.
- Samoa: Remittance inflows of WST 447 million in H1 2025 (FY2025), up 8.1% YOY. The Central Bank of Samoa notes that the average cost of remittance transfers fell to 6.9% in Q1 2025 from 8.2% in Q1 2023, partly reflecting increased competition from digital transfer operators.

INFLATION UPDATE (June 2025):
- Fiji: 3.1% YOY (May 2025); fuel component -1.2% due to global oil price easing.
- PNG: 5.6% YOY; food inflation 7.2% reflecting continued kina depreciation.
- Samoa: 3.9% YOY; driven by imported food (+5.4%) and housing costs (+3.8%).
- Tonga: 4.5% YOY; electricity prices rose 8.1% following removal of fuel subsidy in January 2025.
- Solomon Islands: 6.1% YOY; highest in the Pacific, reflecting food and transport cost pressures.
- Vanuatu: 3.4% YOY; post-cyclone construction-related price pressures partially offset by lower global commodity prices.

FISCAL UPDATES:
Papua New Guinea's 2025 mid-year budget review projects a fiscal deficit of 2.5% of GDP, improved from the initial budget estimate of 2.9%, due to higher-than-expected LNG revenue and mining royalties. Fiji's 2025/26 budget (tabled July 2025) targets a deficit reduction to 3.5% of GDP from 4.2% in 2024/25, with revenue measures including a 2 percentage point increase in corporate tax rate to 22% and extension of the departure tax.

ADB OPERATIONS UPDATE:
ADB approved three new Pacific projects in H1 2025: (i) PNG Transport Sector Development Project (USD 75M loan + USD 15M grant); (ii) Kiribati Integrated Urban Water and Sanitation Project (USD 20M grant); (iii) Pacific Private Sector Development Initiative Phase 4 (USD 8M technical assistance). Total ADB lending approvals for Pacific in 2025 are on track to reach USD 450–500M, consistent with the ADB Pacific Approach 2021–2025 targets.`,
  },
  {
    id: 'adb-blogs',
    type: 'Blog', typeBg: '#007DB7', coverBg: '#00256C',
    title: 'ADB Blogs',
    subtitle: 'Ideas, analysis, and perspectives from ADB economists and specialists',
    date: 'Ongoing', series: 'ADB Blogs',
    abstract: 'Expert commentary and analysis on development economics, climate change, infrastructure, and poverty reduction across Asia and the Pacific. Updated weekly.',
    url: 'https://blogs.adb.org/', pages: 0,
    keyContent: `OVERVIEW: ADB Blogs (blogs.adb.org) is ADB's expert commentary platform, publishing 3–5 posts per week by ADB staff, consultants, and external experts. Key blog categories include: Economics & Finance, Climate & Environment, Infrastructure, Health, Education, Gender, and Pacific & Islands.

RECENT PACIFIC-RELEVANT BLOG POSTS (2025):
1. "Tonga's Recovery: One Year After the Eruption" — Reviews post-Hunga Tonga reconstruction progress, noting that while physical infrastructure is largely rebuilt, the social and economic recovery of fishing communities on Nomuka and 'Eua islands remains incomplete.

2. "Why the Pacific Needs Parametric Insurance, Not Traditional Aid" — Argues that traditional post-disaster aid (slow, uncertain, politically conditioned) should be supplemented with parametric catastrophe insurance instruments that trigger automatic payouts when cyclone wind speed or storm surge thresholds are breached.

3. "The PALM Scheme's Unintended Consequences: Skills Drain or Skills Circulation?" — Critically examines evidence on whether Pacific seasonal labour migration creates skills drain in origin communities, finding mixed evidence: healthcare and teaching sectors in Tonga have experienced staffing shortages, while agricultural productivity has increased due to remittance-funded inputs.

4. "Fiji's Public Debt: Time to Worry?" — Analyses Fiji's public debt trajectory (82% of GDP in 2025), arguing that while the level is manageable given Fiji's strong institutions and access to tourism revenue, the composition of debt (40% domestic at relatively high interest rates) creates refinancing risks if growth slows.

5. "Closing the Climate Finance Gap for Pacific SIDS" — Provides accessible summary of ADB research finding that Pacific SIDS receive only USD 110 per capita in climate finance versus the USD 600–800 per capita needed to meet NDC targets, and calls for GCF access reform.

6. "Food Security in the Pacific: Imported Inflation and Local Solutions" — Examines how Pacific Island economies, which import 60–80% of their food supply, are exposed to global commodity price shocks. Highlights successful cases of domestic food production promotion in Tonga (taro export programme) and Solomon Islands (fisheries development).

BLOG THEMES MOST RELEVANT TO ERDI USERS: Economic growth and fiscal management; Remittances and labour mobility; Climate resilience and adaptation finance; Tourism and private sector development; Monetary policy in small open economies; SDG progress tracking in Pacific SIDS.`,
  },
  {
    id: 'development-asia',
    type: 'Blog', typeBg: '#00A5D2', coverBg: '#062030',
    title: 'Development Asia',
    subtitle: 'Stories, data, and multimedia on development across Asia and the Pacific',
    date: 'Ongoing', series: 'Development Asia',
    abstract: 'ADB\'s flagship digital magazine featuring long-form analysis, data stories, and policy insights on the economic and social challenges facing Asia-Pacific developing countries.',
    url: 'https://development.asia/', pages: 0,
    keyContent: `OVERVIEW: Development Asia (development.asia) is ADB's flagship digital magazine, featuring long-form data journalism, policy analysis, multimedia content, and interactive data visualisations on development topics across Asia and the Pacific. It is updated 2–3 times per week and targets policymakers, researchers, and development practitioners.

RECENT FEATURED PACIFIC CONTENT:
1. "The Last Mile: Bringing Solar Energy to Remote Pacific Islands" — Data story examining the 22 Pacific island communities (primarily in Solomon Islands, Vanuatu, and Kiribati) that have achieved 100% renewable electricity through ADB-supported solar-plus-storage minigrids since 2020. Interactive map shows energy access rates by province.

2. "Drowning in Debt: Can Pacific Islands Afford Climate Change?" — Long-form analysis combining debt sustainability data with climate risk indices. Shows that the 5 Pacific countries most at risk of debt distress (Tonga, Samoa, Marshall Islands, Kiribati, FSM) are also among the top 10 globally for climate vulnerability on the ND-GAIN Country Index.

3. "The Remittance Economy: Life in a Tongan Village" — Multimedia feature following three Tongan households whose primary income is remittances from family members in New Zealand and Australia under the PALM Scheme. Documents how remittances fund school fees, medical costs, home construction, and church contributions.

4. "Fiji's Tourism Boom: Who Benefits?" — Investigative data analysis examining tourism revenue distribution in Fiji, finding that while aggregate tourism earnings have recovered to pre-pandemic levels, benefits are concentrated in Viti Levu (main island), with outer islands and indigenous Fijian communities receiving a smaller share. Recommends community-based tourism investment.

5. "PNG's Resource Curse: LNG Revenues and the Development Gap" — Analysis of the paradox that despite LNG export revenues exceeding USD 2 billion per year, PNG's poverty rate (36.9% at USD 2.15/day) has barely changed since 2010. Examines governance, revenue transparency, and infrastructure delivery failures.

INTERACTIVE DATA TOOLS: Development Asia hosts several interactive data portals including: Asia-Pacific Climate Change and Disaster Risk Dashboard; Pacific SIDS Economic Vulnerability Tracker; KIDB Data Visualizer (the public-facing equivalent of this ERDI platform); and the SDG Progress Monitor for ADB members.

TARGET AUDIENCE: Policy-oriented general public, government officials, researchers, students, media, and development practitioners. Content is designed to be accessible without technical economics training while remaining substantively rigorous.`,
  },
  // ── Pacific Media ─────────────────────────────────────────────────────────
  {
    id: 'rnz-pacific',
    type: 'News', typeBg: '#00A5D2', coverBg: '#021d30',
    title: 'RNZ Pacific',
    subtitle: 'Radio New Zealand — Pacific News Hub',
    date: 'Daily', series: 'Radio New Zealand',
    abstract: 'New Zealand\'s public broadcaster covering Pacific Island nations daily. Reporting in English and Pacific languages on politics, economics, climate, and development across the region.',
    url: 'https://www.rnz.co.nz/international/pacific-news', pages: 0,
    keyContent: `SOURCE: RNZ Pacific (Radio New Zealand) — https://www.rnz.co.nz/international/pacific-news

RNZ Pacific is New Zealand's most comprehensive English-language Pacific news service, publishing daily reporting across all Pacific Island nations. It is publicly funded and editorially independent.

KEY COVERAGE AREAS:
- Pacific politics and governance: elections, government policy, parliamentary developments across Fiji, Samoa, Tonga, PNG, Solomon Islands, Vanuatu, Cook Islands, Niue, and all Pacific Forum member states.
- Economic and development news: IMF/World Bank/ADB programme updates, budget announcements, trade agreements, infrastructure projects, tourism sector performance, and remittance trends.
- Climate and environment: cyclone and disaster reporting, climate finance negotiations (UNFCCC COP coverage from Pacific perspective), sea-level rise impacts, and renewable energy developments.
- Labour mobility: PALM Scheme and RSE Scheme worker stories, diaspora community news, migration policy from Australian and New Zealand perspective.
- Health and social issues: Pacific maternal and child health, NCDs (non-communicable diseases), COVID-19 legacy impacts, food security.

BROADCAST SERVICES: RNZ Pacific also broadcasts via shortwave and AM radio to the Pacific, and produces news in Samoan, Tongan, Niuean, Cook Islands Māori, and Tokelauan.

RELEVANCE TO ERDI: RNZ Pacific is the primary source for near-real-time economic and policy developments in Pacific nations, complementing the statistical data in KIDB with qualitative policy context. Journalists frequently interview ADB, IMF, and Pacific government officials.`,
  },
  {
    id: 'abc-pacific',
    type: 'News', typeBg: '#007DB7', coverBg: '#001a30',
    title: 'ABC Pacific',
    subtitle: 'Australian Broadcasting Corporation — Pacific Beat',
    date: 'Daily', series: 'ABC International',
    abstract: 'Australia\'s public broadcaster with dedicated Pacific coverage via Pacific Beat. Reporting on politics, economics, and development across Melanesia, Polynesia, and Micronesia.',
    url: 'https://www.abc.net.au/pacific', pages: 0,
    keyContent: `SOURCE: ABC Pacific / Pacific Beat (Australian Broadcasting Corporation) — https://www.abc.net.au/pacific

ABC Pacific is Australia's premier Pacific-focused news service, operated by the Australian Broadcasting Corporation. The flagship programme Pacific Beat airs daily on ABC Radio Australia and is broadcast across the Pacific via shortwave, FM relay stations, and online streaming.

KEY COVERAGE AREAS:
- Papua New Guinea: Extensive coverage as Australia's nearest large neighbour — political developments, LNG and mining sector news, PNGDF operations, Australian aid programme updates, and border security.
- Pacific security and geopolitics: Australian strategic engagement in the Pacific, China's Pacific engagement (infrastructure loans, diplomatic recognition), US COMPACT of Free Association negotiations, and Pacific Islands Forum geopolitics.
- Economic policy: Budget analysis, IMF Article IV consultations, Australian aid (DFAT Pacific programmes), infrastructure investment, and trade.
- Climate and disaster: Cyclone reporting, Pacific climate advocacy at UNFCCC, coral bleaching and reef health, and climate migration.
- Labour mobility: Worker testimonials and policy analysis on PALM Scheme, RSE Scheme conditions, and return migration.

PACIFIC BEAT PROGRAMME: Airs Monday–Friday, produced in Sydney with Pacific correspondents in Port Moresby, Suva, Honiara, and Apia. Frequency: shortwave 9580 kHz, 11695 kHz; online via ABC Listen app.

RELEVANCE TO ERDI: ABC Pacific provides Australian government and aid agency perspectives on Pacific economic developments, and is essential for tracking Australia's bilateral economic relationships with Pacific DMCs.`,
  },
  {
    id: 'islands-business',
    type: 'Magazine', typeBg: '#8DC63F', coverBg: '#0d2a14',
    title: 'Islands Business',
    subtitle: 'The Pacific\'s Business & Political Magazine',
    date: 'Monthly', series: 'Islands Business',
    abstract: 'Fiji-based regional magazine covering Pacific business, politics, and economics since 1975. The primary English-language business publication across Pacific Island nations.',
    url: 'https://islandsbusiness.com/', pages: 0,
    keyContent: `SOURCE: Islands Business — https://islandsbusiness.com/

Islands Business is the Pacific region's longest-running and most widely read business and political magazine, published monthly from Suva, Fiji since 1975. It is read by government officials, business leaders, and development practitioners across all Pacific Island nations.

KEY COVERAGE AREAS:
- Pacific business news: Corporate developments, banking and finance sector news, investment climate, tourism industry, and trade across all Pacific Island nations.
- Political economy: Elections, government formation, budget analysis, public policy, and regional diplomacy at Pacific Islands Forum, MSG, and PIF meetings.
- Sector analysis: Mining and resources (PNG, Solomon Islands), tourism (Fiji, Vanuatu, Cook Islands), fisheries (FSM, Kiribati, Tuvalu), agriculture and copra, and telecommunications.
- Regional infrastructure: Port, airport, and road development projects; ADB, World Bank, and Chinese-funded infrastructure.
- Finance and banking: Central bank news (RBF, NRBT, CBS, CBSI, BPNG), interest rate decisions, credit growth, banking system developments, and financial inclusion.

FLAGSHIP SECTIONS:
- Business Monitor: Monthly economic indicators and commentary for each Pacific nation
- Pacific CEO Profiles: Interviews with regional business leaders
- Political Analysis: Regional political risk assessments
- Tourism Tracker: Visitor arrival data and hotel occupancy rates

RELEVANCE TO ERDI: Islands Business provides the business community perspective on Pacific economic data, bridging statistical indicators with ground-level business conditions and investment sentiment across the region.`,
  },
  {
    id: 'pacific-island-times',
    type: 'News', typeBg: '#E9532B', coverBg: '#2a0e00',
    title: 'Pacific Island Times',
    subtitle: 'News from Guam, CNMI, Palau, FSM, Marshall Islands',
    date: 'Daily', series: 'Pacific Island Times',
    abstract: 'Independent news outlet covering Micronesia — Guam, Commonwealth of the Northern Mariana Islands, Palau, Federated States of Micronesia, and Marshall Islands.',
    url: 'https://www.pacificislandtimes.com/', pages: 0,
    keyContent: `SOURCE: Pacific Island Times — https://www.pacificislandtimes.com/

Pacific Island Times is an independent digital news outlet focused primarily on Micronesian territories and nations: Guam, the Commonwealth of the Northern Mariana Islands (CNMI), Palau, the Federated States of Micronesia (FSM), and the Marshall Islands. It provides English-language coverage of politics, economics, and community affairs across this largely underreported subregion.

KEY COVERAGE AREAS:
- COMPACT of Free Association: US COMPACT agreement negotiations and implementation for FSM, Marshall Islands, and Palau — federal funding flows, military use agreements, and migration rights.
- Military and geopolitics: US military base developments on Guam and Tinian; strategic competition in the Pacific; China-Pacific diplomatic relations.
- Economic development: Federal grants and Compact funding utilisation; tourism (Palau's conservation-focused tourism model); fisheries (FSM EEZ management); infrastructure development.
- CNMI economy: Tourism from Japan and South Korea; casino sector (Imperial Pacific); garment industry legacy; labour and immigration policy.
- Palau environmental economics: UNESCO World Heritage marine protected area management; green fee tourism policy; coral reef conservation and climate adaptation.
- FSM and Marshall Islands: Subsistence fishing economy; migration to US; climate vulnerability (Marshall Islands faces complete inundation risk); PITI-VITI governance.

MICRONESIA ECONOMIC CONTEXT: FSM, Marshall Islands, and Palau are among the world's most aid-dependent economies. US Compact grants represent 40–70% of government revenue in these nations. These economies use the USD and have no independent monetary policy.

RELEVANCE TO ERDI: Essential for tracking economic and political developments in Micronesian ADB member states (FSM, Marshall Islands, Palau, Nauru) which receive limited coverage from other Pacific media.`,
  },
  {
    id: 'saipan-tribune',
    type: 'News', typeBg: '#FDB915', coverBg: '#2a1d00',
    title: 'Saipan Tribune',
    subtitle: 'CNMI & Marianas Business Journal — Northern Mariana Islands',
    date: 'Daily', series: 'Saipan Tribune / Marianas Business Journal',
    abstract: 'Primary news and business publication for the Commonwealth of the Northern Mariana Islands (CNMI), covering local politics, business, tourism, and regional economic developments.',
    url: 'https://www.saipantribune.com/', pages: 0,
    keyContent: `SOURCE: Saipan Tribune / Marianas Business Journal — https://www.saipantribune.com/

The Saipan Tribune is the CNMI's primary daily newspaper and serves as the principal outlet for business and economic reporting in the Northern Mariana Islands, including coverage previously published under the Marianas Business Journal brand.

KEY COVERAGE AREAS:
- CNMI economy: Tourism sector recovery (visitor arrivals from Japan, South Korea, China, Russia); casino sector developments; federal COVID-19 relief fund utilisation; labour market conditions.
- Business and investment: CNMI investment incentives; garment industry legacy (post-WTO quota expiration); small business developments; construction and real estate.
- US federal relations: CNMI relationship with US federal government; Congressional developments affecting CNMI; immigration and labour waivers; military land use issues.
- Fiscal and budget: CNMI government budget, tax revenues, pension fund conditions (CNMI pension system has faced significant underfunding), and public debt.
- Regional Pacific business: Selected coverage of Guam business, Palau tourism, and Western Pacific COMPACT economies.

CNMI ECONOMIC CONTEXT: CNMI uses the USD and is a US territory with full US federal programme access. Tourism is the primary private sector driver (pre-pandemic: ~600,000 visitors/year, mostly from Asia). The economy has not fully recovered from the combined impacts of Typhoon Yutu (2018) and COVID-19 border closures (2020–2023). CNMI GDP estimated at approximately USD 900 million (2024).

RELEVANCE TO ERDI: The Saipan Tribune/Marianas Business Journal is the key source for economic developments in CNMI, a US Pacific territory whose economy has significant linkages to Asian tourism markets and US federal fiscal policy.`,
  },
  {
    id: 'png-post-courier',
    type: 'News', typeBg: '#E9532B', coverBg: '#2a0800',
    title: 'PNG Post-Courier',
    subtitle: 'Papua New Guinea\'s Leading Daily Newspaper',
    date: 'Daily', series: 'Post-Courier',
    abstract: 'Papua New Guinea\'s largest circulation daily newspaper, founded in 1969. Primary source for PNG business, economic, political, and mining sector news.',
    url: 'https://postcourier.com.pg/', pages: 0,
    keyContent: `SOURCE: PNG Post-Courier — https://postcourier.com.pg/

The Post-Courier is Papua New Guinea's largest circulation daily newspaper, first published in 1969 (the year before PNG independence). It is the primary English-language source for PNG business, political, and economic news.

KEY COVERAGE AREAS:
- PNG economy and budget: Annual national budget coverage, mid-year economic updates, Treasury Department announcements, Bank of Papua New Guinea monetary policy decisions (Kina Facility Rate), and currency (PGK) movement.
- Extractive industries: LNG sector (ExxonMobil PNG LNG project, Papua LNG development), gold and copper mining (Lihir Gold, Ok Tedi, Porgera resumption, Wafi-Golpu), and oil production. PNG's extractive sector generates approximately 70% of export earnings.
- Agriculture and commodities: Cocoa, coffee, palm oil, and copra price and production reporting — important for rural smallholder livelihoods.
- Political economy: Parliamentary developments, government budget and fiscal policy, corruption investigations, SOE privatisation debates, and ADB/World Bank project approvals.
- Business and corporate: PNG banking sector (BSP Financial Group, Kina Bank, ANZ PNG), PNG Stock Exchange (PNGX) listings, and private sector investment.
- Infrastructure: Highlands Highway (PNG's critical transport artery), port development (Port Moresby, Lae), and telecommunications (Digicel, Telikom PNG).

PNG ECONOMIC CONTEXT: PNG is the largest economy in the Pacific (GDP ~USD 28.6 billion, 2024). Despite significant resource wealth, poverty remains high (36.9% at USD 2.15/day). The kina has faced sustained depreciation pressure against the USD due to FX shortages. The Bank of PNG (BPNG) maintains the Kina Facility Rate at 3.0% (2025).

RELEVANCE TO ERDI: PNG's economy dominates Pacific subregional aggregates. Post-Courier is essential for tracking PNG-specific developments that significantly affect Pacific-wide economic indicators.`,
  },
  {
    id: 'png-the-national',
    type: 'News', typeBg: '#007DB7', coverBg: '#001a30',
    title: 'The National (PNG)',
    subtitle: 'Papua New Guinea\'s National Newspaper',
    date: 'Daily', series: 'The National',
    abstract: 'Papua New Guinea\'s second major daily newspaper. Known for business analysis, government policy coverage, and investigative reporting on PNG\'s political economy.',
    url: 'https://www.thenational.com.pg/', pages: 0,
    keyContent: `SOURCE: The National (Papua New Guinea) — https://www.thenational.com.pg/

The National is Papua New Guinea's second major daily broadsheet newspaper. While the Post-Courier has higher circulation, The National is widely regarded for stronger business analysis and more in-depth policy reporting.

KEY COVERAGE AREAS:
- PNG fiscal and economic policy: Budget analysis, Treasury and Finance Department policy announcements, IMF Article IV consultation outcomes, ADB and World Bank programme developments.
- Mining and petroleum: Detailed coverage of Ok Tedi, Lihir, Porgera, and new project developments; PNG LNG production updates; resource revenue management (Sovereign Wealth Fund debates).
- Bank of Papua New Guinea: Monetary policy decisions, foreign exchange (FX) shortage reporting, kina exchange rate developments, and banking system supervision.
- PNG government and parliament: Political economy reporting on fiscal policy, SOE reform, and public sector management.
- Business and investment: Private sector investment climate, PNG Chamber of Commerce & Industry developments, SME policy, and foreign investment approvals.
- Agricultural sector: Coffee, cocoa, copra, palm oil — smallholder and plantation sector economics, commodity prices, and export performance.

DISTINCTIVE COVERAGE: The National publishes a regular "Business Monday" supplement with in-depth PNG economic analysis, and provides detailed coverage of the PNG Stock Exchange (PNGX) and financial sector developments that are not always covered by the Post-Courier.

PNG BANKING SECTOR: BSP Financial Group (PNG's largest bank, also operating in 10 Pacific countries), Kina Bank, ANZ PNG, and Westpac PNG. Combined banking assets approximately PGK 45 billion (2024). Non-performing loan ratio approximately 5.2%.

RELEVANCE TO ERDI: Complements Post-Courier coverage with more analytical business and economic reporting; valuable for tracking PNG policy debates that affect the broader Pacific economic outlook.`,
  },
  {
    id: 'fbc-news',
    type: 'News', typeBg: '#8DC63F', coverBg: '#0d2a14',
    title: 'FBC News',
    subtitle: 'Fiji Broadcasting Corporation — Fiji & Pacific News',
    date: 'Daily', series: 'Fiji Broadcasting Corporation',
    abstract: 'Fiji\'s national broadcaster covering Fiji business, politics, and Pacific regional news. Primary broadcast source for Reserve Bank of Fiji monetary policy and government economic announcements.',
    url: 'https://www.fbcnews.com.fj/', pages: 0,
    keyContent: `SOURCE: FBC News (Fiji Broadcasting Corporation) — https://www.fbcnews.com.fj/

Fiji Broadcasting Corporation (FBC) is Fiji's national public broadcaster, operating radio and television services in English, iTaukei (Fijian), and Hindi. FBC News is its online news platform, covering Fiji and the broader Pacific.

KEY COVERAGE AREAS:
- Fiji economy: Reserve Bank of Fiji (RBF) Overnight Policy Rate (OPR) decisions, credit growth data, foreign reserves, remittance inflows, and banking sector news. The RBF holds its OPR at 0.25% (2025) in support of economic recovery.
- Government budget and fiscal policy: Annual Fiji national budget (typically presented in June), Ministry of Economy fiscal updates, public debt management, and tax policy changes.
- Tourism: Visitor arrival statistics (Tourism Fiji monthly data), hotel occupancy, airline capacity, and cruise ship arrivals. Fiji's tourism sector recovered to exceed pre-pandemic levels by 2025.
- Sugar and agriculture: Fiji Sugar Corporation (FSC) performance, cane production, and sugar price developments — sugar remains a major rural livelihood sector employing ~200,000 people directly and indirectly.
- Inflation and cost of living: Consumer Price Index (CPI) releases from Fiji Bureau of Statistics, food price tracking, and utility costs (FEA electricity tariffs).
- Pacific regional news: Regional diplomacy (Pacific Islands Forum, MSG), neighbour country economic developments, and climate policy.

FIJI ECONOMIC CONTEXT: Fiji is the Pacific's most economically diverse nation (GDP ~USD 5.1 billion, 2024). Key sectors: tourism (27% of GDP), sugar, gold mining (Vatukoula), garments, and financial services. Fiji is the regional financial hub, hosting the Reserve Bank of Fiji, BSP Fiji, ANZ Fiji, Westpac Fiji, and HFC Bank.

KEY FBC PROGRAMMES: FBC Business Report (daily); Saturday Business Edition; RBF Press Conference coverage; Budget Night special broadcast.

RELEVANCE TO ERDI: FBC News is the most reliable source for real-time Fiji economic data releases (CPI, visitor arrivals, RBF decisions) and Pacific Islands Forum diplomatic developments that affect regional economic cooperation.`,
  },
]

type DotEntry   = { cx: number; cy: number; lat: number; lng: number; color: string; label: string; name: string; value: string; detail: string; status: string; flag?: string; code?: string }


// Map dots positioned on equirectangular projection (130–195E, 0–25S → 560×210px)
const BASE_DOTS: Record<string, { cx: number; cy: number; lat: number; lng: number; label: string; name: string }> = {
  PNG: { cx: 132, cy: 55,  lat:  -6.3, lng: 143.9, label: 'PNG',        name: 'Papua New Guinea' },
  SOL: { cx: 235, cy: 72,  lat:  -8.9, lng: 160.2, label: 'SOLOMON IS.', name: 'Solomon Islands'  },
  VAN: { cx: 291, cy: 138, lat: -15.4, lng: 166.9, label: 'VANUATU',    name: 'Vanuatu'           },
  FIJ: { cx: 368, cy: 148, lat: -17.7, lng: 178.0, label: 'FIJI',        name: 'Fiji'              },
  TON: { cx: 424, cy: 165, lat: -21.2, lng: 184.8, label: 'TONGA',       name: 'Tonga'             },
  SAM: { cx: 444, cy: 114, lat: -13.8, lng: 187.9, label: 'SAMOA',       name: 'Samoa'             },
}

// ── realistic Pacific SVG map ──────────────────────────────────────────────
function PacificMap({ dots }: { dots: DotEntry[] }) {
  const [hoveredDot, setHoveredDot] = useState<DotEntry | null>(null)
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const land = '#163050', stroke = '#2a5070'

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', lineHeight: 0 }}>
      <svg
        viewBox="0 0 560 210" width="100%" height="210"
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredDot(null)}
      >
        {/* Ocean gradient */}
        <defs>
          <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#071828"/>
            <stop offset="100%" stopColor="#091e30"/>
          </linearGradient>
          <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.4"/>
          </filter>
        </defs>
        <rect width="560" height="210" fill="url(#oceanGrad)"/>

        {/* Graticule */}
        {[135,140,145,150,155,160,165,170,175,180,185,190].map(lon => (
          <line key={lon} x1={(lon-130)/65*560} y1={0} x2={(lon-130)/65*560} y2={210} stroke="#0e2438" strokeWidth={0.6}/>
        ))}
        {[5,10,15,20].map(lat => (
          <line key={lat} x1={0} y1={lat/25*210} x2={560} y2={lat/25*210} stroke="#0e2438" strokeWidth={0.6}/>
        ))}

        {/* Land — Papua New Guinea */}
        <path d="M 95,26 L 118,20 L 140,19 L 158,24 L 168,32 L 176,46 L 173,62 L 163,78 L 148,90 L 130,86 L 112,76 L 100,66 L 90,52 Z"
          fill={land} stroke={stroke} strokeWidth={1} filter="url(#landShadow)"/>
        {/* New Britain */}
        <path d="M 160,38 L 200,44 L 196,55 L 158,50 Z" fill={land} stroke={stroke} strokeWidth={0.8}/>
        {/* New Ireland */}
        <ellipse cx="195" cy="32" rx="4" ry="15" fill={land} stroke={stroke} strokeWidth={0.7} transform="rotate(-15,195,32)"/>
        {/* Manus */}
        <ellipse cx="138" cy="18" rx="5" ry="3" fill={land} stroke={stroke} strokeWidth={0.6}/>
        {/* Bougainville */}
        <ellipse cx="213" cy="50" rx="5" ry="10" fill={land} stroke={stroke} strokeWidth={0.7} transform="rotate(-20,213,50)"/>

        {/* Solomon Islands */}
        {([[216,62,9,4,-25],[228,68,9,4,-25],[241,76,12,5,-20],[251,73,9,3,-20],[257,84,7,3,-20],[274,80,5,2,-20]] as [number,number,number,number,number][]).map(([cx,cy,rx,ry,r], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={land} stroke={stroke} strokeWidth={0.7} transform={`rotate(${r},${cx},${cy})`}/>
        ))}

        {/* Vanuatu */}
        {([[286,118,4,9],[289,132,4,7],[292,143,3,6],[294,153,3,5],[295,162,3,4]] as [number,number,number,number][]).map(([cx,cy,rx,ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={land} stroke={stroke} strokeWidth={0.7}/>
        ))}

        {/* New Caledonia */}
        <ellipse cx="271" cy="178" rx="22" ry="5" fill={land} stroke={stroke} strokeWidth={0.7} transform="rotate(-10,271,178)"/>

        {/* Fiji — Viti Levu + Vanua Levu */}
        <ellipse cx="368" cy="148" rx="12" ry="8" fill={land} stroke={stroke} strokeWidth={0.8}/>
        <ellipse cx="380" cy="134" rx="10" ry="5" fill={land} stroke={stroke} strokeWidth={0.7} transform="rotate(-15,380,134)"/>
        <ellipse cx="390" cy="148" rx="4" ry="3" fill={land} stroke={stroke} strokeWidth={0.6}/>

        {/* Tonga */}
        {([[430,148,3,5],[427,160,3,4],[424,170,5,3]] as [number,number,number,number][]).map(([cx,cy,rx,ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={land} stroke={stroke} strokeWidth={0.6}/>
        ))}

        {/* Samoa + American Samoa */}
        <ellipse cx="440" cy="113" rx="8" ry="4" fill={land} stroke={stroke} strokeWidth={0.7}/>
        <ellipse cx="452" cy="109" rx="9" ry="4" fill={land} stroke={stroke} strokeWidth={0.7}/>
        <ellipse cx="463" cy="116" rx="4" ry="2" fill={land} stroke={stroke} strokeWidth={0.5}/>

        {/* Niue */}
        <circle cx="462" cy="152" r="2" fill={land} stroke={stroke} strokeWidth={0.5}/>

        {/* Kiribati — scattered atolls */}
        {([[490,60,3,2],[503,58,2,2],[516,55,2,1],[530,52,2,1]] as [number,number,number,number][]).map(([cx,cy,rx,ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={land} stroke={stroke} strokeWidth={0.5}/>
        ))}

        {/* Radiating alert dots */}
        {dots.map((d, i) => (
          <g
            key={d.label}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredDot(d)}
            onMouseLeave={() => setHoveredDot(null)}
          >
            {/* Outer pulse ring 1 */}
            <circle cx={d.cx} cy={d.cy} r={5} fill={d.color} fillOpacity={0}>
              <animate attributeName="r" values="5;20;5" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite"/>
              <animate attributeName="fill-opacity" values="0.35;0;0.35" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite"/>
            </circle>
            {/* Outer pulse ring 2 — offset for depth */}
            <circle cx={d.cx} cy={d.cy} r={5} fill={d.color} fillOpacity={0}>
              <animate attributeName="r" values="5;14;5" dur="2.4s" begin={`${i * 0.4 + 0.8}s`} repeatCount="indefinite"/>
              <animate attributeName="fill-opacity" values="0.25;0;0.25" dur="2.4s" begin={`${i * 0.4 + 0.8}s`} repeatCount="indefinite"/>
            </circle>
            {/* Halo ring (static, on hover highlight) */}
            <circle cx={d.cx} cy={d.cy} r={8}
              fill={hoveredDot?.label === d.label ? d.color : 'none'}
              fillOpacity={hoveredDot?.label === d.label ? 0.18 : 0}
              stroke={hoveredDot?.label === d.label ? d.color : 'none'}
              strokeWidth={1} strokeOpacity={0.5}
            />
            {/* Core dot */}
            <circle cx={d.cx} cy={d.cy} r={hoveredDot?.label === d.label ? 5 : 3.5} fill={d.color}
              stroke='var(--th-card)' strokeWidth={1.5}
            />
            {/* Label text */}
            <text x={d.cx} y={d.cy + 18} textAnchor="middle" fontSize={7}
              fill={hoveredDot?.label === d.label ? d.color : '#5a8ab0'}
              fontFamily='"Helvetica Neue",Arial,sans-serif' letterSpacing="0.05em" fontWeight={hoveredDot?.label === d.label ? '600' : '400'}>
              {d.label}
            </text>
          </g>
        ))}

        {/* Lon labels */}
        {[140,150,160,170,180,190].map(lon => (
          <text key={lon} x={(lon-130)/65*560} y={206} textAnchor="middle" fontSize={7}
            fill="#1e3f5c" fontFamily='"Helvetica Neue",Arial,sans-serif'>{lon}°E</text>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredDot && (
        <div style={{
          position: 'absolute',
          left: Math.min(mousePos.x + 14, 380),
          top: Math.max(mousePos.y - 70, 4),
          pointerEvents: 'none', zIndex: 20,
          background: 'var(--th-card)',
          border: `1px solid ${hoveredDot.color}55`,
          borderLeft: `3px solid ${hoveredDot.color}`,
          borderRadius: 5, padding: '8px 12px',
          minWidth: 160, maxWidth: 220,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--th-text)' }}>{hoveredDot.name}</span>
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
              background: `${hoveredDot.color}22`, color: hoveredDot.color,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>{hoveredDot.status}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: hoveredDot.color, marginBottom: 3 }}>{hoveredDot.value}</div>
          <div style={{ fontSize: 10, color: 'var(--th-muted)', lineHeight: 1.5 }}>{hoveredDot.detail}</div>
        </div>
      )}
    </div>
  )
}

// ── publications view ──────────────────────────────────────────────────────
function PublicationsView() {
  const isMobile = useIsMobile()
  const [selected, setSelected] = useState<Publication | null>(null)
  const [pubChat, setPubChat] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
  const [pubInput, setPubInput] = useState('')
  const [pubLoading, setPubLoading] = useState(false)
  const pubChatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    pubChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pubChat])

  async function askPub(q: string) {
    if (!selected || !q.trim()) return
    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    setPubLoading(true)
    setPubInput('')
    setPubChat(h => [
      ...h,
      { id: uid, role: 'user', content: q },
      { id: aid, role: 'assistant', content: '' },
    ])
    try {
      const prompt = `You are an ADB economist answering questions about a specific publication. Answer ONLY based on the document content provided below. Do not use generic explanations or information from outside this document. If the specific detail is not in the content provided, say so explicitly rather than improvising.\n\nPUBLICATION: "${selected.title}" (${selected.subtitle}, ${selected.date}) — ${selected.type} published by ADB.\n\n--- DOCUMENT CONTENT ---\n${selected.keyContent}\n--- END DOCUMENT CONTENT ---\n\nAnswer the following question using specific data, figures, and findings from the document above. Be direct and cite exact numbers where available.\n\nQuestion: ${q}`
      const res = await fetch('/api/erdi/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
      })
      let accumulated = ''
      if (res.headers.get('content-type')?.includes('text/plain')) {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setPubChat(h => h.map(m => m.id === aid ? { ...m, content: accumulated } : m))
        }
      } else {
        const data = await res.json()
        accumulated = data.answer ?? ''
        setPubChat(h => h.map(m => m.id === aid ? { ...m, content: accumulated } : m))
      }
    } catch {
      setPubChat(h => h.map(m => m.id === aid ? { ...m, content: 'Sorry, could not reach the AI service.' } : m))
    } finally {
      setPubLoading(false)
    }
  }

  const coverStyle = (pub: Publication): React.CSSProperties => ({
    background: pub.coverBg, height: 140, borderRadius: '4px 4px 0 0',
    position: 'relative', display: 'flex', flexDirection: 'column',
    justifyContent: 'flex-end', padding: 12, overflow: 'hidden',
  })

  if (selected) {
    return (
      <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', minHeight: 500 }}>
        {/* Left: publication detail */}
        <div style={{
          flex: '0 0 340px', display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--th-border)', overflowY: 'auto',
        }}>
          {/* Back + header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--th-border)', flexShrink: 0 }}>
            <button
              onClick={() => { setSelected(null); setPubChat([]) }}
              style={{
                background: 'none', border: 'none', color: adb.blue, fontSize: 12,
                cursor: 'pointer', padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >← All Publications</button>
            {/* Cover */}
            <div style={{ ...coverStyle(selected), borderRadius: 6, marginBottom: 12 }}>
              <div style={{
                position: 'absolute', top: 0, right: 0, width: 70, height: 70,
                background: `${selected.typeBg}1a`, transform: 'translate(18px,-18px) rotate(45deg)',
              }}/>
              <div style={{
                position: 'absolute', top: 10, right: 10, background: '#002569',
                borderRadius: 3, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.06em',
              }}>ADB</div>
              <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: `${selected.typeBg}cc`, marginBottom: 4 }}>
                {selected.series}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: '#fff' }}>{selected.title}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: selected.typeBg, background: `${selected.typeBg}18`, padding: '2px 7px', borderRadius: 2,
              }}>{selected.type}</span>
              <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>{selected.date}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--th-text)', marginBottom: 4 }}>{selected.subtitle}</div>
            <div style={{ fontSize: 11, color: 'var(--th-muted)', lineHeight: 1.6 }}>{selected.abstract}</div>
            {selected.pages && (
              <div style={{ fontSize: 10, color: 'var(--th-muted)', marginTop: 8 }}>{selected.pages} pages</div>
            )}
            <a
              href={selected.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12,
                padding: '7px 14px', background: adb.blue, borderRadius: 5,
                color: '#fff', fontSize: 11, fontWeight: 600, textDecoration: 'none',
              }}
            >Open full PDF ↗</a>
          </div>
          {/* Suggested questions */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Ask about this publication
            </div>
            {[
              `What are the key findings of ${selected.title}?`,
              `What policy recommendations does it make?`,
              `How does this relate to Pacific economies?`,
              `What methodology was used?`,
            ].map(q => (
              <button key={q} onClick={() => askPub(q)} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                marginBottom: 6, background: 'var(--th-chart)', border: '1px solid var(--th-border)',
                borderRadius: 5, fontSize: 10.5, color: 'var(--th-text)', cursor: 'pointer',
                lineHeight: 1.4,
              }}>{q}</button>
            ))}
          </div>
        </div>

        {/* Right: AI chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Chat header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--th-border)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px',
              borderRadius: 3, textTransform: 'uppercase', background: `${adb.blue}20`, color: adb.blue,
            }}>Intelligence Hub</span>
            <span style={{ fontSize: 12, color: 'var(--th-muted)' }}>Ask anything about this publication</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {pubChat.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--th-muted)', fontSize: 12, marginTop: 40 }}>
                Use the suggested questions on the left, or type your own below.
              </div>
            )}
            {pubChat.map(m => (
              <div key={m.id} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}>
                <div style={{
                  maxWidth: '85%', padding: '9px 13px', borderRadius: 10,
                  background: m.role === 'user' ? adb.blue : 'var(--th-card)',
                  color: m.role === 'user' ? '#fff' : 'var(--th-text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--th-border)',
                  fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {m.content || (m.role === 'assistant' && pubLoading ? (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: adb.blue, display: 'inline-block', animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
                      ))}
                    </span>
                  ) : m.content)}
                </div>
              </div>
            ))}
            <div ref={pubChatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--th-border)',
            display: 'flex', gap: 8, flexShrink: 0,
          }}>
            <input
              value={pubInput}
              onChange={e => setPubInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askPub(pubInput) } }}
              placeholder="Ask a question about this publication…"
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 7,
                border: '1px solid var(--th-border)', background: 'var(--th-chart)',
                color: 'var(--th-text)', fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={() => askPub(pubInput)}
              disabled={pubLoading || !pubInput.trim()}
              style={{
                padding: '9px 16px', background: adb.blue, border: 'none',
                borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: pubLoading || !pubInput.trim() ? 'default' : 'pointer',
                opacity: pubLoading || !pubInput.trim() ? 0.5 : 1,
              }}
            >Ask</button>
          </div>
        </div>
      </div>
    )
  }

  const adbPubs = PUBLICATIONS.filter(p => !['rnz-pacific','abc-pacific','islands-business','pacific-island-times','saipan-tribune','png-post-courier','png-the-national','fbc-news'].includes(p.id))
  const mediaPubs = PUBLICATIONS.filter(p => ['rnz-pacific','abc-pacific','islands-business','pacific-island-times','saipan-tribune','png-post-courier','png-the-national','fbc-news'].includes(p.id))

  const PubCard = ({ pub }: { pub: Publication }) => (
    <div
      key={pub.id}
      onClick={() => { setSelected(pub); setPubChat([]) }}
      style={{
        background: 'var(--th-card)', border: '1px solid var(--th-border)',
        borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = pub.typeBg
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--th-border)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div style={coverStyle(pub)}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 80, height: 80,
          background: `${pub.typeBg}1a`, transform: 'translate(20px,-20px) rotate(45deg)',
        }}/>
        <div style={{
          position: 'absolute', top: 10, right: 10, background: '#002569',
          borderRadius: 3, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.06em',
        }}>{mediaPubs.includes(pub) ? 'MEDIA' : 'ADB'}</div>
        <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: `${pub.typeBg}cc`, marginBottom: 5 }}>{pub.series}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: '#fff' }}>{pub.title}</div>
      </div>
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: pub.typeBg, background: `${pub.typeBg}18`, padding: '2px 7px', borderRadius: 2,
          }}>{pub.type}</span>
          <span style={{ fontSize: 9.5, color: 'var(--th-muted)' }}>{pub.date}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--th-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>{pub.subtitle}</div>
        <div style={{ fontSize: 10.5, color: 'var(--th-muted)', lineHeight: 1.65, flex: 1 }}>{pub.abstract}</div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--th-border)', paddingTop: 8, marginTop: 4,
        }}>
          {pub.pages ? <span style={{ fontSize: 9.5, color: 'var(--th-muted)' }}>{pub.pages} pages</span> : <span />}
          <span style={{ fontSize: 10.5, color: pub.typeBg }}>Open & Chat →</span>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '8px 0 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 500 }}>ADB Publications</h2>
        <div style={{ fontSize: 11, color: 'var(--th-muted)' }}>
          Click any publication to read and ask questions with AI
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {adbPubs.map(pub => <PubCard key={pub.id} pub={pub} />)}
      </div>

      <div style={{
        margin: '32px 0 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--th-border)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
          Pacific Media Sources
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--th-border)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {mediaPubs.map(pub => <PubCard key={pub.id} pub={pub} />)}
      </div>

      <div style={{ marginTop: 20, fontSize: 10.5, color: 'var(--th-muted)' }}>
        ADB publications at <span style={{ color: adb.blueLight }}>adb.org/publications</span>. Media sources link to their respective homepages.
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────
export default function ERDIPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [trackedInds, setTrackedInds]   = useState<IndKey[]>(['GDP_GROWTH', 'CPI', 'DEBT_GDP', 'REMITTANCES'])
  const [activeInd,   setActiveInd]     = useState<IndKey>('GDP_GROWTH')
  const [pickerOpen,  setPickerOpen]    = useState(false)
  const [activeNav, setActiveNav]     = useState('Home')
  const [homeSearch, setHomeSearch]     = useState('')
  const [pendingQuery, setPendingQuery] = useState('')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set())
  const [selectedCountry, setSelectedCountry] = useState<string>('PNG')
  const [reportTemplate, setReportTemplate] = useState<'brief' | 'monitor' | 'situation'>('brief')
  const [reportYearFrom, setReportYearFrom] = useState(2019)
  const [reportYearTo, setReportYearTo] = useState(2024)
  const [reportOutput, setReportOutput] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [briefPickerOpen, setBriefPickerOpen] = useState(false)
  const [briefingFilter, setBriefingFilter] = useState<string>('All')
  const [briefingPage, setBriefingPage] = useState(0)
  const [briefingMode, setBriefingMode] = useState(false)
  const [briefingContent, setBriefingContent] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingCountry, setBriefingCountry] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [improveInput, setImproveInput] = useState('')
  const [improveLoading, setImproveLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; ts: string }>>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [globalHistory, setGlobalHistory] = useState<Array<{ id: string; source: 'home' | 'explorer'; question: string; answer: string; ts: string }>>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarEndRef = useRef<HTMLDivElement>(null)
  const [mapFlyTarget, setMapFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | undefined>()
  const countryCarouselRef = useRef<HTMLDivElement>(null)
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const isMobile = useIsMobile()
  const th = isDark ? DARK : LIGHT


  // Auto-scroll chat to bottom when history updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (!sessionStorage.getItem('erdi_auth')) {
      router.replace('/erdi/login')
    } else {
      setAuthChecked(true)
    }
  }, [router])

  function logout() {
    sessionStorage.removeItem('erdi_auth')
    router.push('/erdi/login')
  }

  async function handleHomeSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = homeSearch.trim()
    if (!q) return

    // Briefing note → split-pane editor
    if (q.toLowerCase().includes('briefing note')) {
      const m = q.match(/for\s+(.+)$/i)
      const country = m ? m[1].trim() : 'Selected Country'
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const userMsgId = `u-${Date.now()}`
      const asstMsgId = `a-${Date.now()}`
      setBriefingCountry(country)
      setBriefingContent('')
      setEditorContent('')
      setBriefingLoading(true)
      setBriefingMode(true)
      setChatHistory([
        { id: userMsgId, role: 'user', content: q, ts: now },
        { id: asstMsgId, role: 'assistant', content: '', ts: now },
      ])
      const briefingPrompt = `You are an ADB economist writing a country economic briefing note for ${country}. Write in the style of a professional intelligence brief — narrative paragraphs with specific data, historical sequences, policy institution names, quantified targets, and concise analytical commentary. Do NOT use bullet points. Model your prose on the following example style (from a Sri Lanka brief):

EXAMPLE STYLE:
"Inflation remains well below the Central Bank of Sri Lanka (CBSL) target level of 5.0%. CBSL plans to review the inflation target this year, although it expects headline inflation to gradually converge to the 5% year-on-year (YOY) target by 2H 2026, faster than initially anticipated due to the Middle-East conflict impact on domestic prices. Inflation, as measured by Colombo Consumer Price Index (CCPI), eased from a peak of 70% YOY in September 2022 and an annual average of 46.4% in 2022, to 17.4% in 2023, 1.2% in 2024, and -0.5% in 2025. Easing monetary policy has driven a steady decline in market interest rates as inflation eased from its 2022 peak. CBSL cut policy rates by a cumulative 800 bps from June 2023 to November 2024."

Now write a full briefing note for ${country} using the four sections below. For each section, write 2–4 narrative paragraphs in the same style: name the central bank / ministry / statistical office, cite actual or best-available data with specific figures and dates, describe historical trends and turning points, explain policy actions taken and their rationale, and give a forward-looking analytical assessment. Contextualise everything to Pacific Island Small Island Developing States (SIDS) realities — tourism dependence, remittance flows, commodity import exposure, climate vulnerability, and ADB/IMF programme context where relevant.

---

OVERVIEW OF THE ECONOMY & CURRENT DEVELOPMENTS

Write 2–3 paragraphs covering:
• Real GDP growth rate for 2023, 2024, 2025 (actual or estimate) and the 2026 outlook; what drove the trajectory (tourism recovery, natural disasters, commodity prices, external demand).
• CPI inflation: peak level and year, subsequent disinflation path with specific YOY figures for 2022–2025, current level, and the central bank or government inflation target if one exists.
• GDP per capita (USD, most recent year) and trend relative to pre-pandemic level; living standards implications.
• The top 2–3 economic sectors (tourism/hospitality, subsistence agriculture, fishing, mining, remittances) and their approximate share of GDP or export earnings, with recent performance commentary.

---

MONETARY POLICY & FINANCIAL SECTOR

Write 2–3 paragraphs covering:
• The central bank (name it — e.g. Reserve Bank of Fiji, National Reserve Bank of Tonga, Bank of Papua New Guinea) and its current policy rate or reserve money target, and the stance (accommodative/neutral/tightening).
• Any rate changes in the past 18 months: magnitude in basis points, dates, and rationale. If no independent monetary policy (e.g. dollarised economies like Palau or Marshall Islands), explain the monetary framework.
• Private-sector credit growth trend (YOY %) and banking system health; any non-performing loan concerns or liquidity conditions.
• Money supply (M2 or M2b) growth and its relationship to inflation and nominal GDP.

---

FISCAL POLICY & PUBLIC DEBT

Write 2–3 paragraphs covering:
• Central government fiscal balance as % of GDP for 2022, 2023, 2024, and the 2025/2026 budget target. Key revenue drivers (tax, grants, resource royalties) and expenditure pressures (post-disaster reconstruction, public-sector wages, debt service).
• Public debt as % of GDP: trajectory from 2020 to present, composition (domestic vs external, bilateral vs multilateral), and any IMF/ADB debt sustainability assessment.
• Any ongoing IMF programme, ADB budget support, or fiscal consolidation plan; key conditionalities or reform milestones.

---

BALANCE OF PAYMENTS

Write 2–3 paragraphs covering:
• Current account balance as % of GDP for the most recent 2–3 years and its key drivers. Quantify tourism receipts, remittances (% of GDP), merchandise export earnings, and import bill (especially fuel and food).
• Foreign reserves in months of import cover: most recent figure, trend, and adequacy threshold (typically 3–4 months for Pacific SIDS).
• Exchange rate regime and any recent pressure or adjustments. Capital account openness and FDI inflows.

---

End with a short OUTLOOK paragraph (3–5 sentences) summarising the key risks (climate shocks, global interest rates, tourism volatility, debt rollover) and the baseline trajectory for 2026.

Write only the briefing note content. Use section headers in ALL CAPS. No preamble, no meta-commentary.`

      try {
        const res = await fetch('/api/erdi/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: briefingPrompt }),
        })
        if (!res.ok) throw new Error()
        const ct = res.headers.get('content-type') ?? ''
        if (ct.includes('text/plain') && res.body) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let acc = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            acc += decoder.decode(value, { stream: true })
            setBriefingContent(acc)
            setChatHistory(h => h.map(msg => msg.id === asstMsgId ? { ...msg, content: acc } : msg))
          }
          setEditorContent(acc)
        } else {
          const data = await res.json()
          const text = data.answer ?? ''
          setBriefingContent(text)
          setEditorContent(text)
          setChatHistory(h => h.map(msg => msg.id === asstMsgId ? { ...msg, content: text } : msg))
        }
      } catch {
        const err = 'Sorry, I could not generate the briefing note. Please try again.'
        setBriefingContent(err)
        setChatHistory(h => h.map(msg => msg.id === asstMsgId ? { ...msg, content: err } : msg))
      } finally {
        setBriefingLoading(false)
      }
      return
    }

    // Standard AI query
    setAiQuestion(q)
    setAiAnswer('')
    setAiLoading(true)
    try {
      const res = await fetch('/api/erdi/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error('Request failed')
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/plain') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setAiAnswer(accumulated)
        }
        setGlobalHistory(h => [...h, { id: `h-${Date.now()}`, source: 'home', question: q, answer: accumulated, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      } else {
        const data = await res.json()
        const ans = data.answer ?? ''
        setAiAnswer(ans)
        setGlobalHistory(h => [...h, { id: `h-${Date.now()}`, source: 'home', question: q, answer: ans, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      }
    } catch {
      setAiAnswer('Sorry, I could not reach the AI service. Try exploring the data directly in the Data Explorer.')
    } finally {
      setAiLoading(false)
    }
  }

  async function improveNote() {
    const instruction = improveInput.trim()
    if (!instruction || improveLoading) return
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsgId = `u-${Date.now()}`
    const asstMsgId = `a-${Date.now()}`
    setImproveLoading(true)
    setImproveInput('')
    setChatHistory(h => [
      ...h,
      { id: userMsgId, role: 'user', content: instruction, ts: now },
      { id: asstMsgId, role: 'assistant', content: '', ts: now },
    ])
    const prompt = `Here is a country economic briefing note:\n\n${editorContent}\n\nPlease revise it with the following instruction: ${instruction}`
    try {
      const res = await fetch('/api/erdi/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
      })
      if (!res.ok) throw new Error()
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('text/plain') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        setEditorContent('')
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          acc += decoder.decode(value, { stream: true })
          setEditorContent(acc)
          setChatHistory(h => h.map(msg => msg.id === asstMsgId ? { ...msg, content: acc } : msg))
        }
      } else {
        const data = await res.json()
        const text = data.answer ?? editorContent
        setEditorContent(text)
        setChatHistory(h => h.map(msg => msg.id === asstMsgId ? { ...msg, content: text } : msg))
      }
    } catch { /* keep existing content */ }
    finally { setImproveLoading(false) }
  }

  const allIndData = useMultiKidb(PACIFIC)

  function generateReport(forCountry?: string) {
    const country = forCountry ?? selectedCountry
    const ecoName = ECONOMIES[country] ?? country
    const gdpObs  = allIndData['GDP_GROWTH']?.obs  ?? []
    const cpiObs  = allIndData['CPI']?.obs          ?? []
    const debtObs = allIndData['DEBT_GDP']?.obs     ?? []
    const remObs  = allIndData['REMITTANCES']?.obs  ?? []
    const g  = latest(gdpObs,  country)
    const c  = latest(cpiObs,  country)
    const d  = latest(debtObs, country)
    const r  = latest(remObs,  country)
    const gdpReasons  = getPacificReasons('GDP_GROWTH',  country)
    const cpiReasons  = getPacificReasons('CPI',         country)
    const debtReasons = getPacificReasons('DEBT_GDP',    country)
    const remReasons  = getPacificReasons('REMITTANCES', country)
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })

    if (reportTemplate === 'brief') {
      setReportOutput(`ERDI COUNTRY ECONOMIC BRIEF — ${ecoName.toUpperCase()}
Period: ${reportYearFrom}–${reportYearTo}  |  ADB Pacific Department  |  ${dateStr}
${'─'.repeat(64)}

HEADLINE INDICATORS
  Real GDP Growth       ${g?.value?.toFixed(1) ?? '—'}%   (${g?.period ?? '—'})
  CPI Inflation         ${c?.value?.toFixed(1) ?? '—'}%   (${c?.period ?? '—'})
  Government Debt/GDP   ${d?.value?.toFixed(1) ?? '—'}%   (${d?.period ?? '—'})
  Remittances           USD ${r?.value != null ? r.value > 1000 ? `${(r.value/1000).toFixed(1)}bn` : `${r.value.toFixed(0)}mn` : '—'}  (${r?.period ?? '—'})

ASSESSMENT
Growth is classified as ${indicatorColor('GDP_GROWTH', g?.value ?? null).status.toUpperCase()}.
${g?.value != null && g.value >= 4 ? `${ecoName} is expanding above the Pacific 4% threshold.` : g?.value != null && g.value >= 0 ? `Growth is positive but below the regional 4% benchmark.` : `The economy is in contraction — urgent attention required.`}

KEY RISK FLAGS
${d?.value != null && d.value > 70 ? `  ● HIGH   Government debt ${d.value.toFixed(1)}% of GDP — fiscal sustainability concern.` : d?.value != null && d.value > 50 ? `  ● WATCH  Government debt ${d.value.toFixed(1)}% of GDP — monitor trajectory.` : `  ● LOW    Government debt within manageable range.`}
${c?.value != null && c.value > 6 ? `  ● HIGH   CPI inflation ${c.value.toFixed(1)}% — eroding household purchasing power.` : c?.value != null && c.value > 3 ? `  ● WATCH  CPI inflation ${c.value.toFixed(1)}% — elevated but not critical.` : `  ● LOW    CPI inflation within the 0–3% stable band.`}

SOURCE: ADB Data (KIDB SDMX API) · Generated via ERDI Intelligence Hub`)
    } else if (reportTemplate === 'monitor') {
      setReportOutput(`PACIFIC ECONOMIC MONITOR ENTRY — ${ecoName.toUpperCase()}
${reportYearFrom}–${reportYearTo}  |  ADB Pacific Department  |  ${dateStr}
${'─'.repeat(64)}

GROWTH
${ecoName} recorded real GDP growth of ${g?.value?.toFixed(1) ?? '—'}% in ${g?.period ?? 'the latest period'}.
${gdpReasons[0] ?? ''} ${gdpReasons[1] ?? ''}

PRICES
Consumer price inflation reached ${c?.value?.toFixed(1) ?? '—'}% in ${c?.period ?? 'the latest period'}.
${cpiReasons[0] ?? ''} ${cpiReasons[1] ?? ''}

FISCAL POSITION
Government debt stood at ${d?.value?.toFixed(1) ?? '—'}% of GDP in ${d?.period ?? 'the latest period'}.
${debtReasons[0] ?? ''} ${debtReasons[1] ?? ''}

EXTERNAL SECTOR — REMITTANCES
Inflows reached USD ${r?.value != null ? r.value > 1000 ? `${(r.value/1000).toFixed(1)}bn` : `${r.value.toFixed(0)}mn` : '—'} in ${r?.period ?? 'the latest period'}.
${remReasons[0] ?? ''} ${remReasons[1] ?? ''}

OUTLOOK
Near-term assessment: ${indicatorColor('GDP_GROWTH', g?.value ?? null).status}. Key risks include commodity
price volatility, climate-related shocks, and demand shifts in remittance corridors.

SOURCE: ADB Data (KIDB) · Pacific Economic Monitor · ${dateStr}`)
    } else {
      setReportOutput(`ADB COUNTRY SITUATION REPORT — ${ecoName.toUpperCase()}
Period: ${reportYearFrom}–${reportYearTo}  |  INTERNAL USE  |  ${dateStr}
${'─'.repeat(64)}

1. MACROECONOMIC OVERVIEW
${ecoName} recorded real GDP growth of ${g?.value?.toFixed(1) ?? '—'}% in ${g?.period ?? 'the latest period'},
${g?.value != null && g.value >= 4 ? 'above' : 'below'} the Pacific DMC average threshold of ~4.0%.

   KEY GROWTH DRIVERS
${gdpReasons.map((r, i) => `   [${i+1}] ${r}`).join('\n') || '   No specific driver data available.'}

2. PRICES & MONETARY CONDITIONS
CPI inflation: ${c?.value?.toFixed(1) ?? '—'}%  (${c?.period ?? '—'})  ·  ${indicatorColor('CPI', c?.value ?? null).status}

   INFLATION DRIVERS
${cpiReasons.map((r, i) => `   [${i+1}] ${r}`).join('\n') || '   No specific CPI data available.'}

3. FISCAL POSITION & DEBT SUSTAINABILITY
Government debt/GDP: ${d?.value?.toFixed(1) ?? '—'}%  (${d?.period ?? '—'})  ·  ${indicatorColor('DEBT_GDP', d?.value ?? null).status}

   FISCAL DYNAMICS
${debtReasons.map((r, i) => `   [${i+1}] ${r}`).join('\n') || '   No specific debt data available.'}

4. EXTERNAL SECTOR
Remittances: USD ${r?.value != null ? r.value > 1000 ? `${(r.value/1000).toFixed(1)}bn` : `${r.value.toFixed(0)}mn` : '—'}  (${r?.period ?? '—'})

   REMITTANCE DYNAMICS
${remReasons.map((r, i) => `   [${i+1}] ${r}`).join('\n') || '   No specific remittance data available.'}

5. RISK ASSESSMENT & ADB ENGAGEMENT
Downside risks: global demand slowdown, commodity price volatility,
climate shocks, deterioration in remittance source markets.
ADB active portfolio: under review. For enquiries contact Pacific Department.

SOURCE: ADB Data (KIDB SDMX API) · ERDI Intelligence Hub · ${dateStr}
This report is for internal ADB use only and does not constitute official ADB forecasts.`)
    }
  }

  if (!authChecked) return null

  return (
    <div style={{
      '--th-bg': th.bg, '--th-card': th.card, '--th-border': th.border,
      '--th-text': th.text, '--th-muted': th.muted, '--th-subtle': th.subtle,
      '--th-input': th.inputBg, '--th-chart': th.chartBg, '--th-nav': th.navBg,
      background: th.bg, color: th.text,
      fontFamily: adb.font, minHeight: '100vh',
    } as React.CSSProperties}>

      {/* ── Top brand bar ── */}
      <div style={{
        background: adb.blue, height: 3, width: '100%',
      }} />

      {/* ── Nav ── */}
      <nav style={{
        background: isDark ? 'linear-gradient(180deg, #0f2845 0%, #0d2137 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f4f9ff 100%)',
        borderBottom: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
        boxShadow: isDark ? '0 2px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,125,183,0.08)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Main nav row */}
        <div style={{ padding: `0 ${isMobile ? '16px' : '24px'}`, display: 'flex', alignItems: 'center', height: 52 }}>
          {/* ADB Logo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginRight: isMobile ? 12 : 24, paddingRight: isMobile ? 12 : 24,
            borderRight: '1px solid var(--th-border)', flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/adb-logo.svg" alt="Asian Development Bank" style={{ height: isMobile ? 28 : 36, width: 'auto', display: 'block' }} />
          </div>

          {/* Product name */}
          <div style={{ display: 'flex', flexDirection: 'column', marginRight: isMobile ? 0 : 28, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.02em', color: 'var(--th-text)' }}>
              {isMobile ? 'ERDI Hub' : 'ERDI Intelligence Hub'}
            </span>
            {!isMobile && (
              <span style={{ fontSize: 9.5, color: 'var(--th-muted)', fontWeight: 300, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Economic Research &amp; Development Impact</span>
            )}
          </div>

          {/* Nav links — desktop only */}
          {!isMobile && (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
              {['Home', 'Data Explorer', 'Publications'].map(item => (
                <button key={item} onClick={() => setActiveNav(item)} style={{
                  padding: '0 14px', height: 52, fontSize: 12,
                  fontWeight: activeNav === item ? 500 : 400,
                  color: activeNav === item ? 'var(--th-text)' : 'var(--th-muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeNav === item ? `2px solid ${adb.blue}` : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                }}>{item}</button>
              ))}
            </div>
          )}

          {/* Mobile spacer */}
          {isMobile && <div style={{ flex: 1 }} />}

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: 'none', border: '1px solid var(--th-border)',
                borderRadius: 4, color: 'var(--th-muted)', cursor: 'pointer',
                width: 30, height: 30, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{isDark ? '☀' : '☾'}</button>
            {!isMobile && <button style={{ background: 'none', border: 'none', color: 'var(--th-muted)', cursor: 'pointer', fontSize: 15 }}>🔔</button>}
            {!isMobile && <div style={{ width: 1, height: 20, background: 'var(--th-border)' }} />}
            <button
              onClick={logout}
              title="Sign out"
              style={{
                background: 'none', border: '1px solid var(--th-border)',
                borderRadius: 4, color: 'var(--th-muted)', cursor: 'pointer',
                padding: '0 10px', height: 30, fontSize: 11, fontWeight: 500,
                fontFamily: adb.font, display: 'flex', alignItems: 'center', gap: 5,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#E9532B'; (e.currentTarget as HTMLElement).style.borderColor = '#E9532B55' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--th-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--th-border)' }}
            >
              <span style={{ fontSize: 12 }}>↩</span>{!isMobile && ' Sign out'}
            </button>
          </div>
        </div>

        {/* Mobile nav links row */}
        {isMobile && (
          <div style={{
            display: 'flex', borderTop: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
            overflowX: 'auto', scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
          }}>
            {(['Home', 'Data Explorer', 'Publications'] as const).map(item => (
              <button key={item} onClick={() => setActiveNav(item)} style={{
                padding: '0 14px', height: 38, fontSize: 12, flexShrink: 0,
                fontWeight: activeNav === item ? 500 : 400,
                color: activeNav === item ? 'var(--th-text)' : 'var(--th-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeNav === item ? `2px solid ${adb.blue}` : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s',
              }}>{item}</button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Content area: sidebar + main ── */}
      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Global Conversation Sidebar ── */}
        {!briefingMode && (activeNav === 'Home' || activeNav === 'Data Explorer') && (
          <aside style={{
            width: sidebarCollapsed ? 40 : 260,
            flexShrink: 0,
            background: isDark ? '#071829' : '#f0f6fc',
            borderRight: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 52px)',
            position: 'sticky',
            top: 52,
            transition: 'width 0.2s',
            overflow: 'hidden',
          }}>
            {/* Sidebar header */}
            <div style={{
              height: 44, display: 'flex', alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              padding: sidebarCollapsed ? '0' : '0 12px',
              borderBottom: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
              flexShrink: 0,
            }}>
              {!sidebarCollapsed && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  History
                </span>
              )}
              <button
                onClick={() => setSidebarCollapsed(c => !c)}
                title={sidebarCollapsed ? 'Expand history' : 'Collapse history'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--th-muted)', fontSize: 14, padding: 4,
                  display: 'flex', alignItems: 'center',
                }}
              >{sidebarCollapsed ? '›' : '‹'}</button>
            </div>

            {/* Conversation list */}
            {!sidebarCollapsed && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {globalHistory.length === 0 ? (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--th-muted)', fontSize: 11 }}>
                    Questions you ask will appear here
                  </div>
                ) : (
                  [...globalHistory].reverse().map(item => (
                    <div key={item.id} style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${isDark ? '#1e406030' : '#c0d4e820'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                          padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase',
                          background: `${adb.blue}20`,
                          color: adb.blue,
                        }}>Intelligence Hub</span>
                        <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>{item.ts}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--th-text)', marginBottom: 3, lineHeight: 1.4 }}>
                        {item.question.length > 80 ? item.question.slice(0, 80) + '…' : item.question}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--th-muted)', lineHeight: 1.4 }}>
                        {item.answer.length > 120 ? item.answer.slice(0, 120) + '…' : item.answer}
                      </div>
                    </div>
                  ))
                )}
                <div ref={sidebarEndRef} />
              </div>
            )}
          </aside>
        )}

      {/* ── Main ── */}
      <main style={{
        flex: 1,
        maxWidth: briefingMode ? '100%' : (!briefingMode && (activeNav === 'Home' || activeNav === 'Data Explorer') && !sidebarCollapsed) ? 'calc(900px)' : 900,
        margin: '0 auto',
        padding: briefingMode ? '0' : '24px 20px',
        minWidth: 0,
      }}>

        {/* Data Explorer view */}
        {activeNav === 'Data Explorer' && <DataExplorer initialQuery={pendingQuery} onConversation={(q, a) => setGlobalHistory(h => [...h, { id: `h-${Date.now()}`, source: 'explorer', question: q, answer: a, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])} />}
        {activeNav === 'Publications' && <PublicationsView />}
        {activeNav !== 'Home' && activeNav !== 'Data Explorer' && activeNav !== 'Publications' && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: adb.muted, fontSize: 13 }}>
            {activeNav} — coming soon
          </div>
        )}
        {/* ── Briefing Note Editor (fixed full-screen overlay) ── */}
        {briefingMode && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: isDark ? '#071829' : '#f0f6fc',
            display: 'flex', flexDirection: 'column',
            fontFamily: adb.font,
          }}>
            {/* ── Top bar ── */}
            <div style={{
              height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '0 20px',
              background: isDark ? '#0d2137' : '#ffffff',
              borderBottom: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
              boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={() => { setBriefingMode(false); setHomeSearch(''); setChatHistory([]) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                    background: 'var(--th-chart)', border: '1px solid var(--th-border)',
                    borderRadius: 6, color: 'var(--th-muted)', fontSize: 12, cursor: 'pointer',
                  }}
                >← Back</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: adb.blue, background: `${adb.blue}18`, padding: '2px 10px', borderRadius: 3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    ✦ Country Briefing Note
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--th-text)' }}>{briefingCountry}</span>
                  {(briefingLoading || improveLoading) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: adb.blue }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: adb.blue, display: 'inline-block', animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
                      ))}
                      {briefingLoading ? 'Generating' : 'Improving'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(editorContent)}
                  style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--th-border)', borderRadius: 5, color: 'var(--th-muted)', fontSize: 11, cursor: 'pointer' }}
                >Copy</button>
                <button
                  onClick={() => {
                    const blob = new Blob([editorContent], { type: 'text/plain' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                    a.download = `Briefing-Note-${briefingCountry.replace(/\s+/g, '-')}.txt`; a.click()
                  }}
                  style={{ padding: '6px 14px', background: adb.blue, border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                >Download</button>
              </div>
            </div>

            {/* ── Body: left panel + right editor ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* LEFT — Conversation panel */}
              <div style={{
                width: 300, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderRight: `1px solid ${isDark ? '#1e4060' : '#c0d4e8'}`,
                background: isDark ? '#0a1e30' : '#ffffff',
              }}>
                {/* Panel label */}
                <div style={{
                  padding: '11px 16px', flexShrink: 0,
                  borderBottom: `1px solid ${isDark ? '#1e4060' : '#e0eaf4'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: adb.blue }}>
                    Conversation
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>
                    {chatHistory.filter(m => m.role === 'user').length} message{chatHistory.filter(m => m.role === 'user').length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Messages — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chatHistory.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--th-muted)', textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
                      Your conversation will<br />appear here
                    </div>
                  )}
                  {chatHistory.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ fontSize: 9, color: 'var(--th-muted)', letterSpacing: '0.04em', paddingLeft: msg.role === 'assistant' ? 2 : 0, paddingRight: msg.role === 'user' ? 2 : 0 }}>
                        {msg.role === 'user' ? 'You' : '✦ ERDI AI'} · {msg.ts}
                      </div>
                      <div style={{
                        maxWidth: '90%', padding: '9px 13px',
                        borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: msg.role === 'user' ? `${adb.blue}28` : (isDark ? '#0f2840' : '#f0f6fc'),
                        border: `1px solid ${msg.role === 'user' ? `${adb.blue}55` : (isDark ? '#1e4060' : '#d0e4f4')}`,
                        fontSize: 12, lineHeight: 1.55,
                        color: msg.role === 'user' ? (isDark ? '#68C5EA' : adb.blue) : 'var(--th-subtle)',
                      }}>
                        {msg.role === 'user'
                          ? msg.content
                          : msg.content
                            ? msg.content.slice(0, 140) + (msg.content.length > 140 ? '…' : '')
                            : (
                              <span style={{ display: 'flex', gap: 5, alignItems: 'center', color: 'var(--th-muted)' }}>
                                <span style={{ fontSize: 11 }}>Generating</span>
                                {[0,1,2].map(i => (
                                  <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: adb.blue, display: 'inline-block', animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
                                ))}
                              </span>
                            )
                        }
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Input — pinned to bottom */}
                <div style={{
                  flexShrink: 0, padding: '12px',
                  borderTop: `1px solid ${isDark ? '#1e4060' : '#e0eaf4'}`,
                  background: isDark ? '#0d2137' : '#f8fbff',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: isDark ? '#071829' : '#ffffff',
                    border: `1.5px solid ${improveInput.trim() ? adb.blue : (isDark ? '#1e4060' : '#c0d4e8')}`,
                    borderRadius: 8, padding: '8px 10px',
                    transition: 'border-color 0.15s',
                    boxShadow: improveInput.trim() ? `0 0 0 3px ${adb.blue}18` : 'none',
                  }}>
                    <span style={{ fontSize: 13, color: adb.blue, flexShrink: 0 }}>✦</span>
                    <input
                      value={improveInput}
                      onChange={e => setImproveInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) improveNote() }}
                      placeholder="Ask to improve…"
                      disabled={improveLoading || briefingLoading}
                      style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: 'var(--th-text)', fontSize: 12, fontFamily: adb.font,
                        minWidth: 0,
                      }}
                    />
                    <button
                      onClick={improveNote}
                      disabled={improveLoading || briefingLoading || !improveInput.trim()}
                      style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700,
                        cursor: improveInput.trim() && !improveLoading ? 'pointer' : 'default',
                        background: improveInput.trim() && !improveLoading ? adb.blue : 'transparent',
                        color: improveInput.trim() && !improveLoading ? '#fff' : 'var(--th-muted)',
                        border: 'none', flexShrink: 0, transition: 'all 0.15s',
                      }}
                    >{improveLoading ? '…' : '↵'}</button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--th-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    Try: "Add a risks section" · "Make more concise" · "Add policy recommendations"
                  </div>
                </div>
              </div>

              {/* RIGHT — Editable draft */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{
                  height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 20px',
                  borderBottom: `1px solid ${isDark ? '#1e4060' : '#e0eaf4'}`,
                  background: isDark ? '#071829' : '#f8fbff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: adb.green }}>✎ Edit Draft</span>
                    {(briefingLoading || improveLoading) && (
                      <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>{briefingLoading ? 'Generating…' : 'Improving…'}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>Editable — changes are yours</span>
                </div>
                <textarea
                  value={editorContent}
                  onChange={e => setEditorContent(e.target.value)}
                  placeholder={briefingLoading ? 'Generating briefing note…' : 'Your editable draft will appear here'}
                  disabled={briefingLoading || improveLoading}
                  style={{
                    flex: 1, width: '100%', boxSizing: 'border-box',
                    background: 'transparent', border: 'none', outline: 'none',
                    padding: '24px 32px', color: 'var(--th-text)', fontSize: 13,
                    lineHeight: 1.9, resize: 'none', fontFamily: adb.font,
                    opacity: improveLoading ? 0.5 : 1, transition: 'opacity 0.2s',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeNav === 'Home' && !briefingMode && (<>

        {/* Hero */}
        <div style={{
          marginBottom: 24, padding: '20px 24px 22px',
          background: isDark
            ? 'linear-gradient(135deg, #0e2845 0%, #0a1f35 60%, #071829 100%)'
            : 'linear-gradient(135deg, #e4f0fa 0%, #eef5fb 60%, #f4f9ff 100%)',
          borderRadius: 10, borderLeft: `4px solid ${isDark ? '#007DB7' : '#007DB7'}`,
          boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.35)' : '0 2px 16px rgba(0,125,183,0.1)',
        }}>
          <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 300, margin: 0, lineHeight: 1.2, color: 'var(--th-text)' }}>Good morning, Cara.</h1>
          <div style={{ fontSize: 12, color: 'var(--th-muted)', fontWeight: 300, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#8DC63F' }} />
            Associate Economics Officer · Pacific Department
          </div>
        </div>

        {/* AI Search */}
        <div style={{ marginBottom: 24 }}>
          <form onSubmit={handleHomeSearch}>
            <div style={{
              display: 'flex', alignItems: 'stretch', gap: 0,
              background: 'var(--th-input)',
              border: `1px solid ${aiAnswer || aiLoading ? adb.blue : isDark ? '#1e4060' : '#b0c8de'}`,
              borderRadius: 8, overflow: 'hidden', transition: 'all 0.2s',
              boxShadow: aiAnswer || aiLoading
                ? '0 0 0 3px rgba(0,125,183,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                : isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 14px rgba(0,125,183,0.1)',
            }}>
              <span style={{ padding: '0 16px', display: 'flex', alignItems: 'center', color: adb.blue, fontSize: 18, flexShrink: 0 }}>✦</span>
              <input
                value={homeSearch}
                onChange={e => setHomeSearch(e.target.value)}
                placeholder="Ask a question or search for data, indicators, or publications…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--th-text)', fontSize: 13, fontFamily: adb.font,
                  padding: '14px 0',
                }}
              />
              <button
                type="submit"
                disabled={aiLoading}
                style={{
                  padding: `0 ${isMobile ? '14px' : '24px'}`, background: homeSearch.trim() ? adb.blue : 'var(--th-border)',
                  border: 'none', color: homeSearch.trim() ? adb.white : 'var(--th-muted)',
                  fontSize: 13, fontWeight: 600, cursor: homeSearch.trim() ? 'pointer' : 'default',
                  flexShrink: 0, transition: 'background 0.2s, color 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 15 }}>⌕</span>
                {aiLoading ? 'Thinking…' : 'Search'}
              </button>
            </div>
          </form>

          {/* Suggested tags row + briefing pill — pill anchored outside scroll area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {/* Scrollable suggested prompts */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'] }}>
              <span style={{ fontSize: 11, color: 'var(--th-muted)', flexShrink: 0 }}>Suggested:</span>
              {([
                { label: 'GDP growth · Pacific SIDS',     query: 'GDP growth for Pacific SIDS' },
                { label: 'Fiji inflation',                 query: 'Fiji inflation trends' },
                { label: 'Remittances · Tonga & Samoa',   query: 'Remittance flows for Tonga and Samoa' },
                { label: 'Pacific debt levels',            query: 'Debt levels across Pacific islands' },
              ]).map(({ label, query }) => (
                <button key={label} onClick={() => { setPendingQuery(query); setActiveNav('Data Explorer') }} style={{
                  fontSize: 11, color: 'var(--th-muted)', padding: '3px 10px', borderRadius: 12, flexShrink: 0,
                  border: '1px solid #1e3f5c', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{label}</button>
              ))}
            </div>
            {/* Country Briefing Note — outside scroll, always fully visible */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setBriefPickerOpen(o => !o)}
                style={{
                  fontSize: 11, color: adb.green, padding: '4px 12px', borderRadius: 12, whiteSpace: 'nowrap',
                  border: `1px solid ${adb.green}55`, background: briefPickerOpen ? `${adb.green}1a` : `${adb.green}0f`,
                  cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
                }}
              >✦ Country Briefing Note ▾</button>

              {briefPickerOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                  background: 'var(--th-card)', border: '1px solid var(--th-border)',
                  borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                  padding: '8px', minWidth: 210,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--th-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6, padding: '0 4px' }}>
                    Select country
                  </div>
                  {PACIFIC.map(code => (
                    <button
                      key={code}
                      onClick={() => {
                        setSelectedCountry(code)
                        setBriefPickerOpen(false)
                        setHomeSearch(`Country economic briefing note for ${ECONOMIES[code] ?? code}`)
                      }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 10px', background: 'none', border: 'none', borderRadius: 5,
                        cursor: 'pointer', textAlign: 'left', fontFamily: adb.font,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-chart)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <img src={flagUrl(code, 40)} alt="" style={{ width: 22, height: 15, objectFit: 'cover', borderRadius: 2, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                      <span style={{ fontSize: 12, color: 'var(--th-text)' }}>{ECONOMIES[code] ?? code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>


          {/* AI answer card */}
          {(aiLoading || aiAnswer) && (
            <div style={{
              marginTop: 12, background: 'var(--th-card)', border: `1px solid ${adb.blue}44`,
              borderRadius: 6, overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderBottom: '1px solid var(--th-border)',
                background: `${adb.blue}0d`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: adb.blue }}>✦</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--th-muted)', letterSpacing: '0.05em' }}>
                    ERDI AI · {aiQuestion}
                  </span>
                </div>
                <button
                  onClick={() => { setAiAnswer(''); setAiQuestion('') }}
                  style={{ fontSize: 13, color: 'var(--th-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                >✕</button>
              </div>
              {/* Answer body */}
              <div style={{ padding: '14px 16px' }}>
                {aiLoading && !aiAnswer
                  ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--th-muted)' }}>Thinking</span>
                      {[0,1,2].map(i => (
                        <span key={i} style={{
                          width: 4, height: 4, borderRadius: '50%', background: adb.blue, display: 'inline-block',
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  : <div style={{ fontSize: 13, color: 'var(--th-subtle)', lineHeight: 1.75 }}>
                      {aiAnswer.split('\n').map((line, i) => (
                        <span key={i}>{line}{i < aiAnswer.split('\n').length - 1 && <br />}</span>
                      ))}
                    </div>
                }
              </div>
              {/* Footer actions */}
              {aiAnswer && (
                <div style={{
                  display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap',
                  borderTop: '1px solid var(--th-border)', background: 'var(--th-chart)',
                }}>
                  <button
                    onClick={() => { setPendingQuery(aiQuestion); setActiveNav('Data Explorer') }}
                    style={{
                      fontSize: 11, color: adb.blueLight, background: `${adb.blue}18`,
                      border: `1px solid ${adb.blue}44`, borderRadius: 4,
                      padding: '4px 12px', cursor: 'pointer', fontWeight: 500,
                    }}
                  >Explore data in Data Explorer →</button>
                  <button
                    onClick={() => { setAiAnswer(''); setAiQuestion(''); setHomeSearch('') }}
                    style={{
                      fontSize: 11, color: 'var(--th-muted)', background: 'none',
                      border: '1px solid var(--th-border)', borderRadius: 4,
                      padding: '4px 12px', cursor: 'pointer',
                    }}
                  >Clear</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pacific Portfolio Map + Tracked Indicators ── */}
        <section style={{ marginBottom: 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 14, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #007DB7 0%, #00A5D2 100%)' }} />
                Pacific Portfolio Map
              </h2>
                {allIndData[activeInd]?.source && <SourceBadge source={allIndData[activeInd].source} />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 2 }}>
                ADB Data · ADO indicators · Click a country to explore · Hover for details
              </div>
            </div>
            {/* + Track Indicator button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPickerOpen(p => !p)}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '6px 12px',
                  background: adb.blue + '22', color: adb.blue,
                  border: `1px solid ${adb.blue}55`, borderRadius: 4, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ fontSize: 14 }}>+</span> Track Indicator
              </button>

              {/* Indicator picker dropdown */}
              {pickerOpen && (
                <div
                  onMouseLeave={() => setPickerOpen(false)}
                  style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 1000,
                    background: 'var(--th-card)', border: '1px solid var(--th-border)',
                    borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                    minWidth: isMobile ? 220 : 280, maxWidth: isMobile ? 'calc(100vw - 32px)' : undefined, maxHeight: 340, overflowY: 'auto',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--th-border)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--th-muted)', textTransform: 'uppercase' }}>
                    ADB Data · ADO Indicators
                  </div>
                  {(Object.entries(INDICATORS) as [IndKey, typeof INDICATORS[IndKey]][]).map(([key, ind]) => {
                    const isTracked = trackedInds.includes(key)
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (isTracked) {
                            if (trackedInds.length > 1) {
                              setTrackedInds(prev => prev.filter(k => k !== key))
                              if (activeInd === key) setActiveInd(trackedInds.find(k => k !== key) ?? trackedInds[0])
                            }
                          } else {
                            setTrackedInds(prev => [...prev, key])
                            setActiveInd(key)
                          }
                          setPickerOpen(false)
                        }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 14px',
                          background: isTracked ? `${adb.blue}11` : 'none',
                          border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid var(--th-border)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, color: isTracked ? adb.blue : 'var(--th-text)', fontWeight: isTracked ? 500 : 400 }}>{ind.label}</div>
                          <div style={{ fontSize: 9.5, color: 'var(--th-muted)', marginTop: 1, fontFamily: 'monospace' }}>{ind.flow} · {ind.unit}</div>
                        </div>
                        <span style={{ fontSize: 11, color: isTracked ? adb.blue : 'var(--th-muted)', flexShrink: 0 }}>
                          {isTracked ? '✓ Tracking' : '+ Add'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tracked indicator filter tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {trackedInds.map(key => {
              const active = activeInd === key
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button
                    onClick={() => setActiveInd(key)}
                    style={{
                      fontSize: 11, fontWeight: active ? 600 : 400, padding: '5px 10px',
                      background: active ? 'linear-gradient(135deg, #007DB7 0%, #00A5D2 100%)' : 'var(--th-card)',
                      color: active ? '#fff' : 'var(--th-muted)',
                      border: `1px solid ${active ? '#007DB7' : 'var(--th-border)'}`,
                      boxShadow: active ? '0 2px 10px rgba(0,125,183,0.4)' : 'none',
                      borderRadius: trackedInds.length > 1 ? '4px 0 0 4px' : 4,
                      cursor: 'pointer', transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {IND_SHORT[key]}
                  </button>
                  {trackedInds.length > 1 && (
                    <button
                      onClick={() => {
                        setTrackedInds(prev => prev.filter(k => k !== key))
                        if (activeInd === key) setActiveInd(trackedInds.find(k => k !== key) ?? trackedInds[0])
                      }}
                      title={`Remove ${IND_SHORT[key]}`}
                      style={{
                        fontSize: 10, padding: '5px 6px',
                        background: active ? '#0071a8' : 'var(--th-border)',
                        color: active ? '#fff' : 'var(--th-muted)',
                        borderTop: `1px solid ${active ? adb.blue : 'var(--th-border)'}`,
                        borderRight: `1px solid ${active ? adb.blue : 'var(--th-border)'}`,
                        borderBottom: `1px solid ${active ? adb.blue : 'var(--th-border)'}`,
                        borderLeft: 'none',
                        borderRadius: '0 4px 4px 0',
                        cursor: 'pointer', lineHeight: 1,
                      }}
                    >×</button>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => setPickerOpen(p => !p)}
              style={{
                fontSize: 11, padding: '5px 10px',
                background: 'none', color: 'var(--th-muted)',
                border: '1px dashed var(--th-border)',
                borderRadius: 4, cursor: 'pointer',
              }}
            >+ Add</button>
          </div>

          {/* Map card */}
          <div style={{
            background: 'var(--th-card)',
            border: isDark ? '1px solid #1e4060' : '1px solid #b8cfdf',
            borderRadius: 8,
            boxShadow: isDark ? '0 4px 32px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,125,183,0.08)',
          }}>
            {/* Horizontal country carousel — above map */}
            <div style={{
              borderBottom: isDark ? '1px solid #1e4060' : '1px solid #b8cfdf',
              padding: '12px 14px 14px', position: 'relative',
              background: isDark
                ? 'linear-gradient(180deg, #0e2845 0%, #0d2137 100%)'
                : 'linear-gradient(180deg, #f0f7ff 0%, #e8f2fb 100%)',
            }}>
              {/* Carousel header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--th-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {INDICATORS[activeInd].label}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--th-muted)', marginTop: 2 }}>
                    {INDICATORS[activeInd].unit}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!isMobile && <span style={{ fontSize: 9, color: 'var(--th-muted)' }}>Click a card to focus on map</span>}
                  <button
                    onClick={() => countryCarouselRef.current?.scrollBy({ left: -510, behavior: 'smooth' })}
                    style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--th-border)', background: 'var(--th-card)', color: 'var(--th-text)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >‹</button>
                  <button
                    onClick={() => countryCarouselRef.current?.scrollBy({ left: 510, behavior: 'smooth' })}
                    style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--th-border)', background: 'var(--th-card)', color: 'var(--th-text)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >›</button>
                </div>
              </div>

              {/* Scrollable card strip — sorted high risk → low risk */}
              <div
                ref={countryCarouselRef}
                style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start', scrollBehavior: 'smooth', paddingBottom: 4, scrollbarWidth: 'none' }}
              >
                {(() => {
                  const riskRank: Record<string, number> = { [adb.red]: 0, [adb.amber]: 1, [adb.teal]: 2, [adb.green]: 3, [adb.muted]: 4 }
                  const obs = allIndData[activeInd]?.obs ?? []
                  return [...PACIFIC].sort((a, b) => {
                    const ra = riskRank[indicatorColor(activeInd, latest(obs, a)?.value ?? null).color] ?? 5
                    const rb = riskRank[indicatorColor(activeInd, latest(obs, b)?.value ?? null).color] ?? 5
                    return ra - rb
                  })
                })().map(code => {
                  const obs = allIndData[activeInd]?.obs ?? []
                  const o = latest(obs, code)
                  const val = o?.value ?? null
                  const { color, status } = indicatorColor(activeInd, val)
                  const reasonKey = `${activeInd}:${code}`
                  const isExpanded = expandedReasons.has(reasonKey)
                  return (
                    <div key={code} style={{
                      minWidth: 155, maxWidth: 155, flexShrink: 0,
                      borderRadius: 6, overflow: 'hidden',
                      border: `1px solid ${isExpanded ? color + '55' : 'var(--th-border)'}`,
                      background: 'var(--th-chart)', transition: 'border-color 0.2s',
                    }}>
                      {/* Click area: fly to country */}
                      <div
                        style={{ padding: '10px 10px 8px', cursor: 'pointer' }}
                        onClick={() => {
                          const dot = BASE_DOTS[code]
                          if (dot) setMapFlyTarget({ lat: dot.lat, lng: dot.lng, zoom: 7 })
                          setSelectedCountry(code)
                          setReportOutput('')
                          setExpandedReasons(new Set([`${activeInd}:${code}`]))
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          {FLAG_ISO[code] && (
                            <img src={flagUrl(code, 20)} alt={ECONOMIES[code]} style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--th-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ECONOMIES[code]}
                          </span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1, marginBottom: 5 }}>
                          {formatIndValue(activeInd, val, INDICATORS[activeInd])}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${color}22`, color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{status}</span>
                          <span style={{ fontSize: 9, color: 'var(--th-muted)' }}>{o?.period ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: 8, fontSize: 9, color: 'var(--th-muted)' }}>
                Source: ADB Data · adb.org · ADO 2026
              </div>
            </div>

            {/* Expanded Why? panel — in normal flow, pushes map down */}
            {(() => {
              const expandedCode = PACIFIC.find(code => expandedReasons.has(`${activeInd}:${code}`))
              if (!expandedCode) return null
              const obs = allIndData[activeInd]?.obs ?? []
              const val = latest(obs, expandedCode)?.value ?? null
              const { color } = indicatorColor(activeInd, val)
              const reasons = getPacificReasons(activeInd, expandedCode)
              const exploreQuery = `${INDICATORS[activeInd].label} for ${ECONOMIES[expandedCode]} since 2019`
              return (
                <div style={{
                  background: 'var(--th-card)', borderTop: `2px solid ${color}`,
                  borderBottom: `1px solid ${color}33`,
                  padding: '12px 16px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--th-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {FLAG_ISO[expandedCode] && <img src={flagUrl(expandedCode, 20)} alt="" style={{ width: 20, height: 15, objectFit: 'cover', borderRadius: 2 }} />}
                      {ECONOMIES[expandedCode]} — Why has this changed?
                    </span>
                    <button
                      onClick={() => setExpandedReasons(new Set())}
                      style={{ fontSize: 16, color: 'var(--th-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                    >×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px 24px' }}>
                    {reasons.map((r, ri) => (
                      <div key={ri} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color, fontSize: 11, flexShrink: 0, marginTop: 1 }}>›</span>
                        <span style={{ fontSize: 10, color: 'var(--th-muted)', lineHeight: 1.6 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingQuery(exploreQuery); setActiveNav('Data Explorer') }}
                    style={{
                      marginTop: 10, fontSize: 10, color: adb.blueLight,
                      background: `${adb.blue}18`, border: `1px solid ${adb.blue}44`,
                      borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontWeight: 500,
                    }}
                  >Explore in Data Explorer →</button>
                </div>
              )
            })()}

            {/* Map — full width */}
            <PacificMapLeaflet
              dots={buildIndicatorDots(activeInd, allIndData[activeInd]?.obs ?? [])}
              isDark={isDark}
              flyTarget={mapFlyTarget}
            />

            {/* Legend — shows threshold explanation for the active indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--th-border)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {(IND_THRESHOLDS[activeInd] ?? [
                  { color: adb.red,   label: 'Alert',    range: '' },
                  { color: adb.amber, label: 'Moderate', range: '' },
                  { color: adb.green, label: 'Stable',   range: '' },
                ]).map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 10, color: 'var(--th-text)', fontWeight: 500 }}>{l.label}</span>
                    {l.range && <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>({l.range})</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Portfolio brief ↗', 'Compare economies ↗'].map(btn => (
                  <button key={btn} style={{
                    fontSize: 11, color: 'var(--th-text)', background: 'var(--th-border)',
                    border: 'none', borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
                  }}>{btn}</button>
                ))}
              </div>
            </div>

          </div>
        </section>



        {/* ── Briefing ── */}
        <section style={{ paddingBottom: 40 }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #FDB915 0%, #E9532B 100%)' }} />
                Economic Intelligence Briefing
              </h2>
              <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 2 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · Curated economic intelligence
              </div>
            </div>
            {/* Category filter pills */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['All', 'Policy', 'Analysis', 'Markets'].map(f => {
                const isActive = briefingFilter === f
                const filterColor = f === 'Policy' ? adb.teal : f === 'Analysis' ? adb.amber : f === 'Markets' ? adb.green : adb.blue
                return (
                  <button key={f} onClick={() => { setBriefingFilter(f); setBriefingPage(0) }} style={{
                    fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: '0.05em',
                    padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                    background: isActive ? `${filterColor}22` : 'none',
                    border: `1px solid ${isActive ? filterColor : 'var(--th-border)'}`,
                    color: isActive ? filterColor : 'var(--th-muted)',
                    transition: 'all 0.15s',
                  }}>{f}</button>
                )
              })}
            </div>
          </div>

          {/* Carousel */}
          {(() => {
            const filtered = briefingFilter === 'All'
              ? ARTICLES
              : ARTICLES.filter(a => a.type.toLowerCase() === briefingFilter.toLowerCase())
            const perPage = isMobile ? 1 : 3
            const totalPages = Math.ceil(filtered.length / perPage)
            const page = Math.min(briefingPage, Math.max(0, totalPages - 1))
            const visible = filtered.slice(page * perPage, page * perPage + perPage)
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, alignItems: 'stretch' }}>
                  {visible.map(article => (
                    <div
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      style={{
                        background: 'var(--th-card)',
                        borderTop: isDark ? '1px solid #1a3550' : '1px solid #c8d8e8',
                        borderRight: isDark ? '1px solid #1a3550' : '1px solid #c8d8e8',
                        borderBottom: isDark ? '1px solid #1a3550' : '1px solid #c8d8e8',
                        borderLeft: `3px solid ${article.typeBg}`,
                        borderRadius: 6,
                        padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                        cursor: 'pointer', transition: 'all 0.15s', height: '100%', boxSizing: 'border-box',
                        boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.2)' : '0 1px 8px rgba(0,0,0,0.06)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = article.typeBg)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--th-border)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: article.typeBg, textTransform: 'uppercase', background: `${article.typeBg}18`, border: `1px solid ${article.typeBg}44`, borderRadius: 20, padding: '2px 10px' }}>{article.type}</span>
                        <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>{article.date}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--th-text)', lineHeight: 1.4 }}>{article.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--th-muted)', lineHeight: 1.6, flex: 1 }}>{article.body}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {article.sources.map(s => (
                            <span key={s} style={{ fontSize: 9, color: adb.blueLight, padding: '2px 6px', border: '1px solid var(--th-border)', borderRadius: 3 }}>{s}</span>
                          ))}
                        </div>
                        <span style={{ fontSize: 11, color: article.typeBg, flexShrink: 0 }}>Read more →</span>
                      </div>
                    </div>
                  ))}
                  {/* Placeholder cards to keep 3-column grid stable — desktop only */}
                  {!isMobile && visible.length < 3 && Array.from({ length: 3 - visible.length }).map((_, i) => (
                    <div key={`ph-${i}`} style={{ background: 'var(--th-card)', border: '1px dashed var(--th-border)', borderRadius: 6, opacity: 0.25, minHeight: 140 }} />
                  ))}
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 }}>
                    <button
                      onClick={() => setBriefingPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--th-border)',
                        background: page === 0 ? 'none' : 'var(--th-card)', cursor: page === 0 ? 'default' : 'pointer',
                        color: page === 0 ? 'var(--th-muted)' : 'var(--th-text)', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >‹</button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button key={i} onClick={() => setBriefingPage(i)} style={{
                        width: 7, height: 7, borderRadius: '50%', border: 'none',
                        background: i === page ? adb.blue : 'var(--th-border)',
                        cursor: 'pointer', padding: 0, transition: 'background 0.15s',
                      }} />
                    ))}
                    <button
                      onClick={() => setBriefingPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page === totalPages - 1}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--th-border)',
                        background: page === totalPages - 1 ? 'none' : 'var(--th-card)',
                        cursor: page === totalPages - 1 ? 'default' : 'pointer',
                        color: page === totalPages - 1 ? 'var(--th-muted)' : 'var(--th-text)', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >›</button>
                  </div>
                )}
              </>
            )
          })()}
        </section>
        </>)}

        {/* ── Article detail modal ── */}
        {selectedArticle && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(7,18,30,0.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: isMobile ? '10px' : '20px',
            }}
            onClick={() => setSelectedArticle(null)}
          >
            <div
              style={{
                background: 'var(--th-card)',
                border: '1px solid var(--th-border)',
                borderTop: `3px solid ${selectedArticle.typeBg}`,
                borderRadius: 8,
                maxWidth: 680, width: '100%', maxHeight: '90vh',
                overflowY: 'auto',
                padding: isMobile ? '16px' : '28px 32px',
                display: 'flex', flexDirection: 'column', gap: 16,
                fontFamily: adb.font,
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: selectedArticle.typeBg, background: `${selectedArticle.typeBg}18`,
                    padding: '2px 8px', borderRadius: 3,
                  }}>{selectedArticle.type}</span>
                  <span style={{ fontSize: 11, color: adb.muted }}>{selectedArticle.date}</span>
                </div>
                <button
                  onClick={() => setSelectedArticle(null)}
                  style={{ background: 'none', border: 'none', color: adb.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                >✕</button>
              </div>

              {/* Title */}
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: 'var(--th-text)', lineHeight: 1.35 }}>
                {selectedArticle.title}
              </h2>

              {/* Full body paragraphs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedArticle.fullBody.map((para, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13.5, color: 'var(--th-subtle)', lineHeight: 1.8, fontWeight: 300 }}>
                    {para}
                  </p>
                ))}
              </div>

              {/* Why has this changed */}
              {selectedArticle.reasons.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderTop: '1px solid var(--th-border)', paddingTop: 16,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: selectedArticle.typeBg, background: `${selectedArticle.typeBg}18`,
                      padding: '2px 8px', borderRadius: 3,
                    }}>Why has this changed?</span>
                  </div>
                  {selectedArticle.reasons.map((r, ri) => (
                    <div key={ri} style={{
                      background: 'var(--th-chart)', borderRadius: 6, padding: '14px 16px',
                      borderLeft: `3px solid ${selectedArticle.typeBg}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: selectedArticle.typeBg, marginBottom: 10, letterSpacing: '0.02em' }}>
                        {r.indicator}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {r.points.map((pt, pi) => (
                          <div key={pi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ color: selectedArticle.typeBg, fontSize: 12, flexShrink: 0, marginTop: 1 }}>›</span>
                            <span style={{ fontSize: 12.5, color: 'var(--th-subtle)', lineHeight: 1.7, fontWeight: 300 }}>{pt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Sources */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--th-border)', paddingTop: 14 }}>
                <span style={{ fontSize: 11, color: adb.muted, marginRight: 4 }}>Sources:</span>
                {selectedArticle.sources.map(s => (
                  <span key={s} style={{ fontSize: 10, color: adb.blueLight, padding: '2px 8px', border: '1px solid var(--th-border)', borderRadius: 3 }}>{s}</span>
                ))}
              </div>

              {/* Explore data CTA */}
              <div style={{
                background: 'var(--th-chart)', borderRadius: 6, padding: '14px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
                gap: 12, flexDirection: isMobile ? 'column' : 'row',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: adb.muted, marginBottom: 3 }}>Explore the underlying data in ERDI Data Explorer</div>
                  <div style={{ fontSize: 12, color: adb.blueLight, fontStyle: 'italic' }}>"{selectedArticle.query}"</div>
                </div>
                <button
                  onClick={() => {
                    setPendingQuery(selectedArticle.query)
                    setActiveNav('Data Explorer')
                    setSelectedArticle(null)
                  }}
                  style={{
                    padding: '9px 18px', background: adb.blue, border: 'none',
                    borderRadius: 4, color: adb.white, fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', flexShrink: 0, fontFamily: adb.font,
                  }}
                >Open in Data Explorer →</button>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>{/* end sidebar+main flex row */}
    </div>
  )
}
