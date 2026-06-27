<template>
  <div class="container py-4" style="max-width:640px;">
    <div class="d-flex align-items-center gap-2 mb-4">
      <router-link to="/admin/incident-types" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i></router-link>
      <h5 class="fw-bold mb-0">{{ isNew ? 'New Call Type' : 'Edit Call Type' }}</h5>
    </div>

    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

    <div class="card shadow-sm mb-3">
      <div class="card-body p-4">
        <div class="row g-3 mb-3">
          <div class="col-md-12">
            <label class="form-label">Raw Name</label>
            <input :value="form.name" type="text" class="form-control font-monospace" disabled />
            <div class="form-text">Auto-discovered from messages. Cannot be changed.</div>
          </div>
          <div class="col-md-12">
            <label class="form-label">Display Name</label>
            <input v-model="form.display_name" type="text" class="form-control" placeholder="Human-readable name" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Category</label>
            <div class="d-flex gap-2">
              <select v-model="form.category" class="form-select">
                <option v-for="c in existingCategories" :key="c" :value="c">{{ c }}</option>
                <option value="__new__">+ New Category...</option>
              </select>
              <input v-if="form.category === '__new__' || addingNewCat" v-model="newCategory" type="text" class="form-control" placeholder="Enter new category" @keyup.enter="addNewCategory" />
            </div>
            <div class="form-text">Group calls under this category in the map filter bar.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Color</label>
            <div class="d-flex gap-2 align-items-center">
              <input v-model="form.color" type="color" class="form-control form-control-color" style="height:38px;width:48px;" />
              <input v-model="form.color" type="text" class="form-control font-monospace" style="max-width:90px;" maxlength="7" />
              <span class="rounded-circle border" :style="{background: form.color, width:'24px', height:'24px', flexShrink:0}"></span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Pin Letter</label>
            <div class="d-flex gap-2 align-items-center">
              <input v-model="form.pin_letter" type="text" class="form-control" maxlength="3" style="max-width:64px;" />
              <span class="badge text-white fw-bold" :style="{background: form.color, fontSize:'0.9rem', minWidth:'28px', height:'24px', lineHeight:'18px'}">{{ form.pin_letter || '?' }}</span>
            </div>
            <div class="form-text">1-3 chars shown on map pin.</div>
          </div>
          <div class="col-12">
            <div class="form-check">
              <input v-model="form.active" type="checkbox" class="form-check-input" id="activeCheck" :true-value="1" :false-value="0" />
              <label class="form-check-label" for="activeCheck">Active (visible on map)</label>
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
      <router-link to="/admin/incident-types" class="btn btn-outline-secondary">Cancel</router-link>
      <button v-if="!isNew" class="btn btn-outline-danger ms-auto" @click="showDelConfirm = true">Delete</button>
    </div>

    <div v-if="showDelConfirm" class="alert alert-danger mt-3 d-flex align-items-center gap-3">
      Delete this call type permanently?
      <button class="btn btn-sm btn-danger ms-2" @click="doDelete">Yes, delete</button>
      <button class="btn btn-sm btn-secondary" @click="showDelConfirm = false">Cancel</button>
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
const justSaved = ref(false)
const error = ref('')
const showDelConfirm = ref(false)
const newCategory = ref('')
const addingNewCat = ref(false)
const existingCategories = ref(['Fire', 'Alarms', 'Medical', 'Traffic', 'Rescue', 'HazMat', 'Utilities', 'Assist', 'Mutual Aid', 'Other'])

const form = reactive({
  name: '',
  display_name: '',
  category: 'Other',
  color: '#6c757d',
  pin_letter: 'O',
  active: 1,
})

function addNewCategory() {
  var nc = newCategory.value.trim()
  if (nc && existingCategories.value.indexOf(nc) < 0) {
    existingCategories.value.unshift(nc)
    form.category = nc
  }
  newCategory.value = ''
  addingNewCat.value = false
}

onMounted(async () => {
  if (!isNew) {
    try {
      const r = await fetch('/api/incident-types')
      if (r.ok) {
        const all = await r.json()
        var t = all.find(t => t.id == id)
        if (t) { Object.assign(form, t); form.active = t.active || 1 }
      }
    } catch (_) {}
  }
})

async function save() {
  busy.value = true; justSaved.value = false; error.value = ''

  if (form.category === '__new__') {
    await addNewCategory()
  }

  var url = isNew ? '/api/incident-types' : `/api/incident-types/${id}`
  var r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: form.name,
      display_name: form.display_name,
      category: form.category,
      color: form.color,
      pin_letter: form.pin_letter,
      active: form.active,
    }),
  })
  if (r.ok) {
    justSaved.value = true
    setTimeout(function() { justSaved.value = false }, 2000)
    addToast('Call type saved')
    if (isNew) router.push('/admin/incident-types')
  } else {
    error.value = 'Save failed'
    addToast('Save failed', 'danger')
  }
  busy.value = false
}

async function doDelete() {
  var r = await fetch(`/api/incident-types/${id}`, { method: 'DELETE' })
  if (r.ok) { addToast('Deleted'); router.push('/admin/incident-types') }
  else { addToast('Delete failed', 'danger') }
}
</script>
