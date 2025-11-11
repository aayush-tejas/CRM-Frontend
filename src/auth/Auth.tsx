import { useMemo, useState } from 'react'
import { login, signUp } from './session'

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = message
  el.style.position = 'fixed'
  el.style.right = '16px'
  el.style.bottom = '16px'
  el.style.background = type === 'error' ? '#dc2626' : 'linear-gradient(180deg, var(--brand), var(--brand-700))'
  el.style.color = '#fff'
  el.style.padding = '10px 14px'
  el.style.borderRadius = '10px'
  el.style.boxShadow = '0 4px 14px rgba(17,24,39,0.15)'
  el.style.zIndex = '9999'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2200)
}

export default function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const valid = useMemo(() => {
    const next: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Invalid email'
    if (password.length < 8) next.password = 'Password must be at least 8 characters'
    if (mode === 'signup') {
      if (!name.trim()) next.name = 'Name is required'
      if (confirm !== password) next.confirm = 'Passwords do not match'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }, [email, password, confirm, name, mode])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      setBusy(true)
      await login(email, password)
      showToast('Welcome back!')
      onAuthed()
    } catch (err: any) {
      showToast(err?.message || 'Login failed', 'error')
    } finally { setBusy(false) }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      setBusy(true)
      await signUp(name, email, password)
      showToast('Account created!')
      onAuthed()
    } catch (err: any) {
      showToast(err?.message || 'Sign up failed', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <img src="/logo.png" alt="VTL Logo" />
        <h1>VTL CRM</h1>
        <p className="muted">Manage leads, tickets, and customers</p>
      </div>

      <section className="auth-card card">
        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button>
        </div>

        {mode === 'login' ? (
          <form className="form" onSubmit={handleLogin}>
            <div className="grid one-col">
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                {errors.email && <small id="err-email" className="error-text">{errors.email}</small>}
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'err-password' : undefined} />
                {errors.password && <small id="err-password" className="error-text">{errors.password}</small>}
              </div>
            </div>
            <div className="actions">
              <button type="submit" className="primary" disabled={!valid || busy}>Login</button>
            </div>
            <div className="hint">
              <span>Don’t have an account?</span>
              <button className="link" type="button" onClick={() => setMode('signup')}>Create one</button>
            </div>
          </form>
        ) : (
          <form className="form" onSubmit={handleSignup}>
            <div className="grid one-col">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" value={name} onChange={e => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'err-name' : undefined} />
                {errors.name && <small id="err-name" className="error-text">{errors.name}</small>}
              </div>
              <div className="field">
                <label htmlFor="semail">Email</label>
                <input id="semail" type="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                {errors.email && <small id="err-email" className="error-text">{errors.email}</small>}
              </div>
              <div className="field">
                <label htmlFor="spassword">Password</label>
                <input id="spassword" type="password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'err-password' : undefined} />
                {errors.password && <small id="err-password" className="error-text">{errors.password}</small>}
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm Password</label>
                <input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? 'err-confirm' : undefined} />
                {errors.confirm && <small id="err-confirm" className="error-text">{errors.confirm}</small>}
              </div>
            </div>
            <div className="actions">
              <button type="submit" className="primary" disabled={!valid || busy}>Create account</button>
            </div>
            <div className="hint">
              <span>Already have an account?</span>
              <button className="link" type="button" onClick={() => setMode('login')}>Login</button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
