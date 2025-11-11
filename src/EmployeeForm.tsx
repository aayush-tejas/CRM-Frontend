import { useEffect, useMemo, useState } from 'react'
import { EmployeesApi, type EmployeeDTO } from './api'

export interface EmployeeInfo {
  employeeId: string
  employeeName: string
  designation: string
  email: string
  mobile: string
  department: string
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

type Props = { onSaved?: () => void; editEmployee?: (EmployeeInfo & { id: string }) | null; onCancelEdit?: () => void }

export default function EmployeeForm({ onSaved, editEmployee, onCancelEdit }: Props) {
  const emptyForm: EmployeeInfo = {
    employeeId: '',
    employeeName: '',
    designation: '',
    email: '',
    mobile: '',
    department: ''
  }

  const normalizeValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value == null) return ''
    return String(value)
  }

  const normalizeForm = (input?: Partial<EmployeeInfo> | null): EmployeeInfo => ({
    employeeId: normalizeValue(input?.employeeId),
    employeeName: normalizeValue(input?.employeeName),
    designation: normalizeValue(input?.designation),
    email: normalizeValue(input?.email),
    mobile: normalizeValue(input?.mobile),
    department: normalizeValue(input?.department)
  })

  const [form, setForm] = useState<EmployeeInfo>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (editEmployee) {
      // populate form for editing
      const { id, ...rest } = editEmployee
      setForm(normalizeForm(rest))
      setEditingId(id)
      setErrors({})
    } else {
      setEditingId(null)
      setForm(emptyForm)
    }
  }, [editEmployee])

  const isValid = useMemo(() => {
    const next: Record<string, string> = {}
    if (!form.employeeId.trim()) next.employeeId = 'Employee ID is required'
    if (!form.employeeName.trim()) next.employeeName = 'Employee Name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email format'
    if (!form.email.trim()) next.email = 'Email is required'
    if (form.mobile && !/^\+?[0-9\-\s]{7,15}$/.test(form.mobile)) next.mobile = 'Invalid mobile number'
    if (!form.mobile.trim()) next.mobile = 'Mobile is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }, [form])

  function set<K extends keyof EmployeeInfo>(key: K, value: EmployeeInfo[K]) {
    setForm(prev => ({ ...prev, [key]: normalizeValue(value) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    const useServer = localStorage.getItem('crm:useServer') === '1'
    if (useServer) {
      // Fetch for uniqueness check
      const current = await EmployeesApi.list()
      const lower = form.employeeId.trim().toLowerCase()
      if (editingId) {
        const duplicateOther = current.find(e => e.employeeId?.toLowerCase?.() === lower && e.id !== editingId)
        if (duplicateOther) {
          setErrors(prev => ({ ...prev, employeeId: 'Employee ID must be unique' }))
          showToast('Employee ID must be unique', 'error')
          return
        }
        await EmployeesApi.update(editingId, form as Partial<EmployeeDTO>)
        showToast('Employee updated! (server)')
        onSaved?.()
        return
      } else {
        const duplicate = current.find(e => e.employeeId?.toLowerCase?.() === lower)
        if (duplicate) {
          setErrors(prev => ({ ...prev, employeeId: 'Employee ID already exists' }))
          showToast('Employee ID already exists', 'error')
          return
        }
        await EmployeesApi.create(form as EmployeeDTO)
        showToast('Employee saved! (server)')
        setForm({ employeeId: '', employeeName: '', designation: '', email: '', mobile: '', department: '' })
        onSaved?.()
      }
    } else {
      const list: Array<any> = JSON.parse(localStorage.getItem('crm:employees') || '[]')
      // Uniqueness check for employeeId
      const duplicate = list.find((e: any) => e.employeeId?.toLowerCase?.() === form.employeeId.trim().toLowerCase())
      if (editingId) {
        const duplicateOther = list.find((e: any) => e.employeeId?.toLowerCase?.() === form.employeeId.trim().toLowerCase() && e.id !== editingId)
        if (duplicateOther) {
          setErrors(prev => ({ ...prev, employeeId: 'Employee ID must be unique' }))
          showToast('Employee ID must be unique', 'error')
          return
        }
        // update existing
        const updated = list.map((e: any) => e.id === editingId ? { ...e, ...form } : e)
        localStorage.setItem('crm:employees', JSON.stringify(updated))
        showToast('Employee updated!')
        onSaved?.()
        return
      } else {
        if (duplicate) {
          setErrors(prev => ({ ...prev, employeeId: 'Employee ID already exists' }))
          showToast('Employee ID already exists', 'error')
          return
        }
        const now = new Date().toISOString()
        list.unshift({ id: Math.random().toString(36).slice(2), createdAt: now, ...form })
        localStorage.setItem('crm:employees', JSON.stringify(list))
        showToast('Employee saved!')
        setForm({ employeeId: '', employeeName: '', designation: '', email: '', mobile: '', department: '' })
        onSaved?.()
      }
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0, textAlign: 'center' }}>{editingId ? 'Edit Employee' : 'Employee Entry Form'}</h3>
      <form className="form" onSubmit={handleSubmit}>
        <div className="grid">
          <div className="field">
            <label htmlFor="employeeId">Employee ID:</label>
            <input id="employeeId" value={form.employeeId} onChange={e => set('employeeId', e.target.value)} aria-invalid={!!errors.employeeId} aria-describedby={errors.employeeId ? 'err-employeeId' : undefined} />
            {errors.employeeId && <small id="err-employeeId" style={{ color: '#dc2626' }}>{errors.employeeId}</small>}
          </div>
          <div className="field">
            <label htmlFor="employeeName">Employee Name:</label>
            <input id="employeeName" value={form.employeeName} onChange={e => set('employeeName', e.target.value)} aria-invalid={!!errors.employeeName} aria-describedby={errors.employeeName ? 'err-employeeName' : undefined} />
            {errors.employeeName && <small id="err-employeeName" style={{ color: '#dc2626' }}>{errors.employeeName}</small>}
          </div>
          <div className="field">
            <label htmlFor="designation">Designation:</label>
            <input id="designation" value={form.designation} onChange={e => set('designation', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email:</label>
            <input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
            {errors.email && <small id="err-email" style={{ color: '#dc2626' }}>{errors.email}</small>}
          </div>
          <div className="field">
            <label htmlFor="mobile">Mobile No:</label>
            <input id="mobile" value={form.mobile} onChange={e => set('mobile', e.target.value)} aria-invalid={!!errors.mobile} aria-describedby={errors.mobile ? 'err-mobile' : undefined} />
            {errors.mobile && <small id="err-mobile" style={{ color: '#dc2626' }}>{errors.mobile}</small>}
          </div>
          <div className="field">
            <label htmlFor="department">Department:</label>
            <input id="department" value={form.department} onChange={e => set('department', e.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={!isValid}>{editingId ? 'Update' : 'Submit'}</button>
          {editingId && (
            <button type="button" className="ghost" onClick={() => { setEditingId(null); onCancelEdit?.() }}>Cancel</button>
          )}
        </div>
      </form>
    </section>
  )
}
