export type NotificationLevel = 'info' | 'success' | 'warning' | 'critical'
export type NotificationLink = { tab?: 'dashboard' | 'tasks' | 'customers' | 'employees' | 'settings'; entityType?: 'tender' | 'customer' | 'employee' | 'task'; entityKey?: string }

export interface NotificationItem {
  id: string
  createdAt: string
  text: string
  level: NotificationLevel
  link?: NotificationLink
  read: boolean
  sticky?: boolean
  expiresAt?: string | null
}

export interface NotificationOptions {
  link?: NotificationLink
  level?: NotificationLevel
  autoExpireSeconds?: number
  sticky?: boolean
}

const KEY = 'crm:notifications'
const MAX_NOTIFICATIONS = 75

function isNotificationLink(value: unknown): value is NotificationLink {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return 'tab' in candidate || 'entityType' in candidate || 'entityKey' in candidate
}

function loadAllRaw(): NotificationItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw as NotificationItem[]
  } catch {
    return []
  }
}

function normalize(items: NotificationItem[]): NotificationItem[] {
  const now = Date.now()
  return items
    .filter(item => item && typeof item === 'object' && typeof item.text === 'string')
    .map(item => {
      const level = (item.level as NotificationLevel) || 'info'
      const read = Boolean(item.read)
      const sticky = Boolean(item.sticky)
      const expiresAt = item.expiresAt ?? null
      return {
        id: item.id || id(),
        createdAt: item.createdAt || new Date().toISOString(),
        text: item.text,
        level,
        link: item.link,
        read,
        sticky,
        expiresAt,
      }
    })
    .filter(item => {
      if (!item.expiresAt) return true
      const expiry = Date.parse(item.expiresAt)
      if (Number.isNaN(expiry)) return true
      return expiry > now || item.sticky
    })
}

function prune(items: NotificationItem[]): NotificationItem[] {
  const normalized = normalize(items)
  return normalized.slice(0, MAX_NOTIFICATIONS)
}

function persist(items: NotificationItem[]): NotificationItem[] {
  const pruned = prune(items)
  localStorage.setItem(KEY, JSON.stringify(pruned))
  return pruned
}

function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function freshList(): NotificationItem[] {
  return persist(loadAllRaw())
}

export function notify(text: string, options?: NotificationOptions | NotificationLink): NotificationItem {
  const base: NotificationOptions = {}
  if (options) {
    if (isNotificationLink(options)) {
      base.link = options
    } else {
      Object.assign(base, options)
    }
  }
  const level = base.level ?? 'info'
  const createdAt = new Date()
  const expiresAt = base.autoExpireSeconds
    ? new Date(createdAt.getTime() + base.autoExpireSeconds * 1000).toISOString()
    : null
  const item: NotificationItem = {
    id: id(),
    createdAt: createdAt.toISOString(),
    text,
    level,
    link: base.link,
    read: false,
    sticky: Boolean(base.sticky),
    expiresAt,
  }
  const list = freshList()
  list.unshift(item)
  persist(list)
  return item
}

export function listNotifications(): NotificationItem[] {
  return freshList()
}

export function unreadCount(): number {
  return freshList().filter(n => !n.read).length
}

export function markRead(id: string) {
  const list = freshList().map(n => n.id === id ? { ...n, read: true } : n)
  persist(list)
}

export function markAllRead() {
  const list = freshList().map(n => ({ ...n, read: true }))
  persist(list)
}

export function removeNotification(id: string) {
  const list = freshList().filter(n => n.id !== id)
  persist(list)
}

export function clearAllNotifications() {
  localStorage.removeItem(KEY)
}