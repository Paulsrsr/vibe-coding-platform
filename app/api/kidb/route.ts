import { NextRequest, NextResponse } from 'next/server'

// SDMX REST v3 base — https://kidb.adb.org/api
const KIDB_BASE = 'https://kidb.adb.org/api/v3/sdmx/data'

// ADB economy codes (non-ISO, from CL_ECONOMY_CODES)
export const ECONOMIES: Record<string, string> = {
  // Pacific
  PNG: 'Papua New Guinea', FIJ: 'Fiji',   VAN: 'Vanuatu',
  SOL: 'Solomon Islands',  TON: 'Tonga',  SAM: 'Samoa',
  COO: 'Cook Islands',     KIR: 'Kiribati', MHL: 'Marshall Islands',
  FSM: 'Micronesia, Fed. States of', NAU: 'Nauru', PAL: 'Palau', TUV: 'Tuvalu',
  NZL: 'New Zealand',      AUS: 'Australia',
  PA:  'Pacific',
  // South Asia
  AFG: 'Afghanistan', BAN: 'Bangladesh',  BHU: 'Bhutan',
  IND: 'India',       MLD: 'Maldives',    NEP: 'Nepal',
  PAK: 'Pakistan',    SRI: 'Sri Lanka',
  // Southeast Asia
  BRU: 'Brunei Darussalam', CAM: 'Cambodia', INO: 'Indonesia',
  LAO: 'Lao PDR',           MAL: 'Malaysia',  MYA: 'Myanmar',
  PHI: 'Philippines',        SIN: 'Singapore', THA: 'Thailand',
  TIM: 'Timor-Leste',        VIE: 'Viet Nam',
  // East Asia
  PRC: "China, People's Rep. of", HKG: 'Hong Kong, China',
  JPN: 'Japan',               KOR: 'Korea, Republic of',
  MON: 'Mongolia',
  // Central and West Asia
  ARM: 'Armenia',  AZE: 'Azerbaijan', GEO: 'Georgia',
  KAZ: 'Kazakhstan', KGZ: 'Kyrgyz Republic',
  TAJ: 'Tajikistan', UZB: 'Uzbekistan',
}

// KIDB dataflows
export const FLOWS = {
  PPL: 'PPL', MFP: 'MFP', GLB: 'GLB', ENV: 'ENV', SDG: 'SDG',
} as const

// Confirmed indicator codes from CL_KIDB_INDICATORS
export const INDICATORS = {
  GDP_GROWTH:   { code: 'NGDP_R_PTX_PS',    flow: FLOWS.PPL, label: 'Real GDP Growth',               unit: '% chg' },
  GDP_PC:       { code: 'NGDPPC_XDC',        flow: FLOWS.PPL, label: 'GDP per Capita',                unit: 'USD' },
  CONSUMPTION:  { code: 'NC_HFC_PTX_PS',     flow: FLOWS.PPL, label: 'Household Consumption Growth',  unit: '% chg' },
  UNEMPLOYMENT: { code: 'LUR_PT',            flow: FLOWS.PPL, label: 'Unemployment Rate',             unit: '%' },
  CPI:          { code: 'PCPI_PC_PP_PT',     flow: FLOWS.MFP, label: 'Consumer Price Inflation',      unit: '% chg' },
  EXCHANGE_RATE:{ code: 'ENDE_XDC_USD_RATE', flow: FLOWS.MFP, label: 'Exchange Rate',                 unit: 'LCU/USD' },
  M2_GROWTH:    { code: 'FM_LBL_MONY_GD_ZS', flow: FLOWS.MFP, label: 'M2 Money Supply Growth',       unit: '%' },
  REMITTANCES:  { code: 'BX_TRF_PWKR_CD_DT', flow: FLOWS.GLB, label: 'Remittance Inflows',           unit: 'USD mn' },
  FDI:          { code: 'BX_KLT_DINV_CD_WD', flow: FLOWS.GLB, label: 'FDI Inflows',                  unit: 'USD mn' },
  CURRENT_ACCT: { code: 'BN_CAB_XOKA_GD_ZS', flow: FLOWS.GLB, label: 'Current Account Balance',      unit: '% GDP' },
  DEBT_GDP:     { code: 'GC_DOD_TOTL_GD_ZS', flow: FLOWS.GLB, label: 'Government Debt / GDP',        unit: '%' },
}

function buildKey(freq: string, indicator: string, economies: string[]) {
  return `${freq}.${indicator}.${economies.join('+')}`
}

function parseSdmxJson(sdmx: any): Array<{ economy: string; period: string; value: number | null }> {
  const results: Array<{ economy: string; period: string; value: number | null }> = []
  try {
    const ds = sdmx?.data?.dataSets?.[0]
    const dims = sdmx?.data?.structure?.dimensions
    const seriesDims = dims?.series ?? []
    const obsDims = dims?.observation ?? []
    const timeDim = obsDims.find((d: any) => d.id === 'TIME_PERIOD')
    const econDim = seriesDims.find((d: any) => d.id === 'ECONOMY_CODE')
    if (!ds || !timeDim || !econDim) return results
    for (const [seriesKey, seriesData] of Object.entries(ds.series ?? {})) {
      const parts = seriesKey.split(':')
      const econIdx = seriesDims.indexOf(econDim)
      const economy = econDim.values[Number(parts[econIdx])]?.id ?? ''
      for (const [obsKey, obsArr] of Object.entries((seriesData as any).observations ?? {})) {
        const period = timeDim.values[Number(obsKey)]?.id ?? ''
        const value = (obsArr as any[])[0]
        results.push({ economy, period, value: value ?? null })
      }
    }
  } catch { /* parse failed */ }
  return results
}

// Build a 6-year time series (2019–2024) for one economy
type Obs = { economy: string; period: string; value: number | null }
function ts(economy: string, vals: (number | null)[]): Obs[] {
  return vals.map((v, i) => ({ economy, period: String(2019 + i), value: v }))
}

// Schema-compliant mock data with multi-year time series so line charts render properly
const MOCK: Record<string, Obs[]> = {
  // ── Real GDP Growth (% chg) ─────────────────────────────────────────────
  NGDP_R_PTX_PS: [
    ...ts('PNG', [6.5, -3.3, 1.4, 5.2, 4.8, 4.3]),
    ...ts('FIJ', [1.4, -15.2, -4.4, 15.4, 8.0, 3.2]),
    ...ts('VAN', [3.0, -5.0, 0.6, 1.9, 2.4, -1.1]),
    ...ts('SOL', [1.3, -3.5, 0.8, 4.2, 3.4, 2.8]),
    ...ts('TON', [0.7, 0.5, -2.7, -1.0, 1.9, 1.5]),
    ...ts('SAM', [3.7, -3.1, -7.1, -6.0, 7.9, 2.1]),
    ...ts('IND', [6.4, -6.6, 8.7, 7.0, 8.2, 6.8]),
    ...ts('PRC', [5.9, 2.2, 8.1, 3.0, 5.2, 4.8]),
    ...ts('INO', [5.0, -2.1, 3.7, 5.3, 5.0, 4.9]),
    ...ts('PHI', [6.0, -9.6, 5.7, 7.6, 5.5, 5.7]),
    ...ts('VIE', [7.0, 2.9, 2.6, 8.0, 5.1, 6.4]),
    ...ts('THA', [2.1, -6.2, 1.5, 2.5, 1.9, 2.8]),
    ...ts('BAN', [8.2, 3.5, 6.9, 7.1, 5.8, 5.4]),
    ...ts('PAK', [3.3, -0.5, 5.7, 6.2, -0.2, 2.4]),
    ...ts('KOR', [2.0, -0.7, 4.3, 2.6, 1.4, 2.3]),
    ...ts('MAL', [4.3, -5.6, 3.3, 8.7, 3.6, 4.4]),
    ...ts('MON', [5.1, -4.6, 1.6, 5.0, 7.0, 5.1]),
    ...ts('KAZ', [4.5, -2.6, 4.0, 3.3, 5.1, 4.7]),
    ...ts('UZB', [5.9, 1.9, 7.4, 5.7, 6.3, 6.0]),
    ...ts('GEO', [5.1, -6.8, 10.4, 11.0, 7.5, 9.4]),
    ...ts('ARM', [7.6, -7.4, 5.7, 12.6, 8.7, 5.3]),
  ],

  // ── GDP per Capita (USD) ─────────────────────────────────────────────────
  NGDPPC_XDC: [
    ...ts('PNG', [2750, 2580, 2620, 2780, 2900, 2980]),
    ...ts('FIJ', [5800, 4900, 4700, 5800, 6400, 6820]),
    ...ts('VAN', [2760, 2580, 2530, 2600, 2720, 2840]),
    ...ts('SOL', [2050, 1970, 1990, 2090, 2150, 2210]),
    ...ts('TON', [5200, 5100, 4980, 5100, 5350, 5540]),
    ...ts('SAM', [4100, 3950, 3700, 3800, 4100, 4320]),
    ...ts('IND', [2100, 1900, 2190, 2350, 2500, 2730]),
    ...ts('PRC', [10200, 10500, 12300, 12800, 13100, 13700]),
    ...ts('INO', [4170, 3870, 4350, 4790, 4900, 5100]),
    ...ts('PHI', [3300, 3030, 3520, 3600, 3700, 3850]),
    ...ts('VIE', [2760, 2780, 3570, 4160, 4340, 4620]),
    ...ts('THA', [7910, 7390, 7320, 7900, 7750, 7960]),
    ...ts('BAN', [1870, 2020, 2360, 2650, 2780, 2900]),
    ...ts('PAK', [1285, 1191, 1471, 1539, 1570, 1680]),
    ...ts('KOR', [32000, 31400, 35100, 34000, 33000, 34200]),
    ...ts('MAL', [11180, 10010, 11550, 13070, 13400, 14100]),
    ...ts('KAZ', [9780, 8850, 9240, 9870, 10470, 11900]),
    ...ts('UZB', [1720, 1680, 1990, 2150, 2240, 2390]),
    ...ts('MON', [3700, 3500, 3990, 4330, 4600, 4890]),
  ],

  // ── Household Consumption Growth (% chg) ─────────────────────────────────
  NC_HFC_PTX_PS: [
    ...ts('PNG', [3.2, -2.8, 1.1, 3.5, 2.9, 2.4]),
    ...ts('FIJ', [3.7, -8.4, -2.6, 12.1, 5.8, 2.2]),
    ...ts('VAN', [2.4, -3.8, 0.4, 1.5, 1.7, 1.0]),
    ...ts('SOL', [1.8, -2.3, 0.5, 3.1, 2.3, 1.8]),
    ...ts('TON', [2.1, 0.8, -1.2, 0.5, 1.4, 1.2]),
    ...ts('SAM', [3.0, -2.0, -5.4, -3.5, 5.6, 1.9]),
    ...ts('IND', [5.8, -5.4, 6.9, 7.3, 4.9, 6.2]),
    ...ts('PRC', [8.4, -3.9, 12.5, 0.9, 7.2, 5.8]),
    ...ts('INO', [5.0, -2.6, 2.0, 4.9, 4.8, 4.9]),
    ...ts('PHI', [5.7, -7.9, 4.2, 8.3, 7.1, 6.0]),
    ...ts('VIE', [7.3, 0.7, 3.0, 7.7, 6.5, 6.8]),
    ...ts('THA', [4.5, -1.0, 0.3, 5.2, 5.7, 4.8]),
  ],

  // ── Unemployment Rate (%) ──────────────────────────────────────────────
  LUR_PT: [
    ...ts('PNG', [3.0, 4.1, 4.5, 3.8, 3.5, 3.3]),
    ...ts('FIJ', [4.5, 7.2, 7.8, 5.6, 4.4, 3.8]),
    ...ts('VAN', [4.2, 5.0, 5.3, 4.7, 4.3, 4.1]),
    ...ts('SOL', [2.8, 3.5, 3.8, 3.2, 3.0, 2.9]),
    ...ts('TON', [1.8, 2.3, 2.5, 2.1, 1.9, 1.8]),
    ...ts('SAM', [7.4, 8.1, 8.5, 7.8, 7.2, 7.0]),
    ...ts('IND', [5.8, 7.1, 6.0, 4.1, 3.2, 3.5]),
    ...ts('INO', [5.1, 7.1, 6.5, 5.9, 5.3, 4.9]),
    ...ts('PHI', [5.1, 10.4, 7.8, 5.4, 4.3, 3.9]),
    ...ts('VIE', [2.0, 2.4, 3.2, 2.4, 2.3, 2.2]),
    ...ts('THA', [1.0, 1.9, 1.5, 1.2, 1.1, 1.0]),
    ...ts('MAL', [3.3, 4.5, 4.6, 3.8, 3.4, 3.2]),
    ...ts('BAN', [4.2, 5.3, 5.2, 4.7, 4.5, 4.4]),
    ...ts('PAK', [4.4, 4.6, 6.3, 6.2, 6.3, 6.0]),
    ...ts('KOR', [3.8, 4.0, 3.7, 2.9, 2.7, 2.8]),
    ...ts('PRC', [5.2, 5.6, 5.1, 5.5, 5.2, 5.1]),
  ],

  // ── CPI Inflation (% chg) ──────────────────────────────────────────────
  PCPI_PC_PP_PT: [
    ...ts('FIJ', [3.4, -2.6, 0.2, 4.5, 4.0, 6.5]),
    ...ts('PNG', [3.8, 4.9, 4.5, 5.0, 5.2, 5.1]),
    ...ts('TON', [3.3, 0.0, 0.7, 7.4, 6.4, 4.2]),
    ...ts('SOL', [1.3, 3.0, -0.1, 5.5, 4.0, 3.8]),
    ...ts('VAN', [2.7, 5.3, 2.3, 6.7, 4.0, 3.2]),
    ...ts('SAM', [2.2, 1.5, 3.0, 9.4, 6.6, 2.9]),
    ...ts('IND', [3.7, 6.2, 5.5, 6.7, 5.4, 4.8]),
    ...ts('PRC', [2.9, 2.5, 0.9, 2.0, 0.2, 0.5]),
    ...ts('INO', [2.8, 2.0, 1.6, 4.2, 3.7, 2.5]),
    ...ts('PHI', [2.5, 2.6, 3.9, 5.8, 6.0, 3.2]),
    ...ts('VIE', [2.8, 3.2, 1.8, 3.2, 3.3, 3.6]),
    ...ts('THA', [0.7, -0.8, 1.2, 6.1, 1.2, 0.9]),
    ...ts('BAN', [5.5, 5.7, 5.6, 6.2, 9.4, 9.7]),
    ...ts('PAK', [6.7, 10.7, 8.9, 12.2, 29.2, 23.4]),
    ...ts('KOR', [0.4, 0.5, 2.5, 5.1, 3.6, 2.3]),
    ...ts('MAL', [0.7, -1.1, 2.5, 3.4, 2.5, 1.8]),
    ...ts('KAZ', [5.2, 6.8, 8.0, 15.0, 14.7, 8.6]),
    ...ts('UZB', [15.2, 12.9, 11.0, 11.4, 11.5, 10.0]),
    ...ts('MON', [7.3, 3.7, 7.1, 15.2, 10.4, 7.8]),
  ],

  // ── Exchange Rate (LCU / USD) ──────────────────────────────────────────
  ENDE_XDC_USD_RATE: [
    ...ts('PNG', [3.45, 3.52, 3.57, 3.71, 3.82, 3.87]),
    ...ts('FIJ', [2.12, 2.15, 2.11, 2.18, 2.24, 2.28]),
    ...ts('VAN', [110.2, 113.5, 116.2, 118.7, 121.4, 123.6]),
    ...ts('TON', [2.24, 2.28, 2.29, 2.34, 2.37, 2.40]),
    ...ts('SAM', [2.64, 2.68, 2.71, 2.76, 2.78, 2.80]),
    ...ts('INO', [14050, 14100, 14300, 14900, 15240, 15700]),
    ...ts('PHI', [51.8, 49.6, 49.3, 55.0, 56.0, 57.8]),
    ...ts('VIE', [23200, 23210, 22920, 23150, 23830, 25100]),
    ...ts('THA', [30.9, 31.3, 31.9, 35.0, 35.1, 33.8]),
    ...ts('MAL', [4.14, 4.20, 4.15, 4.40, 4.69, 4.48]),
    ...ts('BAN', [84.4, 84.9, 85.1, 91.8, 106.7, 110.0]),
    ...ts('PAK', [150.0, 161.0, 176.0, 220.0, 284.0, 280.0]),
    ...ts('KAZ', [382, 412, 425, 432, 455, 450]),
    ...ts('UZB', [9650, 10600, 10600, 11050, 11350, 12600]),
  ],

  // ── M2 Money Supply Growth (%) ────────────────────────────────────────
  FM_LBL_MONY_GD_ZS: [
    ...ts('PNG', [8.2, 10.5, 9.3, 7.8, 7.4, 6.9]),
    ...ts('FIJ', [7.8, 9.4, 8.7, 9.1, 8.4, 7.6]),
    ...ts('SOL', [6.5, 12.3, 10.7, 8.9, 8.6, 8.3]),
    ...ts('TON', [5.8, 7.9, 8.2, 7.5, 7.2, 6.8]),
    ...ts('VAN', [5.2, 8.4, 6.9, 6.1, 5.8, 5.4]),
    ...ts('SAM', [6.2, 8.6, 11.2, 9.4, 8.1, 7.3]),
    ...ts('IND', [10.4, 12.2, 8.7, 9.0, 10.4, 8.6]),
    ...ts('PRC', [8.4, 10.1, 9.0, 11.8, 9.7, 7.0]),
    ...ts('INO', [6.1, 12.4, 13.9, 8.5, 3.8, 7.5]),
    ...ts('VIE', [14.5, 14.5, 13.8, 11.5, 10.1, 11.3]),
    ...ts('PHI', [11.0, 9.3, 8.8, 7.8, 7.9, 7.5]),
    ...ts('THA', [4.2, 9.8, 3.8, 3.0, 1.4, 2.5]),
  ],

  // ── Government Debt / GDP (%) ──────────────────────────────────────────
  GC_DOD_TOTL_GD_ZS: [
    ...ts('VAN', [45, 72, 88, 86, 87, 85]),
    ...ts('TON', [49, 57, 62, 66, 67, 68]),
    ...ts('FIJ', [46, 66, 71, 63, 57, 55]),
    ...ts('SOL', [8, 22, 34, 43, 49, 54]),
    ...ts('SAM', [50, 56, 56, 52, 51, 52]),
    ...ts('PNG', [35, 40, 43, 39, 36, 35]),
    ...ts('IND', [75, 89, 83, 81, 81, 82]),
    ...ts('PRC', [51, 62, 68, 71, 77, 84]),
    ...ts('INO', [30, 40, 41, 40, 39, 38]),
    ...ts('PHI', [42, 54, 60, 57, 56, 59]),
    ...ts('VIE', [55, 55, 43, 38, 37, 36]),
    ...ts('THA', [42, 49, 58, 61, 62, 61]),
    ...ts('BAN', [35, 39, 40, 39, 39, 41]),
    ...ts('PAK', [87, 87, 79, 77, 77, 73]),
    ...ts('KOR', [37, 48, 51, 49, 47, 46]),
    ...ts('MAL', [57, 68, 67, 66, 66, 64]),
    ...ts('KAZ', [19, 26, 28, 25, 23, 22]),
    ...ts('MON', [75, 75, 77, 70, 67, 64]),
  ],

  // ── Remittances (USD mn) ───────────────────────────────────────────────
  BX_TRF_PWKR_CD_DT: [
    ...ts('TON', [215, 243, 281, 348, 390, 410]),
    ...ts('SAM', [178, 196, 243, 311, 355, 380]),
    ...ts('FIJ', [220, 240, 270, 310, 340, 360]),
    ...ts('PNG', [80, 90, 100, 115, 125, 130]),
    ...ts('VAN', [25, 28, 35, 42, 48, 52]),
    ...ts('SOL', [10, 12, 15, 19, 23, 26]),
    ...ts('PHI', [33480, 33195, 31419, 36140, 37213, 38000]),
    ...ts('BAN', [18318, 21941, 22078, 21031, 21920, 22500]),
    ...ts('PAK', [22250, 23131, 29450, 31276, 26994, 27000]),
    ...ts('IND', [83129, 83149, 87000, 100000, 111220, 120000]),
    ...ts('VIE', [16700, 17200, 18000, 19270, 14000, 16500]),
    ...ts('NEP', [7950, 7990, 8175, 9350, 9288, 9700]),
    ...ts('SRI', [6720, 7090, 5940, 4210, 3200, 4900]),
    ...ts('INO', [11000, 9920, 9680, 9986, 9450, 10200]),
    ...ts('THA', [7240, 7300, 8520, 7640, 8200, 8100]),
    ...ts('KAZ', [315, 254, 392, 645, 1140, 1200]),
  ],

  // ── FDI Inflows (USD mn) ───────────────────────────────────────────────
  BX_KLT_DINV_CD_WD: [
    ...ts('PNG', [280, 148, 195, 256, 318, 340]),
    ...ts('FIJ', [183, 87, 110, 195, 248, 272]),
    ...ts('SOL', [24, 12, 18, 28, 35, 38]),
    ...ts('VAN', [87, 42, 58, 74, 89, 96]),
    ...ts('TON', [18, 9, 12, 16, 20, 22]),
    ...ts('SAM', [31, 15, 20, 28, 34, 37]),
    ...ts('IND', [50556, 64072, 82000, 55272, 71400, 44600]),
    ...ts('PRC', [141225, 212956, 334000, 180060, 33000, 28000]),
    ...ts('INO', [23000, 19246, 19156, 21975, 22022, 24000]),
    ...ts('VIE', [16120, 15804, 15650, 17900, 18460, 17671]),
    ...ts('PHI', [8690, 6540, 10520, 9100, 8680, 8500]),
    ...ts('THA', [4903, 6447, 11371, 10718, 9100, 8800]),
    ...ts('MAL', [8155, 3279, 6490, 14965, 17040, 19200]),
    ...ts('KOR', [10609, 8984, 16030, 17460, 12870, 18000]),
    ...ts('BAN', [1596, 2091, 2893, 3481, 3249, 3500]),
    ...ts('KAZ', [9847, 16714, 13800, 23600, 11600, 12000]),
  ],

  // ── Current Account Balance (% GDP) ───────────────────────────────────
  BN_CAB_XOKA_GD_ZS: [
    ...ts('FIJ', [-9.4, -17.8, -16.2, -11.8, -9.6, -8.2]),
    ...ts('PNG', [12.4, 11.2, 13.8, 16.5, 14.2, 13.1]),
    ...ts('TON', [-6.1, -1.8, -0.4, -0.8, -2.4, -3.0]),
    ...ts('SAM', [0.9, 5.1, 5.2, 2.8, 1.4, 0.5]),
    ...ts('VAN', [-10.9, -13.2, -12.5, -10.8, -9.4, -8.9]),
    ...ts('SOL', [-6.2, -5.8, -7.3, -6.5, -6.1, -5.8]),
    ...ts('IND', [-0.9, 0.9, -1.2, -2.0, -1.9, -1.1]),
    ...ts('PRC', [0.7, 1.7, 1.8, 2.3, 1.3, 2.2]),
    ...ts('INO', [-2.7, -0.4, 0.3, 1.0, -1.6, -0.7]),
    ...ts('PHI', [-0.8, 3.2, -1.5, -4.5, -3.4, -3.0]),
    ...ts('VIE', [3.8, 4.6, -0.2, -1.2, 5.8, 4.7]),
    ...ts('THA', [7.0, 4.0, -2.2, 1.5, 1.6, 2.5]),
    ...ts('KOR', [3.6, 4.6, 4.9, 2.4, 2.7, 3.0]),
    ...ts('MAL', [3.4, 4.2, 3.6, 3.1, 2.6, 2.8]),
    ...ts('BAN', [-1.8, -1.7, -1.0, -3.3, -0.7, -0.4]),
    ...ts('PAK', [-4.8, -1.7, -0.8, -4.6, 0.4, -1.0]),
  ],
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const flow      = p.get('flow')        ?? 'PPL'
  const indicator = p.get('indicator')   ?? 'NGDP_R_PTX_PS'
  // split on + or space — browsers decode + as space in query strings
  const economies = (p.get('economies')  ?? 'PNG+FIJ+VAN+SOL+TON+SAM').split(/[+\s]+/).filter(Boolean)
  const freq      = p.get('freq')        ?? 'A'
  const start     = p.get('start')       ?? '2019'
  const end       = p.get('end')         ?? '2024'

  const key = buildKey(freq, indicator, economies)
  const url = `${KIDB_BASE}/${flow}/${key}?startPeriod=${start}&endPeriod=${end}`

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.sdmx.data+json;version=2.0',
        Cookie: req.headers.get('cookie') ?? '',
      },
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const sdmx = await res.json()
      const series = parseSdmxJson(sdmx)
      if (series.length > 0) return NextResponse.json({ source: 'live', indicator, series })
    }
  } catch { /* fall through to mock */ }

  const allMock = MOCK[indicator] ?? []
  const startY = parseInt(start), endY = parseInt(end)

  // Filter by requested economies and time range
  let series = allMock.filter(
    d => economies.includes(d.economy) &&
         parseInt(d.period) >= startY &&
         parseInt(d.period) <= endY
  )

  // If no data for these specific economies, return all available for this indicator
  if (series.length === 0) {
    series = allMock.filter(
      d => parseInt(d.period) >= startY && parseInt(d.period) <= endY
    )
  }

  return NextResponse.json({ source: 'mock', indicator, series })
}
