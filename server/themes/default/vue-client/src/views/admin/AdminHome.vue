<template>
  <div class="container py-4">
    <h4 class="fw-bold mb-4"><i class="bi bi-shield-lock-fill me-2"></i>Admin Panel</h4>
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
        <router-link to="/admin/settings" class="text-decoration-none">
          <div class="card admin-card text-center p-4 h-100">
            <i class="bi bi-gear-fill fs-1 mb-2 text-secondary"></i>
            <div class="fw-semibold">Settings</div>
            <div class="text-muted small">System & plugin config</div>
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
