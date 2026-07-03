<template>
  <nav class="navbar navbar-expand-lg fixed-top">
    <div class="container-fluid">
          <router-link class="navbar-brand fw-bold" to="/">{{ monitorName }}</router-link>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
      </button>
      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <router-link class="nav-link" to="/">
              <i class="bi bi-house-fill me-1"></i>Home
            </router-link>
          </li>
          <li v-if="isLoggedIn" class="nav-item">
            <router-link class="nav-link" to="/livelog">
              <i class="bi bi-terminal-fill me-1"></i>Live Log
            </router-link>
          </li>
          <li v-if="isAdmin" class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-shield-lock-fill me-1"></i>Admin
            </a>
            <ul class="dropdown-menu dropdown-menu-dark">
              <li><router-link class="dropdown-item" to="/admin/aliases"><i class="bi bi-card-list me-2"></i>Aliases</router-link></li>
              <li><router-link class="dropdown-item" to="/admin/users"><i class="bi bi-people-fill me-2"></i>Users</router-link></li>
              <li><router-link class="dropdown-item" to="/admin/incident-types"><i class="bi bi-palette-fill me-2"></i>Call Types</router-link></li>
              <li><router-link class="dropdown-item" to="/admin/geo-config"><i class="bi bi-geo-alt-fill me-2"></i>Location Config</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/admin/settings"><i class="bi bi-gear-fill me-2"></i>Settings</router-link></li>
            </ul>
          </li>
        </ul>
        <ul class="navbar-nav ms-auto mb-2 mb-lg-0 align-items-center">
          <li v-if="tz" class="nav-item me-3">
            <span class="text-muted" style="font-size:0.72rem">{{ tz }}</span>
          </li>
          <li class="nav-item me-2">
            <button class="btn btn-sm btn-outline-secondary" @click="toggleDark" :title="dark ? 'Light mode' : 'Dark mode'">
              <i :class="dark ? 'bi bi-sun-fill' : 'bi bi-moon-fill'"></i>
            </button>
          </li>
          <template v-if="isLoggedIn">
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-person-circle me-1"></i>{{ username }}
              </a>
              <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark">
                <li><router-link class="dropdown-item" to="/auth/profile"><i class="bi bi-person-fill me-2"></i>My Profile</router-link></li>
                <li><router-link class="dropdown-item" to="/auth/reset"><i class="bi bi-key-fill me-2"></i>Reset Password</router-link></li>
              </ul>
            </li>
            <li class="nav-item">
              <a class="nav-link" href="/auth/logout"><i class="bi bi-box-arrow-right me-1"></i>Sign Out</a>
            </li>
          </template>
          <template v-else>
            <li v-if="registrationEnabled" class="nav-item">
              <router-link class="nav-link" to="/auth/register"><i class="bi bi-person-plus-fill me-1"></i>Register</router-link>
            </li>
            <li class="nav-item">
              <router-link class="nav-link" to="/auth/login"><i class="bi bi-box-arrow-in-right me-1"></i>Sign In</router-link>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </nav>

  <router-view />

  <!-- Toast container -->
  <div class="toast-container-custom">
    <div v-for="t in toasts" :key="t.id" class="toast show align-items-center border-0 mb-2" :class="`text-bg-${t.type}`" role="alert">
      <div class="d-flex">
        <div class="toast-body">{{ t.msg }}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" @click="removeToast(t.id)"></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useAuthStore } from './stores/auth.js'
import { useTheme } from './composables/useTheme.js'

const auth = useAuthStore()
const { isDark: dark, toggleDark, initTheme } = useTheme()

const toasts = ref([])
let toastId = 0

function addToast(msg, type = 'success', duration = 4000) {
  const id = ++toastId
  toasts.value.push({ id, msg, type })
  if (duration) setTimeout(() => removeToast(id), duration)
}

function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

provide('toast', addToast)

const monitorName = ref('PagerMon')
const isLoggedIn = computed(() => auth.authenticated)
const isAdmin = computed(() => auth.user?.role === 'admin')
const username = computed(() => auth.user?.username || '')
const registrationEnabled = ref(false)

onMounted(async () => {
  initTheme()

  await auth.fetchMe()

  try {
    const r = await fetch('/api/appconfig')
    if (r.ok) {
      const d = await r.json()
      monitorName.value = d.monitorName || 'PagerMon'
      registrationEnabled.value = !!d.registration
    }
  } catch (_) {}

  // Keyboard shortcut: / focuses search on MessagesView
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      var el = document.querySelector('input[placeholder*="Search"], input[placeholder*="Filter"]')
      if (el) el.focus()
    }
  })
})

const tz = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || ''
</script>
