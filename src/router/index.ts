import { createRouter, createWebHistory } from 'vue-router'
import MindMap from '../components/MindMap.vue' // 引入你的组件

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 修复这里的 BASE_URL
  routes: [
    {
      path: '/',
      name: 'home',
      component: MindMap // 设置首页显示思维导图
    }
  ]
})

export default router