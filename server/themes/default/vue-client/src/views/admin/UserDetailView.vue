<template>
  <div class="container py-4" style="max-width:520px;">
    <div class="d-flex align-items-center gap-2 mb-4">
      <router-link to="/admin/users" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i></router-link>
      <h5 class="fw-bold mb-0">{{ isNew ? 'New User' : 'Edit User' }}</h5>
    </div>

    <div v-if="saved" class="alert alert-success py-2">Saved.</div>
    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

    <div class="card shadow-sm">
      <div class="card-body p-4">
        <form @submit.prevent="save">
          <div class="row g-3 mb-3">
            <div class="col">
              <label class="form-label">First name</label>
              <input v-model="form.givenname" type="text" class="form-control" required />
            </div>
            <div class="col">
              <label class="form-label">Last name</label>
              <input v-model="form.surname" type="text" class="form-control" />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input v-model="form.username" type="text" class="form-control" required />
          </div>
          <div class="mb-3">
            <label class="form-label">Email</label>
            <input v-model="form.email" type="email" class="form-control" />
          </div>
          <div v-if="isNew" class="mb-3">
            <label class="form-label">Password</label>
            <input v-model="form.password" type="password" class="form-control" required autocomplete="new-password" />
          </div>
          <div class="mb-3">
            <label class="form-label">Role</label>
            <select v-model="form.role" class="form-select">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="mb-4">
            <label class="form-label">Status</label>
            <select v-model="form.status" class="form-select">
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary" :disabled="busy">
              <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Save
            </button>
            <router-link to="/admin/users" class="btn btn-outline-secondary">Cancel</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
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
const form = reactive({ givenname: '', surname: '', username: '', email: '', role: 'user', status: 'active', password: '' })

onMounted(async () => {
  if (!isNew) {
    const r = await fetch(`/api/user/${id}`)
    if (r.ok) Object.assign(form, await r.json())
  }
})

async function save() {
  busy.value = true; saved.value = false; error.value = ''
  const url = isNew ? '/api/user' : `/api/user/${id}`
  const payload = { ...form }
  if (!isNew) delete payload.password
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (r.ok) {
    saved.value = true
    addToast('User saved')
    if (isNew) router.push('/admin/users')
  } else {
    const d = await r.json().catch(() => ({}))
    error.value = d.error || 'Save failed'
    addToast('Save failed', 'danger')
  }
  busy.value = false
}
</script>
