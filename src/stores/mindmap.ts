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
}

export const useMindMapStore = defineStore('mindmap', {
  state: () => ({
    // 1. 节点数据
    nodes: [
      { id: 'root', text: '中心主题', x: 300, y: 300, width: 150, height: 40, parentId: null, isEditing: false }
    ] as MindNode[],
    
    // 2. 剪贴板（用于复制粘贴）
    clipboard: [] as MindNode[],
    
    // 3. 拖拽状态（这是你报错缺少的部分）
    dragNodeId: null as string | null,
    offset: { x: 0, y: 0 }
  }),

  actions: {
    // 更新节点文本气泡大小
    updateNodeSize(id: string, width: number, height: number) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        node.width = width
        node.height = height
      }
    },
    // 更新节点气泡颜色
    updateNodeColor(id: string, color: string) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
      node.color = color
      }
    },

    // 更新节点位置
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
      const newNode: MindNode = {
        id: Date.now().toString(),
        text: '新分支',
        x: parent.x + 200,
        y: parent.y + (Math.random() - 0.5) * 100,
        parentId: parentId,
        isEditing: true,
        isCollapsed: false, 
        width: 60,         // 给一个默认宽度
        height: 40          // 给一个默认高度
      }
      this.nodes.push(newNode)
    },

    // 删除节点及其子树
    deleteNode(id: string) {
      const idsToDelete: string[] = []
      const collect = (nodeId: string) => {
        idsToDelete.push(nodeId)
        this.nodes.filter(n => n.parentId === nodeId).forEach(child => collect(child.id))
      }
      collect(id)
      this.nodes = this.nodes.filter(n => !idsToDelete.includes(n.id))
    },

    // 复制分支
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
      this.clipboard = JSON.parse(JSON.stringify(subtree)) // 深拷贝
    },

    // 粘贴分支
    pasteBranch(newParentId: string) {
      if (this.clipboard.length === 0) return
      const parent = this.nodes.find(n => n.id === newParentId)
      if (!parent) return

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
    // 切换折叠状态
    toggleCollapse(id: string) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        node.isCollapsed = !node.isCollapsed
      }
    },

    // 自动布局算法 (简单的树状布局)
    autoLayout() {
        const HORIZONTAL_MARGIN = 100
        const VERTICAL_GAP = 80
        let currentY = 100 
    
        const layout = (nodeId: string, parentRightEdge: number) => {
          const node = this.nodes.find(n => n.id === nodeId)
          if (!node) return
          node.x = parentRightEdge + (parentRightEdge > 60 ? HORIZONTAL_MARGIN : 0)
          const children = this.nodes.filter(n => n.parentId === nodeId)
          const nodeWidth = node.width || 150
          const nodeRightEdge = node.x + nodeWidth
        
          if (children.length === 0 || node.isCollapsed) {
            node.y = currentY
            currentY += VERTICAL_GAP
          } else {
            children.forEach(child => layout(child.id, nodeRightEdge))
            const firstChild = children[0]
            const lastChild = children[children.length - 1]
            if (firstChild && lastChild) {
              node.y = (firstChild.y + lastChild.y) / 2
            }
          }
        }
      
        // 找出所有根节点（没有 parentId 的节点）
        const roots = this.nodes.filter(n => !n.parentId)
        roots.forEach(root => {
          layout(root.id, 50) // 每个根节点都从左侧 50 开始布局
          currentY += 40 // 不同根节点之间留出额外间距
        })
    },
      // 双击创建新根节点
    addRootNode(x: number, y: number) {
      const newNode: MindNode = {
        id: Date.now().toString(),
        text: '新主题',
        x: x - 75, // 居中放置（假设宽度150）
        y: y - 20, // 居中放置
        width: 150,
        height: 40,
        parentId: null,
        isEditing: true
      }
      this.nodes.push(newNode)
    }
  }
})  