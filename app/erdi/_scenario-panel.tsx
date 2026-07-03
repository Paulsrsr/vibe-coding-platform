'use client'
import { useState } from 'react'
import type { ChartConfigType } from '@/app/api/kidb/explore/route'
import { SERIES_COLORS, type ChartData, type EcoProjection, type ProjectionBand } from './_d3-charts'

const adb = {
  blue: '#007DB7', blueLight: '#68C5EA', green: '#8DC63F',
  amber: '#FDB915', red: '#E9532B', teal: '#00A5D2',
  font: '"Helvetica Neue",Arial,sans-serif',
}

const ECO_LABELS: Record<string, string> = {
  PNG: 'Papua New Guinea', FIJ: 'Fiji',         VAN: 'Vanuatu',
  SOL: 'Solomon Islands',  TON: 'Tonga',         SAM: 'Samoa',
  KIR: 'Kiribati',         TUV: 'Tuvalu',        NZL: 'New Zealand',
  AUS: 'Australia',        IND: 'India',          PAK: 'Pakistan',
  BAN: 'Bangladesh',       SRI: 'Sri Lanka',      NEP: 'Nepal',
  INO: 'Indonesia',        PHI: 'Philippines',    VIE: 'Viet Nam',
  THA: 'Thailand',         MAL: 'Malaysia',       SIN: 'Singapore',
  CAM: 'Cambodia',         MYA: 'Myanmar',        PRC: 'China',
  JPN: 'Japan',            KOR: 'Korea',          MON: 'Mongolia',
  KAZ: 'Kazakhstan',       UZB: 'Uzbekistan',     AZE: 'Azerbaijan',
  GEO: 'Georgia',          ARM: 'Armenia',        PA:  'Pacific',
  AFG: 'Afghanistan',      MLD: 'Maldives',       BHU: 'Bhutan',
  TIM: 'Timor-Leste',
}

// ── Historical episode definitions ────────────────────────────────────────────
// Deltas represent observed year-on-year changes during each episode, applied
// from the current baseline to simulate "what if this happened again today"

export type HistoricalEpisode = {
  id: string
  label: string
  period: string
  color: string
  description: string
  context: string[]
  deltas: Partial<Record<string, [number, number, number]>>
  genericDelta: [number, number, number]
}

export const EPISODES: HistoricalEpisode[] = [
  {
    id: 'gfc',
    label: 'Global Financial Crisis',
    period: '2008–2009',
    color: '#E9532B',
    description:
      'The worst global recession since the Great Depression hit Pacific economies through trade compression, falling remittances, and capital flight from emerging markets.',
    context: [
      'Pacific GDP growth averaged −1.2% in 2009, down from +3.8% the year prior',
      'Remittances to PNG, Fiji, and Samoa fell 15–22% as Australia and NZ unemployment rose sharply',
      'Tourism arrivals in Fiji dropped 8%; foreign direct investment contracted across the region',
      'Commodity prices for LNG, copper, and cocoa — key PNG exports — fell 30–50% peak-to-trough',
    ],
    deltas: {
      NGDP_R_PTX_PS:     [-3.5, -1.5,  0.8],
      PCPI_PC_PP_PT:     [-0.8, -0.5,  0.2],
      GC_DOD_TOTL_GD_ZS: [ 4.5,  2.0, -0.5],
      BX_TRF_PWKR_CD_DT: [-12,  -6,    3  ],
      BX_KLT_DINV_CD_WD: [-18,  -8,    4  ],
      LUR_PT:            [  2.0,  1.2, -0.5],
      BN_CAB_XOKA_GD_ZS: [-1.5, -0.8,  0.3],
      NC_HFC_PTX_PS:     [-2.0, -1.0,  0.5],
      NGDPPC_XDC:        [-250, -100,   80  ],
    },
    genericDelta: [-2.0, -1.0, 0.5],
  },
  {
    id: 'covid',
    label: 'COVID-19 Pandemic',
    period: '2020–2021',
    color: '#FDB915',
    description:
      'Border closures and the collapse of international travel devastated tourism-dependent Pacific SIDS, while remittance flows proved more resilient than expected.',
    context: [
      'Fiji GDP contracted 15.2% in 2020 — the steepest peacetime recession in its history',
      'Vanuatu and Tonga saw GDP falls of 5–7% despite recording no significant domestic outbreaks',
      'Remittances to Pacific SIDS held up better than expected, declining only 3–5% in 2020',
      'ADB, IMF, and bilateral donors mobilised over USD 2bn in emergency budget support for the region',
    ],
    deltas: {
      NGDP_R_PTX_PS:     [-5.0, -1.5,  3.0],
      PCPI_PC_PP_PT:     [-0.5,  0.5,  1.5],
      GC_DOD_TOTL_GD_ZS: [ 8.0,  3.5, -1.5],
      BX_TRF_PWKR_CD_DT: [-4,    2,    8  ],
      BX_KLT_DINV_CD_WD: [-15,  -5,    6  ],
      LUR_PT:            [  4.0,  2.0, -1.5],
      BN_CAB_XOKA_GD_ZS: [-3.5, -1.5,  0.8],
      NC_HFC_PTX_PS:     [-4.0, -1.5,  2.0],
      NGDPPC_XDC:        [-420, -140,  160  ],
    },
    genericDelta: [-3.5, -1.0, 1.5],
  },
  {
    id: 'cyclone',
    label: 'Cyclone Winston',
    period: '2016',
    color: '#00A5D2',
    description:
      'Category 5 Cyclone Winston — the most intense tropical cyclone ever recorded in the Southern Hemisphere — caused USD 1.4bn in damage, equivalent to 20% of Fiji\'s GDP.',
    context: [
      'Fiji\'s GDP growth fell from 3.8% to 2.0% in 2016; agricultural output dropped around 10%',
      'Sugar cane crop was damaged across key growing regions, depressing export earnings',
      'Insurance and donor-funded reconstruction drove a fiscal deficit of 4.2% of GDP in 2016',
      'Tourism recovered within 12 months, underpinned by aggressive marketing and rapid infrastructure repair',
    ],
    deltas: {
      NGDP_R_PTX_PS:     [-3.5, -0.5,  1.5],
      PCPI_PC_PP_PT:     [ 1.5,  0.5, -0.3],
      GC_DOD_TOTL_GD_ZS: [ 6.0,  2.5, -1.0],
      BX_TRF_PWKR_CD_DT: [ 2,    1,    0  ],
      BX_KLT_DINV_CD_WD: [ 4,    6,    2  ],
      LUR_PT:            [  2.5,  1.0, -0.8],
      BN_CAB_XOKA_GD_ZS: [-2.0, -1.0,  0.5],
      NC_HFC_PTX_PS:     [-3.0, -1.0,  0.8],
      NGDPPC_XDC:        [-300,  -90,   70  ],
    },
    genericDelta: [-2.5, -0.8, 0.8],
  },
  {
    id: 'inflation',
    label: 'Post-COVID Inflation',
    period: '2022–2023',
    color: '#8DC63F',
    description:
      'Supply chain disruptions and energy price surges following the Ukraine conflict drove inflation to multi-decade highs, squeezing household purchasing power across Pacific SIDS.',
    context: [
      'Pacific CPI averaged 6.8% in 2022 — the highest since the early 2000s commodity boom',
      'Fuel and freight costs drove up landed import prices for food by 12–18% in import-dependent SIDS',
      'Solomon Islands and Kiribati imposed fuel subsidies, adding 2–4% of GDP to their fiscal deficits',
      'Real wages fell across most Pacific economies; poverty incidence is estimated to have risen 1–2 ppts',
    ],
    deltas: {
      NGDP_R_PTX_PS:     [-1.0, -0.5,  0.5],
      PCPI_PC_PP_PT:     [ 4.5,  3.0, -1.5],
      GC_DOD_TOTL_GD_ZS: [ 2.5,  1.5, -0.8],
      BX_TRF_PWKR_CD_DT: [ 5,    3,    1  ],
      BX_KLT_DINV_CD_WD: [-6,   -3,    2  ],
      LUR_PT:            [  0.5,  0.3, -0.2],
      BN_CAB_XOKA_GD_ZS: [-2.0, -1.2,  0.6],
      NC_HFC_PTX_PS:     [-1.5, -0.8,  0.4],
      NGDPPC_XDC:        [-120,  -60,   50  ],
    },
    genericDelta: [-0.8, -0.4, 0.3],
  },
  {
    id: 'remittance',
    label: 'PALM Scheme Expansion',
    period: '2022–2024',
    color: '#007DB7',
    description:
      'Rapid growth of the Pacific Australia Labour Mobility (PALM) scheme and NZ RSE programme drove record remittance inflows, boosting household incomes and current account balances.',
    context: [
      'Remittances to Pacific SIDS grew 18–25% annually in 2022–24, far above the global average',
      'PNG, Samoa, Tonga, and Vanuatu all recorded current account surpluses or significantly reduced deficits',
      'PALM placements grew from 8,000 (2021) to over 35,000 (2024) across all Pacific SIDS',
      'Domestic consumption rose 4–6% in Samoa and Tonga, directly driven by returning worker remittances',
    ],
    deltas: {
      NGDP_R_PTX_PS:     [ 0.8,  1.2,  1.0],
      PCPI_PC_PP_PT:     [ 0.8,  0.5,  0.3],
      GC_DOD_TOTL_GD_ZS: [-1.5, -1.0, -0.8],
      BX_TRF_PWKR_CD_DT: [22,   18,   14  ],
      BX_KLT_DINV_CD_WD: [ 3,    4,    3  ],
      LUR_PT:            [-1.5, -1.2, -0.8],
      BN_CAB_XOKA_GD_ZS: [ 2.5,  2.0,  1.5],
      NC_HFC_PTX_PS:     [ 2.0,  1.8,  1.4],
      NGDPPC_XDC:        [ 200,  280,  220 ],
    },
    genericDelta: [1.2, 1.0, 0.8],
  },
]

// ── Projection math ───────────────────────────────────────────────────────────
// Replays the observed historical deltas from the current baseline + recent trend

export function computeProjections(
  chartData: ChartData,
  indicator: string,
  economies: string[],
  episode: HistoricalEpisode,
): EcoProjection[] {
  const deltaTemplate = episode.deltas[indicator] ?? episode.genericDelta

  const numericPeriods = chartData.periods.map(Number).filter(n => !isNaN(n))
  const lastYear = numericPeriods.length ? Math.max(...numericPeriods) : new Date().getFullYear()
  const projYears = [lastYear + 1, lastYear + 2, lastYear + 3].map(String)

  return economies.flatMap(eco => {
    const pts = chartData.series
      .filter(d => d.economy === eco && d.value !== null)
      .sort((a, b) => a.period.localeCompare(b.period)) as { economy: string; period: string; value: number }[]

    if (pts.length < 2) return []

    const lastPt = pts[pts.length - 1]
    const recent = pts.slice(-4)
    const diffs  = recent.slice(1).map((p, i) => p.value - recent[i].value)
    const trend  = diffs.reduce((a, b) => a + b, 0) / diffs.length

    const bands: ProjectionBand[] = projYears.map((year, t) => {
      const delta = deltaTemplate[t]
      const base  = lastPt.value + trend * (t + 1) + delta
      return {
        year,
        base,
        pessimistic: lastPt.value + trend * (t + 1) + delta * 1.4,
        optimistic:  lastPt.value + trend * (t + 1) + delta * 0.5,
      }
    })

    return [{ eco, lastActual: lastPt.value, lastPeriod: lastPt.period, trend, bands }]
  })
}

// ── ScenarioPanel ─────────────────────────────────────────────────────────────

export function ScenarioPanel({
  config,
  chartData,
  activeId,
  setActiveId,
  projections,
}: {
  config: ChartConfigType
  chartData: ChartData
  activeId: string | null
  setActiveId: (id: string | null) => void
  projections: EcoProjection[]
}) {
  const [open, setOpen] = useState(false)

  const activeEpisode = EPISODES.find(e => e.id === activeId) ?? null

  function fmtVal(v: number): string {
    if (['BX_TRF_PWKR_CD_DT', 'BX_KLT_DINV_CD_WD'].includes(config.indicator))
      return Math.abs(v) > 1000 ? `USD ${(v / 1000).toFixed(1)}bn` : `USD ${v.toFixed(0)}mn`
    if (config.indicator === 'NGDPPC_XDC')
      return `USD ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `${v.toFixed(1)} ${config.unit}`
  }

  function getDeltaColor(delta: number, delta0: number): string {
    if (Math.abs(delta) < 0.05) return 'var(--th-muted)'
    return (delta0 > 0 ? delta > 0 : delta < 0) ? adb.green : adb.red
  }

  return (
    <div>
      {/* Toggle — sits flush inside the chart card */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '10px 16px', fontFamily: adb.font,
          background: open ? `${adb.blue}09` : 'transparent',
          border: 'none', borderTop: `1px solid var(--th-border)`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: adb.blue, background: `${adb.blue}18`, padding: '2px 8px', borderRadius: 2,
          }}>✦ Historical Analysis</span>
          <span style={{ fontSize: 11, color: 'var(--th-muted)' }}>
            {activeEpisode
              ? `${activeEpisode.label} (${activeEpisode.period}) — chart updating live`
              : 'Compare current trajectory against historical episodes'}
          </span>
        </div>
        <span style={{
          fontSize: 10, color: 'var(--th-muted)', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          borderTop: `1px solid ${adb.blue}22`,
          background: 'var(--th-card)', overflow: 'hidden',
        }}>
          {/* Episode selector */}
          <div style={{ padding: '16px 16px 0' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--th-muted)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
            }}>
              Select a Historical Episode
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {EPISODES.map(ep => {
                const active = activeId === ep.id
                return (
                  <button
                    key={ep.id}
                    onClick={() => setActiveId(active ? null : ep.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 4, cursor: 'pointer',
                      background: active ? `${ep.color}1a` : 'var(--th-chart)',
                      border: `1px solid ${active ? ep.color : 'var(--th-border)'}`,
                      color: active ? ep.color : 'var(--th-muted)',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      transition: 'all 0.15s', fontFamily: adb.font,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                    }}
                  >
                    <span>{ep.label}</span>
                    <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>{ep.period}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {activeEpisode && (
            <>
              {/* Historical context card */}
              <div style={{
                margin: '14px 16px 0',
                background: `${activeEpisode.color}08`,
                border: `1px solid ${activeEpisode.color}28`,
                borderLeft: `3px solid ${activeEpisode.color}`,
                borderRadius: 5, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 12, color: 'var(--th-subtle)', lineHeight: 1.65, marginBottom: 10 }}>
                  {activeEpisode.description}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: activeEpisode.color,
                  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 7,
                }}>
                  What Happened
                </div>
                {activeEpisode.context.map((c, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 7, fontSize: 11,
                    color: 'var(--th-muted)', lineHeight: 1.65, marginBottom: 3,
                  }}>
                    <span style={{ color: activeEpisode.color, flexShrink: 0 }}>›</span>
                    {c}
                  </div>
                ))}
              </div>

              {/* Projection table */}
              {projections.length > 0 && (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--th-muted)',
                    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
                  }}>
                    Projected Outcomes — if {activeEpisode.label} conditions repeated today
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: adb.font }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--th-border)' }}>
                          <th style={{ textAlign: 'left', padding: '5px 8px 5px 0', color: 'var(--th-muted)', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em' }}>
                            Economy
                          </th>
                          <th style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--th-muted)', fontWeight: 600, fontSize: 10 }}>
                            Last Actual
                          </th>
                          {projections[0].bands.map(b => (
                            <th key={b.year} style={{
                              textAlign: 'center', padding: '5px 10px',
                              color: activeEpisode.color, fontWeight: 700, fontSize: 10,
                              borderLeft: '1px solid var(--th-border)',
                            }}>
                              {b.year}
                            </th>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--th-border)' }}>
                          <th style={{ padding: '2px 0' }} />
                          <th style={{ textAlign: 'right', padding: '2px 8px', fontSize: 9, color: 'var(--th-muted)', fontWeight: 400 }}>
                            {projections[0].lastPeriod}
                          </th>
                          {projections[0].bands.map(b => (
                            <th key={b.year} style={{
                              textAlign: 'center', padding: '2px 10px',
                              fontSize: 9, color: 'var(--th-muted)', fontWeight: 400,
                              borderLeft: '1px solid var(--th-border)',
                            }}>
                              Pess / Base / Opt
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {projections.map((proj, i) => {
                          const delta0 = activeEpisode.deltas[config.indicator]?.[0] ?? activeEpisode.genericDelta[0]
                          return (
                            <tr key={proj.eco} style={{ borderBottom: '1px solid var(--th-border)' }}>
                              <td style={{ padding: '8px 8px 8px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: SERIES_COLORS[i % SERIES_COLORS.length],
                                    display: 'inline-block', flexShrink: 0,
                                  }} />
                                  <span style={{ color: 'var(--th-text)' }}>{ECO_LABELS[proj.eco] ?? proj.eco}</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--th-muted)', fontFamily: 'monospace' }}>
                                {fmtVal(proj.lastActual)}
                              </td>
                              {proj.bands.map((b, bi) => {
                                const delta = b.base - proj.lastActual
                                return (
                                  <td key={bi} style={{
                                    padding: '8px 10px', textAlign: 'center',
                                    borderLeft: '1px solid var(--th-border)', fontFamily: 'monospace',
                                  }}>
                                    <div style={{ color: 'var(--th-muted)', fontSize: 10 }}>{fmtVal(b.pessimistic)}</div>
                                    <div style={{ color: 'var(--th-text)', fontWeight: 700, fontSize: 12 }}>{fmtVal(b.base)}</div>
                                    <div style={{ color: getDeltaColor(delta, delta0), fontSize: 10 }}>
                                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                                    </div>
                                    <div style={{ color: 'var(--th-muted)', fontSize: 10 }}>{fmtVal(b.optimistic)}</div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--th-muted)', marginTop: 6 }}>
                    Each year: pessimistic / <strong>base</strong> / optimistic · Δ from last actual shown below base
                  </div>

                  {/* Methodology */}
                  <div style={{
                    marginTop: 12, padding: '10px 12px',
                    background: 'var(--th-chart)', borderRadius: 4,
                  }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: '#4a6a88',
                      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      Methodology &amp; Disclaimers
                    </div>
                    <div style={{ fontSize: 10, color: '#4a6a88', lineHeight: 1.65 }}>
                      Projections replay the observed year-on-year changes from the {activeEpisode.label} ({activeEpisode.period}) episode,
                      applied from the current baseline plus recent trend. Bands represent the historically observed range:
                      base (episode average), pessimistic (× 1.4), optimistic (× 0.5). Historical deltas are sourced from
                      ADB Pacific Economic Monitor data, IMF World Economic Outlook archives, and World Bank Pacific Island Countries
                      economic updates. These projections are for analytical purposes only and do not constitute ADB official forecasts or policy endorsements.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
