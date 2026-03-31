<template>
  <div class="mindmap-container" 
       :style="{ backgroundPosition: `${viewTransform.x}px ${viewTransform.y}px` }"
       @wheel.prevent="onWheel"
       @mousedown="startPanning"
       @mousemove="handleMouseMove" 
       @mouseup="handleMouseUp" 
       @mouseleave="handleMouseUp"
       @click="deselect">
    
    <!-- 1. 顶部整合工具栏 -->
    <div class="toolbar-wrapper">
      <div class="toolbar" ref="toolbarRef" @wheel.stop="handleToolbarWheel">    
        <!-- 搜索组 -->
        <div class="search-group">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input v-model="searchQuery" class="search-input" placeholder="搜索节点..." @keyup.enter="searchResults.length && focusNode(searchResults[0].id)" />
            
            <!-- 搜索结果列表 -->
            <div v-if="searchQuery && searchResults.length" class="search-dropdown">
              <div v-for="res in searchResults" :key="res.id" class="search-item" @click.stop="focusNode(res.id)">
                <span class="res-text">{{ res.text.replace(/\$/g, '') }}</span>
                <span class="res-type">{{ res.parentId ? '子' : '根' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="separator"></div>

        <!-- 画布工具 -->
        <div class="tool-group">
          <span class="zoom-info">{{ Math.round(viewTransform.scale * 100) }}%</span>
          <button class="tool-btn icon-only" @click="store.autoLayout" title="自动布局">🪄</button>
          <button class="tool-btn icon-only" @click="resetView" title="重置视角">🎯</button>
        </div>

        <!-- 节点工具 (选中时显示) -->
        <template v-if="selectedId">
          <div class="separator"></div>
          <div class="tool-group animate-in">
            <button class="tool-btn primary" @click="store.addChild(selectedId!)" title="添加子节点">➕</button>

            <div class="font-controls">
              <button class="icon-btn" @click="store.updateNodeFont(selectedId!, 2)">A+</button>
              <button class="icon-btn" @click="store.updateNodeFont(selectedId!, -2)">A-</button>
              <button class="icon-btn" :class="{ active: isCurrentBold }" @click="store.updateNodeFont(selectedId!, 0, true)">B</button>
            </div>
          
            <div class="color-picker">
              <div v-for="color in colorPresets" :key="color" class="color-dot" :style="{ backgroundColor: color }" @click="store.updateNodeColor(selectedId!, color)"></div>
            </div>
          
            <div class="action-group">
              <button class="tool-btn icon-only" @click="store.copyBranch(selectedId!)" title="复制">📄</button>
              <button class="tool-btn icon-only" :disabled="!store.clipboard?.length" @click="store.pasteBranch(selectedId!)" title="粘贴">📋</button>
              <button class="tool-btn icon-only danger" @click="deleteSelectedNode" title="删除">🗑️</button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- SVG 画布部分保持不变 -->
    <svg width="100%" height="100vh" class="svg-canvas" @dblclick="handleCanvasDblClick">
       <!-- ... 内部代码与你之前的一致 ... -->
       <g :transform="`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`">
        <g class="lines">
          <path v-for="line in visibleConnections" :key="line.id" :d="generatePath(line)" stroke="#cbd5e1" stroke-width="2" fill="none" />
        </g>
        <g v-for="node in visibleNodes" :key="node.id" :transform="`translate(${node.x}, ${node.y})`" @mousedown.stop="onMouseDownNode($event, node)" @contextmenu.prevent class="node-group">
          <foreignObject :width="node.width || 200" :height="node.height || 100" overflow="visible">
            <div class="node-wrapper" v-observe-size="node.id" :style="{ width: 'max-content', minWidth: '100px' }">
              <div class="node-box" :class="{ 'is-selected': selectedId === node.id }" :style="{ backgroundColor: node.color || '#ffffff', fontSize: (node.fontSize || 14) + 'px', fontWeight: node.isBold ? 'bold' : 'normal' }">
                <input v-if="node.isEditing" v-model="node.text" @blur="node.isEditing = false" @keydown.enter="node.isEditing = false" v-focus :style="{ fontSize: 'inherit', fontWeight: 'inherit' }" />
                <div v-else @dblclick.stop="node.isEditing = true" v-html="renderKatex(node.text)"></div>
                <div v-if="hasChildren(node.id)" class="collapse-btn" @click.stop="store.toggleCollapse(node.id)">{{ node.isCollapsed ? '+' : '-' }}</div>
              </div>
            </div>
          </foreignObject>
        </g>
      </g>
    </svg>

    <div class="help-tip">双击空白处: 新建主题 | 双击节点: 编辑 | 选中节点以显示更多操作</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useMindMapStore, type MindNode } from '../stores/mindmap'
import katex from 'katex'
import 'katex/dist/katex.min.css'


const toolbarRef = ref<HTMLElement | null>(null)
const isAtStart = ref(true)
const isAtEnd = ref(false)
const showScrollBtns = ref(false)

// 检查是否需要显示滚动按钮
const updateScrollStatus = () => {
  if (!toolbarRef.value) return
  const { scrollLeft, scrollWidth, clientWidth } = toolbarRef.value
  isAtStart.value = scrollLeft <= 0
  isAtEnd.value = scrollLeft + clientWidth >= scrollWidth - 1
  showScrollBtns.value = scrollWidth > clientWidth
}

// 按钮点击滚动
const scrollToolbar = (distance: number) => {
  toolbarRef.value?.scrollBy({ left: distance, behavior: 'smooth' })
}

// 鼠标滚轮在工具栏上时转化为横向滚动
const handleToolbarWheel = (e: WheelEvent) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    toolbarRef.value?.scrollBy({ left: e.deltaY, behavior: 'auto' })
  }
}

// 监听窗口大小变化
const resizeObserverToolbar = new ResizeObserver(updateScrollStatus)

onMounted(() => {
  if (toolbarRef.value) resizeObserverToolbar.observe(toolbarRef.value)
  updateScrollStatus()
})

onUnmounted(() => {
  resizeObserverToolbar.disconnect()
})

// 计算属性：当前节点是否加粗 (用于图标高亮)
const isCurrentBold = computed(() => {
  return store.nodes.find(n => n.id === selectedId.value)?.isBold
})

const store = useMindMapStore()
const selectedId = ref<string | null>(null)

// --- 逻辑处理 ---

const deselect = (e: MouseEvent) => {
  // 点击背景取消选中
  if ((e.target as HTMLElement).tagName === 'svg') {
    selectedId.value = null
  }
}

const deleteSelectedNode = () => {
  if (selectedId.value) {
    store.deleteNode(selectedId.value)
    selectedId.value = null
  }
}

const resetView = () => {
  viewTransform.scale = 1
  viewTransform.x = 0
  viewTransform.y = 0
}

const renderKatex = (text: string) => {
  if (!text) return '...'
  return text.replace(/\$(.*?)\$/g, (_, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false })
    } catch (e) { return formula }
  })
}

// 可见性检查
const isNodeVisible = (node: MindNode): boolean => {
  if (!node.parentId) return true
  const parent = store.nodes.find(n => n.id === node.parentId)
  if (!parent || parent.isCollapsed) return false
  return isNodeVisible(parent)
}

const visibleNodes = computed(() => store.nodes.filter(n => isNodeVisible(n)))

//节点颜色预设
const colorPresets = [
  '#ffffff', // 默认白色
  '#fecaca', // 浅红
  '#fef08a', // 浅黄
  '#bbf7d0', // 浅绿
  '#bfdbfe', // 浅蓝
  '#ddd6fe', // 浅紫
]

const hasChildren = (nodeId: string) => store.nodes.some(n => n.parentId === nodeId)

// 连线逻辑
const visibleConnections = computed(() => {
  return store.nodes
    .filter(n => n.parentId !== null && isNodeVisible(n))
    .map(n => {
      const parent = store.nodes.find(p => p.id === n.parentId)
      if (!parent || parent.isCollapsed) return null
      return {
        id: n.id,
        x1: parent.x + (parent.width || 120), 
        y1: parent.y + (parent.height || 40) / 2,
        x2: n.x,
        y2: n.y + (n.height || 40) / 2
      }
    })
    .filter(l => l !== null)
})

const generatePath = (line: any) => {
  const { x1, y1, x2, y2 } = line
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
}

// --- 变换逻辑 ---
const viewTransform = reactive({ x: 0, y: 0, scale: 1 })
const isPanning = ref(false)
const startPanPos = { x: 0, y: 0 }

const onWheel = (e: WheelEvent) => {
  const zoomSpeed = 0.001
  const delta = -e.deltaY
  const oldScale = viewTransform.scale
  const newScale = Math.min(Math.max(oldScale + delta * zoomSpeed, 0.1), 3)

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  viewTransform.x = mouseX - (mouseX - viewTransform.x) * (newScale / oldScale)
  viewTransform.y = mouseY - (mouseY - viewTransform.y) * (newScale / oldScale)
  viewTransform.scale = newScale
}

const startPanning = (e: MouseEvent) => {
  if ((e.target as HTMLElement).tagName === 'svg') {
    isPanning.value = true
    startPanPos.x = e.clientX - viewTransform.x
    startPanPos.y = e.clientY - viewTransform.y
  }
}

const handleMouseMove = (e: MouseEvent) => {
  if (isPanning.value) {
    viewTransform.x = e.clientX - startPanPos.x
    viewTransform.y = e.clientY - startPanPos.y
  } else if (store.dragNodeId) {
    const node = store.nodes.find(n => n.id === store.dragNodeId)
    if (node) {
      node.x = (e.clientX - store.offset.x) / viewTransform.scale
      node.y = (e.clientY - store.offset.y) / viewTransform.scale
    }
  }
}

const handleMouseUp = () => {
  isPanning.value = false
  store.dragNodeId = null
}

const onMouseDownNode = (e: MouseEvent, node: any) => {
  if (node.isEditing) return
  store.dragNodeId = node.id
  store.offset.x = e.clientX - node.x * viewTransform.scale
  store.offset.y = e.clientY - node.y * viewTransform.scale
  selectedId.value = node.id
}

const handleCanvasDblClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).tagName === 'svg') {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const realX = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale
    const realY = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale
    store.addRootNode(realX, realY)
  }
}

// --- 尺寸观察 ---
const resizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const id = entry.target.getAttribute('data-id')
    if (id) store.updateNodeSize(id, entry.contentRect.width + 24, entry.contentRect.height + 16)
  }
})

const vObserveSize = {
  mounted: (el: HTMLElement, binding: any) => {
    el.setAttribute('data-id', binding.value)
    resizeObserver.observe(el)
  },
  unmounted: (el: HTMLElement) => resizeObserver.unobserve(el)
}

const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

//=========================================================
//搜索
const searchQuery = ref('')

// 搜索过滤：排除空字符串，匹配文本内容
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return store.nodes.filter(node => 
    node.text.toLowerCase().includes(query)
  ).slice(0, 5) // 最多显示5条结果
})

// 定位节点的核心函数
const focusNode = (nodeId: string) => {
  const node = store.nodes.find(n => n.id === nodeId)
  if (!node) return

  // 1. 确保节点可见（展开父级）
  store.expandToNode(nodeId)
  
  // 2. 选中节点
  selectedId.value = nodeId

  // 3. 动画定位：计算将节点移动到屏幕中心所需的平移量
  // 公式：平移量 = 屏幕中心 - (节点坐标 * 缩放)
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  
  // 考虑到节点自身的宽度和高度，让中心对准节点中心
  const nodeCenterX = node.x + (node.width || 100) / 2
  const nodeCenterY = node.y + (node.height || 40) / 2

  viewTransform.x = centerX - nodeCenterX * viewTransform.scale
  viewTransform.y = centerY - nodeCenterY * viewTransform.scale

  // 4. 清空搜索
  searchQuery.value = ''
//=============================================
}
</script>

<style scoped>
.mindmap-container {
  width: 100vw;
  height: 100vh;
  background-color: #f8fafc;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 30px 30px;
  position: relative;
  overflow: hidden;
}

/* 顶部工具栏包装器 */
.toolbar-wrapper {
  position: absolute;
  top: 15px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  max-width: 90vw; /* 限制最大宽度 */
  display: flex;
  pointer-events: none;
}

/* 工具栏胶囊主体 */
.toolbar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  padding: 6px 16px;
  border-radius: 50px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  border: 1px solid #e2e8f0;
  gap: 8px;
  overflow-x: auto; /* 允许横向滚动 */
  scrollbar-width: none;
  flex-wrap: nowrap;
}
.toolbar::-webkit-scrollbar { display: none; }

/* 基础组容器：禁止缩小 */
.search-group, .tool-group, .font-controls, .action-group {
  display: flex;
  align-items: center;
  flex-shrink: 0; /* 禁止被挤压 */
  gap: 6px;
}

/* 按钮统一高度 */
.tool-btn, .icon-btn {
  height: 34px;
  min-width: 34px;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}
.tool-btn:hover { background: #f1f5f9; }

.tool-btn.primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0 12px;
  font-weight: bold;
}

.tool-btn.danger:hover { color: #ef4444; border-color: #fee2e2; background: #fef2f2; }

/* 搜索框 */
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: #f1f5f9;
  padding: 0 10px;
  border-radius: 20px;
  height: 34px;
  width: 140px;
  flex-shrink: 0;
  transition: width 0.3s;
}
.search-input-wrapper:focus-within { width: 200px; background: white; box-shadow: 0 0 0 2px #3b82f633; }
.search-input { border: none; background: transparent; outline: none; font-size: 13px; width: 100%; }

.search-dropdown {
  position: absolute;
  top: 45px;
  left: 0;
  width: 220px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
  border: 1px solid #e2e8f0;
  max-height: 300px;
  overflow-y: auto;
}
.search-item { padding: 10px; display: flex; justify-content: space-between; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.search-item:hover { background: #f8fafc; }

/* 节点样式 */
.node-box {
  background: white;
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 14px;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.is-selected { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15); }

.separator { width: 1px; height: 20px; background: #e2e8f0; flex-shrink: 0; margin: 0 4px; }

.color-picker { display: flex; gap: 4px; padding: 0 8px; flex-shrink: 0; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
.color-dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #e2e8f0; cursor: pointer; flex-shrink: 0; }
.color-dot:hover { transform: scale(1.1); }

.zoom-info { font-size: 13px; font-weight: bold; color: #64748b; min-width: 45px; flex-shrink: 0; }

.collapse-btn {
  position: absolute; right: -9px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 18px; background: #3b82f6; color: white;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; cursor: pointer; border: 2px solid white;
}
</style>