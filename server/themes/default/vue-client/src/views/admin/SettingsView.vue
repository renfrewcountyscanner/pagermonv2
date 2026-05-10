<template>
  <div class="container py-4" style="max-width:780px;">
    <h5 class="fw-bold mb-4"><i class="bi bi-gear-fill me-2"></i>Settings</h5>

    <div v-if="saved" class="alert alert-success py-2">Settings saved. Some changes require a server restart.</div>
    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
    <div v-if="loading" class="text-center py-5 text-muted"><i class="bi bi-arrow-clockwise spin fs-3"></i></div>

    <template v-if="!loading && config">
      <!-- Global -->
      <div class="card shadow-sm mb-3">
        <div class="card-header fw-semibold small">Global</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Monitor Name</label>
              <input v-model="config.global.monitorName" type="text" class="form-control" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Theme</label>
              <select v-model="config.global.theme" class="form-select">
                <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Log Level</label>
              <select v-model="config.global.loglevel" class="form-select">
                <option v-for="l in ['debug','info','warn','error']" :key="l" :value="l">{{ l }}</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label">Search Location</label>
              <select v-model="config.global.searchLocation" class="form-select">
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label">Font Awesome Kit ID</label>
              <input v-model="config.global.faKey" type="text" class="form-control" />
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div class="card shadow-sm mb-3">
        <div class="card-header fw-semibold small">Messages</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Default Limit</label>
              <input v-model.number="config.messages.defaultLimit" type="number" class="form-control" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Max Limit</label>
              <input v-model.number="config.messages.maxLimit" type="number" class="form-control" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Rotate Days</label>
              <input v-model.number="config.messages.rotateDays" type="number" class="form-control" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Dedup Window (s)</label>
              <input v-model.number="config.messages.duplicateTime" type="number" class="form-control" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Dedup Limit</label>
              <input v-model.number="config.messages.duplicateLimit" type="number" class="form-control" />
            </div>
            <div class="col-12 d-flex flex-wrap gap-3">
              <div class="form-check">
                <input v-model="config.messages.duplicateFiltering" type="checkbox" class="form-check-input" id="dupFilter" />
                <label class="form-check-label" for="dupFilter">Duplicate Filtering</label>
              </div>
              <div class="form-check">
                <input v-model="config.messages.pdwMode" type="checkbox" class="form-check-input" id="pdwMode" />
                <label class="form-check-label" for="pdwMode">PDW Mode</label>
              </div>
              <div class="form-check">
                <input v-model="config.messages.HideCapcode" type="checkbox" class="form-check-input" id="hideCapcode" />
                <label class="form-check-label" for="hideCapcode">Hide Capcode</label>
              </div>
              <div class="form-check">
                <input v-model="config.messages.HideSource" type="checkbox" class="form-check-input" id="hideSource" />
                <label class="form-check-label" for="hideSource">Hide Source</label>
              </div>
              <div class="form-check">
                <input v-model="config.messages.rotationEnabled" type="checkbox" class="form-check-input" id="rotation" />
                <label class="form-check-label" for="rotation">Message Rotation</label>
              </div>
              <div class="form-check">
                <input v-model="config.messages.apiSecurity" type="checkbox" class="form-check-input" id="apiSec" />
                <label class="form-check-label" for="apiSec">API Security</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Deduplication -->
      <div class="card shadow-sm mb-3">
        <div class="card-header d-flex align-items-center gap-2">
          <span class="fw-semibold small flex-grow-1">Notification Deduplication</span>
          <div class="form-check form-switch mb-0 ms-3">
            <input class="form-check-input" type="checkbox" role="switch" id="dedupEnable"
              v-model="dedup.enable" />
            <label class="form-check-label" for="dedupEnable">Enable</label>
          </div>
        </div>
        <div class="card-body" v-if="dedup.enable">
          <p class="text-muted small mb-3">
            Prevents duplicate dispatch pages from being forwarded to all notification platforms
            (e.g. webhooks). Same message text received within the window is forwarded only once,
            even if paged to multiple units with different capcodes.
          </p>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Window (minutes)</label>
              <input v-model.number="dedup.windowMinutes" type="number" min="1" max="1440" class="form-control" />
              <div class="form-text">Identical messages within this window are suppressed. Default: 15</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Auth -->
      <div class="card shadow-sm mb-3">
        <div class="card-header fw-semibold small">Auth</div>
        <div class="card-body">
          <div class="form-check mb-3">
            <input v-model="config.auth.registration" type="checkbox" class="form-check-input" id="regEnabled" />
            <label class="form-check-label" for="regEnabled">Allow public registration</label>
            <div class="form-text">Restart the server after changing this.</div>
          </div>

          <label class="form-label fw-semibold small mt-2">API Keys</label>
          <div class="form-text mb-2">Sent as the <code>apikey</code> header. All API keys have admin access.</div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-2">
              <thead>
                <tr>
                  <th style="width:30%">Name</th>
                  <th>Key</th>
                  <th style="width:1%"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(k, i) in apiKeys" :key="i">
                  <td>
                    <input v-model="k.name" type="text" class="form-control form-control-sm" placeholder="Name" />
                  </td>
                  <td>
                    <div class="input-group input-group-sm">
                      <input v-model="k.key" type="text" class="form-control font-monospace" placeholder="Key" readonly />
                      <button v-if="!k.key" type="button" class="btn btn-outline-secondary" @click="generateApiKey(i)">Generate</button>
                      <button v-else type="button" class="btn btn-outline-secondary" @click="copyKey(k.key)" title="Copy">
                        <i class="bi bi-clipboard"></i>
                      </button>
                    </div>
                  </td>
                  <td>
                    <button type="button" class="btn btn-sm btn-outline-danger" @click="removeApiKey(i)" title="Remove">
                      <i class="bi bi-x-lg"></i>
                    </button>
                  </td>
                </tr>
                <tr v-if="!apiKeys.length">
                  <td colspan="3" class="text-muted small text-center py-3">No API keys configured.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-sm btn-outline-success" @click="addApiKey">
            <i class="bi bi-plus-lg me-1"></i>Add Key
          </button>
        </div>
      </div>

      <!-- Plugins -->
      <div v-for="plugin in plugins" :key="plugin.name" class="card shadow-sm mb-3">
        <div class="card-header d-flex align-items-center gap-2">
          <span class="fw-semibold small flex-grow-1">{{ plugin.name }}</span>
          <span class="text-muted small">{{ plugin.description }}</span>
          <div class="form-check form-switch mb-0 ms-3">
            <input class="form-check-input" type="checkbox" role="switch"
              :id="`plugin-enable-${plugin.name}`"
              v-model="pluginConfig(plugin.name).enable" />
            <label class="form-check-label" :for="`plugin-enable-${plugin.name}`">Enable</label>
          </div>
        </div>
        <div class="card-body" v-if="pluginConfig(plugin.name).enable && plugin.config && plugin.config.length">
          <div v-for="field in plugin.config" :key="field.name" class="mb-3">
            <label class="form-label small fw-semibold">{{ field.label }}</label>
            <input v-if="field.type === 'text'" v-model="pluginConfig(plugin.name)[field.name]"
              type="text" class="form-control form-control-sm" :placeholder="field.description || ''" />
            <input v-else-if="field.type === 'number'" v-model.number="pluginConfig(plugin.name)[field.name]"
              type="number" class="form-control form-control-sm" />
            <textarea v-else-if="field.type === 'textarea'" v-model="pluginConfig(plugin.name)[field.name]"
              class="form-control form-control-sm" rows="3"></textarea>
            <div v-else-if="field.type === 'checkbox'" class="form-check">
              <input v-model="pluginConfig(plugin.name)[field.name]" type="checkbox"
                class="form-check-input" :id="`${plugin.name}-${field.name}`" />
              <label class="form-check-label small text-muted" :for="`${plugin.name}-${field.name}`">{{ field.description }}</label>
            </div>
            <select v-else-if="field.type === 'select'" v-model="pluginConfig(plugin.name)[field.name]"
              class="form-select form-select-sm">
              <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.text }}</option>
            </select>
            <div v-if="field.description && field.type !== 'checkbox'" class="form-text">{{ field.description }}</div>
          </div>
        </div>
      </div>

      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" :disabled="busy" @click="saveSettings">
          <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Save Settings
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, inject } from 'vue'

const addToast = inject('toast', () => {})
const loading = ref(true)
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const config = ref(null)
const plugins = ref([])
const themes = ref([])

const dedup = computed({
  get() {
    if (!config.value) return { enable: false, windowMinutes: 15 }
    return config.value.messages?.deduplication || { enable: false, windowMinutes: 15 }
  },
  set(v) {
    if (!config.value.messages) config.value.messages = {}
    config.value.messages.deduplication = v
  }
})

const apiKeys = computed({
  get() {
    if (!config.value) return []
    return config.value.auth?.keys || []
  },
  set(v) {
    if (!config.value.auth) config.value.auth = {}
    config.value.auth.keys = v
  }
})

function pluginConfig(name) {
  if (!config.value.plugins) config.value.plugins = {}
  if (!config.value.plugins[name]) config.value.plugins[name] = { enable: false }
  return config.value.plugins[name]
}

function generateApiKey(index) {
  const u1 = (crypto.randomUUID?.() || fallbackUuid()).replace(/-/g, '')
  const u2 = (crypto.randomUUID?.() || fallbackUuid()).replace(/-/g, '')
  const k1 = parseInt(u1.slice(0, 15), 16).toString(36)
  const k2 = parseInt(u2.slice(0, 15), 16).toString(36)
  apiKeys.value[index].key = (k1 + k2).toUpperCase()
}

function fallbackUuid() {
  const a = new Uint8Array(16); crypto.getRandomValues(a)
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('')
}

function addApiKey() {
  apiKeys.value.push({ name: '', key: '' })
}

function removeApiKey(index) {
  if (!confirm('Remove this API key? It cannot be restored after saving.')) return
  apiKeys.value.splice(index, 1)
}

function copyKey(key) {
  navigator.clipboard?.writeText(key)
  addToast('Key copied to clipboard')
}

onMounted(async () => {
  try {
    const r = await fetch('/admin/settingsData')
    if (r.ok) {
      const d = await r.json()
      config.value = d.settings
      plugins.value = d.plugins || []
      themes.value = d.themes || []

      // Initialize defaults to avoid state mutation during render
      if (!config.value.messages) config.value.messages = {}
      if (!config.value.messages.deduplication) config.value.messages.deduplication = { enable: false, windowMinutes: 15 }
      if (!config.value.auth) config.value.auth = {}
      if (!Array.isArray(config.value.auth.keys)) config.value.auth.keys = []
      if (!config.value.plugins) config.value.plugins = {}
      plugins.value.forEach(p => {
        if (!config.value.plugins[p.name]) config.value.plugins[p.name] = { enable: false }
      })
    }
  } catch (e) {
    error.value = 'Failed to load settings'
  }
  loading.value = false
})

async function saveSettings() {
  busy.value = true; saved.value = false; error.value = ''
  try {
    const r = await fetch('/admin/settingsData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value),
    })
    if (r.ok) {
      saved.value = true
      addToast('Settings saved')
    } else {
      error.value = 'Save failed'
      addToast('Save failed', 'danger')
    }
  } catch (e) {
    error.value = e.message
  }
  busy.value = false
}
</script>
