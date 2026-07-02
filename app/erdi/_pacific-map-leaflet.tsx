'use client'
import { useEffect, useRef, useState } from 'react'
import type { Map as LMap, Marker as LMarker, TileLayer as LTileLayer } from 'leaflet'
import { useIsMobile } from './_use-mobile'

export type MapDot = {
  lat: number; lng: number; color: string; label: string
  name: string; value: string; detail: string; status: string
  flag?: string; code?: string
}

interface Props {
  dots: MapDot[]
  isDark: boolean
  flyTarget?: { lat: number; lng: number; zoom?: number }
}

const DARK_TILE  = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
const LIGHT_TILE = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/" target="_blank">CARTO</a>'

const FLAG_ISO: Record<string, string> = {
  PNG: 'pg', FIJ: 'fj', VAN: 'vu', SOL: 'sb', TON: 'to', SAM: 'ws', KIR: 'ki', TUV: 'tv',
}
function tooltipFlagUrl(code: string | undefined): string {
  if (!code) return ''
  const iso = FLAG_ISO[code]
  return iso ? `https://flagcdn.com/w40/${iso}.png` : ''
}

// Key country statistics for tooltip enrichment
const COUNTRY_STATS: Record<string, { pop: string; area: string; capital: string; currency: string }> = {
  PNG: { pop: '10.3M',  area: '462,840 km²', capital: 'Port Moresby', currency: 'PGK' },
  FIJ: { pop: '930K',   area: '18,270 km²',  capital: 'Suva',          currency: 'FJD' },
  VAN: { pop: '335K',   area: '12,190 km²',  capital: 'Port Vila',     currency: 'VUV' },
  SOL: { pop: '760K',   area: '28,400 km²',  capital: 'Honiara',       currency: 'SBD' },
  TON: { pop: '100K',   area: '720 km²',     capital: 'Nukuʻalofa',    currency: 'TOP' },
  SAM: { pop: '225K',   area: '2,830 km²',   capital: 'Apia',          currency: 'WST' },
  KIR: { pop: '120K',   area: '811 km²',     capital: 'South Tarawa',  currency: 'AUD' },
  TUV: { pop: '11K',    area: '26 km²',      capital: 'Funafuti',      currency: 'AUD' },
}

const PULSE_CSS = `
@keyframes erdiPulse {
  0%   { transform: translate(-50%,-50%) scale(1); opacity:0.55; }
  100% { transform: translate(-50%,-50%) scale(4.5); opacity:0; }
}
.erdi-marker { position:relative; width:70px; height:80px; }
.erdi-ring {
  position:absolute; top:50%; left:50%;
  width:10px; height:10px; border-radius:50%;
  animation: erdiPulse 2.6s ease-out infinite;
  pointer-events:none;
}
.erdi-core {
  position:absolute; top:50%; left:50%;
  width:9px; height:9px; border-radius:50%;
  transform:translate(-50%,-50%);
  border:2px solid rgba(0,0,0,0.22);
  box-shadow:0 0 0 1.5px rgba(255,255,255,0.15);
  z-index:3; cursor:pointer;
  transition: width 0.15s, height 0.15s;
}
.erdi-core:hover { width:13px; height:13px; }
`

function dotIconHtml(dot: MapDot, index: number): string {
  const d1 = (index * 0.42).toFixed(2)
  const d2 = (index * 0.42 + 0.9).toFixed(2)
  const flagDiv = ''
  const labelDiv = `<div style="position:absolute;top:calc(50% + 8px);left:50%;transform:translateX(-50%);font-size:8.5px;letter-spacing:0.06em;font-weight:600;white-space:nowrap;color:${dot.color};pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,0.7)">${dot.label}</div>`
  return `
    <div class="erdi-marker">
      ${flagDiv}
      <div class="erdi-ring" style="background:${dot.color};animation-delay:${d1}s"></div>
      <div class="erdi-ring" style="background:${dot.color};animation-delay:${d2}s;opacity:0.35"></div>
      <div class="erdi-core" style="background:${dot.color}"></div>
      ${labelDiv}
    </div>
  `
}

export default function PacificMapLeaflet({ dots, isDark, flyTarget }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const tileRef      = useRef<LTileLayer | null>(null)
  const markersRef   = useRef<LMarker[]>([])
  const dotsRef      = useRef<MapDot[]>(dots)
  dotsRef.current    = dots

  const pacificBoundsRef = useRef<[number, number][]>([])
  const isMobile = useIsMobile()
  const [tooltip, setTooltip] = useState<{ dot: MapDot; x: number; y: number } | null>(null)

  function resetView() {
    const map = mapRef.current
    if (!map || pacificBoundsRef.current.length === 0) return
    import('leaflet').then(({ default: L }) => {
      const bounds = L.latLngBounds(pacificBoundsRef.current as [number, number][])
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 6, animate: true })
    })
  }

  /* ── Bootstrap (once) ───────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return
    if (!document.getElementById('erdi-pulse-css')) {
      const s = document.createElement('style')
      s.id = 'erdi-pulse-css'
      s.textContent = PULSE_CSS
      document.head.appendChild(s)
    }
    Promise.all([
      import('leaflet'),
      import('leaflet/dist/leaflet.css' as never) as Promise<unknown>,
    ]).then(([{ default: L }]) => {
      if (!containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current, {
        center: [-12, 168], zoom: 4, minZoom: 2, maxZoom: 18,
        zoomControl: false, attributionControl: true, scrollWheelZoom: true,
      })
      L.control.zoom({ position: 'topright' }).addTo(map)
      mapRef.current = map
      const tile = L.tileLayer(isDark ? DARK_TILE : LIGHT_TILE, { attribution: ATTRIBUTION, subdomains: 'abcd', maxZoom: 19 })
      tile.addTo(map)
      tileRef.current = tile
      const current = dotsRef.current
      current.forEach((dot, i) => {
        const icon = L.divIcon({ className: '', iconSize: [70, 80], iconAnchor: [35, 40], html: dotIconHtml(dot, i) })
        const m = L.marker([dot.lat, dot.lng], { icon, zIndexOffset: 100 })
        m.on('mouseover', () => { const pt = map.latLngToContainerPoint([dot.lat, dot.lng]); setTooltip({ dot, x: pt.x, y: pt.y }) })
        m.on('mouseout', () => setTooltip(null))
        m.addTo(map)
        markersRef.current.push(m)
      })
      if (current.length > 0) {
        const pairs = current.map(d => [d.lat, d.lng] as [number, number])
        pacificBoundsRef.current = pairs
        map.fitBounds(L.latLngBounds(pairs), { padding: [44, 44], maxZoom: 6 })
      }
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Swap tile on theme change ──────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    import('leaflet').then(({ default: L }) => {
      if (tileRef.current) map.removeLayer(tileRef.current)
      const tile = L.tileLayer(isDark ? DARK_TILE : LIGHT_TILE, { attribution: ATTRIBUTION, subdomains: 'abcd', maxZoom: 19 })
      tile.addTo(map); tileRef.current = tile
    })
  }, [isDark])

  /* ── Refresh markers when dots change ───────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    import('leaflet').then(({ default: L }) => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      dots.forEach((dot, i) => {
        const icon = L.divIcon({ className: '', iconSize: [70, 80], iconAnchor: [35, 40], html: dotIconHtml(dot, i) })
        const m = L.marker([dot.lat, dot.lng], { icon, zIndexOffset: 100 })
        m.on('mouseover', () => { const pt = map.latLngToContainerPoint([dot.lat, dot.lng]); setTooltip({ dot, x: pt.x, y: pt.y }) })
        m.on('mouseout', () => setTooltip(null))
        m.addTo(map)
        markersRef.current.push(m)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dots])

  /* ── Fly to country when side panel card clicked ────────────────────── */
  useEffect(() => {
    if (!flyTarget || !mapRef.current) return
    mapRef.current.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom ?? 7, { animate: true, duration: 0.9 })
  }, [flyTarget])

  const stats = tooltip?.dot.code ? COUNTRY_STATS[tooltip.dot.code] : undefined

  return (
    <div style={{ position: 'relative', lineHeight: 0, isolation: 'isolate' }}>
      <div ref={containerRef} style={{ height: 350, borderRadius: 6, overflow: 'hidden', background: isDark ? '#071828' : '#e8ecf0' }} />

      {/* Reset to Pacific view */}
      <button onClick={resetView} title="Reset view to Pacific Islands" style={{
        position: 'absolute', bottom: 28, left: 10, zIndex: 500,
        background: 'var(--th-card)', border: '1px solid var(--th-border)',
        borderRadius: 4, padding: '5px 11px', fontSize: 11, fontWeight: 500,
        color: 'var(--th-text)', cursor: 'pointer',
        boxShadow: '0 1px 5px rgba(0,0,0,0.35)', fontFamily: '"Helvetica Neue",Arial,sans-serif',
        display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = '#007DB722')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--th-card)')}
      >
        <span style={{ fontSize: 13 }}>⌂</span> Pacific Islands
      </button>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: isMobile ? 4 : Math.min(tooltip.x + 20, 220),
          top: Math.max(tooltip.y - 120, 4),
          pointerEvents: 'none', zIndex: 1000,
          background: 'var(--th-card)',
          border: `1px solid var(--th-border)`,
          borderLeft: `4px solid ${tooltip.dot.color}`,
          borderRadius: 8, padding: '12px 16px',
          minWidth: 200, maxWidth: isMobile ? 'calc(100vw - 40px)' : 280,
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          fontFamily: '"Helvetica Neue",Arial,sans-serif',
        }}>
          {/* Country name + flag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats ? 10 : 0 }}>
            {tooltipFlagUrl(tooltip.dot.code) && (
              <div style={{ width: 26, height: 19, flexShrink: 0, borderRadius: 2, backgroundImage: `url('${tooltipFlagUrl(tooltip.dot.code)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--th-text)' }}>{tooltip.dot.name}</span>
          </div>

          {/* Country stats */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 7, columnGap: 14 }}>
              {[
                { label: 'Population', value: stats.pop },
                { label: 'Area',       value: stats.area },
                { label: 'Capital',    value: stats.capital },
                { label: 'Currency',   value: stats.currency },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 9, color: 'var(--th-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--th-text)', lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
