# 素材缓存功能说明

## 概述

素材缓存功能在AI精修过程中记录使用的所有素材（标题、配图、参考图、variation等），并为每种素材组合生成唯一的缓存标识。当下次预览时使用相同的素材组合，系统会自动从缓存中加载历史生成结果，无需重新调用AI接口，大大提高了效率。

## 功能特性

### 1. 自动缓存管理
- **自动保存**：AI精修完成后自动保存结果到缓存
- **自动检查**：预览时自动检查是否有相同素材的历史结果
- **智能匹配**：基于素材组合生成唯一hash key，确保精确匹配

### 2. 支持的素材类型
- **标题 (title)**：标题图片文件
- **配图 (pictogram)**：配图图片文件
- **参考图 (reference)**：参考信息图表文件
- **Variation**：选择的图表样式
- **图表类型 (chart_type)**：选择的图表类型

### 3. 缓存存储
- **存储位置**：`buffer/material_cache/`
- **索引文件**：`buffer/material_cache/index.json`
- **图片文件**：以缓存key命名的jpg文件

## 实现细节

### 核心函数

#### 1. `create_material_key(materials: dict) -> str`
根据素材信息生成唯一的MD5 hash key。

```python
materials = {
    'title': 'title_0_abc123.png',
    'pictogram': 'pictogram_1_def456.png',
    'reference': 'infographics/Art-Origin.png',
    'variation': 'vertical_bar_chart_01',
    'chart_type': 'Vertical Bar Chart'
}
key = create_material_key(materials)  # 返回MD5 hash
```

**特性**：
- 自动提取文件名（忽略路径）
- 按字母顺序排序，确保一致性
- 使用MD5生成32字符hash

#### 2. `save_to_material_cache(materials: dict, result_image_path: str, method: str) -> str`
保存AI精修结果到素材缓存。

```python
cache_key = save_to_material_cache(
    materials=materials,
    result_image_path='buffer/Space/export_final.png',
    method='refine'  # 或 'direct'
)
```

**功能**：
- 复制结果图片到缓存目录
- 更新索引文件
- 记录时间戳和素材信息

#### 3. `check_material_cache(materials: dict) -> dict`
检查素材缓存是否存在。

```python
result = check_material_cache(materials)
if result['found']:
    cache_path = result['cache_path']
    # 使用缓存的图片
```

**返回值**：
```python
{
    'found': True/False,
    'cache_key': 'hash_string',
    'cache_path': 'buffer/material_cache/xxx.jpg',
    'cache_info': {
        'materials': {...},
        'method': 'refine',
        'timestamp': '2025-11-23T15:21:28.097146',
        'success': True
    }
}
```

### 修改的文件

#### 1. `chart_modules/style_refinement.py`
- 添加素材缓存相关函数
- 修改 `process_final_export` 函数，增加 `materials` 参数
- 修改 `direct_generate_with_ai` 函数，增加 `materials` 参数
- 在函数开始时检查缓存，结束时保存缓存

#### 2. `app.py`
- 修改 `/api/export_final` 路由，从前端接收素材信息
- 修改 `/api/ai_direct_generate` 路由，从前端接收素材信息
- 构建 `materials` 字典并传递给精修函数
- 在进度提示中显示是否使用缓存

## 使用流程

### 后端流程

1. **接收请求**
   ```python
   # 从前端获取素材信息
   title = data.get('title', '')
   pictogram = data.get('pictogram', '')
   chart_type = data.get('chart_type', '')
   reference_image_path = generation_status.get('selected_reference')
   ```

2. **构建素材信息**
   ```python
   materials = {
       'title': title,
       'pictogram': pictogram,
       'reference': reference_image_path,
       'chart_type': chart_type,
       'variation': variation_name
   }
   ```

3. **调用精修函数**
   ```python
   result = process_final_export(
       png_base64=png_base64,
       reference_image_path=reference_image_path,
       session_id=session_id,
       background_color=background_color,
       materials=materials  # 传递素材信息
   )
   ```

4. **处理结果**
   ```python
   if result['success']:
       if result.get('from_cache'):
           print("使用缓存的结果")
       else:
           print("新生成的结果，已保存到缓存")
   ```

### 前端集成（需要修改）

前端需要在调用API时传递当前使用的素材信息：

```javascript
// 导出最终图片
fetch('/api/export_final', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        png_base64: canvasDataUrl,
        background_color: bgColor,
        title: currentTitle,          // 当前选中的标题
        pictogram: currentPictogram,  // 当前选中的配图
        chart_type: currentChartType  // 当前选中的图表类型
    })
});

// AI直接生成
fetch('/api/ai_direct_generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        chart_svg: svgContent,
        title: currentTitle,
        pictogram: currentPictogram,
        chart_type: currentChartType
    })
});
```

## 缓存策略

### 何时使用缓存
- 素材组合完全一致
- 缓存文件存在且有效

### 何时重新生成
- 素材组合发生变化（任何一个素材不同）
- 缓存文件不存在或已损坏
- 用户主动要求重新生成

## 性能优化

### 优势
1. **减少API调用**：相同素材直接使用缓存，节省成本
2. **提高响应速度**：从缓存读取比AI生成快几十倍
3. **用户体验**：预览时立即显示历史结果

### 缓存命中率优化建议
1. 文件名标准化（已实现）
2. 路径自动提取（已实现）
3. 定期清理过期缓存（待实现）

## 测试

运行测试脚本验证功能：

```bash
python test_material_cache.py
```

测试覆盖：
- ✅ 缓存key生成
- ✅ 相同素材生成相同key
- ✅ 不同素材生成不同key
- ✅ 路径自动提取
- ✅ 缓存保存和查找
- ✅ 缓存不存在时的处理

## 注意事项

1. **素材一致性**：只有完全相同的素材组合才会命中缓存
2. **路径无关**：文件路径不影响匹配，只看文件名
3. **缓存管理**：目前缓存永久保存，建议定期清理
4. **并发安全**：多线程环境下注意文件锁

## 未来改进

1. **缓存过期机制**：设置缓存有效期
2. **缓存大小限制**：限制缓存总大小，自动清理旧缓存
3. **缓存预热**：预先生成常用素材组合的缓存
4. **缓存统计**：记录缓存命中率等指标
5. **用户控制**：允许用户清除缓存或强制重新生成

## 示例

### 完整使用示例

```python
# 场景：用户使用相同素材多次预览

# 第一次：生成并缓存
materials = {
    'title': 'title_0_abc123.png',
    'pictogram': 'pictogram_1_def456.png',
    'reference': 'infographics/Art-Origin.png',
    'variation': 'vertical_bar_chart_01',
    'chart_type': 'Vertical Bar Chart'
}

result = process_final_export(..., materials=materials)
# 输出：正在使用AI生成...
# 结果：{'success': True, 'from_cache': False, 'cache_key': 'xxx'}

# 第二次：使用缓存
result = process_final_export(..., materials=materials)
# 输出：[素材缓存] 使用缓存的精修结果
# 结果：{'success': True, 'from_cache': True, 'cache_key': 'xxx'}
```

## 文件结构

```
buffer/
├── material_cache/                    # 素材缓存目录
│   ├── index.json                    # 缓存索引
│   ├── 598cba7b18a919cae344268ab0ec78ab.jpg  # 缓存图片
│   └── ...
└── [session_id]/                     # 会话目录
    └── export_final.png              # 最终导出图片
```

## 更新日志

### 2025-11-23
- ✅ 实现素材缓存核心功能
- ✅ 修改 `process_final_export` 支持缓存
- ✅ 修改 `direct_generate_with_ai` 支持缓存
- ✅ 更新后端API，传递素材信息
- ✅ 添加完整测试用例
- ✅ 编写功能文档

### 待办事项
- ⏳ 前端集成：传递素材信息到API
- ⏳ 添加缓存管理界面
- ⏳ 实现缓存过期和清理机制
