# 前端集成指南 - 素材缓存多版本功能

## 功能概述

实现了智能的素材缓存加载和AI精修逻辑：

1. **点击"进一步编辑"** → 自动加载历史版本（如果有）
2. **点击"AI精修"** → 始终生成新版本

## API更新

### 1. `/api/export_final` (POST) - 已更新

**新增参数**：
- `force_regenerate`: `boolean` - 是否强制重新生成
  - `false`: 优先使用缓存（进一步编辑）
  - `true`: 强制AI精修生成新版本（AI精修按钮）

**请求示例**：

```javascript
// 场景1：点击"进一步编辑" - 加载历史版本
fetch('/api/export_final', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        png_base64: canvasDataUrl,
        background_color: bgColor,
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType,
        force_regenerate: false  // 优先使用缓存
    })
});

// 场景2：点击"AI精修" - 生成新版本
fetch('/api/export_final', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        png_base64: canvasDataUrl,
        background_color: bgColor,
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType,
        force_regenerate: true  // 强制生成新版本
    })
});
```

**返回值增强**：

```json
{
    "success": true,
    "image_path": "buffer/Space/export_final.png",
    "from_cache": true,  // 是否来自缓存
    "version": 2,  // 当前版本号
    "total_versions": 3  // 总版本数
}
```

### 2. `/api/ai_direct_generate` (POST) - 已更新

**新增参数**：
- `force_regenerate`: `boolean` - 同上

**请求示例**：

```javascript
// 场景1：进一步编辑 - 优先使用缓存
fetch('/api/ai_direct_generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        chart_svg: svgContent,
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType,
        force_regenerate: false  // 优先使用缓存
    })
});

// 场景2：AI精修 - 生成新版本
fetch('/api/ai_direct_generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        chart_svg: svgContent,
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType,
        force_regenerate: true  // 强制生成新版本
    })
});
```

### 3. `/api/material_history` (POST) - 获取历史版本

**用途**：查询指定素材的所有历史版本

**请求示例**：

```javascript
fetch('/api/material_history', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType
    })
})
.then(res => res.json())
.then(data => {
    console.log('总版本数:', data.total_versions);
    data.versions.forEach(v => {
        console.log(`版本${v.version}:`, v.url, v.timestamp);
    });
});
```

**返回示例**：

```json
{
    "found": true,
    "total_versions": 3,
    "versions": [
        {
            "version": 1,
            "url": "currentfilepath/history_v1.jpg",
            "timestamp": "2025-11-23T12:00:00",
            "method": "refine"
        },
        {
            "version": 2,
            "url": "currentfilepath/history_v2.jpg",
            "timestamp": "2025-11-23T12:05:00",
            "method": "refine"
        },
        {
            "version": 3,
            "url": "currentfilepath/history_v3.jpg",
            "timestamp": "2025-11-23T12:10:00",
            "method": "refine"
        }
    ]
}
```

## 完整前端实现示例

### 1. 页面进入时加载历史版本

```javascript
// 在"进一步编辑"页面加载时
async function initEditPage() {
    // 1. 查询历史版本
    const historyResponse = await fetch('/api/material_history', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            title: currentTitle,
            pictogram: currentPictogram,
            chart_type: currentChartType
        })
    });

    const historyData = await historyResponse.json();

    if (historyData.found && historyData.total_versions > 0) {
        console.log(`找到 ${historyData.total_versions} 个历史版本`);

        // 2. 显示历史标记
        showHistoryIndicator(historyData.total_versions);

        // 3. 自动加载最新版本（使用缓存）
        loadCachedVersion();

        // 4. 提供历史版本浏览功能
        historyVersions = historyData.versions;
    } else {
        console.log('首次编辑，无历史版本');
    }
}

// 加载缓存版本（最新）
async function loadCachedVersion() {
    const response = await fetch('/api/export_final', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            png_base64: getCurrentCanvasDataUrl(),
            background_color: getBgColor(),
            title: currentTitle,
            pictogram: currentPictogram,
            chart_type: currentChartType,
            force_regenerate: false  // 使用缓存
        })
    });

    const result = await response.json();

    if (result.success) {
        if (result.from_cache) {
            console.log(`加载了缓存版本 ${result.version}`);
            showMessage(`已加载版本${result.version}（共${result.total_versions}个版本）`);
        }
        displayResult(result.image_path);
    }
}
```

### 2. AI精修按钮 - 生成新版本

```javascript
// 点击"AI精修"按钮
async function onAIRefineClick() {
    showLoading('正在AI精修...');

    const response = await fetch('/api/export_final', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            png_base64: getCurrentCanvasDataUrl(),
            background_color: getBgColor(),
            title: currentTitle,
            pictogram: currentPictogram,
            chart_type: currentChartType,
            force_regenerate: true  // 强制生成新版本
        })
    });

    const result = await response.json();

    hideLoading();

    if (result.success) {
        // 获取版本信息
        const versionInfo = result.cache_info || {};
        const newVersion = versionInfo.version || 1;
        const totalVersions = versionInfo.total_versions || 1;

        showMessage(`AI精修完成！已保存为版本${newVersion}（共${totalVersions}个版本）`);
        displayResult(result.image_path);

        // 更新历史列表
        refreshHistoryList();
    } else {
        showError('AI精修失败: ' + result.error);
    }
}
```

### 3. 历史版本浏览功能

```javascript
// 显示历史版本列表
function showHistoryPanel() {
    const panel = document.getElementById('history-panel');
    panel.innerHTML = '';

    // 添加标题
    panel.innerHTML += `<h3>历史版本（共${historyVersions.length}个）</h3>`;

    // 显示每个版本
    historyVersions.forEach(version => {
        const versionEl = document.createElement('div');
        versionEl.className = 'history-item';
        versionEl.innerHTML = `
            <img src="${version.url}" alt="版本${version.version}">
            <div class="version-info">
                <span class="version-number">版本 ${version.version}</span>
                <span class="version-time">${formatTimestamp(version.timestamp)}</span>
            </div>
        `;

        // 点击查看大图
        versionEl.onclick = () => viewVersion(version);

        panel.appendChild(versionEl);
    });

    // 显示面板
    panel.style.display = 'block';
}

// 查看特定版本
function viewVersion(version) {
    showImageModal(version.url, `版本${version.version}`);
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
```

### 4. UI界面建议

```html
<!-- 编辑页面布局 -->
<div class="edit-page">
    <!-- 主编辑区 -->
    <div class="main-editor">
        <canvas id="editor-canvas"></canvas>

        <!-- 操作按钮 -->
        <div class="actions">
            <button onclick="onAIRefineClick()" class="btn-primary">
                AI精修（生成新版本）
            </button>
            <button onclick="showHistoryPanel()" class="btn-secondary">
                查看历史
                <span id="history-badge" class="badge"></span>
            </button>
        </div>
    </div>

    <!-- 历史版本面板（侧边栏） -->
    <div id="history-panel" class="history-sidebar" style="display: none;">
        <!-- 通过JavaScript动态填充 -->
    </div>
</div>

<style>
.history-badge {
    background: #ff4444;
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 12px;
    margin-left: 5px;
}

.history-sidebar {
    width: 300px;
    background: #f5f5f5;
    padding: 20px;
    overflow-y: auto;
}

.history-item {
    margin-bottom: 15px;
    cursor: pointer;
    border: 2px solid transparent;
    padding: 10px;
    border-radius: 8px;
}

.history-item:hover {
    border-color: #4CAF50;
    background: white;
}

.history-item img {
    width: 100%;
    border-radius: 4px;
}

.version-info {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 14px;
}

.version-number {
    font-weight: bold;
    color: #333;
}

.version-time {
    color: #666;
    font-size: 12px;
}
</style>
```

## 用户体验流程

### 流程1：首次编辑（无历史）

```
1. 用户点击"进一步编辑"
   ↓
2. 系统查询历史版本
   - API: /api/material_history
   - 结果: found=false
   ↓
3. 显示"首次编辑"提示
   ↓
4. 用户点击"AI精修"
   - API: /api/export_final (force_regenerate=true)
   - 生成版本1
   ↓
5. 显示"AI精修完成！已保存为版本1"
```

### 流程2：再次编辑（有历史）

```
1. 用户点击"进一步编辑"
   ↓
2. 系统查询历史版本
   - API: /api/material_history
   - 结果: found=true, total_versions=3
   ↓
3. 自动加载最新版本（版本3）
   - API: /api/export_final (force_regenerate=false)
   - 从缓存加载
   ↓
4. 显示"已加载版本3（共3个版本）"
   - 显示历史标记：历史×3
   ↓
5. 用户可以：
   a) 点击"查看历史" → 浏览所有版本
   b) 点击"AI精修" → 生成版本4
```

### 流程3：查看历史版本

```
1. 用户点击"查看历史×3"按钮
   ↓
2. 显示侧边栏，展示所有版本：
   - 版本3 (2025-11-23 15:20)  ← 最新
   - 版本2 (2025-11-23 15:10)
   - 版本1 (2025-11-23 15:00)
   ↓
3. 用户点击某个版本查看大图
```

## 状态提示文案

建议使用以下提示文案：

| 场景 | 提示文案 |
|------|---------|
| 加载历史版本 | "已加载版本{n}（共{total}个版本）" |
| AI精修完成 | "AI精修完成！已保存为版本{n}（共{total}个版本）" |
| 首次编辑 | "首次编辑，暂无历史版本" |
| 正在AI精修 | "正在AI精修，请稍候..." |
| 正在加载 | "正在加载历史版本..." |

## 注意事项

1. **素材信息必须完整**：确保传递所有素材信息（title, pictogram, chart_type）
2. **force_regenerate参数**：
   - 进一步编辑：传`false`或不传（默认false）
   - AI精修：传`true`
3. **版本号显示**：在UI中明确显示当前版本和总版本数
4. **历史浏览**：提供便捷的历史版本浏览功能

## 调试建议

添加调试日志：

```javascript
// 开启调试模式
const DEBUG = true;

function debugLog(message, data) {
    if (DEBUG) {
        console.log(`[素材缓存] ${message}`, data);
    }
}

// 使用示例
debugLog('查询历史版本', { title, pictogram, chart_type });
debugLog('加载缓存结果', { from_cache, version, total_versions });
```

## 完成状态

✅ 后端API已完成
✅ 版本管理已实现
✅ 缓存逻辑已优化
⏳ 前端集成待完成（参考本文档）
