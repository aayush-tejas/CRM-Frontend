import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ApprovalsApi,
  type ApprovalPolicyInput,
  type ApprovalRequestInput,
  type ApprovalDecisionInput
} from './api'
import type { ApprovalPolicy, ApprovalRequest } from './types'
import type { Role } from './auth/session'

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

type ApprovalsPanelProps = {
  sessionRole: Role
  serverMode: boolean
}

type PolicyFormState = {
  name: string
  description: string
  criteria: string
  steps: string
  isActive: boolean
}

type RequestFormState = {
  policyId: string
  entityType: 'tender' | 'customer' | 'employee'
  entityId: string
  context: string
}

const policyInitial: PolicyFormState = {
  name: '',
  description: '',
  criteria: '',
  steps: '',
  isActive: true
}

const requestInitial: RequestFormState = {
  policyId: '',
  entityType: 'tender',
  entityId: '',
  context: ''
}

const statusFilters = ['all', 'pending', 'approved', 'rejected', 'escalated', 'in_review']
const entityTypes: Array<RequestFormState['entityType']> = ['tender', 'customer', 'employee']
const REQUEST_STATUS_COLORS: Record<ApprovalRequest['status'], string> = {
  pending: '#f59e0b',
  in_review: '#2563eb',
  approved: '#16a34a',
  rejected: '#dc2626',
  escalated: '#7c3aed'
}

function getRequestStatusColor(status: ApprovalRequest['status']): string {
  if (status && status in REQUEST_STATUS_COLORS) {
    return REQUEST_STATUS_COLORS[status]
  }
  return '#1f2937'
}

export default function ApprovalsPanel({ sessionRole, serverMode }: ApprovalsPanelProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'policies'>('requests')

  const [policies, setPolicies] = useState<ApprovalPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(false)
  const [policyFormOpen, setPolicyFormOpen] = useState(false)
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(policyInitial)
  const [policySaving, setPolicySaving] = useState(false)

  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [entityFilter, setEntityFilter] = useState<RequestFormState['entityType'] | 'all'>('all')
  const [requestForm, setRequestForm] = useState<RequestFormState>(requestInitial)
  const [requestSaving, setRequestSaving] = useState(false)
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})

  const canManagePolicies = sessionRole === 'admin'
  const canDecide = sessionRole === 'admin' || sessionRole === 'manager'

  const activePolicies = useMemo(() => policies.filter(policy => policy.isActive), [policies])

  const openCount = useMemo(() => requests.filter(request => request.status === 'pending' || request.status === 'in_review').length, [requests])
  const escalatedCount = useMemo(() => requests.filter(request => request.status === 'escalated').length, [requests])
  const latestDecision = useMemo(() => {
    const decided = requests
      .filter(request => Boolean(request.decidedAt))
      .sort((a, b) => Date.parse(b.decidedAt || '') - Date.parse(a.decidedAt || ''))
    return decided[0] ?? null
  }, [requests])
  const summaryCards = useMemo(() => ([
    {
      key: 'queue',
      label: 'Open approvals',
      value: openCount,
      helper: `${requests.length} in pipeline`,
      accent: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(37,99,235,0.45))',
      icon: '🗂️'
    },
    {
      key: 'policies',
      label: 'Active policies',
      value: activePolicies.length,
      helper: `${policies.length} total`,
      accent: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(88,28,135,0.45))',
      icon: '🛡️'
    },
    {
      key: 'escalations',
      label: 'Escalations',
      value: escalatedCount,
      helper: latestDecision ? `${latestDecision.status} · ${latestDecision.entityType}` : 'No decisions yet',
      accent: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(190,24,93,0.45))',
      icon: '⚡'
    }
  ]), [activePolicies.length, escalatedCount, latestDecision, openCount, policies.length, requests.length])

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
          boxShadow: isActive ? '0 10px 20px rgba(45,55,72,0.25)' : 'none',
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
    if (!serverMode) return
    loadPolicies(true)
    loadRequests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode])

  useEffect(() => {
    if (!serverMode) return
    loadRequests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, entityFilter])

  async function loadPolicies(includeInactive = false) {
    setPoliciesLoading(true)
    try {
      const rows = await ApprovalsApi.policies.list(includeInactive)
      setPolicies(rows)
    } catch (err) {
      console.error('Failed to load approval policies', err)
      setPolicies([])
      showToast('Failed to load policies', 'error')
    } finally {
      setPoliciesLoading(false)
    }
  }

  async function loadRequests() {
    setRequestsLoading(true)
    try {
      const response = await ApprovalsApi.requests.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        entityType: entityFilter === 'all' ? undefined : entityFilter
      })
      setRequests(response)
    } catch (err) {
      console.error('Failed to load approval requests', err)
      setRequests([])
      showToast('Failed to load requests', 'error')
    } finally {
      setRequestsLoading(false)
    }
  }

  function resetPolicyForm() {
    setPolicyForm(policyInitial)
  }

  function resetRequestForm() {
    setRequestForm(requestInitial)
  }

  function parseJsonField(label: string, value: string): Record<string, unknown> | undefined {
    if (!value.trim()) return undefined
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      showToast(`${label} must be valid JSON`, 'error')
      throw new Error('invalid-json')
    }
  }

  async function handleSavePolicy(e: FormEvent) {
    e.preventDefault()
    if (!policyForm.name.trim()) {
      showToast('Policy name is required', 'error')
      return
    }

    let criteria: Record<string, unknown> | undefined
    try {
      criteria = parseJsonField('Criteria', policyForm.criteria)
    } catch (err: any) {
      if (err?.message === 'invalid-json') return
      throw err
    }

    let steps: Array<Record<string, unknown>> | undefined
    const stepsValue = policyForm.steps.trim()
    if (stepsValue) {
      try {
        const parsed = JSON.parse(stepsValue)
        if (!Array.isArray(parsed)) {
          showToast('Steps must be an array', 'error')
          return
        }
        steps = parsed as Array<Record<string, unknown>>
      } catch {
        showToast('Steps must be valid JSON', 'error')
        return
      }
    }

    const payload: ApprovalPolicyInput = {
      name: policyForm.name.trim(),
      description: policyForm.description.trim() || undefined,
      criteria: criteria,
      steps: steps,
      isActive: policyForm.isActive
    }

    setPolicySaving(true)
    try {
      await ApprovalsApi.policies.create(payload)
      showToast('Policy created')
      resetPolicyForm()
      setPolicyFormOpen(false)
      await loadPolicies(true)
    } catch (err: any) {
      console.error('Failed to save policy', err)
      const message = typeof err?.message === 'string' ? err.message : 'Failed to save policy'
      showToast(message, 'error')
    } finally {
      setPolicySaving(false)
    }
  }

  async function handleTogglePolicy(policy: ApprovalPolicy) {
    try {
      await ApprovalsApi.policies.update(policy.id, { isActive: !policy.isActive })
      setPolicies(prev => prev.map(item => item.id === policy.id ? { ...item, isActive: !item.isActive } : item))
      showToast(`Policy ${!policy.isActive ? 'activated' : 'archived'}`)
    } catch (err) {
      console.error('Failed to toggle policy', err)
      showToast('Failed to toggle policy', 'error')
    }
  }

  async function handleDeletePolicy(policy: ApprovalPolicy) {
    const confirmDelete = window.confirm(`Delete policy "${policy.name}"?`)
    if (!confirmDelete) return
    try {
      await ApprovalsApi.policies.remove(policy.id)
      setPolicies(prev => prev.filter(item => item.id !== policy.id))
      showToast('Policy deleted')
    } catch (err) {
      console.error('Failed to delete policy', err)
      showToast('Failed to delete policy', 'error')
    }
  }

  async function handleSubmitRequest(e: FormEvent) {
    e.preventDefault()
    if (!requestForm.policyId) {
      showToast('Select a policy', 'error')
      return
    }
    if (!requestForm.entityId.trim()) {
      showToast('Provide target entity id', 'error')
      return
    }

    let context: Record<string, unknown> | undefined
    try {
      context = parseJsonField('Context', requestForm.context)
    } catch (err: any) {
      if (err?.message === 'invalid-json') return
      throw err
    }

    const payload: ApprovalRequestInput = {
      policyId: requestForm.policyId,
      entityType: requestForm.entityType,
      entityId: requestForm.entityId.trim(),
      context: context ?? null
    }

    setRequestSaving(true)
    try {
      await ApprovalsApi.requests.create(payload)
      showToast('Approval request submitted')
      resetRequestForm()
      await loadRequests()
    } catch (err) {
      console.error('Failed to submit request', err)
      showToast('Failed to submit request', 'error')
    } finally {
      setRequestSaving(false)
    }
  }

  async function handleDecision(id: string, status: ApprovalDecisionInput['status']) {
    if (!canDecide) return
    const notes = (decisionNotes[id] || '').trim()
    try {
      await ApprovalsApi.requests.decide(id, { status, notes: notes || undefined })
      showToast(`Request ${status}`)
      setDecisionNotes(prev => ({ ...prev, [id]: '' }))
      await loadRequests()
    } catch (err) {
      console.error('Failed to update request', err)
      showToast('Failed to update request', 'error')
    }
  }

  if (!serverMode) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Approval workflows</h3>
        <p style={{ color: 'var(--muted)', marginTop: 6 }}>
          Connect to the backend server to unlock policy routing, decision logging, and audit trails.
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
          background: 'linear-gradient(135deg, rgba(76,29,149,0.18), rgba(30,27,75,0.78))',
          color: '#ede9fe',
          boxShadow: '0 18px 34px rgba(30,27,75,0.35)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: 22 }}>Approval control tower</h3>
            <p style={{ margin: '6px 0 0', maxWidth: 420 }}>
              Keep policies sharp, surface escalations instantly, and give reviewers a clean runway to decide with context.
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
          {renderTabButton('requests', 'Requests', '🗂️')}
          {renderTabButton('policies', 'Policies', '🛡️')}
        </div>
      </section>

      {activeTab === 'policies' && (
        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Approval policies</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Codify guardrails before work reaches auditors or leadership.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ghost" type="button" onClick={() => loadPolicies(true)} disabled={policiesLoading}>
                {policiesLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              {canManagePolicies && (
                <button className="ghost" type="button" onClick={() => { setPolicyFormOpen(prev => !prev); resetPolicyForm() }}>
                  {policyFormOpen ? 'Close form' : 'New policy'}
                </button>
              )}
            </div>
          </header>

          {canManagePolicies && policyFormOpen && (
            <form onSubmit={handleSavePolicy} className="card" style={{ background: 'rgba(88,28,135,0.06)', borderRadius: 16, padding: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Name</span>
                  <input value={policyForm.name} onChange={e => setPolicyForm(prev => ({ ...prev, name: e.target.value }))} required />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Status</span>
                  <select value={policyForm.isActive ? 'active' : 'inactive'} onChange={e => setPolicyForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Description</span>
                <textarea rows={2} value={policyForm.description} onChange={e => setPolicyForm(prev => ({ ...prev, description: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Criteria (JSON)</span>
                <textarea rows={3} placeholder='{"threshold":"500000"}' value={policyForm.criteria} onChange={e => setPolicyForm(prev => ({ ...prev, criteria: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span>Steps (JSON array)</span>
                <textarea rows={3} placeholder='[{"label":"Finance"}]' value={policyForm.steps} onChange={e => setPolicyForm(prev => ({ ...prev, steps: e.target.value }))} />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="primary" type="submit" disabled={policySaving}>
                  {policySaving ? 'Saving…' : 'Create policy'}
                </button>
                <button className="ghost" type="button" onClick={() => { resetPolicyForm(); setPolicyFormOpen(false) }} disabled={policySaving}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Created</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Criteria</th>
                  <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)' }}>
                      {policiesLoading ? 'Loading policies…' : 'No policies yet.'}
                    </td>
                  </tr>
                ) : policies.map(policy => (
                  <tr key={policy.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{policy.name}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      {statusChip(policy.isActive ? 'Active' : 'Archived', policy.isActive ? '#16a34a' : '#64748b')}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{new Date(policy.createdAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      {policy.criteria ? JSON.stringify(policy.criteria).slice(0, 60) + (JSON.stringify(policy.criteria).length > 60 ? '…' : '') : '—'}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      {canManagePolicies && (
                        <>
                          <button className="ghost" type="button" onClick={() => handleTogglePolicy(policy)}>
                            {policy.isActive ? 'Archive' : 'Activate'}
                          </button>
                          <button className="ghost" type="button" onClick={() => handleDeletePolicy(policy)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'requests' && (
        <section className="card" style={{ display: 'grid', gap: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Approval queue</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Route sensitive changes to the right reviewers, then capture the trail automatically.</p>
            </div>
            <button className="ghost" type="button" onClick={() => loadRequests()} disabled={requestsLoading}>
              {requestsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </header>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, background: 'rgba(148,163,184,0.15)', padding: 12, borderRadius: 14 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Status</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {statusFilters.map(status => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Entity type</span>
              <select value={entityFilter} onChange={e => setEntityFilter(e.target.value as typeof entityFilter)}>
                <option value="all">All entities</option>
                {entityTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          </div>

          <form onSubmit={handleSubmitRequest} className="card" style={{ background: 'rgba(30,64,175,0.05)', padding: 16, borderRadius: 16 }}>
            <h4 style={{ margin: '0 0 12px' }}>New approval request</h4>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Policy</span>
                <select value={requestForm.policyId} onChange={e => setRequestForm(prev => ({ ...prev, policyId: e.target.value }))} required>
                  <option value="">Select policy…</option>
                  {activePolicies.map(policy => (
                    <option key={policy.id} value={policy.id}>{policy.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Entity type</span>
                <select value={requestForm.entityType} onChange={e => setRequestForm(prev => ({ ...prev, entityType: e.target.value as RequestFormState['entityType'] }))}>
                  {entityTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Entity id</span>
                <input value={requestForm.entityId} onChange={e => setRequestForm(prev => ({ ...prev, entityId: e.target.value }))} placeholder="Record id" required />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span>Context (JSON)</span>
              <textarea rows={3} placeholder='{"amount": "750000"}' value={requestForm.context} onChange={e => setRequestForm(prev => ({ ...prev, context: e.target.value }))} />
            </label>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="primary" type="submit" disabled={requestSaving || !activePolicies.length}>
                {requestSaving ? 'Submitting…' : 'Submit request'}
              </button>
              <button className="ghost" type="button" onClick={() => resetRequestForm()} disabled={requestSaving}>Reset</button>
            </div>
            {!activePolicies.length && (
              <small style={{ color: '#dc2626', marginTop: 8, display: 'inline-block' }}>Create an active policy first.</small>
            )}
          </form>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Policy</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Entity</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Submitted</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Decision</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Context</th>
                  {canDecide && <th style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={canDecide ? 7 : 6} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)' }}>
                      {requestsLoading ? 'Loading requests…' : 'No requests yet.'}
                    </td>
                  </tr>
                ) : requests.map(request => (
                  <tr key={request.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{policies.find(policy => policy.id === request.policyId)?.name || request.policyId}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{request.entityType} · {request.entityId}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      {statusChip(request.status, getRequestStatusColor(request.status))}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{new Date(request.submittedAt).toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      {request.decidedAt ? `${new Date(request.decidedAt).toLocaleString()}${request.decisionNotes ? ` – ${request.decisionNotes}` : ''}` : 'Pending'}
                      {canDecide && ['pending', 'in_review'].includes(request.status) && (
                        <div style={{ marginTop: 6 }}>
                          <input
                            style={{ width: '100%', fontSize: 12 }}
                            placeholder="Decision notes"
                            value={decisionNotes[request.id] || ''}
                            onChange={e => setDecisionNotes(prev => ({ ...prev, [request.id]: e.target.value }))}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      {request.context ? JSON.stringify(request.context).slice(0, 80) + (JSON.stringify(request.context).length > 80 ? '…' : '') : '—'}
                    </td>
                    {canDecide && (
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {request.status === 'pending' && (
                          <>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'in_review')}>Start review</button>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'approved')}>Approve</button>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'rejected')}>Reject</button>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'escalated')}>Escalate</button>
                          </>
                        )}
                        {request.status === 'in_review' && (
                          <>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'approved')}>Approve</button>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'rejected')}>Reject</button>
                            <button className="ghost" type="button" onClick={() => handleDecision(request.id, 'escalated')}>Escalate</button>
                          </>
                        )}
                        {['approved', 'rejected', 'escalated'].includes(request.status) && (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Completed</span>
                        )}
                      </td>
                    )}
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
