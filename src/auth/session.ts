export type Role = 'admin' | 'manager' | 'agent' | 'viewer'
export type Session = { token: string; userId: string; email: string; name?: string; role: Role }
export type User = { id: string; email: string; emailLower: string; name?: string; passwordHash: string; salt: string; createdAt: string }

const SESSION_KEY = 'crm:session'
const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:4000'

function randomId() { return Math.random().toString(36).slice(2) }

function b64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary)
}

export async function sha256(input: string) {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return b64(hash)
}

// Legacy localStorage functions (kept for backward compatibility)
export function getUsers(): User[] {
  try { return JSON.parse(localStorage.getItem('crm:users') || '[]') } catch { return [] }
}
export function saveUsers(list: User[]) {
  localStorage.setItem('crm:users', JSON.stringify(list))
}

// Create a demo user for quick testing (no auto-login)
export async function ensureDemoUser() {
  const DEMO_EMAIL = 'demo@vtl.com'
  const DEMO_NAME = 'Demo User'
  const DEMO_PASSWORD = 'VTLdemo@123'
  const users = getUsers()
  if (users.some(u => u.emailLower === DEMO_EMAIL.toLowerCase())) return
  const salt = randomId()
  const passwordHash = await sha256(DEMO_PASSWORD + ':' + salt)
  const user: User = {
    id: randomId(),
    email: DEMO_EMAIL,
    emailLower: DEMO_EMAIL.toLowerCase(),
    name: DEMO_NAME,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  saveUsers(users)
}

// Optional helper to remove the demo user later
export function removeDemoUser() {
  const DEMO_EMAIL = 'demo@vtl.com'
  const users = getUsers().filter(u => u.emailLower !== DEMO_EMAIL.toLowerCase())
  saveUsers(users)
}

export async function signUp(name: string, email: string, password: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }))
    throw new Error(error.error || 'Signup failed')
  }
  
  const session: Session = await response.json()
  setSession(session)
  return session
}

export async function login(email: string, password: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }))
    throw new Error(error.error || 'Login failed')
  }
  
  const session: Session = await response.json()
  setSession(session)
  return session
}

export function setSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) 
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed) return null
    const role = (parsed.role as Role) || 'viewer'
    return { ...parsed, role }
  } catch {
    return null
  }
}
export function clearSession() { localStorage.removeItem(SESSION_KEY) }

export function isAdmin() { return getSession()?.role === 'admin' }

export type Permission =
  | 'tickets:create' | 'tickets:update' | 'tickets:delete' | 'tickets:import' | 'tickets:export'
  | 'employees:*' | 'customers:*' | 'users:*' | 'settings:*'
  | 'tasks:*' | 'tasks:create' | 'tasks:update' | 'tasks:delete' | 'tasks:view' | 'tasks:updateSelf'

const ROLE_PERMS: Record<Role, Permission[]> = {
  admin: ['tickets:create','tickets:update','tickets:delete','tickets:import','tickets:export','employees:*','customers:*','users:*','settings:*','tasks:*'],
  manager: ['tickets:create','tickets:update','tickets:delete','tickets:import','tickets:export','employees:*','customers:*','tasks:*'],
  agent: ['tickets:create','tickets:update','tickets:export','tasks:view','tasks:updateSelf'],
  viewer: ['tasks:view'],
}

export function can(p: Permission): boolean {
  const role = (getSession()?.role as Role) || 'agent'
  const perms = ROLE_PERMS[role] || []
  if (perms.includes(p)) return true
  if (p.startsWith('employees') && perms.includes('employees:*')) return true
  if (p.startsWith('customers') && perms.includes('customers:*')) return true
  if (p.startsWith('tasks') && perms.includes('tasks:*')) return true
  if (p.startsWith('users') && perms.includes('users:*')) return true
  if (p.startsWith('settings') && perms.includes('settings:*')) return true
  return false
}

// Global 401/403 handler: clear session and redirect to /login if event fired
if (typeof window !== 'undefined') {
  window.addEventListener('crm:auth:unauthorized', () => {
    try { clearSession() } catch {}
    try { if (location.pathname !== '/login') location.href = '/login' } catch {}
  })
}
