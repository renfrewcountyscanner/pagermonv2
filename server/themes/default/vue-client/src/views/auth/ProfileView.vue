<template>
  <div class="container py-4" style="max-width:520px;">
    <h4 class="fw-bold mb-4"><i class="bi bi-person-circle me-2"></i>My Profile</h4>
    <div v-if="saved" class="alert alert-success py-2">Profile updated.</div>
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
          <div class="mb-4">
            <label class="form-label">Email</label>
            <input v-model="form.email" type="email" class="form-control" required />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Save
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth.js'

const auth = useAuthStore()
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const form = reactive({ givenname: '', surname: '', username: '', email: '' })

onMounted(async () => {
  const uid = auth.user?.id
  if (!uid) return
  const r = await fetch(`/auth/profile/${uid}`)
  if (r.ok) {
    const d = await r.json()
    Object.assign(form, d)
  }
})

async function save() {
  busy.value = true
  saved.value = false
  error.value = ''
  const r = await fetch(`/auth/profile/${auth.user.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  })
  if (r.ok) {
    saved.value = true
    await auth.fetchMe()
  } else {
    const d = await r.json().catch(() => ({}))
    error.value = d.message || 'Failed to save'
  }
  busy.value = false
}
</script>
