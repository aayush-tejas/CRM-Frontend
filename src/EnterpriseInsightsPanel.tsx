import { useEffect, useMemo, useState } from 'react'
import { EnterpriseApi } from './api'
import type {
  OutlierRiskInsight,
  RealtimeDashboardMetrics,
  ReportPreview,
  ReportSubscription,
  SecurityPosture
} from './types'

const currencyFormatter = (currency: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
})

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value.toFixed(1)}%`
}

function formatHours(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '--'
  if (value >= 24) {
    return `${Math.round(value / 24)}d`
  }
  return `${Math.round(value)}h`
}

type Props = {
  serverMode: boolean
  canView: boolean
  canManageReports: boolean
  allowSecurityPosture: boolean
  showToast: (message: string, type?: 'success' | 'error') => void
}

export default function EnterpriseInsightsPanel({
  serverMode,
  canView,
  canManageReports,
  allowSecurityPosture,
  showToast
}: Props) {
  const [realtime, setRealtime] = useState<RealtimeDashboardMetrics | null>(null)
  const [realtimeLoading, setRealtimeLoading] = useState(false)
  const [outliers, setOutliers] = useState<OutlierRiskInsight | null>(null)
  const [outliersLoading, setOutliersLoading] = useState(false)
  const [security, setSecurity] = useState<SecurityPosture | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [reports, setReports] = useState<ReportSubscription[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [formName, setFormName] = useState('Weekly board pack')
  const [formRecipients, setFormRecipients] = useState('ops@vensysco.com, leadership@vensysco.com')
  const [formCadence, setFormCadence] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [formFormat, setFormFormat] = useState<'pdf' | 'xlsx' | 'json'>('pdf')
  const [creatingReport, setCreatingReport] = useState(false)
  const [dispatchPreview, setDispatchPreview] = useState<ReportPreview | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  useEffect(() => {
    if (!serverMode || !canView) {
      setRealtime(null)
      setOutliers(null)
      setSecurity(null)
      setReports([])
      return
    }
    const abort = new AbortController()
    const load = async () => {
      setError(null)
      await Promise.allSettled([
        refreshRealtime(abort.signal),
        refreshOutliers(abort.signal),
        allowSecurityPosture ? refreshSecurity(abort.signal) : Promise.resolve(),
        canManageReports ? refreshReports(abort.signal) : Promise.resolve()
      ])
    }
    load()
    return () => abort.abort()
  }, [serverMode, canView, allowSecurityPosture, canManageReports])

  async function refreshRealtime(signal?: AbortSignal) {
    setRealtimeLoading(true)
    try {
      const metrics = await EnterpriseApi.realtime()
      if (signal?.aborted) return
      setRealtime(metrics)
    } catch (err: any) {
      if (signal?.aborted) return
      setError('Unable to load real-time dashboard metrics.')
    } finally {
      if (!signal?.aborted) setRealtimeLoading(false)
    }
  }

  async function refreshOutliers(signal?: AbortSignal) {
    setOutliersLoading(true)
    try {
      const insights = await EnterpriseApi.outliers()
      if (signal?.aborted) return
      setOutliers(insights)
    } catch (err: any) {
      if (signal?.aborted) return
      setError('Unable to analyse risk outliers.')
    } finally {
      if (!signal?.aborted) setOutliersLoading(false)
    }
  }

  async function refreshSecurity(signal?: AbortSignal) {
    if (!allowSecurityPosture) return
    setSecurityLoading(true)
    try {
      const posture = await EnterpriseApi.securityPosture()
      if (signal?.aborted) return
      setSecurity(posture)
    } catch (err: any) {
      if (signal?.aborted) return
      setError('Unable to fetch security posture. Admin access required.')
    } finally {
      if (!signal?.aborted) setSecurityLoading(false)
    }
  }

  async function refreshReports(signal?: AbortSignal) {
    if (!canManageReports) return
    setReportsLoading(true)
    try {
      const list = await EnterpriseApi.reportSubscriptions()
      if (signal?.aborted) return
      setReports(list)
    } catch (err: any) {
      if (signal?.aborted) return
      setError('Unable to load scheduled report subscriptions.')
    } finally {
      if (!signal?.aborted) setReportsLoading(false)
    }
  }

  async function handleCreateReport() {
    if (!canManageReports) return
    const recipients = formRecipients
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0)
    if (recipients.length === 0) {
      showToast('Add at least one recipient email.', 'error')
      return
    }
    setCreatingReport(true)
    try {
      const created = await EnterpriseApi.createReportSubscription({
        name: formName.trim(),
        cadence: formCadence,
        recipients,
        format: formFormat,
        timezone
      })
      setReports(prev => [created, ...prev])
      showToast('Scheduled report saved')
      setFormName('Weekly board pack')
      setFormCadence('weekly')
      setFormFormat('pdf')
    } catch (err: any) {
      showToast('Failed to schedule report', 'error')
    } finally {
      setCreatingReport(false)
    }
  }

  async function handleDeleteReport(id: string) {
    if (!canManageReports) return
    try {
      await EnterpriseApi.deleteReportSubscription(id)
      setReports(prev => prev.filter(report => report.id !== id))
      showToast('Report subscription deleted')
    } catch {
      showToast('Failed to delete subscription', 'error')
    }
  }

  async function handleDispatchReport(id: string) {
    if (!canManageReports) return
    try {
      setDispatchingId(id)
      const preview = await EnterpriseApi.dispatchReportSubscription(id)
      setDispatchPreview(preview)
      showToast('Report generated and dispatched')
      await refreshReports()
    } catch {
      showToast('Failed to dispatch report', 'error')
    } finally {
      setDispatchingId(null)
    }
  }

  const realtimeCurrency = useMemo(() => {
    if (!realtime) return currencyFormatter('INR')
    return currencyFormatter(realtime.workInProgress.currency || 'INR')
  }, [realtime])

  if (!serverMode) {
    return (
      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Enterprise intelligence</h3>
        <p style={{ margin: 0, color: 'var(--muted)' }}>Connect to the secure backend to unlock real-time dashboards, risk analytics, and automated reports.</p>
      </section>
    )
  }

  if (!canView) {
    return (
      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Enterprise intelligence</h3>
        <p style={{ margin: 0, color: 'var(--muted)' }}>Upgrade your role to manager to access enterprise analytics and reporting.</p>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginBottom: 16, padding: 24, background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#f8fafc', border: 'none', boxShadow: '0 18px 30px rgba(15,23,42,0.22)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22, letterSpacing: 0.4 }}>Enterprise intelligence</h3>
          <p style={{ margin: '6px 0 0', maxWidth: 560, color: 'rgba(226,232,240,0.75)' }}>
            Operational pulse plus governance in one place – live pipeline health, anomaly detection, scheduled board packs, and security instrumentation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ghost" style={{ color: '#f8fafc', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => refreshRealtime()} disabled={realtimeLoading}>
            {realtimeLoading ? 'Refreshing…' : 'Refresh metrics'}
          </button>
          <button type="button" className="ghost" style={{ color: '#f8fafc', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => refreshOutliers()} disabled={outliersLoading}>
            {outliersLoading ? 'Analysing…' : 'Refresh risk'}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: 16, background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', color: '#fecaca' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div style={{ background: 'rgba(148,163,184,0.08)', padding: 18, borderRadius: 16, backdropFilter: 'blur(6px)', border: '1px solid rgba(148,163,184,0.14)' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, color: 'rgba(226,232,240,0.6)' }}>Work in progress</div>
          <div style={{ marginTop: 12, fontSize: 36, fontWeight: 700 }}>{realtime ? numberFormatter.format(realtime.workInProgress.openCount) : '--'}</div>
          <div style={{ marginTop: 6, color: 'rgba(226,232,240,0.7)', fontSize: 13 }}>
            {realtime ? `${numberFormatter.format(realtime.workInProgress.highPriorityCount)} high priority` : 'Awaiting metrics'}
          </div>
          <div style={{ marginTop: 18, display: 'grid', gap: 6, fontSize: 12, color: 'rgba(226,232,240,0.7)' }}>
            <span>Average age · {realtime?.workInProgress.avgAgeDays != null ? `${realtime.workInProgress.avgAgeDays.toFixed(1)}d` : '--'}</span>
            <span>Pipeline value · {realtime ? realtimeCurrency.format(realtime.workInProgress.totalPipelineValue || 0) : '--'}</span>
            <span>Avg deal size · {realtime ? realtimeCurrency.format(realtime.workInProgress.averageDealSize || 0) : '--'}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(34,197,94,0.12)', padding: 18, borderRadius: 16, border: '1px solid rgba(74,222,128,0.24)' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, color: 'rgba(134,239,172,0.9)' }}>Conversion</div>
          <div style={{ marginTop: 12, fontSize: 36, fontWeight: 700, color: '#bbf7d0' }}>{realtime ? formatPercent(realtime.conversion.conversionRate) : '--'}</div>
          <div style={{ marginTop: 6, color: 'rgba(134,239,172,0.85)', fontSize: 13 }}>
            {realtime ? `${numberFormatter.format(realtime.conversion.won)} won / ${numberFormatter.format(realtime.conversion.closed)} closed` : 'Awaiting metrics'}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(134,239,172,0.8)' }}>
            Trailing 30-day rate · {realtime ? formatPercent(realtime.conversion.trailing30Rate) : '--'}
          </div>
        </div>

        <div style={{ background: 'rgba(248,113,113,0.12)', padding: 18, borderRadius: 16, border: '1px solid rgba(248,113,113,0.24)' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, color: 'rgba(252,165,165,0.9)' }}>SLA status</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: '#fecaca' }}>{realtime ? numberFormatter.format(realtime.sla.breached) : '--'}</span>
            <span style={{ fontSize: 13, color: 'rgba(252,165,165,0.85)' }}>breached</span>
          </div>
          <div style={{ marginTop: 6, color: 'rgba(252,165,165,0.85)', fontSize: 13 }}>
            {realtime ? `${numberFormatter.format(realtime.sla.atRisk)} at risk · ${numberFormatter.format(realtime.sla.onTrack)} on track` : 'Awaiting metrics'}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(252,165,165,0.8)' }}>
            Avg resolution {formatHours(realtime?.sla.avgResolutionHours)} · Follow-up lag {formatHours(realtime?.sla.medianFollowUpLagHours)}
          </div>
        </div>
      </div>

      {realtime && realtime.workInProgress.ageBuckets.length > 0 && (
        <div style={{ marginTop: 24, background: 'rgba(10,20,35,0.55)', borderRadius: 18, padding: 20, border: '1px solid rgba(15,23,42,0.55)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 16 }}>WIP aging detail</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {realtime.workInProgress.ageBuckets.map(bucket => (
              <div key={bucket.label} style={{ flex: '1 1 160px', background: 'rgba(148,163,184,0.1)', padding: 14, borderRadius: 14, border: '1px solid rgba(148,163,184,0.16)' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(226,232,240,0.6)' }}>{bucket.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{numberFormatter.format(bucket.count)}</div>
              </div>
            ))}
          </div>
          {realtime.workInProgress.ownerLeaders.length > 0 && (
            <div style={{ marginTop: 18, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                  <tr style={{ color: 'rgba(226,232,240,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px' }}>Owner</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>Open</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>High priority</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>Avg age</th>
                  </tr>
                </thead>
                <tbody>
                  {realtime.workInProgress.ownerLeaders.map(owner => (
                    <tr key={owner.owner || 'unassigned'} style={{ borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                      <td style={{ padding: '8px 4px', color: '#f8fafc' }}>{owner.owner || 'Unassigned'}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', color: '#f8fafc' }}>{numberFormatter.format(owner.openCount)}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', color: '#f8fafc' }}>{numberFormatter.format(owner.highPriority)}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', color: '#f8fafc' }}>{owner.avgAgeDays != null ? `${owner.avgAgeDays.toFixed(1)}d` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, display: 'grid', gap: 20, gridTemplateColumns: allowSecurityPosture ? '1.2fr 0.8fr' : '1fr' }}>
        <div style={{ background: '#0b1120', borderRadius: 18, padding: 20, border: '1px solid rgba(15,23,42,0.7)', boxShadow: '0 16px 24px rgba(15,23,42,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: 16 }}>Risk & outlier radar</h4>
            <button type="button" className="ghost" style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => refreshOutliers()} disabled={outliersLoading}>
              {outliersLoading ? 'Analysing…' : 'Re-run'}
            </button>
          </div>
          <p style={{ margin: '6px 0 16px', color: 'rgba(148,163,184,0.85)', fontSize: 13 }}>
            High-risk opportunities ranked by statistical outliers, SLA exposure, and deal aging. Prioritise intervention where the risk score spikes.
          </p>
          {outliers && outliers.items.length > 0 ? (
            <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(30,41,59,0.85)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(15,23,42,0.9)', color: 'rgba(148,163,184,0.85)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Serial</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Customer</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Value</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>Risk</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid rgba(30,41,59,0.85)', background: 'rgba(15,23,42,0.6)' }}>
                      <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600 }}>{item.serialToken}</td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{item.customerName || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f8fafc' }}>
                        {item.estimatedValue != null ? realtimeCurrency.format(item.estimatedValue) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 64,
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontWeight: 600,
                          background: item.riskBand === 'critical' ? 'rgba(239,68,68,0.2)' : item.riskBand === 'high' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)',
                          color: item.riskBand === 'critical' ? '#fca5a5' : item.riskBand === 'high' ? '#fcd34d' : '#93c5fd'
                        }}>
                          {item.riskScore}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'rgba(148,163,184,0.9)', fontSize: 12 }}>
                        {item.reasons.join(' • ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ border: '1px dashed rgba(148,163,184,0.4)', borderRadius: 12, padding: 18, color: 'rgba(148,163,184,0.8)', fontSize: 13 }}>
              {outliersLoading ? 'Scanning pipeline for anomalies…' : 'No significant anomalies detected in the current pipeline.'}
            </div>
          )}
        </div>

        {allowSecurityPosture && (
          <div style={{ background: '#0b1120', borderRadius: 18, padding: 20, border: '1px solid rgba(15,23,42,0.7)', boxShadow: '0 16px 24px rgba(15,23,42,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: 16 }}>Security & identity</h4>
              <button type="button" className="ghost" style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => refreshSecurity()} disabled={securityLoading}>
                {securityLoading ? 'Checking…' : 'Refresh posture'}
              </button>
            </div>
            <p style={{ margin: '6px 0 16px', color: 'rgba(148,163,184,0.85)', fontSize: 13 }}>
              Governance snapshot covering SSO, MFA enforcement, password posture, and critical alerts. Ideal for audits and compliance check-ins.
            </p>
            {security ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(148,163,184,0.7)' }}>Role distribution</div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {security.userDistribution.map(item => (
                      <span key={item.role} style={{ background: 'rgba(59,130,246,0.2)', color: '#bfdbfe', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>
                        {item.role}: {item.count}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.85)' }}>
                  <strong>SSO:</strong> {security.sso.enabled ? `Enabled (${security.sso.providers.join(', ')})` : 'Optional'} · Enforcement {security.sso.enforcement}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.85)' }}>
                  <strong>MFA:</strong> {security.mfa.enforced ? `Required for ${security.mfa.enforcedFor.join(', ')}` : 'Not enforced'} · Backup codes {security.mfa.backupCodesEnabled ? 'enabled' : 'disabled'}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.85)' }}>
                  <strong>Password policy:</strong> {security.passwordPolicy.minLength}+ chars · Rotate every {security.passwordPolicy.rotationDays ?? '—'} days
                </div>
                <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.85)' }}>
                  <strong>Sessions:</strong> Token expiry {security.sessionSecurity.tokenExpiryMinutes ?? '—'}m · Idle timeout {security.sessionSecurity.idleTimeoutMinutes ?? '—'}m · Refresh tokens {security.sessionSecurity.refreshTokenEnabled ? 'on' : 'off'}
                </div>
                {security.alerts.length > 0 && (
                  <div style={{ border: '1px solid rgba(248,113,113,0.35)', borderRadius: 12, padding: 12, background: 'rgba(248,113,113,0.12)' }}>
                    <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#fecaca', marginBottom: 6 }}>Alerts</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {security.alerts.map((alert, idx) => (
                        <li key={idx} style={{ color: '#fecaca', fontSize: 13 }}>{alert.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.8)' }}>
                  {security.recommendations[0]}
                </div>
              </div>
            ) : (
              <div style={{ border: '1px dashed rgba(148,163,184,0.4)', borderRadius: 12, padding: 18, color: 'rgba(148,163,184,0.8)', fontSize: 13 }}>
                {securityLoading ? 'Auditing security controls…' : 'Security posture requires admin access to view.'}
              </div>
            )}
          </div>
        )}
      </div>

      {canManageReports && (
        <div style={{ marginTop: 24, background: '#0b1120', borderRadius: 18, padding: 20, border: '1px solid rgba(15,23,42,0.7)', boxShadow: '0 16px 24px rgba(15,23,42,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: 16 }}>Scheduled reports</h4>
            <button type="button" className="ghost" style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => refreshReports()} disabled={reportsLoading}>
              {reportsLoading ? 'Syncing…' : 'Refresh list'}
            </button>
          </div>
          <p style={{ margin: '6px 0 16px', color: 'rgba(148,163,184,0.85)', fontSize: 13 }}>
            Automate board-ready exports with auditable delivery recipients. Reports include pipeline, risk, and SLA snapshots.
          </p>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', background: 'rgba(15,23,42,0.8)', padding: 16, borderRadius: 16, border: '1px solid rgba(30,41,59,0.85)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'rgba(148,163,184,0.7)', marginBottom: 6 }}>Report name</label>
              <input value={formName} onChange={event => setFormName(event.target.value)} placeholder="Executive summary" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', padding: '8px 10px', background: '#0f172a', color: '#e2e8f0' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'rgba(148,163,184,0.7)', marginBottom: 6 }}>Recipients</label>
              <input value={formRecipients} onChange={event => setFormRecipients(event.target.value)} placeholder="ceo@example.com, coo@example.com" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', padding: '8px 10px', background: '#0f172a', color: '#e2e8f0' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'rgba(148,163,184,0.7)', marginBottom: 6 }}>Cadence</label>
              <select value={formCadence} onChange={event => setFormCadence(event.target.value as typeof formCadence)} style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', padding: '8px 10px', background: '#0f172a', color: '#e2e8f0' }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: 'rgba(148,163,184,0.7)', marginBottom: 6 }}>Format</label>
              <select value={formFormat} onChange={event => setFormFormat(event.target.value as typeof formFormat)} style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', padding: '8px 10px', background: '#0f172a', color: '#e2e8f0' }}>
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="json">JSON payload</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="primary" onClick={handleCreateReport} disabled={creatingReport}>
                {creatingReport ? 'Scheduling…' : 'Schedule report'}
              </button>
            </div>
          </div>

          {reports.length > 0 ? (
            <div style={{ marginTop: 18, borderRadius: 12, border: '1px solid rgba(30,41,59,0.85)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(15,23,42,0.9)', color: 'rgba(148,163,184,0.85)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Cadence</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Recipients</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>Next run</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(report => (
                    <tr key={report.id} style={{ borderTop: '1px solid rgba(30,41,59,0.85)', background: 'rgba(15,23,42,0.6)' }}>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{report.name}</td>
                      <td style={{ padding: '10px 12px', color: 'rgba(148,163,184,0.85)' }}>{report.cadence}</td>
                      <td style={{ padding: '10px 12px', color: 'rgba(148,163,184,0.85)', fontSize: 12 }}>{report.recipients.join(', ')}</td>
                      <td style={{ padding: '10px 12px', color: 'rgba(148,163,184,0.85)' }}>{report.nextRunAt ? new Date(report.nextRunAt).toLocaleString() : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="ghost" style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.35)' }} onClick={() => handleDispatchReport(report.id)} disabled={dispatchingId === report.id}>
                          {dispatchingId === report.id ? 'Dispatching…' : 'Dispatch now'}
                        </button>
                        <button type="button" className="ghost" style={{ color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)' }} onClick={() => handleDeleteReport(report.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ marginTop: 16, border: '1px dashed rgba(148,163,184,0.4)', borderRadius: 12, padding: 18, color: 'rgba(148,163,184,0.8)', fontSize: 13 }}>
              {reportsLoading ? 'Loading subscriptions…' : 'No scheduled reports yet. Create your first cadence above.'}
            </div>
          )}

          {dispatchPreview && (
            <div style={{ marginTop: 18, borderRadius: 12, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', padding: 16 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(134,239,172,0.9)', marginBottom: 6 }}>Report dispatched</div>
              <div style={{ color: '#bbf7d0', fontSize: 13 }}>
                Sent at {new Date(dispatchPreview.generatedAt).toLocaleString()} for {dispatchPreview.requestedBy.email}. Snapshot covers {dispatchPreview.metrics.workInProgress.openCount} active deals.
              </div>
            </div>
          )}
        </div>
      )}

      {realtime && realtime.recommendations.length > 0 && (
        <div style={{ marginTop: 24, borderRadius: 18, padding: 20, background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.35)', color: '#dbeafe' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>Recommended next actions</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {realtime.recommendations.map((item, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
