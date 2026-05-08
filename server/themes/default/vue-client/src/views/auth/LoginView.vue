<template>
  <div class="container py-5" style="max-width:420px;">
    <div class="card shadow-sm">
      <div class="card-body p-4">
        <h4 class="card-title mb-4 text-center fw-bold"><i class="bi bi-shield-lock me-2"></i>Sign In</h4>
        <div v-if="error" class="alert alert-danger alert-sm py-2">{{ error }}</div>
        <form @submit.prevent="doLogin">
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input v-model="username" type="text" class="form-control" required autofocus autocomplete="username" />
          </div>
          <div class="mb-4">
            <label class="form-label">Password</label>
            <input v-model="password" type="password" class="form-control" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary w-100" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>
            Sign In
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

import { onMounted } from 'vue'
const router = useRouter()
const auth = useAuthStore()

onMounted(() => {
  if (auth.authenticated) router.replace(auth.user?.role === 'admin' ? '/admin' : '/')
})

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function doLogin() {
  busy.value = true
  error.value = ''
  const r = await auth.login(username.value, password.value)
  if (r.ok) {
    router.push(r.redirect || '/')
  } else {
    error.value = r.error
    busy.value = false
  }
}
</script>
