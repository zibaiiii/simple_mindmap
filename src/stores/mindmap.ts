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
  isCollapsed?: boolean // 是否收起子节点
  color?: string // 节点背景颜色
  fontSize?: number;   // 字体大小 (px)
  isBold?: boolean;    // 是否加粗
}

export const useMindMapStore = defineStore('mindmap', {
  state: () => {
    // 1. 初始化时尝试从本地存储加载数据
    const localData = localStorage.getItem('mindmap_data')
    let initialNodes: MindNode[]
    
    try {
      if (localData) {
        initialNodes = JSON.parse(localData)
      } else {
        // 默认初始节点
        initialNodes = [
          { id: 'root', text: '中心主题', x: 300, y: 300, width: 150, height: 40, parentId: null, isEditing: false }
        ]
      }
    } catch (e) {
      console.error("解析本地存储数据失败", e)
      initialNodes = [{ id: 'root', text: '中心主题', x: 300, y: 300, width: 150, height: 40, parentId: null, isEditing: false }]
    }

    return {
      // 核心数据
      nodes: initialNodes,
      
      // 临时状态（不需要持久化）
      clipboard: [] as MindNode[],
      dragNodeId: null as string | null,
      offset: { x: 0, y: 0 },
      
      // 历史记录堆栈
      history: [] as string[], 
      historyIndex: -1
    }
  },

  actions: {
    // --- 持久化辅助 ---
    persist() {
      localStorage.setItem('mindmap_data', JSON.stringify(this.nodes))
    },

    // --- 历史记录管理 ---
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
      this.persist()
    },

    undo() {
      if (this.historyIndex > 0) {
        this.historyIndex--
        this.nodes = JSON.parse(this.history[this.historyIndex])
        this.persist()
      }
    },

    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++
        this.nodes = JSON.parse(this.history[this.historyIndex])
        this.persist()
      }
    },

    // --- 导入导出功能 ---
    exportJSON() {
      const data = JSON.stringify(this.nodes, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindmap-${new Date().getTime()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },

    importJSON(jsonString: string) {
      try {
        const importedNodes = JSON.parse(jsonString);
        if (Array.isArray(importedNodes)) {
          this.saveHistory(); // 导入前存档
          this.nodes = importedNodes;
          // 导入后重置历史堆栈防止引用混乱
          this.history = [JSON.stringify(this.nodes)];
          this.historyIndex = 0;
          this.persist();
          return true;
        }
      } catch (e) {
        console.error("导入失败:", e);
        return false;
      }
      return false;
    },

    // --- 节点操作 ---
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
      this.persist()
    },

    updateNodeFont(id: string, sizeDelta: number, toggleBold: boolean = false) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        this.saveHistory()
        if (sizeDelta !== 0) {
          const currentSize = node.fontSize || 14
          node.fontSize = Math.min(Math.max(currentSize + sizeDelta, 12), 32)
        }
        if (toggleBold) {
          node.isBold = !node.isBold
        }
        this.persist()
      }
    },

    updateNodeSize(id: string, width: number, height: number) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        node.width = width
        node.height = height
        // 尺寸更新频繁，不在此处调用 saveHistory
        this.persist()
      }
    },

    updateNodeColor(id: string, color: string) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        this.saveHistory()
        node.color = color
        this.persist()
      }
    },

    addChild(parentId: string) {
      const parent = this.nodes.find(n => n.id === parentId)
      if (!parent) return
      this.saveHistory()
      
      const newNode: MindNode = {
        id: Date.now().toString(),
        text: '新分支',
        x: parent.x + 200,
        y: parent.y + (Math.random() - 0.5) * 100,
        parentId: parentId,
        isEditing: true,
        isCollapsed: false, 
        width: 100,
        height: 40
      }
      this.nodes.push(newNode)
      this.persist()
    },

    deleteNode(id: string) {
      this.saveHistory()
      const idsToDelete: string[] = []
      const collect = (nodeId: string) => {
        idsToDelete.push(nodeId)
        this.nodes.filter(n => n.parentId === nodeId).forEach(child => collect(child.id))
      }
      collect(id)
      this.nodes = this.nodes.filter(n => !idsToDelete.includes(n.id))
      this.persist()
    },

    // --- 剪贴板操作 ---
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
      // 注意：复制不需要 persist
    },

    pasteBranch(newParentId: string) {
      if (this.clipboard.length === 0) return
      const parent = this.nodes.find(n => n.id === newParentId)
      if (!parent) return

      this.saveHistory()

      const idMap = new Map<string, string>()
      const timestamp = Date.now()
      this.clipboard.forEach((node, idx) => {
        idMap.set(node.id, `${timestamp}-${idx}`)
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
      this.persist()
    },

    toggleCollapse(id: string) {
      const node = this.nodes.find(n => n.id === id)
      if (node) {
        this.saveHistory()
        node.isCollapsed = !node.isCollapsed
        this.persist()
      }
    },

    autoLayout() {
      this.saveHistory()
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
      this.persist()
    },

    addRootNode(x: number, y: number) {
      this.saveHistory()
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
      this.persist()
    }
  }
})