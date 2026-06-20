'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ECONOMIES, INDICATORS } from '@/app/api/kidb/route'
import { DataExplorer } from './_data-explorer'

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
    }}>{source === 'live' ? 'KIDB Live' : 'KIDB Schema'}</span>
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
    sources: ['Asian Development Outlook 2026', 'KIDB — PPL Dataflow'],
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
  },
  {
    id: 'key-indicators-2025',
    type: 'Statistics', typeBg: '#8DC63F', coverBg: '#163a10',
    title: 'Key Indicators for Asia and the Pacific 2025',
    subtitle: '56th Edition — Statistical Compendium',
    date: 'August 2025', series: 'Key Indicators',
    abstract: 'Comprehensive economic, financial, social, and environmental statistics for 49 ADB member economies. Includes KIDB data underlying this platform.',
    url: 'https://www.adb.org/publications/key-indicators-asia-pacific', pages: 448,
  },
  {
    id: 'pacific-monitor-dec-2025',
    type: 'Regional Monitor', typeBg: '#00A5D2', coverBg: '#062030',
    title: 'Pacific Economic Monitor',
    subtitle: 'December 2025 Edition',
    date: 'December 2025', series: 'Pacific Economic Monitor',
    abstract: 'Bi-annual review of economic conditions across 14 Pacific developing member countries. Covers growth, inflation, fiscal positions, and ADB portfolio updates.',
    url: 'https://www.adb.org/publications/pacific-economic-monitor', pages: 52,
  },
  {
    id: 'climate-finance-pacific-2026',
    type: 'Technical Note', typeBg: '#8DC63F', coverBg: '#0d2a14',
    title: 'Climate Finance Mechanisms for Pacific SIDS',
    subtitle: 'Access, Barriers, and ADB Intervention Models',
    date: 'March 2026', series: 'ADB Sustainable Development Working Papers',
    abstract: 'Examines constrained access to global climate finance for small island states. Reviews Green Climate Fund utilisation and proposes a Pacific Climate Resilience Facility design.',
    url: 'https://www.adb.org/publications/series/sustainable-development-working-papers', pages: 68,
  },
  {
    id: 'debt-sustainability-pacific-2026',
    type: 'Working Paper', typeBg: '#FDB915', coverBg: '#2a1d00',
    title: 'Debt Sustainability in Pacific Island Countries',
    subtitle: 'Post-Pandemic Trajectories and Policy Options',
    date: 'February 2026', series: 'ADB Economics Working Papers',
    abstract: 'Analyses debt dynamics in Vanuatu, Tonga, Solomon Islands, Fiji, and Samoa following the COVID-19 pandemic and recent natural disasters. Includes DSA scenarios to 2030.',
    url: 'https://www.adb.org/publications/series/economics-working-papers', pages: 44,
  },
  {
    id: 'remittances-resilience-2025',
    type: 'Working Paper', typeBg: '#FDB915', coverBg: '#2a1d00',
    title: 'Remittances and Economic Resilience in the Pacific',
    subtitle: 'Evidence from Tonga, Samoa, and Fiji',
    date: 'October 2025', series: 'ADB Economics Working Papers',
    abstract: 'Quantifies the stabilising effect of remittance inflows on household consumption and government revenues. Finds a 1% remittance shock reduces poverty by 0.3% in Tonga.',
    url: 'https://www.adb.org/publications/series/economics-working-papers', pages: 38,
  },
  {
    id: 'adr-2025',
    type: 'Journal', typeBg: '#E9532B', coverBg: '#2a0e00',
    title: 'Asian Development Review',
    subtitle: 'Vol. 42, No. 2 — 2025',
    date: 'September 2025', series: 'Asian Development Review',
    abstract: 'Peer-reviewed journal of economics and development. Vol. 42 No. 2 features papers on Pacific labour mobility, climate adaptation financing, and Central Asia trade corridors.',
    url: 'https://www.adb.org/publications/asian-development-review', pages: 180,
  },
  {
    id: 'pacmon-jun-2025',
    type: 'Regional Monitor', typeBg: '#00A5D2', coverBg: '#062030',
    title: 'Pacific Economic Monitor',
    subtitle: 'July 2025 Edition',
    date: 'July 2025', series: 'Pacific Economic Monitor',
    abstract: 'Mid-year review covering tourism recovery in Fiji, reconstruction progress in Vanuatu post-cyclone, and remittance trends for Samoa and Tonga in H1 2025.',
    url: 'https://www.adb.org/publications/pacific-economic-monitor', pages: 48,
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(true)

  function scroll(dir: 'left' | 'right') {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'left' ? -296 : 296, behavior: 'smooth' })
  }

  function onScroll() {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanLeft(scrollLeft > 4)
    setCanRight(scrollLeft < scrollWidth - clientWidth - 4)
  }

  const coverStyle = (pub: Publication): React.CSSProperties => ({
    background: pub.coverBg,
    height: 168,
    borderRadius: '4px 4px 0 0',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: 14,
    overflow: 'hidden',
  })

  return (
    <div style={{ padding: '8px 0 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>ADB Publications</h2>
          <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 3 }}>
            Publicly available reports, monitors, and working papers — sourced from adb.org
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => scroll('left')} disabled={!canLeft}
            style={{
              width: 30, height: 30, borderRadius: 4, border: '1px solid var(--th-border)',
              background: canLeft ? 'var(--th-card)' : 'transparent',
              color: canLeft ? 'var(--th-text)' : 'var(--th-muted)',
              cursor: canLeft ? 'pointer' : 'default', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
          <button
            onClick={() => scroll('right')} disabled={!canRight}
            style={{
              width: 30, height: 30, borderRadius: 4, border: '1px solid var(--th-border)',
              background: canRight ? 'var(--th-card)' : 'transparent',
              color: canRight ? 'var(--th-text)' : 'var(--th-muted)',
              cursor: canRight ? 'pointer' : 'default', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>›</button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          display: 'flex', gap: 14, overflowX: 'auto',
          scrollbarWidth: 'none', paddingBottom: 4,
        }}
      >
        {PUBLICATIONS.map(pub => (
          <a
            key={pub.id}
            href={pub.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flexShrink: 0, width: 252,
              background: 'var(--th-card)',
              border: '1px solid var(--th-border)',
              borderRadius: 6, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              textDecoration: 'none', color: 'inherit',
              transition: 'border-color 0.15s, transform 0.15s',
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
            {/* Cover */}
            <div style={coverStyle(pub)}>
              {/* Diagonal accent */}
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 80, height: 80,
                background: `${pub.typeBg}1a`,
                transform: 'translate(20px,-20px) rotate(45deg)',
              }}/>
              {/* Top-right ADB badge */}
              <div style={{
                position: 'absolute', top: 10, right: 10,
                background: '#002569', borderRadius: 3,
                padding: '2px 6px', fontSize: 9, fontWeight: 700,
                color: '#fff', letterSpacing: '0.06em',
              }}>ADB</div>
              {/* Series label */}
              <div style={{
                fontSize: 8.5, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `${pub.typeBg}cc`,
                marginBottom: 5,
              }}>{pub.series}</div>
              {/* Title on cover */}
              <div style={{
                fontSize: 12.5, fontWeight: 600, lineHeight: 1.35,
                color: '#fff',
              }}>{pub.title}</div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {/* Type + date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                  textTransform: 'uppercase', color: pub.typeBg,
                  background: `${pub.typeBg}18`, padding: '2px 7px', borderRadius: 2,
                }}>{pub.type}</span>
                <span style={{ fontSize: 9.5, color: 'var(--th-muted)' }}>{pub.date}</span>
              </div>
              {/* Subtitle */}
              <div style={{ fontSize: 11, color: 'var(--th-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                {pub.subtitle}
              </div>
              {/* Abstract */}
              <div style={{ fontSize: 10.5, color: 'var(--th-muted)', lineHeight: 1.65, flex: 1 }}>
                {pub.abstract}
              </div>
              {/* Footer */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '1px solid var(--th-border)', paddingTop: 8, marginTop: 4,
              }}>
                {pub.pages && (
                  <span style={{ fontSize: 9.5, color: 'var(--th-muted)' }}>{pub.pages} pages</span>
                )}
                <span style={{ fontSize: 10.5, color: pub.typeBg, marginLeft: 'auto' }}>
                  Read online ↗
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 16, fontSize: 10.5, color: 'var(--th-muted)' }}>
        All publications are freely available at{' '}
        <span style={{ color: adb.blueLight }}>adb.org/publications</span>.
        For restricted working papers, request access through your department's library portal.
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
  const [briefingFilter, setBriefingFilter] = useState<string>('All')
  const [briefingPage, setBriefingPage] = useState(0)
  const [mapFlyTarget, setMapFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | undefined>()
  const countryCarouselRef = useRef<HTMLDivElement>(null)
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const th = isDark ? DARK : LIGHT

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
        // Streaming response
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setAiAnswer(accumulated)
        }
      } else {
        const data = await res.json()
        setAiAnswer(data.answer ?? '')
      }
    } catch {
      setAiAnswer('Sorry, I could not reach the AI service. Try exploring the data directly in the Data Explorer.')
    } finally {
      setAiLoading(false)
    }
  }

  const allIndData = useMultiKidb(PACIFIC)

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
        padding: '0 24px', display: 'flex', alignItems: 'center', height: 52,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* ADB Logo — top left */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginRight: 24, paddingRight: 24,
          borderRight: '1px solid var(--th-border)', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/adb-logo.svg" alt="Asian Development Bank" style={{ height: 36, width: 'auto', display: 'block' }} />
        </div>

        {/* Product name */}
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 28, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.02em', color: 'var(--th-text)' }}>ERDI Intelligence Hub</span>
          <span style={{ fontSize: 9.5, color: 'var(--th-muted)', fontWeight: 300, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Economic Research &amp; Development Impact</span>
        </div>

        {/* Nav links */}
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

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
          <button style={{ background: 'none', border: 'none', color: 'var(--th-muted)', cursor: 'pointer', fontSize: 15 }}>🔔</button>
          <div style={{ width: 1, height: 20, background: 'var(--th-border)' }} />
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
            <span style={{ fontSize: 12 }}>↩</span> Sign out
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

        {/* Data Explorer view */}
        {activeNav === 'Data Explorer' && <DataExplorer initialQuery={pendingQuery} />}
        {activeNav === 'Publications' && <PublicationsView />}
        {activeNav !== 'Home' && activeNav !== 'Data Explorer' && activeNav !== 'Publications' && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: adb.muted, fontSize: 13 }}>
            {activeNav} — coming soon
          </div>
        )}
        {activeNav === 'Home' && (<>

        {/* Hero */}
        <div style={{
          marginBottom: 24, padding: '20px 24px 22px',
          background: isDark
            ? 'linear-gradient(135deg, #0e2845 0%, #0a1f35 60%, #071829 100%)'
            : 'linear-gradient(135deg, #e4f0fa 0%, #eef5fb 60%, #f4f9ff 100%)',
          borderRadius: 10, borderLeft: `4px solid ${isDark ? '#007DB7' : '#007DB7'}`,
          boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.35)' : '0 2px 16px rgba(0,125,183,0.1)',
        }}>
          <h1 style={{ fontSize: 26, fontWeight: 300, margin: 0, lineHeight: 1.2, color: 'var(--th-text)' }}>Good morning, Cara.</h1>
          <div style={{ fontSize: 12, color: 'var(--th-muted)', fontWeight: 300, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#8DC63F' }} />
            Senior Economist · ERDI · Pacific Islands Portfolio
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
                  padding: '0 24px', background: homeSearch.trim() ? adb.blue : 'var(--th-border)',
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

          {/* Suggested tags */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--th-muted)' }}>Suggested:</span>
            {['GDP growth for Pacific SIDS', 'Fiji inflation trends', 'Remittance flows — Tonga & Samoa', 'Debt levels across Pacific islands'].map(s => (
              <button key={s} onClick={() => { setPendingQuery(s); setActiveNav('Data Explorer') }} style={{
                fontSize: 11, color: 'var(--th-muted)', padding: '3px 10px', borderRadius: 12,
                border: '1px solid #1e3f5c', background: 'none', cursor: 'pointer',
              }}>{s}</button>
            ))}
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
                  display: 'flex', gap: 8, padding: '10px 14px',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #007DB7 0%, #00A5D2 100%)' }} />
                Pacific Portfolio Map
              </h2>
                {allIndData[activeInd]?.source && <SourceBadge source={allIndData[activeInd].source} />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 2 }}>
                KIDB · ADO indicators · Click a country to explore · Hover for details
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
                    minWidth: 280, maxHeight: 340, overflowY: 'auto',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--th-border)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--th-muted)', textTransform: 'uppercase' }}>
                    KIDB · ADO Indicators
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

          {/* Map card — no overflow:hidden so expanded Why? panel can overlay the map */}
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
                  <div style={{ fontSize: 9, color: 'var(--th-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                    {INDICATORS[activeInd].flow} · {INDICATORS[activeInd].unit}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--th-muted)' }}>Click a card to focus on map</span>
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

              {/* Scrollable card strip — sorted high risk → low risk left to right */}
              {/* Expanded Why? panel is rendered OUTSIDE this container so overflow-x:auto can't clip it */}
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
                  const reasons = getPacificReasons(activeInd, code)
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
                      {/* Why? toggle button only — expanded content renders below as overlay */}
                      {reasons.length > 0 && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setExpandedReasons(prev => {
                              const next = new Set(prev)
                              next.has(reasonKey) ? next.delete(reasonKey) : next.add(reasonKey)
                              return next
                            })
                          }}
                          style={{
                            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '5px 10px', background: `${color}11`,
                            borderTop: `1px solid ${color}33`,
                            borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 8, fontWeight: 600, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Why?</span>
                          <span style={{ fontSize: 10, color, display: 'inline-block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Expanded Why? panel — absolutely positioned, overlays map below */}
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
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--th-card)', borderTop: `2px solid ${color}`,
                    borderBottom: `1px solid ${color}44`,
                    padding: '12px 16px 14px',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--th-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {FLAG_ISO[expandedCode] && <img src={flagUrl(expandedCode, 20)} alt="" style={{ width: 20, height: 15, objectFit: 'cover', borderRadius: 2 }} />}
                        {ECONOMIES[expandedCode]} — Why has this changed?
                      </span>
                      <button
                        onClick={() => setExpandedReasons(prev => { const next = new Set(prev); next.delete(`${activeInd}:${expandedCode}`); return next })}
                        style={{ fontSize: 16, color: 'var(--th-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                      >×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px 24px' }}>
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

              <div style={{ marginTop: 8, fontSize: 9, color: 'var(--th-muted)' }}>
                Source: KIDB SDMX API · adb.org/kidb · ADO 2026
              </div>
            </div>

            {/* Map — full width */}
            <PacificMapLeaflet
              dots={buildIndicatorDots(activeInd, allIndData[activeInd]?.obs ?? [])}
              isDark={isDark}
              flyTarget={mapFlyTarget}
            />

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--th-border)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                {[
                  { dot: adb.red,   label: 'High risk / Alert' },
                  { dot: adb.amber, label: 'Watch / Moderate' },
                  { dot: adb.green, label: 'Strong / Stable' },
                  { dot: adb.teal,  label: 'Inflows / Monitor' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.dot, display: 'inline-block' }} />
                    <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>{l.label}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
            const totalPages = Math.ceil(filtered.length / 3)
            const page = Math.min(briefingPage, Math.max(0, totalPages - 1))
            const visible = filtered.slice(page * 3, page * 3 + 3)
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'stretch' }}>
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
                  {/* Placeholder cards to keep 3-column grid stable */}
                  {visible.length < 3 && Array.from({ length: 3 - visible.length }).map((_, i) => (
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
              padding: '20px',
            }}
            onClick={() => setSelectedArticle(null)}
          >
            <div
              style={{
                background: 'var(--th-card)',
                border: '1px solid var(--th-border)',
                borderTop: `3px solid ${selectedArticle.typeBg}`,
                borderRadius: 8,
                maxWidth: 680, width: '100%', maxHeight: '85vh',
                overflowY: 'auto',
                padding: '28px 32px',
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
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
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
    </div>
  )
}
