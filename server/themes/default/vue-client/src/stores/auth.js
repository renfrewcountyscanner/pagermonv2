import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const checked = ref(false)

  const authenticated = computed(() => !!user.value)

  async function fetchMe() {
    try {
      const r = await fetch('/api/me')
      if (r.ok) {
        const d = await r.json()
        user.value = d.authenticated ? d.user : null
      }
    } catch (_) {
      user.value = null
    }
    checked.value = true
  }

  async function login(username, password) {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const d = await r.json()
    if (r.ok && d.status === 'ok') {
      await fetchMe()
      return { ok: true, redirect: d.redirect }
    }
    return { ok: false, error: d.error || 'Login failed' }
  }

  async function register(payload) {
    const r = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json()
    if (r.ok && d.status === 'ok') {
      await fetchMe()
      return { ok: true }
    }
    return { ok: false, error: d.error || 'Registration failed' }
  }

  return { user, checked, authenticated, fetchMe, login, register }
})
