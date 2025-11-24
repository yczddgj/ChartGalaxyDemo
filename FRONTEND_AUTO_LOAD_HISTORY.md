# 前端自动加载精修历史功能说明

## 功能概述

在标题和配图都加载到画布后，前端会自动读取并显示该素材组合的所有精修历史版本。

## 实现逻辑

### 1. 自动加载历史（进一步编辑时）

**触发时机**：当标题（`titleImage`）和配图（`selectedPictograms`）都可用时

**实现位置**：`Workbench.jsx` 第 749-797 行

```javascript
useEffect(() => {
    const loadRefinementHistory = async () => {
        // 只有当所有必需的素材都存在时才加载历史
        if (!titleImage || !selectedPictograms || selectedPictograms.length === 0 || !selectedVariation) {
            return;
        }

        try {
            const response = await axios.post('/api/material_history', {
                title: titleImage,
                pictogram: selectedPictograms[0],
                chart_type: selectedVariation
            });

            if (response.data.found && response.data.versions && response.data.versions.length > 0) {
                // 转换版本数据为前端显示格式
                const historyImages = response.data.versions.map(version => ({
                    url: `/${version.url}?t=${Date.now()}`,
                    timestamp: new Date(version.timestamp).getTime(),
                    version: version.version,
                    fromHistory: true  // 标记为历史版本
                }));

                // 设置精修图片列表
                setRefinedImages(historyImages);
                console.log('Loaded refinement history:', historyImages.length, 'images');
            } else {
                // 没有历史记录时清空
                setRefinedImages([]);
            }
        } catch (error) {
            console.error('Failed to load refinement history:', error);
        }
    };

    loadRefinementHistory();
}, [titleImage, selectedPictograms, selectedVariation]);
```

### 2. AI精修生成新版本

**触发时机**：用户点击"AI精修"按钮

**实现位置**：`Workbench.jsx` 第 1268-1315 行

```javascript
const handleRefine = async () => {
    // ... 前置检查 ...

    const response = await axios.post('/api/export_final', {
        png_base64: pngDataURL,
        background_color: backgroundColor,
        title: titleImage,
        pictogram: selectedPictograms.length > 0 ? selectedPictograms[0] : '',
        chart_type: selectedVariation,
        force_regenerate: true  // 关键：强制生成新版本
    });

    // ... 轮询状态 ...
};
```

### 3. 精修完成后刷新历史

**实现位置**：`Workbench.jsx` 第 1317-1380 行

```javascript
const pollRefinementStatus = async () => {
    while (attempts < maxAttempts) {
        const response = await axios.get('/api/status');
        const status = response.data;

        if (status.step === 'final_export' && status.completed) {
            if (status.status === 'completed') {
                // 精修成功后，重新加载完整历史
                const historyResponse = await axios.post('/api/material_history', {
                    title: titleImage,
                    pictogram: selectedPictograms[0],
                    chart_type: selectedVariation
                });

                if (historyResponse.data.found) {
                    const historyImages = historyResponse.data.versions.map(version => ({
                        url: `/${version.url}?t=${Date.now()}`,
                        timestamp: new Date(version.timestamp).getTime(),
                        version: version.version,
                        fromHistory: true
                    }));

                    setRefinedImages(historyImages);  // 更新显示所有版本
                }
                return;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
    }
};
```

## 用户体验流程

### 场景1：首次编辑（无历史）

```
1. 用户选择数据集 → 图表类型 → 变体 → 参考图
   ↓
2. 系统生成标题和配图
   ↓
3. 标题和配图都加载到画布后
   - 调用 /api/material_history
   - 返回 found=false
   ↓
4. "精修历史"面板显示：
   "还没有精修图片，点击左侧的'AI 精修'按钮开始"
   ↓
5. 用户点击"进一步编辑"按钮
   ↓
6. 用户点击"AI精修"
   - 发送请求：force_regenerate=true
   - 生成新的版本1
   ↓
7. 精修完成后自动刷新历史
   - 显示：1张图片（版本1）
```

### 场景2：再次编辑（有历史）

```
1. 用户再次选择相同的素材组合
   ↓
2. 标题和配图加载完成后
   - 自动调用 /api/material_history
   - 返回 found=true, total_versions=3
   ↓
3. "精修历史"面板自动显示历史版本：
   [图片] #3 (最新)
   [图片] #2
   [图片] #1 (最早)
   ↓
4. 用户可以：
   a) 点击历史图片查看大图
   b) 点击"AI精修"生成新的版本4
   ↓
5. 如果点击"AI精修"：
   - 发送请求：force_regenerate=true
   - 生成新的版本4
   - 自动刷新历史显示所有4个版本
```

## 关键参数说明

### `force_regenerate` 参数

- **值**：`true` 或 `false`
- **作用**：控制是否使用缓存还是生成新版本

| 场景 | force_regenerate | 行为 |
|------|------------------|------|
| 进一步编辑（自动加载） | `false`（默认） | 使用缓存的最新版本 |
| AI精修按钮 | `true` | 强制生成新版本 |

### 素材信息参数

```javascript
{
    title: "title_0_abc123.png",           // 标题文件名
    pictogram: "pictogram_1_def456.png",   // 配图文件名
    chart_type: "Vertical Bar Chart"       // 图表类型
}
```

## 数据流向

```
用户操作
   ↓
选择素材（标题、配图、图表类型）
   ↓
useEffect 检测到素材变化
   ↓
POST /api/material_history
   {
       title: "title_0.png",
       pictogram: "pictogram_1.png",
       chart_type: "Vertical Bar Chart"
   }
   ↓
后端查询缓存
   ↓
返回历史版本列表
   {
       found: true,
       total_versions: 3,
       versions: [
           {version: 1, url: "...", timestamp: "..."},
           {version: 2, url: "...", timestamp: "..."},
           {version: 3, url: "...", timestamp: "..."}
       ]
   }
   ↓
前端更新 refinedImages 状态
   ↓
"精修历史"面板显示所有版本
```

## UI显示

### 精修历史面板（右侧列）

```
┌─────────────────────────────────┐
│ ✨ 精修历史          3 张图片    │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────┐              │
│  │   [图片]      │ #3 (最新)    │
│  └───────────────┘              │
│                                 │
│  ┌───────────────┐              │
│  │   [图片]      │ #2           │
│  └───────────────┘              │
│                                 │
│  ┌───────────────┐              │
│  │   [图片]      │ #1 (最早)    │
│  └───────────────┘              │
│                                 │
└─────────────────────────────────┘
```

### 无历史时的提示

```
┌─────────────────────────────────┐
│ ✨ 精修历史          0 张图片    │
├─────────────────────────────────┤
│                                 │
│         🎨                      │
│                                 │
│    还没有精修图片                │
│  点击左侧的"AI 精修"按钮开始     │
│                                 │
└─────────────────────────────────┘
```

## 技术要点

1. **自动触发**：使用 `useEffect` 监听素材变化，自动加载历史
2. **版本标记**：每个历史图片都带有 `version` 和 `fromHistory` 标记
3. **时间戳**：使用 `?t=${Date.now()}` 避免浏览器缓存
4. **错误处理**：加载历史失败时不影响正常使用，保持现有状态
5. **增量更新**：新精修完成后，重新加载完整历史而不是追加

## 测试建议

### 测试用例1：首次使用

1. 选择数据集 → Space
2. 选择图表类型 → Vertical Bar Chart
3. 选择变体 → 任意
4. 选择参考图 → 任意
5. 等待标题和配图生成完成
6. 点击"进一步编辑"
7. 验证：精修历史面板显示"还没有精修图片"
8. 点击"AI精修"
9. 等待精修完成
10. 验证：精修历史面板显示1张图片（#1）

### 测试用例2：再次使用相同素材

1. 使用与测试用例1相同的素材组合
2. 等待标题和配图加载完成
3. 点击"进一步编辑"
4. 验证：精修历史面板**自动**显示1张图片（#1）
5. 点击"AI精修"
6. 等待精修完成
7. 验证：精修历史面板显示2张图片（#2和#1）

### 测试用例3：切换不同素材

1. 选择不同的标题选项
2. 验证：精修历史面板自动更新（可能为空或显示该组合的历史）
3. 选择不同的配图
4. 验证：精修历史面板自动更新

## 调试日志

在浏览器控制台可以看到：

```
Loading refinement history for materials: {
  titleImage: "title_0_abc123.png",
  pictogram: "pictogram_1_def456.png",
  chart_type: "Vertical Bar Chart"
}
Found 3 historical versions
Loaded refinement history: 3 images
```

或：

```
Loading refinement history for materials: {...}
No refinement history found for these materials
```

## 完成状态

✅ 后端API已完成（`/api/material_history`）
✅ 前端自动加载逻辑已实现
✅ 精修时传递素材信息
✅ 精修完成后自动刷新历史
✅ UI正确显示历史版本

## 更新日期

2025-11-23
