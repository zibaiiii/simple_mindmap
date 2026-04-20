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
      <!-- 胶囊 1: 导入导出 (IO 组) -->
      <div class="io-section">
        <div class="capsule">
          <button class="tool-btn icon-only" @click="store.exportJSON" title="导出 JSON">💾</button>
          <button class="tool-btn icon-only" @click="triggerImport" title="导入 JSON">📂</button>
          <input 
            type="file" 
            ref="fileInput" 
            style="display: none" 
            accept=".json" 
            @change="handleFileImport" 
          />
        </div>
      </div>

      <!-- 胶囊 2: 搜索组 -->
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
    
      <!-- 胶囊 3: 核心功能组 -->
      <div class="toolbar" ref="toolbarRef" @wheel.stop="handleToolbarWheel">
        <div class="history-group">
          <button class="tool-btn icon-only" 
                  :disabled="store.historyIndex <= 0" 
                  @click="store.undo" title="撤销 (Ctrl+Z)">↩️</button>
          <button class="tool-btn icon-only" 
                  :disabled="store.historyIndex >= store.history.length - 1" 
                  @click="store.redo" title="重做 (Ctrl+Y)">↪️</button>
        </div>
      
        <div class="separator"></div>
      
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

    <!-- SVG 画布 -->
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
const fileInput = ref<HTMLInputElement | null>(null)

// --- 导入/导出逻辑 ---
const triggerImport = () => fileInput.value?.click()

const handleFileImport = (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const reader = new FileReader()
  reader.onload = (event) => {
    const success = store.importJSON(event.target?.result as string)
    if (success) {
      resetView()
      alert('导入成功')
    } else {
      alert('解析失败，请确保是有效的 JSON 文件')
    }
    input.value = ''
  }
  reader.readAsText(input.files[0])
}

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

// --- 画布逻辑 (缩放/平移/拖拽) ---
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
  if (store.dragNodeId) store.saveHistory()
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

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); store.undo() }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); store.redo() }
}

const resizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    const id = entry.target.getAttribute('data-id')
    if (id) store.updateNodeSize(id, entry.contentRect.width + 24, entry.contentRect.height + 16)
  }
})

onMounted(() => {
  if (store.history.length === 0) store.saveHistory()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  resizeObserver.disconnect()
})

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

.toolbar-wrapper {
  position: absolute; top: 15px; left: 20px; z-index: 1000;
  display: flex; align-items: center; gap: 12px;
  max-width: calc(100vw - 40px); pointer-events: none;
}
.toolbar-wrapper > * { pointer-events: auto; }

/* IO 胶囊样式 */
.io-section .capsule {
  display: flex; align-items: center; background: white; height: 40px;
  padding: 0 10px; border-radius: 20px; border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); gap: 6px;
}

/* 搜索胶囊 */
.search-section { flex-shrink: 0; }
.search-input-wrapper {
  position: relative; display: flex; align-items: center;
  background: white; height: 40px; width: 180px; padding: 0 14px;
  border-radius: 20px; border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: all 0.3s ease;
}
.search-input-wrapper:focus-within { width: 240px; border-color: #3b82f6; }
.search-input { border: none; background: transparent; outline: none; font-size: 14px; width: 100%; margin-left: 8px; }

/* 核心工具栏胶囊 */
.toolbar {
  display: flex; align-items: center; background: white; height: 40px;
  padding: 0 14px; border-radius: 20px; border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05); gap: 10px;
  flex: 1; overflow-x: auto; scrollbar-width: none;
}
.toolbar::-webkit-scrollbar { display: none; }

/* 通用组件 */
.history-group, .tool-group, .font-controls, .action-group, .color-picker {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.tool-btn, .icon-btn {
  height: 30px; min-width: 32px; padding: 0 8px; border-radius: 8px;
  border: 1px solid #f1f5f9; background: #f8fafc; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0; transition: all 0.2s;
}
.tool-btn:hover { background: #e2e8f0; }
.tool-btn.primary { background: #3b82f6; color: white; border: none; }
.tool-btn.danger:hover { background: #fee2e2; color: #ef4444; }

.separator { width: 1px; height: 18px; background: #e2e8f0; margin: 0 4px; flex-shrink: 0; }
.zoom-info { font-size: 12px; font-weight: 600; color: #64748b; min-width: 45px; text-align: center; }

/* 搜索下拉 */
.search-dropdown {
  position: absolute; top: 48px; left: 0; width: 280px;
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-height: 300px; overflow-y: auto; padding: 6px;
}
.search-item { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-radius: 8px; }
.search-item:hover { background: #f1f5f9; }
.res-path { font-size: 10px; color: #94a3b8; }

/* 动画 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-in { animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

/* 节点样式 */
.node-box { background: white; border: 2px solid #cbd5e1; border-radius: 8px; padding: 8px 16px; position: relative; transition: all 0.2s; }
.is-selected { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
.collapse-btn {
  position: absolute; right: -10px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 20px; background: white; border: 1px solid #cbd5e1;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.help-tip { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.8); color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; pointer-events: none; }

.color-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #e2e8f0; cursor: pointer; }
</style>