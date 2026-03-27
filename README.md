# MindMap 思维导图组件

一个基于 Vue 3 + TypeScript 构建的交互式思维导图组件，支持节点拖拽、缩放、公式渲染、颜色标记等功能。

## ✨ 功能特性

### 🎯 核心功能
- **节点管理**：创建/删除节点、添加子节点、拖拽移动
- **可视化操作**：画布缩放、平移、自动布局、视角重置
- **公式支持**：内嵌 KaTeX 公式渲染（使用 `$公式$` 语法）
- **颜色标记**：6种预设颜色快速标记节点
- **折叠展开**：支持分支节点的折叠/展开

### 🛠️ 交互特性
- **智能工具栏**：根据选中状态动态显示操作按钮
- **拖拽体验**：流畅的节点拖拽和画布平移
- **快捷键支持**：双击编辑、Enter键确认
- **剪贴板操作**：支持分支复制粘贴
- **响应式设计**：自适应节点尺寸变化

### 🎨 视觉设计
- **现代化UI**：毛玻璃效果工具栏、平滑动画
- **视觉反馈**：选中高亮、悬停效果、操作提示
- **网格背景**：辅助对齐的网格背景
- **贝塞尔曲线**：美观的节点连接线

## 📦 安装依赖

```bash
# 必需依赖
npm install vue@3 katex

# 可选：TypeScript 类型支持
npm install -D @types/katex
```

## 🚀 快速开始

### 1. 导入组件

```vue
<template>
  <MindMap />
</template>

<script setup>
import MindMap from './components/MindMap.vue'
</script>
```

### 2. 使用 Pinia Store（必需）

创建 `stores/mindmap.ts`：

```typescript
import { defineStore } from 'pinia'

export interface MindNode {
  id: string
  text: string
  x: number
  y: number
  width?: number
  height?: number
  parentId: string | null
  color?: string
  isCollapsed?: boolean
  isEditing?: boolean
}

export const useMindMapStore = defineStore('mindmap', {
  state: () => ({
    nodes: [] as MindNode[],
    dragNodeId: null as string | null,
    offset: { x: 0, y: 0 },
    clipboard: [] as MindNode[]
  }),
  actions: {
    // 实现以下方法：
    // addRootNode(x, y), addChild(parentId), deleteNode(id)
    // updateNodeColor(id, color), toggleCollapse(id)
    // copyBranch(id), pasteBranch(parentId), autoLayout()
    // updateNodeSize(id, width, height)
  }
})
```

## 🎮 使用指南

### 基本操作
1. **创建节点**：双击画布空白处
2. **编辑节点**：双击节点文本
3. **添加子节点**：选中节点 → 点击"➕ 子节点"
4. **删除节点**：选中节点 → 点击"🗑️ 删除"
5. **移动节点**：拖拽节点到新位置
6. **平移画布**：拖拽画布背景
7. **缩放画布**：使用鼠标滚轮

### 高级功能
- **公式输入**：在节点文本中使用 `$E=mc^2$` 语法
- **颜色标记**：选中节点 → 点击颜色圆点
- **分支操作**：选中节点 → 使用"复制/粘贴"操作整个分支
- **自动布局**：点击工具栏"🪄 布局"按钮
- **重置视角**：点击工具栏"🎯 重置"按钮

## 📝 技术细节

### 组件结构
```
MindMap.vue
├── 模板层 (Template)
│   ├── 工具栏 (动态显示)
│   ├── SVG画布
│   │   ├── 连接线 (贝塞尔曲线)
│   │   └── 节点组 (ForeignObject)
│   └── 操作提示
├── 脚本层 (Script)
│   ├── 状态管理 (Pinia Store)
│   ├── 视图变换 (缩放/平移)
│   ├── 可见性计算
│   └── 指令系统
└── 样式层 (Style)
    ├── 工具栏样式
    ├── 节点样式
    └── 动画效果
```

### 关键实现
1. **视图变换系统**：基于矩阵变换的缩放和平移
2. **节点可见性**：递归检查父节点折叠状态
3. **尺寸观察**：ResizeObserver 监听节点尺寸变化
4. **公式渲染**：KaTeX 实时渲染，支持错误回退
5. **连接线计算**：基于节点位置的贝塞尔曲线生成

## 🎨 自定义配置

### 修改颜色预设
```typescript
// 在组件中修改 colorPresets 数组
const colorPresets = [
  '#ffffff', // 默认白色
  '#fecaca', // 浅红
  // ... 添加更多颜色
]
```

### 调整样式变量
```css
/* 修改以下CSS变量自定义外观 */
--primary-color: #3b82f6;    /* 主色调 */
--grid-color: #cbd5e1;       /* 网格颜色 */
--border-radius: 8px;        /* 圆角大小 */
--shadow-intensity: 0.1;     /* 阴影强度 */
```

## 📱 浏览器兼容性

- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

**注意**：需要支持 ResizeObserver API

## 🔧 开发说明

### 项目结构建议
```
src/
├── components/
│   └── MindMap.vue
├── stores/
│   └── mindmap.ts
└── App.vue
```

### 状态管理要求
组件依赖的 Pinia Store 需要实现以下方法：

| 方法 | 参数 | 说明 |
|------|------|------|
| `addRootNode` | `(x: number, y: number)` | 在指定位置添加根节点 |
| `addChild` | `(parentId: string)` | 为节点添加子节点 |
| `deleteNode` | `(id: string)` | 删除节点及其子节点 |
| `updateNodeColor` | `(id: string, color: string)` | 更新节点颜色 |
| `toggleCollapse` | `(id: string)` | 切换节点折叠状态 |
| `copyBranch` | `(id: string)` | 复制分支到剪贴板 |
| `pasteBranch` | `(parentId: string)` | 粘贴分支到指定节点 |
| `autoLayout` | `()` | 自动布局所有节点 |
| `updateNodeSize` | `(id: string, w: number, h: number)` | 更新节点尺寸 |

## 🐛 常见问题

### Q: 节点无法拖拽
A: 确保 Pinia Store 中的 `dragNodeId` 和 `offset` 状态正确更新

### Q: 公式不渲染
A: 检查 KaTeX 是否正确导入，公式语法为 `$公式$`

### Q: 连接线位置偏移
A: 节点尺寸变化后需要调用 `updateNodeSize` 更新存储

### Q: 性能问题
A: 大量节点时建议启用虚拟滚动（当前版本未实现）

## 📄 许可证

MIT License

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📞 支持

如有问题或建议，请提交 Issue 或联系维护者。

---

**提示**：双击画布空白处创建新主题，双击节点编辑内容，使用 `$公式$` 语法输入数学公式！