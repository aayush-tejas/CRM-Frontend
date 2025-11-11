import { useEffect, useMemo, useState, useRef } from 'react'
import { addActivity, listActivities, type EntityType } from './activity'
import { getSession } from './auth/session'
import { ActivitiesApi, type ActivityDTO } from './api'

type Props = { entityType: EntityType; entityKey: string; useServer: boolean }

export default function ActivityFeed({ entityType, entityKey, useServer }: Props) {
  const [text, setText] = useState('')
  const [activities, setActivities] = useState<ActivityDTO[]>([])
  const [loading, setLoading] = useState<boolean>(useServer)
  const [error, setError] = useState<string | null>(null)
  const [localVersion, setLocalVersion] = useState(0)
  const [posting, setPosting] = useState(false)
  const pollingRef = useRef<number | null>(null)

  const localItems = useMemo(() => listActivities(entityType, entityKey), [entityType, entityKey, localVersion])

  useEffect(() => {
    if (!useServer) {
      setActivities(localItems.map(item => ({
        id: item.id,
        entityType: item.entityType,
        entityKey: item.entityKey,
        userEmail: item.userEmail,
        userName: item.userName,
        type: item.type,
        text: item.text,
        createdAt: item.createdAt,
      })))
      setLoading(false)
      setError(null)
    }
  }, [useServer, localItems])

  useEffect(() => {
    if (!useServer || !entityKey) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }

    let cancelled = false

    async function fetchActivities(showSpinner: boolean) {
      if (showSpinner) setLoading(true)
      try {
        const data = await ActivitiesApi.list(entityType, entityKey)
        if (!cancelled) {
          setActivities(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError('Unable to load activity right now.')
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLoading(false)
        }
      }
    }

    fetchActivities(true)
    pollingRef.current = window.setInterval(() => { fetchActivities(false) }, 8000)

    return () => {
      cancelled = true
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [useServer, entityType, entityKey])

  async function post() {
    const user = getSession()
    const body = text.trim()
    if (!body) return

    if (useServer) {
      setPosting(true)
      try {
        const created = await ActivitiesApi.create({ entityType, entityKey, text: body })
        setActivities(prev => [created, ...prev])
        setText('')
        setError(null)
      } catch (err) {
        console.error(err)
        setError('Failed to post comment. Please try again.')
      } finally {
        setPosting(false)
      }
    } else {
      addActivity({ entityType, entityKey, type: 'comment', text: body, userEmail: user?.email, userName: user?.name })
      setText('')
      setLocalVersion(v => v + 1)
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Activity & Comments</h3>
        {useServer && (
          <button className="ghost" type="button" onClick={() => {
            setLoading(true)
            ActivitiesApi.list(entityType, entityKey)
              .then(data => { setActivities(data); setError(null) })
              .catch(err => { console.error(err); setError('Unable to refresh activity.') })
              .finally(() => setLoading(false))
          }}>Refresh</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ color: 'var(--muted)' }}>Loading activity…</div>}
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {activities.length === 0 && !loading ? (
            <div style={{ color: 'var(--muted)' }}>No activity yet.</div>
          ) : (
            activities.map(it => (
              <div key={it.id} style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {it.type === 'system' ? 'System' : (it.userName || it.userEmail || 'User')} • {new Date(it.createdAt).toLocaleString()}
                </div>
                <div style={{ marginTop: 4 }}>{it.text}</div>
              </div>
            ))
          )}
        </div>

        <div>
          <textarea rows={3} placeholder="Add a comment or @mention"
            value={text} onChange={e => setText(e.target.value)} style={{ width: '100%' }} />
          <div className="actions">
            <button className="primary" type="button" onClick={post} disabled={posting || !text.trim()}>{posting ? 'Posting…' : 'Post'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}