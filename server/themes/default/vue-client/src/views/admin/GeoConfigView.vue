<template>
  <div class="container-fluid py-3">
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <h5 class="fw-bold mb-0 me-auto"><i class="bi bi-geo-alt-fill me-2"></i>Location Config</h5>
      <router-link to="/admin/geo-config/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>New Location</router-link>
    </div>

    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th>Source (Agency)</th>
            <th>Alias</th>
            <th>City</th>
            <th>State</th>
            <th>Country</th>
            <th>Priority</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="text-center py-3 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td></tr>
          <tr v-else-if="items.length === 0">
            <td colspan="7" class="text-center py-4">
              <i class="bi bi-inbox fs-2 text-muted d-block mb-2"></i>
              <span class="text-muted d-block mb-2">No location context configured.</span>
              <span class="text-muted small d-block mb-2">Add entries to improve geocoding accuracy by biasing Nominatim lookups.</span>
              <router-link to="/admin/geo-config/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>Add location →</router-link>
            </td>
          </tr>
          <tr v-for="a in items" :key="a.id">
            <td class="fw-semibold">{{ a.sent_by }}</td>
            <td>{{ a.alias_pattern || '—' }}</td>
            <td>{{ a.city }}</td>
            <td>{{ a.state }}</td>
            <td>{{ a.country }}</td>
            <td>{{ a.priority }}</td>
            <td class="text-end">
              <router-link :to="`/admin/geo-config/${a.id}`" class="btn btn-xs btn-outline-secondary me-1"><i class="bi bi-pencil"></i></router-link>
              <button class="btn btn-xs btn-outline-danger" @click="confirmDelete(a)"><i class="bi bi-trash"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="toDelete" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete location config for <strong>{{ toDelete.sent_by }}</strong> permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="toDelete = null">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { inject } from 'vue'

const addToast = inject('toast', () => {})
const items = ref([])
const loading = ref(false)
const toDelete = ref(null)

onMounted(async () => {
  loading.value = true
  try { const r = await fetch('/api/geo-config'); if (r.ok) items.value = await r.json() } catch (_) {}
  loading.value = false
})

function confirmDelete(a) { toDelete.value = a }

async function doDelete() {
  if (!toDelete.value) return
  const r = await fetch(`/api/geo-config/${toDelete.value.id}`, { method: 'DELETE' })
  if (r.ok) { items.value = items.value.filter(a => a.id !== toDelete.value.id); addToast('Deleted') }
  else addToast('Delete failed', 'danger')
  toDelete.value = null
}
</script>

<style scoped>.btn-xs { padding: 1px 6px; font-size: 0.78rem; }</style>
