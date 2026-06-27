<template>
  <div class="container-fluid py-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <h5 class="fw-bold mb-0 me-auto"><i class="bi bi-people-fill me-2"></i>Users</h5>
      <router-link to="/admin/users/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>New User</router-link>
    </div>

    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead>
          <tr>
            <th>Username</th>
            <th class="hide-mobile">Name</th>
            <th class="hide-mobile">Email</th>
            <th>Role</th>
            <th>Status</th>
            <th class="hide-mobile">Last Login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="text-center py-3 text-muted"><i class="bi bi-arrow-clockwise spin me-2"></i>Loading…</td></tr>
          <tr v-for="u in users" :key="u.id">
            <td class="fw-semibold">{{ u.username }}</td>
            <td class="hide-mobile">{{ u.givenname }} {{ u.surname }}</td>
            <td class="hide-mobile small text-muted">{{ u.email }}</td>
            <td><span class="badge" :class="u.role === 'admin' ? 'bg-danger' : 'bg-secondary'">{{ u.role }}</span></td>
            <td><span class="badge" :class="u.status === 'active' ? 'bg-success' : 'bg-warning text-dark'">{{ u.status }}</span></td>
            <td class="hide-mobile small text-muted">{{ formatDate(u.lastlogondate) }}</td>
            <td class="text-end">
              <router-link :to="`/admin/users/${u.id}`" class="btn btn-xs btn-outline-secondary"><i class="bi bi-pencil"></i></router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const users = ref([])
const loading = ref(false)

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString()
}

onMounted(async () => {
  loading.value = true
  try { const r = await fetch('/api/user'); if (r.ok) users.value = await r.json() } catch (_) {}
  loading.value = false
})
</script>

<style scoped>
.btn-xs { padding: 1px 6px; font-size: 0.78rem; }
</style>
