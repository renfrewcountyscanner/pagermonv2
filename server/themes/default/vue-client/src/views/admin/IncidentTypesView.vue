<template>
  <div class="container-fluid py-3">
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <h5 class="fw-bold mb-0 me-auto"><i class="bi bi-palette-fill me-2"></i>Call Types</h5>
      <button class="btn btn-sm btn-outline-secondary" @click="scanNew"><i class="bi bi-arrow-repeat me-1"></i>Scan for New Types</button>
    </div>

    <!-- Batch bar -->
    <div v-if="selected.length" class="alert alert-info d-flex align-items-center gap-2 py-2 mb-3" style="background:#1a2a3e;color:#e0e0e0;border-color:#2a4a6e;">
      <span class="me-2 fw-semibold">{{ selected.length }} selected</span>
      <select v-model="batchCategory" class="form-select form-select-sm" style="width:auto;min-width:120px;">
        <option value="">Category…</option>
        <option v-for="c in existingCategories" :key="c" :value="c">{{ c }}</option>
      </select>
      <input v-model="batchColor" type="color" style="height:30px;width:36px;padding:0;" title="Color" />
      <button class="btn btn-sm btn-primary" :disabled="!batchCategory && !batchColor" @click="applyBatch">Apply</button>
      <button class="btn btn-sm btn-outline-secondary ms-auto" @click="selected = []">Clear</button>
    </div>

    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th style="width:1%"><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th>
            <th>Name</th>
            <th>Display Name</th>
            <th>Category</th>
            <th>Color</th>
            <th>Letter</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="8" class="text-center py-3 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td></tr>
          <tr v-else-if="types.length === 0">
            <td colspan="8" class="text-center py-4">
              <i class="bi bi-inbox fs-2 text-muted d-block mb-2"></i>
              <span class="text-muted d-block mb-2">No incident types discovered yet.</span>
              <button class="btn btn-sm btn-primary" @click="scanNew"><i class="bi bi-arrow-repeat me-1"></i>Scan for New Types →</button>
            </td>
          </tr>
          <tr v-for="t in types" :key="t.id">
            <td><input type="checkbox" :value="t.id" v-model="selected" /></td>
            <td class="font-monospace small">{{ t.name }}</td>
            <td>{{ t.display_name }}</td>
            <td><span class="badge text-white" :style="{background: t.color}">{{ t.category }}</span></td>
            <td>
              <span class="d-inline-block rounded-circle border" :style="{background: t.color, width:'18px', height:'18px', verticalAlign:'middle'}"></span>
              <span class="ms-1 small font-monospace">{{ t.color }}</span>
            </td>
            <td>
              <span class="badge text-white fw-bold" :style="{background: t.color, fontSize:'0.9rem', minWidth:'28px'}">{{ t.pin_letter }}</span>
            </td>
            <td>
              <span v-if="t.active" class="badge bg-success">Active</span>
              <span v-else class="badge bg-secondary">Hidden</span>
            </td>
            <td class="text-end">
              <router-link :to="`/admin/incident-types/${t.id}`" class="btn btn-xs btn-outline-secondary me-1"><i class="bi bi-pencil"></i></router-link>
              <button class="btn btn-xs btn-outline-danger" @click="confirmDelete(t)"><i class="bi bi-trash"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="toDelete" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete call type <strong>{{ toDelete.display_name || toDelete.name }}</strong> permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="toDelete = null">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { inject } from 'vue'

const addToast = inject('toast', () => {})
const types = ref([])
const loading = ref(false)
const toDelete = ref(null)
const selected = ref([])
const batchCategory = ref('')
const batchColor = ref('')
const existingCategories = ref(['Fire', 'Alarms', 'Medical', 'Traffic', 'Rescue', 'HazMat', 'Utilities', 'Assist', 'Mutual Aid', 'Other'])

const allSelected = computed({
  get() { return types.value.length > 0 && selected.value.length === types.value.length },
  set(v) { selected.value = v ? types.value.map(t => t.id) : [] }
})

function toggleAll() { allSelected.value = !allSelected.value }

onMounted(async () => {
  loading.value = true
  try { const r = await fetch('/api/incident-types'); if (r.ok) types.value = await r.json() } catch (_) {}
  loading.value = false
})

async function scanNew() {
  loading.value = true
  const r = await fetch('/api/incident-types/refresh', { method: 'POST' })
  if (r.ok) {
    var d = await r.json()
    addToast(`Added ${d.added || 0} new call type(s)`)
    var r2 = await fetch('/api/incident-types')
    if (r2.ok) types.value = await r2.json()
  } else addToast('Scan failed', 'danger')
  loading.value = false
}

function confirmDelete(t) { toDelete.value = t }

async function doDelete() {
  if (!toDelete.value) return
  var r = await fetch(`/api/incident-types/${toDelete.value.id}`, { method: 'DELETE' })
  if (r.ok) { types.value = types.value.filter(t => t.id !== toDelete.value.id); addToast('Deleted') }
  else addToast('Delete failed', 'danger')
  toDelete.value = null
}

async function applyBatch() {
  if (!selected.value.length) return
  var body = { ids: selected.value }
  if (batchCategory.value) body.category = batchCategory.value
  if (batchColor.value) body.color = batchColor.value
  var r = await fetch('/api/incident-types/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (r.ok) {
    addToast(`Updated ${selected.value.length} call type(s)`)
    var r2 = await fetch('/api/incident-types')
    if (r2.ok) types.value = await r2.json()
    selected.value = []
    batchCategory.value = ''
    batchColor.value = ''
  } else addToast('Batch update failed', 'danger')
}
</script>

<style scoped>
.btn-xs { padding: 1px 6px; font-size: 0.78rem; }
</style>
