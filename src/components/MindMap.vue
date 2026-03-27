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
    <div class="toolbar" @mousedown.stop>
      <!-- 画布操作组 -->
      <div class="tool-group">
        <span class="zoom-info">{{ Math.round(viewTransform.scale * 100) }}%</span>
        <button class="tool-btn" @click="store.autoLayout" title="自动布局">🪄 布局</button>
        <button class="tool-btn" @click="resetView" title="重置视角">🎯 重置</button>
      </div>

      <!-- 分隔线 -->
      <div class="separator" v-if="selectedId"></div>

      <!-- 节点操作组：仅在选中节点时显示 -->
      <div class="tool-group animate-in" v-if="selectedId">
        <button class="tool-btn primary" @click="store.addChild(selectedId!)">➕ 子节点</button>
        <div class="color-picker">
          <div v-for="color in colorPresets" 
              :key="color"
              class="color-dot"
              :style="{ backgroundColor: color }"
              @click="store.updateNodeColor(selectedId!, color)">
          </div>
        </div>
        <button class="tool-btn" @click="store.copyBranch(selectedId!)">📄 复制</button>
        <button class="tool-btn" 
                :disabled="!store.clipboard.length" 
                @click="store.pasteBranch(selectedId!)">📋 粘贴</button>
        <button class="tool-btn danger" @click="deleteSelectedNode">🗑️ 删除</button>
      </div>
    </div>

    <svg width="100%" height="100vh" class="svg-canvas" @dblclick="handleCanvasDblClick">
      <g :transform="`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`">
        
        <!-- 连线 -->
        <g class="lines">
          <path v-for="line in visibleConnections" :key="line.id"
            :d="generatePath(line)"
            stroke="#cbd5e1" stroke-width="2" fill="none" />
        </g>

        <!-- 节点 -->
        <g v-for="node in visibleNodes" :key="node.id" 
           :transform="`translate(${node.x}, ${node.y})`"
           @mousedown.stop="onMouseDownNode($event, node)"
           @contextmenu.prevent
           class="node-group">
          
          <foreignObject :width="node.width || 200" :height="node.height || 100" overflow="visible">
            <div class="node-wrapper" 
                 v-observe-size="node.id" 
                 :style="{ width: 'max-content', minWidth: '100px' }">
              
              <div class="node-box" 
              :class="{ 'is-selected': selectedId === node.id }"
              :style="{ backgroundColor: node.color || '#ffffff' }">
                <input v-if="node.isEditing" v-model="node.text" @blur="node.isEditing = false" @keydown.enter="node.isEditing = false" v-focus />
                <div v-else @dblclick.stop="node.isEditing = true" v-html="renderKatex(node.text)"></div>
                
                <div v-if="hasChildren(node.id)" class="collapse-btn" @click.stop="store.toggleCollapse(node.id)">
                  {{ node.isCollapsed ? '+' : '-' }}
                </div>
              </div>
            </div>
          </foreignObject>
        </g>
      </g>
    </svg>

    <div class="help-tip">
      双击空白处: 新建主题 | 双击节点: 编辑 ($公式$) | 选中节点以显示更多操作
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useMindMapStore, type MindNode } from '../stores/mindmap'
import katex from 'katex'
import 'katex/dist/katex.min.css'

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
</script>

<style scoped>
.mindmap-container {
  width: 100vw;
  height: 100vh;
  background-color: #f1f5f9;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 30px 30px;
  position: relative;
  overflow: hidden;
  cursor: grab;
}
.mindmap-container:active { cursor: grabbing; }

/* 顶部工具栏样式升级 */
.toolbar {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  background: white;
  padding: 6px 12px;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
  border: 1px solid #e2e8f0;
  gap: 8px;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.separator {
  width: 1px;
  height: 24px;
  background: #e2e8f0;
  margin: 0 4px;
}

.tool-btn {
  background: white;
  border: 1px solid transparent;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  transition: all 0.2s;
  white-space: nowrap;
}

.tool-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.tool-btn.primary {
  background: #3b82f6;
  color: white;
}
.tool-btn.primary:hover { background: #2563eb; }

.tool-btn.danger:hover {
  background: #fef2f2;
  color: #ef4444;
  border-color: #fee2e2;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-info {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  min-width: 45px;
  text-align: center;
}
/* 颜色选择器容器 */
.color-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 8px;
  padding: 0 8px;
  border-left: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
}

/* 颜色小圆点 */
.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.2s;
}

.color-dot:hover {
  transform: scale(1.2);
  border-color: #3b82f6;
}

.node-box {
  background: white;
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 14px;
  transition: all 0.2s;
  font-size: 14px;
}
.is-selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
}

.collapse-btn {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  border: 2px solid white;
}

.animate-in {
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.help-tip {
  position: absolute;
  bottom: 15px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.9);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
}
</style>