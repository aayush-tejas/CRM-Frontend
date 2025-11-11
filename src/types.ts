export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type Status = 'Open' | 'In Progress' | 'On Hold' | 'Closed'
export type TaskStatus = 'Pending' | 'In Progress' | 'Blocked' | 'Completed'

export interface Tender {
  dateOfService: string
  serialToken: string
  allottedTo: string
  source: string
  priority: Priority
  status: Status

  customerId?: string
  customerName?: string
  employeeId?: string
  employeeName?: string
  leadTitle?: string
  leadDescription?: string
  estimatedValue?: string
  followUpDate?: string
}

export type TaskMeta = {
  dependencies: string[]
  team?: string
  remindBeforeMinutes?: number
  notes?: string
}

export type DocumentEntityLink = {
  entityType: 'customer' | 'tender'
  entityId: string
}

export type DocumentRecord = {
  id: string
  name: string
  owner?: string
  relatedTo?: string
  category?: 'Tender' | 'Customer' | 'Team' | 'Internal'
  tags: string[]
  uploadedAt: string
  summary?: string
  updatedAt?: string
  uploadedByUserId?: string
  link?: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  downloadUrl?: string
  textSnippet?: string
  entities?: DocumentEntityLink[]
}

export type SearchResult = {
  id: string
  type: 'document' | 'activity' | 'tender'
  title: string
  snippet: string
  entityType: string | null
  entityId: string | null
  updatedAt: string
  metadata?: Record<string, unknown>
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative'

export type EngagementTrendPoint = {
  score: number
  stage: 'Champion' | 'Healthy' | 'At Risk' | 'Dormant'
  computedAt: string
  drivers?: Record<string, unknown>
}

export type SentimentSnapshot = {
  averageScore: number
  label: SentimentLabel
  lastUpdated: string | null
  sampleSize: number
  recent: Array<{
    id: string
    text: string
    label: SentimentLabel
    score: number
    channel?: string | null
    source?: string | null
    occurredAt: string | null
  }>
}

export type CustomerSegment = {
  id: string
  customerId: string
  segment: string
  description?: string | null
  color?: string | null
  source: 'manual' | 'system'
  createdByUserId?: string | null
  createdAt: string
}

export type CommunicationRecord = {
  id: string
  entityType: 'customer'
  entityKey: string
  channel: string | null
  direction: 'inbound' | 'outbound' | null
  subject?: string | null
  text: string
  createdAt: string
  occurredAt?: string | null
  sentimentScore?: number | null
  sentimentLabel?: SentimentLabel | null
  userName?: string | null
  userEmail?: string | null
  metadata?: Record<string, unknown> | null
}

export type CommunicationSummary = {
  total: number
  lastInteractionAt: string | null
  byChannel: Record<string, number>
}

export type CustomerCommunicationsInsight = {
  summary: CommunicationSummary
  recent: CommunicationRecord[]
}

export type CustomerIntelligence = {
  customer: {
    id: string
    name: string
    organization?: string | null
    email?: string | null
    mobile?: string | null
  }
  engagementScore: number
  engagement: {
    score: number
    stage: 'Champion' | 'Healthy' | 'At Risk' | 'Dormant'
    trend: EngagementTrendPoint[]
    lastComputedAt: string
  }
  sentiment: SentimentSnapshot
  segments: CustomerSegment[]
  communications: CustomerCommunicationsInsight
  metrics: {
    tenders: {
      total: number
      active: number
      succeeded: number
      lost: number
      pipelineValue: number
      wonValue: number
      lastUpdated: string | null
    }
    documents: {
      total: number
      lastUpdated: string | null
    }
    activities: {
      total: number
      lastCreated: string | null
    }
  }
  recent: {
    tenders: Array<{
      id: string
      title: string
      status?: string | null
      estimatedValue?: string | null
      followUpDate?: string | null
      updatedAt?: string | null
    }>
    documents: Array<{
      id: string
      name: string
      category?: string | null
      updatedAt?: string | null
      summary?: string | null
      tags?: string[]
      fileName?: string | null
    }>
    activities: Array<{
      id: string
      type: string
      text: string
      createdAt: string
    }>
    upcomingFollowUps: Array<{
      id: string
      title?: string | null
      followUpDate?: string | null
      status?: string | null
    }>
  }
  recommendations: string[]
}

export type EmailTemplate = {
  id: string
  name: string
  description?: string | null
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  tags: string[]
  isActive: boolean
  createdByUserId?: string | null
  updatedByUserId?: string | null
  createdAt: string
  updatedAt: string
}

export type EmailSendResult = {
  message: {
    id: string
    status: string
    subject: string
    direction: 'outbound' | 'inbound'
    createdAt: string
  }
  delivery: {
    status: string
    detail?: string
  }
}

export type ChatConnector = {
  id: string
  name: string
  type: string
  webhookUrl?: string | null
  metadata?: Record<string, unknown> | null
  isActive: boolean
  createdByUserId?: string | null
  createdAt: string
}

export type ChatMessage = {
  id: string
  connectorId: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  direction: 'outbound' | 'inbound'
  text: string
  status: string
  response?: Record<string, unknown> | null
  createdByUserId?: string | null
  createdAt: string
}

export type VoiceCallRecord = {
  id: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  subject?: string | null
  participants: string[]
  status: string
  outcome?: string | null
  summary?: string | null
  recordingUrl?: string | null
  durationSeconds?: number | null
  createdByUserId?: string | null
  createdAt: string
}

export type ApprovalPolicy = {
  id: string
  name: string
  description?: string | null
  criteria?: Record<string, unknown> | null
  steps?: Array<Record<string, unknown>> | null
  isActive: boolean
  createdByUserId?: string | null
  createdAt: string
}

export type ApprovalRequest = {
  id: string
  policyId: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  status: string
  submittedByUserId?: string | null
  submittedAt: string
  decidedAt?: string | null
  decisionNotes?: string | null
  context?: Record<string, unknown> | null
}

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'json'

export type CustomFieldDefinition = {
  id: string
  entityType: string
  fieldKey: string
  label: string
  description?: string | null
  fieldType: CustomFieldType
  required: boolean
  config?: Record<string, unknown> | null
  defaultValue?: unknown
  orderIndex: number
  createdByUserId?: string | null
  createdAt: string
  updatedAt: string
}

export type CustomFieldValueSet = {
  definitions: CustomFieldDefinition[]
  values: Record<string, unknown>
}

export type LayoutSection = {
  id: string
  label: string
  description?: string | null
  fieldKeys: string[]
}

export type EntityLayoutConfig = {
  sections: LayoutSection[]
}

export type BrandingSettings = {
  brandName?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  backgroundColor?: string | null
  textColor?: string | null
  defaultLocale: string
  availableLocales: string[]
  whiteLabel?: Record<string, unknown> | undefined
  updatedAt?: string
}

export type WebhookSubscription = {
  id: string
  name: string
  eventType: string
  targetUrl: string
  sharedSecret?: string | null
  headers?: Record<string, string> | undefined
  isActive: boolean
  createdByUserId?: string | null
  createdAt: string
  updatedAt?: string
}

export type AssistantResponse = {
  answer: string
  suggestions: string[]
}

export type TimelineInsight = {
  entityType: 'tender' | 'customer'
  entityId: string
  name: string
  summary: string
  followUpDraft: string
  probability: {
    score: number
    label: 'Low' | 'Medium' | 'High'
  }
  activityMetrics: {
    total: number
    lastTouchAt: string | null
    lastTouchBy: string | null
    avgSpacingDays: number | null
    spanDays: number | null
  }
  recommendedActions: string[]
  timeline: Array<{
    id: string
    occurredAt: string
    author: string | null
    type: string
    text: string
  }>
}

export type AnalyticsOverview = {
  totals: {
    tenders: number
    open: number
    closed: number
    highPriority: number
  }
  pipeline: Array<{ status: string; count: number }>
  velocity: {
    createdLast7: number
    closedLast7: number
    avgOpenAgeDays: number | null
  }
  teamLeaders: Array<{ owner: string | null; openCount: number; highPriority: number }>
}

export type RealtimeDashboardMetrics = {
  generatedAt: string
  workInProgress: {
    openCount: number
    highPriorityCount: number
    avgAgeDays: number | null
    totalPipelineValue: number
    averageDealSize: number
    currency: string
    ageBuckets: Array<{ label: string; count: number }>
    ownerLeaders: Array<{ owner: string | null; openCount: number; highPriority: number; avgAgeDays: number | null }>
  }
  conversion: {
    won: number
    lost: number
    closed: number
    conversionRate: number
    trailing30Rate: number
  }
  sla: {
    onTrack: number
    atRisk: number
    breached: number
    avgResolutionHours: number | null
    medianFollowUpLagHours: number | null
  }
  recommendations: string[]
}

export type OutlierRiskInsight = {
  generatedAt: string
  summary: {
    analyzed: number
    flagged: number
    meanValue: number | null
    stdDeviation: number | null
    threshold: number | null
  }
  items: Array<{
    id: string
    serialToken: string
    customerName: string | null
    status: string | null
    priority: string | null
    estimatedValue: number | null
    followUpDate: string | null
    ageDays: number | null
    overdueHours: number | null
    zScore: number | null
    riskScore: number
    riskBand: 'low' | 'moderate' | 'high' | 'critical'
    reasons: string[]
  }>
}

export type ReportSubscription = {
  id: string
  name: string
  cadence: 'daily' | 'weekly' | 'monthly'
  recipients: string[]
  format: 'pdf' | 'xlsx' | 'json'
  timezone: string
  filters?: Record<string, unknown>
  lastRunAt: string | null
  nextRunAt: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  canManage?: boolean
}

export type ReportPreview = {
  generatedAt: string
  requestedBy: { id: string; email: string }
  metrics: RealtimeDashboardMetrics
}

export type SecurityPosture = {
  generatedAt: string
  userDistribution: Array<{ role: string; count: number }>
  sso: {
    enabled: boolean
    providers: string[]
    enforcement: string
  }
  mfa: {
    enforced: boolean
    enforcedFor: string[]
    backupCodesEnabled: boolean
  }
  passwordPolicy: {
    minLength: number
    complexity: string[]
    rotationDays: number | null
  }
  sessionSecurity: {
    tokenExpiryMinutes: number | null
    idleTimeoutMinutes: number | null
    refreshTokenEnabled: boolean
  }
  alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string }>
  recommendations: string[]
}
