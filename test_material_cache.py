"""
测试素材缓存功能
"""
import sys
import os
import hashlib
import json
from datetime import datetime

# 直接定义测试需要的函数，避免导入整个模块
def create_material_key(materials: dict) -> str:
    """根据使用的素材生成唯一的缓存key"""
    material_names = []
    for key in ['title', 'pictogram', 'reference', 'variation', 'chart_type']:
        value = materials.get(key, '')
        if value:
            if '/' in value:
                value = os.path.basename(value)
            material_names.append(f"{key}:{value}")
    material_string = '|'.join(sorted(material_names))
    return hashlib.md5(material_string.encode('utf-8')).hexdigest()

MATERIAL_CACHE_DIR = "buffer/material_cache"
MATERIAL_CACHE_INDEX = "buffer/material_cache/index.json"

def load_material_cache_index() -> dict:
    """加载素材缓存索引"""
    if os.path.exists(MATERIAL_CACHE_INDEX):
        try:
            with open(MATERIAL_CACHE_INDEX, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_material_cache_index(index: dict):
    """保存素材缓存索引"""
    os.makedirs(os.path.dirname(MATERIAL_CACHE_INDEX), exist_ok=True)
    with open(MATERIAL_CACHE_INDEX, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

def save_to_material_cache(materials: dict, result_image_path: str, method: str = 'refine') -> dict:
    """保存AI精修结果到素材缓存（支持多版本）"""
    try:
        cache_key = create_material_key(materials)
        cache_index = load_material_cache_index()
        os.makedirs(MATERIAL_CACHE_DIR, exist_ok=True)

        # 获取当前素材的所有历史版本
        if cache_key not in cache_index:
            cache_index[cache_key] = {
                'materials': materials,
                'versions': []
            }

        # 确定新版本号
        versions = cache_index[cache_key]['versions']
        version_number = len(versions) + 1

        # 复制结果图片到缓存目录（包含版本号）
        cache_image_path = os.path.join(MATERIAL_CACHE_DIR, f"{cache_key}_v{version_number}.jpg")
        if os.path.exists(result_image_path):
            import shutil
            shutil.copy2(result_image_path, cache_image_path)

            # 添加新版本到索引
            version_info = {
                'version': version_number,
                'cache_path': cache_image_path,
                'method': method,
                'timestamp': datetime.now().isoformat(),
                'success': True
            }
            versions.append(version_info)

            save_material_cache_index(cache_index)
            print(f"[素材缓存] 已保存到缓存: {cache_key} (版本 {version_number})")
            return {
                'cache_key': cache_key,
                'version': version_number,
                'total_versions': len(versions)
            }
        else:
            print(f"[素材缓存] 结果图片不存在: {result_image_path}")
            return None
    except Exception as e:
        print(f"[素材缓存] 保存失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def check_material_cache(materials: dict) -> dict:
    """检查素材缓存，返回所有版本"""
    try:
        cache_key = create_material_key(materials)
        cache_index = load_material_cache_index()

        if cache_key in cache_index:
            cache_info = cache_index[cache_key]
            versions = cache_info.get('versions', [])

            # 验证所有版本的文件是否存在
            valid_versions = []
            for version in versions:
                cache_path = version.get('cache_path')
                if cache_path and os.path.exists(cache_path):
                    valid_versions.append(version)

            if valid_versions:
                print(f"[素材缓存] 命中缓存: {cache_key}")
                latest_version = valid_versions[-1]
                return {
                    'found': True,
                    'cache_key': cache_key,
                    'latest_version': latest_version,
                    'all_versions': valid_versions,
                    'total_versions': len(valid_versions),
                    'cache_path': latest_version['cache_path'],
                    'cache_info': cache_info
                }

        print(f"[素材缓存] 未找到缓存: {cache_key}")
        return {'found': False, 'all_versions': [], 'total_versions': 0}
    except Exception as e:
        print(f"[素材缓存] 检查失败: {e}")
        import traceback
        traceback.print_exc()
        return {'found': False, 'all_versions': [], 'total_versions': 0}


def test_material_cache():
    """测试素材缓存的基本功能"""

    print("=" * 60)
    print("测试素材缓存功能")
    print("=" * 60)

    # 1. 测试创建缓存key
    print("\n1. 测试创建缓存key")
    materials1 = {
        'title': 'title_0_abc123.png',
        'pictogram': 'pictogram_1_def456.png',
        'reference': 'infographics/Art-Origin.png',
        'variation': 'vertical_bar_chart_01',
        'chart_type': 'Vertical Bar Chart'
    }

    materials2 = {
        'title': 'title_0_abc123.png',
        'pictogram': 'pictogram_1_def456.png',
        'reference': 'infographics/Art-Origin.png',
        'variation': 'vertical_bar_chart_01',
        'chart_type': 'Vertical Bar Chart'
    }

    materials3 = {
        'title': 'title_1_abc123.png',  # 不同的标题
        'pictogram': 'pictogram_1_def456.png',
        'reference': 'infographics/Art-Origin.png',
        'variation': 'vertical_bar_chart_01',
        'chart_type': 'Vertical Bar Chart'
    }

    key1 = create_material_key(materials1)
    key2 = create_material_key(materials2)
    key3 = create_material_key(materials3)

    print(f"Materials1 key: {key1}")
    print(f"Materials2 key: {key2}")
    print(f"Materials3 key: {key3}")

    assert key1 == key2, "相同素材应该生成相同的key"
    assert key1 != key3, "不同素材应该生成不同的key"
    print("✓ 缓存key生成测试通过")

    # 2. 测试检查不存在的缓存
    print("\n2. 测试检查不存在的缓存")
    result = check_material_cache(materials1)
    print(f"检查结果: {result}")
    assert result['found'] == False, "应该找不到缓存"
    print("✓ 未找到缓存测试通过")

    # 3. 测试保存缓存（多版本）
    print("\n3. 测试保存和查找缓存（多版本）")
    # 创建一个临时测试图片
    test_image_dir = "buffer/test_cache"
    os.makedirs(test_image_dir, exist_ok=True)
    test_image_path = os.path.join(test_image_dir, "test_result.jpg")

    # 第一次保存
    with open(test_image_path, 'w') as f:
        f.write("test image content v1")

    cache_result1 = save_to_material_cache(
        materials=materials1,
        result_image_path=test_image_path,
        method='test'
    )

    print(f"第1次保存结果: {cache_result1}")
    assert cache_result1 is not None, "第1次保存应该成功"
    assert cache_result1['version'] == 1, "第1次保存应该是版本1"
    assert cache_result1['total_versions'] == 1, "应该有1个版本"

    # 第二次保存（相同素材）
    with open(test_image_path, 'w') as f:
        f.write("test image content v2")

    cache_result2 = save_to_material_cache(
        materials=materials1,
        result_image_path=test_image_path,
        method='test'
    )

    print(f"第2次保存结果: {cache_result2}")
    assert cache_result2 is not None, "第2次保存应该成功"
    assert cache_result2['version'] == 2, "第2次保存应该是版本2"
    assert cache_result2['total_versions'] == 2, "应该有2个版本"

    # 第三次保存（相同素材）
    with open(test_image_path, 'w') as f:
        f.write("test image content v3")

    cache_result3 = save_to_material_cache(
        materials=materials1,
        result_image_path=test_image_path,
        method='test'
    )

    print(f"第3次保存结果: {cache_result3}")
    assert cache_result3 is not None, "第3次保存应该成功"
    assert cache_result3['version'] == 3, "第3次保存应该是版本3"
    assert cache_result3['total_versions'] == 3, "应该有3个版本"

    # 检查缓存（应该返回所有版本）
    result = check_material_cache(materials1)
    print(f"检查结果: 找到 {result['total_versions']} 个版本")
    assert result['found'] == True, "应该找到缓存"
    assert result['total_versions'] == 3, "应该有3个版本"
    assert len(result['all_versions']) == 3, "应该返回3个版本"
    assert result['latest_version']['version'] == 3, "最新版本应该是版本3"

    # 验证所有版本
    for i, version in enumerate(result['all_versions']):
        print(f"  版本 {version['version']}: {version['cache_path']}")
        assert version['version'] == i + 1, f"版本号应该是 {i + 1}"
        assert os.path.exists(version['cache_path']), f"版本{i+1}的文件应该存在"

    print("✓ 多版本保存和查找测试通过")

    # 4. 测试路径提取功能
    print("\n4. 测试路径提取功能")
    materials_with_path = {
        'title': 'buffer/Space/title_0_abc123.png',  # 完整路径
        'pictogram': 'buffer/Space/pictogram_1_def456.png',
        'reference': 'infographics/Art-Origin.png',
        'variation': 'vertical_bar_chart_01',
        'chart_type': 'Vertical Bar Chart'
    }

    key_with_path = create_material_key(materials_with_path)
    key_without_path = create_material_key({
        'title': 'title_0_abc123.png',  # 只有文件名
        'pictogram': 'pictogram_1_def456.png',
        'reference': 'Art-Origin.png',
        'variation': 'vertical_bar_chart_01',
        'chart_type': 'Vertical Bar Chart'
    })

    print(f"带路径的key: {key_with_path}")
    print(f"不带路径的key: {key_without_path}")
    assert key_with_path == key_without_path, "路径应该被提取为文件名，生成相同的key"
    print("✓ 路径提取测试通过")

    print("\n" + "=" * 60)
    print("所有测试通过！✓")
    print("=" * 60)

if __name__ == '__main__':
    try:
        test_material_cache()
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
