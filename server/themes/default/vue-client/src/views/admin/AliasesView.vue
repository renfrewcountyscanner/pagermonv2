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
            <th class="hide-mobile">Type</th>
            <th>Address</th>
            <th>Alias</th>
            <th>Agency</th>
            <th class="hide-mobile">Icon</th>
            <th class="hide-mobile">Color</th>
            <th>Ignore</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center py-3 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td></tr>
          <tr v-else-if="filtered.length === 0"><td colspan="8" class="text-center py-3 text-muted">No aliases found.</td></tr>
          <tr v-for="a in filtered" :key="a.id">
            <td class="hide-mobile">
              <span v-if="a.match_type === 'apikey'" class="badge bg-info text-dark"><i class="bi bi-key-fill me-1"></i>API Key</span>
              <span v-else class="badge bg-light text-dark border">Capcode</span>
            </td>
            <td class="font-monospace small">{{ a.address }}</td>
            <td>{{ a.alias }}</td>
            <td>{{ a.agency }}</td>
            <td class="hide-mobile"><i v-if="a.icon" :class="`bi bi-${a.icon}`"></i></td>
            <td class="hide-mobile">
              <span v-if="a.color" class="d-inline-block rounded" :style="{background: a.color, width:'20px', height:'20px', verticalAlign:'middle'}"></span>
            </td>
            <td>
              <span v-if="a.ignore" class="badge bg-secondary">Ignored</span>
            </td>
            <td class="text-end">
              <router-link :to="`/admin/aliases/${a.id}`" class="btn btn-xs btn-outline-secondary me-1">
                <i class="bi bi-pencil"></i>
              </router-link>
              <button class="btn btn-xs btn-outline-danger" @click="confirmDelete(a)">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Delete confirm modal -->
    <div class="modal fade" id="delModal" tabindex="-1">
      <div class="modal-dialog modal-sm">
        <div class="modal-content">
          <div class="modal-header"><h6 class="modal-title">Delete alias?</h6></div>
          <div class="modal-body small" v-if="toDelete">Delete <strong>{{ toDelete.alias || toDelete.address }}</strong>?</div>
          <div class="modal-footer gap-2">
            <button class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-sm btn-danger" @click="doDelete">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { inject } from 'vue'

const addToast = inject('toast', () => {})
const aliases = ref([])
const loading = ref(false)
const filter = ref('')
const toDelete = ref(null)
let delModal = null

const filtered = computed(() =>
  aliases.value.filter(a => {
    const f = filter.value.toLowerCase()
    return !f || (a.address + a.alias + a.agency).toLowerCase().includes(f)
  })
)

onMounted(async () => {
  loading.value = true
  const r = await fetch('/api/capcodes')
  if (r.ok) aliases.value = await r.json()
  loading.value = false
  delModal = new Modal(document.getElementById('delModal'))
})

function confirmDelete(a) {
  toDelete.value = a
  delModal.show()
}

async function doDelete() {
  if (!toDelete.value) return
  const r = await fetch(`/api/capcodes/${toDelete.value.id}`, { method: 'DELETE' })
  if (r.ok) {
    aliases.value = aliases.value.filter(a => a.id !== toDelete.value.id)
    addToast('Alias deleted')
  } else {
    addToast('Failed to delete', 'danger')
  }
  delModal.hide()
  toDelete.value = null
}

async function exportCsv() {
  const r = await fetch('/api/capcodes?format=csv')
  if (!r.ok) return
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'aliases.csv'; a.click()
  URL.revokeObjectURL(url)
}

async function importCsv(e) {
  const file = e.target.files[0]
  if (!file) return
  const text = await file.text()
  const r = await fetch('/api/capcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  })
  if (r.ok) {
    addToast('Import successful')
    loading.value = true
    const r2 = await fetch('/api/capcodes')
    if (r2.ok) aliases.value = await r2.json()
    loading.value = false
  } else {
    addToast('Import failed', 'danger')
  }
  e.target.value = ''
}
</script>

<style scoped>
.btn-xs { padding: 1px 6px; font-size: 0.78rem; }
</style>
