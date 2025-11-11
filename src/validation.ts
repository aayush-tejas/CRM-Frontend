import type { Tender, Priority, Status } from './types'

export const allowedSources = [
  'Email',
  'Phone',
  'Web',
  'Walk-in',
  'Referral',
  'Other',
] as const

export const ENFORCE_ALLOWED_SOURCES = false

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateField(name: keyof Tender, value: string): string {
  const v = (value ?? '').trim()
  switch (name) {
    case 'dateOfService':
      if (!v) return 'Date is required.'
      if (!ISO_DATE_RE.test(v)) return 'Use YYYY-MM-DD.'
      return ''
    case 'serialToken':
      if (!v) return 'Serial Token / RFP is required.'
      if (v.length > 100) return 'Max 100 characters.'
      return ''
    case 'allottedTo':
      if (!v) return 'Assignee is required.'
      if (v.length > 100) return 'Max 100 characters.'
      return ''
    case 'source':
      if (v.length > 100) return 'Max 100 characters.'
      if (ENFORCE_ALLOWED_SOURCES) {
        const ok = (allowedSources as readonly string[]).some(s => s.toLowerCase() === v.toLowerCase())
        if (!ok) return `Must be one of: ${allowedSources.join(', ')}`
      }
      return ''
    case 'customerId':
      if (v && v.length > 100) return 'Max 100 characters.'
      return ''
    case 'customerName':
      if (v && v.length > 120) return 'Max 120 characters.'
      return ''
    case 'employeeId':
      if (v && v.length > 100) return 'Max 100 characters.'
      return ''
    case 'employeeName':
      if (v && v.length > 120) return 'Max 120 characters.'
      return ''
    case 'leadTitle':
      if (v && v.length > 200) return 'Max 200 characters.'
      return ''
    case 'leadDescription':
      if (v && v.length > 1000) return 'Max 1000 characters.'
      return ''
    case 'estimatedValue': {
      if (!v) return ''
      const num = Number(v.replace(/[,\s]/g, ''))
      if (Number.isNaN(num)) return 'Must be a number.'
      if (num < 0) return 'Must be >= 0.'
      return ''
    }
    case 'followUpDate':
      if (!v) return ''
      if (!ISO_DATE_RE.test(v)) return 'Use YYYY-MM-DD.'
      return ''
    case 'priority': {
      const allowed: Priority[] = ['Low','Medium','High','Urgent']
      if (!allowed.includes(v as Priority)) return 'Invalid priority.'
      return ''
    }
    case 'status': {
      const allowed: Status[] = ['Open','In Progress','On Hold','Closed']
      if (!allowed.includes(v as Status)) return 'Invalid status.'
      return ''
    }
    default:
      return ''
  }
}

export function validateTender(t: Tender): Record<string, string> {
  const errors: Record<string, string> = {}
  ;([
    'dateOfService','serialToken','allottedTo','source','priority','status',
    'customerId','customerName','employeeId','employeeName','leadTitle','leadDescription','estimatedValue','followUpDate'
  ] as (keyof Tender)[])
    .forEach((k) => {
      const err = validateField(k, String((t as any)[k] ?? ''))
      if (err) errors[k] = err
    })
  return errors
}
