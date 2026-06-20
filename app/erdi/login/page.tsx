'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const FONT = '"Ideal Sans","Helvetica Neue",Arial,sans-serif'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('erdi_auth')) {
      router.replace('/erdi')
    }
  }, [router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please enter your username and password.')
      return
    }
    setLoading(true)
    setError('')
    // Simulated auth delay
    setTimeout(() => {
      if (username.trim() === 'test' && password === 'test123') {
        sessionStorage.setItem('erdi_auth', 'true')
        router.push('/erdi')
      } else {
        setError('Incorrect username or password. Please try again.')
        setLoading(false)
      }
    }, 700)
  }

  const fieldBorder = error ? '#E9532B' : '#1e3f5c'

  return (
    <div style={{
      minHeight: '100vh', background: '#081929',
      display: 'flex', alignItems: 'stretch',
      fontFamily: FONT,
    }}>
      {/* ── Left brand panel ─────────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 420px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 44px',
        background: 'linear-gradient(160deg, #00256C 0%, #003a8c 50%, #00256C 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background grid lines */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07 }}
          viewBox="0 0 420 800" preserveAspectRatio="xMidYMid slice">
          {[0,60,120,180,240,300,360,420].map(x => (
            <line key={x} x1={x} y1={0} x2={x} y2={800} stroke="white" strokeWidth={0.8}/>
          ))}
          {[0,80,160,240,320,400,480,560,640,720,800].map(y => (
            <line key={y} x1={0} y1={y} x2={420} y2={y} stroke="white" strokeWidth={0.8}/>
          ))}
          <circle cx="80" cy="580" r="200" stroke="white" strokeWidth={0.6} fill="none" opacity={0.5}/>
          <circle cx="380" cy="200" r="150" stroke="white" strokeWidth={0.5} fill="none" opacity={0.4}/>
        </svg>

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/adb-logo.svg" alt="Asian Development Bank"
            style={{ height: 52, marginBottom: 32 }}/>
          <div style={{ width: 36, height: 3, background: '#007DB7', marginBottom: 20, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 300, color: '#fff', lineHeight: 1.3 }}>
            ERDI<br/>Intelligence Hub
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
            Economic Research &amp; Development Impact
          </p>
        </div>

        {/* Stats row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Economies tracked',    value: '49' },
            { label: 'KIDB indicators',      value: '200+' },
            { label: 'Years of data',        value: '2000–2024' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>{s.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#68C5EA' }}>{s.value}</span>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
            Restricted access. For authorised ADB personnel<br/>and approved partner institutions only.
          </p>
        </div>
      </div>

      {/* ── Right login panel ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
        background: '#0d1e30',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 400, color: '#fff' }}>Sign in</h2>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: '#7fa8c4' }}>
            Use your ERDI Hub credentials to continue.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Username */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#7fa8c4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Username
              </label>
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setError('') }}
                autoComplete="username"
                disabled={loading}
                placeholder="Enter your username"
                style={{
                  background: '#071828', border: `1px solid ${fieldBorder}`,
                  borderRadius: 5, padding: '11px 14px',
                  color: '#fff', fontSize: 13, fontFamily: FONT,
                  outline: 'none', width: '100%', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#007DB7')}
                onBlur={e => (e.target.style.borderColor = error ? '#E9532B' : '#1e3f5c')}
              />
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#7fa8c4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password"
                  disabled={loading}
                  placeholder="Enter your password"
                  style={{
                    background: '#071828', border: `1px solid ${fieldBorder}`,
                    borderRadius: 5, padding: '11px 40px 11px 14px',
                    color: '#fff', fontSize: 13, fontFamily: FONT,
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#007DB7')}
                  onBlur={e => (e.target.style.borderColor = error ? '#E9532B' : '#1e3f5c')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#7fa8c4', fontSize: 13, padding: 0,
                  }}
                >{showPw ? '🙈' : '👁'}</button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 12, color: '#E9532B', padding: '9px 12px',
                background: '#E9532B11', borderRadius: 4, border: '1px solid #E9532B33',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <span style={{ fontSize: 14 }}>⚠</span> {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '12px 0',
                background: loading ? '#1e3f5c' : '#007DB7',
                border: 'none', borderRadius: 5,
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: loading ? 'default' : 'pointer',
                fontFamily: FONT, letterSpacing: '0.02em',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#0071a8' }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#007DB7' }}
            >
              {loading
                ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Signing in…
                  </span>
                : 'Sign In →'
              }
            </button>
          </form>

          <p style={{ marginTop: 24, fontSize: 10, color: '#4a6885', lineHeight: 1.7, textAlign: 'center' }}>
            © {new Date().getFullYear()} Asian Development Bank · All rights reserved<br/>
            Problems signing in? Contact your system administrator.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #2a4a65; }
      `}</style>
    </div>
  )
}
