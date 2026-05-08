import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/', component: () => import('../views/MessagesView.vue') },
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
