<template>
  <div class="container py-4" style="max-width:680px;">
    <div class="d-flex align-items-center gap-2 mb-4">
      <router-link to="/admin/aliases" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i></router-link>
      <h5 class="fw-bold mb-0">{{ isNew ? 'New Alias' : 'Edit Alias' }}</h5>
    </div>

    <div v-if="saved" class="alert alert-success py-2">Saved successfully.</div>
    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

    <div class="card shadow-sm mb-3">
      <div class="card-header fw-semibold small">Basic Info</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Match Type</label>
            <select v-model="form.match_type" class="form-select">
              <option value="address">Capcode / Address</option>
              <option value="apikey">API Key (from Settings)</option>
            </select>
            <div class="form-text">
              <span v-if="form.match_type === 'apikey'">Tags any page posted with the selected API key, regardless of capcode. Wins over address matches.</span>
              <span v-else>Matches against the page's capcode/address.</span>
            </div>
          </div>
          <div v-if="form.match_type !== 'apikey'" class="col-md-6">
            <label class="form-label">Address / Pattern</label>
            <input v-model="form.address" type="text" class="form-control font-monospace" required placeholder="e.g. 1234567 or 123456_" />
            <div class="form-text">Use _ as a wildcard.</div>
          </div>
          <div v-else class="col-md-6">
            <label class="form-label">API Key</label>
            <select v-model="form.address" class="form-select" :disabled="!apiKeyOptions.length">
              <option value="" disabled>{{ apiKeyOptions.length ? 'Select an API key…' : 'No API keys configured' }}</option>
              <option v-for="k in apiKeyOptions" :key="k" :value="k">{{ k }}</option>
            </select>
            <div class="form-text">Defined in Admin → Settings → API Keys.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Alias</label>
            <input v-model="form.alias" type="text" class="form-control" placeholder="Friendly name" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Agency</label>
            <input v-model="form.agency" type="text" class="form-control" placeholder="e.g. OFS, EMS" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Icon (Bootstrap Icons)</label>
            <input v-model="form.icon" type="text" class="form-control" placeholder="e.g. fire" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Color</label>
            <input v-model="form.color" type="color" class="form-control form-control-color" style="height:38px;" />
          </div>
          <div class="col-12">
            <div class="form-check">
              <input v-model="form.ignore" type="checkbox" class="form-check-input" id="ignoreCheck" :true-value="1" :false-value="0" />
              <label class="form-check-label" for="ignoreCheck">Ignore / filter this address</label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Per-alias plugin config -->
    <div v-for="plugin in aliasPlugins" :key="plugin.name" class="card shadow-sm mb-3">
      <div class="card-header fw-semibold small">{{ plugin.name }}</div>
      <div class="card-body">
        <div v-for="field in plugin.aliasConfig" :key="field.name" class="mb-3">
          <label class="form-label">{{ field.label }}</label>
          <input v-if="field.type === 'text'" v-model="pluginconf[plugin.name][field.name]" type="text" class="form-control" :placeholder="field.description" />
          <input v-else-if="field.type === 'number'" v-model="pluginconf[plugin.name][field.name]" type="number" class="form-control" />
          <div v-else-if="field.type === 'checkbox'" class="form-check">
            <input v-model="pluginconf[plugin.name][field.name]" type="checkbox" class="form-check-input" :id="`${plugin.name}-${field.name}`" />
            <label class="form-check-label small text-muted" :for="`${plugin.name}-${field.name}`">{{ field.description }}</label>
          </div>
          <select v-else-if="field.type === 'select'" v-model="pluginconf[plugin.name][field.name]" class="form-select">
            <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.text }}</option>
          </select>
          <div class="form-text" v-if="field.description && field.type !== 'checkbox'">{{ field.description }}</div>
        </div>
      </div>
    </div>

    <div class="d-flex gap-2">
      <button class="btn btn-primary" :disabled="busy" @click="save">
        <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Save
      </button>
      <router-link to="/admin/aliases" class="btn btn-outline-secondary">Cancel</router-link>
      <button v-if="!isNew" class="btn btn-outline-danger ms-auto" @click="showDelConfirm = true">Delete</button>
    </div>

    <div v-if="showDelConfirm" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete this alias permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="showDelConfirm = false">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { inject } from 'vue'

const route = useRoute()
const router = useRouter()
const addToast = inject('toast', () => {})

const id = route.params.id
const isNew = id === 'new'
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const showDelConfirm = ref(false)
const aliasPlugins = ref([])
const pluginconf = reactive({})

const form = reactive({
  address: '', alias: '', agency: '', icon: '', color: '#6c757d', ignore: 0, match_type: 'address',
})
const apiKeyOptions = ref([])

onMounted(async () => {
  // Load plugin definitions + API key names
  try {
    const r = await fetch('/admin/settingsData')
    if (r.ok) {
      const d = await r.json()
      aliasPlugins.value = (d.plugins || []).filter(p => p.aliasConfig && p.aliasConfig.length > 0)
      const keys = (d.settings && d.settings.auth && d.settings.auth.keys) || []
      apiKeyOptions.value = keys.map(k => k.name).filter(Boolean)
    }
  } catch (_) {}

  // Init pluginconf for each plugin
  aliasPlugins.value.forEach(p => {
    pluginconf[p.name] = {}
    p.aliasConfig.forEach(f => { pluginconf[p.name][f.name] = f.type === 'checkbox' ? false : '' })
  })

  if (!isNew) {
    const r = await fetch(`/api/capcodes/${id}`)
    if (r.ok) {
      const d = await r.json()
      Object.assign(form, d)
      // Parse pluginconf from the alias
      let pc = {}
      if (d.pluginconf) {
        try { pc = typeof d.pluginconf === 'string' ? JSON.parse(d.pluginconf) : d.pluginconf } catch (_) {}
      }
      aliasPlugins.value.forEach(p => {
        pluginconf[p.name] = pc[p.name] || {}
      })
    }
  }
})

async function save() {
  busy.value = true; saved.value = false; error.value = ''
  const payload = { ...form, pluginconf: JSON.stringify(pluginconf) }
  // Both create and update go through POST: /api/capcodes for create, /api/capcodes/:id for update.
  const url = isNew ? '/api/capcodes' : `/api/capcodes/${id}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (r.ok) {
    if (isNew) {
      const d = await r.json()
      router.replace(`/admin/aliases/${d.id || d}`)
    }
    saved.value = true
    addToast('Alias saved')
  } else {
    error.value = 'Failed to save. Check the fields and try again.'
    addToast('Save failed', 'danger')
  }
  busy.value = false
}

async function doDelete() {
  const r = await fetch(`/api/capcodes/${id}`, { method: 'DELETE' })
  if (r.ok) {
    addToast('Alias deleted')
    router.push('/admin/aliases')
  } else {
    addToast('Delete failed', 'danger')
  }
}
</script>
