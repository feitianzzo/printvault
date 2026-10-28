import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/projects', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
    { path: '/projects/:id', name: 'project', component: () => import('@/views/ProjectView.vue') },
    { path: '/model/:id', name: 'model', component: () => import('@/views/ModelDetailView.vue') },
    { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
  ],
})

export default router
