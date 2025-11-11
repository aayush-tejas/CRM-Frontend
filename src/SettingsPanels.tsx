import { useEffect, useMemo, useState } from 'react'
import {
  AssistantApi,
  BrandingApi,
  BrandingUpdateInput,
  CustomFieldCreateInput,
  CustomFieldsApi,
  EntityLayoutsApi,
  WebhookCreateInput,
  WebhooksApi
} from './api'
import type {
  AssistantResponse,
  BrandingSettings,
  CustomFieldDefinition,
  CustomFieldType,
  EntityLayoutConfig,
  LayoutSection,
  WebhookSubscription
} from './types'

const FIELD_TYPES: CustomFieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean', 'json']
const BRAND_COLOR_KEYS = ['primaryColor', 'accentColor', 'backgroundColor', 'textColor'] as const
type BrandColorKey = typeof BRAND_COLOR_KEYS[number]

function toast(message: string, tone: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = message
  el.style.position = 'fixed'
  el.style.right = '16px'
  el.style.bottom = '16px'
  el.style.background = tone === 'error' ? '#dc2626' : 'linear-gradient(180deg, var(--brand), var(--brand-700))'
  el.style.color = '#fff'
  el.style.padding = '10px 14px'
  el.style.borderRadius = '10px'
  el.style.boxShadow = '0 4px 14px rgba(17,24,39,0.18)'
  el.style.zIndex = '9999'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2400)
}

function sortFields(fields: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return [...fields].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
    return a.label.localeCompare(b.label)
  })
}

function uniqueEntityTypes(fields: CustomFieldDefinition[]): string[] {
  const set = new Set<string>()
  fields.forEach(field => set.add(field.entityType))
  return Array.from(set).sort()
}

export function CustomizationSettings() {
  const [entityType, setEntityType] = useState('tender')
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [fieldForm, setFieldForm] = useState<CustomFieldCreateInput>({
    entityType: 'tender',
    fieldKey: '',
    label: '',
    fieldType: 'text',
    required: false,
    description: '',
    orderIndex: 0
  })
  const [fieldSaving, setFieldSaving] = useState(false)

  const [layoutDraft, setLayoutDraft] = useState<EntityLayoutConfig | null>(null)
  const [layoutFields, setLayoutFields] = useState<CustomFieldDefinition[]>([])
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [layoutSaving, setLayoutSaving] = useState(false)

  const entityOptions = useMemo(() => uniqueEntityTypes(fields), [fields])

  useEffect(() => {
    refreshFields(entityType)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType])

  useEffect(() => {
    setFieldForm(prev => ({ ...prev, entityType }))
    refreshLayout(entityType)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType])

  async function refreshFields(type: string) {
    setFieldsLoading(true)
    setFieldsError(null)
    try {
      const list = await CustomFieldsApi.list({ entityType: type || undefined })
      setFields(sortFields(list))
    } catch (err: any) {
      setFieldsError(err?.message || 'Failed to load custom fields')
    } finally {
      setFieldsLoading(false)
    }
  }

  async function refreshLayout(type: string) {
    if (!type) {
      setLayoutDraft({ sections: [] })
      setLayoutFields([])
      return
    }
    setLayoutLoading(true)
    try {
      const response = await EntityLayoutsApi.get(type)
      setLayoutDraft(response.layout)
      setLayoutFields(sortFields(response.fields))
    } catch (err: any) {
      toast(err?.message || 'Failed to load layout', 'error')
      setLayoutDraft({ sections: [] })
      setLayoutFields([])
    } finally {
      setLayoutLoading(false)
    }
  }

  const availableFieldKeys = useMemo(() => layoutFields.map(f => f.fieldKey), [layoutFields])

  async function handleCreateField() {
    if (!fieldForm.fieldKey.trim() || !fieldForm.label.trim()) {
      toast('Label & key are required', 'error')
      return
    }
    setFieldSaving(true)
    try {
      const payload: CustomFieldCreateInput = {
        ...fieldForm,
        fieldKey: fieldForm.fieldKey.trim(),
        label: fieldForm.label.trim(),
        entityType: entityType.trim() || fieldForm.entityType.trim()
      }
      const created = await CustomFieldsApi.create(payload)
      setFields(prev => sortFields([created, ...prev]))
      toast('Custom field created')
      setFieldForm({ ...fieldForm, fieldKey: '', label: '', description: '', orderIndex: (payload.orderIndex ?? 0) + 1 })
      refreshLayout(entityType)
    } catch (err: any) {
      toast(err?.message || 'Failed to create field', 'error')
    } finally {
      setFieldSaving(false)
    }
  }

  async function toggleRequired(field: CustomFieldDefinition) {
    try {
      const updated = await CustomFieldsApi.update(field.id, { required: !field.required })
      setFields(prev => sortFields(prev.map(f => (f.id === field.id ? updated : f))))
      toast(`Marked ${updated.required ? 'required' : 'optional'}`)
    } catch (err: any) {
      toast(err?.message || 'Update failed', 'error')
    }
  }

  async function deleteField(field: CustomFieldDefinition) {
    const confirmDelete = window.confirm(`Delete field “${field.label}”? This cannot be undone.`)
    if (!confirmDelete) return
    try {
      await CustomFieldsApi.remove(field.id)
      setFields(prev => prev.filter(f => f.id !== field.id))
      toast('Field deleted')
      refreshLayout(entityType)
    } catch (err: any) {
      toast(err?.message || 'Delete failed', 'error')
    }
  }

  function updateSection(sectionId: string, updater: (section: LayoutSection) => LayoutSection) {
    setLayoutDraft(prev => {
      if (!prev) return prev
      const sections = prev.sections.map(section => section.id === sectionId ? updater(section) : section)
      return { ...prev, sections }
    })
  }

  function addFieldToSection(sectionId: string, fieldKey: string) {
    if (!fieldKey) return
    updateSection(sectionId, section => {
      if (section.fieldKeys.includes(fieldKey)) return section
      return { ...section, fieldKeys: [...section.fieldKeys, fieldKey] }
    })
  }

  function removeFieldFromSection(sectionId: string, fieldKey: string) {
    updateSection(sectionId, section => ({
      ...section,
      fieldKeys: section.fieldKeys.filter(key => key !== fieldKey)
    }))
  }

  function removeSection(sectionId: string) {
    const confirmRemove = window.confirm('Remove this section from the layout?')
    if (!confirmRemove) return
    setLayoutDraft(prev => {
      if (!prev) return prev
      return { ...prev, sections: prev.sections.filter(section => section.id !== sectionId) }
    })
  }

  function addSection(label: string, selectedKeys: string[], description?: string) {
    if (!label.trim()) {
      toast('Section label required', 'error')
      return
    }
    const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${Date.now()}`
    setLayoutDraft(prev => {
      const next: EntityLayoutConfig = prev ? { ...prev } : { sections: [] }
      next.sections = [...next.sections, { id, label: label.trim(), description: description?.trim() || undefined, fieldKeys: selectedKeys }]
      return next
    })
  }

  async function saveLayout() {
    if (!layoutDraft) return
    setLayoutSaving(true)
    try {
      const response = await EntityLayoutsApi.save(entityType, layoutDraft)
      setLayoutDraft(response.layout)
      setLayoutFields(sortFields(response.fields))
      toast('Layout updated')
    } catch (err: any) {
      toast(err?.message || 'Failed to save layout', 'error')
    } finally {
      setLayoutSaving(false)
    }
  }

  const availableForNewSection = useMemo(() => {
    if (!layoutDraft) return availableFieldKeys
    const used = new Set(layoutDraft.sections.flatMap(section => section.fieldKeys))
    return availableFieldKeys.filter(key => !used.has(key))
  }, [availableFieldKeys, layoutDraft])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section className="card" style={{ padding: 20 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Custom fields</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Extend entities with tailored attributes and capture the data your teams rely on.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Entity type
              <input
                list="custom-field-entity-types"
                value={entityType}
                onChange={e => setEntityType(e.currentTarget.value.trim().toLowerCase())}
                style={{ marginLeft: 8 }}
                placeholder="tender"
              />
            </label>
            <datalist id="custom-field-entity-types">
              {entityOptions.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button type="button" className="ghost" onClick={() => refreshFields(entityType)} disabled={fieldsLoading}>
              {fieldsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </header>
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <div className="card" style={{ background: 'var(--surface-subtle)', padding: 16 }}>
            <h4 style={{ marginTop: 0 }}>Create field</h4>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Label
                <input value={fieldForm.label} onChange={e => setFieldForm(prev => ({ ...prev, label: e.currentTarget.value }))} placeholder="Onboarding stage" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Field key
                <input value={fieldForm.fieldKey} onChange={e => setFieldForm(prev => ({ ...prev, fieldKey: e.currentTarget.value }))} placeholder="onboarding_stage" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Type
                <select value={fieldForm.fieldType} onChange={e => setFieldForm(prev => ({ ...prev, fieldType: e.currentTarget.value as CustomFieldType }))}>
                  {FIELD_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Order index
                <input type="number" value={fieldForm.orderIndex ?? 0} onChange={e => setFieldForm(prev => ({ ...prev, orderIndex: Number(e.currentTarget.value) }))} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <input type="checkbox" checked={Boolean(fieldForm.required)} onChange={e => setFieldForm(prev => ({ ...prev, required: e.currentTarget.checked }))} />
                Required
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
              Description (optional)
              <textarea value={fieldForm.description ?? ''} onChange={e => setFieldForm(prev => ({ ...prev, description: e.currentTarget.value }))} placeholder="Visible helper copy for your users." rows={2} />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="primary" onClick={handleCreateField} disabled={fieldSaving}>
                {fieldSaving ? 'Saving…' : 'Add field'}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {fieldsError ? (
              <div style={{ color: '#dc2626' }}>{fieldsError}</div>
            ) : fields.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>No custom fields yet. Add one above to get started.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Label</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Key</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Required</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Updated</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(field => (
                    <tr key={field.id}>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{field.label}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{field.fieldKey}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{field.fieldType}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                        <button type="button" className="ghost" onClick={() => toggleRequired(field)}>
                          {field.required ? 'Required' : 'Optional'}
                        </button>
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>{new Date(field.updatedAt).toLocaleString()}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                        <button type="button" className="ghost" onClick={() => deleteField(field)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Entity layout</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Structure detail views for {entityType || 'your'} records. Group custom fields into friendly sections.</p>
          </div>
          <button type="button" className="ghost" onClick={() => refreshLayout(entityType)} disabled={layoutLoading}>
            {layoutLoading ? 'Loading…' : 'Reload layout'}
          </button>
        </header>
        {layoutDraft && layoutFields.length > 0 ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {layoutDraft.sections.map(section => (
              <div key={section.id} className="card" style={{ padding: 16, background: 'var(--surface-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <input
                      value={section.label}
                      onChange={e => updateSection(section.id, current => ({ ...current, label: e.currentTarget.value }))}
                      style={{ fontSize: 16, fontWeight: 600, border: 'none', background: 'transparent' }}
                    />
                    <textarea
                      value={section.description ?? ''}
                      placeholder="Section description (optional)"
                      onChange={e => updateSection(section.id, current => ({ ...current, description: e.currentTarget.value || undefined }))}
                      style={{ width: '100%', marginTop: 4 }}
                      rows={2}
                    />
                  </div>
                  <button type="button" className="ghost" onClick={() => removeSection(section.id)}>
                    Remove
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {section.fieldKeys.length === 0 ? (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>No fields yet — add below.</span>
                  ) : section.fieldKeys.map(key => {
                    const fieldMeta = layoutFields.find(field => field.fieldKey === key)
                    return (
                      <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(37,99,235,0.12)', color: '#1d4ed8', fontSize: 12 }}>
                        {fieldMeta?.label || key}
                        <button type="button" onClick={() => removeFieldFromSection(section.id, key)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1d4ed8' }}>×</button>
                      </span>
                    )
                  })}
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Add field to section
                    <select onChange={e => { addFieldToSection(section.id, e.currentTarget.value); e.currentTarget.selectedIndex = 0 }}>
                      <option value="">Select field</option>
                      {layoutFields
                        .filter(field => !section.fieldKeys.includes(field.fieldKey))
                        .map(field => (
                          <option key={field.id} value={field.fieldKey}>{field.label}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}

            <AddSectionForm
              availableFieldKeys={availableForNewSection}
              fields={layoutFields}
              onAdd={addSection}
            />

            <div>
              <button type="button" className="primary" onClick={saveLayout} disabled={layoutSaving}>
                {layoutSaving ? 'Saving…' : 'Save layout'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', marginTop: 16 }}>
            {layoutLoading ? 'Loading layout…' : 'No custom fields available yet. Add a field first to design the layout.'}
          </div>
        )}
      </section>
    </div>
  )
}

function AddSectionForm({ availableFieldKeys, fields, onAdd }: { availableFieldKeys: string[]; fields: CustomFieldDefinition[]; onAdd: (label: string, keys: string[], description?: string) => void }) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ marginTop: 0 }}>Add layout section</h4>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Section label
          <input value={label} onChange={e => setLabel(e.currentTarget.value)} placeholder="Timeline" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Description
          <input value={description} onChange={e => setDescription(e.currentTarget.value)} placeholder="Visible helper copy" />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
        Fields
        <select multiple value={selected} onChange={e => {
          const options = Array.from(e.currentTarget.selectedOptions).map(option => option.value)
          setSelected(options)
        }} style={{ minHeight: 120 }}>
          {availableFieldKeys.length === 0 && (
            <option value="" disabled>No fields available</option>
          )}
          {availableFieldKeys.map(key => {
            const meta = fields.find(field => field.fieldKey === key)
            return (
              <option key={key} value={key}>{meta?.label || key}</option>
            )
          })}
        </select>
      </label>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onAdd(label, selected, description)
            setLabel('')
            setDescription('')
            setSelected([])
          }}
          disabled={!label.trim()}
        >
          Add section
        </button>
      </div>
    </div>
  )
}

export function BrandingSettingsPanel() {
  const [branding, setBranding] = useState<BrandingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    BrandingApi.get()
      .then(setBranding)
      .catch((err: any) => {
        toast(err?.message || 'Failed to load branding', 'error')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Branding</h3>
        <div style={{ color: 'var(--muted)' }}>Loading...</div>
      </section>
    )
  }

  if (!branding) {
    return (
      <section className="card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Branding</h3>
        <div style={{ color: 'var(--muted)' }}>No branding settings available.</div>
      </section>
    )
  }

  function updateBrand<K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) {
    setBranding(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function handleSave() {
    if (!branding) return
    setSaving(true)
    try {
      const payload: BrandingUpdateInput = {
        brandName: branding.brandName ?? null,
        logoUrl: branding.logoUrl ?? null,
        faviconUrl: branding.faviconUrl ?? null,
        primaryColor: branding.primaryColor ?? undefined,
        accentColor: branding.accentColor ?? undefined,
        backgroundColor: branding.backgroundColor ?? undefined,
        textColor: branding.textColor ?? undefined,
        defaultLocale: branding.defaultLocale,
        availableLocales: branding.availableLocales
      }
      const saved = await BrandingApi.update(payload)
      setBranding(saved)
      toast('Branding updated')
    } catch (err: any) {
      toast(err?.message || 'Update failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <header>
        <h3 style={{ marginTop: 0 }}>Branding & themes</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Customize the look and language of your tenant. Preview updates instantly across the workspace.</p>
      </header>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 16, background: 'var(--surface-subtle)' }}>
          <h4 style={{ marginTop: 0 }}>Identity</h4>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Brand name
              <input value={branding.brandName ?? ''} onChange={e => updateBrand('brandName', e.currentTarget.value)} placeholder="Vensysco CRM" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Logo URL
              <input value={branding.logoUrl ?? ''} onChange={e => updateBrand('logoUrl', e.currentTarget.value)} placeholder="https://cdn.example/logo.svg" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Favicon URL
              <input value={branding.faviconUrl ?? ''} onChange={e => updateBrand('faviconUrl', e.currentTarget.value)} placeholder="https://cdn.example/favicon.png" />
            </label>
          </div>
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--surface-subtle)' }}>
          <h4 style={{ marginTop: 0 }}>Palette</h4>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {BRAND_COLOR_KEYS.map((key: BrandColorKey) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {key.replace(/([A-Z])/g, ' $1')}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={(branding[key] as string | null | undefined) ?? '#ffffff'} onChange={e => updateBrand(key, e.currentTarget.value)} style={{ width: 48, height: 32, padding: 0 }} />
                  <input value={(branding[key] as string | null | undefined) ?? ''} onChange={e => updateBrand(key, e.currentTarget.value)} placeholder="#1d4ed8" />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16, background: 'var(--surface-subtle)' }}>
          <h4 style={{ marginTop: 0 }}>Localization</h4>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Default locale
              <input value={branding.defaultLocale} onChange={e => updateBrand('defaultLocale', e.currentTarget.value)} placeholder="en" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Available locales (comma separated)
              <input
                value={branding.availableLocales.join(', ')}
                onChange={e => updateBrand('availableLocales', e.currentTarget.value.split(',').map(locale => locale.trim()).filter(Boolean))}
                placeholder="en, hi"
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Last updated {branding.updatedAt ? new Date(branding.updatedAt).toLocaleString() : 'just now'}
          </div>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function WebhookSettingsPanel() {
  const [hooks, setHooks] = useState<WebhookSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<WebhookCreateInput>({
    name: '',
    eventType: 'tender.created',
    targetUrl: '',
    sharedSecret: '',
    headers: undefined,
    isActive: true
  })
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const list = await WebhooksApi.list()
      setHooks(list)
    } catch (err: any) {
      toast(err?.message || 'Failed to load webhooks', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.eventType.trim() || !form.targetUrl.trim()) {
      toast('Name, event & target URL are required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: WebhookCreateInput = {
        ...form,
        headers: form.headers && Object.keys(form.headers).length ? form.headers : undefined,
        sharedSecret: form.sharedSecret ? form.sharedSecret : undefined
      }
      const created = await WebhooksApi.create(payload)
      setHooks(prev => [created, ...prev])
      toast('Webhook added')
      setForm({ name: '', eventType: form.eventType, targetUrl: '', sharedSecret: '', headers: undefined, isActive: true })
    } catch (err: any) {
      toast(err?.message || 'Failed to create webhook', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(webhook: WebhookSubscription) {
    try {
      const updated = await WebhooksApi.update(webhook.id, { isActive: !webhook.isActive })
      setHooks(prev => prev.map(h => (h.id === webhook.id ? updated : h)))
    } catch (err: any) {
      toast(err?.message || 'Failed to update webhook', 'error')
    }
  }

  async function remove(webhook: WebhookSubscription) {
    const confirmed = window.confirm(`Delete webhook “${webhook.name}”?`)
    if (!confirmed) return
    try {
      await WebhooksApi.remove(webhook.id)
      setHooks(prev => prev.filter(h => h.id !== webhook.id))
      toast('Webhook removed')
    } catch (err: any) {
      toast(err?.message || 'Failed to remove webhook', 'error')
    }
  }

  async function test(id: string) {
    try {
      setTestResult('Sending test event…')
      const result = await WebhooksApi.test(id)
      setTestResult(`Response ${result.status}: ${result.ok ? 'Success' : 'Failed'}${result.body ? ` – ${result.body.slice(0, 200)}` : ''}`)
    } catch (err: any) {
      setTestResult(err?.message || 'Test failed')
    }
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <header>
        <h3 style={{ marginTop: 0 }}>Webhooks & integrations</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Notify downstream systems when CRM events fire. Keep target URLs reachable from your network.</p>
      </header>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 16, background: 'var(--surface-subtle)' }}>
          <h4 style={{ marginTop: 0 }}>Subscribe</h4>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Name
              <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.currentTarget.value }))} placeholder="Slack deal alerts" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Event
              <input value={form.eventType} onChange={e => setForm(prev => ({ ...prev, eventType: e.currentTarget.value }))} placeholder="tender.created" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Target URL
              <input value={form.targetUrl} onChange={e => setForm(prev => ({ ...prev, targetUrl: e.currentTarget.value }))} placeholder="https://hooks.example.com/crm" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Shared secret (optional)
              <input value={form.sharedSecret ?? ''} onChange={e => setForm(prev => ({ ...prev, sharedSecret: e.currentTarget.value }))} placeholder="Optional signature key" />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            Extra headers (JSON)
            <textarea
              rows={3}
              value={form.headers ? JSON.stringify(form.headers, null, 2) : ''}
              onChange={e => {
                try {
                  const parsed = e.currentTarget.value.trim() ? JSON.parse(e.currentTarget.value) : undefined
                  setForm(prev => ({ ...prev, headers: parsed }))
                } catch {
                  // ignore parse errors while typing
                }
              }}
              placeholder='{"X-Custom":"Value"}'
            />
          </label>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.isActive !== false} onChange={e => setForm(prev => ({ ...prev, isActive: e.currentTarget.checked }))} />
              Active on create
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Add webhook'}
            </button>
          </div>
        </div>

        <div>
          {loading ? (
            <div style={{ color: 'var(--muted)' }}>Loading…</div>
          ) : hooks.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No webhooks yet. Create one above to fan out events.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Event</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Target</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hooks.map(webhook => (
                  <tr key={webhook.id}>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{webhook.name}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{webhook.eventType}</td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ maxWidth: 260, wordBreak: 'break-all', fontSize: 12 }}>{webhook.targetUrl}</div>
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                      <button type="button" className="ghost" onClick={() => toggleActive(webhook)}>
                        {webhook.isActive ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="ghost" onClick={() => test(webhook.id)}>Test</button>
                        <button type="button" className="ghost" onClick={() => remove(webhook)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {testResult && (
          <div className="card" style={{ padding: 12, background: 'var(--surface-subtle)', fontSize: 12 }}>
            {testResult}
          </div>
        )}
      </div>
    </section>
  )
}

export function AssistantHelperPanel() {
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState<AssistantResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function ask() {
    if (!prompt.trim()) {
      toast('Ask a question first', 'error')
      return
    }
    setLoading(true)
    try {
      const result = await AssistantApi.ask(prompt.trim())
      setResponse(result)
    } catch (err: any) {
      toast(err?.message || 'Assistant request failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card" style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div>
        <h3 style={{ marginTop: 0 }}>Assistant</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Ask for quick summaries, blockers, and next steps across tasks, approvals, and tenders.</p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        Prompt
        <textarea rows={4} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} placeholder="What should I work on next?" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="primary" onClick={ask} disabled={loading}>
          {loading ? 'Thinking…' : 'Ask assistant'}
        </button>
        <button type="button" className="ghost" onClick={() => { setPrompt(''); setResponse(null) }}>Clear</button>
      </div>
      {response && (
        <div className="card" style={{ background: 'var(--surface-subtle)', padding: 16 }}>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{response.answer}</pre>
          {response.suggestions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Suggestions</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {response.suggestions.map(suggestion => (
                  <li key={suggestion} style={{ marginBottom: 4 }}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
