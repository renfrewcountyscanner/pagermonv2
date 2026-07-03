<template>
  <div class="container-fluid py-3">

    <!-- Toolbar -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="input-group input-group-sm" style="max-width:320px;">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input v-model="searchQuery" @input="onSearchInput" ref="searchInput" type="text" class="form-control" placeholder="Search messages… (press /)" />
        <button v-if="searchQuery" class="btn btn-outline-secondary" @click="clearSearch"><i class="bi bi-x-lg"></i></button>
      </div>

      <select v-model="limit" @change="loadMessages" class="form-select form-select-sm w-auto">
        <option v-for="n in [10,20,50,100]" :key="n" :value="n">{{ n }}</option>
      </select>

      <button class="btn btn-sm btn-outline-secondary" @click="loadMessages" :disabled="loading" title="Refresh">
        <i class="bi bi-arrow-clockwise" :class="{ 'spin': loading }"></i>
      </button>

      <!-- Date range -->
      <span class="d-flex align-items-center gap-1 small text-muted">
        <input v-model="dateFrom" @change="loadMessages(true)" type="date" class="form-control form-control-sm" style="width:140px;" title="From date" />
        <span>–</span>
        <input v-model="dateTo" @change="loadMessages(true)" type="date" class="form-control form-control-sm" style="width:140px;" title="To date" />
      </span>

      <!-- Collapsible toggles for mobile -->
      <button class="btn btn-sm btn-outline-secondary d-lg-none" @click="showToggles = !showToggles" :title="showToggles ? 'Hide filters' : 'Show filters'">
        <i class="bi bi-sliders"></i>
      </button>

      <div class="d-flex flex-wrap gap-2" :class="{ 'd-none': !showToggles && isMobile }">
        <!-- Hide duplicates toggle -->
        <button
          class="btn btn-sm"
          :class="hideDuplicates ? 'btn-primary' : 'btn-outline-secondary'"
          @click="toggleHideDuplicates"
          title="Hide duplicate dispatch pages (same message text, different capcodes)"
        >
          <i class="bi bi-funnel-fill me-1"></i>
          {{ hideDuplicates ? 'Hide dupes' : 'Dupes' }}
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

        <button class="btn btn-sm" :class="notifEnabled ? 'btn-primary' : 'btn-outline-secondary'"
          @click="toggleNotifications" v-if="notifSupported" title="Browser notifications">
          <i class="bi bi-bell-fill"></i>
        </button>
      </div>

      <span class="ms-auto d-flex align-items-center small" :title="connected ? 'Live' : 'Disconnected'">
        <span class="live-dot" :class="connected ? 'connected' : 'disconnected'"></span>
        <span class="text-muted d-none d-sm-inline">{{ connected ? 'Live' : 'Offline' }}</span>
      </span>

      <span v-if="activeFilter" class="badge bg-primary d-flex align-items-center gap-1">
        {{ activeFilter }}
        <button class="btn-close btn-close-white small ms-1" @click="clearActiveFilter"></button>
      </span>
    </div>

    <!-- Table -->
    <div class="table-responsive">
      <table class="table table-hover table-sm msg-table align-middle mb-0">
        <thead>
          <tr>
            <th class="ts-col sortable" @click="setSort('timestamp')">
              Date/Time
              <i :class="sortIcon('timestamp')"></i>
            </th>
            <th class="src-col hide-mobile sortable" @click="setSort('source')">
              Src
              <i :class="sortIcon('source')"></i>
            </th>
            <th class="cap-col hide-mobile sortable" @click="setSort('address')">
              Capcode
              <i :class="sortIcon('address')"></i>
            </th>
            <th class="agency-col hide-mobile sortable" @click="setSort('agency')">
              Agency
              <i :class="sortIcon('agency')"></i>
            </th>
            <th class="alias-col hide-mobile sortable" @click="setSort('alias')">
              Alias
              <i :class="sortIcon('alias')"></i>
            </th>
            <th class="sortable" @click="setSort('message')">
              Message
              <i :class="sortIcon('message')"></i>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && messages.length === 0">
              <td colspan="6" class="text-center py-5 text-muted">
              <i class="bi bi-arrow-clockwise spin me-2"></i>Loading…
            </td>
          </tr>
          <tr v-else-if="!loading && messages.length === 0">
              <td colspan="6" class="text-center py-5 text-muted">
              <div class="mb-2"><i class="bi bi-inbox" style="font-size:2rem;"></i></div>
              No messages found.<br />
              <span class="small">Pages will appear here when received.</span>
            </td>
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
              <i v-if="msg.icon" :class="`bi bi-${msg.icon} me-1`" :style="{ color: themeAwareColor(msg.color) }"></i>
              {{ msg.alias }}
            </td>
            <td class="msg-text">
              <span v-if="isTestMessage(msg)" class="badge bg-warning text-dark me-1" style="font-size:0.65rem;">TEST RETRIGGER</span>
              <span v-html="highlight(cleanMessage(msg.message))"></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="pageCount > 1" class="d-flex justify-content-center mt-3">
      <nav><ul class="pagination pagination-sm mb-0">
        <li class="page-item" :class="{ disabled: currentPage === 0 }">
          <button class="page-link" @click="goPage(0)" title="First page"><i class="bi bi-chevron-double-left"></i></button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage === 0 }">
          <button class="page-link" @click="goPage(currentPage - 1)" title="Previous page"><i class="bi bi-chevron-left"></i></button>
        </li>
        <li v-for="p in visiblePages" :key="p" class="page-item" :class="{ active: p === currentPage }">
          <button class="page-link" @click="goPage(p)">{{ p + 1 }}</button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= pageCount - 1 }">
          <button class="page-link" @click="goPage(currentPage + 1)" title="Next page"><i class="bi bi-chevron-right"></i></button>
        </li>
        <li class="page-item" :class="{ disabled: currentPage >= pageCount - 1 }">
          <button class="page-link" @click="goPage(pageCount - 1)" title="Last page"><i class="bi bi-chevron-double-right"></i></button>
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
        <div class="p-2 rounded mb-2" style="background:var(--pm-surface-alt); word-break:break-word; white-space:pre-wrap;">
          <span v-if="isTestMessage(selected)" class="badge bg-warning text-dark me-2" style="font-size:0.65rem;">TEST RETRIGGER</span>
          {{ cleanMessage(selected.message) }}
        </div>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button class="btn btn-sm btn-outline-secondary" @click="copyMessage(selected)" title="Copy message to clipboard">
            <i class="bi bi-clipboard me-1"></i>Copy
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="copyCapcode(selected)" title="Copy capcode to clipboard">
            <i class="bi bi-hash me-1"></i>Copy Capcode
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="retriggerMessage(selected)" title="Re-process through notification pipeline">
            <i :class="retriggering === selected.id ? 'bi bi-arrow-repeat spin me-1' : 'bi bi-lightning-charge-fill me-1'"></i>
            {{ retriggering === selected.id ? 'Retriggering…' : 'Retrigger Notifications' }}
          </button>
        </div>
        <div class="d-flex gap-2">
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
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSocket } from '../composables/useSocket.js'
import { useTheme } from '../composables/useTheme.js'

const route = useRoute()
const { themeAwareColor } = useTheme()
const router = useRouter()
const addToast = inject('toast', () => {})
const retriggering = ref(null)

const messages    = ref([])
const loading     = ref(false)
const currentPage = ref(0)
const pageCount   = ref(0)
const msgCount    = ref(0)
const limit       = ref(parseInt(localStorage.getItem('pm-limit') || '50'))
const searchQuery = ref('')
const activeFilter = ref('')
const selected     = ref(null)
const newIds      = ref(new Set())
const alertIds    = ref(new Set())
const showToggles = ref(false)

const hideDuplicates = ref(localStorage.getItem('pm-hidedupes') === 'true')
const audioEnabled   = ref(localStorage.getItem('pm-audio') !== 'false')
const notifEnabled   = ref(Notification?.permission === 'granted')
const notifSupported = ref('Notification' in window)

const { connected, connect } = useSocket()

const recentTexts = new Map()
const DEDUP_WINDOW_MS = 15 * 60 * 1000

let searchTimer = null
let audioCtx = null

const isMobile = ref(false)
const searchInput = ref(null)

const sortField = ref('timestamp')
const sortDir = ref('desc')
const dateFrom = ref('')
const dateTo = ref('')

function sortIcon(field) {
  if (sortField.value !== field) return 'bi bi-filter'
  return sortDir.value === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down'
}

function setSort(field) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
  loadMessages(true)
}

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

function seedRecentTexts(msgs) {
  for (const m of msgs) {
    const ts = (m.timestamp || 0) * 1000
    recentTexts.set(msgKey(m.message), ts)
  }
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function playChime() {
  if (!audioEnabled.value) return
  try {
    const ctx = getAudioCtx()
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

function toggleHideDuplicates() {
  hideDuplicates.value = !hideDuplicates.value
  localStorage.setItem('pm-hidedupes', hideDuplicates.value)
}

function toggleAudio() {
  audioEnabled.value = !audioEnabled.value
  localStorage.setItem('pm-audio', audioEnabled.value)
  if (audioEnabled.value) playChime()
}

const visiblePages = computed(() => {
  const total = pageCount.value
  const cur   = currentPage.value
  const start = Math.max(0, cur - 2)
  const end   = Math.min(total - 1, cur + 2)
  const pages = []
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const pad = n => String(n).padStart(2, '0')
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  const dy = d.getDate()
  const mi = pad(d.getMinutes())
  const se = pad(d.getSeconds())
  const h = d.getHours()
  const ampm = h >= 12 ? 'p.m.' : 'a.m.'
  const h12 = h % 12 || 12
  return `${mo} ${dy}, ${h12}:${mi}:${se} ${ampm}`
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
    const params = new URLSearchParams({
      page: currentPage.value + 1,
      limit: limit.value,
      sort: sortField.value,
      dir: sortDir.value
    })

    if (dateFrom.value) params.append('from', dateFrom.value)
    if (dateTo.value)   params.append('to',   dateTo.value)

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
    const newMsgs = d.messages || []
    const init = d.init || {}
    pageCount.value = init.pageCount || 0
    msgCount.value  = init.msgCount  || 0

    const existingIds = new Set(messages.value.map(m => m.id))
    const merged = [...newMsgs, ...messages.value.filter(m => !existingIds.has(m.id))]
    messages.value = merged.slice(0, limit.value)
    seedRecentTexts(merged)
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

function clearActiveFilter() {
  activeFilter.value = ''
  router.replace('/')
  loadMessages(true)
}

function goPage(p) {
  currentPage.value = Math.max(0, Math.min(p, pageCount.value - 1))
  loadMessages()
}

async function retriggerMessage(msg) {
  retriggering.value = msg.id
  try {
    const r = await fetch(`/api/messages/${msg.id}/retrigger`, { method: 'POST' })
    if (r.ok) {
      addToast('Notifications retriggered — new message ID ' + await r.text())
    } else {
      addToast('Retrigger failed', 'danger')
    }
  } catch (_) { addToast('Retrigger failed', 'danger') }
  retriggering.value = null
}

function isTestMessage(msg) {
  return msg && msg.message && msg.message.startsWith('[TEST RETRIGGER]')
}

function cleanMessage(text) {
  if (text && text.startsWith('[TEST RETRIGGER] ')) return text.slice(18)
  return text
}

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

function toggleNotifications() {
  if (Notification.permission === 'granted') {
    notifEnabled.value = false
    addToast('Notifications disabled', 'secondary')
  } else {
    Notification.requestPermission().then(p => {
      notifEnabled.value = p === 'granted'
      addToast(p === 'granted' ? 'Notifications enabled' : 'Permission denied', p === 'granted' ? 'success' : 'warning')
    })
  }
}

function copyMessage(msg) {
  navigator.clipboard.writeText(msg.message).then(() => {
    addToast('Message copied!', 'success')
  }).catch(() => {
    addToast('Copy failed', 'danger')
  })
}

function copyCapcode(msg) {
  navigator.clipboard.writeText(msg.address).then(() => {
    addToast('Capcode copied!', 'success')
  }).catch(() => {
    addToast('Copy failed', 'danger')
  })
}

function handleSocketMessage(msg) {
  const isUnique = isNewUniqueCall(msg.message)

  const existingIds = new Set(messages.value.map(m => m.id))
  if (!existingIds.has(msg.id)) {
    messages.value.unshift(msg)
    if (messages.value.length > limit.value) messages.value.pop()
    msgCount.value++
  }

  if (isUnique) {
    alertIds.value = new Set([...alertIds.value, msg.id])
    setTimeout(() => {
      alertIds.value = new Set([...alertIds.value].filter(id => id !== msg.id))
    }, 10000)

    playChime()

    if (notifEnabled.value && Notification.permission === 'granted') {
      new Notification(msg.alias || msg.address, { body: msg.message, tag: String(msg.id) })
    }
  } else {
    newIds.value = new Set([...newIds.value, msg.id])
    setTimeout(() => {
      newIds.value = new Set([...newIds.value].filter(id => id !== msg.id))
    }, 1500)
  }
}

function handleKeydown(e) {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault()
    searchInput.value?.focus()
  }
  if (e.key === 'Escape') {
    if (selected.value) selected.value = null
    else searchInput.value?.blur()
  }
  if (e.key === 'n' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (currentPage.value < pageCount.value - 1) goPage(currentPage.value + 1)
  }
  if (e.key === 'p' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (currentPage.value > 0) goPage(currentPage.value - 1)
  }
}

function checkMobile() {
  isMobile.value = window.innerWidth < 992
}

onMounted(() => {
  if (route.query.q)      searchQuery.value  = route.query.q
  if (route.query.agency) activeFilter.value = route.query.agency
  if (route.query.alias)  activeFilter.value = route.query.alias

  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('keydown', handleKeydown)

  loadMessages()
  connect(handleSocketMessage)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.alert-blink td {
  animation: redBlink 1s ease-in-out 10;
}
@keyframes redBlink {
  0%, 100% { background-color: transparent; }
  50%       { background-color: rgba(220, 53, 69, 0.45); }
}

.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover { color: var(--pm-accent); }
.sortable i { font-size: 0.75rem; margin-left: 2px; opacity: 0.6; }

.btn-close { font-size: 0.5rem; padding: 0.25rem; }
</style>
