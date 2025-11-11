import { useMemo, useState } from 'react'
import { CustomersApi, type CustomerDTO } from './api'

export interface CustomerInfo {
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
  contactPerson: string
  contactPersonName: string
  contactPersonEmail: string
  businessType: string
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

export default function CustomersForm() {
  const [form, setForm] = useState<CustomerInfo>({
    firstName: '', lastName: '', organizationName: '', address: '', city: '', pinCode: '', state: '', country: '',
    email: '', mobile: '', contactPerson: '', contactPersonName: '', contactPersonEmail: '', businessType: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isValid = useMemo(() => {
    const next: Record<string, string> = {}
    const required: Array<keyof CustomerInfo> = ['firstName', 'lastName', 'organizationName', 'address', 'city', 'pinCode', 'state', 'country', 'email', 'mobile']
    required.forEach(k => { if (!String(form[k]).trim()) next[k] = 'This field is required' })
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email format'
    if (form.contactPersonEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactPersonEmail)) next.contactPersonEmail = 'Invalid email format'
    if (form.mobile && !/^\+?[0-9\-\s]{7,15}$/.test(form.mobile)) next.mobile = 'Invalid mobile number'
    if (form.pinCode && !/^\d{4,10}$/.test(form.pinCode)) next.pinCode = 'Invalid PIN code'
    setErrors(next)
    return Object.keys(next).length === 0
  }, [form])

  function set<K extends keyof CustomerInfo>(key: K, value: CustomerInfo[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    const useServer = localStorage.getItem('crm:useServer') === '1'
    if (useServer) {
      await CustomersApi.create(form as unknown as CustomerDTO)
      showToast('Customer saved! (server)')
      setForm({ firstName: '', lastName: '', organizationName: '', address: '', city: '', pinCode: '', state: '', country: '', email: '', mobile: '', contactPerson: '', contactPersonName: '', contactPersonEmail: '', businessType: '' })
    } else {
      const list = JSON.parse(localStorage.getItem('crm:customers') || '[]')
      const now = new Date().toISOString()
      list.unshift({ id: Math.random().toString(36).slice(2), createdAt: now, ...form })
      localStorage.setItem('crm:customers', JSON.stringify(list))
      showToast('Customer saved!')
      setForm({ firstName: '', lastName: '', organizationName: '', address: '', city: '', pinCode: '', state: '', country: '', email: '', mobile: '', contactPerson: '', contactPersonName: '', contactPersonEmail: '', businessType: '' })
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0, textAlign: 'center' }}>Customer Information Form</h3>
      <form className="form" onSubmit={handleSubmit}>
        <div className="grid">
          <div className="field">
            <label htmlFor="firstName">First Name:</label>
            <input id="firstName" value={form.firstName} onChange={e => set('firstName', e.target.value)} aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? 'err-firstName' : undefined} />
            {errors.firstName && <small id="err-firstName" style={{ color: '#dc2626' }}>{errors.firstName}</small>}
          </div>
          <div className="field">
            <label htmlFor="lastName">Last Name:</label>
            <input id="lastName" value={form.lastName} onChange={e => set('lastName', e.target.value)} aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? 'err-lastName' : undefined} />
            {errors.lastName && <small id="err-lastName" style={{ color: '#dc2626' }}>{errors.lastName}</small>}
          </div>
          <div className="field">
            <label htmlFor="organizationName">Organisation Name:</label>
            <input id="organizationName" value={form.organizationName} onChange={e => set('organizationName', e.target.value)} aria-invalid={!!errors.organizationName} aria-describedby={errors.organizationName ? 'err-organizationName' : undefined} />
            {errors.organizationName && <small id="err-organizationName" style={{ color: '#dc2626' }}>{errors.organizationName}</small>}
          </div>
          <div className="field">
            <label htmlFor="address">Address:</label>
            <textarea id="address" rows={3} value={form.address} onChange={e => set('address', e.target.value)} aria-invalid={!!errors.address} aria-describedby={errors.address ? 'err-address' : undefined} />
            {errors.address && <small id="err-address" style={{ color: '#dc2626' }}>{errors.address}</small>}
          </div>
          <div className="field">
            <label htmlFor="city">City:</label>
            <input id="city" value={form.city} onChange={e => set('city', e.target.value)} aria-invalid={!!errors.city} aria-describedby={errors.city ? 'err-city' : undefined} />
            {errors.city && <small id="err-city" style={{ color: '#dc2626' }}>{errors.city}</small>}
          </div>
          <div className="field">
            <label htmlFor="pinCode">PIN Code:</label>
            <input id="pinCode" value={form.pinCode} onChange={e => set('pinCode', e.target.value)} aria-invalid={!!errors.pinCode} aria-describedby={errors.pinCode ? 'err-pinCode' : undefined} />
            {errors.pinCode && <small id="err-pinCode" style={{ color: '#dc2626' }}>{errors.pinCode}</small>}
          </div>
          <div className="field">
            <label htmlFor="state">State:</label>
            <input id="state" value={form.state} onChange={e => set('state', e.target.value)} aria-invalid={!!errors.state} aria-describedby={errors.state ? 'err-state' : undefined} />
            {errors.state && <small id="err-state" style={{ color: '#dc2626' }}>{errors.state}</small>}
          </div>
          <div className="field">
            <label htmlFor="country">Country:</label>
            <input id="country" value={form.country} onChange={e => set('country', e.target.value)} aria-invalid={!!errors.country} aria-describedby={errors.country ? 'err-country' : undefined} />
            {errors.country && <small id="err-country" style={{ color: '#dc2626' }}>{errors.country}</small>}
          </div>
          <div className="field">
            <label htmlFor="email">Email:</label>
            <input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
            {errors.email && <small id="err-email" style={{ color: '#dc2626' }}>{errors.email}</small>}
          </div>
          <div className="field">
            <label htmlFor="mobile">Mobile:</label>
            <input id="mobile" value={form.mobile} onChange={e => set('mobile', e.target.value)} aria-invalid={!!errors.mobile} aria-describedby={errors.mobile ? 'err-mobile' : undefined} />
            {errors.mobile && <small id="err-mobile" style={{ color: '#dc2626' }}>{errors.mobile}</small>}
          </div>
          <div className="field">
            <label htmlFor="contactPerson">Contact Person:</label>
            <input id="contactPerson" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="contactPersonName">Contact Person Name:</label>
            <input id="contactPersonName" value={form.contactPersonName} onChange={e => set('contactPersonName', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="contactPersonEmail">Contact Person Email:</label>
            <input id="contactPersonEmail" value={form.contactPersonEmail} onChange={e => set('contactPersonEmail', e.target.value)} aria-invalid={!!errors.contactPersonEmail} aria-describedby={errors.contactPersonEmail ? 'err-contactPersonEmail' : undefined} />
            {errors.contactPersonEmail && <small id="err-contactPersonEmail" style={{ color: '#dc2626' }}>{errors.contactPersonEmail}</small>}
          </div>
          <div className="field">
            <label htmlFor="businessType">Type of Business:</label>
            <input id="businessType" value={form.businessType} onChange={e => set('businessType', e.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={!isValid}>Submit</button>
        </div>
      </form>
    </section>
  )
}
