import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''
const api  = axios.create({ baseURL: `${BASE}/api`, timeout: 30000 })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('tasky_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('tasky_token')
    localStorage.removeItem('tasky_user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})

export const register        = d              => api.post('/auth/register', d).then(r=>r.data)
export const login           = d              => api.post('/auth/login', d).then(r=>r.data)
export const getMe           = ()             => api.get('/auth/me').then(r=>r.data)
export const updateMe        = d              => api.put('/auth/me', d).then(r=>r.data)
export const getWorkspaces   = ()             => api.get('/workspaces').then(r=>r.data)
export const createWorkspace = d              => api.post('/workspaces', d).then(r=>r.data)
export const getMembers      = wsId           => api.get(`/workspaces/${wsId}/members`).then(r=>r.data)
export const inviteMember    = (wsId, d)      => api.post(`/workspaces/${wsId}/invite`, d).then(r=>r.data)
export const joinByInvite    = token          => api.post(`/workspaces/join/${token}`).then(r=>r.data)
export const getProjects     = wsId           => api.get(`/workspaces/${wsId}/projects`).then(r=>r.data)
export const createProject   = (wsId, d)      => api.post(`/workspaces/${wsId}/projects`, d).then(r=>r.data)
export const updateProject   = (wsId, pid, d) => api.put(`/workspaces/${wsId}/projects/${pid}`, d).then(r=>r.data)
export const getItems        = (pid, p)       => api.get(`/projects/${pid}/items`, { params: p }).then(r=>r.data)
export const createItem      = (pid, d)       => api.post(`/projects/${pid}/items`, d).then(r=>r.data)
export const getItem         = id             => api.get(`/items/${id}`).then(r=>r.data)
export const updateItem      = (id, d)        => api.put(`/items/${id}`, d).then(r=>r.data)
export const deleteItem      = id             => api.delete(`/items/${id}`).then(r=>r.data)
export const getStats        = pid            => api.get(`/projects/${pid}/stats`).then(r=>r.data)
export const getComments     = iid            => api.get(`/items/${iid}/comments`).then(r=>r.data)
export const addComment      = (iid, d)       => api.post(`/items/${iid}/comments`, d).then(r=>r.data)
export const getActivity     = iid            => api.get(`/items/${iid}/activity`).then(r=>r.data)

export const wsUrl = (pid, token) => {
  const base = (import.meta.env.VITE_API_URL || window.location.origin)
    .replace('https://', 'wss://').replace('http://', 'ws://')
  return `${base}/api/ws/projects/${pid}?token=${token}`
}

export default api
