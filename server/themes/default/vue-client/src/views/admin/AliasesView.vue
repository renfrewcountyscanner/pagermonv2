<template>
  <div class="container-fluid py-3">
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <h5 class="fw-bold mb-0 me-auto"><i class="bi bi-card-list me-2"></i>Aliases</h5>
      <input v-model="filter" type="text" class="form-control form-control-sm" style="max-width:220px;" placeholder="Filter…" />
      <router-link to="/admin/aliases/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>New Alias</router-link>
      <button class="btn btn-sm btn-outline-secondary" @click="exportCsv"><i class="bi bi-download me-1"></i>Export</button>
      <label class="btn btn-sm btn-outline-secondary mb-0">
        <i class="bi bi-upload me-1"></i>Import
        <input type="file" accept=".csv" class="d-none" @change="importCsv" />
      </label>
    </div>

    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th style="width:1%"></th>
            <th class="hide-mobile">Type</th>
            <th>Address</th>
            <th>Alias</th>
            <th>Agency</th>
            <th class="hide-mobile">Last Seen</th>
            <th class="hide-mobile">Icon</th>
            <th class="hide-mobile">Color</th>
            <th>Ignore</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="10" class="text-center py-3 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td></tr>
          <tr v-else-if="filtered.length === 0">
            <td colspan="10" class="text-center py-4">
              <i class="bi bi-inbox fs-2 text-muted d-block mb-2"></i>
              <span class="text-muted d-block mb-2">No capcode aliases configured.</span>
              <span class="text-muted small d-block mb-2">Aliases give friendly names to numeric pager addresses.</span>
              <router-link to="/admin/aliases/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>Create your first alias →</router-link>
            </td>
          </tr>
          <tr v-for="a in filtered" :key="a.id">
            <td>
              <span class="d-inline-block rounded-circle" :style="{background: statusColor(a.id), width:'8px', height:'8px'}" :title="statusTitle(a.id)"></span>
            </td>
            <td class="hide-mobile">
              <span v-if="a.match_type === 'apikey'" class="badge bg-info text-dark"><i class="bi bi-key-fill me-1"></i>API Key</span>
              <span v-else class="badge bg-light text-dark border">Capcode</span>
            </td>
            <td class="font-monospace small">{{ a.address }}</td>
            <td>{{ a.alias }}</td>
            <td>{{ a.agency }}</td>
            <td class="hide-mobile small text-muted">{{ formatLastSeen(a.id) }}</td>
            <td class="hide-mobile"><i v-if="a.icon" :class="`bi bi-${a.icon}`"></i></td>
            <td class="hide-mobile">
              <span v-if="a.color" class="d-inline-block rounded" :style="{background: a.color, width:'20px', height:'20px', verticalAlign:'middle'}"></span>
            </td>
            <td><span v-if="a.ignore" class="badge bg-secondary">Ignored</span></td>
            <td class="text-end">
              <router-link :to="`/admin/aliases/${a.id}`" class="btn btn-xs btn-outline-secondary me-1"><i class="bi bi-pencil"></i></router-link>
              <button class="btn btn-xs btn-outline-danger" @click="confirmDelete(a)"><i class="bi bi-trash"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="toDelete" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete alias <strong>{{ toDelete.alias || toDelete.address }}</strong> permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="toDelete = null">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { inject } from 'vue'

const addToast = inject('toast', () => {})
const aliases = ref([])
const loading = ref(false)
const filter = ref('')
const toDelete = ref(null)
const stats = ref({})

function statusColor(id) {
  var s = stats.value[id]
  if (!s) return '#6c757d'
  if (s.count_24h > 0) return '#198754'
  if (s.count_7d > 0) return '#ffc107'
  return '#6c757d'
}
function statusTitle(id) {
  var s = stats.value[id]
  if (!s) return 'Never matched'
  if (s.count_24h > 0) return 'Active (last 24h)'
  if (s.count_7d > 0) return 'Matched within 7 days'
  return 'Inactive'
}
function formatLastSeen(id) {
  var s = stats.value[id]
  if (!s || !s.last_seen) return '—'
  return new Date(s.last_seen * 1000).toLocaleDateString()
}

const filtered = computed(() =>
  aliases.value.filter(a => {
    var f = filter.value.toLowerCase()
    return !f || (a.address + a.alias + a.agency).toLowerCase().includes(f)
  })
)

onMounted(async () => {
  loading.value = true
  try {
    var [r1, r2] = await Promise.all([fetch('/api/capcodes'), fetch('/api/capcodes/stats')])
    if (r1.ok) aliases.value = await r1.json()
    if (r2.ok) {
      var rows = await r2.json()
      rows.forEach(function(r) { stats.value[r.id] = r })
    }
  } catch (_) {}
  loading.value = false
})

function confirmDelete(a) { toDelete.value = a }

async function doDelete() {
  if (!toDelete.value) return
  var r = await fetch(`/api/capcodes/${toDelete.value.id}`, { method: 'DELETE' })
  if (r.ok) { aliases.value = aliases.value.filter(a => a.id !== toDelete.value.id); addToast('Alias deleted') }
  else addToast('Failed to delete', 'danger')
  toDelete.value = null
}

async function exportCsv() {
  var r = await fetch('/api/capcodes?format=csv')
  if (!r.ok) return
  var blob = await r.blob()
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url; a.download = 'aliases.csv'; a.click()
  URL.revokeObjectURL(url)
}

async function importCsv(e) {
  var file = e.target.files[0]
  if (!file) return
  var text = await file.text()
  var r = await fetch('/api/capcodes', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text })
  if (r.ok) {
    addToast('Import successful')
    loading.value = true
    var r2 = await fetch('/api/capcodes')
    if (r2.ok) aliases.value = await r2.json()
    loading.value = false
  } else { addToast('Import failed', 'danger') }
  e.target.value = ''
}
</script>

<style scoped>
.btn-xs { padding: 1px 6px; font-size: 0.78rem; }
</style>
