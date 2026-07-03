<template>
  <div class="container-fluid py-3">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <h5 class="mb-0 me-2"><i class="bi bi-terminal-fill me-1"></i>Live Log</h5>

      <span class="d-flex align-items-center small me-2" :title="connected ? 'Live' : 'Disconnected'">
        <span class="live-dot" :class="connected ? 'connected' : 'disconnected'"></span>
        <span class="text-muted">{{ connected ? 'Live' : 'Offline' }}</span>
      </span>

      <div class="input-group input-group-sm" style="max-width:280px;">
        <span class="input-group-text"><i class="bi bi-funnel"></i></span>
        <input v-model="filterText" type="text" class="form-control" placeholder="Filter text…" />
        <button v-if="filterText" class="btn btn-outline-secondary" @click="filterText = ''"><i class="bi bi-x-lg"></i></button>
      </div>

      <button class="btn btn-sm" :class="filterRegex ? 'btn-primary' : 'btn-outline-secondary'" @click="filterRegex = !filterRegex" title="Toggle regex mode">
        <i class="bi bi-braces"></i> Regex
      </button>

      <button class="btn btn-sm" :class="paused ? 'btn-warning' : 'btn-outline-secondary'" @click="togglePause">
        <i :class="paused ? 'bi bi-play-fill' : 'bi bi-pause-fill'"></i>
        {{ paused ? 'Resume' : 'Pause' }}
        <span v-if="paused && bufferedCount" class="badge bg-dark ms-1">{{ bufferedCount }}</span>
      </button>

      <button class="btn btn-sm btn-outline-secondary" @click="clearLog">
        <i class="bi bi-trash3"></i> Clear
      </button>

      <button class="btn btn-sm" :class="autoscroll ? 'btn-success' : 'btn-outline-secondary'" @click="autoscroll = !autoscroll" title="Auto-scroll to bottom">
        <i class="bi bi-arrow-down-circle-fill"></i>
      </button>

      <button class="btn btn-sm btn-outline-info" @click="sendTest" title="Send a test event to confirm the stream works">
        <i class="bi bi-broadcast"></i> Test
      </button>

      <span class="ms-auto small text-muted">
        {{ visibleCount }} shown / {{ entries.length }} buffered (max {{ maxBuffer }})
      </span>
    </div>

    <div ref="consoleEl" class="livelog-console" @scroll="onScroll">
      <div v-if="entries.length === 0" class="text-muted small p-3 text-center">
        <i class="bi bi-terminal" style="font-size:1.5rem;"></i><br />
        Waiting for incoming pages…
      </div>
      <div
        v-for="e in visibleEntries"
        :key="e.id + '-' + e.ts"
        class="livelog-line"
      >
        <span class="ll-ts">{{ formatTime(e.ts) }}</span>
        <span v-if="e.source" class="ll-src">{{ e.source }}</span>
        <span v-if="e.address" class="ll-cap">{{ e.address }}</span>
        <span v-if="e.agency" class="ll-agency" :style="e.color ? { color: themeAwareColor(e.color) } : {}">[{{ e.agency }}]</span>
        <span v-if="e.alias" class="ll-alias">{{ e.alias }}</span>
        <span class="ll-msg">{{ e.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useTheme } from '../composables/useTheme.js'

const { themeAwareColor } = useTheme()

const entries = ref([])
const buffer = ref([])
const paused = ref(false)
const autoscroll = ref(true)
const filterText = ref('')
const filterRegex = ref(false)
const connected = ref(false)
const consoleEl = ref(null)
const maxBuffer = 1000

let es = null
let nextLocalId = 1

const bufferedCount = computed(() => buffer.value.length)
const visibleEntries = computed(() => {
  const q = filterText.value.trim()
  if (!q) return entries.value
  if (filterRegex.value) {
    let re
    try { re = new RegExp(q, 'i') } catch { return entries.value }
    return entries.value.filter(e =>
      re.test(e.message || '') ||
      re.test(e.alias || '') ||
      re.test(e.agency || '') ||
      re.test(e.address || '') ||
      re.test(e.source || '')
    )
  }
  const lower = q.toLowerCase()
  return entries.value.filter(e =>
    (e.message || '').toLowerCase().includes(lower) ||
    (e.alias || '').toLowerCase().includes(lower) ||
    (e.agency || '').toLowerCase().includes(lower) ||
    (e.address || '').toLowerCase().includes(lower) ||
    (e.source || '').toLowerCase().includes(lower)
  )
})
const visibleCount = computed(() => visibleEntries.value.length)

function formatTime(ts) {
  const d = ts ? new Date(ts) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function appendEntry(raw) {
  const e = {
    id: raw.id != null ? raw.id : `local-${nextLocalId++}`,
    ts: raw.timestamp ? raw.timestamp * 1000 : Date.now(),
    message: raw.message || '',
    alias: raw.alias || '',
    agency: raw.agency || '',
    address: raw.address || '',
    source: raw.source || '',
    color: raw.color || '',
  }
  if (paused.value) {
    buffer.value.push(e)
    if (buffer.value.length > maxBuffer) buffer.value.splice(0, buffer.value.length - maxBuffer)
    return
  }
  entries.value.push(e)
  if (entries.value.length > maxBuffer) entries.value.splice(0, entries.value.length - maxBuffer)
  if (autoscroll.value) scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    const el = consoleEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function onScroll() {
  const el = consoleEl.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
  // If user scrolls up, drop autoscroll; if they scroll back to bottom, re-enable.
  if (!atBottom && autoscroll.value) autoscroll.value = false
  else if (atBottom && !autoscroll.value) autoscroll.value = true
}

function togglePause() {
  paused.value = !paused.value
  if (!paused.value && buffer.value.length) {
    entries.value.push(...buffer.value)
    if (entries.value.length > maxBuffer) entries.value.splice(0, entries.value.length - maxBuffer)
    buffer.value = []
    if (autoscroll.value) scrollToBottom()
  }
}

function clearLog() {
  entries.value = []
  buffer.value = []
}

async function sendTest() {
  try { await fetch('/api/livelog/test', { method: 'POST' }) } catch (_) {}
}

function connect() {
  if (es) try { es.close() } catch (_) {}
  es = new EventSource('/api/livelog/stream')
  es.onopen = () => { connected.value = true }
  es.onerror = () => { connected.value = false }
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data)
      appendEntry(data)
    } catch (_) {}
  }
  es.addEventListener('hello', () => { connected.value = true })
}

watch(filterText, () => {
  if (autoscroll.value) scrollToBottom()
})

onMounted(connect)
onUnmounted(() => { if (es) try { es.close() } catch (_) {} })
</script>

<style scoped>
.livelog-console {
  background: #0e1116;
  color: #d7dde3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 0.5rem 0.75rem;
  border: 1px solid #1f242c;
  border-radius: 6px;
  height: calc(100vh - 170px);
  min-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.livelog-line {
  padding: 1px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.ll-ts { color: #6c7783; margin-right: 8px; }
.ll-src { color: #79c0ff; margin-right: 8px; }
.ll-cap { color: #d2a8ff; margin-right: 8px; }
.ll-agency { color: #ffd866; margin-right: 8px; font-weight: 600; }
.ll-alias { color: #a5d6a7; margin-right: 8px; }
.ll-msg { color: #e6edf3; }
.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.live-dot.connected { background: #28a745; box-shadow: 0 0 6px #28a745; }
.live-dot.disconnected { background: #888; }
</style>
