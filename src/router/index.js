import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'camera',
    component: () => import('../views/ArCamera.vue'),
    meta: { title: 'AR 撮影' },
    props: (route) => {
      let images = []
      try {
        if (route.query.images) {
          images = JSON.parse(decodeURIComponent(route.query.images))
        }
      } catch {
        // 不正な query は空配列のまま
      }
      return { images }
    },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  document.title = to.meta?.title ?? 'AR Camera'
  next()
})

export default router
