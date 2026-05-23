import { create } from 'zustand'
import * as api from '../services/api'

export const useWorkspaceStore = create((set, get) => ({
  workspaces:      [],
  activeWorkspace: null,
  projects:        [],
  activeProject:   null,
  members:         [],
  items:           [],
  stats:           null,
  loading:         false,

  async fetchWorkspaces() {
    set({ loading: true })
    try {
      const ws = await api.getWorkspaces()
      set({ workspaces: ws, loading: false })
      // Seleciona o primeiro automaticamente
      if (ws.length && !get().activeWorkspace) {
        await get().selectWorkspace(ws[0])
      }
    } catch { set({ loading: false }) }
  },

  async selectWorkspace(ws) {
    set({ activeWorkspace: ws, projects: [], activeProject: null, items: [] })
    const [projects, members] = await Promise.all([
      api.getProjects(ws.id),
      api.getMembers(ws.id),
    ])
    set({ projects, members })
    if (projects.length && !get().activeProject) {
      await get().selectProject(projects[0])
    }
  },

  async selectProject(p) {
    set({ activeProject: p, items: [], stats: null })
    const [items, stats] = await Promise.all([
      api.getItems(p.id),
      api.getStats(p.id),
    ])
    set({ items, stats })
  },

  async createWorkspace(data) {
    const ws = await api.createWorkspace(data)
    set(s => ({ workspaces: [...s.workspaces, ws] }))
    await get().selectWorkspace(ws)
    return ws
  },

  async createProject(data) {
    const ws = get().activeWorkspace
    if (!ws) return
    const p = await api.createProject(ws.id, data)
    set(s => ({ projects: [...s.projects, p] }))
    await get().selectProject(p)
    return p
  },

  async createItem(data) {
    const p = get().activeProject
    if (!p) return
    const item = await api.createItem(p.id, data)
    set(s => ({ items: [...s.items, item] }))
    return item
  },

  async updateItem(id, data) {
    const item = await api.updateItem(id, data)
    set(s => ({ items: s.items.map(i => i.id === id ? item : i) }))
    return item
  },

  // Chamado pelo WebSocket quando chega evento externo
  applyWsEvent(event) {
    const { event: type, data } = event
    if (type === 'item_created') {
      set(s => ({
        items: s.items.find(i => i.id === data.id)
          ? s.items : [...s.items, data]
      }))
    } else if (type === 'item_updated') {
      set(s => ({ items: s.items.map(i => i.id === data.id ? data : i) }))
    } else if (type === 'item_deleted') {
      set(s => ({ items: s.items.filter(i => i.id !== data.id) }))
    }
  },

  // Refresh após evento WS
  async refreshItems() {
    const p = get().activeProject
    if (!p) return
    const items = await api.getItems(p.id)
    set({ items })
  },
}))
