import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  DocumentsApi,
  IntelligenceApi,
  SearchApi,
  CommunicationsApi,
  SegmentsApi,
  type DocumentCreateInput,
  type CommunicationCreateInput,
  type SegmentCreateInput
} from './api'
import type {
  CustomerIntelligence,
  CustomerSegment,
  DocumentRecord,
  SearchResult,
  CommunicationRecord
} from './types'
import { getSession, can } from './auth/session'

type EntityDocumentsProps = {
  entityType: 'customer' | 'tender'
  entityId: string
  entityName?: string
  serverMode?: boolean
  onError?: (message: string) => void
}

const defaultSession = getSession()

function formatDate(value?: string | null) {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return value
  return new Date(ts).toLocaleString()
}

function nowLocalDateTime() {
  const now = new Date()
  const offsetMinutes = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offsetMinutes * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function metricCard(label: string, value: string | number, accent: string, subtitle?: string) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: accent, display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, textTransform: 'uppercase', color: 'rgba(15,23,42,0.66)', letterSpacing: 0.6 }}>{label}</span>
      <strong style={{ fontSize: 20 }}>{value}</strong>
      {subtitle && <span style={{ fontSize: 12, color: 'rgba(15,23,42,0.66)' }}>{subtitle}</span>}
    </div>
  )
}

const SEGMENT_SUGGESTIONS = ['Champion', 'Healthy', 'At Risk', 'Dormant', 'Promoter', 'Needs Attention', 'Stalled Pipeline']
const COMMUNICATION_CHANNELS = ['email', 'call', 'meeting', 'chat', 'note']

export default function EntityDocuments(props: EntityDocumentsProps) {
  const { entityType, entityId, entityName, serverMode = true, onError } = props
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [intelligence, setIntelligence] = useState<CustomerIntelligence | null>(null)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)
  const [segments, setSegments] = useState<CustomerSegment[]>([])
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const [segmentError, setSegmentError] = useState<string | null>(null)
  const [segmentDraft, setSegmentDraft] = useState<{ segment: string; description: string; color: string }>(
    { segment: '', description: '', color: '#6366f1' }
  )
  const [communications, setCommunications] = useState<CommunicationRecord[]>([])
  const [communicationsLoading, setCommunicationsLoading] = useState(false)
  const [communicationError, setCommunicationError] = useState<string | null>(null)
  const [communicationDraft, setCommunicationDraft] = useState<{
    channel: string
    direction: 'inbound' | 'outbound'
    subject: string
    text: string
    occurredAt: string
  }>(() => ({
    channel: 'email',
    direction: 'outbound',
    subject: '',
    text: '',
    occurredAt: nowLocalDateTime()
  }))
  const [communicationSubmitting, setCommunicationSubmitting] = useState(false)
  const canManageDocuments = entityType === 'customer'
    ? can('customers:*')
    : (can('tickets:update') || can('tickets:create'))
  const canManageSegments = can('customers:*')
  const canLogCommunication = can('customers:*') || can('tickets:update') || can('tickets:create')

  const resetDraft = () => {
    setFile(null)
    setName('')
    setSummary('')
    setTags('')
  }

  const loadIntelligence = useCallback(async (cancelRef?: { current: boolean }) => {
    if (!serverMode || entityType !== 'customer') return
    try {
      const payload = await IntelligenceApi.customer(entityId)
      if (cancelRef?.current) return
      setIntelligence(payload)
      setSegments(payload.segments ?? [])
      setCommunications(payload.communications?.recent ?? [])
      setIntelligenceError(null)
      setSegmentError(null)
      setCommunicationError(null)
    } catch (err) {
      console.error(err)
      if (cancelRef?.current) return
      setIntelligence(null)
      setSegments([])
      setCommunications([])
      setIntelligenceError('Unable to load intelligence summary right now.')
    }
  }, [serverMode, entityType, entityId])

  const refreshSegments = useCallback(async () => {
    if (!serverMode || entityType !== 'customer') return
    setSegmentsLoading(true)
    try {
      const rows = await SegmentsApi.list(entityId)
      setSegments(rows)
      setSegmentError(null)
    } catch (err) {
      console.error(err)
      setSegmentError('Unable to load segments right now.')
    } finally {
      setSegmentsLoading(false)
    }
  }, [serverMode, entityType, entityId])

  const refreshCommunications = useCallback(async () => {
    if (!serverMode || entityType !== 'customer') return
    setCommunicationsLoading(true)
    try {
      const rows = await CommunicationsApi.list(entityId)
      setCommunications(rows)
      setCommunicationError(null)
    } catch (err) {
      console.error(err)
      setCommunicationError('Unable to load communications right now.')
    } finally {
      setCommunicationsLoading(false)
    }
  }, [serverMode, entityType, entityId])

  const refresh = useCallback(async () => {
    if (!serverMode) return
    setLoading(true)
    try {
      const rows = await DocumentsApi.listForEntity(entityType, entityId)
      setDocuments(rows)
      setError(null)
    } catch (err) {
      console.error(err)
      const message = 'Failed to load linked documents'
      setError(message)
      onError?.(message)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [serverMode, entityType, entityId, onError])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!serverMode || entityType !== 'customer') {
      setIntelligence(null)
      setIntelligenceError(null)
      setSegments([])
      setCommunications([])
      return
    }
    const cancelRef = { current: false }
    loadIntelligence(cancelRef)
    return () => { cancelRef.current = true }
  }, [serverMode, entityType, entityId, loadIntelligence])

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManageDocuments) return
    const trimmedName = (name || file?.name || '').trim()
    if (!trimmedName) {
      setError('Document name is required')
      return
    }
    setUploading(true)
    try {
      const payload: DocumentCreateInput = {
        name: trimmedName,
        summary: summary.trim() ? summary.trim() : undefined,
        tags: tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        file,
        fileName: file?.name,
        owner: defaultSession?.name || defaultSession?.email || undefined
      }
      const created = await DocumentsApi.createForEntity(entityType, entityId, payload)
      setDocuments(prev => [created, ...prev])
      resetDraft()
      setError(null)
    } catch (err) {
      console.error(err)
      const message = 'Failed to attach document'
      setError(message)
      onError?.(message)
    } finally {
      setUploading(false)
    }
  }

  const handleDetach = async (doc: DocumentRecord) => {
    if (!canManageDocuments) return
    if (!window.confirm('Remove this document link? The underlying record will remain in the workspace.')) return
    try {
      await DocumentsApi.detachFromEntity(entityType, entityId, doc.id)
      setDocuments(prev => prev.filter(item => item.id !== doc.id))
    } catch (err) {
      console.error(err)
      const message = 'Failed to unlink document'
      setError(message)
      onError?.(message)
    }
  }

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault()
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setSearchError(null)
      return
    }
    setSearching(true)
    try {
      const response = await SearchApi.query({ q, entityType, entityId })
      setSearchResults(response.results)
      setSearchError(null)
    } catch (err) {
      console.error(err)
      setSearchResults([])
      setSearchError('Search failed. Try again in a moment.')
    } finally {
      setSearching(false)
    }
  }

  const handleSegmentSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManageSegments) return
    const name = segmentDraft.segment.trim()
    if (!name) {
      setSegmentError('Segment name is required')
      return
    }
    try {
      const payload: SegmentCreateInput = {
        segment: name,
        description: segmentDraft.description.trim() ? segmentDraft.description.trim() : undefined,
        color: segmentDraft.color?.trim() || undefined
      }
      const created = await SegmentsApi.create(entityId, payload)
      setSegments(prev => [created, ...prev.filter(seg => seg.id !== created.id)])
      setSegmentDraft(prev => ({ segment: '', description: '', color: prev.color }))
      setSegmentError(null)
      await loadIntelligence()
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Failed to assign segment'
      setSegmentError(message)
    }
  }

  const handleSegmentRemove = async (segmentId: string) => {
    if (!canManageSegments) return
    const confirm = window.confirm('Remove this segment from the customer?')
    if (!confirm) return
    try {
      await SegmentsApi.remove(entityId, segmentId)
      setSegments(prev => prev.filter(seg => seg.id !== segmentId))
      setSegmentError(null)
      await loadIntelligence()
    } catch (err) {
      console.error(err)
      setSegmentError('Failed to remove segment')
    }
  }

  const handleCommunicationSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canLogCommunication) return
    const text = communicationDraft.text.trim()
    if (!text) {
      setCommunicationError('Message summary is required')
      return
    }
    setCommunicationSubmitting(true)
    try {
      const payload: CommunicationCreateInput = {
        channel: communicationDraft.channel,
        direction: communicationDraft.direction,
        subject: communicationDraft.subject.trim() || undefined,
        text,
        occurredAt: communicationDraft.occurredAt ? new Date(communicationDraft.occurredAt).toISOString() : undefined
      }
      const created = await CommunicationsApi.create(entityId, payload)
      setCommunications(prev => [created, ...prev])
      setCommunicationDraft(prev => ({
        channel: prev.channel,
        direction: prev.direction,
        subject: '',
        text: '',
        occurredAt: nowLocalDateTime()
      }))
      setCommunicationError(null)
      await loadIntelligence()
      await refreshCommunications()
    } catch (err) {
      console.error(err)
      setCommunicationError('Failed to record communication')
    } finally {
      setCommunicationSubmitting(false)
    }
  }

  const intelligenceMetrics = useMemo(() => {
    if (!intelligence) return null
    return {
      tenders: intelligence.metrics.tenders,
      documents: intelligence.metrics.documents,
      activities: intelligence.metrics.activities,
      engagementScore: intelligence.engagementScore,
      engagement: intelligence.engagement,
      sentiment: intelligence.sentiment,
      communications: intelligence.communications
    }
  }, [intelligence])

  if (!serverMode) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <strong style={{ display: 'block', marginBottom: 6 }}>Attachments</strong>
        <div style={{ color: 'var(--muted)' }}>Switch to server mode to access shared documents and intelligence.</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 12, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>{entityType === 'customer' ? 'Customer workspace' : 'Tender attachments'}</strong>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{entityName || `ID: ${entityId}`}</div>
        </div>
        <button className="ghost" type="button" onClick={() => refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {canManageDocuments && (
        <form onSubmit={handleUpload} style={{ display: 'grid', gap: 10, padding: 12, border: '1px dashed var(--border)', borderRadius: 12, background: 'rgba(59,130,246,0.06)' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12 }}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Proposal.pdf" required={!file} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12 }}>Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Short context for discovery"></textarea>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12 }}>Tags</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="scope,pricing" />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12 }}>File upload</label>
            <input type="file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
          </div>
          <div>
          <button className="primary" type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Attach document'}
          </button>
          <button className="ghost" type="button" style={{ marginLeft: 8 }} onClick={resetDraft} disabled={uploading}>Reset</button>
          </div>
        </form>
      )}

      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading linked documents…</div>
      ) : documents.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No documents linked yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {documents.map(doc => {
            const downloadHref = doc.downloadUrl || DocumentsApi.downloadUrl(doc.id)
            return (
              <article key={doc.id} style={{ borderRadius: 14, border: '1px solid var(--border)', padding: 12, background: 'rgba(255,255,255,0.85)', boxShadow: '0 12px 28px rgba(15,23,42,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <strong>{doc.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{doc.updatedAt ? `Updated ${formatDate(doc.updatedAt)}` : `Uploaded ${formatDate(doc.uploadedAt)}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {downloadHref && (
                    <a className="ghost" href={downloadHref} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Download</a>
                  )}
                  {canManageDocuments && (
                    <button className="ghost" type="button" style={{ fontSize: 12 }} onClick={() => handleDetach(doc)}>Unlink</button>
                  )}
                </div>
              </div>
              {doc.summary || doc.textSnippet ? (
                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text, #111827)' }}>{doc.summary || doc.textSnippet}</p>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {doc.category && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.16)', color: '#4f46e5' }}>{doc.category}</span>}
                {(doc.tags || []).map(tag => (
                  <span key={tag} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(15,23,42,0.08)', color: 'var(--muted)' }}>#{tag}</span>
                ))}
              </div>
              </article>
            )
          })}
        </div>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <strong>Search workspace</strong>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find proposals, notes, OCR snippets…"
              style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid var(--border)' }}
            />
            <button className="ghost" type="submit" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
          </form>
        </header>
        {searchError && <div style={{ color: '#dc2626', fontSize: 12 }}>{searchError}</div>}
        {searchResults.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Results appear here. OCR-powered search covers documents, comments, and related tenders.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {searchResults.map(result => (
              <li key={`${result.type}-${result.id}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'rgba(255,255,255,0.65)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{result.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(result.updatedAt)}</span>
                </div>
                {result.snippet && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text, #1f2937)' }}>{result.snippet}</div>}
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9' }}>{result.type}</span>
                  {typeof result.metadata?.category === 'string' && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', color: '#4f46e5' }}>{result.metadata.category}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entityType === 'customer' && (
        <>
          <section style={{ display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong>Customer intelligence</strong>
              {intelligenceMetrics?.engagement && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#4338ca', background: 'rgba(99,102,241,0.18)', padding: '4px 10px', borderRadius: 999 }}>
                    Stage {intelligenceMetrics.engagement.stage}
                  </span>
                  <span style={{ fontSize: 12, color: '#0ea5e9', background: 'rgba(14,165,233,0.12)', padding: '4px 10px', borderRadius: 999 }}>
                    Score {intelligenceMetrics.engagement.score}
                  </span>
                </div>
              )}
            </header>
            {intelligenceError && <div style={{ color: '#dc2626', fontSize: 12 }}>{intelligenceError}</div>}
            {intelligenceMetrics ? (
              <>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                  {metricCard('Active tenders', intelligenceMetrics.tenders.active, 'linear-gradient(135deg, rgba(129,140,248,0.16), rgba(139,92,246,0.26))', `${intelligenceMetrics.tenders.total} total`)}
                  {metricCard('Documents', intelligenceMetrics.documents.total, 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(14,165,233,0.2))', intelligenceMetrics.documents.lastUpdated ? `Updated ${formatDate(intelligenceMetrics.documents.lastUpdated)}` : 'No recent updates')}
                  {metricCard('Activities', intelligenceMetrics.activities.total, 'linear-gradient(135deg, rgba(16,185,129,0.16), rgba(5,150,105,0.22))', intelligenceMetrics.activities.lastCreated ? `Last ${formatDate(intelligenceMetrics.activities.lastCreated)}` : 'Log a note to build history')}
                </div>
                {intelligenceMetrics.engagement?.trend?.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {intelligenceMetrics.engagement.trend.slice(0, 4).map(point => (
                      <div key={point.computedAt} style={{ padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(15,23,42,0.04)', minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(point.computedAt).toLocaleDateString()}</div>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>{point.score}</div>
                        <div style={{ fontSize: 12, color: '#4338ca' }}>{point.stage}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {intelligenceMetrics.sentiment && (
                  <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 12, background: 'rgba(14,165,233,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>Sentiment pulse</strong>
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.7)', color: '#0f172a' }}>
                        {intelligenceMetrics.sentiment.label.toUpperCase()} • {intelligenceMetrics.sentiment.averageScore.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Last update {intelligenceMetrics.sentiment.lastUpdated ? formatDate(intelligenceMetrics.sentiment.lastUpdated) : 'No recent logs'} • Sample size {intelligenceMetrics.sentiment.sampleSize}
                    </div>
                    {intelligenceMetrics.sentiment.recent.length ? (
                      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text, #1f2937)' }}>
                        {intelligenceMetrics.sentiment.recent.map(item => (
                          <li key={item.id} style={{ marginBottom: 4 }}>
                            <strong style={{ marginRight: 6, textTransform: 'capitalize', color: item.label === 'negative' ? '#b91c1c' : item.label === 'positive' ? '#15803d' : '#475569' }}>{item.label}</strong>
                            <span>{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Log communications to build sentiment history.</div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Recent intelligence will populate as soon as this customer has server-side activity.</div>
            )}
            {intelligence?.recommendations?.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text, #1f2937)', fontSize: 13 }}>
                {intelligence.recommendations.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section style={{ display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong>Customer segments</strong>
              <button className="ghost" type="button" onClick={refreshSegments} disabled={segmentsLoading}>
                {segmentsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </header>
            {segmentError && <div style={{ color: '#dc2626', fontSize: 12 }}>{segmentError}</div>}
            {segments.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {segments.map(segment => {
                  const background = segment.color && /^#/i.test(segment.color) ? segment.color : 'rgba(99,102,241,0.16)'
                  const textColor = segment.color && /^#/i.test(segment.color) ? '#ffffff' : '#1f2937'
                  return (
                    <div key={segment.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background, color: textColor }}>
                      <span style={{ fontWeight: 600 }}>{segment.segment}</span>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{segment.source === 'system' ? 'system' : 'manual'}</span>
                      {canManageSegments && segment.source === 'manual' && (
                        <button type="button" className="ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => handleSegmentRemove(segment.id)}>Remove</button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No segments recorded yet — tag this customer to align outreach playbooks.</div>
            )}
            {canManageSegments && (
              <form onSubmit={handleSegmentSubmit} style={{ display: 'grid', gap: 8, padding: 12, border: '1px dashed var(--border)', borderRadius: 12, background: 'rgba(79,70,229,0.08)' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 12 }}>Segment</label>
                  <input
                    list="segment-suggestions"
                    value={segmentDraft.segment}
                    onChange={(e) => setSegmentDraft(prev => ({ ...prev, segment: e.target.value }))}
                    placeholder="Champion"
                  />
                  <datalist id="segment-suggestions">
                    {SEGMENT_SUGGESTIONS.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 12 }}>Notes</label>
                  <input
                    value={segmentDraft.description}
                    onChange={(e) => setSegmentDraft(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Why does this segment apply?"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ fontSize: 12 }}>Color</label>
                  <input type="color" value={segmentDraft.color} onChange={(e) => setSegmentDraft(prev => ({ ...prev, color: e.target.value }))} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{segmentDraft.color}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="primary" type="submit">Add segment</button>
                  <button className="ghost" type="button" onClick={() => setSegmentDraft(prev => ({ segment: '', description: '', color: prev.color }))}>Clear</button>
                </div>
              </form>
            )}
          </section>

          <section style={{ display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong>Communication hub</strong>
              <button className="ghost" type="button" onClick={refreshCommunications} disabled={communicationsLoading}>
                {communicationsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </header>
            {communicationError && <div style={{ color: '#dc2626', fontSize: 12 }}>{communicationError}</div>}
            {intelligence?.communications?.summary ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                <span>Logged interactions: <strong style={{ color: '#0f172a' }}>{intelligence.communications.summary.total}</strong></span>
                <span>Last interaction: {intelligence.communications.summary.lastInteractionAt ? formatDate(intelligence.communications.summary.lastInteractionAt) : 'None yet'}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  Channels:
                  {Object.entries(intelligence.communications.summary.byChannel || {}).length > 0 ? (
                    Object.entries(intelligence.communications.summary.byChannel || {}).map(([channel, count]) => (
                      <span key={channel} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(14,165,233,0.12)', color: '#0ea5e9' }}>{channel}: {count}</span>
                    ))
                  ) : (
                    <span style={{ fontSize: 11 }}>No channel diversity yet</span>
                  )}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No communications captured yet — log calls, meetings, and emails to activate the hub.</div>
            )}
            {communicationsLoading ? (
              <div style={{ color: 'var(--muted)' }}>Loading communications…</div>
            ) : communications.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Log the next call or email to populate this timeline.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {communications.map(comm => (
                  <article key={comm.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.7)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ textTransform: 'capitalize' }}>{comm.channel || 'touchpoint'}</strong>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {comm.direction ? `${comm.direction === 'outbound' ? 'Outbound' : 'Inbound'} • ` : ''}{formatDate(comm.occurredAt || comm.createdAt)}
                        </div>
                        {comm.subject && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{comm.subject}</div>}
                      </div>
                      {comm.sentimentLabel && (
                        <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: comm.sentimentLabel === 'positive' ? 'rgba(34,197,94,0.16)' : comm.sentimentLabel === 'negative' ? 'rgba(239,68,68,0.16)' : 'rgba(148,163,184,0.16)', color: comm.sentimentLabel === 'positive' ? '#15803d' : comm.sentimentLabel === 'negative' ? '#b91c1c' : '#475569' }}>
                          Sentiment {comm.sentimentLabel}
                        </span>
                      )}
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13 }}>{comm.text}</p>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{comm.userName || comm.userEmail ? `Logged by ${comm.userName || comm.userEmail}` : 'Logged automatically'}</div>
                  </article>
                ))}
              </div>
            )}
            {canLogCommunication && (
              <form onSubmit={handleCommunicationSubmit} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px dashed var(--border)', background: 'rgba(14,165,233,0.06)' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <label style={{ fontSize: 12 }}>Channel</label>
                    <select value={communicationDraft.channel} onChange={(e) => setCommunicationDraft(prev => ({ ...prev, channel: e.target.value }))}>
                      {COMMUNICATION_CHANNELS.map(channel => (
                        <option key={channel} value={channel}>{channel}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <label style={{ fontSize: 12 }}>Direction</label>
                    <select value={communicationDraft.direction} onChange={(e) => setCommunicationDraft(prev => ({ ...prev, direction: e.target.value as 'inbound' | 'outbound' }))}>
                      <option value="outbound">Outbound</option>
                      <option value="inbound">Inbound</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <label style={{ fontSize: 12 }}>Occurred at</label>
                    <input
                      type="datetime-local"
                      value={communicationDraft.occurredAt}
                      onChange={(e) => setCommunicationDraft(prev => ({ ...prev, occurredAt: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 12 }}>Subject</label>
                  <input value={communicationDraft.subject} onChange={(e) => setCommunicationDraft(prev => ({ ...prev, subject: e.target.value }))} placeholder="Discovery call" />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 12 }}>Summary</label>
                  <textarea
                    value={communicationDraft.text}
                    onChange={(e) => setCommunicationDraft(prev => ({ ...prev, text: e.target.value }))}
                    rows={3}
                    placeholder="Key notes, next steps, sentiment drivers"
                    required
                  />
                </div>
                <div>
                  <button className="primary" type="submit" disabled={communicationSubmitting}>
                    {communicationSubmitting ? 'Logging…' : 'Log communication'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  )
}
