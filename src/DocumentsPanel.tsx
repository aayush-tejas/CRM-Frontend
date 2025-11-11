import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { getSession } from './auth/session'
import { DocumentsApi, type DocumentCreateInput } from './api'
import type { DocumentRecord } from './types'

const CATEGORY_META: Record<NonNullable<DocumentRecord['category']>, { label: string; gradient: string; accent: string }> = {
  Tender: {
    label: 'Tenders',
    gradient: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(79,70,229,0.22))',
    accent: '#7c3aed'
  },
  Customer: {
    label: 'Customers',
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(6,182,212,0.22))',
    accent: '#0ea5e9'
  },
  Team: {
    label: 'Team Playbooks',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.22))',
    accent: '#10b981'
  },
  Internal: {
    label: 'Internal',
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(249,115,22,0.18))',
    accent: '#f59e0b'
  }
}

const defaultSession = getSession()

type DocumentFormState = {
  name: string
  owner: string
  relatedTo: string
  category: NonNullable<DocumentRecord['category']>
  tags: string
  summary: string
  link: string
  file: File | null
}

function createEmptyForm(): DocumentFormState {
  return {
    name: '',
    owner: defaultSession?.name || defaultSession?.email || '',
    relatedTo: '',
    category: 'Tender',
    tags: '',
    summary: '',
    link: '',
    file: null
  }
}

function formatBytes(bytes?: number | null): string | null {
  if (bytes === undefined || bytes === null) return null
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, index)
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
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

export default function DocumentsPanel() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<'All' | NonNullable<DocumentRecord['category']>>('All')
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<DocumentFormState>(() => createEmptyForm())
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    refreshDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshDocuments() {
    setLoading(true)
    try {
      const list = await DocumentsApi.list()
      setDocuments(list)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('Failed to load documents')
      showToast('Failed to load documents', 'error')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setDraft(createEmptyForm())
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    setDraft(prev => ({ ...prev, file }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      showToast('Document name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const tags = draft.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
      const payload: DocumentCreateInput = {
        name,
        owner: draft.owner?.trim() || undefined,
        relatedTo: draft.relatedTo?.trim() || undefined,
        category: draft.category,
        tags,
        summary: draft.summary?.trim() || undefined,
        link: draft.link?.trim() || undefined,
        file: draft.file,
        fileName: draft.file?.name
      }
      const created = await DocumentsApi.create(payload)
      setDocuments(prev => [created, ...prev])
      showToast('Document added')
      setFormOpen(false)
      resetForm()
    } catch (err) {
      console.error(err)
      showToast('Failed to save document', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this document from the workspace?')) return
    setRemovingId(id)
    try {
      await DocumentsApi.remove(id)
      setDocuments(prev => prev.filter(doc => doc.id !== id))
      showToast('Document removed')
    } catch (err) {
      console.error(err)
      showToast('Failed to delete document', 'error')
    } finally {
      setRemovingId(prev => (prev === id ? null : prev))
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return documents.filter(doc => {
      if (activeCategory !== 'All' && doc.category !== activeCategory) return false
      if (!query) return true
      const haystack = [
        doc.name,
        doc.owner,
        doc.relatedTo,
        doc.category,
        doc.summary,
        doc.fileName,
        doc.link,
        doc.textSnippet,
        (doc.tags || []).join(','),
        (doc.entities || []).map(entity => `${entity.entityType}:${entity.entityId}`).join(',')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [documents, search, activeCategory])

  const stats = useMemo(() => {
    const total = documents.length
    const byCategory = documents.reduce<Record<string, number>>((acc, doc) => {
      const key = doc.category || 'Unclassified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const recent = [...documents]
      .sort((a, b) => {
        const left = Date.parse(a.updatedAt || a.uploadedAt)
        const right = Date.parse(b.updatedAt || b.uploadedAt)
        return right - left
      })
      .slice(0, 3)
    return { total, byCategory, recent }
  }, [documents])

  const badgeThemes: Record<'primary' | 'secondary', { bg: string; color: string }> = {
    primary: { bg: 'rgba(79,70,229,0.16)', color: '#4f46e5' },
    secondary: { bg: 'rgba(8,145,178,0.14)', color: '#0891b2' }
  }

  return (
    <section className="card" style={{ marginTop: 16, padding: 20, background: 'var(--surface)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Document workspace</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', maxWidth: 520 }}>
            Collect proposals, customer briefs, and internal playbooks in one stylish vault. Search across tags, surface what matters, and keep teams aligned.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>🔍</span>
            <input
              type="search"
              placeholder="Search files, owners, tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '8px 12px 8px 34px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.45)' }}
            />
          </div>
          <button className="ghost" type="button" onClick={() => refreshDocuments()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="primary" type="button" onClick={() => setFormOpen(true)}>
            Add document
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ marginTop: 18, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <div style={{ padding: 18, borderRadius: 18, background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(129,140,248,0.3))', boxShadow: '0 18px 40px rgba(15,23,42,0.12)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 1 }}>TOTAL ASSETS</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{stats.total}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Documents curated across your teams</div>
        </div>
        {Object.entries(stats.byCategory).map(([category, value]) => {
          const meta = CATEGORY_META[category as NonNullable<DocumentRecord['category']>]
          return (
            <div key={category} style={{ padding: 18, borderRadius: 18, background: meta?.gradient || 'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(6,95,70,0.18))' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: meta?.accent || 'var(--muted)', letterSpacing: 1 }}>{category}</div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.72)', marginTop: 4 }}>Smart summaries & attachments curated here.</div>
            </div>
          )
        })}
        {stats.recent.length > 0 && (
          <div style={{ padding: 18, borderRadius: 18, background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(59,130,246,0.24))' }}>
            <div style={{ fontSize: 12, color: '#0ea5e9', letterSpacing: 1 }}>RECENTLY ADDED</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0', display: 'grid', gap: 8 }}>
              {stats.recent.map(doc => {
                const timestamp = doc.updatedAt || doc.uploadedAt
                return (
                  <li key={doc.id} style={{ fontSize: 13, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{doc.name}</span>
                    {timestamp && <span style={{ color: 'var(--muted)' }}>{new Date(timestamp).toLocaleString()}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={activeCategory === 'All' ? 'primary' : 'ghost'}
          onClick={() => setActiveCategory('All')}
          style={activeCategory === 'All' ? undefined : { border: '1px solid var(--border)' }}
        >
          All
        </button>
        {(Object.keys(CATEGORY_META) as Array<NonNullable<DocumentRecord['category']>>).map(key => {
          const meta = CATEGORY_META[key]
          return (
            <button
              key={key}
              type="button"
              className={activeCategory === key ? 'primary' : 'ghost'}
              onClick={() => setActiveCategory(key)}
              style={activeCategory === key ? undefined : { border: '1px solid var(--border)' }}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div style={{ padding: 18, borderRadius: 16, border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--muted)' }}>
            Loading documents…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 18, border: '1px dashed var(--border)', borderRadius: 16, textAlign: 'center', color: 'var(--muted)' }}>
            No documents found. Refine your search or add something new.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            {filtered.map(doc => {
              const meta = doc.category ? CATEGORY_META[doc.category] : undefined
              const downloadHref = doc.downloadUrl || (doc.id ? DocumentsApi.downloadUrl(doc.id) : undefined)
              const sizeLabel = formatBytes(doc.fileSize)
              const snippet = doc.summary || doc.textSnippet || ''
              return (
                <article key={doc.id} style={{ borderRadius: 18, padding: 18, background: meta?.gradient || 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.2))', boxShadow: '0 20px 45px rgba(15,23,42,0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{doc.name}</h3>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {doc.updatedAt ? `Updated ${new Date(doc.updatedAt).toLocaleString()}` : `Uploaded ${new Date(doc.uploadedAt).toLocaleString()}`}
                      </div>
                    </div>
                    <button className="ghost" type="button" onClick={() => handleDelete(doc.id)} disabled={removingId === doc.id} style={{ fontSize: 12 }}>
                      {removingId === doc.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {doc.category && (
                      <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, background: badgeThemes.primary.bg, color: badgeThemes.primary.color }}>{doc.category}</span>
                    )}
                    {doc.relatedTo && (
                      <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, background: badgeThemes.secondary.bg, color: badgeThemes.secondary.color }}>#{doc.relatedTo}</span>
                    )}
                    {(doc.entities || []).map(entity => (
                      <span key={`${entity.entityType}:${entity.entityId}`} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, background: 'rgba(12,74,110,0.12)', color: '#0f172a' }}>
                        {entity.entityType === 'customer' ? 'Customer' : 'Tender'} #{entity.entityId}
                      </span>
                    ))}
                    {(doc.tags || []).map(tag => (
                      <span key={tag} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: 'rgba(15,23,42,0.1)', color: 'var(--muted)' }}>#{tag}</span>
                    ))}
                  </div>
                  {snippet && (
                    <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text, #1f2937)' }}>{snippet}</p>
                  )}
                  <dl style={{ margin: 0, marginTop: 12, display: 'grid', gap: 8, fontSize: 12 }}>
                    {doc.owner && <div><dt style={{ fontWeight: 600, display: 'inline' }}>Owner:</dt> <dd style={{ display: 'inline', margin: 0 }}>{doc.owner}</dd></div>}
                    {doc.fileName && (
                      <div>
                        <dt style={{ fontWeight: 600, display: 'inline' }}>File:</dt>{' '}
                        <dd style={{ display: 'inline', margin: 0 }}>
                          {doc.fileName}
                          {sizeLabel ? ` • ${sizeLabel}` : ''}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {doc.link && (
                      <a className="ghost" href={doc.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)' }}>
                        Open link
                      </a>
                    )}
                    {downloadHref && (
                      <a className="ghost" href={downloadHref} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: '8px 12px', borderRadius: 999, border: '1px solid transparent', background: 'rgba(255,255,255,0.35)' }}>
                        Download
                      </a>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <dialog open style={{ border: 'none', borderRadius: 18, padding: 0, boxShadow: '0 24px 64px rgba(15,23,42,0.28)', maxWidth: 520, width: '100%' }}>
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'grid', gap: 14 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Add a document</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>Upload files or reference links—everything stays in sync with your CRM.</p>
              </div>
              <button type="button" className="ghost" onClick={() => { setFormOpen(false); resetForm() }}>Close</button>
            </header>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Name</span>
              <input value={draft.name} onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))} required />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Owner</span>
              <input value={draft.owner} onChange={(e) => setDraft(prev => ({ ...prev, owner: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Related to</span>
              <input placeholder="e.g., Tender RFP-2045" value={draft.relatedTo} onChange={(e) => setDraft(prev => ({ ...prev, relatedTo: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Category</span>
              <select value={draft.category} onChange={(e) => setDraft(prev => ({ ...prev, category: e.target.value as NonNullable<DocumentRecord['category']> }))}>
                {(Object.keys(CATEGORY_META) as Array<NonNullable<DocumentRecord['category']>>).map(key => (
                  <option key={key} value={key}>{CATEGORY_META[key].label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Tags</span>
              <input placeholder="Comma separated" value={draft.tags} onChange={(e) => setDraft(prev => ({ ...prev, tags: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Summary</span>
              <textarea rows={3} value={draft.summary} onChange={(e) => setDraft(prev => ({ ...prev, summary: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Link (optional)</span>
              <input placeholder="https://" type="url" value={draft.link} onChange={(e) => setDraft(prev => ({ ...prev, link: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Attach file</span>
              <input type="file" onChange={handleFileChange} />
              {draft.file && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Selected: {draft.file.name} ({formatBytes(draft.file.size) || `${Math.round(draft.file.size / 1024)} KB`})
                  <button type="button" className="ghost" style={{ marginLeft: 8 }} onClick={() => setDraft(prev => ({ ...prev, file: null }))}>Remove</button>
                </div>
              )}
            </label>
            <footer style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="ghost" onClick={() => { setFormOpen(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save to workspace'}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  )
}
