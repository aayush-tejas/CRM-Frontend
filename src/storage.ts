import type { Tender } from './types'

const KEY = 'crm:tenders'

export interface StoredTender extends Tender {
  id: string
  createdAt: string
  updatedAt: string
}

export function loadTenders(): StoredTender[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as StoredTender[]
    return []
  } catch {
    return []
  }
}

function persist(list: StoredTender[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function saveTender(t: Tender): StoredTender {
  const list = loadTenders()
  const now = new Date().toISOString()
  const saved: StoredTender = { id: genId(), createdAt: now, updatedAt: now, ...t }
  list.unshift(saved)
  persist(list)
  return saved
}

export function updateTender(id: string, patch: Partial<Tender>): StoredTender | null {
  const list = loadTenders()
  const idx = list.findIndex(i => i.id === id)
  if (idx === -1) return null
  const updated = { ...list[idx], ...patch, updatedAt: new Date().toISOString() }
  list[idx] = updated
  persist(list)
  return updated
}

export function deleteTender(id: string) {
  const list = loadTenders().filter(i => i.id !== id)
  persist(list)
}
