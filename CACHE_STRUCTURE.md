# 缓存结构说明

## 更新概述

将 title 和 pictogram 的缓存从 `generation_cache/` 移动到 `buffer/generation_cache/`，使其可以在不同任务之间共享。

## 新的缓存目录结构

```
buffer/
└── generation_cache/              # 全局缓存目录（跨任务共享）
    ├── titles/                    # Title 图片缓存
    │   ├── <hash1>.png
    │   ├── <hash2>.png
    │   └── ...
    ├── pictograms/                # Pictogram 图片缓存
    │   ├── <hash1>.png
    │   ├── <hash2>.png
    │   └── ...
    ├── title_cache.json           # Title 缓存元数据
    └── pictogram_cache.json       # Pictogram 缓存元数据
```

## 缓存键生成

使用 SHA256 哈希生成唯一的缓存键：

### Title 缓存键
```python
cache_key = sha256({
    'csv_path': 'path/to/data.csv',
    'bg_color': '#ff6a00',
    'type': 'title'
})
```

### Pictogram 缓存键
```python
cache_key = sha256({
    'title_text': 'Example Title',
    'colors': ['#ff6a00', '#3f8aff'],
    'type': 'pictogram'
})
```

## 缓存工作流程

### Title 生成流程

1. **检查缓存**
   - 生成缓存键（基于 CSV 路径和背景色）
   - 查找 `title_cache.json` 中是否有该键
   - 检查 `buffer/generation_cache/titles/<cache_key>.png` 是否存在

2. **缓存命中**
   - 从缓存目录复制图片到目标路径
   - 返回缓存的 title_text 和新的 image_path

3. **缓存未命中**
   - 调用 `get_image_only_title()` 生成新图片
   - 保存到 `buffer/generation_cache/titles/<cache_key>.png`
   - 复制到目标输出路径
   - 更新 `title_cache.json` 元数据

### Pictogram 生成流程

1. **检查缓存**
   - 生成缓存键（基于 title_text 和 colors）
   - 查找 `pictogram_cache.json` 中是否有该键
   - 检查 `buffer/generation_cache/pictograms/<cache_key>.png` 是否存在

2. **缓存命中**
   - 从缓存目录复制图片到目标路径
   - 返回缓存的 pictogram_prompt 和新的 image_path

3. **缓存未命中**
   - 调用 `generate_image()` 生成新图片
   - 保存到 `buffer/generation_cache/pictograms/<cache_key>.png`
   - 复制到目标输出路径
   - 更新 `pictogram_cache.json` 元数据

## 缓存元数据格式

### title_cache.json
```json
{
  "<cache_key>": {
    "title_text": "Example Infographic Title",
    "cache_path": "buffer/generation_cache/titles/<cache_key>.png",
    "success": true
  }
}
```

### pictogram_cache.json
```json
{
  "<cache_key>": {
    "pictogram_prompt": "A minimalist icon representing...",
    "cache_path": "buffer/generation_cache/pictograms/<cache_key>.png",
    "success": true
  }
}
```

## 优势

### 1. **跨任务共享**
不同的会话（不同的 `session_id`）可以共享相同的 title 和 pictogram：
- 如果两个任务使用相同的数据和背景色，会重用相同的 title
- 如果两个任务的 title 文本和配色相同，会重用相同的 pictogram

### 2. **减少 API 调用**
- Title 生成需要调用 LLM 和图片生成 API
- Pictogram 生成需要调用图片生成 API
- 缓存可以显著减少重复调用

### 3. **持久化存储**
- 缓存文件保存在 `buffer/` 目录下
- 即使清理了某个任务的 `buffer/<session_id>/` 目录，缓存仍然保留
- 可以手动清理 `buffer/generation_cache/` 来释放空间

### 4. **独立于任务输出**
- 每个任务仍然将最终图片保存到自己的 `buffer/<session_id>/` 目录
- 缓存目录只作为源，不影响任务隔离

## 示例场景

### 场景 1：首次生成
```
User Task 1:
- CSV: data/sales.csv
- Background: #ff6a00
- Title Cache: MISS → 生成并缓存到 buffer/generation_cache/titles/abc123.png
- Output: buffer/task1/title_0.png (从缓存复制)
```

### 场景 2：相同数据的新任务
```
User Task 2:
- CSV: data/sales.csv (same)
- Background: #ff6a00 (same)
- Title Cache: HIT → 从 buffer/generation_cache/titles/abc123.png 复制
- Output: buffer/task2/title_0.png (从缓存复制)
- 节省时间：无需调用 LLM 和图片生成 API
```

### 场景 3：不同背景色
```
User Task 3:
- CSV: data/sales.csv (same)
- Background: #3f8aff (different)
- Title Cache: MISS → 生成新的 title (不同缓存键)
- Output: buffer/task3/title_0.png
```

## 代码变更总结

### `chart_modules/ChartGalaxy/example_based_generation/generate_infographic.py`

#### 初始化部分
```python
# Before
self.cache_dir = "generation_cache"
self.title_cache_file = os.path.join(self.cache_dir, "title_cache.json")
self.pictogram_cache_file = os.path.join(self.cache_dir, "pictogram_cache.json")

# After
self.cache_dir = "buffer/generation_cache"
self.title_cache_dir = os.path.join(self.cache_dir, "titles")
self.pictogram_cache_dir = os.path.join(self.cache_dir, "pictograms")
self.title_cache_file = os.path.join(self.cache_dir, "title_cache.json")
self.pictogram_cache_file = os.path.join(self.cache_dir, "pictogram_cache.json")
```

#### Title 生成
```python
# 计算缓存路径
cache_image_filename = f"{cache_key}.png"
cache_image_path = os.path.join(self.title_cache_dir, cache_image_filename)

# 缓存命中时
if os.path.exists(cache_image_path):
    shutil.copy(cache_image_path, output_filename)
    return {...}

# 缓存未命中时
result_path = get_image_only_title(..., save_path=cache_image_path, ...)
shutil.copy(cache_image_path, output_filename)
```

#### Pictogram 生成
```python
# 计算缓存路径
cache_image_filename = f"{cache_key}.png"
cache_image_path = os.path.join(self.pictogram_cache_dir, cache_image_filename)

# 缓存命中时
if os.path.exists(cache_image_path):
    shutil.copy(cache_image_path, output_filename)
    return {...}

# 缓存未命中时
success = self.generate_image(..., cache_image_path)
shutil.copy(cache_image_path, output_filename)
```

## 维护建议

1. **定期清理缓存**
   ```bash
   # 查看缓存大小
   du -sh buffer/generation_cache/

   # 清理所有缓存
   rm -rf buffer/generation_cache/
   ```

2. **监控缓存命中率**
   - 查看日志中的 `[CACHE HIT]` 和 `[CACHE MISS]` 消息
   - 高命中率表示缓存工作良好

3. **缓存失效策略**
   - 当前实现：永久缓存（手动清理）
   - 可选改进：添加时间戳，自动清理过期缓存

## 测试要点

1. ✅ 首次生成 title 时缓存正确创建
2. ✅ 相同参数的第二次请求使用缓存
3. ✅ 不同背景色生成不同的 title
4. ✅ Pictogram 缓存工作正常
5. ✅ 缓存文件正确保存到 `buffer/generation_cache/`
6. ✅ 元数据 JSON 文件正确更新
7. ✅ 跨任务缓存共享正常工作
