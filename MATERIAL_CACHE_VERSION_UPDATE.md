# 素材缓存多版本功能更新

## 更新概述

现在素材缓存支持同一组素材的多次AI精修，并为每次精修自动编号保存。用户可以查看同一素材组合的所有历史生成结果。

## 核心改进

### 1. 多版本存储

**之前**：同一素材只保存最新一次的结果
```
buffer/material_cache/
└── {hash}.jpg  # 只有一个版本
```

**现在**：同一素材保存所有历史版本
```
buffer/material_cache/
├── {hash}_v1.jpg  # 第1次精修
├── {hash}_v2.jpg  # 第2次精修
└── {hash}_v3.jpg  # 第3次精修
```

### 2. 索引结构更新

**之前的索引结构**：
```json
{
  "hash_key": {
    "materials": {...},
    "cache_path": "path/to/image.jpg",
    "method": "refine",
    "timestamp": "2025-11-23T12:00:00"
  }
}
```

**现在的索引结构**：
```json
{
  "hash_key": {
    "materials": {...},
    "versions": [
      {
        "version": 1,
        "cache_path": "buffer/material_cache/hash_v1.jpg",
        "method": "refine",
        "timestamp": "2025-11-23T12:00:00",
        "success": true
      },
      {
        "version": 2,
        "cache_path": "buffer/material_cache/hash_v2.jpg",
        "method": "refine",
        "timestamp": "2025-11-23T12:05:00",
        "success": true
      },
      {
        "version": 3,
        "cache_path": "buffer/material_cache/hash_v3.jpg",
        "method": "refine",
        "timestamp": "2025-11-23T12:10:00",
        "success": true
      }
    ]
  }
}
```

## 更新的函数

### 1. `save_to_material_cache()`

**返回值变化**：
- **之前**：返回 `str` (缓存key)
- **现在**：返回 `dict` (包含缓存key、版本号、总版本数)

```python
# 返回示例
{
    'cache_key': '598cba7b18a919cae344268ab0ec78ab',
    'version': 3,  # 新增：当前版本号
    'total_versions': 3  # 新增：总版本数
}
```

### 2. `check_material_cache()`

**返回值扩展**：
- **之前**：只返回最新版本
- **现在**：返回所有历史版本

```python
# 返回示例
{
    'found': True,
    'cache_key': '598cba7b18a919cae344268ab0ec78ab',
    'latest_version': {  # 新增：最新版本信息
        'version': 3,
        'cache_path': 'buffer/material_cache/xxx_v3.jpg',
        'timestamp': '2025-11-23T12:10:00',
        'method': 'refine'
    },
    'all_versions': [  # 新增：所有版本列表
        {'version': 1, 'cache_path': '...', ...},
        {'version': 2, 'cache_path': '...', ...},
        {'version': 3, 'cache_path': '...', ...}
    ],
    'total_versions': 3,  # 新增：总版本数
    # 向后兼容字段
    'cache_path': 'buffer/material_cache/xxx_v3.jpg',
    'cache_info': {...}
}
```

## 新增API

### `/api/material_history` (POST)

获取指定素材组合的所有精修历史版本。

**请求参数**：
```json
{
  "title": "title_0_abc123.png",
  "pictogram": "pictogram_1_def456.png",
  "chart_type": "Vertical Bar Chart"
}
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

## 使用流程

### 场景1：用户首次精修
```
用户选择素材 → 点击"AI精修" → 生成版本1 → 保存为 hash_v1.jpg
```

### 场景2：用户对相同素材再次精修
```
用户使用相同素材 → 点击"AI精修" → 生成版本2 → 保存为 hash_v2.jpg
版本1仍然保留，可以查看历史
```

### 场景3：用户查看历史版本
```
用户点击"查看历史" → 调用 /api/material_history → 返回所有版本列表
用户可以浏览所有历史生成结果
```

## 前端集成建议

### 1. 在预览页面显示历史版本数量

```javascript
// 在"进一步编辑"按钮旁显示
fetch('/api/material_history', {
    method: 'POST',
    body: JSON.stringify({
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType
    })
}).then(res => res.json())
  .then(data => {
      if (data.found && data.total_versions > 0) {
          showHistoryBadge(data.total_versions);  // 显示"历史×3"
      }
  });
```

### 2. 展示历史版本列表

```javascript
// 点击"查看历史"时
function showHistory() {
    fetch('/api/material_history', {
        method: 'POST',
        body: JSON.stringify({...})
    }).then(res => res.json())
      .then(data => {
          const historyPanel = createHistoryPanel();
          data.versions.forEach(version => {
              historyPanel.addVersion({
                  version: version.version,
                  imageUrl: version.url,
                  timestamp: new Date(version.timestamp).toLocaleString()
              });
          });
          historyPanel.show();
      });
}
```

### 3. 用户操作流程

```
1. 用户进入"进一步编辑"页面
   ↓
2. 自动调用 /api/material_history 检查历史
   ↓
3. 如果有历史版本（total_versions > 0）：
   - 在界面上显示"历史×N"标记
   - 用户可以点击查看所有历史版本
   ↓
4. 用户点击"AI精修"：
   - 生成新的版本（版本号 N+1）
   - 自动保存到缓存
   - 更新历史列表
```

## 技术细节

### 版本号生成规则
- 版本号从1开始
- 每次保存自动递增
- 版本号永不重复

### 文件命名规则
```
{cache_key}_v{version}.jpg

示例：
598cba7b18a919cae344268ab0ec78ab_v1.jpg
598cba7b18a919cae344268ab0ec78ab_v2.jpg
598cba7b18a919cae344268ab0ec78ab_v3.jpg
```

### 兼容性
- 保持向后兼容：`check_material_cache()` 仍返回 `cache_path` 字段（指向最新版本）
- 新代码可以使用 `latest_version` 和 `all_versions` 字段获取更详细信息

## 测试结果

所有测试用例通过 ✓

```bash
$ python test_material_cache.py

============================================================
测试素材缓存功能
============================================================

1. 测试创建缓存key
✓ 缓存key生成测试通过

2. 测试检查不存在的缓存
✓ 未找到缓存测试通过

3. 测试保存和查找缓存（多版本）
  第1次保存: 版本1, 总版本数1
  第2次保存: 版本2, 总版本数2
  第3次保存: 版本3, 总版本数3
  找到 3 个历史版本
  版本 1: buffer/material_cache/598cba...v1.jpg
  版本 2: buffer/material_cache/598cba...v2.jpg
  版本 3: buffer/material_cache/598cba...v3.jpg
✓ 多版本保存和查找测试通过

4. 测试路径提取功能
✓ 路径提取测试通过

============================================================
所有测试通过！✓
============================================================
```

## 文件变更清单

### 修改的文件
1. **chart_modules/style_refinement.py**
   - `save_to_material_cache()` - 支持多版本保存
   - `check_material_cache()` - 返回所有版本
   - `process_final_export()` - 适配新返回格式
   - `direct_generate_with_ai()` - 适配新返回格式

2. **app.py**
   - 新增 `/api/material_history` 路由
   - 导入 `check_material_cache` 函数

3. **test_material_cache.py**
   - 更新为多版本测试用例

### 新增的文件
- 无（在原有基础上扩展）

## 优势

1. **保留历史**：用户可以回顾所有生成版本，选择最满意的
2. **安全性**：新版本不会覆盖旧版本，避免数据丢失
3. **可追溯**：每个版本都有时间戳，可以追溯生成历史
4. **灵活性**：用户可以多次尝试，不用担心丢失之前的结果

## 下一步建议

1. **版本管理界面**：添加历史版本浏览和对比功能
2. **版本限制**：设置最大版本数（如保留最近10个版本）
3. **存储优化**：定期清理过期版本
4. **版本标注**：允许用户为特定版本添加标注或收藏

## 更新日期
2025-11-23
