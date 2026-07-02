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

// ── Scenario definitions ──────────────────────────────────────────────────────
// Shocks are [year1, year2, year3] deltas in indicator units, calibrated at severity = 50 (base)

export type ScenarioDef = {
  id: string
  label: string
  color: string
  description: string
  assumptions: string[]
  shocks: Partial<Record<string, [number, number, number]>>
  genericShock: [number, number, number]
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'recession',
    label: 'Global Recession',
    color: '#E9532B',
    description:
      'Sharp contraction in global demand, rising unemployment, and capital flight from emerging markets.',
    assumptions: [
      'Global GDP contracts 1.8% in 2025, aligned with IMF WEO downside scenario',
      'Trade volumes fall 6%; Pacific exporters face severe demand compression',
      'Remittance corridors from Australia and New Zealand weaken as source-country labour markets soften',
      'Risk-off sentiment triggers capital outflows and sustained exchange rate pressure',
    ],
    shocks: {
      NGDP_R_PTX_PS:     [-3.5, -1.5,  0.8],
      PCPI_PC_PP_PT:     [-0.8, -0.5,  0.2],
      GC_DOD_TOTL_GD_ZS: [ 4.5,  2.0, -0.5],
      BX_TRF_PWKR_CD_DT: [-12,  -6,    3  ],
      BX_KLT_DINV_CD_WD: [-18,  -8,    4  ],
      LUR_PT:            [  2.0,  1.2, -0.5],
      BN_CAB_XOKA_GD_ZS: [-1.5, -0.8,  0.3],
      NC_HFC_PTX_PS:     [-2.0, -1.0,  0.5],
      ENDE_XDC_USD_RATE: [ 0.08, 0.04,-0.02],
      FM_LBL_MONY_GD_ZS: [ 1.5,  0.8, -0.3],
      NGDPPC_XDC:        [-250, -100,   80  ],
    },
    genericShock: [-2.0, -1.0, 0.5],
  },
  {
    id: 'commodity',
    label: 'Commodity Spike',
    color: '#FDB915',
    description:
      'Sustained surge in global energy and food prices driven by supply disruptions and geopolitical shocks.',
    assumptions: [
      'Oil rises to USD 140/bbl — a 65% increase from the 2024 baseline price',
      'Food commodity index up 35%, disproportionately amplified for import-dependent Pacific SIDS',
      'Transport and logistics costs add 6–8% to landed import prices across the region',
      'Central banks tighten to contain second-round inflation, constraining domestic credit growth',
    ],
    shocks: {
      NGDP_R_PTX_PS:     [-1.2, -0.8,  0.3],
      PCPI_PC_PP_PT:     [ 3.5,  2.0, -0.8],
      GC_DOD_TOTL_GD_ZS: [ 2.0,  1.2, -0.4],
      BX_TRF_PWKR_CD_DT: [ 4,    2,    1  ],
      BX_KLT_DINV_CD_WD: [-8,   -4,    2  ],
      LUR_PT:            [ 0.8,  0.5, -0.2],
      BN_CAB_XOKA_GD_ZS: [-2.5, -1.5,  0.5],
      NC_HFC_PTX_PS:     [-1.5, -0.8,  0.3],
      ENDE_XDC_USD_RATE: [ 0.05, 0.03,-0.01],
      FM_LBL_MONY_GD_ZS: [ 2.0,  1.0, -0.5],
      NGDPPC_XDC:        [-180, -90,   60  ],
    },
    genericShock: [1.5, 1.0, -0.5],
  },
  {
    id: 'climate',
    label: 'Climate Shock',
    color: '#00A5D2',
    description:
      'Major cyclone season affecting multiple Pacific economies with cascading fiscal and agricultural impacts.',
    assumptions: [
      'Three Category 4–5 cyclones affect Vanuatu, Tonga, and Solomon Islands — USD 800M aggregate damage',
      'Agricultural output contracts 25–40% in affected economies for at least two growing seasons',
      'Tourism receipts fall 30% due to damage to infrastructure, airports, and resort facilities',
      'ADB emergency financing deployed; reconstruction raises public debt by 8–12% of GDP',
    ],
    shocks: {
      NGDP_R_PTX_PS:     [-4.5, -1.0,  1.5],
      PCPI_PC_PP_PT:     [ 2.5,  1.0, -0.5],
      GC_DOD_TOTL_GD_ZS: [ 9.0,  4.0, -1.0],
      BX_TRF_PWKR_CD_DT: [ 3,    1,    0  ],
      BX_KLT_DINV_CD_WD: [ 5,    8,    3  ],
      LUR_PT:            [ 3.5,  1.5, -1.0],
      BN_CAB_XOKA_GD_ZS: [-3.0, -1.5,  0.8],
      NC_HFC_PTX_PS:     [-3.5, -1.5,  0.8],
      ENDE_XDC_USD_RATE: [ 0.06, 0.03,-0.01],
      FM_LBL_MONY_GD_ZS: [ 3.0,  1.5, -0.5],
      NGDPPC_XDC:        [-380, -120,   90  ],
    },
    genericShock: [-3.0, -1.2, 0.8],
  },
  {
    id: 'tightening',
    label: 'Policy Tightening',
    color: '#8DC63F',
    description:
      'Coordinated monetary and fiscal consolidation to address elevated inflation and debt sustainability concerns.',
    assumptions: [
      'Policy rates raised 250bps across Pacific central banks over the next 12 months',
      'Fiscal consolidation targets a primary surplus of 1.5% of GDP by 2026',
      'Credit growth constrained to single digits, dampening consumption and private investment',
      'Inflation projected to moderate to 3–4% range by end-2026 under this consolidation path',
    ],
    shocks: {
      NGDP_R_PTX_PS:     [-1.0, -0.5,  0.5],
      PCPI_PC_PP_PT:     [-1.8, -1.2, -0.5],
      GC_DOD_TOTL_GD_ZS: [-3.0, -2.5, -2.0],
      BX_TRF_PWKR_CD_DT: [-2,   -1,    0  ],
      BX_KLT_DINV_CD_WD: [-4,   -2,    3  ],
      LUR_PT:            [ 0.5,  0.3, -0.2],
      BN_CAB_XOKA_GD_ZS: [ 1.0,  0.8,  0.4],
      NC_HFC_PTX_PS:     [-1.2, -0.8,  0.3],
      ENDE_XDC_USD_RATE: [-0.04,-0.02,  0.01],
      FM_LBL_MONY_GD_ZS: [-2.5, -1.5, -0.5],
      NGDPPC_XDC:        [-80,  -40,   60  ],
    },
    genericShock: [-0.8, -0.5, 0.3],
  },
  {
    id: 'labour',
    label: 'Labour Mobility Surge',
    color: '#007DB7',
    description:
      'Expanded PALM scheme and NZ RSE programme drive record remittance inflows and domestic consumption across Pacific SIDS.',
    assumptions: [
      'PALM scheme placements increase 45% as Australia expands aged care and horticulture quotas',
      'New Zealand RSE cap raised by 6,000 additional Pacific worker placements from 2025',
      'Digital transfer costs fall below 3%, driven by accelerating mobile money adoption',
      'Multiplier effect: each USD 1 of remittances generates USD 1.8 of domestic consumption',
    ],
    shocks: {
      NGDP_R_PTX_PS:     [ 0.8,  1.2,  1.0],
      PCPI_PC_PP_PT:     [ 0.8,  0.5,  0.3],
      GC_DOD_TOTL_GD_ZS: [-1.5, -1.0, -0.8],
      BX_TRF_PWKR_CD_DT: [22,   18,   14  ],
      BX_KLT_DINV_CD_WD: [ 3,    4,    3  ],
      LUR_PT:            [-1.5, -1.2, -0.8],
      BN_CAB_XOKA_GD_ZS: [ 2.5,  2.0,  1.5],
      NC_HFC_PTX_PS:     [ 2.0,  1.8,  1.4],
      ENDE_XDC_USD_RATE: [-0.03,-0.02,-0.01],
      FM_LBL_MONY_GD_ZS: [ 1.5,  1.2,  0.8],
      NGDPPC_XDC:        [ 200,  280,  220 ],
    },
    genericShock: [1.2, 1.0, 0.8],
  },
]

// ── Projection math ───────────────────────────────────────────────────────────

export function computeProjections(
  chartData: ChartData,
  indicator: string,
  economies: string[],
  scenario: ScenarioDef,
  severity: number,
): EcoProjection[] {
  const shockTemplate = scenario.shocks[indicator] ?? scenario.genericShock
  const scale = severity / 50

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
      const shock = shockTemplate[t] * scale
      const base  = lastPt.value + trend * (t + 1) + shock
      return {
        year,
        base,
        pessimistic: lastPt.value + trend * (t + 1) + shock * 1.5,
        optimistic:  lastPt.value + trend * (t + 1) + shock * 0.4,
      }
    })

    return [{ eco, lastActual: lastPt.value, lastPeriod: lastPt.period, trend, bands }]
  })
}

// ── ScenarioPanel (controlled — parent owns scenario state) ───────────────────

export function ScenarioPanel({
  config,
  chartData,
  activeId,
  setActiveId,
  severity,
  setSeverity,
  projections,
}: {
  config: ChartConfigType
  chartData: ChartData
  activeId: string | null
  setActiveId: (id: string | null) => void
  severity: number
  setSeverity: (v: number) => void
  projections: EcoProjection[]
}) {
  const [open, setOpen] = useState(false)

  const activeScenario = SCENARIOS.find(s => s.id === activeId) ?? null

  function fmtVal(v: number): string {
    if (['BX_TRF_PWKR_CD_DT', 'BX_KLT_DINV_CD_WD'].includes(config.indicator))
      return Math.abs(v) > 1000 ? `USD ${(v / 1000).toFixed(1)}bn` : `USD ${v.toFixed(0)}mn`
    if (config.indicator === 'NGDPPC_XDC')
      return `USD ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    return `${v.toFixed(1)} ${config.unit}`
  }

  function getDeltaColor(delta: number, shock0: number): string {
    if (Math.abs(delta) < 0.05) return 'var(--th-muted)'
    return (shock0 > 0 ? delta > 0 : delta < 0) ? adb.green : adb.red
  }

  const severityLabel = severity < 30 ? 'Mild' : severity < 60 ? 'Moderate' : severity < 85 ? 'Severe' : 'Extreme'

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
          }}>✦ Scenario Analysis</span>
          <span style={{ fontSize: 11, color: 'var(--th-muted)' }}>
            {activeScenario
              ? `${activeScenario.label} · ${severityLabel} (${severity}%) — chart updating live`
              : 'Model how economic shocks could impact this indicator'}
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
          {/* Scenario selector */}
          <div style={{ padding: '16px 16px 0' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--th-muted)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
            }}>
              Select a Shock Scenario
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {SCENARIOS.map(s => {
                const active = activeId === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(active ? null : s.id)}
                    style={{
                      padding: '7px 14px', borderRadius: 4, cursor: 'pointer',
                      background: active ? `${s.color}1a` : 'var(--th-chart)',
                      border: `1px solid ${active ? s.color : 'var(--th-border)'}`,
                      color: active ? s.color : 'var(--th-muted)',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      transition: 'all 0.15s', fontFamily: adb.font,
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {activeScenario && (
            <>
              {/* Assumptions card */}
              <div style={{
                margin: '14px 16px 0',
                background: `${activeScenario.color}08`,
                border: `1px solid ${activeScenario.color}28`,
                borderLeft: `3px solid ${activeScenario.color}`,
                borderRadius: 5, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 12, color: 'var(--th-subtle)', lineHeight: 1.65, marginBottom: 10 }}>
                  {activeScenario.description}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: activeScenario.color,
                  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 7,
                }}>
                  Key Assumptions
                </div>
                {activeScenario.assumptions.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 7, fontSize: 11,
                    color: 'var(--th-muted)', lineHeight: 1.65, marginBottom: 3,
                  }}>
                    <span style={{ color: activeScenario.color, flexShrink: 0 }}>›</span>
                    {a}
                  </div>
                ))}
              </div>

              {/* Severity slider — this directly drives the main chart */}
              <div style={{ padding: '14px 16px 0' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--th-muted)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    Shock Severity
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: activeScenario.color,
                    background: `${activeScenario.color}1a`, padding: '2px 10px', borderRadius: 3,
                  }}>
                    {severityLabel} · {severity}%
                  </span>
                </div>
                <input
                  type="range" min={5} max={100} value={severity}
                  onChange={e => setSeverity(Number(e.target.value))}
                  style={{ width: '100%', accentColor: activeScenario.color, cursor: 'pointer', display: 'block' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--th-muted)', marginTop: 3 }}>
                  <span>Mild tail risk</span>
                  <span>ADB base case</span>
                  <span>Severe stress test</span>
                </div>
              </div>

              {/* Projection table */}
              {projections.length > 0 && (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--th-muted)',
                    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
                  }}>
                    Projected Outcomes — {activeScenario.label} Scenario
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
                              color: activeScenario.color, fontWeight: 700, fontSize: 10,
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
                          const shock0 = activeScenario.shocks[config.indicator]?.[0] ?? activeScenario.genericShock[0]
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
                                    <div style={{ color: getDeltaColor(delta, shock0), fontSize: 10 }}>
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
                    Each year: pessimistic / <strong>base</strong> / optimistic · Δ from last actual shown in bold row
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
                      Projections use linear trend extrapolation from the last 4 observations plus scenario-specific shocks scaled by the
                      selected severity (base at 50%). Bands: base (shock × 1.0), pessimistic (× 1.5), optimistic (× 0.4). Scenario parameters
                      draw on IMF World Economic Outlook downside pathways, ADB Pacific Economic Monitor stress tests, and OECD Global Economic
                      Outlook frameworks. These projections are for analytical purposes only and do not constitute ADB official forecasts or endorsements.
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
