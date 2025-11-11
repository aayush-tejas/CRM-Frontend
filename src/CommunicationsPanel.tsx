import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  EmailTemplatesApi,
  type EmailTemplateInput,
  EmailOutboundApi,
  type EmailSendInput,
  ChatApi,
  type ChatConnectorInput,
  type ChatMessageInput,
  VoiceCallsApi,
  type VoiceCallInput,
  TendersApi,
  type TenderDTO
} from './api'
import type { EmailTemplate, ChatConnector, ChatMessage, VoiceCallRecord } from './types'

function showToast(message: string, type: 'success' | 'error' = 'success') {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = message
  el.style.position = 'fixed'
  el.style.right = '16px'
  el.style.bottom = '16px'
  el.style.padding = '10px 14px'
  el.style.borderRadius = '10px'
  el.style.zIndex = '9999'
  el.style.color = '#fff'
  el.style.background = type === 'error'
    ? '#dc2626'
    : 'linear-gradient(180deg, var(--brand, #1d4ed8), var(--brand-700, #1e3a8a))'
  el.style.boxShadow = '0 4px 14px rgba(17,24,39,0.18)'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2400)
}

type CommunicationsPanelProps = {
  onNotify: () => void
  defaultTenderId?: string | null
  serverMode: boolean
}

type TemplateFormState = {
  name: string
  description: string
  subject: string
  bodyHtml: string
  bodyText: string
  tags: string
  isActive: boolean
}

type ConnectorFormState = {
  name: string
  type: string
  webhookUrl: string
  metadata: string
  isActive: boolean
}

type VoiceFormState = {
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  subject: string
  participants: string
  status: 'completed' | 'missed' | 'scheduled' | 'cancelled'
  outcome: string
  summary: string
  recordingUrl: string
  durationSeconds: string
}

const templateInitial: TemplateFormState = {
  name: '',
  description: '',
  subject: '',
  bodyHtml: '',
  bodyText: '',
  tags: '',
  isActive: true
}

const connectorInitial: ConnectorFormState = {
  name: '',
  type: 'webhook',
  webhookUrl: '',
  metadata: '',
  isActive: true
}

const voiceInitial: VoiceFormState = {
  entityType: 'tender',
  entityId: '',
  subject: '',
  participants: '',
  status: 'completed',
  outcome: '',
  summary: '',
  recordingUrl: '',
  durationSeconds: ''
}

const voiceStatuses: VoiceFormState['status'][] = ['completed', 'missed', 'scheduled', 'cancelled']
const chatConnectorTypes = ['webhook', 'slack', 'teams', 'custom']
const VOICE_STATUS_COLORS: Record<VoiceFormState['status'], string> = {
  completed: '#16a34a',
  missed: '#dc2626',
  scheduled: '#2563eb',
  cancelled: '#f97316'
}

function getVoiceStatusColor(status: VoiceCallRecord['status']): string {
  if (status && status in VOICE_STATUS_COLORS) {
    return VOICE_STATUS_COLORS[status as VoiceFormState['status']]
  }
  return '#1f2937'
}

export default function CommunicationsPanel({ onNotify, defaultTenderId, serverMode }: CommunicationsPanelProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'chat' | 'voice'>('email')

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(templateInitial)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)

  const [tenderOptions, setTenderOptions] = useState<Array<{ id: string; label: string }>>([])
  const [tenderLoading, setTenderLoading] = useState(false)
  const [sendTenderId, setSendTenderId] = useState<string>(() => defaultTenderId ?? '')
  const [sendTemplateId, setSendTemplateId] = useState<string>('')
  const [sendTo, setSendTo] = useState<string>('')
  const [sendSubject, setSendSubject] = useState<string>('')
  const [sendBody, setSendBody] = useState<string>('')
  const [sendNotes, setSendNotes] = useState<string>('')
  const [sendingEmail, setSendingEmail] = useState(false)

  const [connectors, setConnectors] = useState<ChatConnector[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(false)
  const [connectorForm, setConnectorForm] = useState<ConnectorFormState>(connectorInitial)
  const [connectorFormOpen, setConnectorFormOpen] = useState(false)
  const [connectorSaving, setConnectorSaving] = useState(false)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('')
  const [selectedConnector, setSelectedConnector] = useState<ChatConnector | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatMessage, setChatMessage] = useState<string>('')
  const [chatEntityType, setChatEntityType] = useState<'tender' | 'customer' | 'employee'>('tender')
  const [chatEntityId, setChatEntityId] = useState<string>('')

  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRecord[]>([])
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [voiceForm, setVoiceForm] = useState<VoiceFormState>(voiceInitial)
  const [voiceSaving, setVoiceSaving] = useState(false)

  const activeTemplateCount = useMemo(() => templates.filter(template => template.isActive).length, [templates])
  const activeConnectorCount = useMemo(() => connectors.filter(connector => connector.isActive).length, [connectors])
  const recentVoiceCall = useMemo(() => voiceCalls[0] ?? null, [voiceCalls])
  const summaryCards = useMemo(() => ([
    {
      key: 'email',
      label: 'Active email templates',
      value: activeTemplateCount,
      helper: `${templates.length} total`,
      accent: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(30,64,175,0.38))',
      icon: '✉️'
    },
    {
      key: 'chat',
      label: 'Live chat connectors',
      value: activeConnectorCount,
      helper: `${connectors.length} configured`,
      accent: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(22,101,52,0.4))',
      icon: '💬'
    },
    {
      key: 'voice',
      label: 'Recent voice call',
      value: recentVoiceCall ? new Date(recentVoiceCall.createdAt).toLocaleTimeString() : '—',
      helper: recentVoiceCall ? `${recentVoiceCall.status} · ${recentVoiceCall.entityType}` : 'No calls logged yet',
      accent: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(194,65,12,0.38))',
      icon: '🎙️'
    }
  ]), [activeTemplateCount, activeConnectorCount, connectors.length, recentVoiceCall, templates.length])

  const renderTabButton = (tab: typeof activeTab, label: string, icon: string) => {
    const isActive = activeTab === tab
    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        style={{
          border: 'none',
          cursor: 'pointer',
          padding: '10px 18px',
          borderRadius: 999,
          background: isActive ? 'linear-gradient(120deg, var(--brand), var(--brand-700))' : 'rgba(148,163,184,0.16)',
          color: isActive ? '#fff' : 'var(--muted)',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: isActive ? '0 10px 20px rgba(37,99,235,0.25)' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        <span>{icon}</span>
        {label}
      </button>
    )
  }

  const statusChip = (label: string, tone: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${tone}1a`,
        color: tone,
        textTransform: 'capitalize'
      }}
    >
      <span style={{ fontSize: 10 }}>●</span>
      {label}
    </span>
  )

  useEffect(() => {
    if (defaultTenderId) {
      setSendTenderId(defaultTenderId)
      setChatEntityId(defaultTenderId)
      setVoiceForm(prev => ({ ...prev, entityId: defaultTenderId, entityType: 'tender' }))
    }
  }, [defaultTenderId])

  useEffect(() => {
    if (!serverMode) return
    loadTemplates()
    loadTenders()
    loadConnectors()
    loadVoiceCalls()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode])

  useEffect(() => {
    if (!serverMode) return
    if (!selectedConnectorId) {
      setSelectedConnector(null)
      setChatMessages([])
      return
    }
    loadConnectorMessages(selectedConnectorId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnectorId, serverMode])

  const selectedTemplate = useMemo(() => templates.find(t => t.id === sendTemplateId) ?? null, [templates, sendTemplateId])

  function resetTemplateForm() {
    setTemplateForm(templateInitial)
    setEditingTemplateId(null)
  }

  async function loadTemplates() {
    setTemplatesLoading(true)
    try {
      const rows = await EmailTemplatesApi.list()
      setTemplates(rows)
    } catch (err) {
      console.error('Failed to load templates', err)
      setTemplates([])
      showToast('Failed to load templates', 'error')
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function loadTenders() {
    setTenderLoading(true)
    try {
      const rows = await TendersApi.list()
      const mapped = rows.map((row: TenderDTO) => ({
        id: row.id ?? row.serialToken,
        label: row.leadTitle || row.serialToken || row.id || 'Tender'
      }))
      setTenderOptions(mapped)
    } catch (err) {
      console.error('Failed to load tenders', err)
      setTenderOptions([])
    } finally {
      setTenderLoading(false)
    }
  }

  async function loadConnectors() {
    setConnectorsLoading(true)
    try {
      const rows = await ChatApi.connectors.list()
      setConnectors(rows)
    } catch (err) {
      console.error('Failed to load chat connectors', err)
      setConnectors([])
      showToast('Failed to load chat connectors', 'error')
    } finally {
      setConnectorsLoading(false)
    }
  }

  async function loadConnectorMessages(connectorId: string) {
    setChatLoading(true)
    try {
      const result = await ChatApi.messages.list(connectorId)
      setSelectedConnector(result.connector)
      setChatMessages(result.messages)
    } catch (err) {
      console.error('Failed to load messages', err)
      setSelectedConnector(null)
      setChatMessages([])
      showToast('Failed to load chat messages', 'error')
    } finally {
      setChatLoading(false)
    }
  }

  async function loadVoiceCalls() {
    setVoiceLoading(true)
    try {
      const rows = await VoiceCallsApi.list({ limit: 25 })
      setVoiceCalls(rows)
    } catch (err) {
      console.error('Failed to load voice calls', err)
      setVoiceCalls([])
      showToast('Failed to load voice calls', 'error')
    } finally {
      setVoiceLoading(false)
    }
  }

  async function handleSaveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!templateForm.name.trim()) {
      showToast('Template name is required', 'error')
      return
    }
    if (!templateForm.subject.trim()) {
      showToast('Template subject is required', 'error')
      return
    }
    if (!templateForm.bodyHtml.trim() && !templateForm.bodyText.trim()) {
      showToast('Provide HTML or plain text content', 'error')
      return
    }

    const payload: EmailTemplateInput = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim() || undefined,
      subject: templateForm.subject.trim(),
      bodyHtml: templateForm.bodyHtml.trim() || undefined,
      bodyText: templateForm.bodyText.trim() || undefined,
      tags: templateForm.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
      isActive: templateForm.isActive
    }

    setTemplateSaving(true)
    try {
      if (editingTemplateId) {
        await EmailTemplatesApi.update(editingTemplateId, payload)
        showToast('Template updated')
      } else {
        await EmailTemplatesApi.create(payload)
        showToast('Template created')
      }
      resetTemplateForm()
      setTemplateFormOpen(false)
      await loadTemplates()
    } catch (err) {
      console.error('Failed to save template', err)
      showToast('Failed to save template', 'error')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function handleDeleteTemplate(id: string) {
    const confirmDelete = window.confirm('Delete this template?')
    if (!confirmDelete) return
    try {
      await EmailTemplatesApi.remove(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      showToast('Template deleted')
      if (sendTemplateId === id) {
        setSendTemplateId('')
      }
    } catch (err) {
      console.error('Failed to delete template', err)
      showToast('Failed to delete template', 'error')
    }
  }

  async function handleSendEmail(e: FormEvent) {
    e.preventDefault()
    if (!sendTenderId) {
      showToast('Select a tender to send from', 'error')
      return
    }
    const recipients = sendTo
      .split(',')
      .map(email => email.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      showToast('Provide at least one recipient', 'error')
      return
    }

    const payload: EmailSendInput = {
      to: recipients,
      notes: sendNotes.trim() || undefined
    }
    if (sendTemplateId) {
      payload.templateId = sendTemplateId
    } else {
      if (!sendSubject.trim() || !sendBody.trim()) {
        showToast('Subject and body required when not using a template', 'error')
        return
      }
      payload.subject = sendSubject.trim()
      payload.body = sendBody
    }

    setSendingEmail(true)
    try {
      await EmailOutboundApi.sendTender(sendTenderId, payload)
      showToast('Email queued for delivery')
      onNotify()
      setSendNotes('')
      setSendSubject('')
      setSendBody('')
      setSendTemplateId('')
    } catch (err: any) {
      console.error('Failed to send email', err)
      showToast(err?.message || 'Failed to send email', 'error')
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleSaveConnector(e: FormEvent) {
    e.preventDefault()
    if (!connectorForm.name.trim()) {
      showToast('Connector name required', 'error')
      return
    }
    if (!connectorForm.type.trim()) {
      showToast('Connector type required', 'error')
      return
    }

    const payload: ChatConnectorInput = {
      name: connectorForm.name.trim(),
      type: connectorForm.type.trim(),
      webhookUrl: connectorForm.webhookUrl.trim() || undefined,
      metadata: connectorForm.metadata.trim() ? (() => {
        try {
          return JSON.parse(connectorForm.metadata)
        } catch {
          showToast('Metadata must be valid JSON', 'error')
          throw new Error('invalid-metadata')
        }
      })() : undefined,
      isActive: connectorForm.isActive
    }

    setConnectorSaving(true)
    try {
      await ChatApi.connectors.create(payload)
      showToast('Connector created')
      setConnectorForm(connectorInitial)
      setConnectorFormOpen(false)
      await loadConnectors()
    } catch (err: any) {
      if (err?.message !== 'invalid-metadata') {
        console.error('Failed to save connector', err)
        showToast('Failed to save connector', 'error')
      }
    } finally {
      setConnectorSaving(false)
    }
  }

  async function handleRemoveConnector(id: string) {
    const confirmDelete = window.confirm('Delete this connector?')
    if (!confirmDelete) return
    try {
      await ChatApi.connectors.remove(id)
      setConnectors(prev => prev.filter(conn => conn.id !== id))
      if (selectedConnectorId === id) {
        setSelectedConnectorId('')
      }
      showToast('Connector deleted')
    } catch (err) {
      console.error('Failed to delete connector', err)
      showToast('Failed to delete connector', 'error')
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault()
    if (!selectedConnectorId) {
      showToast('Select a connector first', 'error')
      return
    }
    if (!chatMessage.trim()) {
      showToast('Message cannot be empty', 'error')
      return
    }
    if (!chatEntityId.trim()) {
      showToast('Provide an entity id', 'error')
      return
    }

    const payload: ChatMessageInput = {
      text: chatMessage.trim(),
      entityType: chatEntityType,
      entityId: chatEntityId.trim()
    }
    setChatSending(true)
    try {
      const response = await ChatApi.messages.send(selectedConnectorId, payload)
      setChatMessages(prev => [response.message, ...prev])
      setChatMessage('')
      showToast('Message sent')
    } catch (err) {
      console.error('Failed to send chat message', err)
      showToast('Failed to send chat message', 'error')
    } finally {
      setChatSending(false)
    }
  }

  async function handleSaveVoice(e: FormEvent) {
    e.preventDefault()
    if (!voiceForm.entityId.trim()) {
      showToast('Entity ID required', 'error')
      return
    }
    const participants = voiceForm.participants
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)

    const payload: VoiceCallInput = {
      entityType: voiceForm.entityType,
      entityId: voiceForm.entityId.trim(),
      subject: voiceForm.subject.trim() || undefined,
      participants: participants.length ? participants : undefined,
      status: voiceForm.status,
      outcome: voiceForm.outcome.trim() || undefined,
      summary: voiceForm.summary.trim() || undefined,
      recordingUrl: voiceForm.recordingUrl.trim() || undefined,
      durationSeconds: voiceForm.durationSeconds.trim()
        ? Number(voiceForm.durationSeconds.trim()) || undefined
        : undefined
    }

    setVoiceSaving(true)
    try {
      await VoiceCallsApi.create(payload)
      showToast('Voice call logged')
      setVoiceForm(prev => ({ ...voiceInitial, entityId: prev.entityId, entityType: prev.entityType }))
      await loadVoiceCalls()
    } catch (err) {
      console.error('Failed to log voice call', err)
      showToast('Failed to log voice call', 'error')
    } finally {
      setVoiceSaving(false)
    }
  }

  if (!serverMode) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Communications</h3>
        <p style={{ color: 'var(--muted)', marginTop: 6 }}>
          Server mode is required for email, chat, and voice orchestration. Switch to the connected backend to unlock these workflows.
        </p>
      </section>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section
        className="card"
        style={{
          marginTop: 16,
          padding: 24,
          borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(30,64,175,0.18), rgba(15,23,42,0.75))',
          color: '#e2e8f0',
          boxShadow: '0 18px 38px rgba(15,23,42,0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: 22 }}>Engage customers faster</h3>
            <p style={{ margin: '6px 0 0', maxWidth: 420 }}>
              Orchestrate campaigns, monitor conversational channels, and capture call intelligence — all without leaving your deal room.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', flex: 1, minWidth: 240 }}>
            {summaryCards.map(card => (
              <div
                key={card.key}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: card.accent,
                  backdropFilter: 'blur(6px)',
                  color: '#0f172a',
                  display: 'grid',
                  gap: 6
                }}
              >
                <span style={{ fontSize: 22 }}>{card.icon}</span>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(15,23,42,0.6)' }}>{card.label}</span>
                <strong style={{ fontSize: 20 }}>{card.value}</strong>
                <span style={{ fontSize: 12, color: 'rgba(15,23,42,0.65)' }}>{card.helper}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: '12px 18px', borderRadius: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {renderTabButton('email', 'Email', '✉️')}
          {renderTabButton('chat', 'Chat', '💬')}
          {renderTabButton('voice', 'Voice', '🎙️')}
        </div>
      </section>

      {activeTab === 'email' && (
        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Email templates</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>Curate reusable messaging to keep tender outreach consistent.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ghost" type="button" onClick={() => loadTemplates()} disabled={templatesLoading}>
                {templatesLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button className="ghost" type="button" onClick={() => { setTemplateFormOpen(prev => !prev); if (!templateFormOpen) resetTemplateForm() }}>
                {templateFormOpen ? 'Close form' : 'New template'}
              </button>
            </div>
          </header>

          {templateFormOpen && (
            <form onSubmit={handleSaveTemplate} className="card" style={{ background: 'rgba(15,23,42,0.04)', padding: 16, borderRadius: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Name</span>
                  <input value={templateForm.name} onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Subject</span>
                  <input value={templateForm.subject} onChange={e => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Tags</span>
                  <input placeholder="tender, follow-up" value={templateForm.tags} onChange={e => setTemplateForm(prev => ({ ...prev, tags: e.target.value }))} />
                  <small style={{ color: 'var(--muted)' }}>Comma separated</small>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Status</span>
                  <select value={templateForm.isActive ? 'active' : 'inactive'} onChange={e => setTemplateForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Description</span>
                <textarea rows={2} value={templateForm.description} onChange={e => setTemplateForm(prev => ({ ...prev, description: e.target.value }))} />
              </label>
              <div className="grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>HTML body</span>
                  <textarea rows={4} value={templateForm.bodyHtml} onChange={e => setTemplateForm(prev => ({ ...prev, bodyHtml: e.target.value }))} placeholder="&lt;p&gt;Hello...&lt;/p&gt;" />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Plain text fallback</span>
                  <textarea rows={4} value={templateForm.bodyText} onChange={e => setTemplateForm(prev => ({ ...prev, bodyText: e.target.value }))} placeholder="Hello..." />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="primary" type="submit" disabled={templateSaving}>
                  {templateSaving ? 'Saving…' : editingTemplateId ? 'Update template' : 'Create template'}
                </button>
                <button className="ghost" type="button" onClick={() => { resetTemplateForm(); setTemplateFormOpen(false) }} disabled={templateSaving}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Subject</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Tags</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Updated</th>
                  <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      {templatesLoading ? 'Loading templates…' : 'No templates yet.'}
                    </td>
                  </tr>
                ) : templates.map(template => (
                  <tr key={template.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{template.name}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{template.subject}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{template.tags?.length ? template.tags.join(', ') : '—'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      {statusChip(template.isActive ? 'Active' : 'Inactive', template.isActive ? '#16a34a' : '#64748b')}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{new Date(template.updatedAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      <button className="ghost" type="button" onClick={() => { setEditingTemplateId(template.id); setTemplateForm({
                        name: template.name,
                        description: template.description || '',
                        subject: template.subject,
                        bodyHtml: template.bodyHtml || '',
                        bodyText: template.bodyText || '',
                        tags: template.tags?.join(', ') || '',
                        isActive: template.isActive
                      }); setTemplateFormOpen(true) }}>Edit</button>
                      <button className="ghost" type="button" onClick={() => handleDeleteTemplate(template.id)}>Delete</button>
                      <button className="ghost" type="button" onClick={() => setSendTemplateId(template.id)}>Use</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleSendEmail} className="card" style={{ background: 'rgba(30,64,175,0.05)', padding: 16, borderRadius: 16 }}>
            <h4 style={{ margin: '0 0 12px' }}>Send tender email</h4>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Tender</span>
                <select value={sendTenderId} onChange={e => setSendTenderId(e.target.value)} required>
                  <option value="" disabled>{tenderLoading ? 'Loading…' : 'Select tender…'}</option>
                  {tenderOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recipients</span>
                <input placeholder="email@company.com" value={sendTo} onChange={e => setSendTo(e.target.value)} required />
                <small style={{ color: 'var(--muted)' }}>Comma-separated list</small>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Template</span>
                <select value={sendTemplateId} onChange={e => setSendTemplateId(e.target.value)}>
                  <option value="">— None —</option>
                  {templates.filter(t => t.isActive).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Internal notes</span>
                <input placeholder="Optional notes for activity feed" value={sendNotes} onChange={e => setSendNotes(e.target.value)} />
              </label>
            </div>

            {!selectedTemplate && (
              <div className="grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Subject</span>
                  <input value={sendSubject} onChange={e => setSendSubject(e.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Message body</span>
                  <textarea rows={4} value={sendBody} onChange={e => setSendBody(e.target.value)} />
                </label>
              </div>
            )}

            {selectedTemplate && (
              <div className="card" style={{ marginTop: 12, background: '#fff', color: '#111827', borderRadius: 12, padding: 12 }}>
                <strong>{selectedTemplate.subject}</strong>
                <div style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {selectedTemplate.bodyText || 'HTML template selected'}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="primary" type="submit" disabled={sendingEmail}>
                {sendingEmail ? 'Sending…' : 'Send email'}
              </button>
              <button className="ghost" type="button" onClick={() => { setSendTemplateId(''); setSendSubject(''); setSendBody('') }}>Reset</button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'chat' && (
        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Chat connectors</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>Capture omni-channel chats and push outbound nudges from one hub.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ghost" type="button" onClick={() => loadConnectors()} disabled={connectorsLoading}>
                {connectorsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button className="ghost" type="button" onClick={() => { setConnectorFormOpen(prev => !prev) }}>
                {connectorFormOpen ? 'Close form' : 'New connector'}
              </button>
            </div>
          </header>

          {connectorFormOpen && (
            <form onSubmit={handleSaveConnector} className="card" style={{ background: 'rgba(20,83,45,0.05)', padding: 16, borderRadius: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Name</span>
                  <input value={connectorForm.name} onChange={e => setConnectorForm(prev => ({ ...prev, name: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Type</span>
                  <select value={connectorForm.type} onChange={e => setConnectorForm(prev => ({ ...prev, type: e.target.value }))}>
                    {chatConnectorTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Status</span>
                  <select value={connectorForm.isActive ? 'active' : 'inactive'} onChange={e => setConnectorForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Webhook URL</span>
                <input placeholder="https://" value={connectorForm.webhookUrl} onChange={e => setConnectorForm(prev => ({ ...prev, webhookUrl: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Metadata (JSON)</span>
                <textarea rows={3} placeholder='{"bot":"X"}' value={connectorForm.metadata} onChange={e => setConnectorForm(prev => ({ ...prev, metadata: e.target.value }))} />
              </label>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="primary" type="submit" disabled={connectorSaving}>
                  {connectorSaving ? 'Saving…' : 'Create connector'}
                </button>
                <button className="ghost" type="button" onClick={() => { setConnectorForm(connectorInitial); setConnectorFormOpen(false) }} disabled={connectorSaving}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Created</th>
                  <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connectors.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)' }}>
                      {connectorsLoading ? 'Loading connectors…' : 'No connectors yet.'}
                    </td>
                  </tr>
                ) : connectors.map(connector => (
                  <tr key={connector.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{connector.name}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{connector.type}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      {statusChip(connector.isActive ? 'Active' : 'Inactive', connector.isActive ? '#16a34a' : '#64748b')}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{new Date(connector.createdAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      <button className={selectedConnectorId === connector.id ? 'primary' : 'ghost'} type="button" onClick={() => setSelectedConnectorId(connector.id)}>
                        {selectedConnectorId === connector.id ? 'Viewing' : 'View'}
                      </button>
                      <button className="ghost" type="button" onClick={() => handleRemoveConnector(connector.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedConnectorId && (
            <div className="card" style={{ background: 'rgba(15,118,110,0.06)', padding: 16, borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{selectedConnector?.name || 'Connector'}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{selectedConnector?.type} • {selectedConnector?.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <button className="ghost" type="button" onClick={() => loadConnectorMessages(selectedConnectorId)} disabled={chatLoading}>
                  {chatLoading ? 'Refreshing…' : 'Refresh messages'}
                </button>
              </div>

              <form onSubmit={handleSendChat} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Entity type</span>
                    <select value={chatEntityType} onChange={e => setChatEntityType(e.target.value as typeof chatEntityType)}>
                      <option value="tender">Tender</option>
                      <option value="customer">Customer</option>
                      <option value="employee">Employee</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Entity id</span>
                    <input value={chatEntityId} onChange={e => setChatEntityId(e.target.value)} placeholder="Target record id" required />
                  </label>
                </div>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Message</span>
                  <textarea rows={3} value={chatMessage} onChange={e => setChatMessage(e.target.value)} placeholder="Type your reply" />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit" disabled={chatSending}>
                    {chatSending ? 'Sending…' : 'Send message'}
                  </button>
                  <button className="ghost" type="button" onClick={() => setChatMessage('')} disabled={chatSending}>Clear</button>
                </div>
              </form>

              <div style={{ marginTop: 16 }}>
                <h4 style={{ marginBottom: 8 }}>Recent messages</h4>
                {chatLoading ? (
                  <div style={{ color: 'var(--muted)' }}>Loading messages…</div>
                ) : chatMessages.length === 0 ? (
                  <div style={{ color: 'var(--muted)' }}>No messages yet.</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                    {chatMessages.map(message => (
                      <li key={message.id} style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontWeight: 600 }}>{message.direction === 'outbound' ? 'You' : 'Inbound'}</span>
                          <span style={{ color: '#64748b', fontSize: 12 }}>{new Date(message.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 13 }}>{message.text}</div>
                        <div style={{ marginTop: 6, color: '#64748b', fontSize: 11 }}>Status: {message.status}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'voice' && (
        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Voice call log</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>Capture discovery calls, reviews, and quick huddles directly against records.</p>
            </div>
            <button className="ghost" type="button" onClick={() => loadVoiceCalls()} disabled={voiceLoading}>
              {voiceLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </header>

          <form onSubmit={handleSaveVoice} className="card" style={{ background: 'rgba(59,130,246,0.05)', padding: 16, borderRadius: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Entity type</span>
                <select value={voiceForm.entityType} onChange={e => setVoiceForm(prev => ({ ...prev, entityType: e.target.value as VoiceFormState['entityType'] }))}>
                  <option value="tender">Tender</option>
                  <option value="customer">Customer</option>
                  <option value="employee">Employee</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Entity id</span>
                <input value={voiceForm.entityId} onChange={e => setVoiceForm(prev => ({ ...prev, entityId: e.target.value }))} required />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Status</span>
                <select value={voiceForm.status} onChange={e => setVoiceForm(prev => ({ ...prev, status: e.target.value as VoiceFormState['status'] }))}>
                  {voiceStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Subject</span>
                <input value={voiceForm.subject} onChange={e => setVoiceForm(prev => ({ ...prev, subject: e.target.value }))} />
              </label>
            </div>
            <div className="grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Participants</span>
                <input placeholder="alice@, bob@" value={voiceForm.participants} onChange={e => setVoiceForm(prev => ({ ...prev, participants: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Outcome</span>
                <input value={voiceForm.outcome} onChange={e => setVoiceForm(prev => ({ ...prev, outcome: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recording URL</span>
                <input placeholder="https://" value={voiceForm.recordingUrl} onChange={e => setVoiceForm(prev => ({ ...prev, recordingUrl: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Duration (seconds)</span>
                <input type="number" min={0} value={voiceForm.durationSeconds} onChange={e => setVoiceForm(prev => ({ ...prev, durationSeconds: e.target.value }))} />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span>Summary</span>
              <textarea rows={3} value={voiceForm.summary} onChange={e => setVoiceForm(prev => ({ ...prev, summary: e.target.value }))} />
            </label>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="primary" type="submit" disabled={voiceSaving}>
                {voiceSaving ? 'Logging…' : 'Log call'}
              </button>
              <button className="ghost" type="button" onClick={() => setVoiceForm(prev => ({ ...voiceInitial, entityId: prev.entityId, entityType: prev.entityType }))} disabled={voiceSaving}>Reset</button>
            </div>
          </form>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>When</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Entity</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Subject</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {voiceCalls.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      {voiceLoading ? 'Loading voice calls…' : 'No voice calls logged yet.'}
                    </td>
                  </tr>
                ) : voiceCalls.map(call => (
                  <tr key={call.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{new Date(call.createdAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{call.entityType} · {call.entityId}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      {statusChip(call.status, getVoiceStatusColor(call.status))}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{call.subject || '—'}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{call.summary ? `${call.summary.slice(0, 120)}${call.summary.length > 120 ? '…' : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
