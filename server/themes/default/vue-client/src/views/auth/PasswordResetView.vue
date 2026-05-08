<template>
  <div class="container py-4" style="max-width:420px;">
    <h4 class="fw-bold mb-4"><i class="bi bi-key me-2"></i>Reset Password</h4>
    <div v-if="success" class="alert alert-success py-2">Password updated successfully.</div>
    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
    <div class="card shadow-sm">
      <div class="card-body p-4">
        <form @submit.prevent="doReset">
          <div class="mb-4">
            <label class="form-label">New Password</label>
            <input v-model="password" type="password" class="form-control" required autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-primary w-100" :disabled="busy">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>Update Password
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const password = ref('')
const busy = ref(false)
const success = ref(false)
const error = ref('')

async function doReset() {
  busy.value = true
  success.value = false
  error.value = ''
  const r = await fetch('/auth/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password.value }),
  })
  const d = await r.json().catch(() => ({}))
  if (r.ok && d.status === 'ok') {
    success.value = true
    password.value = ''
  } else {
    error.value = d.error || 'Failed to update password'
  }
  busy.value = false
}
</script>
