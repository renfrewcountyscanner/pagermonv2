import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/', component: () => import('../views/MessagesView.vue'), meta: { requiresAuth: true } },
  { path: '/livelog', component: () => import('../views/LiveLogView.vue'), meta: { requiresAuth: true } },
  { path: '/auth/login', component: () => import('../views/auth/LoginView.vue') },
  { path: '/auth/register', component: () => import('../views/auth/RegisterView.vue') },
  { path: '/auth/profile', component: () => import('../views/auth/ProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/auth/reset', component: () => import('../views/auth/PasswordResetView.vue'), meta: { requiresAuth: true } },
  { path: '/admin', component: () => import('../views/admin/AdminHome.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/aliases', component: () => import('../views/admin/AliasesView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/aliases/:id', component: () => import('../views/admin/AliasDetailView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/users', component: () => import('../views/admin/UsersView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/users/:id', component: () => import('../views/admin/UserDetailView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/settings', component: () => import('../views/admin/SettingsView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/incident-types', component: () => import('../views/admin/IncidentTypesView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/incident-types/:id', component: () => import('../views/admin/IncidentTypeDetailView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/geo-config', component: () => import('../views/admin/GeoConfigView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/geo-config/:id', component: () => import('../views/admin/GeoConfigDetailView.vue'), meta: { requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.checked) await auth.fetchMe()

  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return { path: '/' }
  }
  if (to.meta.requiresAuth && !auth.authenticated) {
    return { path: '/auth/login' }
  }
})

export default router
