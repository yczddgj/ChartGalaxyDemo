# ChartGalaxy - 信息图表生成器

这是一个前后端分离的应用：后端基于 Flask，前端位于 `frontend/` 目录并使用现代化 React 工作台来展示数据与生成信息图表。

## 功能特点

- 🎨 **精美的用户界面** - 现代化的渐变设计和流畅的动画效果
- 📊 **数据选择与预览** - 选择processed_data中的CSV文件并以表格形式展示
- 🚀 **智能生成流程** - 模拟真实的图表生成过程，包含多个步骤
- 🖼️ **结果展示** - 自动显示infographics文件夹中对应的PNG图片
- 📱 **响应式设计** - 适配不同屏幕尺寸

## 安装和运行

### 后端（Flask）

1. 安装依赖：
```bash
pip install -r requirements.txt
```

2. 运行应用：
```bash
python app.py
```

### 前端（React）

1. 安装依赖：
```bash
cd frontend
npm install
```

2. 启动开发服务器：
```bash
npm run dev
```

默认通过 `http://localhost:5173` 访问前端界面，前端会通过代理与 Flask 后端交互。

## 使用方法（前端）

1. 在"数据选择与预览"区域选择一个数据集
2. 查看数据表格预览
3. 选择合适的图表样式、标题和配图素材
4. 调整素材位置
5. 查看生成的信息图表
6. 使用大模型进行精修


## 技术栈

- **后端**: Python Flask
- **前端**: React + Vite + Fabric.js
- **数据处理**: Pandas

- **UI设计**: 现代化渐变设计 

