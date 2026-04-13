<template>
  <div class="mindmap-container" 
       :style="{ backgroundPosition: `${viewTransform.x}px ${viewTransform.y}px` }"
       @wheel.prevent="onWheel"
       @mousedown="startPanning"
       @mousemove="handleMouseMove" 
       @mouseup="handleMouseUp" 
       @mouseleave="handleMouseUp"
       @click="deselect">
    
    <!-- 顶部整合工具栏 -->
    <div class="toolbar-wrapper">
      <!-- 胶囊 1: 搜索组 -->
      <div class="search-section">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            v-model="searchQuery" 
            class="search-input" 
            placeholder="搜索节点..." 
            @keyup.enter="handleSearchEnter"
          />
          <!-- 搜索结果下拉框 -->
          <Transition name="fade">
            <div v-if="searchQuery && searchResults.length" class="search-dropdown">
              <div 
                v-for="res in searchResults" 
                :key="res.id" 
                class="search-item" 
                @click.stop="focusNode(res.id)"
              >
                <div class="res-main">
                  <span class="res-text">{{ res.text.replace(/\$/g, '') }}</span>
                  <span class="res-path">{{ getNodePath(res) }}</span>
                </div>
                <span class="res-type" :class="res.parentId ? 'child' : 'root'">
                  {{ res.parentId ? '子' : '根' }}
                </span>
              </div>
            </div>
            <div v-else-if="searchQuery && !searchResults.length" class="search-dropdown no-result">
              无匹配结果
            </div>
          </Transition>
        </div>
      </div>
    
      <!-- 胶囊 2: 核心功能组 -->
      <div class="toolbar" ref="toolbarRef" @wheel.stop="handleToolbarWheel">
        <!-- 历史记录组 (固定在胶囊开头) -->
        <div class="history-group">
          <button class="tool-btn icon-only" 
                  :disabled="store.historyIndex <= 0" 
                  @click="store.undo" title="撤销 (Ctrl+Z)">↩️</button>
          <button class="tool-btn icon-only" 
                  :disabled="store.historyIndex >= store.history.length - 1" 
                  @click="store.redo" title="重做 (Ctrl+Y)">↪️</button>
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

    <!-- SVG 画布 (保持不变) -->
    <svg width="100%" height="100vh" class="svg-canvas" @dblclick="handleCanvasDblClick">
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

    <div class="help-tip">双击画布: 新建主题 | 拖拽节点: 移动 | Ctrl+Z: 撤销</div>
  </div>
</template>
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useMindMapStore, type MindNode } from '../stores/mindmap'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const store = useMindMapStore()
const selectedId = ref<string | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)

// --- 搜索逻辑 ---
const searchQuery = ref('')
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return store.nodes.filter(n => n.text.toLowerCase().includes(query)).slice(0, 6)
})

const getNodePath = (node: MindNode) => {
  if (!node.parentId) return '根节点'
  const parent = store.nodes.find(n => n.id === node.parentId)
  return parent ? `属于: ${parent.text.substring(0, 8)}...` : ''
}

const focusNode = (nodeId: string) => {
  const node = store.nodes.find(n => n.id === nodeId)
  if (!node) return
  store.expandToNode(nodeId)
  selectedId.value = nodeId
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  viewTransform.x = centerX - (node.x + (node.width || 100) / 2) * viewTransform.scale
  viewTransform.y = centerY - (node.y + (node.height || 40) / 2) * viewTransform.scale
  searchQuery.value = ''
}

const handleSearchEnter = () => {
  if (searchResults.value.length > 0) focusNode(searchResults.value[0].id)
}

// --- 画布逻辑 ---
const viewTransform = reactive({ x: 0, y: 0, scale: 1 })
const isPanning = ref(false)
const startPanPos = { x: 0, y: 0 }

const onWheel = (e: WheelEvent) => {
  const zoomSpeed = 0.001
  const oldScale = viewTransform.scale
  const newScale = Math.min(Math.max(oldScale - e.deltaY * zoomSpeed, 0.1), 3)
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
  if (store.dragNodeId) store.saveHistory() // 拖拽结束保存历史
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

// --- 快捷键逻辑 ---
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault(); store.undo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault(); store.redo()
  }
}

// --- 生命周期 ---
const resizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const id = entry.target.getAttribute('data-id')
    if (id) store.updateNodeSize(id, entry.contentRect.width + 24, entry.contentRect.height + 16)
  }
})

onMounted(() => {
  // 1. 初始化历史
  if (store.history.length === 0) store.saveHistory()
  // 2. 快捷键
  window.addEventListener('keydown', handleKeyDown)
  // 3. 工具栏滚动监听 (如果需要)
  if (toolbarRef.value) {
    // 这里可以放 updateScrollStatus 逻辑
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  resizeObserver.disconnect()
})

// ... 其他辅助函数 (renderKatex, visibleConnections等) 保持不变 ...
const renderKatex = (text: string) => {
  if (!text) return '...'
  return text.replace(/\$(.*?)\$/g, (_, formula) => {
    try { return katex.renderToString(formula, { throwOnError: false }) } 
    catch (e) { return formula }
  })
}
const isNodeVisible = (node: MindNode): boolean => {
  if (!node.parentId) return true
  const parent = store.nodes.find(n => n.id === node.parentId)
  return (!parent || parent.isCollapsed) ? false : isNodeVisible(parent)
}
const visibleNodes = computed(() => store.nodes.filter(n => isNodeVisible(n)))
const hasChildren = (nodeId: string) => store.nodes.some(n => n.parentId === nodeId)
const visibleConnections = computed(() => {
  return store.nodes.filter(n => n.parentId !== null && isNodeVisible(n)).map(n => {
    const parent = store.nodes.find(p => p.id === n.parentId)
    if (!parent || parent.isCollapsed) return null
    return { id: n.id, x1: parent.x + (parent.width || 120), y1: parent.y + (parent.height || 40) / 2, x2: n.x, y2: n.y + (n.height || 40) / 2 }
  }).filter(l => l !== null)
})
const generatePath = (line: any) => `M ${line.x1} ${line.y1} C ${(line.x1+line.x2)/2} ${line.y1}, ${(line.x1+line.x2)/2} ${line.y2}, ${line.x2} ${line.y2}`
const isCurrentBold = computed(() => store.nodes.find(n => n.id === selectedId.value)?.isBold)
const colorPresets = ['#ffffff', '#fecaca', '#fef08a', '#bbf7d0', '#bfdbfe', '#ddd6fe']
const handleToolbarWheel = (e: WheelEvent) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) toolbarRef.value?.scrollBy({ left: e.deltaY, behavior: 'auto' })
}
const resetView = () => { viewTransform.scale = 1; viewTransform.x = 0; viewTransform.y = 0 }
const deleteSelectedNode = () => { if (selectedId.value) { store.deleteNode(selectedId.value); selectedId.value = null } }
const handleCanvasDblClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).tagName === 'svg') {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    store.addRootNode((e.clientX - rect.left - viewTransform.x) / viewTransform.scale, (e.clientY - rect.top - viewTransform.y) / viewTransform.scale)
  }
}
const deselect = (e: MouseEvent) => { if ((e.target as HTMLElement).tagName === 'svg') selectedId.value = null }
const vObserveSize = {
  mounted: (el: HTMLElement, binding: any) => { el.setAttribute('data-id', binding.value); resizeObserver.observe(el) },
  unmounted: (el: HTMLElement) => resizeObserver.unobserve(el)
}
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }
</script>

<style scoped>
.mindmap-container {
  width: 100vw; height: 100vh; background-color: #f8fafc;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 30px 30px; position: relative; overflow: hidden;
}

/* 顶部布局包装器 */
.toolbar-wrapper {
  position: absolute; top: 15px; left: 20px; z-index: 1000;
  display: flex; align-items: center; gap: 12px;
  max-width: calc(100vw - 40px); pointer-events: none;
}
.toolbar-wrapper > * { pointer-events: auto; }

/* 搜索胶囊 */
.search-section { flex-shrink: 0; }
.search-input-wrapper {
  position: relative; display: flex; align-items: center;
  background: white; height: 40px; width: 180px; padding: 0 14px;
  border-radius: 20px; border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: width 0.3s;
}
.search-input-wrapper:focus-within { width: 240px; border-color: #3b82f6; }
.search-input { border: none; background: transparent; outline: none; font-size: 14px; width: 100%; margin-left: 8px; }

.search-dropdown {
  position: absolute; top: 48px; left: 0; width: 280px;
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-height: 300px; overflow-y: auto; padding: 6px;
}

/* 工具栏胶囊 */
.toolbar {
  display: flex; align-items: center; background: white; height: 40px;
  padding: 0 14px; border-radius: 20px; border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); gap: 10px;
  flex: 1; overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: none;
}
.toolbar::-webkit-scrollbar { display: none; }

/* 组布局 */
.history-group, .tool-group, .font-controls, .action-group, .color-picker {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

/* 按钮与颜色 */
.tool-btn, .icon-btn {
  height: 30px; min-width: 32px; padding: 0 8px; border-radius: 8px;
  border: 1px solid #f1f5f9; background: #f8fafc; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0; transition: all 0.2s;
}
.tool-btn:hover { background: #e2e8f0; }
.tool-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tool-btn.primary { background: #3b82f6; color: white; border: none; }

.color-dot {
  width: 20px; height: 20px; border-radius: 50%; border: 1px solid #e2e8f0;
  cursor: pointer; flex-shrink: 0;
}
.separator { width: 1px; height: 18px; background: #e2e8f0; margin: 0 4px; flex-shrink: 0; }
.zoom-info { font-size: 12px; font-weight: 600; color: #64748b; min-width: 45px; flex-shrink: 0; }

/* 搜索项 */
.search-item { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-radius: 8px; }
.search-item:hover { background: #f1f5f9; }
.res-main { display: flex; flex-direction: column; }
.res-path { font-size: 10px; color: #94a3b8; }
.res-type { font-size: 10px; padding: 2px 5px; border-radius: 4px; background: #f1f5f9; }

/* 节点样式 */
.node-box { background: white; border: 2px solid #cbd5e1; border-radius: 8px; padding: 8px 16px; position: relative; }
.is-selected { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
.help-tip { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.8); color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; pointer-events: none; }

.animate-in { animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
.collapse-btn {
  position: absolute;
  right: -10px; /* 悬浮在节点右边缘 */
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  z-index: 10; /* 确保在最上层 */
  color: #64748b;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: all 0.2s ease;
  user-select: none;
}

.collapse-btn:hover {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
  transform: translateY(-50%) scale(1.1);
}

.node-box {
  background: white;
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 16px;
  position: relative; /* 必须是 relative */
  transition: border-color 0.2s, box-shadow 0.2s;
  min-width: 80px;
}
</style>