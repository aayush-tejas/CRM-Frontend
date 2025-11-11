import * as XLSX from 'xlsx'
import type { Tender, Priority, Status } from './types'

// Employee import/export support
export interface EmployeeImportRecord {
  employeeId: string
  employeeName: string
  designation?: string
  email?: string
  mobile?: string
  department?: string
}

type EmployeeHeaderMap = {
  employeeId?: string
  employeeName?: string
  designation?: string
  email?: string
  mobile?: string
  department?: string
}

function normalizeEmployeeHeader(h: string): keyof EmployeeHeaderMap | undefined {
  const s = h.trim().toLowerCase()
  if (s.includes('employee id') || s === 'id') return 'employeeId'
  if (s.includes('employee name') || s === 'name') return 'employeeName'
  if (s.includes('designation') || s.includes('title') || s.includes('role')) return 'designation'
  if (s.includes('email') || s.includes('e-mail')) return 'email'
  if (s.includes('mobile') || s.includes('phone') || s.includes('contact')) return 'mobile'
  if (s.includes('department') || s.includes('dept')) return 'department'
  return undefined
}

export async function listExcelSheetNames(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames
}

export async function parseExcelToEmployees(file: File, sheetName?: string): Promise<EmployeeImportRecord[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const targetSheetName = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]
  const ws = wb.Sheets[targetSheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[]
  if (rows.length < 2) return []
  const headerRow = rows[0] as string[]
  const headerMap: Record<number, keyof EmployeeHeaderMap> = {}
  headerRow.forEach((h, idx) => {
    const key = normalizeEmployeeHeader(String(h))
    if (key) headerMap[idx] = key
  })
  const list: EmployeeImportRecord[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as any[]
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue
    const draft: Partial<EmployeeImportRecord> = {}
    row.forEach((cell, idx) => {
      const key = headerMap[idx]
      if (!key) return
      draft[key] = String(cell ?? '').trim()
    })
    if (draft.employeeId || draft.employeeName) {
      list.push({
        employeeId: draft.employeeId || '',
        employeeName: draft.employeeName || '',
        designation: draft.designation || '',
        email: draft.email || '',
        mobile: draft.mobile || '',
        department: draft.department || ''
      })
    }
  }
  return list
}

export function exportEmployeesToExcel(rows: EmployeeImportRecord[], filename = 'employees.xlsx') {
  const header = [
    'Employee ID',
    'Employee Name',
    'Designation',
    'Email',
    'Mobile',
    'Department'
  ]
  const data = rows.map(r => [
    r.employeeId,
    r.employeeName,
    r.designation || '',
    r.email || '',
    r.mobile || '',
    r.department || ''
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Employees')
  XLSX.writeFile(wb, filename)
}

// Export an empty employee template with just headers
export function exportEmployeeTemplate(filename = 'employee-template.xlsx') {
  const header = [
    'Employee ID',
    'Employee Name',
    'Designation',
    'Email',
    'Mobile',
    'Department'
  ]
  const ws = XLSX.utils.aoa_to_sheet([header])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'EmployeesTemplate')
  XLSX.writeFile(wb, filename)
}

type HeaderMap = {
  dateOfService?: string
  serialToken?: string
  allottedTo?: string
  source?: string
  priority?: string
  status?: string
  customerId?: string
  customerName?: string
  employeeId?: string
  employeeName?: string
  leadTitle?: string
  leadDescription?: string
  estimatedValue?: string
  followUpDate?: string
}

function normalizeHeader(h: string): keyof HeaderMap | undefined {
  const s = h.trim().toLowerCase()
  if (s.includes('date')) return 'dateOfService'
  if (s.includes('serial') || s.includes('rfp')) return 'serialToken'
  if (s.includes('alloted') || s.includes("allotted") || s.includes('assignee') || s.includes('whom')) return 'allottedTo'
  if (s.includes('source')) return 'source'
  if (s.includes('priority')) return 'priority'
  if (s.includes('status')) return 'status'
  if (s.includes('customer id')) return 'customerId'
  if (s.includes('customer name')) return 'customerName'
  if (s.includes('employee id')) return 'employeeId'
  if (s.includes('employee name')) return 'employeeName'
  if (s.includes('lead title') || s === 'title') return 'leadTitle'
  if (s.includes('lead description') || s === 'description') return 'leadDescription'
  if (s.includes('estimated value') || s.includes('value')) return 'estimatedValue'
  if (s.includes('follow-up') || s.includes('follow up') || s.includes('followup')) return 'followUpDate'
  return undefined
}

function coercePriority(v: any): Priority {
  const s = String(v || '').trim().toLowerCase()
  if (['low','l'].includes(s)) return 'Low'
  if (['medium','med','m'].includes(s)) return 'Medium'
  if (['high','h'].includes(s)) return 'High'
  if (['urgent','u','critical'].includes(s)) return 'Urgent'
  return 'Medium'
}

function coerceStatus(v: any): Status {
  const s = String(v || '').trim().toLowerCase()
  if (['open','new'].includes(s)) return 'Open'
  if (['in progress','wip','progress'].includes(s)) return 'In Progress'
  if (['on hold','hold','pending'].includes(s)) return 'On Hold'
  if (['closed','done','resolved'].includes(s)) return 'Closed'
  return 'Open'
}

function toISODate(cell: any): string {
  if (typeof cell === 'number') {
    const d = XLSX.SSF.parse_date_code(cell)
    if (d) {
      const js = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1))
      return js.toISOString().slice(0, 10)
    }
  }
  const s = String(cell)
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) {
    return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())).toISOString().slice(0, 10)
  }
  return s
}

function toStringSafe(v: any): string {
  if (v == null) return ''
  return String(v)
}

export async function parseExcelToTenders(file: File): Promise<Tender[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[]
  if (rows.length < 2) return []

  const headerRow = rows[0] as string[]
  const headerMap: Record<number, keyof HeaderMap> = {}
  headerRow.forEach((h, idx) => {
    const key = normalizeHeader(String(h))
    if (key) headerMap[idx] = key
  })

  const tenders: Tender[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as any[]
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue
    const draft: Partial<Tender> = {}
    row.forEach((cell, idx) => {
      const key = headerMap[idx]
      if (!key) return
      switch (key) {
        case 'dateOfService':
          draft.dateOfService = toISODate(cell)
          break
        case 'serialToken':
          draft.serialToken = toStringSafe(cell)
          break
        case 'allottedTo':
          draft.allottedTo = toStringSafe(cell)
          break
        case 'source':
          draft.source = toStringSafe(cell)
          break
        case 'customerId':
          draft.customerId = toStringSafe(cell)
          break
        case 'customerName':
          draft.customerName = toStringSafe(cell)
          break
        case 'employeeId':
          draft.employeeId = toStringSafe(cell)
          break
        case 'employeeName':
          draft.employeeName = toStringSafe(cell)
          break
        case 'leadTitle':
          draft.leadTitle = toStringSafe(cell)
          break
        case 'leadDescription':
          draft.leadDescription = toStringSafe(cell)
          break
        case 'estimatedValue':
          draft.estimatedValue = toStringSafe(cell)
          break
        case 'followUpDate':
          draft.followUpDate = toISODate(cell)
          break
        case 'priority':
          draft.priority = coercePriority(cell)
          break
        case 'status':
          draft.status = coerceStatus(cell)
          break
      }
    })
    tenders.push({
      dateOfService: draft.dateOfService || '',
      serialToken: draft.serialToken || '',
      allottedTo: draft.allottedTo || '',
      source: draft.source || '',
      priority: draft.priority || 'Medium',
      status: draft.status || 'Open',
      customerId: draft.customerId || '',
      customerName: draft.customerName || '',
      employeeId: draft.employeeId || '',
      employeeName: draft.employeeName || '',
      leadTitle: draft.leadTitle || '',
      leadDescription: draft.leadDescription || '',
      estimatedValue: draft.estimatedValue || '',
      followUpDate: draft.followUpDate || '',
    })
  }
  return tenders
}

// Back-compat single row helper: returns first tender or null
export async function parseExcelToTender(file: File): Promise<Tender | null> {
  const list = await parseExcelToTenders(file)
  return list[0] ?? null
}

export function exportTendersToExcel(rows: Tender[], filename = 'tenders.xlsx') {
  const header = [
    'Date of Service',
    'Serial Token / RFP Number',
    "Whom it's allotted to",
    'Source',
    'Priority',
    'Status',
    'Customer ID',
    'Customer Name',
    'Employee ID',
    'Employee Name',
    'Lead Title',
    'Lead Description',
    'Estimated Value (INR)',
    'Follow-up Date',
  ]
  const data = rows.map(r => [
    r.dateOfService,
    r.serialToken,
    r.allottedTo,
    r.source,
    r.priority,
    r.status,
    r.customerId ?? '',
    r.customerName ?? '',
    r.employeeId ?? '',
    r.employeeName ?? '',
    r.leadTitle ?? '',
    r.leadDescription ?? '',
    r.estimatedValue ?? '',
    r.followUpDate ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tenders')
  XLSX.writeFile(wb, filename)
}
