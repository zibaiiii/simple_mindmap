// src/stores/mindmap.ts
import { defineStore } from 'pinia'

export interface MindNode {
  id: string
  text: string
  x: number
  y: number
  parentId: string | null
  isEditing: boolean
  width: number   // 气泡宽度
  height: number  // 气泡高度
  isCollapsed?: boolean //是否收起子节点
  color?: string // 节点背景颜色
  fontSize?: number;   // 字体大小 (px)
  isBold?: boolean;    // 是否加粗
}

export const useMindMapStore = defineStore('mindmap', {
  state: () => ({
    // 1. 节点数据
    nodes: [
      { id: 'root', text: '中心主题', x: 300, y: 300, width: 150, height: 40, parentId: null, isEditing: false }
    ] as MindNode[],
    
    // 2. 剪贴板（用于复制粘贴）
    clipboard: [] as MindNode[],
    
    // 3. 拖拽状态
    dragNodeId: null as string | null,
    offset: { x: 0, y: 0 },
    
    // 4. 历史记录状态
    history: [] as string[], 
    historyIndex: -1
  }),

  actions: {
    // 保存当前快照
    saveHistory() {
      // 如果在回退过程中做了新操作，清空当前索引之后的记录
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1)
      }
      // 将当前状态存入历史
      this.history.push(JSON.stringify(this.nodes))
      // 限制历史堆栈大小为 50 步
      if (this.history.length > 50) {
        this.history.shift()
      } else {
        this.historyIndex++
      }
    },

    undo() {
      if (this.historyIndex > 0) {
        this.historyIndex--
        this.nodes = JSON.parse(this.history[this.historyIndex])
      }
    },

    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++
        this.nodes = JSON.parse(this.history[this.historyIndex])
      }
    },

    // 查找并展开父节点 (纯 UI 行为，通常不计入撤销历史)
    expandToNode(nodeId: string) {
      const node = this.nodes.find(n => n.id === nodeId)
      if (!node || !node.parentId) return

      let currentParentId = node.parentId
      while (currentParentId) {
        const parent = this.nodes.find(n => n.id === currentParentId)
        if (parent) {
          parent.isCollapsed = false
          currentParentId = parent.parentId || ''
        } else {
          break
        }
      }
    },

    // 更新字体大小
    updateNodeFont(id: string, sizeDelta: number, toggleBold: boolean = false) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        this.saveHistory() // 变更前记录
        if (sizeDelta !== 0) {
          const currentSize = node.fontSize || 14
          node.fontSize = Math.min(Math.max(currentSize + sizeDelta, 12), 32)
        }
        if (toggleBold) {
          node.isBold = !node.isBold
        }
      }
    },

    // 更新节点尺寸 (由 ResizeObserver 触发)
    updateNodeSize(id: string, width: number, height: number) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        // 注意：尺寸更新过于频繁，通常不建议每一步都 saveHistory
        node.width = width
        node.height = height
      }
    },

    // 更新节点颜色
    updateNodeColor(id: string, color: string) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        this.saveHistory() // 变更前记录
        node.color = color
      }
    },

    // 更新节点位置 (拖拽中调用，saveHistory 由 handleMouseUp 触发)
    updateNodePos(id: string, x: number, y: number) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        node.x = x
        node.y = y
      }
    },

    // 添加子节点
    addChild(parentId: string) {
      const parent = this.nodes.find(n => n.id === parentId)
      if (!parent) return
      this.saveHistory() // 变更前记录
      
      const newNode: MindNode = {
        id: Date.now().toString(),
        text: '新分支',
        x: parent.x + 200,
        y: parent.y + (Math.random() - 0.5) * 100,
        parentId: parentId,
        isEditing: true,
        isCollapsed: false, 
        width: 60,
        height: 40
      }
      this.nodes.push(newNode)
    },

    // 删除节点及其子树
    deleteNode(id: string) {
      this.saveHistory() // 变更前记录
      const idsToDelete: string[] = []
      const collect = (nodeId: string) => {
        idsToDelete.push(nodeId)
        this.nodes.filter(n => n.parentId === nodeId).forEach(child => collect(child.id))
      }
      collect(id)
      this.nodes = this.nodes.filter(n => !idsToDelete.includes(n.id))
    },

    // 复制 (不涉及数据变更，无需记录历史)
    copyBranch(id: string) {
      const subtree: MindNode[] = []
      const collect = (nodeId: string) => {
        const node = this.nodes.find(n => n.id === nodeId)
        if (node) {
          subtree.push({ ...node })
          this.nodes.filter(n => n.parentId === nodeId).forEach(child => collect(child.id))
        }
      }
      collect(id)
      this.clipboard = JSON.parse(JSON.stringify(subtree))
    },

    // 粘贴
    pasteBranch(newParentId: string) {
      if (this.clipboard.length === 0) return
      const parent = this.nodes.find(n => n.id === newParentId)
      if (!parent) return

      this.saveHistory() // 变更前记录

      const idMap = new Map<string, string>()
      this.clipboard.forEach(node => {
        idMap.set(node.id, Date.now().toString() + Math.random().toString())
      })

      this.clipboard.forEach((oldNode, index) => {
        const newNode = { ...oldNode }
        newNode.id = idMap.get(oldNode.id)!
        if (index === 0) {
          newNode.parentId = newParentId
          newNode.x = parent.x + 200
          newNode.y = parent.y + 50
        } else {
          newNode.parentId = idMap.get(oldNode.parentId!) || newParentId
        }
        this.nodes.push(newNode)
      })
    },

    // 切换折叠
    toggleCollapse(id: string) {
      this.saveHistory() // 变更前记录
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        node.isCollapsed = !node.isCollapsed
      }
    },

    // 自动布局
    autoLayout() {
      this.saveHistory() // 变更前记录
      const HORIZONTAL_MARGIN = 100
      const VERTICAL_GAP = 80
      let currentY = 100 

      const layout = (nodeId: string, parentRightEdge: number) => {
        const node = this.nodes.find(n => n.id === nodeId)
        if (!node) return
        node.x = parentRightEdge + (parentRightEdge > 60 ? HORIZONTAL_MARGIN : 0)
        const children = this.nodes.filter(n => n.parentId === nodeId)
        
        if (children.length === 0 || node.isCollapsed) {
          node.y = currentY
          currentY += VERTICAL_GAP
        } else {
          children.forEach(child => layout(child.id, node.x + (node.width || 150)))
          const firstChild = children[0]
          const lastChild = children[children.length - 1]
          if (firstChild && lastChild) {
            node.y = (firstChild.y + lastChild.y) / 2
          }
        }
      }
      
      const roots = this.nodes.filter(n => !n.parentId)
      roots.forEach(root => {
        layout(root.id, 50)
        currentY += 40
      })
    },

    // 添加根节点
    addRootNode(x: number, y: number) {
      this.saveHistory() // 变更前记录
      const newNode: MindNode = {
        id: Date.now().toString(),
        text: '新主题',
        x: x - 75,
        y: y - 20,
        width: 150,
        height: 40,
        parentId: null,
        isEditing: true
      }
      this.nodes.push(newNode)
    }
  }
})