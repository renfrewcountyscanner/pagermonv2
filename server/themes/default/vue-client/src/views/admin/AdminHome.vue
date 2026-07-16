<template>
  <div class="container py-4">
    <h4 class="fw-bold mb-4"><i class="bi bi-shield-lock-fill me-2"></i>Admin Panel</h4>

    <!-- Quick Stats Row -->
    <div class="row g-3 mb-4" v-if="stats">
      <div class="col-md-3 col-6">
        <div class="card text-center p-3 h-100" :class="stats.geocoderEnabled ? 'border-success' : 'border-danger'" style="border-width:2px">
          <div class="fs-4" :class="stats.geocoderEnabled ? 'text-success' : 'text-danger'">
            <i :class="stats.geocoderEnabled ? 'bi bi-check-circle-fill' : 'bi bi-x-circle-fill'"></i>
          </div>
          <div class="fw-semibold small mt-1">Geocoder</div>
          <div class="text-muted" style="font-size:0.7rem">{{ stats.geocoderEnabled ? 'Active' : 'Disabled' }}</div>
          <router-link v-if="!stats.geocoderEnabled" to="/admin/settings" class="btn btn-xs btn-outline-success mt-2">Enable</router-link>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="card text-center p-3 h-100 border-info" style="border-width:2px">
          <div class="fs-4 text-info"><i class="bi bi-geo-alt-fill"></i></div>
          <div class="fw-semibold small mt-1">{{ stats.callsToday }}</div>
          <div class="text-muted" style="font-size:0.7rem">Calls mapped today</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="card text-center p-3 h-100 border-secondary" style="border-width:2px">
          <div class="fs-4 text-secondary"><i class="bi bi-envelope-fill"></i></div>
          <div class="fw-semibold small mt-1">{{ stats.messagesToday }}</div>
          <div class="text-muted" style="font-size:0.7rem">Pages today</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="card text-center p-3 h-100 border-warning" style="border-width:2px">
          <div class="fs-4 text-warning"><i class="bi bi-palette-fill"></i></div>
          <div class="fw-semibold small mt-1">{{ stats.activeTypes }}</div>
          <div class="text-muted" style="font-size:0.7rem">Active call types</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="card text-center p-3 h-100" :class="stats.outbox?.failed ? 'border-danger' : 'border-success'" style="border-width:2px">
          <div class="fs-4" :class="stats.outbox?.failed ? 'text-danger' : 'text-success'"><i class="bi bi-send-check-fill"></i></div>
          <div class="fw-semibold small mt-1">{{ stats.outbox?.failed || 0 }}</div>
          <div class="text-muted" style="font-size:0.7rem">Failed deliveries</div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4" v-if="stats">
      <section class="col-lg-5">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center"><span class="fw-semibold small">Reader activity</span><span class="text-muted small">Last seen</span></div>
          <div class="list-group list-group-flush" v-if="stats.sources?.length">
            <div v-for="source in stats.sources" :key="source.source" class="list-group-item d-flex justify-content-between align-items-center">
              <span class="font-monospace small">{{ source.source }}</span>
              <span class="text-muted small">{{ formatTime(source.lastSeen) }} · {{ source.messages }}</span>
            </div>
          </div>
          <div v-else class="card-body text-muted small">No reader activity recorded today.</div>
        </div>
      </section>
      <section class="col-lg-7">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center"><span class="fw-semibold small">Plugin delivery queue</span><button class="btn btn-sm btn-outline-secondary" @click="loadOutbox"><i class="bi bi-arrow-clockwise"></i></button></div>
          <div class="table-responsive">
            <table class="table table-sm mb-0 align-middle">
              <thead><tr><th>Status</th><th>Message</th><th>Attempts</th><th></th></tr></thead>
              <tbody>
                <tr v-for="job in outbox" :key="job.id"><td><span class="badge" :class="statusClass(job.status)">{{ job.status }}</span></td><td class="small text-truncate" style="max-width:250px">{{ job.message || 'Message removed' }}</td><td class="small">{{ job.attempts }}</td><td><button v-if="job.status === 'failed'" class="btn btn-sm btn-outline-warning" @click="retryJob(job)" title="Retry"><i class="bi bi-arrow-repeat"></i></button></td></tr>
                <tr v-if="!outbox.length"><td colspan="4" class="text-muted text-center small py-3">No queued or failed delivery work.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <div class="row g-3">
      <div class="col-6 col-md-3">
        <router-link to="/admin/aliases" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-card-list fs-1 mb-2 text-primary"></i>
            <div class="fw-semibold">Aliases</div>
            <div class="text-muted small">Manage capcode aliases</div>
          </div>
        </router-link>
      </div>
      <div class="col-6 col-md-3">
        <router-link to="/admin/users" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-people-fill fs-1 mb-2 text-success"></i>
            <div class="fw-semibold">Users</div>
            <div class="text-muted small">Manage user accounts</div>
          </div>
        </router-link>
      </div>
      <div class="col-6 col-md-3">
        <router-link to="/admin/geo-config" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-geo-alt-fill fs-1 mb-2 text-danger"></i>
            <div class="fw-semibold">Location Config</div>
            <div class="text-muted small">Geocoding location context</div>
          </div>
        </router-link>
      </div>
      <div class="col-6 col-md-3">
        <router-link to="/admin/incident-types" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-palette-fill fs-1 mb-2 text-warning"></i>
            <div class="fw-semibold">Call Types</div>
            <div class="text-muted small">Incident types &amp; colors</div>
          </div>
        </router-link>
      </div>
      <div class="col-6 col-md-3">
        <router-link to="/admin/settings" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-gear-fill fs-1 mb-2 text-secondary"></i>
            <div class="fw-semibold">Settings</div>
            <div class="text-muted small">System &amp; plugin config</div>
          </div>
        </router-link>
      </div>
      <div class="col-6 col-md-3">
        <router-link to="/" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-envelope-fill fs-1 mb-2 text-info"></i>
            <div class="fw-semibold">Messages</div>
            <div class="text-muted small">Live message feed</div>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const stats = ref(null)
const outbox = ref([])

function formatTime(ts) {
  return ts ? new Date(ts * 1000).toLocaleString() : 'Never'
}

function statusClass(status) {
  return status === 'failed' ? 'text-bg-danger' : status === 'completed' ? 'text-bg-success' : 'text-bg-warning'
}

async function loadOutbox() {
  try {
    const r = await fetch('/api/admin/operations/outbox?limit=8')
    if (r.ok) outbox.value = await r.json()
  } catch (_) {}
}

async function retryJob(job) {
  try {
    const r = await fetch(`/api/admin/operations/outbox/${job.id}/retry`, { method: 'POST' })
    if (r.ok) await loadOutbox()
  } catch (_) {}
}

onMounted(async () => {
  try {
    var r = await fetch('/api/admin-stats')
    if (r.ok) {
      var d = await r.json()
      var r2 = await fetch('/admin/settingsData')
      if (r2.ok) {
        var s = await r2.json()
        var plugins = s.settings.plugins || {}
        d.geocoderEnabled = !!(plugins.Geocoder && plugins.Geocoder.enable)
      } else {
        d.geocoderEnabled = false
      }
      stats.value = d
      await loadOutbox()
    }
  } catch (_) {}
})
</script>
