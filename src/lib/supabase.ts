import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY são obrigatórias')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── tipos ────────────────────────────────────────────────────────────────────

export type VersionStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED'

export interface BundleVersion {
  id: string
  miniAppSlug: string
  versionTag: string
  bundlePathIos: string | null
  bundlePathAndroid: string | null
  notes: string
  uploadedBy: string
  status: VersionStatus
  createdAt: string
}

export interface MiniApp {
  id: string
  slug: string
  name: string
  description: string
  enabled: boolean
  killswitch: boolean
  maintenanceMsg: string
  sortOrder: number
  flags: Record<string, unknown>
  minHostVersion: string | null
  activeVersionId: string | null
  createdAt: string
  updatedAt: string
  versions?: BundleVersion[]
}

// ── queries ───────────────────────────────────────────────────────────────────

export async function listMiniApps(): Promise<MiniApp[]> {
  const { data, error } = await supabase
    .from('MiniApp')
    .select('*, versions:BundleVersion(*)')
    .order('sortOrder', { ascending: true })
  if (error) throw error
  return (data ?? []) as MiniApp[]
}

export async function createMiniApp(payload: {
  slug: string; name: string; description?: string; sortOrder?: number
}): Promise<MiniApp> {
  const { data, error } = await supabase
    .from('MiniApp')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as MiniApp
}

export async function patchMiniApp(
  slug: string,
  patch: Partial<Pick<MiniApp, 'killswitch' | 'enabled' | 'flags' | 'maintenanceMsg' | 'activeVersionId'>>
): Promise<void> {
  const { error } = await supabase
    .from('MiniApp')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('slug', slug)
  if (error) throw error
}

export async function createVersion(payload: {
  miniAppSlug: string
  versionTag: string
  bundlePathIos?: string
  bundlePathAndroid?: string
  notes?: string
  uploadedBy?: string
}): Promise<BundleVersion> {
  const { data, error } = await supabase
    .from('BundleVersion')
    .insert({ ...payload, status: 'DRAFT' })
    .select()
    .single()
  if (error) throw error
  return data as BundleVersion
}

export async function activateVersion(slug: string, versionId: string, prevVersionId: string | null): Promise<void> {
  // Depreca versão anterior
  if (prevVersionId) {
    await supabase
      .from('BundleVersion')
      .update({ status: 'DEPRECATED' })
      .eq('id', prevVersionId)
  }
  // Ativa a nova versão
  await supabase.from('BundleVersion').update({ status: 'ACTIVE' }).eq('id', versionId)
  await patchMiniApp(slug, { activeVersionId: versionId })
}

export async function deleteVersion(id: string): Promise<void> {
  const { error } = await supabase.from('BundleVersion').delete().eq('id', id)
  if (error) throw error
}
