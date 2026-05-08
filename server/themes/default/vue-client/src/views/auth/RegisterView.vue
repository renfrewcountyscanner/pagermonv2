<template>
  <div class="container py-5" style="max-width:480px;">
    <div class="card shadow-sm">
      <div class="card-body p-4">
        <h4 class="card-title mb-4 text-center fw-bold"><i class="bi bi-person-plus me-2"></i>Register</h4>
        <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
        <form @submit.prevent="doRegister">
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
            <input v-model="form.username" type="text" class="form-control" required autocomplete="username" />
          </div>
          <div class="mb-3">
            <label class="form-label">Email</label>
            <input v-model="form.email" type="email" class="form-control" required />
          </div>
          <div class="mb-4">
            <label class="form-label">Password</label>
            <input v-model="form.password" type="password" class="form-control" required autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-primary w-100" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>
            Create Account
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const error = ref('')
const busy = ref(false)
const form = reactive({ givenname: '', surname: '', username: '', email: '', password: '' })

async function doRegister() {
  busy.value = true
  error.value = ''
  const r = await auth.register(form)
  if (r.ok) {
    router.push('/')
  } else {
    error.value = r.error
    busy.value = false
  }
}
</script>
