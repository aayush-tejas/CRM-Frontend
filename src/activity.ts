export type EntityType = 'tender' | 'customer' | 'employee'

export interface ActivityItem {
  id: string
  createdAt: string
  entityType: EntityType
  entityKey: string
  userEmail?: string
  userName?: string
  type: 'comment' | 'system' | 'communication'
  text: string
}

const KEY = 'crm:activities'

function loadAll(): ActivityItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function saveAll(list: ActivityItem[]) { localStorage.setItem(KEY, JSON.stringify(list)) }
function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export function addActivity(partial: Omit<ActivityItem, 'id' | 'createdAt'>): ActivityItem {
  const list = loadAll()
  const item: ActivityItem = { id: id(), createdAt: new Date().toISOString(), ...partial }
  list.unshift(item)
  saveAll(list)
  return item
}

export function addSystemActivity(entityType: EntityType, entityKey: string, text: string) {
  return addActivity({ entityType, entityKey, type: 'system', text })
}

export function listActivities(entityType: EntityType, entityKey: string): ActivityItem[] {
  return loadAll().filter(a => a.entityType === entityType && a.entityKey === entityKey)
}

export function deleteActivity(id: string) {
  const list = loadAll().filter(a => a.id !== id)
  saveAll(list)
}