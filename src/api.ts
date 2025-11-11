import type {
  DocumentRecord,
  Priority,
  TaskStatus,
  SearchResult,
  CustomerIntelligence,
  CustomerSegment,
  CommunicationRecord,
  EmailTemplate,
  EmailSendResult,
  ChatConnector,
  ChatMessage,
  VoiceCallRecord,
  ApprovalPolicy,
  ApprovalRequest,
  CustomFieldDefinition,
  CustomFieldValueSet,
  EntityLayoutConfig,
  BrandingSettings,
  WebhookSubscription,
  AssistantResponse,
  CustomFieldType,
  TimelineInsight,
  AnalyticsOverview,
  RealtimeDashboardMetrics,
  OutlierRiskInsight,
  ReportSubscription,
  ReportPreview,
  SecurityPosture
} from './types'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export type TenderDTO = {
  id?: string
  dateOfService?: string
  serialToken: string
  allottedTo?: string
  source?: string
  priority?: string
  status?: string
  customerId?: string
  customerName?: string
  employeeId?: string
  employeeName?: string
  leadTitle?: string
  leadDescription?: string
  estimatedValue?: string
  followUpDate?: string
  createdAt?: string
  updatedAt?: string
  ownerUserId?: string | null
}

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('crm:session')
    if (!raw) return {}
    const s = JSON.parse(raw)
    if (!s?.token) return {}
    return { 'Authorization': `Bearer ${String(s.token)}` }
  } catch {
    return {}
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {})
  }
  return { ...headers }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const hasFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...normalizeHeaders(init?.headers)
  }
  if (!hasFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401) {
    try { alert('Your session has expired. Please sign in again.') } catch {}
    window.dispatchEvent(new CustomEvent('crm:auth:unauthorized'))
    throw Object.assign(new Error('unauthorized'), { code: 401 })
  }
  if (res.status === 403) {
    let detail: string | null = null
    try {
      const body = await res.clone().json()
      detail = typeof body?.error === 'string' ? body.error : null
    } catch {}
    if (!detail) {
      try { detail = await res.text() } catch {}
    }
    throw Object.assign(new Error(detail || 'forbidden'), { code: 403 })
  }
  if (!res.ok) {
    let message: string | null = null
    try { message = await res.text() } catch {}
    throw new Error(message || `HTTP ${res.status}`)
  }
  return res.json()
}

export const TendersApi = {
  list: () => req<TenderDTO[]>('/api/tenders'),
  create: (t: TenderDTO) => req<TenderDTO>('/api/tenders', { method: 'POST', body: JSON.stringify(t) }),
  update: (id: string, t: Partial<TenderDTO>) => req<TenderDTO>(`/api/tenders/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  remove: (id: string) => fetch(`${BASE}/api/tenders/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
}

export type EmployeeDTO = {
  id?: string
  employeeId: string
  employeeName: string
  designation?: string
  email: string
  mobile: string
  department?: string
  createdAt?: string
}

export const EmployeesApi = {
  list: () => req<EmployeeDTO[]>('/api/employees'),
  create: (e: EmployeeDTO) => req<EmployeeDTO>('/api/employees', { method: 'POST', body: JSON.stringify(e) }),
  update: (id: string, e: Partial<EmployeeDTO>) => req<EmployeeDTO>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  remove: (id: string) => fetch(`${BASE}/api/employees/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
}

export type CustomerDTO = {
  id?: string
  firstName: string
  lastName: string
  organizationName: string
  address: string
  city: string
  pinCode: string
  state: string
  country: string
  email: string
  mobile: string
  contactPerson?: string
  contactPersonName?: string
  contactPersonEmail?: string
  businessType?: string
  createdAt?: string
}

export type CustomerListResponse = {
  data: CustomerDTO[]
  nextCursor: string | null
}

export const CustomersApi = {
  list: (options?: { search?: string; cursor?: string | null; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.search && options.search.trim().length > 0) {
      params.set('q', options.search.trim())
    }
    if (options?.cursor) {
      params.set('offset', options.cursor)
    }
    if (options?.limit) {
      params.set('limit', String(options.limit))
    }
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return req<CustomerListResponse>(`/api/customers${suffix}`)
  },
  create: (c: CustomerDTO) => req<CustomerDTO>('/api/customers', { method: 'POST', body: JSON.stringify(c) }),
  update: (id: string, c: Partial<CustomerDTO>) => req<CustomerDTO>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  remove: (id: string) => fetch(`${BASE}/api/customers/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
}

export const EnterpriseApi = {
  realtime: () => req<RealtimeDashboardMetrics>('/api/enterprise/realtime'),
  outliers: () => req<OutlierRiskInsight>('/api/enterprise/outliers'),
  securityPosture: () => req<SecurityPosture>('/api/enterprise/security/posture'),
  reportSubscriptions: () => req<ReportSubscription[]>('/api/enterprise/report-subscriptions'),
  createReportSubscription: (payload: { name: string; cadence: 'daily' | 'weekly' | 'monthly'; recipients: string[]; format: 'pdf' | 'xlsx' | 'json'; timezone?: string }) =>
    req<ReportSubscription>('/api/enterprise/report-subscriptions', { method: 'POST', body: JSON.stringify(payload) }),
  deleteReportSubscription: (id: string) => fetch(`${BASE}/api/enterprise/report-subscriptions/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => {
    if (!r.ok) throw new Error('Delete failed')
  }),
  dispatchReportSubscription: (id: string) =>
    req<ReportPreview>(`/api/enterprise/report-subscriptions/${id}/dispatch`, { method: 'POST' })
}

export type TaskDTO = {
  id: string
  title: string
  description?: string | null
  priority: Priority
  status: TaskStatus
  dueDate?: string | null
  employeeId: string
  employeeName?: string | null
  employeeEmail?: string | null
  team?: string | null
  remindBeforeMinutes?: number | null
  notes?: string | null
  dependencies?: string[]
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export type TaskCreateInput = {
  title: string
  description?: string | null
  priority?: Priority
  status?: TaskStatus
  dueDate?: string | null
  employeeId: string
  team?: string | null
  remindBeforeMinutes?: number | null
  notes?: string | null
  dependencies?: string[]
}

export type TaskUpdateInput = Partial<TaskCreateInput>

export const TasksApi = {
  list: () => req<TaskDTO[]>('/api/tasks'),
  create: (task: TaskCreateInput) => req<TaskDTO>('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  update: (id: string, task: TaskUpdateInput) => req<TaskDTO>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) }),
  remove: (id: string) => fetch(`${BASE}/api/tasks/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
}

export type DocumentListQuery = {
  q?: string
  category?: DocumentRecord['category']
  tag?: string
}

export type DocumentCreateInput = {
  name: string
  owner?: string
  relatedTo?: string
  category?: DocumentRecord['category']
  tags?: string[]
  summary?: string
  link?: string
  fileName?: string
  file?: File | null
  entityType?: 'customer' | 'tender'
  entityId?: string
}

export const DocumentsApi = {
  list: (query?: DocumentListQuery) => {
    const params = new URLSearchParams()
    if (query?.q) params.set('q', query.q)
    if (query?.category) params.set('category', query.category)
    if (query?.tag) params.set('tag', query.tag)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return req<DocumentRecord[]>(`/api/documents${suffix}`)
  },
  create: async (payload: DocumentCreateInput, options?: { path?: string }) => {
    const targetPath = options?.path ?? '/api/documents'
    if (payload.file) {
      const form = new FormData()
      form.append('name', payload.name)
      if (payload.owner) form.append('owner', payload.owner)
      if (payload.relatedTo) form.append('relatedTo', payload.relatedTo)
      if (payload.category) form.append('category', payload.category)
      if (payload.summary) form.append('summary', payload.summary)
      if (payload.link) form.append('link', payload.link)
      if (payload.fileName) form.append('fileName', payload.fileName)
      if (payload.tags?.length) form.append('tags', JSON.stringify(payload.tags))
      form.append('file', payload.file)
      if (payload.entityType) form.append('entityType', payload.entityType)
      if (payload.entityId) form.append('entityId', payload.entityId)
      return req<DocumentRecord>(targetPath, { method: 'POST', body: form })
    }
    const body = {
      name: payload.name,
      owner: payload.owner,
      relatedTo: payload.relatedTo,
      category: payload.category,
      summary: payload.summary,
      link: payload.link,
      fileName: payload.fileName,
      tags: payload.tags ?? [],
      entityType: payload.entityType,
      entityId: payload.entityId
    }
    return req<DocumentRecord>(targetPath, { method: 'POST', body: JSON.stringify(body) })
  },
  remove: (id: string) => fetch(`${BASE}/api/documents/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
  downloadUrl: (id: string) => `${BASE}/api/documents/${id}/download`,
  listForEntity: (entityType: 'customer' | 'tender', entityId: string) =>
    req<DocumentRecord[]>(`/api/${entityType}s/${encodeURIComponent(entityId)}/documents`),
  createForEntity: (entityType: 'customer' | 'tender', entityId: string, payload: DocumentCreateInput) =>
    DocumentsApi.create({ ...payload, entityType, entityId }, { path: `/api/${entityType}s/${encodeURIComponent(entityId)}/documents` }),
  detachFromEntity: (entityType: 'customer' | 'tender', entityId: string, documentId: string) =>
    fetch(`${BASE}/api/${entityType}s/${encodeURIComponent(entityId)}/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
      headers: authHeaders()
    }).then(r => { if (!r.ok) throw new Error('Detach failed') })
}

export type ActivityDTO = {
  id: string
  entityType: 'tender' | 'customer' | 'employee'
  entityKey: string
  userEmail?: string | null
  userName?: string | null
  type: 'comment' | 'system' | 'communication'
  text: string
  createdAt: string
  channel?: string | null
  direction?: 'inbound' | 'outbound' | null
  subject?: string | null
  occurredAt?: string | null
  sentimentScore?: number | null
  sentimentLabel?: 'positive' | 'neutral' | 'negative' | null
  metadata?: Record<string, unknown> | null
}

export type ActivityCreateInput = {
  entityType: ActivityDTO['entityType']
  entityKey: string
  text: string
  type?: ActivityDTO['type']
  channel?: string
  direction?: 'inbound' | 'outbound'
  subject?: string
  occurredAt?: string
  metadata?: Record<string, unknown>
}

export const ActivitiesApi = {
  list: (entityType: ActivityDTO['entityType'], entityKey: string) =>
    req<ActivityDTO[]>(`/api/activities?entityType=${encodeURIComponent(entityType)}&entityKey=${encodeURIComponent(entityKey)}`),
  create: (payload: ActivityCreateInput) => req<ActivityDTO>('/api/activities', { method: 'POST', body: JSON.stringify(payload) }),
}

export type CommunicationCreateInput = {
  channel: string
  direction: 'inbound' | 'outbound'
  subject?: string | null
  text: string
  occurredAt?: string | null
  metadata?: Record<string, unknown>
}

export const CommunicationsApi = {
  list: (customerId: string) => req<CommunicationRecord[]>(`/api/customers/${encodeURIComponent(customerId)}/communications`),
  create: (customerId: string, payload: CommunicationCreateInput) =>
    req<CommunicationRecord>(`/api/customers/${encodeURIComponent(customerId)}/communications`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
}

export type SegmentCreateInput = {
  segment: string
  description?: string | null
  color?: string | null
}

export const SegmentsApi = {
  list: (customerId: string) => req<CustomerSegment[]>(`/api/customers/${encodeURIComponent(customerId)}/segments`),
  create: (customerId: string, payload: SegmentCreateInput) =>
    req<CustomerSegment>(`/api/customers/${encodeURIComponent(customerId)}/segments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  remove: (customerId: string, segmentId: string) =>
    fetch(`${BASE}/api/customers/${encodeURIComponent(customerId)}/segments/${encodeURIComponent(segmentId)}`, {
      method: 'DELETE',
      headers: authHeaders()
    }).then(r => { if (!r.ok) throw new Error('Failed to remove segment') })
}

export type UserDTO = {
  id: string
  email: string
  name?: string
  role: string
  createdAt: string
}

export const UsersApi = {
  list: () => req<UserDTO[]>('/api/users'),
  updateRole: (id: string, role: string) => req<{ id: string; role: string }>(`/api/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role })
  })
}

export const SearchApi = {
  query: (params: { q: string; entityType?: 'customer' | 'tender'; entityId?: string }) => {
    const searchParams = new URLSearchParams()
    searchParams.set('q', params.q)
    if (params.entityType && params.entityId) {
      searchParams.set('entityType', params.entityType)
      searchParams.set('entityId', params.entityId)
    }
    return req<{ query: string; results: SearchResult[] }>(`/api/search?${searchParams.toString()}`)
  }
}

export const IntelligenceApi = {
  customer: (id: string) => req<CustomerIntelligence>(`/api/customers/${encodeURIComponent(id)}/intelligence`)
}

export type EmailTemplateInput = {
  name: string
  description?: string | null
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  tags?: string[]
  isActive?: boolean
}

export type EmailSendInput = {
  templateId?: string
  to: string[]
  subject?: string
  body?: string
  notes?: string | null
}

export const EmailTemplatesApi = {
  list: () => req<EmailTemplate[]>('/api/email/templates'),
  create: (payload: EmailTemplateInput) => req<EmailTemplate>('/api/email/templates', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: string) => req<EmailTemplate>(`/api/email/templates/${encodeURIComponent(id)}`),
  update: (id: string, payload: Partial<EmailTemplateInput>) => req<EmailTemplate>(`/api/email/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => fetch(`${BASE}/api/email/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') })
}

export const EmailOutboundApi = {
  sendTender: (tenderId: string, payload: EmailSendInput) => req<EmailSendResult>(`/api/tenders/${encodeURIComponent(tenderId)}/email/send`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export type ChatConnectorInput = {
  name: string
  type: string
  webhookUrl?: string | null
  metadata?: Record<string, unknown> | null
  isActive?: boolean
}

export type ChatMessageInput = {
  text: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
}

export const ChatApi = {
  connectors: {
    list: () => req<ChatConnector[]>('/api/chat/connectors'),
    create: (payload: ChatConnectorInput) => req<ChatConnector>('/api/chat/connectors', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<ChatConnectorInput>) => req<ChatConnector>(`/api/chat/connectors/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: string) => fetch(`${BASE}/api/chat/connectors/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') })
  },
  messages: {
    list: (connectorId: string, limit = 50) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      return req<{ connector: ChatConnector; messages: ChatMessage[] }>(`/api/chat/connectors/${encodeURIComponent(connectorId)}/messages?${params.toString()}`)
    },
    send: (connectorId: string, payload: ChatMessageInput) => req<{ message: ChatMessage; delivery: { status: string; detail?: string } }>(`/api/chat/connectors/${encodeURIComponent(connectorId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}

export type VoiceCallInput = {
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  subject?: string
  participants?: string[]
  status?: string
  outcome?: string
  summary?: string
  recordingUrl?: string
  durationSeconds?: number
}

export const VoiceCallsApi = {
  list: (params?: { entityType?: 'tender' | 'customer' | 'employee'; entityId?: string; limit?: number }) => {
    const search = new URLSearchParams()
    if (params?.entityType) search.set('entityType', params.entityType)
    if (params?.entityId) search.set('entityId', params.entityId)
    if (params?.limit) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return req<VoiceCallRecord[]>(`/api/voice-calls${suffix}`)
  },
  create: (payload: VoiceCallInput) => req<VoiceCallRecord>('/api/voice-calls', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<VoiceCallInput>) => req<VoiceCallRecord>(`/api/voice-calls/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export type ApprovalPolicyInput = {
  name: string
  description?: string | null
  criteria?: Record<string, unknown> | null
  steps?: Array<Record<string, unknown>> | null
  isActive?: boolean
}

export type ApprovalRequestInput = {
  policyId: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  context?: Record<string, unknown> | null
}

export type ApprovalDecisionInput = {
  status: 'approved' | 'rejected' | 'escalated' | 'in_review'
  notes?: string | null
}

export const ApprovalsApi = {
  policies: {
    list: (includeInactive = false) => {
      const suffix = includeInactive ? '?includeInactive=true' : ''
      return req<ApprovalPolicy[]>(`/api/approvals/policies${suffix}`)
    },
    create: (payload: ApprovalPolicyInput) => req<ApprovalPolicy>('/api/approvals/policies', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<ApprovalPolicyInput>) => req<ApprovalPolicy>(`/api/approvals/policies/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: string) => fetch(`${BASE}/api/approvals/policies/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') })
  },
  requests: {
    list: (params?: { entityType?: 'tender' | 'customer' | 'employee'; entityId?: string; status?: string }) => {
      const search = new URLSearchParams()
      if (params?.entityType) search.set('entityType', params.entityType)
      if (params?.entityId) search.set('entityId', params.entityId)
      if (params?.status) search.set('status', params.status)
      const suffix = search.toString() ? `?${search.toString()}` : ''
      return req<ApprovalRequest[]>(`/api/approvals/requests${suffix}`)
    },
    create: (payload: ApprovalRequestInput) => req<ApprovalRequest>('/api/approvals/requests', { method: 'POST', body: JSON.stringify(payload) }),
    get: (id: string) => req<ApprovalRequest>(`/api/approvals/requests/${encodeURIComponent(id)}`),
    decide: (id: string, payload: ApprovalDecisionInput) => req<ApprovalRequest>(`/api/approvals/requests/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}

export type CustomFieldCreateInput = {
  entityType: string
  fieldKey: string
  label: string
  description?: string | null
  fieldType: CustomFieldType
  required?: boolean
  config?: Record<string, unknown> | null
  defaultValue?: unknown
  orderIndex?: number
}

export type CustomFieldUpdateInput = Partial<CustomFieldCreateInput>

export type CustomFieldValuesResponse = CustomFieldValueSet & { updatedKeys?: string[] }

export const CustomFieldsApi = {
  list: (params?: { entityType?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams()
    if (params?.entityType) search.set('entityType', params.entityType)
    if (params?.page) search.set('page', String(params.page))
    if (params?.pageSize) search.set('pageSize', String(params.pageSize))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return req<CustomFieldDefinition[]>(`/api/custom-fields${suffix}`)
  },
  create: (payload: CustomFieldCreateInput) => req<CustomFieldDefinition>('/api/custom-fields', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: CustomFieldUpdateInput) => req<CustomFieldDefinition>(`/api/custom-fields/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => fetch(`${BASE}/api/custom-fields/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') })
}

export const CustomFieldValuesApi = {
  get: (entityType: string, entityId: string) => req<CustomFieldValueSet>(`/api/custom-field-values/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`),
  update: (entityType: string, entityId: string, values: Record<string, unknown>) =>
    req<CustomFieldValuesResponse>(`/api/custom-field-values/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
      method: 'PUT',
      body: JSON.stringify({ values })
    })
}

export const EntityLayoutsApi = {
  get: (entityType: string) => req<{ layout: EntityLayoutConfig; fields: CustomFieldDefinition[] }>(`/api/entity-layouts/${encodeURIComponent(entityType)}`),
  save: (entityType: string, layout: EntityLayoutConfig) => req<{ layout: EntityLayoutConfig; fields: CustomFieldDefinition[] }>(`/api/entity-layouts/${encodeURIComponent(entityType)}`, {
    method: 'PUT',
    body: JSON.stringify(layout)
  })
}

export type BrandingUpdateInput = Partial<Omit<BrandingSettings, 'defaultLocale' | 'availableLocales'>> & {
  defaultLocale?: string
  availableLocales?: string[]
}

export const BrandingApi = {
  get: () => req<BrandingSettings>('/api/branding'),
  update: (payload: BrandingUpdateInput) => req<BrandingSettings>('/api/branding', { method: 'PUT', body: JSON.stringify(payload) })
}

export type WebhookCreateInput = {
  name: string
  eventType: string
  targetUrl: string
  sharedSecret?: string | null
  headers?: Record<string, string> | undefined
  isActive?: boolean
}

export type WebhookUpdateInput = Partial<WebhookCreateInput>

export const WebhooksApi = {
  list: () => req<WebhookSubscription[]>('/api/webhooks'),
  create: (payload: WebhookCreateInput) => req<WebhookSubscription>('/api/webhooks', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: WebhookUpdateInput) => req<WebhookSubscription>(`/api/webhooks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => fetch(`${BASE}/api/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }).then(r => { if (!r.ok) throw new Error('Delete failed') }),
  test: (id: string) => req<{ status: number; ok: boolean; body?: string }>(`/api/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' })
}

export const AssistantApi = {
  ask: (prompt: string) => req<AssistantResponse>('/api/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  })
}

export const AssistantInsightsApi = {
  timeline: (entityType: 'tender' | 'customer', entityId: string) => {
    const params = new URLSearchParams({ entityType, entityId })
    return req<TimelineInsight>(`/api/assistant/timeline?${params.toString()}`)
  }
}

export const AnalyticsApi = {
  overview: () => req<AnalyticsOverview>('/api/analytics/overview')
}
