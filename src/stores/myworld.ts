import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface Company {
  id: string
  name: string
  description: string
  logo: string
  industry: string
  scale: string
  website: string
  status: string
  settings: Record<string, any>
  memberCount: number
  createdBy: string | null
  createdAt: number
  updatedAt: number
}

export interface CompanyMember {
  id: string
  userId: string
  companyId: string
  displayName: string
  email: string
  avatar: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: string
  joinedAt: number
}

export interface UserMembership {
  id: string
  userId: string
  companyId: string
  companyName: string
  companyLogo: string
  role: string
  status: string
  joinedAt: number
}

const API_BASE = '/api/myworld'

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json?.error?.message || `API error ${res.status}`)
  }
  return json.data ?? json
}

export const useMyWorldStore = defineStore('myworld', () => {
  const companies = ref<Company[]>([])
  const currentCompany = ref<Company | null>(null)
  const members = ref<CompanyMember[]>([])
  const memberships = ref<UserMembership[]>([])
  const loading = ref(false)
  const error = ref('')
  const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 0 })

  const activeCompanies = computed(() =>
    companies.value.filter(c => c.status !== 'deleted')
  )

  // ─── Companies ─────────────────────────────────────────────────────────────

  async function fetchCompanies(params?: { page?: number; pageSize?: number; search?: string; industry?: string }): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.pageSize) query.set('pageSize', String(params.pageSize))
      if (params?.search) query.set('search', params.search)
      if (params?.industry) query.set('industry', params.industry)
      const qs = query.toString() ? `?${query.toString()}` : ''
      const data = await apiFetch(`/companies${qs}`)
      companies.value = data.data ?? data
      if (data.pagination) {
        pagination.value = data.pagination
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to load companies'
      console.warn('[MyWorld] fetchCompanies failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchCompany(companyId: string): Promise<Company | null> {
    try {
      const data = await apiFetch(`/companies/${companyId}`)
      currentCompany.value = data
      return data
    } catch (e) {
      console.warn('[MyWorld] fetchCompany failed:', e)
      return null
    }
  }

  async function createCompany(fields: { name: string; description?: string; logo?: string; industry?: string; scale?: string; website?: string }): Promise<Company> {
    const data = await apiFetch('/companies', {
      method: 'POST',
      body: JSON.stringify(fields),
    })
    companies.value.unshift(data)
    return data
  }

  async function updateCompany(companyId: string, fields: Partial<Company>): Promise<void> {
    const data = await apiFetch(`/companies/${companyId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    })
    const idx = companies.value.findIndex(c => c.id === companyId)
    if (idx !== -1) {
      companies.value[idx] = { ...companies.value[idx], ...data, updatedAt: Date.now() }
    }
    if (currentCompany.value?.id === companyId) {
      currentCompany.value = { ...currentCompany.value, ...data, updatedAt: Date.now() }
    }
  }

  async function deleteCompany(companyId: string): Promise<void> {
    await apiFetch(`/companies/${companyId}`, { method: 'DELETE' })
    const idx = companies.value.findIndex(c => c.id === companyId)
    if (idx !== -1) {
      companies.value[idx] = { ...companies.value[idx], status: 'deleted' } as Company
    }
    if (currentCompany.value?.id === companyId) {
      currentCompany.value = null
    }
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async function fetchMembers(companyId: string, params?: { page?: number; pageSize?: number; role?: string }): Promise<void> {
    try {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.pageSize) query.set('pageSize', String(params.pageSize))
      if (params?.role) query.set('role', params.role)
      const qs = query.toString() ? `?${query.toString()}` : ''
      const data = await apiFetch(`/companies/${companyId}/members${qs}`)
      members.value = data.data ?? data
    } catch (e) {
      console.warn('[MyWorld] fetchMembers failed:', e)
    }
  }

  async function addMember(companyId: string, userId: string, role?: string): Promise<CompanyMember> {
    const data = await apiFetch(`/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    })
    members.value.push(data)
    // Update member count
    const company = companies.value.find(c => c.id === companyId)
    if (company) company.memberCount++
    return data
  }

  async function removeMember(companyId: string, memberId: string): Promise<void> {
    await apiFetch(`/companies/${companyId}/members/${memberId}`, { method: 'DELETE' })
    members.value = members.value.filter(m => m.id !== memberId)
    const company = companies.value.find(c => c.id === companyId)
    if (company && company.memberCount > 0) company.memberCount--
  }

  // ─── User memberships ─────────────────────────────────────────────────────

  async function fetchMyMemberships(): Promise<void> {
    try {
      const data = await apiFetch('/members')
      memberships.value = data.data ?? data
    } catch (e) {
      console.warn('[MyWorld] fetchMyMemberships failed:', e)
    }
  }

  // ─── Create default demo company if none exist ────────────────────────────

  async function ensureDemoCompany(): Promise<Company | null> {
    await fetchMyMemberships()
    if (memberships.value.length > 0) {
      return null
    }
    try {
      const company = await createCompany({
        name: '我的公司',
        description: '这是一个演示公司',
        industry: 'technology',
        scale: 'small',
      })
      return company
    } catch (e) {
      console.warn('[MyWorld] ensureDemoCompany failed:', e)
      return null
    }
  }

  return {
    companies,
    currentCompany,
    members,
    memberships,
    loading,
    error,
    pagination,
    activeCompanies,
    fetchCompanies,
    fetchCompany,
    createCompany,
    updateCompany,
    deleteCompany,
    fetchMembers,
    addMember,
    removeMember,
    fetchMyMemberships,
    ensureDemoCompany,
  }
})
