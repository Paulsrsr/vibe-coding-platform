'use client'
import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const adb = {
  navyCard: 'var(--th-card)', navyBorder: 'var(--th-border)',
  blue: '#007DB7', blueLight: '#68C5EA', green: '#8DC63F',
  amber: '#FDB915', red: '#E9532B', teal: '#00A5D2',
  white: 'var(--th-text)', muted: 'var(--th-muted)',
}
export const SERIES_COLORS = [adb.blue, adb.green, adb.amber, adb.red, adb.teal, adb.blueLight]

export type KidbObs  = { economy: string; period: string; value: number | null }
export type ChartData = { economies: string[]; periods: string[]; series: KidbObs[] }

const ECO_LABELS: Record<string, string> = {
  PNG: 'Papua New Guinea', FIJ: 'Fiji',   VAN: 'Vanuatu',
  SOL: 'Solomon Islands',  TON: 'Tonga',  SAM: 'Samoa',
  KIR: 'Kiribati',         NAU: 'Nauru',  TUV: 'Tuvalu',
  NZL: 'New Zealand',      AUS: 'Australia', PA: 'Pacific',
  IND: 'India',   PRC: 'China',   INO: 'Indonesia', PHI: 'Philippines',
  VIE: 'Viet Nam', THA: 'Thailand', MAL: 'Malaysia',  SIN: 'Singapore',
  BAN: 'Bangladesh', PAK: 'Pakistan', SRI: 'Sri Lanka', NEP: 'Nepal',
  KOR: 'Korea',   JPN: 'Japan',   MON: 'Mongolia',
  KAZ: 'Kazakhstan', UZB: 'Uzbekistan', AZE: 'Azerbaijan',
  GEO: 'Georgia', ARM: 'Armenia', CAM: 'Cambodia',  MYA: 'Myanmar',
  AFG: 'Afghanistan', MLD: 'Maldives', BHU: 'Bhutan', TIM: 'Timor-Leste',
}

// Fixed viewBox — SVG scales to 100% width via CSS, no getBoundingClientRect needed
const VW = 680, VH = 300
const M  = { top: 24, right: 28, bottom: 46, left: 60 }
const IW = VW - M.left - M.right
const IH = VH - M.top  - M.bottom

type TipRow = { economy: string; value: number; color: string }
type Tip    = { x: number; y: number; period: string; rows: TipRow[] }

// ── D3 Line Chart ──────────────────────────────────────────────────────────
export function D3LineChart({ data, unit }: { data: ChartData; unit: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const allVals = data.series.map(d => d.value).filter((v): v is number => v !== null)
    if (!allVals.length || !data.periods.length) return

    const defs = svg.append('defs')
    data.economies.forEach((_, i) => {
      const g = defs.append('linearGradient')
        .attr('id', `lg${i}`).attr('x1','0').attr('x2','0').attr('y1','0').attr('y2','1')
      g.append('stop').attr('offset','0%').attr('stop-color', SERIES_COLORS[i % SERIES_COLORS.length]).attr('stop-opacity', 0.22)
      g.append('stop').attr('offset','100%').attr('stop-color', SERIES_COLORS[i % SERIES_COLORS.length]).attr('stop-opacity', 0.01)
    })

    const root = svg.append('g').attr('transform', `translate(${M.left},${M.top})`)

    // Scales
    const xScale = d3.scalePoint<string>().domain(data.periods).range([0, IW]).padding(0.15)
    const minV = d3.min(allVals)!, maxV = d3.max(allVals)!
    const yPad = (maxV - minV) * 0.15 || 1
    const yScale = d3.scaleLinear().domain([minV - yPad, maxV + yPad]).range([IH, 0]).nice()

    // Grid
    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-IW).tickFormat(() => ''))
      .call(s => { s.select('.domain').remove(); s.selectAll('.tick line').attr('stroke','#1a3550').attr('stroke-dasharray','3,3') })

    // X axis
    root.append('g').attr('transform', `translate(0,${IH})`)
      .call(d3.axisBottom(xScale).tickSize(4))
      .call(s => {
        s.select('.domain').attr('stroke','#2a4a6a')
        s.selectAll('.tick line').attr('stroke','#2a4a6a')
        s.selectAll('text').attr('fill', adb.muted).attr('font-size',10).attr('font-family','"Helvetica Neue",Arial,sans-serif')
      })

    // Y axis
    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call(s => {
        s.select('.domain').attr('stroke','#2a4a6a')
        s.selectAll('.tick line').attr('stroke','#2a4a6a')
        s.selectAll('text').attr('fill', adb.muted).attr('font-size',10).attr('font-family','"Helvetica Neue",Arial,sans-serif')
      })

    // Y unit label
    root.append('text')
      .attr('transform',`rotate(-90) translate(${-IH/2},${-46})`)
      .attr('text-anchor','middle').attr('fill', adb.muted).attr('font-size',9)
      .attr('font-family','"Helvetica Neue",Arial,sans-serif').text(unit)

    // Lines + areas per economy
    data.economies.forEach((eco, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length]
      const pts = data.periods
        .map(p => {
          const obs = data.series.find(d => d.economy === eco && d.period === p)
          return obs?.value != null ? { p, v: obs.value } : null
        })
        .filter((x): x is { p: string; v: number } => x !== null)
      if (pts.length < 1) return

      const areaGen = d3.area<{ p: string; v: number }>()
        .x(d => xScale(d.p)!).y0(IH).y1(d => yScale(d.v))
        .curve(d3.curveMonotoneX)

      const lineGen = d3.line<{ p: string; v: number }>()
        .x(d => xScale(d.p)!).y(d => yScale(d.v))
        .curve(d3.curveMonotoneX)

      // Area fill
      root.append('path').datum(pts)
        .attr('fill', `url(#lg${i})`).attr('d', areaGen)

      // Line — rendered immediately, then fade in
      root.append('path').datum(pts)
        .attr('fill','none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap','round')
        .attr('stroke-linejoin','round')
        .attr('opacity', 0)
        .attr('d', lineGen)
        .transition().duration(600).delay(i * 80)
        .attr('opacity', 1)

      // Dots
      root.selectAll(`.dot-${i}`)
        .data(pts).join('circle')
        .attr('class', `dot-${i}`)
        .attr('cx', d => xScale(d.p)!)
        .attr('cy', d => yScale(d.v))
        .attr('r', 4.5)
        .attr('fill', color)
        .attr('stroke', adb.navyCard)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .transition().duration(200).delay(500 + i * 80)
        .attr('opacity', 1)
    })

    // Invisible hover overlay for tooltip
    root.append('rect')
      .attr('width', IW).attr('height', IH)
      .attr('fill','none').attr('pointer-events','all')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event)
        const step = IW / Math.max(1, data.periods.length - 1)
        const idx  = Math.min(data.periods.length - 1, Math.max(0, Math.round(mx / step)))
        const period = data.periods[idx]
        const rows = data.economies.map((eco, i) => {
          const obs = data.series.find(d => d.economy === eco && d.period === period)
          return obs?.value != null ? { economy: eco, value: obs.value, color: SERIES_COLORS[i % SERIES_COLORS.length] } : null
        }).filter(Boolean) as TipRow[]
        const [px, py] = d3.pointer(event, svgRef.current)
        setTip({ x: px + 12, y: py, period, rows })
      })
      .on('mouseleave', () => setTip(null))

  }, [data, unit])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      />
      {tip && tip.rows.length > 0 && (
        <div style={{
          position: 'absolute', left: tip.x, top: tip.y,
          pointerEvents: 'none', zIndex: 20,
          background: 'var(--th-chart)', border: `1px solid ${adb.navyBorder}`,
          borderRadius: 5, padding: '8px 12px', fontSize: 11,
          color: adb.white, minWidth: 148,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <div style={{ color: adb.muted, fontSize: 10, marginBottom: 6, fontWeight: 600 }}>{tip.period}</div>
          {tip.rows.map(r => (
            <div key={r.economy} style={{ display:'flex', justifyContent:'space-between', gap:14, marginBottom:3 }}>
              <span style={{ color: r.color }}>{ECO_LABELS[r.economy] ?? r.economy}</span>
              <span>{r.value.toFixed(2)} {unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── D3 Bar Chart ───────────────────────────────────────────────────────────
export function D3BarChart({ data, unit }: { data: ChartData; unit: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tip, setTip] = useState<{ x:number; y:number; eco:string; value:number } | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const period = data.periods[data.periods.length - 1] ?? ''
    const entries = data.economies
      .map((eco, i) => {
        const obs = data.series.find(d => d.economy === eco && d.period === period)
        return obs?.value != null ? { eco, v: obs.value, color: SERIES_COLORS[i % SERIES_COLORS.length] } : null
      })
      .filter((x): x is { eco:string; v:number; color:string } => x !== null)
      .sort((a, b) => b.v - a.v)

    if (!entries.length) return

    const root = svg.append('g').attr('transform', `translate(${M.left},${M.top})`)

    const xScale = d3.scaleBand()
      .domain(entries.map(e => e.eco)).range([0, IW]).padding(0.3)
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(entries, e => e.v)! * 1.18]).range([IH, 0]).nice()

    // Grid
    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-IW).tickFormat(() => ''))
      .call(s => { s.select('.domain').remove(); s.selectAll('.tick line').attr('stroke','#1a3550').attr('stroke-dasharray','3,3') })

    // Y axis
    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call(s => {
        s.select('.domain').attr('stroke','#2a4a6a')
        s.selectAll('.tick line').attr('stroke','#2a4a6a')
        s.selectAll('text').attr('fill', adb.muted).attr('font-size',10).attr('font-family','"Helvetica Neue",Arial,sans-serif')
      })

    // X axis
    root.append('g').attr('transform',`translate(0,${IH})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(s => {
        s.select('.domain').attr('stroke','#2a4a6a')
        s.selectAll('text').attr('fill', adb.muted).attr('font-size',11).attr('dy','1.4em').attr('font-family','"Helvetica Neue",Arial,sans-serif')
      })

    // Country name on second line
    root.selectAll('.lbl2').data(entries).join('text').attr('class','lbl2')
      .attr('x', d => xScale(d.eco)! + xScale.bandwidth() / 2)
      .attr('y', IH + 34).attr('text-anchor','middle')
      .attr('fill','#4a6a88').attr('font-size',9).attr('font-family','"Helvetica Neue",Arial,sans-serif')
      .text(d => (ECO_LABELS[d.eco] ?? '').split(' ')[0])

    // Y unit
    root.append('text')
      .attr('transform',`rotate(-90) translate(${-IH/2},${-46})`)
      .attr('text-anchor','middle').attr('fill', adb.muted).attr('font-size',9)
      .attr('font-family','"Helvetica Neue",Arial,sans-serif').text(unit)

    // Bars — start at height 0, animate up
    root.selectAll('.bar').data(entries).join('rect').attr('class','bar')
      .attr('x', d => xScale(d.eco)!)
      .attr('width', xScale.bandwidth())
      .attr('y', IH)
      .attr('height', 0)
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.85)
      .attr('rx', 3)
      .transition().duration(650).delay((_, i) => i * 60).ease(d3.easeCubicOut)
      .attr('y', d => yScale(d.v))
      .attr('height', d => IH - yScale(d.v))

    // Value labels
    root.selectAll('.vlbl').data(entries).join('text').attr('class','vlbl')
      .attr('x', d => xScale(d.eco)! + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.v) - 6)
      .attr('text-anchor','middle')
      .attr('fill', d => d.color).attr('font-size',11).attr('font-weight',600)
      .attr('font-family','"Helvetica Neue",Arial,sans-serif')
      .attr('opacity', 0)
      .text(d => d.v.toFixed(1))
      .transition().delay(550).duration(200).attr('opacity', 1)

    // Hover overlays
    root.selectAll('.hover-rect').data(entries).join('rect').attr('class','hover-rect')
      .attr('x', d => xScale(d.eco)!).attr('width', xScale.bandwidth())
      .attr('y', 0).attr('height', IH)
      .attr('fill','none').attr('pointer-events','all')
      .on('mousemove', (event, d) => {
        const [px, py] = d3.pointer(event, svgRef.current)
        setTip({ x: px + 10, y: py - 10, eco: d.eco, value: d.v })
      })
      .on('mouseleave', () => setTip(null))

    // Period label
    root.append('text')
      .attr('x', IW).attr('y', -8).attr('text-anchor','end')
      .attr('fill','#2a4a6a').attr('font-size',9)
      .attr('font-family','"Helvetica Neue",Arial,sans-serif')
      .text(`Period: ${period}`)

  }, [data, unit])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      />
      {tip && (
        <div style={{
          position: 'absolute', left: tip.x, top: tip.y,
          pointerEvents: 'none', zIndex: 20,
          background: 'var(--th-chart)', border: `1px solid ${adb.navyBorder}`,
          borderRadius: 5, padding: '8px 12px', fontSize: 11, color: adb.white,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <div style={{ color: adb.muted, fontSize: 10, marginBottom: 4 }}>{ECO_LABELS[tip.eco] ?? tip.eco}</div>
          <div style={{ fontWeight: 600 }}>{tip.value.toFixed(2)} <span style={{ color: adb.muted, fontWeight: 400 }}>{unit}</span></div>
        </div>
      )}
    </div>
  )
}

// ── Legend ─────────────────────────────────────────────────────────────────
export function ChartLegend({ economies }: { economies: string[] }) {
  return (
    <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:10, paddingLeft: M.left }}>
      {economies.map((eco, i) => (
        <div key={eco} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:14, height:3, borderRadius:2, background: SERIES_COLORS[i % SERIES_COLORS.length], display:'inline-block' }} />
          <span style={{ fontSize:11, color:'#7fa8c4' }}>{ECO_LABELS[eco] ?? eco}</span>
        </div>
      ))}
    </div>
  )
}
