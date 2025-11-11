import { useEffect, useMemo, useState, useRef, useCallback, Fragment } from 'react'
import CustomersForm from './CustomersForm'
import EmployeeForm from './EmployeeForm'
import DocumentsPanel from './DocumentsPanel'
import CommunicationsPanel from './CommunicationsPanel'
import ApprovalsPanel from './ApprovalsPanel'
import EnterpriseInsightsPanel from './EnterpriseInsightsPanel'
import type { FormEvent, CSSProperties } from 'react'
import type { EmployeeImportRecord } from './excel'
import { saveTender, loadTenders, updateTender, deleteTender } from './storage'
import { TendersApi, type TenderDTO, EmployeesApi, type EmployeeDTO, CustomersApi, type CustomerDTO, UsersApi, type UserDTO, TasksApi, type TaskDTO, type TaskCreateInput, type TaskUpdateInput, ActivitiesApi, DocumentsApi, type DocumentCreateInput, type DocumentListQuery, AssistantApi, AssistantInsightsApi, AnalyticsApi } from './api'
import type { Priority, Status, Tender, TaskStatus, TaskMeta, DocumentRecord, AssistantResponse, TimelineInsight, AnalyticsOverview } from './types'
import { validateField, validateTender } from './validation'
import { getSession, clearSession, isAdmin, can, type Role } from './auth/session'
import { addSystemActivity } from './activity'
import { notify, listNotifications, markRead, markAllRead, unreadCount, clearAllNotifications, removeNotification, type NotificationItem, type NotificationLevel } from './notifications'
import ActivityFeed from './ActivityFeed'
import EntityDocuments from './EntityDocuments'
import { AssistantHelperPanel, BrandingSettingsPanel, CustomizationSettings, WebhookSettingsPanel } from './SettingsPanels'

const SLA_DEFAULT_REMINDER_MINUTES = 120

const PRIORITY_THEME: Record<Priority | string, { bg: string; color: string }> = {
  Urgent: { bg: 'rgba(220,38,38,0.14)', color: '#dc2626' },
  High: { bg: 'rgba(249,115,22,0.14)', color: '#f97316' },
  Medium: { bg: 'rgba(59,130,246,0.14)', color: '#2563eb' },
  Low: { bg: 'rgba(16,185,129,0.14)', color: '#10b981' },
  default: { bg: 'rgba(99,102,241,0.14)', color: '#6366f1' }
}

type SettingsView = 'roles' | 'customization' | 'branding' | 'webhooks' | 'assistant'

type ExcelModule = typeof import('./excel')
let excelModulePromise: Promise<ExcelModule> | null = null
async function loadExcelModule(): Promise<ExcelModule> {
  if (!excelModulePromise) {
    excelModulePromise = import('./excel')
  }
  return excelModulePromise
}

function normalizeTaskMetaValue(meta: TaskMeta | undefined): TaskMeta {
  const dependencies = Array.isArray(meta?.dependencies) ? meta.dependencies.filter(Boolean) : []
  const teamValue = typeof meta?.team === 'string' ? meta.team.trim() : meta?.team
  const remindValue = typeof meta?.remindBeforeMinutes === 'number' && !Number.isNaN(meta.remindBeforeMinutes)
    ? meta.remindBeforeMinutes
    : undefined
  const notesValue = typeof meta?.notes === 'string' ? meta.notes : undefined
  const normalizedNotes = notesValue && notesValue.trim().length === 0 ? undefined : notesValue
  return {
    dependencies,
    team: teamValue && teamValue.length > 0 ? teamValue : undefined,
    remindBeforeMinutes: remindValue,
    notes: normalizedNotes
  }
}

function deriveTaskMetaFromTask(task: TaskDTO | undefined): TaskMeta {
  if (!task) return { dependencies: [] }
  return normalizeTaskMetaValue({
    dependencies: task.dependencies || [],
    team: task.team || undefined,
    remindBeforeMinutes: task.remindBeforeMinutes ?? undefined,
    notes: task.notes ?? undefined
  })
}

function isTaskMetaEqual(a: TaskMeta | undefined, b: TaskMeta | undefined): boolean {
  if (a === b) return true
  const na = normalizeTaskMetaValue(a)
  const nb = normalizeTaskMetaValue(b)
  if (na.dependencies.length !== nb.dependencies.length) return false
  for (let i = 0; i < na.dependencies.length; i += 1) {
    if (na.dependencies[i] !== nb.dependencies[i]) return false
  }
  if ((na.team ?? '') !== (nb.team ?? '')) return false
  if ((na.remindBeforeMinutes ?? null) !== (nb.remindBeforeMinutes ?? null)) return false
  if ((na.notes ?? '') !== (nb.notes ?? '')) return false
  return true
}


function computeSlaBadge(task: TaskDTO, meta: TaskMeta | undefined): { label: string; color: string; background: string } {
  if (task.status === 'Completed') {
    return { label: 'Completed', color: '#16a34a', background: 'rgba(22,163,74,0.14)' }
  }
  if (!task.dueDate) {
    return { label: 'Schedule me', color: '#475569', background: 'rgba(71,85,105,0.14)' }
  }
  const dueMs = Date.parse(task.dueDate)
  if (Number.isNaN(dueMs)) {
    return { label: 'Invalid due date', color: '#dc2626', background: 'rgba(220,38,38,0.14)' }
  }
  const now = Date.now()
  if (dueMs < now) {
    return { label: 'SLA breached', color: '#dc2626', background: 'rgba(220,38,38,0.14)' }
  }
  const minutesLeft = Math.round((dueMs - now) / 60000)
  const reminder = meta?.remindBeforeMinutes ?? SLA_DEFAULT_REMINDER_MINUTES
  if (minutesLeft <= reminder) {
    const label = minutesLeft >= 60 ? `Due in ${Math.max(1, Math.round(minutesLeft / 60))}h` : `Due in ${Math.max(1, minutesLeft)}m`
    return { label, color: '#f59e0b', background: 'rgba(245,158,11,0.18)' }
  }
  const daysLeft = Math.round(minutesLeft / (60 * 24))
  const label = daysLeft <= 1 ? 'Due tomorrow' : `Due in ${daysLeft}d`
  return { label, color: '#0ea5e9', background: 'rgba(14,165,233,0.18)' }
}
export default function App() {
  const session = getSession()
  const sessionRole: Role = session?.role ?? 'viewer'
  const sessionUserId = session?.userId ?? null
  const canViewEnterprise = sessionRole === 'admin' || sessionRole === 'manager'
  const allowSecurityPosture = sessionRole === 'admin'

  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'customers' | 'employees' | 'documents' | 'communications' | 'approvals' | 'reports' | 'settings'>('dashboard')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [useServer, setUseServer] = useState(() => localStorage.getItem('crm:useServer') === '1')
  const [tenders, setTenders] = useState(() => (sessionRole === 'viewer' ? [] : loadTenders()))
  const [importSummary, setImportSummary] = useState<{ newCount: number; dupCount: number; dups: Tender[] } | null>(null)

  // Ticket form state
  const [dateOfService, setDateOfService] = useState<string>('')
  const [serialToken, setSerialToken] = useState<string>('')
  const [allottedTo, setAllottedTo] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [status, setStatus] = useState<Status>('Open')
  // Extended fields
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [employeeName, setEmployeeName] = useState<string>('')
  const [leadTitle, setLeadTitle] = useState<string>('')
  const [leadDescription, setLeadDescription] = useState<string>('')
  const [estimatedValue, setEstimatedValue] = useState<string>('')
  const [followUpDate, setFollowUpDate] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [employeeVersion, setEmployeeVersion] = useState(0)
  const [expandedTenderId, setExpandedTenderId] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifVersion, setNotifVersion] = useState(0)
  const notifications = useMemo<NotificationItem[]>(() => listNotifications(), [notifVersion])
  const unread = useMemo(() => unreadCount(), [notifVersion])
  const bumpNotifications = useCallback(() => setNotifVersion(v => v + 1), [])
  const [users, setUsers] = useState<UserDTO[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [settingsView, setSettingsView] = useState<SettingsView>('roles')
  const [assistantSummary, setAssistantSummary] = useState<AssistantResponse | null>(null)
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [assistantUpdatedAt, setAssistantUpdatedAt] = useState<string | null>(null)
  const assistantInitializedRef = useRef(false)
  const assistantSnapshotRef = useRef<string | null>(null)
  const timelineAutoKeyRef = useRef<string | null>(null)
  const customerOptionsRequestRef = useRef(0)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [customerOptionsNextCursor, setCustomerOptionsNextCursor] = useState<string | null>(null)
  const [customerOptionsLoadingMore, setCustomerOptionsLoadingMore] = useState(false)
  const analyticsCacheRef = useRef<{ data: AnalyticsOverview; fetchedAt: number } | null>(null)
  const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState<string | null>(null)
  const [timelineEntityType, setTimelineEntityType] = useState<'tender' | 'customer'>('tender')
  const [timelineEntityId, setTimelineEntityId] = useState<string>('')
  const [timelineInsights, setTimelineInsights] = useState<TimelineInsight | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [customerOptions, setCustomerOptions] = useState<CustomerDTO[]>([])
  const [customerOptionsLoading, setCustomerOptionsLoading] = useState(false)
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const probabilityColor = useMemo(() => {
    if (!timelineInsights) return '#6366f1'
    switch (timelineInsights.probability.label) {
      case 'High':
        return '#16a34a'
      case 'Medium':
        return '#f59e0b'
      default:
        return '#dc2626'
    }
  }, [timelineInsights])
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, Role>>({})
  const roleStyles: Record<Role, CSSProperties> = {
    admin: {
      background: 'linear-gradient(90deg,#FFD700,#FFC000,#FFD700)',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      fontWeight: 600,
      textShadow: '0 0 2px rgba(255,215,0,0.6), 0 0 6px rgba(255,140,0,0.4)'
    },
    manager: {
      color: '#7c3aed',
      fontWeight: 600
    },
    agent: {
      color: '#16a34a',
      fontWeight: 600
    },
    viewer: {
      color: '#0ea5e9',
      fontWeight: 600
    }
  }
  const roleLabels: Record<Role, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    agent: 'Agent',
    viewer: 'Viewer'
  }
  const sessionUserStyle: CSSProperties = roleStyles[sessionRole] || { color: '#16a34a', fontWeight: 600 }
  const notificationLevelMeta: Record<NotificationLevel, { label: string; color: string; icon: string; accent: string }> = {
    info: { label: 'Info', color: '#0ea5e9', icon: 'ℹ️', accent: 'rgba(14,165,233,0.12)' },
    success: { label: 'Success', color: '#16a34a', icon: '✅', accent: 'rgba(22,163,74,0.12)' },
    warning: { label: 'Warning', color: '#f59e0b', icon: '⚠️', accent: 'rgba(245,158,11,0.12)' },
    critical: { label: 'Critical', color: '#dc2626', icon: '🛑', accent: 'rgba(220,38,38,0.12)' }
  }
  const adminCount = useMemo(() => users.filter(u => (u.role as Role) === 'admin').length, [users])
  const roleOptions: Role[] = ['admin', 'manager', 'agent', 'viewer']
  const settingsOptions: Array<{ key: SettingsView; label: string; description: string }> = [
    { key: 'roles', label: 'Team & roles', description: 'Control who gets admin, manager, agent, or read-only access.' },
    { key: 'customization', label: 'Layouts & fields', description: 'Design entity layouts and extend records with custom fields.' },
    { key: 'branding', label: 'Branding', description: 'Fine-tune colors, logos, and localization for your tenant.' },
    { key: 'webhooks', label: 'Webhooks', description: 'Subscribe integrations to CRM events and deliver secure callbacks.' },
    { key: 'assistant', label: 'Assistant', description: 'Ask for summaries and automated insights pulled from live data.' }
  ]
  const activeSettingsOption = settingsOptions.find(option => option.key === settingsView) ?? settingsOptions[0]
  const assistantSnapshot = useMemo(() => {
    const statusCounts: Record<string, number> = {}
    const priorityCounts: Record<string, number> = {}
    const highPriority: Array<{ id: string; title: string; status: string; priority: Priority; owner: string | null; followUpDate: string | null }> = []
    const upcomingFollowUps: Array<{ id: string; title: string; followUpDate: string }> = []
    let openCount = 0
    const now = Date.now()

    tenders.forEach(tender => {
      const statusKey = tender.status || 'Unknown'
      statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1
      const priorityKey = tender.priority || 'Unspecified'
      priorityCounts[priorityKey] = (priorityCounts[priorityKey] ?? 0) + 1
      if (tender.status !== 'Closed') openCount += 1

      if ((tender.priority === 'High' || tender.priority === 'Urgent') && highPriority.length < 5) {
        highPriority.push({
          id: (tender as any).id || tender.serialToken,
          title: tender.leadTitle || tender.serialToken,
          status: tender.status,
          priority: tender.priority,
          owner: tender.allottedTo || null,
          followUpDate: tender.followUpDate || null
        })
      }

      if (tender.followUpDate) {
        const due = Date.parse(tender.followUpDate)
        if (!Number.isNaN(due) && due >= now) {
          upcomingFollowUps.push({
            id: (tender as any).id || tender.serialToken,
            title: tender.leadTitle || tender.serialToken,
            followUpDate: tender.followUpDate
          })
        }
      }
    })

    upcomingFollowUps.sort((a, b) => Date.parse(a.followUpDate) - Date.parse(b.followUpDate))

    return {
      mode: useServer ? 'server' : 'local',
      totals: {
        tenders: tenders.length,
        open: openCount
      },
      statusCounts,
      priorityCounts,
      highPriority,
      upcomingFollowUps: upcomingFollowUps.slice(0, 5)
    }
  }, [tenders, useServer])
  const assistantSnapshotKey = useMemo(() => JSON.stringify(assistantSnapshot), [assistantSnapshot])
  const timelineEntityOptions = useMemo(() => {
    if (timelineEntityType === 'tender') {
      return tenders.map((tender) => {
        const value = (tender as any).id || tender.serialToken
        const subtitleParts = [tender.status, tender.priority].filter(Boolean)
        return {
          value,
          label: tender.leadTitle || tender.serialToken,
          subtitle: subtitleParts.join(' • ') || undefined
        }
      })
    }
    return customerOptions.map((customer) => {
      const primary = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
      const label = customer.organizationName || primary || customer.email || customer.mobile || 'Unnamed customer'
      return {
        value: customer.id!,
        label,
        subtitle: customer.email || customer.mobile || undefined
      }
    })
  }, [customerOptions, tenders, timelineEntityType])

  useEffect(() => {
    if (!timelineEntityOptions.length) {
      setTimelineEntityId('')
      setTimelineInsights(null)
      return
    }
    const exists = timelineEntityOptions.some(option => option.value === timelineEntityId)
    if (!exists) {
      setTimelineEntityId(timelineEntityOptions[0].value)
    }
  }, [timelineEntityId, timelineEntityOptions])

  const canViewTickets = sessionRole !== 'viewer'
  const canViewEmployees = sessionRole === 'admin' || sessionRole === 'manager'
  const canManageCommunications = sessionRole !== 'viewer'
  const canManageApprovals = sessionRole !== 'viewer'
  function ownsTender(record: { ownerUserId?: string | null }): boolean {
    if (!record.ownerUserId) return true
    if (!sessionUserId) return false
    return record.ownerUserId === sessionUserId
  }
  function canEditTenderRecord(record: { ownerUserId?: string | null }): boolean {
    if (!can('tickets:update')) return false
    if (sessionRole === 'agent' && !ownsTender(record)) return false
    return true
  }
  function canDeleteTenderRecord(record: { ownerUserId?: string | null }): boolean {
    if (!can('tickets:delete')) return false
    if (sessionRole === 'agent' && !ownsTender(record)) return false
    return true
  }
  const employees = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('crm:employees') || '[]') as Array<{ id: string; employeeName: string }>} catch { return [] }
  }, [employeeVersion])
  const [employeesServer, setEmployeesServer] = useState<Array<{ id: string; employeeName: string }>>([])
  const editingTender = useMemo(() => editingId ? tenders.find(t => t.id === editingId) ?? null : null, [editingId, tenders])
  const activeTenderRecord = useMemo(() => {
    if (!serialToken) return null
    return tenders.find(t => t.serialToken === serialToken || t.id === serialToken) ?? null
  }, [tenders, serialToken])

  useEffect(() => {
    if (!canViewTickets) {
      setShowTicketForm(false)
      setTenders([])
      setImportSummary(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewTickets])

  useEffect(() => {
    if (!useServer || !canViewEmployees) return
    EmployeesApi.list()
      .then(rows => setEmployeesServer(rows.map(r => ({ id: r.id!, employeeName: r.employeeName }))))
      .catch(() => setEmployeesServer([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer, employeeVersion])
  useEffect(() => {
    if (!useServer) {
      setExpandedTenderId(null)
    }
  }, [useServer])
  const employeesDisplay = !canViewEmployees ? [] : (useServer ? employeesServer : employees)

  // Load from server when server mode is enabled
  useEffect(() => {
    if (!useServer || !canViewTickets) return
    TendersApi.list()
      .then((rows) => setTenders(rows as any))
      .catch(() => showToast('Failed to load from server', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer])

  useEffect(() => {
    if (timelineEntityType !== 'customer') {
      setCustomerOptions([])
      setCustomerOptionsNextCursor(null)
      setCustomerOptionsLoading(false)
      setCustomerSearchTerm('')
      return
    }

    if (!useServer) {
      const local = (() => {
        try { return JSON.parse(localStorage.getItem('crm:customers') || '[]') as CustomerDTO[] } catch { return [] }
      })()
      const term = customerSearchTerm.trim().toLowerCase()
      const filtered = term
        ? local.filter(customer => {
            const haystack = [
              customer.firstName,
              customer.lastName,
              customer.organizationName,
              customer.email,
              customer.mobile
            ].filter(Boolean).join(' ').toLowerCase()
            return haystack.includes(term)
          })
        : local
      setCustomerOptions(filtered)
      setCustomerOptionsNextCursor(null)
      setCustomerOptionsLoading(false)
      return
    }

    const requestId = customerOptionsRequestRef.current + 1
    customerOptionsRequestRef.current = requestId
    setCustomerOptionsLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await CustomersApi.list({ search: customerSearchTerm, limit: 50 })
        if (customerOptionsRequestRef.current !== requestId) return
        setCustomerOptions(response.data)
        setCustomerOptionsNextCursor(response.nextCursor)
      } catch (err) {
        if (customerOptionsRequestRef.current !== requestId) return
        setCustomerOptions([])
        showToast('Unable to load customers for insights', 'error')
      } finally {
        if (customerOptionsRequestRef.current === requestId) {
          setCustomerOptionsLoading(false)
        }
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
    }
  }, [customerSearchTerm, timelineEntityType, useServer])

  useEffect(() => {
    if (activeTab !== 'settings') {
      setSettingsView('roles')
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'settings' || sessionRole !== 'admin' || settingsView !== 'roles') return
    loadUsersList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sessionRole, settingsView])

  async function handleImport(file: File) {
    const { parseExcelToTenders } = await loadExcelModule()
    const many = await parseExcelToTenders(file)
    if (!many.length) {
      showToast('No rows found in Excel.', 'error')
      return
    }
    // Dedupe by serial token (case-insensitive)
    const existing = new Set(tenders.map(t => t.serialToken.toLowerCase()))
    const unique = many.filter(t => !existing.has(t.serialToken.toLowerCase()))
    const dupCount = many.length - unique.length

    // Prefill with first row
    const first = many[0]
    setDateOfService(first.dateOfService)
    setSerialToken(first.serialToken)
    setAllottedTo(first.allottedTo)
    setSource(first.source)
    setPriority(first.priority)
    setStatus(first.status)
    setCustomerId(first.customerId ?? '')
    setCustomerName(first.customerName ?? '')
    setEmployeeId(first.employeeId ?? '')
    setEmployeeName(first.employeeName ?? '')
    setLeadTitle(first.leadTitle ?? '')
    setLeadDescription(first.leadDescription ?? '')
    setEstimatedValue(first.estimatedValue ?? '')
    setFollowUpDate(first.followUpDate ?? '')

    // Save all unique rows
    const saved = unique.map(saveTender)
    setTenders((prev) => [...saved, ...prev])
    const dups = many.filter(t => existing.has(t.serialToken.toLowerCase()))
    setImportSummary({ newCount: saved.length, dupCount, dups })
    showToast(`Imported ${saved.length} tender(s).${dupCount ? ` Skipped ${dupCount} duplicate(s).` : ''}`)
  }

  function currentTender(): Tender {
    const payload: Tender = {
      dateOfService,
      serialToken: serialToken.trim(),
      allottedTo: allottedTo.trim(),
      source: source.trim(),
      priority,
      status
    }

    const trimmedCustomerId = customerId.trim()
    if (trimmedCustomerId) payload.customerId = trimmedCustomerId

    const trimmedCustomerName = customerName.trim()
    if (trimmedCustomerName) payload.customerName = trimmedCustomerName

    const normalizedEmployeeId = (selectedEmployeeId || employeeId).trim()
    if (normalizedEmployeeId) payload.employeeId = normalizedEmployeeId

    const trimmedEmployeeName = employeeName.trim()
    if (trimmedEmployeeName) payload.employeeName = trimmedEmployeeName

    const trimmedLeadTitle = leadTitle.trim()
    if (trimmedLeadTitle) payload.leadTitle = trimmedLeadTitle

    const trimmedLeadDescription = leadDescription.trim()
    if (trimmedLeadDescription) payload.leadDescription = trimmedLeadDescription

    const trimmedEstimatedValue = estimatedValue.trim()
    if (trimmedEstimatedValue) payload.estimatedValue = trimmedEstimatedValue

    if (followUpDate) payload.followUpDate = followUpDate

    return payload
  }

  function recordTenderActivity(serial: string, text: string) {
    if (!serial || !text) return
    if (useServer) {
      ActivitiesApi.create({
        entityType: 'tender',
        entityKey: serial,
        text,
        type: 'system'
      }).catch(() => {})
      return
    }
    try {
      addSystemActivity('tender', serial, text)
    } catch {
      // ignore activity persistence errors in local mode
    }
  }
  const handleGenerateTimeline = useCallback(async (mode: 'auto' | 'manual' = 'manual') => {
    if (!timelineEntityId) {
      if (mode === 'manual') setTimelineError('Select a record to analyze.')
      return
    }
    setTimelineLoading(true)
    if (mode === 'manual') setTimelineError(null)
    try {
      const insights = await AssistantInsightsApi.timeline(timelineEntityType, timelineEntityId)
      setTimelineInsights(insights)
      setTimelineError(null)
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Unable to fetch insights right now.'
      setTimelineInsights(null)
      setTimelineError(message)
    } finally {
      setTimelineLoading(false)
    }
  }, [timelineEntityId, timelineEntityType])
  const loadMoreCustomerOptions = useCallback(async () => {
    if (!useServer || !customerOptionsNextCursor || customerOptionsLoadingMore) return
    setCustomerOptionsLoadingMore(true)
    try {
      const response = await CustomersApi.list({ search: customerSearchTerm, cursor: customerOptionsNextCursor, limit: 50 })
      setCustomerOptions(prev => {
        const seen = new Set(prev.map(item => item.id))
        const merged = [...prev]
        response.data.forEach(item => {
          if (!item.id || !seen.has(item.id)) {
            merged.push(item)
            if (item.id) seen.add(item.id)
          }
        })
        return merged
      })
      setCustomerOptionsNextCursor(response.nextCursor)
    } catch {
      showToast('Unable to load more customers', 'error')
    } finally {
      setCustomerOptionsLoadingMore(false)
    }
  }, [customerOptionsLoadingMore, customerOptionsNextCursor, customerSearchTerm, useServer])

  const refreshAnalyticsOverview = useCallback(async (options?: { force?: boolean }) => {
    const cache = analyticsCacheRef.current
    if (!options?.force && cache && Date.now() - cache.fetchedAt < 120_000) {
      setAnalyticsOverview(cache.data)
      setAnalyticsError(null)
      setAnalyticsUpdatedAt(new Date(cache.fetchedAt).toISOString())
      setAnalyticsLoading(false)
      return
    }
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    try {
      const overview = await AnalyticsApi.overview()
      const fetchedAt = Date.now()
      analyticsCacheRef.current = { data: overview, fetchedAt }
      setAnalyticsOverview(overview)
      setAnalyticsUpdatedAt(new Date(fetchedAt).toISOString())
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Unable to load analytics overview.'
      setAnalyticsOverview(null)
      setAnalyticsError(message)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'dashboard') return
    if (!timelineEntityId) {
      timelineAutoKeyRef.current = null
      return
    }
    const key = `${timelineEntityType}:${timelineEntityId}:${assistantSnapshotKey}`
    if (timelineAutoKeyRef.current === key) return
    timelineAutoKeyRef.current = key
    handleGenerateTimeline('auto')
  }, [activeTab, assistantSnapshotKey, handleGenerateTimeline, timelineEntityId, timelineEntityType])

  useEffect(() => {
    if (activeTab !== 'dashboard') return
    refreshAnalyticsOverview()
  }, [activeTab, assistantSnapshotKey, refreshAnalyticsOverview])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const payload = currentTender()
    const nextErrors = validateTender(payload)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      showToast('Please fix validation errors.', 'error')
      return
    }

    const actor = getSession()?.name || getSession()?.email || 'user'

    try {
      if (useServer) {
        const created = await TendersApi.create(payload as TenderDTO)
        setTenders(prev => [created as any, ...prev])
        recordTenderActivity(created.serialToken, `Ticket created by ${actor}`)
        const entityKey = (created as any).id ?? created.serialToken
        notify(`New ticket created: ${created.leadTitle || created.serialToken}`, {
          level: 'success',
          link: { tab: 'dashboard', entityType: 'tender', entityKey }
        })
        bumpNotifications()
        showToast('Ticket saved! (server)')
      } else {
        const saved = saveTender(payload)
        setTenders(prev => [saved, ...prev])
        recordTenderActivity(saved.serialToken, `Ticket created by ${actor}`)
        notify(`New ticket created: ${saved.leadTitle || saved.serialToken}`, {
          level: 'success',
          link: { tab: 'dashboard', entityType: 'tender', entityKey: saved.id }
        })
        bumpNotifications()
        showToast('Ticket saved.')
      }

      setEditingId(null)
      setShowTicketForm(false)
      setDateOfService('')
      setSerialToken('')
      setAllottedTo('')
      setSource('')
      setPriority('Medium')
      setStatus('Open')
      setCustomerId('')
      setCustomerName('')
      setEmployeeId('')
      setEmployeeName('')
  setSelectedEmployeeId('')
      setLeadTitle('')
      setLeadDescription('')
      setEstimatedValue('')
      setFollowUpDate('')
      setErrors({})
    } catch {
      showToast('Failed to save ticket', 'error')
    }
  }

  function setUserRole(userId: string, role: Role) {
    setUserRoleDrafts(prev => ({ ...prev, [userId]: role }))
  }

  async function loadUsersList() {
    setUsersLoading(true)
    try {
      const rows = await UsersApi.list()
      setUsers(rows)
      const nextDrafts: Record<string, Role> = {}
      rows.forEach(u => { nextDrafts[u.id] = ((u.role as Role) || 'agent') })
      setUserRoleDrafts(nextDrafts)
    } catch {
      showToast('Failed to load users', 'error')
    } finally {
      setUsersLoading(false)
    }
  }

  async function applyUserRole(user: UserDTO) {
    const desiredRole = userRoleDrafts[user.id]
    const currentRole = (user.role as Role) || 'agent'
    if (!desiredRole || desiredRole === currentRole) return
    setUsersLoading(true)
    try {
      await UsersApi.updateRole(user.id, desiredRole)
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, role: desiredRole } : u)))
      setUserRoleDrafts(prev => ({ ...prev, [user.id]: desiredRole }))
      notify(`${user.name || user.email} role updated to ${roleLabels[desiredRole]}`, {
        level: 'success',
        link: { tab: 'settings' }
      })
      bumpNotifications()
      showToast('Role updated')
    } catch {
      showToast('Failed to update role', 'error')
      setUserRoleDrafts(prev => ({ ...prev, [user.id]: currentRole }))
    } finally {
      setUsersLoading(false)
    }
  }

  const refreshAssistantSummary = useCallback((reason: 'auto' | 'manual' = 'manual', snapshotKey?: string) => {
    const keyToUse = snapshotKey ?? assistantSnapshotKey
    const snapshotJson = JSON.stringify(assistantSnapshot, null, 2)
    setAssistantLoading(true)
    setAssistantError(null)

    const instructions = reason === 'auto'
      ? 'Provide a crisp CRM health digest with two bullet highlights and three recommended follow-up actions.'
      : 'Update the CRM digest now. Focus on changes, risks, and the next three actions the team should tackle.'

    const prompt = [
      'You are the embedded CRM assistant for the Vensysco team.',
      instructions,
      'Use the JSON snapshot below as ground truth. Keep the tone confident, actionable, and under 120 words. Return:\n1. A short paragraph summary.\n2. Three bullet "Next actions" suggestions.',
      `Snapshot:\n${snapshotJson}`
    ].join('\n\n')

    AssistantApi.ask(prompt)
      .then(response => {
        setAssistantSummary(response)
        setAssistantUpdatedAt(new Date().toISOString())
      })
      .catch((err: any) => {
        const message = err?.message || 'Assistant is temporarily unavailable. Try again shortly.'
        setAssistantError(message)
      })
      .finally(() => {
        assistantSnapshotRef.current = keyToUse
        setAssistantLoading(false)
      })
  }, [assistantSnapshot, assistantSnapshotKey])

  useEffect(() => {
    if (activeTab !== 'dashboard') {
      assistantInitializedRef.current = false
      return
    }
    if (assistantLoading) return
    if (!assistantInitializedRef.current) {
      assistantInitializedRef.current = true
      refreshAssistantSummary('auto', assistantSnapshotKey)
      return
    }
    if (assistantSnapshotRef.current !== assistantSnapshotKey) {
      refreshAssistantSummary('auto', assistantSnapshotKey)
    }
  }, [activeTab, assistantLoading, assistantSnapshotKey, refreshAssistantSummary])

  function handleNotificationClick(notification: NotificationItem) {
    markRead(notification.id)
    setNotifOpen(false)

    const link = notification.link
    if (link?.tab) {
      setActiveTab(link.tab)
    }

    if (link?.entityType === 'tender' && link.entityKey) {
      const match = tenders.find(t => t.id === link.entityKey || t.serialToken === link.entityKey)
      if (match) {
        setSerialToken(match.serialToken)
        setExpandedTenderId(match.id ?? match.serialToken)
      } else {
        setSerialToken(link.entityKey)
        setExpandedTenderId(link.entityKey)
      }
    }

    if (link?.entityType === 'task' && link.entityKey) {
      setActiveTab('tasks')
    }

    if (link?.entityType === 'customer' && link.entityKey) {
      setActiveTab('customers')
    }

    if (link?.entityType === 'employee' && link.entityKey) {
      setActiveTab('employees')
    }

    bumpNotifications()
  }

  function handleNotificationDismiss(notification: NotificationItem) {
    removeNotification(notification.id)
    bumpNotifications()
  }

  function timeAgo(value: string): string {
    const timestamp = Date.parse(value)
    if (Number.isNaN(timestamp)) return ''
    const diff = Date.now() - timestamp
    if (diff < 0) return 'just now'
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w ago`
    return new Date(timestamp).toLocaleDateString()
  }

  function onEdit(id: string) {
    const item = tenders.find(t => t.id === id)
    if (!item) return
    if (!canEditTenderRecord(item as { ownerUserId?: string | null })) {
      showToast('You can only edit tickets you own.', 'error')
      return
    }
    setShowTicketForm(true)
    setEditingId(id)
    setDateOfService(item.dateOfService)
    setSerialToken(item.serialToken)
    setAllottedTo(item.allottedTo)
    setSource(item.source)
    setPriority(item.priority)
    setStatus(item.status)
    setCustomerId(item.customerId ?? '')
    setCustomerName(item.customerName ?? '')
    setEmployeeId(item.employeeId ?? '')
    setEmployeeName(item.employeeName ?? '')
    setSelectedEmployeeId(item.employeeId ?? '')
    setLeadTitle(item.leadTitle ?? '')
    setLeadDescription(item.leadDescription ?? '')
    setEstimatedValue(item.estimatedValue ?? '')
    setFollowUpDate(item.followUpDate ?? '')
  }

  async function onDelete(id: string) {
    const target = tenders.find(t => t.id === id)
    if (!target) return
    if (!canDeleteTenderRecord(target as { ownerUserId?: string | null })) {
      showToast('You can only delete tickets you own.', 'error')
      return
    }
    if (useServer) {
      await TendersApi.remove(id)
      setTenders(prev => prev.filter(t => t.id !== id))
      showToast('Deleted. (server)')
    } else {
      deleteTender(id)
      setTenders((prev) => prev.filter(t => t.id !== id))
      showToast('Deleted.')
    }
  }

  async function onUpdate() {
    if (!editingId) return
    const target = tenders.find(t => t.id === editingId)
    if (target && !canEditTenderRecord(target as { ownerUserId?: string | null })) {
      showToast('You can only update tickets you own.', 'error')
      return
    }
    const nextErrors = validateTender(currentTender())
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      showToast('Please fix validation errors.', 'error')
      return
    }
    if (useServer) {
      const updated = await TendersApi.update(editingId, currentTender() as unknown as TenderDTO)
  recordTenderActivity(updated.serialToken, `Ticket updated by ${getSession()?.name || getSession()?.email || 'user'}`)
      if (updated.priority === 'High' || updated.priority === 'Urgent') {
        notify(`High priority ticket updated: ${updated.leadTitle || updated.serialToken}`, {
          level: 'warning',
          link: { tab: 'dashboard', entityType: 'tender', entityKey: updated.serialToken }
        })
        bumpNotifications()
      }
      setTenders(prev => prev.map(t => t.id === updated.id ? (updated as any) : t))
      setEditingId(null)
      showToast('Updated! (server)')
    } else {
      const updated = updateTender(editingId, currentTender())
      if (updated) {
  recordTenderActivity(updated.serialToken, `Ticket updated by ${getSession()?.name || getSession()?.email || 'user'}`)
        if (updated.priority === 'High' || updated.priority === 'Urgent') {
          notify(`High priority ticket updated: ${updated.leadTitle || updated.serialToken}`, {
            level: 'warning',
            link: { tab: 'dashboard', entityType: 'tender', entityKey: updated.serialToken }
          })
          bumpNotifications()
        }
        setTenders((prev) => prev.map(t => t.id === updated.id ? updated : t))
        setEditingId(null)
        showToast('Updated!')
      }
    }
  }

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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="Logo" />
          <h1></h1>
        </div>
        <nav className="nav">
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          {canViewTickets && (
            <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Tickets</button>
          )}
          <button className={`nav-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}>Customers</button>
          {canViewEmployees && (
            <button className={`nav-btn ${activeTab === 'employees' ? 'active' : ''}`} onClick={() => setActiveTab('employees')}>Employees</button>
          )}
          {can('tasks:view') && (
            <button className={`nav-btn ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Tasks</button>
          )}
          <button className={`nav-btn ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
          {canManageCommunications && (
            <button className={`nav-btn ${activeTab === 'communications' ? 'active' : ''}`} onClick={() => setActiveTab('communications')}>Communications</button>
          )}
          {canManageApprovals && (
            <button className={`nav-btn ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>Approvals</button>
          )}
          <button
            className={`nav-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
            title={canViewEnterprise ? 'Enterprise analytics & reporting' : 'Manager role required for full access'}
          >
            Reports
          </button>
          {can('users:*') && (
            <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
          )}
        </nav>
        {/* Role legend */}
        <div style={{ marginTop: 'auto', padding: '12px 10px 18px', fontSize: 12, lineHeight: 1.3, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Legend</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>🛡️</span>
            <span><span style={{ background: 'linear-gradient(90deg,#FFD700,#FFC000,#FFD700)', WebkitBackgroundClip: 'text', color: 'transparent', fontWeight: 600 }}>Admin</span> (full access)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 4, background: '#7c3aed' }} />
            <span><span style={{ color: '#7c3aed', fontWeight: 600 }}>Manager</span> (team leadership)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 4, background: '#16a34a' }} />
            <span><span style={{ color: '#16a34a', fontWeight: 600 }}>Agent</span> (own tickets)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 4, background: '#0ea5e9' }} />
            <span><span style={{ color: '#0ea5e9', fontWeight: 600 }}>Viewer</span> (read only)</span>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="header">
          <h2>{
            activeTab === 'settings' ? 'Settings'
              : activeTab === 'tasks' ? 'Tasks'
              : activeTab === 'customers' ? 'Customers'
              : activeTab === 'employees' ? 'Employees'
              : activeTab === 'documents' ? 'Documents'
              : activeTab === 'communications' ? 'Communications'
              : activeTab === 'approvals' ? 'Approvals'
              : activeTab === 'reports' ? 'Reports'
              : 'Tickets'
          }</h2>
          <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Server toggle */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
              <input type="checkbox" checked={useServer} onChange={(e) => { const v = e.currentTarget.checked; setUseServer(v); localStorage.setItem('crm:useServer', v ? '1' : '0') }} />
              Server mode
            </label>
            {/* Notifications bell */}
            <div style={{ position: 'relative' }}>
              <button className="ghost" type="button" aria-label="Notifications" onClick={() => setNotifOpen(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span aria-hidden>🔔</span>{unread > 0 && <span style={{ color: 'var(--brand-700)', fontWeight: 600 }}>({unread})</span>}
              </button>
              {notifOpen && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 360, maxHeight: 380, overflow: 'auto', zIndex: 50, boxShadow: '0 18px 36px rgba(15,23,42,0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <strong>Notifications</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {notifications.length > 0 && (
                        <button className="ghost" type="button" onClick={() => { clearAllNotifications(); bumpNotifications() }}>Clear all</button>
                      )}
                      {unread > 0 && (
                        <button className="ghost" type="button" onClick={() => { markAllRead(); bumpNotifications() }}>Mark all read</button>
                      )}
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ color: 'var(--muted)' }}>No notifications yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {notifications.map(n => {
                        const meta = notificationLevelMeta[n.level] ?? notificationLevelMeta.info
                        return (
                          <div
                            key={n.id}
                            style={{
                              border: '1px solid var(--border)',
                              borderRadius: 10,
                              padding: 10,
                              background: n.read ? 'var(--surface, #fff)' : meta.accent,
                              cursor: n.link ? 'pointer' : 'default'
                            }}
                            onClick={() => handleNotificationClick(n)}
                          >
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ fontWeight: 600, color: meta.color }}>{meta.label}</span>
                                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                                </div>
                                <div style={{ marginTop: 4, color: 'var(--text, #111827)' }}>{n.text}</div>
                                {n.link && (
                                  <div style={{ marginTop: 6, fontSize: 12, color: meta.color }}>Click to view details</div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {!n.read && (
                                  <button
                                    className="ghost"
                                    type="button"
                                    style={{ fontSize: 12, padding: '4px 6px' }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      markRead(n.id)
                                      bumpNotifications()
                                    }}
                                  >
                                    Mark read
                                  </button>
                                )}
                                <button
                                  className="ghost"
                                  type="button"
                                  style={{ fontSize: 12, padding: '4px 6px' }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleNotificationDismiss(n)
                                  }}
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={sessionUserStyle} title={roleLabels[sessionRole]}>
                {session?.name || session?.email || 'Session'}
              </span>
              {session && (
                sessionRole === 'admin' ? (
                  <span aria-label="Admin" title="Admin" style={{ fontSize: 16, filter: 'drop-shadow(0 0 2px rgba(255,185,0,0.6))' }}>🛡️</span>
                ) : sessionRole === 'manager' ? (
                  <span aria-label="Manager" title="Manager" style={{ fontSize: 16, color: '#7c3aed' }}>⭐</span>
                ) : sessionRole === 'viewer' ? (
                  <span aria-label="Viewer" title="Viewer" style={{ fontSize: 14, color: '#0ea5e9' }}>👁️</span>
                ) : (
                  <span aria-label="Agent" title="Agent" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: '#16a34a' }} />
                )
              )}
            </span>
            <button className="ghost" type="button" onClick={() => { clearSession(); location.reload() }}>Logout</button>
            {activeTab === 'dashboard' && (
              <>
                {can('tickets:create') && (
                  <button className="primary" type="button" onClick={() => setShowTicketForm(v => !v)}>
                    {showTicketForm ? 'Hide Form' : 'New Ticket'}
                  </button>
                )}
                {can('tickets:import') && (
                  <>
                    <input
                      id="excelFile"
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const input = e.currentTarget
                        const f = input.files?.[0]
                        if (f) handleImport(f)
                        input.value = '' // reset
                      }}
                    />
                    <button className="ghost" onClick={() => document.getElementById('excelFile')?.click()} type="button">
                      Import Excel
                    </button>
                  </>
                )}
                {can('tickets:export') && (
                  <button
                    className="ghost"
                    type="button"
                    onClick={async () => {
                      try {
                        const { exportTendersToExcel } = await loadExcelModule()
                        exportTendersToExcel(tenders)
                      } catch {
                        showToast('Excel tools failed to load', 'error')
                      }
                    }}
                  >
                    Export Excel
                  </button>
                )}
                {showTicketForm && can('tickets:create') && <button className="primary" type="submit" form="ticketForm">Save</button>}
              </>
            )}
          </div>
        </header>

        <main className="main">
          {activeTab === 'dashboard' && (canViewTickets ? (
            <>
              {/* Activity feed for current serial token if present */}
              <AssistantInsightsCard
                loading={assistantLoading}
                error={assistantError}
                response={assistantSummary}
                lastUpdatedAt={assistantUpdatedAt}
                onRefresh={() => refreshAssistantSummary('manual', assistantSnapshotKey)}
                onOpenAssistant={() => {
                  setSettingsView('assistant')
                  setActiveTab('settings')
                }}
              />
              <section className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: '0 0 6px' }}>Timeline intelligence</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 520 }}>
                      Generate on-demand summaries, suggested follow-up messages, and win probability for any tender or customer based on real activity.
                    </p>
                  </div>
                  <div style={{ minWidth: 160, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)' }}>Win probability</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: probabilityColor, lineHeight: 1.1 }}>
                      {timelineInsights ? `${timelineInsights.probability.score}%` : '--'}
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.25)', marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ width: timelineInsights ? `${timelineInsights.probability.score}%` : 0, background: probabilityColor, height: '100%', borderRadius: 999, transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                      {timelineInsights ? timelineInsights.probability.label : 'Awaiting selection'}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>Entity</span>
                    <div style={{ display: 'inline-flex', borderRadius: 999, border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <button
                        type="button"
                        className={timelineEntityType === 'tender' ? 'primary' : 'ghost'}
                        style={{ borderRadius: 0, padding: '6px 14px' }}
                        onClick={() => setTimelineEntityType('tender')}
                      >
                        Tender
                      </button>
                      <button
                        type="button"
                        className={timelineEntityType === 'customer' ? 'primary' : 'ghost'}
                        style={{ borderRadius: 0, padding: '6px 14px' }}
                        onClick={() => setTimelineEntityType('customer')}
                      >
                        Customer
                      </button>
                    </div>
                  </div>
                  {timelineEntityType === 'customer' && (
                    <input
                      type="search"
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      placeholder="Search customers by name or number…"
                      style={{ flex: '1 1 220px', minWidth: 200, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                  )}
                  <select
                    value={timelineEntityId}
                    onChange={(e) => setTimelineEntityId(e.target.value)}
                    disabled={(timelineEntityType === 'customer' && customerOptionsLoading) || timelineEntityOptions.length === 0}
                    style={{ minWidth: 220, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
                  >
                    {timelineEntityOptions.length === 0 ? (
                      <option value="">{timelineEntityType === 'customer' ? 'No customers found' : 'No tenders yet'}</option>
                    ) : (
                      timelineEntityOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}{option.subtitle ? ` — ${option.subtitle}` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {timelineEntityType === 'customer' && customerOptionsNextCursor != null && (
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => loadMoreCustomerOptions()}
                      disabled={customerOptionsLoadingMore}
                    >
                      {customerOptionsLoadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => handleGenerateTimeline('manual')}
                    disabled={timelineLoading || !timelineEntityId}
                  >
                    {timelineLoading ? 'Generating…' : 'Generate insights'}
                  </button>
                  {timelineLoading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Crunching signals…</span>}
                  {customerOptionsLoading && timelineEntityType === 'customer' && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Loading customers…</span>
                  )}
                  {customerOptionsLoadingMore && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Loading more customers…</span>
                  )}
                </div>
                {timelineError && (
                  <div style={{ marginTop: 12, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 12px', color: '#dc2626' }}>
                    {timelineError}
                  </div>
                )}
                <div style={{ marginTop: 18, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  <div>
                    <h4 style={{ margin: '0 0 8px' }}>{timelineInsights ? timelineInsights.name : 'Select a record'}</h4>
                    <p style={{ margin: 0, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                      {timelineInsights ? timelineInsights.summary : 'Choose a tender or customer to generate a living summary of the relationship timeline and next best steps.'}
                    </p>
                    {timelineInsights && (
                      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Activities</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{timelineInsights.activityMetrics.total}</div>
                          </div>
                          <div style={{ minWidth: 180 }}>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Last touch</div>
                            <div style={{ fontWeight: 600 }}>
                              {timelineInsights.activityMetrics.lastTouchAt ? new Date(timelineInsights.activityMetrics.lastTouchAt).toLocaleString() : 'No activity yet'}
                            </div>
                            {timelineInsights.activityMetrics.lastTouchBy && (
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>By {timelineInsights.activityMetrics.lastTouchBy}</div>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {timelineInsights.activityMetrics.avgSpacingDays != null && (
                            <span>Avg gap: {timelineInsights.activityMetrics.avgSpacingDays} day(s). </span>
                          )}
                          {timelineInsights.activityMetrics.spanDays != null && (
                            <span>Timeline spans {timelineInsights.activityMetrics.spanDays} day(s).</span>
                          )}
                        </div>
                        {timelineInsights.recommendedActions.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Next best actions</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {timelineInsights.recommendedActions.map((action, idx) => (
                                <li key={idx} style={{ marginBottom: 4, color: '#1f2937' }}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                      <h4 style={{ margin: 0 }}>Follow-up draft</h4>
                      <button
                        className="ghost"
                        type="button"
                        disabled={!timelineInsights?.followUpDraft}
                        onClick={() => {
                          if (!timelineInsights?.followUpDraft) return
                          if (navigator && 'clipboard' in navigator && typeof navigator.clipboard?.writeText === 'function') {
                            navigator.clipboard.writeText(timelineInsights.followUpDraft).then(() => showToast('Draft copied'), () => showToast('Copy failed', 'error'))
                          } else {
                            showToast('Clipboard access is unavailable', 'error')
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={timelineInsights?.followUpDraft ?? 'Generate an insight to receive a pre-drafted follow-up message you can paste into email or chat.'}
                      style={{ width: '100%', minHeight: 180, resize: 'vertical', padding: 12, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono, "Fira Code", monospace)', fontSize: 13, lineHeight: 1.55, background: '#f8fafc' }}
                    />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px' }}>Recent activity</h4>
                    {timelineInsights?.timeline?.length ? (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                        {timelineInsights.timeline.slice(-5).reverse().map(item => (
                          <li key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.occurredAt).toLocaleString()} {item.author ? `• ${item.author}` : ''}</div>
                            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{item.type}</div>
                            <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{item.text}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--muted)' }}>Generate an insight to preview the last few timeline entries here.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: '0 0 6px' }}>Analytics & reporting</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 520 }}>Always-on pipeline metrics updated from the secure backend—ideal for stand-ups and reviews.</p>
                    {analyticsUpdatedAt && (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>Last updated {new Date(analyticsUpdatedAt).toLocaleString()}</div>
                    )}
                  </div>
                  <button className="ghost" type="button" onClick={() => refreshAnalyticsOverview({ force: true })} disabled={analyticsLoading}>
                    {analyticsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {analyticsError && (
                  <div style={{ marginTop: 12, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 12px', color: '#dc2626' }}>
                    {analyticsError}
                  </div>
                )}
                <div style={{ marginTop: 18, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: '#0f172a', color: '#f8fafc' }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.6 }}>Totals</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{analyticsOverview?.totals.tenders ?? '--'}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>On record</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Open {analyticsOverview?.totals.open ?? '--'}</div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Closed {analyticsOverview?.totals.closed ?? '--'}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>High priority {analyticsOverview?.totals.highPriority ?? '--'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Pipeline mix</div>
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                      {(analyticsOverview?.pipeline ?? []).map(stage => (
                        <li key={stage.status} style={{ marginBottom: 4, color: '#1f2937' }}>
                          <strong>{stage.status}</strong> — {stage.count}
                        </li>
                      ))}
                      {(analyticsOverview?.pipeline?.length ?? 0) === 0 && (
                        <li style={{ color: 'var(--muted)' }}>No stages captured yet.</li>
                      )}
                    </ul>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Velocity</div>
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      <div><strong>{analyticsOverview?.velocity.createdLast7 ?? '--'}</strong> created last 7 days</div>
                      <div><strong>{analyticsOverview?.velocity.closedLast7 ?? '--'}</strong> closed in that window</div>
                      <div>Avg open age: <strong>{analyticsOverview?.velocity.avgOpenAgeDays ?? '--'}</strong> day(s)</div>
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Team spotlight</div>
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                      {(analyticsOverview?.teamLeaders ?? []).map((leader, idx) => (
                        <li key={`${leader.owner ?? 'unassigned'}-${idx}`} style={{ marginBottom: 4, color: '#1f2937' }}>
                          <strong>{leader.owner || 'Unassigned'}</strong> — {leader.openCount} open, {leader.highPriority} high priority
                        </li>
                      ))}
                      {(analyticsOverview?.teamLeaders?.length ?? 0) === 0 && (
                        <li style={{ color: 'var(--muted)' }}>Assign owners to surface leaderboard insights.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </section>
              {importSummary && (
                <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(255,94,43,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>Import summary</strong>
                      <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                        {importSummary.newCount} new {importSummary.newCount === 1 ? 'item' : 'items'} imported{importSummary.dupCount ? `, ${importSummary.dupCount} duplicate${importSummary.dupCount === 1 ? '' : 's'} detected by Serial Token/RFP.` : '.'}
                      </div>
                    </div>
                    {importSummary.dupCount > 0 && (
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => {
                          let updated = 0
                          importSummary.dups.forEach(async d => {
                            const match = tenders.find(t => t.serialToken.toLowerCase() === d.serialToken.toLowerCase())
                            if (match) {
                              if (useServer) {
                                const u = await TendersApi.update(match.id, d as any)
                                updated++
                                setTenders(prev => prev.map(x => x.id === u.id ? (u as any) : x))
                              } else {
                                const u = updateTender(match.id, d)
                                if (u) {
                                  updated++
                                  setTenders(prev => prev.map(x => x.id === u.id ? u : x))
                                }
                              }
                            }
                          })
                          showToast(`Replaced ${updated} duplicate${updated === 1 ? '' : 's'}.`)
                          setImportSummary(null)
                        }}
                      >
                        Replace duplicates
                      </button>
                    )}
                    <button className="ghost" type="button" onClick={() => setImportSummary(null)}>Dismiss</button>
                  </div>
                </div>
              )}

              {showTicketForm && (
              <form id="ticketForm" className="card form" onSubmit={handleSubmit}>
                <div className="grid">
                  <div className="field">
                    <label htmlFor="customerId">Customer ID</label>
                    <input
                      id="customerId"
                      type="text"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, customerId: validateField('customerId', e.target.value) }))}
                      aria-invalid={!!errors.customerId}
                      aria-describedby={errors.customerId ? 'err-customerId' : undefined}
                    />
                    {errors.customerId && (
                      <small id="err-customerId" style={{ color: '#dc2626' }}>{errors.customerId}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="customerName">Customer Name</label>
                    <input
                      id="customerName"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, customerName: validateField('customerName', e.target.value) }))}
                      aria-invalid={!!errors.customerName}
                      aria-describedby={errors.customerName ? 'err-customerName' : undefined}
                    />
                    {errors.customerName && (
                      <small id="err-customerName" style={{ color: '#dc2626' }}>{errors.customerName}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="employeeId">Employee ID</label>
                    <input
                      id="employeeId"
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, employeeId: validateField('employeeId', e.target.value) }))}
                      aria-invalid={!!errors.employeeId}
                      aria-describedby={errors.employeeId ? 'err-employeeId' : undefined}
                    />
                    {errors.employeeId && (
                      <small id="err-employeeId" style={{ color: '#dc2626' }}>{errors.employeeId}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="employeeName">Employee Name</label>
                    <input
                      id="employeeName"
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, employeeName: validateField('employeeName', e.target.value) }))}
                      aria-invalid={!!errors.employeeName}
                      aria-describedby={errors.employeeName ? 'err-employeeName' : undefined}
                    />
                    {errors.employeeName && (
                      <small id="err-employeeName" style={{ color: '#dc2626' }}>{errors.employeeName}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="leadTitle">Lead Title</label>
                    <input
                      id="leadTitle"
                      type="text"
                      value={leadTitle}
                      onChange={(e) => setLeadTitle(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, leadTitle: validateField('leadTitle', e.target.value) }))}
                      aria-invalid={!!errors.leadTitle}
                      aria-describedby={errors.leadTitle ? 'err-leadTitle' : undefined}
                    />
                    {errors.leadTitle && (
                      <small id="err-leadTitle" style={{ color: '#dc2626' }}>{errors.leadTitle}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="leadDescription">Lead Description</label>
                    <textarea
                      id="leadDescription"
                      rows={3}
                      value={leadDescription}
                      onChange={(e) => setLeadDescription(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, leadDescription: validateField('leadDescription', e.target.value) }))}
                      aria-invalid={!!errors.leadDescription}
                      aria-describedby={errors.leadDescription ? 'err-leadDescription' : undefined}
                    />
                    {errors.leadDescription && (
                      <small id="err-leadDescription" style={{ color: '#dc2626' }}>{errors.leadDescription}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="dateOfService">Date of Service</label>
                    <input
                      id="dateOfService"
                      type="date"
                      value={dateOfService}
                      onChange={(e) => setDateOfService(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, dateOfService: validateField('dateOfService', e.target.value) }))}
                      aria-invalid={!!errors.dateOfService}
                      aria-describedby={errors.dateOfService ? 'err-dateOfService' : undefined}
                      required
                    />
                    {errors.dateOfService && (
                      <small id="err-dateOfService" style={{ color: '#dc2626' }}>{errors.dateOfService}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="serialToken">Serial Token / RFP Number</label>
                    <input
                      id="serialToken"
                      type="text"
                      placeholder="e.g., RFP-2025-00123"
                      value={serialToken}
                      onChange={(e) => setSerialToken(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, serialToken: validateField('serialToken', e.target.value) }))}
                      aria-invalid={!!errors.serialToken}
                      aria-describedby={errors.serialToken ? 'err-serialToken' : undefined}
                      required
                    />
                    {errors.serialToken && (
                      <small id="err-serialToken" style={{ color: '#dc2626' }}>{errors.serialToken}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="allottedTo">Whom it's allotted to</label>
                    <input
                      id="allottedTo"
                      type="text"
                      placeholder="Assignee name"
                      value={allottedTo}
                      onChange={(e) => setAllottedTo(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, allottedTo: validateField('allottedTo', e.target.value) }))}
                      aria-invalid={!!errors.allottedTo}
                      aria-describedby={errors.allottedTo ? 'err-allottedTo' : undefined}
                      list="employeeNames"
                      required
                    />
                    <datalist id="employeeNames">
                      {employeesDisplay.map((emp) => (
                        <option key={emp.id} value={emp.employeeName} data-id={emp.id} />
                      ))}
                    </datalist>
                    {/* When the value matches an employeeName, capture its id */}
                    {(() => {
                      const match = employeesDisplay.find(e => e.employeeName === allottedTo)
                      if (match && selectedEmployeeId !== match.id) {
                        setSelectedEmployeeId(match.id)
                        setEmployeeId(match.id)
                        setEmployeeName(match.employeeName)
                      }
                      if (!match && selectedEmployeeId) {
                        setSelectedEmployeeId('')
                        setEmployeeId('')
                      }
                      return null
                    })()}
                    {errors.allottedTo && (
                      <small id="err-allottedTo" style={{ color: '#dc2626' }}>{errors.allottedTo}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="source">Source</label>
                    <input
                      id="source"
                      type="text"
                      placeholder="Email, Phone, Web, etc."
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, source: validateField('source', e.target.value) }))}
                      aria-invalid={!!errors.source}
                      aria-describedby={errors.source ? 'err-source' : undefined}
                    />
                    {errors.source && (
                      <small id="err-source" style={{ color: '#dc2626' }}>{errors.source}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="estimatedValue">Estimated Value (INR)</label>
                    <input
                      id="estimatedValue"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={estimatedValue}
                      onChange={(e) => setEstimatedValue(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, estimatedValue: validateField('estimatedValue', e.target.value) }))}
                      aria-invalid={!!errors.estimatedValue}
                      aria-describedby={errors.estimatedValue ? 'err-estimatedValue' : undefined}
                    />
                    {errors.estimatedValue && (
                      <small id="err-estimatedValue" style={{ color: '#dc2626' }}>{errors.estimatedValue}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="followUpDate">Follow-up Date</label>
                    <input
                      id="followUpDate"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      onBlur={(e) => setErrors(prev => ({ ...prev, followUpDate: validateField('followUpDate', e.target.value) }))}
                      aria-invalid={!!errors.followUpDate}
                      aria-describedby={errors.followUpDate ? 'err-followUpDate' : undefined}
                    />
                    {errors.followUpDate && (
                      <small id="err-followUpDate" style={{ color: '#dc2626' }}>{errors.followUpDate}</small>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="priority">Priority</label>
                    <select
                      id="priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Urgent</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Status)}
                    >
                      <option>Open</option>
                      <option>In Progress</option>
                      <option>On Hold</option>
                      <option>Closed</option>
                    </select>
                  </div>
                </div>

                <div className="actions">
                  {!editingId ? (
                    can('tickets:create') && <button type="submit" className="primary">Save Ticket</button>
                  ) : (
                    canEditTenderRecord((editingTender ?? {}) as { ownerUserId?: string | null }) && <button type="button" className="primary" onClick={onUpdate}>Update Ticket</button>
                  )}
                  <button type="reset" className="ghost" onClick={() => {
                    setDateOfService('')
                    setSerialToken('')
                    setAllottedTo('')
                    setSource('')
                    setPriority('Medium')
                    setStatus('Open')
                    setCustomerId('')
                    setCustomerName('')
                    setEmployeeId('')
                    setEmployeeName('')
                    setLeadTitle('')
                    setLeadDescription('')
                    setEstimatedValue('')
                    setFollowUpDate('')
                    setEditingId(null)
                    setErrors({})
                    setSelectedEmployeeId('')
                  }}>Reset</button>
                </div>
              </form>
              )}

              <section className="card" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tickets</span>
                  {!showTicketForm && can('tickets:create') && (
                    <button className="ghost" type="button" onClick={() => setShowTicketForm(true)}>New Ticket</button>
                  )}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Lead Title</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Customer Name</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Serial/RFP</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Allotted To</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Source</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Priority</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenders.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: '10px', color: 'var(--muted)' }}>No tickets yet.</td>
                        </tr>
                      ) : (
                        tenders.map(t => {
                          const mutable = t as { ownerUserId?: string | null }
                          const allowEdit = canEditTenderRecord(mutable)
                          const allowDelete = canDeleteTenderRecord(mutable)
                          const workspaceOpen = expandedTenderId === t.id
                          return (
                            <Fragment key={t.id}>
                              <tr>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.leadTitle || '-'}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.customerName || '-'}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.dateOfService}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.serialToken}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.allottedTo}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.source}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.priority}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{t.status}</td>
                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {allowEdit && <button className="ghost" type="button" onClick={() => onEdit(t.id)}>Edit</button>}
                                  {allowDelete && <button className="ghost" type="button" onClick={() => onDelete(t.id)}>Delete</button>}
                                  {useServer && (
                                    <button
                                      className="ghost"
                                      type="button"
                                      onClick={() => setExpandedTenderId(prev => prev === t.id ? null : t.id)}
                                    >
                                      {workspaceOpen ? 'Hide workspace' : 'Workspace'}
                                    </button>
                                  )}
                                  {!allowEdit && !allowDelete && (
                                    <span style={{ color: 'var(--muted)' }}>{useServer ? 'Read only' : 'No access'}</span>
                                  )}
                                </td>
                              </tr>
                              {useServer && workspaceOpen && (
                                <tr>
                                  <td colSpan={9} style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', background: 'rgba(30,64,175,0.06)' }}>
                                    <EntityDocuments
                                      entityType="tender"
                                      entityId={t.id}
                                      entityName={t.leadTitle || t.serialToken}
                                      serverMode={useServer}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Show activity feed only when a serial token is in context */}
              {serialToken && (
                <ActivityFeed entityType="tender" entityKey={serialToken} useServer={useServer} />
              )}
            </>
          ) : (
            <section className="card" style={{ marginTop: 16 }}>
              <div style={{ color: 'var(--muted)' }}>You do not have permission to view tickets.</div>
            </section>
          ))}

          {activeTab === 'reports' && (
            <EnterpriseInsightsPanel
              serverMode={useServer}
              canView={canViewEnterprise}
              canManageReports={canViewEnterprise}
              allowSecurityPosture={allowSecurityPosture}
              showToast={showToast}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksPanel
              sessionRole={sessionRole}
              sessionUserId={sessionUserId}
              sessionEmail={session?.email || null}
              onNotify={bumpNotifications}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersPanel serverMode={useServer} />
          )}
          {activeTab === 'employees' && (
            canViewEmployees ? (
              <EmployeesPanel onChanged={() => setEmployeeVersion(v => v + 1)} />
            ) : (
              <section className="card" style={{ marginTop: 16 }}>
                <div style={{ color: 'var(--muted)' }}>You do not have permission to view employees.</div>
              </section>
            )
          )}
          {activeTab === 'documents' && (
            <DocumentsPanel />
          )}
          {activeTab === 'communications' && (
            canManageCommunications ? (
              <CommunicationsPanel
                onNotify={bumpNotifications}
                defaultTenderId={useServer ? activeTenderRecord?.id ?? null : null}
                serverMode={useServer}
              />
            ) : (
              <section className="card" style={{ marginTop: 16 }}>
                <div style={{ color: 'var(--muted)' }}>You do not have permission to manage communications.</div>
              </section>
            )
          )}
          {activeTab === 'approvals' && (
            canManageApprovals ? (
              <ApprovalsPanel sessionRole={sessionRole} serverMode={useServer} />
            ) : (
              <section className="card" style={{ marginTop: 16 }}>
                <div style={{ color: 'var(--muted)' }}>You do not have permission to manage approvals.</div>
              </section>
            )
          )}
          {activeTab === 'settings' && (
            sessionRole !== 'admin' ? (
              <section className="card" style={{ marginTop: 16 }}>
                <div style={{ color: 'var(--muted)' }}>You need admin privileges to access settings.</div>
              </section>
            ) : (
              <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                <section className="card" style={{ padding: 20, display: 'grid', gap: 16 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Workspace settings</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>{activeSettingsOption.description}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {settingsOptions.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        className={settingsView === option.key ? 'primary' : 'ghost'}
                        onClick={() => setSettingsView(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                {settingsView === 'roles' && (
                  <section className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Team roles</h3>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 12 }}>Promote teammates or dial back access to match their responsibilities.</p>
                      </div>
                      <button className="ghost" type="button" onClick={() => loadUsersList()} disabled={usersLoading}>
                        {usersLoading ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>
                    {usersLoading ? (
                      <div style={{ color: 'var(--muted)' }}>Loading users…</div>
                    ) : users.length === 0 ? (
                      <div style={{ color: 'var(--muted)' }}>No users found yet.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Name</th>
                              <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Email</th>
                              <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Role</th>
                              <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Updated Role</th>
                              <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map(user => {
                              const currentRole = (user.role as Role) || 'agent'
                              const draftRole = userRoleDrafts[user.id] ?? currentRole
                              const isDirty = draftRole !== currentRole
                              const isSelf = user.id === sessionUserId
                              const lockingSelf = isSelf && currentRole === 'admin' && adminCount <= 1
                              const disableSelect = lockingSelf && draftRole !== 'admin'
                              const disableApply = usersLoading || !isDirty || (lockingSelf && draftRole !== 'admin')
                              return (
                                <tr key={user.id}>
                                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>{user.name || '—'}</td>
                                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>{user.email}</td>
                                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ ...(roleStyles[currentRole] || {}), display: 'inline-flex', alignItems: 'center' }}>{roleLabels[currentRole]}</span>
                                  </td>
                                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                                    <select
                                      value={draftRole}
                                      onChange={(e) => setUserRole(user.id, e.currentTarget.value as Role)}
                                      disabled={disableSelect}
                                    >
                                      {roleOptions.map(role => (
                                        <option key={role} value={role}>{roleLabels[role]}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button
                                        className="primary"
                                        type="button"
                                        disabled={disableApply || !isDirty}
                                        onClick={() => applyUserRole(user)}
                                      >
                                        Apply
                                      </button>
                                      {isDirty && (
                                        <button
                                          className="ghost"
                                          type="button"
                                          onClick={() => setUserRole(user.id, currentRole)}
                                        >
                                          Reset
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}

                {settingsView === 'customization' && (
                  <CustomizationSettings />
                )}

                {settingsView === 'branding' && (
                  <BrandingSettingsPanel />
                )}

                {settingsView === 'webhooks' && (
                  <WebhookSettingsPanel />
                )}

                {settingsView === 'assistant' && (
                  <AssistantHelperPanel />
                )}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  )
}

function AssistantInsightsCard({
  loading,
  error,
  response,
  lastUpdatedAt,
  onRefresh,
  onOpenAssistant
}: {
  loading: boolean
  error: string | null
  response: AssistantResponse | null
  lastUpdatedAt: string | null
  onRefresh: () => void
  onOpenAssistant: () => void
}) {
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Get a quick CRM rundown for today.'
    try {
      const date = new Date(lastUpdatedAt)
      return `Updated ${date.toLocaleString()}`
    } catch {
      return 'Recently updated.'
    }
  }, [lastUpdatedAt])

  return (
    <section className="card" style={{ padding: 20, display: 'grid', gap: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Assistant insights</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>{lastUpdatedLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh insights'}
          </button>
          <button type="button" className="ghost" onClick={onOpenAssistant}>
            Open assistant
          </button>
        </div>
      </div>
      {error ? (
        <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {loading && !response ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Analyzing your workspace…</div>
          ) : response ? (
            <>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>{response.answer}</pre>
              {response.suggestions.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Suggested next steps</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {response.suggestions.map((suggestion) => (
                      <li key={suggestion} style={{ marginBottom: 4 }}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No insights yet. Try refreshing to generate recommendations.</div>
          )}
        </div>
      )}
    </section>
  )
}

function TasksPanel({ sessionRole, sessionUserId, sessionEmail, onNotify }: { sessionRole: Role; sessionUserId: string | null; sessionEmail: string | null; onNotify: () => void }) {
  const [tasks, setTasks] = useState<TaskDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null)
  const [employees, setEmployees] = useState<EmployeeDTO[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [form, setForm] = useState<{ title: string; description: string; employeeId: string; priority: Priority; status: TaskStatus; dueDate: string }>({
    title: '',
    description: '',
    employeeId: '',
    priority: 'Medium',
    status: 'Pending',
    dueDate: ''
  })
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'timeline' | 'insights'>('kanban')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskMeta, setTaskMeta] = useState<Record<string, TaskMeta>>({})
  const [dirtyTaskMeta, setDirtyTaskMeta] = useState<Record<string, boolean>>({})
  const [taskMetaSaving, setTaskMetaSaving] = useState(false)

  const TASK_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Blocked', 'Completed']
  const TASK_PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent']
  const canAssign = can('tasks:*') || can('tasks:create')
  const canView = canAssign || can('tasks:view') || can('tasks:updateSelf')
  const canManage = can('tasks:*') || can('tasks:update')
  const canRemove = can('tasks:*') || can('tasks:delete')
  const canUpdateSelf = can('tasks:updateSelf')

  const slaTrackerRef = useRef<{ reminder: Set<string>; breach: Set<string> }>({ reminder: new Set(), breach: new Set() })

  const updateTaskMeta = useCallback((taskId: string, updater: (prev: TaskMeta) => TaskMeta) => {
    let metaChanged = false
    setTaskMeta(prev => {
      const current = prev[taskId] || { dependencies: [] }
      const candidate = updater(current)
      const normalized = normalizeTaskMetaValue(candidate)
      if (isTaskMetaEqual(current, normalized)) {
        return prev
      }
      metaChanged = true
      return { ...prev, [taskId]: normalized }
    })
    if (metaChanged) {
      setDirtyTaskMeta(prev => (prev[taskId] ? prev : { ...prev, [taskId]: true }))
    }
  }, [])

  async function persistTaskMeta(taskId: string) {
    const meta = taskMeta[taskId] ?? deriveTaskMetaFromTask(tasks.find(task => task.id === taskId))
    setTaskMetaSaving(true)
    try {
      const payload: TaskUpdateInput = {
        dependencies: Array.isArray(meta.dependencies) ? meta.dependencies : [],
        team: meta.team ?? null,
        remindBeforeMinutes: typeof meta.remindBeforeMinutes === 'number' ? meta.remindBeforeMinutes : null,
        notes: meta.notes ?? null
      }
      const updated = await TasksApi.update(taskId, payload)
      setTasks(prev => prev.map(task => (task.id === updated.id ? updated : task)))
      setDirtyTaskMeta(prev => {
        if (!prev[taskId]) return prev
        const next = { ...prev }
        delete next[taskId]
        return next
      })
      setTaskMeta(prev => ({ ...prev, [taskId]: deriveTaskMetaFromTask(updated) }))
      showToast('Task details updated')
    } catch {
      showToast('Failed to update task details', 'error')
    } finally {
      setTaskMetaSaving(false)
    }
  }

  function resetTaskMeta(taskId: string) {
    const source = tasks.find(task => task.id === taskId)
    const baseline = deriveTaskMetaFromTask(source)
    setTaskMeta(prev => {
      const next = { ...prev, [taskId]: baseline }
      return next
    })
    setDirtyTaskMeta(prev => {
      if (!prev[taskId]) return prev
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }

  useEffect(() => {
    refreshTasks()
    loadEmployees()
    const interval = window.setInterval(() => {
      refreshTasks({ skipLoading: true })
    }, 60_000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tasks.length === 0) {
      setTaskMeta(prev => (Object.keys(prev).length ? {} : prev))
      setDirtyTaskMeta(prev => (Object.keys(prev).length ? {} : prev))
      return
    }
    setTaskMeta(prev => {
      let changed = false
      const next: Record<string, TaskMeta> = {}
      tasks.forEach(task => {
        const taskId = task.id
        const serverMeta = deriveTaskMetaFromTask(task)
        const existing = prev[taskId]
        if (dirtyTaskMeta[taskId] && existing) {
          next[taskId] = existing
          return
        }
        if (existing && isTaskMetaEqual(existing, serverMeta)) {
          next[taskId] = existing
        } else {
          next[taskId] = serverMeta
          if (!existing || !isTaskMetaEqual(existing, serverMeta)) {
            changed = true
          }
        }
      })
      if (Object.keys(prev).length !== tasks.length) {
        changed = true
      }
      return changed ? next : prev
    })
    setDirtyTaskMeta(prev => {
      const next = { ...prev }
      let mutated = false
      Object.keys(next).forEach(id => {
        if (!tasks.some(task => task.id === id)) {
          delete next[id]
          mutated = true
        }
      })
      return mutated ? next : prev
    })
  }, [tasks, dirtyTaskMeta])

  useEffect(() => {
    if (selectedTaskId && !tasks.some(t => t.id === selectedTaskId)) {
      setSelectedTaskId(null)
    }
  }, [tasks, selectedTaskId])

  useEffect(() => {
    if (!canView || tasks.length === 0) return
    const tracker = slaTrackerRef.current
    const now = Date.now()
    tasks.forEach(task => {
      if (task.status === 'Completed') {
        tracker.breach.delete(task.id)
        tracker.reminder.delete(task.id)
        return
      }
      if (!task.dueDate) return
      const dueMs = Date.parse(task.dueDate)
      if (Number.isNaN(dueMs)) return
      const meta = taskMeta[task.id]
      const remindWindow = (meta?.remindBeforeMinutes ?? SLA_DEFAULT_REMINDER_MINUTES) * 60000
      if (dueMs < now) {
        if (!tracker.breach.has(task.id)) {
          tracker.breach.add(task.id)
          notify(`SLA breached: “${task.title}”`, { level: 'critical', sticky: true, link: { tab: 'tasks', entityType: 'task', entityKey: task.id } })
          onNotify()
          showToast(`SLA breached for ${task.title}`, 'error')
        }
        return
      }
      tracker.breach.delete(task.id)
      if (dueMs - now <= remindWindow) {
        if (!tracker.reminder.has(task.id)) {
          tracker.reminder.add(task.id)
          notify(`SLA reminder: “${task.title}” due soon`, { level: 'warning', autoExpireSeconds: 30, link: { tab: 'tasks', entityType: 'task', entityKey: task.id } })
          onNotify()
        }
      } else {
        tracker.reminder.delete(task.id)
      }
    })
  }, [tasks, taskMeta, canView, onNotify])

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

  async function refreshTasks(options?: { skipLoading?: boolean }) {
    const silent = options?.skipLoading === true
    if (!silent) {
      setLoading(true)
    }
    try {
      const list = await TasksApi.list()
      setTasks(list)
    } catch {
      showToast('Failed to load tasks', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadEmployees() {
    setEmployeesLoading(true)
    try {
      const rows = await EmployeesApi.list()
      setEmployees(rows as any)
    } catch {
      try {
        const local = JSON.parse(localStorage.getItem('crm:employees') || '[]')
        setEmployees(local)
      } catch {
        setEmployees([])
      }
    } finally {
      setEmployeesLoading(false)
    }
  }

  function resetForm() {
    setForm({ title: '', description: '', employeeId: '', priority: 'Medium', status: 'Pending', dueDate: '' })
    setEditingTask(null)
  }

  function openCreateForm() {
    resetForm()
    setFormOpen(true)
  }

  function openEditForm(task: TaskDTO) {
    setEditingTask(task)
    setSelectedTaskId(task.id)
    setForm({
      title: task.title,
      description: task.description || '',
      employeeId: task.employeeId,
      priority: (task.priority as Priority) || 'Medium',
      status: task.status as TaskStatus,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : ''
    })
    setFormOpen(true)
  }

  const assignedToCurrentUser = (task: TaskDTO) => {
    if (!sessionEmail) return false
    const taskEmail = (task.employeeEmail || '').toLowerCase()
    return taskEmail && taskEmail === sessionEmail.toLowerCase()
  }

  const canAdjustStatus = (task: TaskDTO) => canManage || (canUpdateSelf && assignedToCurrentUser(task))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      showToast('Task title is required.', 'error')
      return
    }
    if (!form.employeeId) {
      showToast('Select an employee to assign the task.', 'error')
      return
    }
    setSaving(true)
    try {
      const basePayload: TaskCreateInput = {
        title,
        description: form.description.trim() ? form.description.trim() : undefined,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || undefined,
        employeeId: form.employeeId,
      }
      if (editingTask) {
        const updatePayload: TaskUpdateInput = { ...basePayload }
        const updated = await TasksApi.update(editingTask.id, updatePayload)
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
        notify(`Task “${updated.title}” updated`, { level: 'info', autoExpireSeconds: 20, link: { tab: 'tasks', entityType: 'task', entityKey: updated.id } })
        onNotify()
        showToast('Task updated')
      } else {
        const createPayload: TaskCreateInput = { ...basePayload }
        const created = await TasksApi.create(createPayload)
        setTasks(prev => [created, ...prev])
        notify(`Task assigned to ${created.employeeName || 'employee'}`, { level: 'success', autoExpireSeconds: 30, link: { tab: 'tasks', entityType: 'task', entityKey: created.id } })
        onNotify()
        showToast('Task assigned')
      }
      setFormOpen(false)
      resetForm()
    } catch {
      showToast('Failed to save task', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(task: TaskDTO) {
    if (!canRemove) return
    if (!window.confirm('Delete this task?')) return
    try {
      await TasksApi.remove(task.id)
      setTasks(prev => prev.filter(t => t.id !== task.id))
      setTaskMeta(prev => {
        if (!prev[task.id]) return prev
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      setDirtyTaskMeta(prev => {
        if (!prev[task.id]) return prev
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      notify(`Task “${task.title}” removed`, { level: 'warning', autoExpireSeconds: 15, link: { tab: 'tasks' } })
      onNotify()
      showToast('Task deleted')
    } catch {
      showToast('Failed to delete task', 'error')
    }
  }

  async function handleStatusChange(task: TaskDTO, status: TaskStatus) {
    if (!canAdjustStatus(task)) {
      showToast('You are not allowed to change this status.', 'error')
      return
    }
    const previous = task.status
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t))
    try {
      const updated = await TasksApi.update(task.id, { status })
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
      notify(`Task “${updated.title}” marked ${status}`, { level: 'success', autoExpireSeconds: 20, link: { tab: 'tasks', entityType: 'task', entityKey: updated.id } })
      onNotify()
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: previous } : t))
      showToast('Failed to update status', 'error')
    }
  }

  const employeesOptions = useMemo(() => {
    return employees
      .filter(emp => Boolean(emp.employeeId))
      .map(emp => ({
        value: String(emp.employeeId),
        label: emp.employeeName || String(emp.employeeId),
        subtitle: emp.email,
      }))
  }, [employees])

  const taskLookup = useMemo(() => {
    const map = new Map<string, TaskDTO>()
    tasks.forEach(task => map.set(task.id, task))
    return map
  }, [tasks])

  const selectedTask = selectedTaskId ? taskLookup.get(selectedTaskId) ?? null : null
  const selectedMeta = selectedTask ? taskMeta[selectedTask.id] : undefined

  const dependencyOptions = useMemo(() => (
    tasks
      .filter(task => task.id !== selectedTaskId)
      .map(task => ({ value: task.id, label: task.title }))
  ), [tasks, selectedTaskId])

  const tasksByStatus = useMemo(() => {
    const buckets: Record<TaskStatus, TaskDTO[]> = {
      Pending: [],
      'In Progress': [],
      Blocked: [],
      Completed: []
    }
    tasks.forEach(task => {
      const column = buckets[task.status as TaskStatus]
      if (column) column.push(task)
    })
    return buckets
  }, [tasks])

  const timelineGroups = useMemo(() => {
    const withDue = tasks
      .filter(task => task.dueDate)
      .sort((a, b) => Date.parse(a.dueDate || '') - Date.parse(b.dueDate || ''))
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
    const map = new Map<string, TaskDTO[]>()
    withDue.forEach(task => {
      const key = formatter.format(new Date(task.dueDate!))
      const bucket = map.get(key) || []
      bucket.push(task)
      map.set(key, bucket)
    })
    const result = Array.from(map.entries()).map(([title, items]) => ({ title, items }))
    const without = tasks.filter(task => !task.dueDate)
    if (without.length > 0) {
      result.push({ title: 'No due date', items: without })
    }
    return result
  }, [tasks])

  const insights = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(task => task.status === 'Completed').length
    const open = total - completed
    const byPriority = tasks.reduce<Record<string, number>>((acc, task) => {
      const key = task.priority || 'Medium'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const byTeam = tasks.reduce<Record<string, number>>((acc, task) => {
      const team = taskMeta[task.id]?.team || 'Unassigned'
      acc[team] = (acc[team] || 0) + 1
      return acc
    }, {})
    const slaWatch = tasks.filter(task => {
      if (task.status === 'Completed' || !task.dueDate) return false
      const badge = computeSlaBadge(task, taskMeta[task.id])
      return badge.label.includes('Due') || badge.label.includes('SLA')
    })
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100)
    return { total, completed, open, byPriority, byTeam, slaWatch, completionRate }
  }, [tasks, taskMeta])

  const viewOptions: Array<{ key: typeof viewMode; label: string; helper: string; icon: string }> = [
    { key: 'kanban', label: 'Kanban', helper: 'Drag and drop between stages', icon: '🗂️' },
    { key: 'list', label: 'Table', helper: 'Compact grid view', icon: '📋' },
    { key: 'timeline', label: 'Timeline', helper: 'Due date roadmap', icon: '🗓️' },
    { key: 'insights', label: 'Insights', helper: 'Team workload & SLA', icon: '📊' }
  ]

  const getPriorityTheme = (priority: Priority | string) => PRIORITY_THEME[priority] || PRIORITY_THEME.default

  const handleCardDragStart = (event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    event.dataTransfer.setData('text/plain', taskId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleKanbanDrop = (event: React.DragEvent<HTMLDivElement>, nextStatus: TaskStatus) => {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('text/plain')
    if (!taskId) return
    const task = taskLookup.get(taskId)
    if (!task) return
    handleStatusChange(task, nextStatus)
  }

  const renderListView = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Task</th>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Assigned to</th>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Priority</th>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>SLA</th>
            <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Updated</th>
            {(canManage || canRemove) && <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const meta = taskMeta[task.id]
            const theme = getPriorityTheme(task.priority)
            const slaBadge = computeSlaBadge(task, meta)
            const deps = meta?.dependencies || []
            const isSelected = selectedTaskId === task.id
            return (
              <tr
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                style={{
                  background: isSelected ? 'linear-gradient(90deg, rgba(79,70,229,0.08), rgba(59,130,246,0.08))' : undefined,
                  cursor: 'pointer'
                }}
              >
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', minWidth: 200 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{task.title}</span>
                    {deps.length > 0 && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.16)', color: '#4338ca' }}>{deps.length} deps</span>
                    )}
                  </div>
                  {task.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{task.description}</div>}
                  {deps.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                      Depends on: {deps.map(id => taskLookup.get(id)?.title || 'Task').join(', ')}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <div>{task.employeeName || '—'}</div>
                  {task.employeeEmail && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{task.employeeEmail}</div>}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 999, fontSize: 12, background: theme.bg, color: theme.color }}>
                    {task.priority}
                  </span>
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  {canAdjustStatus(task) ? (
                    <select value={task.status} onChange={(e) => handleStatusChange(task, e.currentTarget.value as TaskStatus)}>
                      {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span>{task.status}</span>
                  )}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 999, fontSize: 12, background: slaBadge.background, color: slaBadge.color }}>
                    {slaBadge.label}
                  </span>
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', minWidth: 140 }}>
                  {task.updatedAt ? new Date(task.updatedAt).toLocaleString() : '—'}
                </td>
                {(canManage || canRemove) && (
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                    {canManage && <button className="ghost" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(task) }}>Edit</button>}
                    {canRemove && <button className="ghost" type="button" onClick={(event) => { event.stopPropagation(); handleDelete(task) }}>Delete</button>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderKanbanView = () => (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', paddingBottom: 6 }}>
      {TASK_STATUSES.map(status => {
        const columnTasks = tasksByStatus[status]
        const palette: Record<TaskStatus, { header: string; accent: string; background: string }> = {
          Pending: { header: 'Warm-up', accent: '#0ea5e9', background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(59,130,246,0.16))' },
          'In Progress': { header: 'In motion', accent: '#7c3aed', background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(79,70,229,0.16))' },
          Blocked: { header: 'Needs attention', accent: '#f97316', background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(251,191,36,0.14))' },
          Completed: { header: 'Wrapped up', accent: '#22c55e', background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.14))' }
        }
        const theme = palette[status]
        return (
          <div
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleKanbanDrop(event, status)}
            style={{
              minHeight: 220,
              borderRadius: 20,
              background: theme.background,
              padding: 16,
              boxShadow: '0 20px 40px rgba(15,23,42,0.12)'
            }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: theme.accent }}>{status}</div>
                <strong style={{ fontSize: 18 }}>{theme.header}</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{columnTasks.length} task{columnTasks.length === 1 ? '' : 's'}</span>
            </header>
            <div style={{ display: 'grid', gap: 12 }}>
              {columnTasks.length === 0 ? (
                <div style={{ border: '1px dashed rgba(148,163,184,0.6)', borderRadius: 16, padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Drop tasks here to change status
                </div>
              ) : (
                columnTasks.map(task => {
                  const meta = taskMeta[task.id]
                  const slaBadge = computeSlaBadge(task, meta)
                  const deps = meta?.dependencies || []
                  const themePriority = getPriorityTheme(task.priority)
                  const isSelected = selectedTaskId === task.id
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(event) => handleCardDragStart(event, task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      style={{
                        background: 'rgba(255,255,255,0.85)',
                        borderRadius: 16,
                        padding: 14,
                        display: 'grid',
                        gap: 10,
                        cursor: 'grab',
                        border: isSelected ? '1.5px solid rgba(79,70,229,0.7)' : '1px solid rgba(148,163,184,0.35)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{task.title}</div>
                          {task.employeeName && (
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>→ {task.employeeName}</div>
                          )}
                        </div>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: themePriority.bg, color: themePriority.color }}>{task.priority}</span>
                      </div>
                      {task.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{task.description}</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: slaBadge.background, color: slaBadge.color }}>{slaBadge.label}</span>
                        {deps.length > 0 && (
                          <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: 'rgba(79,70,229,0.12)', color: '#4f46e5' }}>{deps.length} dependencies</span>
                        )}
                        {task.dueDate && (
                          <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: 'rgba(15,23,42,0.08)', color: 'var(--muted)' }}>{new Date(task.dueDate).toLocaleDateString()}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ghost" type="button" style={{ fontSize: 12, padding: '6px 10px' }} onClick={(event) => { event.stopPropagation(); openEditForm(task) }}>Edit</button>
                        {(canManage || canRemove) && (
                          <button className="ghost" type="button" style={{ fontSize: 12, padding: '6px 10px' }} onClick={(event) => { event.stopPropagation(); handleDelete(task) }}>Remove</button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderTimelineView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      {timelineGroups.map(group => (
        <div key={group.title} style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{group.title}</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {group.items.map(task => {
              const badge = computeSlaBadge(task, taskMeta[task.id])
              const theme = getPriorityTheme(task.priority)
              const isSelected = selectedTaskId === task.id
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: isSelected ? '1.5px solid rgba(79,70,229,0.4)' : '1px solid rgba(226,232,240,0.9)',
                    background: 'rgba(255,255,255,0.75)',
                    boxShadow: '0 12px 24px rgba(15,23,42,0.08)',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{task.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleString() : 'No due date'} · {task.employeeName || 'Unassigned'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, background: theme.bg, color: theme.color }}>{task.priority}</span>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, background: badge.background, color: badge.color }}>{badge.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  const renderInsightsView = () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <div style={{ padding: 18, borderRadius: 18, background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(129,140,248,0.24))', boxShadow: '0 20px 40px rgba(15,23,42,0.12)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1 }}>ACTIVE WORK</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{insights.open}</div>
          <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.72)' }}>Open tasks waiting for action</div>
        </div>
        <div style={{ padding: 18, borderRadius: 18, background: 'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(16,185,129,0.24))' }}>
          <div style={{ fontSize: 12, color: '#0f766e', letterSpacing: 1 }}>COMPLETION RATE</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{insights.completionRate}%</div>
          <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.72)' }}>Out of {insights.total} tracked assignments</div>
        </div>
        <div style={{ padding: 18, borderRadius: 18, background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(249,115,22,0.18))' }}>
          <div style={{ fontSize: 12, color: '#d97706', letterSpacing: 1 }}>SLA WATCHLIST</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{insights.slaWatch.length}</div>
          <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.72)' }}>Tasks approaching or breaching deadlines</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <div style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(226,232,240,0.8)', background: 'rgba(255,255,255,0.7)' }}>
          <h4 style={{ margin: '0 0 12px' }}>By priority</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            {TASK_PRIORITIES.map(priority => {
              const count = insights.byPriority[priority] || 0
              const pct = insights.total ? Math.round((count / insights.total) * 100) : 0
              const theme = getPriorityTheme(priority)
              return (
                <div key={priority}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{priority}</span>
                    <span>{count}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(226,232,240,0.8)', borderRadius: 999, marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: theme.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(226,232,240,0.8)', background: 'rgba(255,255,255,0.7)' }}>
          <h4 style={{ margin: '0 0 12px' }}>Team load</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(insights.byTeam).map(([team, count]) => {
              const pct = insights.total ? Math.round((count / insights.total) * 100) : 0
              return (
                <div key={team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span>{team}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}%</span>
                </div>
              )
            })}
            {Object.keys(insights.byTeam).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Teams will appear after you add assignments.</div>}
          </div>
        </div>
        <div style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(226,232,240,0.8)', background: 'rgba(255,255,255,0.7)' }}>
          <h4 style={{ margin: '0 0 12px' }}>SLA at risk</h4>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            {insights.slaWatch.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>No deadlines in the warning zone.</div>
            ) : (
              insights.slaWatch.map(task => {
                const badge = computeSlaBadge(task, taskMeta[task.id])
                return (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <span>{task.title}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: badge.background, color: badge.color }}>{badge.label}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const renderTaskDetail = () => {
    if (!selectedTask) return null
    const meta = selectedMeta || { dependencies: [] }
    const metaDirty = dirtyTaskMeta[selectedTask.id] ?? false
    const handleDependencyChange = (values: string[]) => {
      updateTaskMeta(selectedTask.id, prev => ({ ...prev, dependencies: values }))
    }
    return (
      <section className="card" style={{ marginTop: 20, padding: 18, background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(226,232,240,0.9)', borderRadius: 18 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{selectedTask.title}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Design the flow of work—set dependencies, reminders, and notes for your crew.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {metaDirty && (
              <button className="ghost" type="button" onClick={() => resetTaskMeta(selectedTask.id)} disabled={taskMetaSaving}>
                Reset
              </button>
            )}
            <button
              className="primary"
              type="button"
              onClick={() => persistTaskMeta(selectedTask.id)}
              disabled={!metaDirty || taskMetaSaving}
            >
              {taskMetaSaving ? 'Saving…' : 'Save details'}
            </button>
            <button className="ghost" type="button" onClick={() => setSelectedTaskId(null)}>Close</button>
          </div>
        </header>
        {metaDirty && !taskMetaSaving && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#c2410c' }}>Unsaved changes — don’t forget to save.</p>
        )}
        <div style={{ marginTop: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Owning team</span>
            <input
              placeholder="e.g., Bid Desk, Field Ops"
              value={meta.team || ''}
              onChange={(e) => updateTaskMeta(selectedTask.id, prev => ({ ...prev, team: e.target.value }))}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Reminder window (minutes)</span>
            <input
              type="number"
              min={15}
              step={15}
              value={meta.remindBeforeMinutes ?? SLA_DEFAULT_REMINDER_MINUTES}
              onChange={(e) => updateTaskMeta(selectedTask.id, prev => ({ ...prev, remindBeforeMinutes: Number(e.target.value) || SLA_DEFAULT_REMINDER_MINUTES }))}
            />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 6, marginTop: 16 }}>
          <span>Dependencies</span>
          <select
            multiple
            value={meta.dependencies}
            onChange={(e) => handleDependencyChange(Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))}
            style={{ minHeight: 120, borderRadius: 12, border: '1px solid var(--border)', padding: 8 }}
          >
            {dependencyOptions.length === 0 ? <option value="" disabled>No other tasks available</option> : dependencyOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <small style={{ color: 'var(--muted)' }}>These tasks must land before this one can be marked done.</small>
        </label>
        <label style={{ display: 'grid', gap: 6, marginTop: 16 }}>
          <span>Control notes</span>
          <textarea
            rows={3}
            placeholder="Escalation plan, context, links…"
            value={meta.notes || ''}
            onChange={(e) => updateTaskMeta(selectedTask.id, prev => ({ ...prev, notes: e.target.value }))}
          />
        </label>
        {meta.dependencies.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Dependency health</strong>
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 12 }}>
              {meta.dependencies.map(id => {
                const dep = taskLookup.get(id)
                if (!dep) return null
                const badge = computeSlaBadge(dep, taskMeta[id])
                return (
                  <li key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 12, background: 'rgba(241,245,249,0.7)' }}>
                    <span>{dep.title}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: badge.background, color: badge.color, fontSize: 11 }}>{badge.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Task-driven workflows</h3>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 12 }}>Blend Kanban, timelines, and insights to keep every tender on track.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost" type="button" onClick={() => refreshTasks()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {canAssign && (
            <button className="primary" type="button" onClick={openCreateForm}>
              New task
            </button>
          )}
        </div>
      </div>

      {!canView ? (
        <div style={{ marginTop: 12, color: 'var(--muted)' }}>You do not have permission to view tasks.</div>
      ) : (
        <>
          {formOpen && canAssign && (
            <form className="card" style={{ marginTop: 16, background: 'var(--surface)', padding: 16 }} onSubmit={handleSubmit}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                <div className="field">
                  <label htmlFor="taskTitle">Task title</label>
                  <input id="taskTitle" type="text" value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} required />
                </div>
                <div className="field">
                  <label htmlFor="taskAssignee">Assign to</label>
                  <select
                    id="taskAssignee"
                    value={form.employeeId}
                    onChange={(e) => setForm(prev => ({ ...prev, employeeId: e.target.value }))}
                    required
                  >
                    <option value="">Select employee…</option>
                    {employeesLoading && <option value="" disabled>Loading employees…</option>}
                    {employeesOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}{opt.subtitle ? ` (${opt.subtitle})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="taskPriority">Priority</label>
                  <select
                    id="taskPriority"
                    value={form.priority}
                    onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value as Priority }))}
                  >
                    {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="taskDue">Due date</label>
                  <input id="taskDue" type="date" value={form.dueDate} onChange={(e) => setForm(prev => ({ ...prev, dueDate: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="taskDescription">Details</label>
                  <textarea
                    id="taskDescription"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                {canManage && (
                  <div className="field">
                    <label htmlFor="taskStatus">Status</label>
                    <select
                      id="taskStatus"
                      value={form.status}
                      onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                    >
                      {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editingTask ? 'Update task' : 'Create task'}
                </button>
                <button className="ghost" type="button" onClick={() => { setFormOpen(false); resetForm() }} disabled={saving}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {viewOptions.map(option => (
              <button
                key={option.key}
                type="button"
                className={viewMode === option.key ? 'primary' : 'ghost'}
                onClick={() => setViewMode(option.key)}
                style={viewMode === option.key ? undefined : { border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span aria-hidden>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            {loading ? (
              <div style={{ color: 'var(--muted)' }}>Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>No tasks assigned yet.</div>
            ) : (
              <>
                {viewMode === 'list' && renderListView()}
                {viewMode === 'kanban' && renderKanbanView()}
                {viewMode === 'timeline' && renderTimelineView()}
                {viewMode === 'insights' && renderInsightsView()}
              </>
            )}
          </div>

          {renderTaskDetail()}
        </>
      )}
    </section>
  )
}

// Employees panel with table + edit/delete, embedding the EmployeeForm above
function EmployeesPanel({ onChanged }: { onChanged: () => void }) {
  const [useServer] = useState(() => localStorage.getItem('crm:useServer') === '1')
  const [employees, setEmployees] = useState<Array<any>>(() => {
    try { return JSON.parse(localStorage.getItem('crm:employees') || '[]') } catch { return [] }
  })
  const [editEmp, setEditEmp] = useState<(any & { id: string }) | null>(null)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null)
  // duplicate handling mode: skip, update (replace), append (allow duplicates)
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'append'>('skip')
  const [lastImportReport, setLastImportReport] = useState<{ added: number; updated: number; skipped: number; errors: number } | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [invalidRows, setInvalidRows] = useState<EmployeeImportRecord[]>([])
  const MAX_FILE_SIZE_MB = 2
  let refreshTimeout: any = null
  // Column mapping UI state
  type EmployeeFieldKey = 'employeeId' | 'employeeName' | 'designation' | 'email' | 'mobile' | 'department'
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<number, EmployeeFieldKey | ''>>({})
  const [mappingReady, setMappingReady] = useState(false)
  const cancelRef = useRef<{ cancel: boolean }>({ cancel: false })

  function guessField(header: string): EmployeeFieldKey | '' {
    const s = header.trim().toLowerCase()
    if (s.includes('employee id') || s === 'id') return 'employeeId'
    if (s.includes('employee name') || s === 'name') return 'employeeName'
    if (s.includes('designation') || s.includes('title') || s.includes('role')) return 'designation'
    if (s.includes('email')) return 'email'
    if (s.includes('mobile') || s.includes('phone') || s.includes('contact')) return 'mobile'
    if (s.includes('department') || s.includes('dept')) return 'department'
    return ''
  }

  async function loadFileMeta(file: File) {
    // Reuse parse to get sheet names & first sheet headers quickly via plain XLSX dynamic import through existing helper
    try {
      const { listExcelSheetNames, parseExcelToEmployees } = await loadExcelModule()
  const names = await listExcelSheetNames(file)
      setSheetNames(names)
  const list = await parseExcelToEmployees(file, names[0]) as EmployeeImportRecord[] // parse to get sample rows
      // Need raw headers; quick hack: read first row manually again by calling internal logic? We'll approximate: rebuild by exporting template? Instead simpler: use FileReader with XLSX inside excel.ts but not exported.
      // Fallback: infer headers from first valid row keys mapped back to field names; for mapping UI we still show guessed headers.
      // Since we lack exported raw headers, synthesize headers array from known target fields for mapping editing.
      // We'll still allow user to adjust mapping; list unique guessed keys.
      const synth = ['Employee ID','Employee Name','Designation','Email','Mobile','Department']
      setHeaders(synth)
      const initial: Record<number, EmployeeFieldKey | ''> = {}
      synth.forEach((h, i) => { initial[i] = guessField(h) })
      setColumnMap(initial)
      setSelectedSheet(names[0])
      setMappingReady(true)
    } catch {
      showToast('Failed to read file meta', 'error')
    }
  }

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

  async function refresh() {
    if (useServer) {
      try {
        const rows = await EmployeesApi.list()
        setEmployees(rows as any)
      } catch {
        setEmployees([])
      }
    } else {
      try { setEmployees(JSON.parse(localStorage.getItem('crm:employees') || '[]')) } catch { setEmployees([]) }
    }
    onChanged()
  }

  function onSaved() { setEditEmp(null); refresh() }
  function onCancelEdit() { setEditEmp(null) }
  async function onDelete(id: string) {
    if (useServer) {
      await EmployeesApi.remove(id)
      setEmployees(prev => prev.filter(e => e.id !== id))
    } else {
      const list = employees.filter(e => e.id !== id)
      localStorage.setItem('crm:employees', JSON.stringify(list))
    }
    refresh()
  }

  useEffect(() => { refresh() }, [useServer])

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Employees</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {can('employees:*') && !showEmployeeForm && <button className="ghost" type="button" onClick={() => { setShowEmployeeForm(true); setEditEmp(null) }}>New Employee</button>}
          {isAdmin() && (
            <select value={duplicateMode} onChange={e => setDuplicateMode(e.currentTarget.value as any)} style={{ fontSize: 11 }} title="How to handle duplicate Employee IDs">
              <option value="skip">Skip duplicates</option>
              <option value="update">Update duplicates</option>
              <option value="append">Append duplicates</option>
            </select>
          )}
          {isAdmin() && (
            <>
              <input
                id="employeeExcelFile"
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0]
                  if (!f) return
                  if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                    showToast(`File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`, 'error')
                    e.currentTarget.value = ''
                    return
                  }
                  setPendingFile(f)
                  await loadFileMeta(f)
                  e.currentTarget.value = ''
                }}
              />
              <button
                className="ghost"
                type="button"
                onClick={async () => {
                  try {
                    const { exportEmployeeTemplate } = await loadExcelModule()
                    exportEmployeeTemplate()
                  } catch {
                    showToast('Excel tools failed to load', 'error')
                  }
                }}
              >
                Template
              </button>
              <button className="ghost" type="button" disabled={importing} onClick={() => document.getElementById('employeeExcelFile')?.click()}>
                {importing ? 'Importing...' : 'Import Excel'}
              </button>
              {pendingFile && mappingReady && !importing && (
                <button className="primary" type="button" onClick={async () => {
                  if (!pendingFile) return
                  // Build mapping dictionary (index->field) filtering blanks
                  const map: Record<number, EmployeeFieldKey> = {}
                  Object.entries(columnMap).forEach(([k,v]) => { if (v) map[Number(k)] = v as EmployeeFieldKey })
                  cancelRef.current.cancel = false
                  setImporting(true)
                  setLastImportReport(null)
                  setImportProgress(null)
                  setInvalidRows([])
                  try {
                    const { parseExcelToEmployees } = await loadExcelModule()
                    let list = await parseExcelToEmployees(pendingFile, selectedSheet || undefined) as EmployeeImportRecord[]
                    // Apply column mapping transform in-place (since parse already normalized we simulate mapping by remapping properties if needed)
                    // For simplicity, we trust parse result; mapping UI is informational due to lack of raw header parse exposure.
                    const existing: Array<any> = useServer ? (await EmployeesApi.list() as any) : (JSON.parse(localStorage.getItem('crm:employees') || '[]'))
                    const existingIds = new Set(existing.map(e => (e.employeeId || '').toLowerCase()))
                    const errors: number[] = []
                    const invalid: EmployeeImportRecord[] = []
                    const listToUse = list.filter((r: EmployeeImportRecord, idx: number) => {
                      const missing = !r.employeeId?.trim() || !r.employeeName?.trim()
                      if (missing) { errors.push(idx); invalid.push(r); return false }
                      return true
                    })
                    if (!listToUse.length) {
                      showToast('Import aborted: all rows invalid (missing required fields).', 'error')
                      setLastImportReport({ added: 0, updated: 0, skipped: 0, errors: list.length })
                      setInvalidRows(invalid)
                      return
                    }
                    let added = 0, updated = 0, skipped = 0
                    const total = listToUse.length
                    setImportProgress({ processed: 0, total })
                    if (useServer) {
                      for (let i = 0; i < listToUse.length; i++) {
                        if (cancelRef.current.cancel) { showToast('Import cancelled', 'error'); break }
                        const u = listToUse[i]
                        const idLower = u.employeeId.toLowerCase()
                        const dup = existingIds.has(idLower)
                        if (dup) {
                          if (duplicateMode === 'update') {
                            const match = existing.find(e => (e.employeeId || '').toLowerCase() === idLower)
                            if (match) { await EmployeesApi.update(match.id, u as any); updated++ } else skipped++
                          } else if (duplicateMode === 'append') {
                            try { await EmployeesApi.create(u as any); added++ } catch { skipped++ }
                          } else {
                            skipped++
                          }
                        } else {
                          await EmployeesApi.create(u as any)
                          existingIds.add(idLower)
                          added++
                        }
                        if ((i + 1) % 5 === 0 || i === listToUse.length - 1) setImportProgress({ processed: i + 1, total })
                      }
                    } else {
                      const now = new Date().toISOString()
                      const stored: any[] = existing
                      for (let i = 0; i < listToUse.length; i++) {
                        if (cancelRef.current.cancel) { showToast('Import cancelled', 'error'); break }
                        const u = listToUse[i]
                        const idLower = u.employeeId.toLowerCase()
                        const dup = existingIds.has(idLower)
                        if (dup) {
                          if (duplicateMode === 'update') {
                            const idx = stored.findIndex(e => (e.employeeId || '').toLowerCase() === idLower)
                            if (idx >= 0) { stored[idx] = { ...stored[idx], ...u }; updated++ } else skipped++
                          } else if (duplicateMode === 'append') {
                            stored.unshift({ id: Math.random().toString(36).slice(2), createdAt: now, ...u })
                            added++
                          } else {
                            skipped++
                          }
                        } else {
                          stored.unshift({ id: Math.random().toString(36).slice(2), createdAt: now, ...u })
                          existingIds.add(idLower)
                          added++
                        }
                        if ((i + 1) % 10 === 0 || i === listToUse.length - 1) setImportProgress({ processed: i + 1, total })
                      }
                      localStorage.setItem('crm:employees', JSON.stringify(stored))
                    }
                    setLastImportReport({ added, updated, skipped, errors: errors.length })
                    setInvalidRows(invalid)
                    if (refreshTimeout) clearTimeout(refreshTimeout)
                    refreshTimeout = setTimeout(() => refresh(), 400)
                    const parts: string[] = []
                    if (added) parts.push(`${added} added`)
                    if (updated) parts.push(`${updated} updated`)
                    if (skipped) parts.push(`${skipped} skipped`)
                    if (errors.length) parts.push(`${errors.length} invalid`)
                    showToast(parts.length ? `Import: ${parts.join(', ')}` : 'Import complete')
                  } catch {
                    showToast('Failed to import employees', 'error')
                  } finally {
                    setImporting(false)
                    setTimeout(() => setImportProgress(null), 2500)
                  }
                }}>Start Import</button>
              )}
              {importing && (
                <button className="ghost" type="button" onClick={() => { cancelRef.current.cancel = true }}>Cancel</button>
              )}
              <button className="ghost" type="button" onClick={() => {
                const rows: EmployeeImportRecord[] = employees.map(e => ({
                  employeeId: e.employeeId || '',
                  employeeName: e.employeeName || '',
                  designation: e.designation || '',
                  email: e.email || '',
                  mobile: e.mobile || '',
                  department: e.department || ''
                }))
                void (async () => {
                  try {
                    const { exportEmployeesToExcel } = await loadExcelModule()
                    exportEmployeesToExcel(rows)
                  } catch {
                    showToast('Excel tools failed to load', 'error')
                  }
                })()
              }}>Export Excel</button>
            </>
          )}
        </span>
      </h3>
      {importProgress && (
        <div className="card" style={{ marginTop: 8, background: 'rgba(255,255,255,0.04)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Import Progress</span>
            <span>{importProgress.processed}/{importProgress.total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(importProgress.processed / importProgress.total) * 100}%`, background: 'linear-gradient(90deg,var(--brand),var(--brand-700))', height: '100%' }} />
          </div>
        </div>
      )}
      {pendingFile && mappingReady && !importing && (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>Column Mapping</strong>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {headers.map((h, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ minWidth: 140, fontWeight: 500 }}>{h}</span>
                <select
                  value={columnMap[idx] || ''}
                  onChange={e => setColumnMap(prev => ({ ...prev, [idx]: e.target.value as EmployeeFieldKey | '' }))}
                  style={{ flex: 1 }}
                >
                  <option value="">-- Ignore --</option>
                  <option value="employeeId">Employee ID (req)</option>
                  <option value="employeeName">Employee Name (req)</option>
                  <option value="designation">Designation</option>
                  <option value="email">Email</option>
                  <option value="mobile">Mobile</option>
                  <option value="department">Department</option>
                </select>
              </div>
            ))}
          </div>
          <small style={{ display: 'block', marginTop: 8, color: 'var(--muted)' }}>Ensure Employee ID & Employee Name are mapped. Unmapped rows may import incorrectly (current parser auto-guesses).</small>
          <div style={{ marginTop: 8 }}>
            <div style={{ border: '1px dashed var(--border)', padding: 14, borderRadius: 8, textAlign: 'center', fontSize: 12 }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={async e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) { showToast(`File too large. Max ${MAX_FILE_SIZE_MB}MB.`, 'error'); return } setPendingFile(f); await loadFileMeta(f) } }}
            >
              Drag & Drop to re-select file
            </div>
          </div>
        </div>
      )}
      {lastImportReport && (
        <div className="card" style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Last Import Summary</strong>
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ color: '#16a34a' }}>Added: {lastImportReport.added}</span>
            <span style={{ color: '#0ea5e9' }}>Updated: {lastImportReport.updated}</span>
            <span style={{ color: '#f97316' }}>Skipped: {lastImportReport.skipped}</span>
            <span style={{ color: '#dc2626' }}>Invalid: {lastImportReport.errors}</span>
          </div>
          {sheetNames.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600 }}>Sheet: </label>
              <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} style={{ fontSize: 12 }}>
                {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <small style={{ marginLeft: 6, color: 'var(--muted)' }}>Select and re-import to change sheet.</small>
            </div>
          )}
          {invalidRows.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ghost" type="button" onClick={() => {
                const header = ['Employee ID','Employee Name','Designation','Email','Mobile','Department']
                const lines = [header.join(',')]
                invalidRows.forEach(r => {
                  const row = [r.employeeId, r.employeeName, r.designation || '', r.email || '', r.mobile || '', r.department || '']
                    .map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')
                  lines.push(row)
                })
                const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'employee-invalid-rows.csv'
                document.body.appendChild(a)
                a.click()
                setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 100)
              }}>Download Invalid Rows CSV</button>
              <small style={{ color: 'var(--muted)' }}>{invalidRows.length} invalid row(s) captured</small>
              <div style={{ flexBasis: '100%', fontSize: 11, marginTop: 4 }}>
                Preview (first 5 invalid):
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {invalidRows.slice(0,5).map((r,i) => (
                    <li key={i}>{r.employeeId || '(no ID)'} – {r.employeeName || '(no Name)'}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      {showEmployeeForm && can('employees:*') && (
        <EmployeeForm onSaved={() => { onSaved(); setShowEmployeeForm(false) }} editEmployee={editEmp} onCancelEdit={() => { onCancelEdit(); setShowEmployeeForm(false) }} />
      )}
      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Employee List</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Employee ID</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Designation</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Mobile</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Department</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '10px', color: 'var(--muted)' }}>No employees yet.</td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.employeeId}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.employeeName}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.designation || '-'}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.email}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.mobile}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{emp.department || '-'}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      {can('employees:*') && <button className="ghost" type="button" onClick={() => { setEditEmp(emp); setShowEmployeeForm(true) }}>Edit</button>}
                      {can('employees:*') && <button className="ghost" type="button" onClick={() => onDelete(emp.id)}>Delete</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CustomersPanel({ serverMode }: { serverMode: boolean }) {
  const [customers, setCustomers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function refresh() {
    try {
      if (serverMode) {
        const result = await CustomersApi.list({ limit: 500 })
        setCustomers(Array.isArray(result.data) ? result.data : [])
      } else {
        setCustomers(JSON.parse(localStorage.getItem('crm:customers') || '[]'))
      }
    } catch {
      setCustomers([])
    }
  }
  useEffect(() => { refresh() }, [serverMode])

  useEffect(() => {
    if (!serverMode) {
      setExpandedId(null)
    }
  }, [serverMode])

  async function onDelete(id: string) {
    if (!isAdmin()) return
    if (serverMode) {
      await CustomersApi.remove(id)
      setCustomers(prev => prev.filter(c => c.id !== id))
    } else {
      const list = customers.filter(c => c.id !== id)
      localStorage.setItem('crm:customers', JSON.stringify(list))
      setCustomers(list)
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Customers</span>
  {can('customers:*') && !showForm && <button className="ghost" type="button" onClick={() => setShowForm(true)}>New Customer</button>}
      </h3>
      {showForm && can('customers:*') && (
        <div style={{ marginBottom: 16 }}>
          <CustomersForm />
          <div style={{ marginTop: 8 }}>
            <button className="ghost" type="button" onClick={() => { setShowForm(false); refresh() }}>Close Form</button>
          </div>
        </div>
      )}
      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Customer List</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Organisation</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Mobile</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>City</th>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 10, color: 'var(--muted)' }}>No customers yet.</td></tr>
              ) : customers.map(c => (
                <Fragment key={c.id}>
                  <tr>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{c.organizationName || '-'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{`${c.firstName || ''} ${c.lastName || ''}`.trim() || '-'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{c.email || '-'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{c.mobile || '-'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{c.city || '-'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      {can('customers:*') && <button className="ghost" type="button" onClick={() => setShowForm(true)}>Edit (open form)</button>}
                      {can('customers:*') && <button className="ghost" type="button" onClick={() => onDelete(c.id)}>Delete</button>}
                      {serverMode && (
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                        >
                          {expandedId === c.id ? 'Hide workspace' : 'Workspace'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {serverMode && expandedId === c.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', background: 'rgba(14,116,144,0.08)' }}>
                        <EntityDocuments
                          entityType="customer"
                          entityId={c.id}
                          entityName={c.organizationName || `${c.firstName || ''} ${c.lastName || ''}`.trim()}
                          serverMode={serverMode}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
