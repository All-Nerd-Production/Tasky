import { create } from 'zustand'
import * as api from '../services/api'

function loadUser() {
  try { return JSON.parse(localStorage.getItem('tasky_user')) } catch { return null }
}

export const useAuthStore = create((set, get) => ({
  user:  loadUser(),
  token: localStorage.getItem('tasky_token'),
  loading: false,

  async register(data) {
    set({ loading: true })
    try {
      const res = await api.register(data)
      localStorage.setItem('tasky_token', res.access_token)
      localStorage.setItem('tasky_user', JSON.stringify(res.user))
      set({ user: res.user, token: res.access_token, loading: false })
      return res
    } catch(e) { set({ loading: false }); throw e }
  },

  async login(data) {
    set({ loading: true })
    try {
      const res = await api.login(data)
      localStorage.setItem('tasky_token', res.access_token)
      localStorage.setItem('tasky_user', JSON.stringify(res.user))
      set({ user: res.user, token: res.access_token, loading: false })
      return res
    } catch(e) { set({ loading: false }); throw e }
  },

  logout() {
    localStorage.removeItem('tasky_token')
    localStorage.removeItem('tasky_user')
    set({ user: null, token: null })
    window.location.href = '/login'
  },

  async refreshMe() {
    try {
      const user = await api.getMe()
      localStorage.setItem('tasky_user', JSON.stringify(user))
      set({ user })
    } catch {}
  },
}))
