<template>
  <div class="container py-4" style="max-width:680px;">
    <div class="d-flex align-items-center gap-2 mb-4">
      <router-link to="/admin/geo-config" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i></router-link>
      <h5 class="fw-bold mb-0">{{ isNew ? 'New Location Config' : 'Edit Location Config' }}</h5>
    </div>

    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

    <div class="card shadow-sm mb-3">
      <div class="card-body p-4">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Source (Agency)</label>
            <input v-model="form.sent_by" type="text" class="form-control" required placeholder="e.g. Ottawa Fire" />
            <div class="form-text">Must match the source field sent by the POCSAG reader.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Alias Pattern (optional)</label>
            <input v-model="form.alias_pattern" type="text" class="form-control" placeholder="e.g. TERRYFOX" />
            <div class="form-text">Leave blank to apply to all aliases for this source.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label">City</label>
            <input v-model="form.city" type="text" class="form-control" placeholder="e.g. Ottawa" />
          </div>
          <div class="col-md-6">
            <label class="form-label">County</label>
            <input v-model="form.county" type="text" class="form-control" placeholder="e.g. Ottawa-Carleton" />
          </div>
          <div class="col-md-4">
            <label class="form-label">State / Province</label>
            <input v-model="form.state" type="text" class="form-control" placeholder="e.g. ON" maxlength="8" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Country</label>
            <input v-model="form.country" type="text" class="form-control" placeholder="e.g. CA" maxlength="4" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Priority</label>
            <input v-model.number="form.priority" type="number" class="form-control" min="1" max="100" />
            <div class="form-text">Higher = more specific match wins.</div>
          </div>
          <div class="col-12 mt-2">
            <label class="form-label fw-semibold small">Bounding Box</label>
            <div class="form-text mb-2">Geocoded results outside this area are rejected and retried. Leave at 0 to disable.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Min Lat</label>
            <input v-model.number="form.bounds_min_lat" type="number" step="any" class="form-control" placeholder="e.g. 45.15" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Max Lat</label>
            <input v-model.number="form.bounds_max_lat" type="number" step="any" class="form-control" placeholder="e.g. 45.55" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Min Lng</label>
            <input v-model.number="form.bounds_min_lng" type="number" step="any" class="form-control" placeholder="e.g. -76.10" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Max Lng</label>
            <input v-model.number="form.bounds_max_lng" type="number" step="any" class="form-control" placeholder="e.g. -75.45" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Fallback Latitude</label>
            <input v-model.number="form.fallback_lat" type="number" step="any" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Fallback Longitude</label>
            <input v-model.number="form.fallback_lng" type="number" step="any" class="form-control" />
          </div>
          <div class="col-12">
            <div class="form-check">
              <input v-model="form.active" type="checkbox" class="form-check-input" id="activeCheck" :true-value="1" :false-value="0" />
              <label class="form-check-label" for="activeCheck">Active</label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex gap-2">
      <button class="btn btn-primary" :disabled="busy" @click="save">
        <template v-if="busy"><span class="spinner-border spinner-border-sm me-2"></span>Saving…</template>
        <template v-else-if="justSaved"><i class="bi bi-check-lg me-1"></i>Saved</template>
        <template v-else>Save</template>
      </button>
      <router-link to="/admin/geo-config" class="btn btn-outline-secondary">Cancel</router-link>
      <button v-if="!isNew" class="btn btn-outline-danger ms-auto" @click="showDelConfirm = true">Delete</button>
    </div>
    <div v-if="showDelConfirm" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="showDelConfirm = false">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { inject } from 'vue'

const route = useRoute(); const router = useRouter()
const addToast = inject('toast', () => {})
const id = route.params.id; const isNew = id === 'new'
const busy = ref(false); const justSaved = ref(false); const error = ref(''); const showDelConfirm = ref(false)
const form = reactive({ sent_by: '', alias_pattern: '', city: '', county: '', state: '', country: 'CA', fallback_lat: null, fallback_lng: null, bounds_min_lat: null, bounds_max_lat: null, bounds_min_lng: null, bounds_max_lng: null, active: 1, priority: 5 })

onMounted(async () => {
  if (!isNew) {
    try { const r = await fetch('/api/geo-config/' + id); if (r.ok) Object.assign(form, await r.json()) } catch (_) {}
  }
})

async function save() {
  busy.value = true; justSaved.value = false; error.value = ''
  const url = isNew ? '/api/geo-config' : `/api/geo-config/${id}`
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
  if (r.ok) { justSaved.value = true; setTimeout(function() { justSaved.value = false }, 2000); addToast('Saved'); if (isNew) { const d = await r.json(); router.replace('/admin/geo-config/' + d.id) } }
  else { error.value = 'Save failed'; addToast('Save failed', 'danger') }
  busy.value = false
}

async function doDelete() {
  const r = await fetch(`/api/geo-config/${id}`, { method: 'DELETE' })
  if (r.ok) { addToast('Deleted'); router.push('/admin/geo-config') }
  else addToast('Delete failed', 'danger')
}
</script>
