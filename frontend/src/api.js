import Cookies from 'js-cookie'
import { CONFIG } from './config/bohrium'

const BASE = '/api'

function getAuthToken() {
  return Cookies.get(CONFIG.COOKIE_NAME) || localStorage.getItem(CONFIG.COOKIE_NAME)
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    window.dispatchEvent(new CustomEvent('show-login-modal'))
    throw new Error('Authentication required')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `API error: ${res.status}` }))
    throw new Error(err.detail || `API error: ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Stats
  getStats: () => request('/stats'),

  // Papers
  getPapers: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/papers${q ? '?' + q : ''}`)
  },
  getPaper: (id) => request(`/papers/${id}`),
  getPaperArmSeries: (id) => request(`/papers/${id}/arm-series`),
  getPaperDatasets: (id) => request(`/papers/${id}/datasets`),
  getPaperSkills: (id) => request(`/papers/${id}/skills`),
  ensurePaper: (data) => request('/papers/ensure', { method: 'POST', body: JSON.stringify(data) }),
  searchBohriumPapers: (data) => request('/papers/search/bohrium', { method: 'POST', body: JSON.stringify(data) }),

  // Paper Diagnosis
  createDiagnosisReport: (paperId) => request(`/papers/${paperId}/diagnosis`, { method: 'POST' }),
  completeDiagnosisReport: (paperId, reportId) => request(`/papers/${paperId}/diagnosis/${reportId}/complete`, { method: 'POST' }),
  getDiagnosis: (paperId) => request(`/papers/${paperId}/diagnosis`),
  deleteDiagnosisReport: (paperId, reportId) => request(`/papers/${paperId}/diagnosis/${reportId}`, { method: 'DELETE' }),

  // ARM Series
  getArmSeries: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/arm-series${q ? '?' + q : ''}`)
  },
  getArmSeriesDetail: (id) => request(`/arm-series/${id}`),
  createArmSeries: (data) => request('/arm-series', { method: 'POST', body: JSON.stringify(data) }),
  deleteArmSeries: (id) => request(`/arm-series/${id}`, { method: 'DELETE' }),

  // ARM Versions
  createArmVersion: (seriesId, data) => request(`/arm-series/${seriesId}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  getArmVersion: (id) => request(`/arm-versions/${id}`),
  deleteArmVersion: (id) => request(`/arm-versions/${id}`, { method: 'DELETE' }),
  getUploadCredential: (versionId, data) => request(`/arm-versions/${versionId}/upload-credential`, { method: 'POST', body: JSON.stringify(data) }),
  completeArmVersion: (versionId, data) => request(`/arm-versions/${versionId}/complete`, { method: 'POST', body: JSON.stringify(data) }),

  // ARM Content
  getArmContent: (versionId, tab, path = '') =>
    request(`/arm-versions/${versionId}/content/${tab}${path ? '?path=' + encodeURIComponent(path) : ''}`),
  downloadArmContent: (versionId, tab, path) =>
    request(`/arm-versions/${versionId}/content/${tab}/download?path=${encodeURIComponent(path)}`),

  // Datasets
  getDatasets: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/datasets${q ? '?' + q : ''}`)
  },
  getDataset: (id) => request(`/datasets/${id}`),
  createDataset: (data) => request('/datasets', { method: 'POST', body: JSON.stringify(data) }),
  getDatasetArmVersions: (id) => request(`/datasets/${id}/arm-versions`),
  getDatasetPapers: (id) => request(`/datasets/${id}/papers`),
  downloadDataset: (id) => request(`/datasets/${id}/download`),
  getDatasetUploadCredential: (id) => request(`/datasets/${id}/upload-credential`, { method: 'POST' }),
  completeDataset: (id, params) => {
    const q = new URLSearchParams(params).toString()
    return request(`/datasets/${id}/complete?${q}`, { method: 'POST' })
  },

  // Skills
  getSkills: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/skills${q ? '?' + q : ''}`)
  },
  getSkill: (id) => request(`/skills/${id}`),
  getSkillReadme: (id) => request(`/skills/${id}/readme`),
  createSkill: (data) => request('/skills', { method: 'POST', body: JSON.stringify(data) }),
  getSkillArmVersions: (id) => request(`/skills/${id}/arm-versions`),
  getSkillFiles: (id, path = '') => request(`/skills/${id}/files?path=${encodeURIComponent(path)}`),
  downloadSkill: (id) => request(`/skills/${id}/download`),
  downloadSkillReadme: (id) => request(`/skills/${id}/download-readme`),
  getSkillUploadCredential: (id) => request(`/skills/${id}/upload-credential`, { method: 'POST' }),
  completeSkill: (id, params) => {
    const q = new URLSearchParams(params).toString()
    return request(`/skills/${id}/complete?${q}`, { method: 'POST' })
  },

  // Follow
  getFollowPaperStatus: (id) => request(`/me/follows/papers/${id}/status`),
  getFollowDatasetStatus: (id) => request(`/me/follows/datasets/${id}/status`),
  getFollowSkillStatus: (id) => request(`/me/follows/skills/${id}/status`),
  toggleFollowPaper: (id) => request(`/me/follows/papers/${id}`, { method: 'POST' }),
  toggleFollowDataset: (id) => request(`/me/follows/datasets/${id}`, { method: 'POST' }),
  toggleFollowSkill: (id) => request(`/me/follows/skills/${id}`, { method: 'POST' }),

  // Profile
  getProfile: () => request('/me/profile'),

  // Auth
  getAuthMe: () => request('/auth/me'),
  getBohriumMe: () => request('/auth/bohrium/me'),

  // Score
  requestScore: (versionId) => request(`/arm-versions/${versionId}/score/request`, { method: 'POST' }),
  getScore: (versionId) => request(`/arm-versions/${versionId}/score`),

  // BohrClaw
  getBohrClawStatus: () => request('/bohrclaw/status'),
  launchBohrClaw: () => request('/bohrclaw/launch', { method: 'POST' }),
  destroyBohrClaw: () => request('/bohrclaw/destroy', { method: 'DELETE' }),
}
