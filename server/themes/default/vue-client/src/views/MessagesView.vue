<template>
  <div class="container-fluid py-3">

    <!-- Toolbar -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="input-group input-group-sm" style="max-width:320px;">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input v-model="searchQuery" @input="onSearchInput" type="text" class="form-control" placeholder="Search messages…" />
        <button v-if="searchQuery" class="btn btn-outline-secondary" @click="clearSearch"><i class="bi bi-x-lg"></i></button>
      </div>

      <select v-model="limit" @change="loadMessages" class="form-select form-select-sm w-auto">
        <option v-for="n in [10,20,50,100]" :key="n" :value="n">{{ n }}</option>
      </select>

      <button class="btn btn-sm btn-outline-secondary" @click="loadMessages" :disabled="loading" title="Refresh">
        <i class="bi bi-arrow-clockwise" :class="{ 'spin': loading }"></i>
      </button>

      <!-- Hide duplicates toggle -->
      <button
        class="btn btn-sm"
        :class="hideDuplicates ? 'btn-warning' : 'btn-outline-secondary'"
        @click="toggleHideDuplicates"
        :title="hideDuplicates ? 'Click to show all messages including duplicates' : 'Click to hide duplicate dispatch pages (same message text, different capcodes)'"
      >
        <i class="bi bi-funnel-fill me-1"></i>
        {{ hideDuplicates ? 'Hide dupes ON' : 'Hide dupes OFF' }}
      </button>

      <!-- Audio alert toggle -->
      <button
        class="btn btn-sm"
        :class="audioEnabled ? 'btn-success' : 'btn-outline-secondary'"
        @click="toggleAudio"
        title="Toggle audio alert for new calls"
      >
        <i :class="audioEnabled ? 'bi bi-volume-up-fill' : 'bi bi-volume-mute-fill'"></i>
      </button>

      <button class="btn btn-sm" :class="notifEnabled ? 'btn-warning' : 'btn-outline-secondary'"
        @click="toggleNotifications" v-if="notifSupported" title="Browser notifications">
        <i class="bi bi-bell-fill"></i>
      </button>

      <span class="ms-auto d-flex align-items-center small" :title="connected ? 'Live' : 'Disconnected'">
        <span class="live-dot" :class="connected ? 'connected' : 'disconnected'"></span>
        <span class="text-muted">{{ connected ? 'Live' : 'Offline' }}</span>
      </span>

      <span v-if="activeFilter" class="badge bg-primary d-flex align-items-center gap-1">
        {{ activeFilter }}
        <a href="/" class="text-white text-decoration-none ms-1"><i class="bi bi-x-lg"></i></a>
      </span>
    </div>

    <!-- Table -->
    <div class="table-responsive">
      <table class="table table-hover table-sm msg-table align-middle mb-0">
        <thead>
          <tr>
            <th class="ts-col">Time</th>
            <th class="src-col hide-mobile">Src</th>
            <th class="cap-col hide-mobile">Capcode</th>
            <th class="agency-col hide-mobile">Agency</th>
            <th class="alias-col hide-mobile">Alias</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && messages.length === 0">
            <td colspan="6" class="text-center py-4 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td>
          </tr>
          <tr v-else-if="!loading && visibleMessages.length === 0">
            <td colspan="6" class="text-center py-4 text-muted">No messages found.</td>
          </tr>
          <tr
            v-for="msg in visibleMessages"
            :key="msg.id"
            class="msg-row"
            :class="{
              'alert-blink': alertIds.has(msg.id),
              'new-flash': newIds.has(msg.id) && !alertIds.has(msg.id)
            }"
            @click="selectMessage(msg)"
          >
            <td class="ts-col text-muted small">{{ formatTime(msg.timestamp) }}</td>
            <td class="src-col hide-mobile small text-muted">{{ msg.source }}</td>
            <td class="cap-col hide-mobile small font-monospace">{{ msg.address }}</td>
            <td class="agency-col hide-mobile">
              <span v-if="msg.agency" class="agency-badge" :style="agencyStyle(msg)">{{ msg.agency }}</span>
            </td>
            <td class="alias-col hide-mobile small">
              <i v-if="msg.icon" :class="`bi bi-${msg.icon} me-1`" :style="{ color: msg.color }"></i>
              {{ msg.alias }}
            </td>
            <td class="msg-text" v-html="highlight(msg.message)"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="pageCount > 1" class="d-flex justify-content-center mt-3">
      <nav><ul class="pagination pagination-sm mb-0">
        <li class="page-item" :class="{ disabled: currentPage === 0 }">
          <button class="page-link" @click="goPage(0)"><i class="bi bi-chevron-double-left"></i></button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage === 0 }">
          <button class="page-link" @click="goPage(currentPage - 1)"><i class="bi bi-chevron-left"></i></button>
        </li>
        <li v-for="p in visiblePages" :key="p" class="page-item" :class="{ active: p === currentPage }">
          <button class="page-link" @click="goPage(p)">{{ p + 1 }}</button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= pageCount - 1 }">
          <button class="page-link" @click="goPage(currentPage + 1)"><i class="bi bi-chevron-right"></i></button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= pageCount - 1 }">
          <button class="page-link" @click="goPage(pageCount - 1)"><i class="bi bi-chevron-double-right"></i></button>
        </li>
      </ul></nav>
    </div>

    <div class="text-muted small text-center mt-1" v-if="msgCount > 0">
      <template v-if="hideDuplicates">
        <span class="text-warning fw-semibold">{{ visibleMessages.length }} shown</span>
        <span v-if="messages.length > visibleMessages.length"> · <span class="text-danger">{{ messages.length - visibleMessages.length }} duplicate{{ messages.length - visibleMessages.length !== 1 ? 's' : '' }} hidden</span></span>
        · {{ msgCount.toLocaleString() }} total in DB
      </template>
      <template v-else>
        {{ messages.length }} shown · {{ msgCount.toLocaleString() }} total in DB
      </template>
    </div>

    <!-- Detail panel -->
    <div class="detail-panel" :class="{ open: !!selected }" @click.self="selected = null">
      <div v-if="selected">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h6 class="fw-bold mb-0">Message Detail</h6>
          <button class="btn btn-sm btn-outline-secondary" @click="selected = null"><i class="bi bi-x-lg"></i></button>
        </div>
        <dl class="row small mb-3">
          <dt class="col-4 text-muted">Time</dt>
          <dd class="col-8">{{ formatFull(selected.timestamp) }}</dd>
          <dt class="col-4 text-muted">Capcode</dt>
          <dd class="col-8 font-monospace">{{ selected.address }}</dd>
          <dt class="col-4 text-muted">Source</dt>
          <dd class="col-8">{{ selected.source }}</dd>
          <dt v-if="selected.agency" class="col-4 text-muted">Agency</dt>
          <dd v-if="selected.agency" class="col-8">{{ selected.agency }}</dd>
          <dt v-if="selected.alias" class="col-4 text-muted">Alias</dt>
          <dd v-if="selected.alias" class="col-8">{{ selected.alias }}</dd>
        </dl>
        <div class="p-2 rounded" style="background:var(--pm-surface-alt); word-break:break-word;">
          {{ selected.message }}
        </div>
        <div class="mt-3 d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" @click="filterByAlias(selected)">
            <i class="bi bi-funnel-fill me-1"></i>Filter alias
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="filterByAgency(selected)">
            <i class="bi bi-building me-1"></i>Filter agency
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSocket } from '../composables/useSocket.js'

const route = useRoute()
const router = useRouter()
const addToast = inject('toast', () => {})

const messages   = ref([])
const loading    = ref(false)
const currentPage = ref(0)
const pageCount  = ref(0)
const msgCount   = ref(0)
const limit      = ref(parseInt(localStorage.getItem('pm-limit') || '50'))
const searchQuery = ref('')
const activeFilter = ref('')
const selected   = ref(null)
const newIds     = ref(new Set())   // blue flash — all new messages
const alertIds   = ref(new Set())   // red blink — new unique calls only

const hideDuplicates = ref(localStorage.getItem('pm-hidedupes') === 'true')
const audioEnabled   = ref(localStorage.getItem('pm-audio') !== 'false')
const notifEnabled   = ref(Notification?.permission === 'granted')
const notifSupported = ref('Notification' in window)

const { connected, connect } = useSocket()

// Tracks recently seen message texts for dedup detection (text → timestamp ms)
const recentTexts = new Map()
const DEDUP_WINDOW_MS = 15 * 60 * 1000

let searchTimer = null
let audioCtx = null

// ── Dedup helpers ──────────────────────────────────────────────────────────

function msgKey(text) {
  return (text || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function purgeOldTexts() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS
  for (const [k, ts] of recentTexts) {
    if (ts < cutoff) recentTexts.delete(k)
  }
}

function isNewUniqueCall(text) {
  purgeOldTexts()
  const key = msgKey(text)
  if (recentTexts.has(key)) return false
  recentTexts.set(key, Date.now())
  return true
}

// Seed the dedup map from the initial message load so we don't false-alert
// on messages that are already on screen when the page first loads
function seedRecentTexts(msgs) {
  const cutoff = Date.now() - DEDUP_WINDOW_MS
  for (const m of msgs) {
    const ts = (m.timestamp || 0) * 1000
    if (ts > cutoff) recentTexts.set(msgKey(m.message), ts)
  }
}

// ── Audio ──────────────────────────────────────────────────────────────────

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function playChime() {
  if (!audioEnabled.value) return
  try {
    const ctx = getAudioCtx()
    // Two-note ascending chime: G5 then B5 — gentle, clear
    const notes = [{ freq: 784, start: 0 }, { freq: 988, start: 0.18 }]
    notes.forEach(({ freq, start }) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + start
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
      osc.start(t)
      osc.stop(t + 0.72)
    })
  } catch (_) {}
}

// ── Visibility filter ──────────────────────────────────────────────────────

const visibleMessages = computed(() => {
  if (!hideDuplicates.value) return messages.value
  const seen = new Set()
  return messages.value.filter(m => {
    const key = msgKey(m.message)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const hiddenCount = computed(() => messages.value.length - visibleMessages.value.length)

// ── Toolbar actions ────────────────────────────────────────────────────────

function toggleHideDuplicates() {
  hideDuplicates.value = !hideDuplicates.value
  localStorage.setItem('pm-hidedupes', hideDuplicates.value)
}

function toggleAudio() {
  audioEnabled.value = !audioEnabled.value
  localStorage.setItem('pm-audio', audioEnabled.value)
  // Play sample note so user hears what the alert sounds like when enabling
  if (audioEnabled.value) playChime()
}

// ── Pagination ─────────────────────────────────────────────────────────────

const visiblePages = computed(() => {
  const total = pageCount.value
  const cur   = currentPage.value
  const start = Math.max(0, cur - 2)
  const end   = Math.min(total - 1, cur + 2)
  const pages = []
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

// ── Formatting ─────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatFull(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

function agencyStyle(msg) {
  return msg.color ? { backgroundColor: msg.color } : {}
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlight(text) {
  if (!searchQuery.value || !text) return escapeHtml(text || '')
  const escaped = escapeHtml(text)
  const q = escapeHtml(searchQuery.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`)
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadMessages(resetPage = false) {
  if (resetPage) currentPage.value = 0
  loading.value = true
  localStorage.setItem('pm-limit', limit.value)

  try {
    const q       = route.query.q || searchQuery.value
    const agency  = route.query.agency  || ''
    const alias   = route.query.alias   || ''
    const address = route.query.address || ''

    let url = '/api/messages'
    const params = new URLSearchParams({ page: currentPage.value + 1, limit: limit.value })

    if (q || agency || alias || address) {
      url = '/api/messageSearch'
      if (q)       params.append('q',       q)
      if (agency)  params.append('agency',  agency)
      if (alias)   params.append('alias',   alias)
      if (address) params.append('address', address)
    }

    const r = await fetch(`${url}?${params}`)
    if (!r.ok) { loading.value = false; return }
    const d = await r.json()
    messages.value = d.messages || []
    const init = d.init || {}
    pageCount.value = init.pageCount || 0
    msgCount.value  = init.msgCount  || 0

    seedRecentTexts(messages.value)
  } catch (e) {
    console.error(e)
  }
  loading.value = false
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadMessages(true), 350)
}

function clearSearch() {
  searchQuery.value = ''
  router.replace('/')
  loadMessages(true)
}

function goPage(p) {
  currentPage.value = Math.max(0, Math.min(p, pageCount.value - 1))
  loadMessages()
}

// ── Detail panel ───────────────────────────────────────────────────────────

function selectMessage(msg) { selected.value = msg }

function filterByAlias(msg) {
  if (!msg.alias_id) return
  router.push(`/?alias=${msg.alias_id}`)
  selected.value = null
  activeFilter.value = msg.alias || msg.alias_id
  searchQuery.value = ''
  loadMessages(true)
}

function filterByAgency(msg) {
  if (!msg.agency) return
  router.push(`/?agency=${msg.agency}`)
  selected.value = null
  activeFilter.value = msg.agency
  searchQuery.value = ''
  loadMessages(true)
}

// ── Notifications ──────────────────────────────────────────────────────────

function toggleNotifications() {
  if (Notification.permission === 'granted') {
    notifEnabled.value = false
    addToast('Notifications disabled', 'secondary')
  } else {
    Notification.requestPermission().then(p => {
      notifEnabled.value = p === 'granted'
      addToast(
        p === 'granted' ? 'Notifications enabled' : 'Permission denied',
        p === 'granted' ? 'success' : 'warning'
      )
    })
  }
}

// ── Socket handler ─────────────────────────────────────────────────────────

function handleSocketMessage(msg) {
  const isUnique = isNewUniqueCall(msg.message)

  if (currentPage.value === 0) {
    messages.value.unshift(msg)
    if (messages.value.length > limit.value) messages.value.pop()
    msgCount.value++

    if (isUnique) {
      // Red blinking alert for new unique call
      alertIds.value = new Set([...alertIds.value, msg.id])
      setTimeout(() => {
        alertIds.value = new Set([...alertIds.value].filter(id => id !== msg.id))
      }, 10000)

      playChime()

      if (notifEnabled.value && Notification.permission === 'granted') {
        new Notification(msg.alias || msg.address, { body: msg.message, tag: String(msg.id) })
      }
    } else {
      // Subtle blue flash for duplicate (same incident, different unit)
      newIds.value = new Set([...newIds.value, msg.id])
      setTimeout(() => {
        newIds.value = new Set([...newIds.value].filter(id => id !== msg.id))
      }, 1500)
    }
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

onMounted(() => {
  if (route.query.q)      searchQuery.value  = route.query.q
  if (route.query.agency) activeFilter.value = route.query.agency
  if (route.query.alias)  activeFilter.value = route.query.alias

  loadMessages()
  connect(handleSocketMessage)
})
</script>

<style scoped>
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Red blink for new unique calls — target td because Bootstrap sets bg on td, not tr */
.alert-blink td {
  animation: redBlink 1s ease-in-out 10;
}
@keyframes redBlink {
  0%, 100% { background-color: transparent; }
  50%       { background-color: rgba(220, 53, 69, 0.45); }
}
</style>
