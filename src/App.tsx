import { useState, useEffect, useCallback } from 'react'
import {
  supabase,
  listMiniApps, createMiniApp, patchMiniApp,
  createVersion, activateVersion, deleteVersion,
  type MiniApp, type BundleVersion,
} from './lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function Toggle({ checked, onChange, danger }: { checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="toggle-wrap" onClick={() => onChange(!checked)}>
      <div className={`toggle-track ${checked ? 'on' : ''} ${danger ? 'danger' : ''}`}>
        <div className="toggle-thumb" />
      </div>
    </div>
  )
}

// ── new version form ──────────────────────────────────────────────────────────

function NewVersionForm({ slug, onDone, onCancel }: { slug: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ versionTag: '', bundlePathIos: '', bundlePathAndroid: '', notes: '', uploadedBy: 'admin' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.versionTag.trim()) { setErr('versionTag é obrigatório'); return }
    setSaving(true); setErr('')
    try {
      await createVersion({ miniAppSlug: slug, ...f, bundlePathIos: f.bundlePathIos || undefined, bundlePathAndroid: f.bundlePathAndroid || undefined })
      onDone()
    } catch (ex: unknown) { setErr(String(ex)) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <div className="form-grid">
        <div className="form-group">
          <label>Version tag *</label>
          <input placeholder="v1.0.0" value={f.versionTag} onChange={e => setF(p => ({ ...p, versionTag: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Uploaded by</label>
          <input value={f.uploadedBy} onChange={e => setF(p => ({ ...p, uploadedBy: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Bundle path iOS</label>
          <input placeholder="bundles/slug/slug.v1.0.0.ios.bundle" value={f.bundlePathIos} onChange={e => setF(p => ({ ...p, bundlePathIos: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Bundle path Android</label>
          <input placeholder="bundles/slug/slug.v1.0.0.android.bundle" value={f.bundlePathAndroid} onChange={e => setF(p => ({ ...p, bundlePathAndroid: e.target.value }))} />
        </div>
        <div className="form-group full">
          <label>Notas</label>
          <input placeholder="feat: descrição da versão" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>
      {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Salvando...' : 'Registrar versão'}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

// ── mini-app card ─────────────────────────────────────────────────────────────

function MiniAppCard({ app, onRefresh }: { app: MiniApp; onRefresh: () => void }) {
  const [showVersions, setShowVersions] = useState(false)
  const [showNewVersion, setShowNewVersion] = useState(false)
  const [showFlags, setShowFlags] = useState(false)
  const [flagsText, setFlagsText] = useState(JSON.stringify(app.flags ?? {}, null, 2))
  const [flagsErr, setFlagsErr] = useState('')
  const [activating, setActivating] = useState<string | null>(null)
  const [savingKs, setSavingKs] = useState(false)

  const versions: BundleVersion[] = (app.versions ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const handleKillswitch = async (val: boolean) => {
    setSavingKs(true)
    try { await patchMiniApp(app.slug, { killswitch: val }); onRefresh() }
    finally { setSavingKs(false) }
  }

  const handleActivate = async (v: BundleVersion) => {
    setActivating(v.id)
    try { await activateVersion(app.slug, v.id, app.activeVersionId); onRefresh() }
    finally { setActivating(null) }
  }

  const handleDeleteVersion = async (id: string) => {
    if (!confirm('Remover esta versão?')) return
    await deleteVersion(id); onRefresh()
  }

  const handleSaveFlags = async () => {
    setFlagsErr('')
    try {
      const parsed = JSON.parse(flagsText)
      await patchMiniApp(app.slug, { flags: parsed }); onRefresh()
    } catch { setFlagsErr('JSON inválido') }
  }

  const activeVersion = versions.find(v => v.id === app.activeVersionId) ?? null

  return (
    <div className="card">
      {/* header */}
      <div className="card-header">
        <span style={{ fontWeight: 600 }}>{app.name}</span>
        <code>{app.slug}</code>
        {activeVersion && <span className="text-muted">ativa: <strong style={{ color: 'var(--text)' }}>{activeVersion.versionTag}</strong></span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="text-muted" style={{ color: app.killswitch ? 'var(--danger)' : undefined }}>
              {app.killswitch ? 'Killswitch ON' : 'Killswitch'}
            </span>
            <Toggle checked={app.killswitch} onChange={handleKillswitch} danger />
          </div>
          <div className="btn-row">
            <button className="btn-secondary btn-sm" onClick={() => setShowVersions(v => !v)}>
              {showVersions ? 'Ocultar' : `Versões (${versions.length})`}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setShowFlags(v => !v)}>Flags</button>
          </div>
        </div>
      </div>

      {app.killswitch && (
        <div className="ks-warning">Mini-app desativado — o host não carregará este módulo.</div>
      )}

      {/* versions */}
      {showVersions && (
        <div className="card-body">
          {versions.length === 0
            ? <p className="text-muted">Nenhuma versão registrada.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>iOS path</th>
                      <th>Android path</th>
                      <th>Notas</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map(v => (
                      <tr key={v.id} className={v.id === app.activeVersionId ? 'active-row' : ''}>
                        <td><code>{v.versionTag}</code></td>
                        <td className="text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.bundlePathIos ?? '—'}</td>
                        <td className="text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.bundlePathAndroid ?? '—'}</td>
                        <td>{v.notes || '—'}</td>
                        <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{fmt(v.createdAt)}</td>
                        <td>
                          {v.id === app.activeVersionId
                            ? <span className="badge badge-success">ativa</span>
                            : v.status === 'DEPRECATED'
                            ? <span className="badge badge-warning">deprecated</span>
                            : <span className="badge badge-muted">draft</span>
                          }
                        </td>
                        <td>
                          <div className="btn-row">
                            {v.id !== app.activeVersionId && (
                              <button
                                className="btn-primary btn-sm"
                                disabled={activating === v.id}
                                onClick={() => handleActivate(v)}
                              >
                                {activating === v.id ? '...' : 'Ativar'}
                              </button>
                            )}
                            {v.id !== app.activeVersionId && (
                              <button className="btn-danger btn-sm" onClick={() => handleDeleteVersion(v.id)}>Del</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          {showNewVersion
            ? <NewVersionForm slug={app.slug} onDone={() => { setShowNewVersion(false); onRefresh() }} onCancel={() => setShowNewVersion(false)} />
            : <button className="btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowNewVersion(true)}>+ Registrar versão</button>
          }
        </div>
      )}

      {/* flags */}
      {showFlags && (
        <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-muted" style={{ marginBottom: 8 }}>JSON injetado no mini-app via loadRemote. Alterações entram em vigor no próximo cold start.</p>
          <textarea
            rows={5}
            value={flagsText}
            onChange={e => { setFlagsText(e.target.value); setFlagsErr('') }}
          />
          {flagsErr && <div className="error-box" style={{ marginTop: 6 }}>{flagsErr}</div>}
          <button className="btn-primary btn-sm" style={{ marginTop: 8 }} onClick={handleSaveFlags}>Salvar flags</button>
        </div>
      )}
    </div>
  )
}

// ── new mini-app form ─────────────────────────────────────────────────────────

function NewMiniAppForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ slug: '', name: '', description: '', sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.slug || !f.name) { setErr('slug e name são obrigatórios'); return }
    setSaving(true); setErr('')
    try { await createMiniApp(f); onDone() }
    catch (ex: unknown) { setErr(String(ex)) } finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header" style={{ fontWeight: 600 }}>Registrar novo mini-app</div>
      <div className="card-body">
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Slug * <span className="text-muted">(sem espaços)</span></label>
              <input placeholder="pdv" value={f.slug} onChange={e => setF(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
            </div>
            <div className="form-group">
              <label>Nome *</label>
              <input placeholder="PDV" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input placeholder="Ponto de venda integrado" value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Sort order</label>
              <input type="number" value={f.sortOrder} onChange={e => setF(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </div>
          </div>
          {err && <div className="error-box" style={{ marginTop: 8 }}>{err}</div>}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Criar mini-app'}</button>
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── setup screen ──────────────────────────────────────────────────────────────

function SetupScreen() {
  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 24px' }}>
      <div className="card">
        <div className="card-header" style={{ fontWeight: 600 }}>Configuração inicial necessária</div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p>As variáveis de ambiente não estão configuradas. Siga os passos abaixo:</p>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Crie as tabelas no <strong>Supabase SQL Editor</strong> (veja o README)</li>
            <li>Crie o arquivo <code>.env.local</code> baseado no <code>.env.example</code></li>
            <li>Preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_SERVICE_ROLE_KEY</code></li>
            <li>Reinicie o servidor de desenvolvimento</li>
          </ol>
          <p className="text-muted">No Vercel, configure as mesmas variáveis em <strong>Project Settings → Environment Variables</strong>.</p>
        </div>
      </div>
    </div>
  )
}

// ── app ───────────────────────────────────────────────────────────────────────

const hasEnv = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY)

export default function App() {
  const [apps, setApps] = useState<MiniApp[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    if (!hasEnv) return
    setErr('')
    try { setApps(await listMiniApps()) }
    catch (ex: unknown) { setErr(String(ex)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (!hasEnv) return <SetupScreen />

  return (
    <div className="layout">
      {/* sidebar */}
      <aside className="sidebar">
        <div className="sidebar-title">Besys OTA</div>
        <a className="active">Mini Apps</a>
      </aside>

      {/* main */}
      <main className="main">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="page-title">Mini Apps</div>
            <div className="page-sub">Controle de versões, killswitch e feature flags</div>
          </div>
          <button className="btn-primary" onClick={() => setShowNew(v => !v)}>
            {showNew ? 'Cancelar' : '+ Novo mini-app'}
          </button>
        </div>

        {showNew && <NewMiniAppForm onDone={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />}

        {err && <div className="error-box">{err} <button className="btn-secondary btn-sm" onClick={load} style={{ marginLeft: 8 }}>Tentar novamente</button></div>}

        {loading
          ? <p className="text-muted">Carregando...</p>
          : apps.length === 0 && !err
          ? <div className="empty">Nenhum mini-app cadastrado.<br /><span className="text-muted">Clique em "+ Novo mini-app" para começar.</span></div>
          : apps.map(app => <MiniAppCard key={app.slug} app={app} onRefresh={load} />)
        }
      </main>
    </div>
  )
}
