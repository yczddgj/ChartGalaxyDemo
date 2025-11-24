"""
使用 Gemini-3-Pro-Image-Preview 模型按照参考信息图表的风格重新生成最终图片
"""

import os
import base64
import openai
from pathlib import Path
import cairosvg
from PIL import Image
from io import BytesIO
import numpy as np
import json
import hashlib
from datetime import datetime

# API 配置
API_KEY = "sk-NNBhkfmYuZB6IQCY7f9eCd8841864eB6B3C7Fc0a7d4a8360"
BASE_URL = "https://aihubmix.com/v1"

# 素材缓存配置
MATERIAL_CACHE_DIR = "buffer/material_cache"
MATERIAL_CACHE_INDEX = "buffer/material_cache/index.json"

def create_material_key(materials: dict) -> str:
    """
    根据使用的素材生成唯一的缓存key

    Args:
        materials: 素材信息字典，包含：
            - title: 标题文件名或路径
            - pictogram: 配图文件名或路径
            - reference: 参考图文件名或路径
            - variation: variation名称
            - chart_type: 图表类型

    Returns:
        str: 素材组合的唯一hash key
    """
    # 提取文件名（去除路径）
    material_names = []
    for key in ['title', 'pictogram', 'reference', 'variation', 'chart_type']:
        value = materials.get(key, '')
        if value:
            # 如果是路径，提取文件名
            if '/' in value:
                value = os.path.basename(value)
            material_names.append(f"{key}:{value}")

    # 生成hash
    material_string = '|'.join(sorted(material_names))
    return hashlib.md5(material_string.encode('utf-8')).hexdigest()

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
    """
    保存AI精修结果到素材缓存（支持同一素材多次精修并编号）

    Args:
        materials: 使用的素材信息
        result_image_path: 生成的结果图片路径
        method: 生成方法（'refine' 或 'direct'）

    Returns:
        dict: 包含缓存key和版本号的字典
    """
    try:
        # 生成缓存key
        cache_key = create_material_key(materials)

        # 加载索引
        cache_index = load_material_cache_index()

        # 确保缓存目录存在
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

            # 保存索引
            save_material_cache_index(cache_index)

            print(f"[素材缓存] 已保存到缓存: {cache_key} (版本 {version_number})")
            print(f"[素材缓存] 素材: {materials}")
            print(f"[素材缓存] 总版本数: {len(versions)}")

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
    """
    检查素材缓存，返回所有历史版本

    Args:
        materials: 要检查的素材信息

    Returns:
        dict: 包含缓存信息的字典，包括所有历史版本
    """
    try:
        # 生成缓存key
        cache_key = create_material_key(materials)

        # 加载索引
        cache_index = load_material_cache_index()

        # 检查是否存在
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
                print(f"[素材缓存] 素材: {materials}")
                print(f"[素材缓存] 找到 {len(valid_versions)} 个历史版本")

                # 返回最新版本作为默认，同时提供所有版本
                latest_version = valid_versions[-1]

                return {
                    'found': True,
                    'cache_key': cache_key,
                    'latest_version': latest_version,
                    'all_versions': valid_versions,
                    'total_versions': len(valid_versions),
                    # 兼容旧版本API
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

def svg_to_png(svg_content: str, output_path: str, background_color: str = None) -> bool:
    """
    将 SVG 内容转换为 PNG 文件

    Args:
        svg_content: SVG 文件内容（字符串）
        output_path: 输出 PNG 文件路径
        background_color: 背景颜色（hex 格式），None 表示透明背景

    Returns:
        bool: 转换是否成功
    """
    try:
        # 确保输出目录存在
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # 使用 cairosvg 将 SVG 转换为 PNG
        # 如果 background_color 为 None，则使用透明背景
        cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            write_to=output_path,
            background_color=background_color  # None = transparent
        )

        print(f"SVG 转 PNG 成功: {output_path}")
        return True

    except Exception as e:
        print(f"SVG 转 PNG 失败: {e}")
        return False


def auto_crop_image(image_path: str, background_color: str = '#ffffff', padding: int = 50) -> str:
    """
    自动裁剪图片，去除背景色并保留内容区域
    
    Args:
        image_path: 输入图片路径
        background_color: 背景颜色（hex 格式）
        padding: 内容周围的边距（像素）
    
    Returns:
        str: 裁剪后的图片路径
    """
    try:
        # 打开图片
        img = Image.open(image_path)
        img_array = np.array(img)
        
        # 解析背景颜色
        bg_color = background_color.lstrip('#')
        bg_r = int(bg_color[0:2], 16)
        bg_g = int(bg_color[2:4], 16)
        bg_b = int(bg_color[4:6], 16)
        
        # 创建 mask：找出非背景色的像素
        # 容忍度：允许 RGB 值有 10 的差异
        tolerance = 10
        if img.mode == 'RGBA':
            # 对于 RGBA 图片，检查 RGB 通道
            mask = (
                (np.abs(img_array[:, :, 0].astype(int) - bg_r) > tolerance) |
                (np.abs(img_array[:, :, 1].astype(int) - bg_g) > tolerance) |
                (np.abs(img_array[:, :, 2].astype(int) - bg_b) > tolerance)
            )
        else:
            # 对于 RGB 图片
            mask = (
                (np.abs(img_array[:, :, 0].astype(int) - bg_r) > tolerance) |
                (np.abs(img_array[:, :, 1].astype(int) - bg_g) > tolerance) |
                (np.abs(img_array[:, :, 2].astype(int) - bg_b) > tolerance)
            )
        
        # 找到非背景色区域的边界
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        
        if not np.any(rows) or not np.any(cols):
            print("Warning: No content found, returning original image")
            return image_path
        
        y_min, y_max = np.where(rows)[0][[0, -1]]
        x_min, x_max = np.where(cols)[0][[0, -1]]
        
        # 添加 padding，但不超出图片边界
        height, width = img_array.shape[:2]
        y_min = max(0, y_min - padding)
        y_max = min(height, y_max + padding + 1)
        x_min = max(0, x_min - padding)
        x_max = min(width, x_max + padding + 1)
        
        print(f"Auto-crop: Original size {width}x{height}, Crop to ({x_min},{y_min}) - ({x_max},{y_max})")
        print(f"Content size: {x_max - x_min}x{y_max - y_min}")
        
        # 裁剪图片
        cropped_img = img.crop((x_min, y_min, x_max, y_max))
        
        # 保存裁剪后的图片
        output_path = image_path.replace('.png', '_cropped.png')
        cropped_img.save(output_path, 'PNG')
        
        print(f"Saved cropped image to: {output_path}")
        return output_path
        
    except Exception as e:
        print(f"Auto-crop failed: {e}")
        import traceback
        traceback.print_exc()
        return image_path  # 失败时返回原图

def image_to_base64(image_path: str) -> str:
    """
    将图片文件转换为 base64 编码

    Args:
        image_path: 图片文件路径

    Returns:
        str: base64 编码的图片数据（带 data URI 前缀）
    """
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
            encoded = base64.b64encode(image_data).decode('utf-8')

            # 确定文件类型
            ext = os.path.splitext(image_path)[-1].lower()
            if ext == '.png':
                mime_type = 'image/png'
            elif ext in ['.jpg', '.jpeg']:
                mime_type = 'image/jpeg'
            else:
                mime_type = 'image/png'  # 默认

            return f"data:{mime_type};base64,{encoded}"

    except Exception as e:
        print(f"图片转 base64 失败: {e}")
        return None


def refine_with_gemini(reference_image_path: str, current_image_path: str, output_path: str) -> dict:
    """
    使用 Gemini-3-Pro-Image-Preview 模型按照参考图片的风格重新生成当前图片

    Args:
        reference_image_path: 参考信息图表的路径
        current_image_path: 当前生成的图片路径
        output_path: 输出精修后的图片路径

    Returns:
        dict: 包含 success 和 image_path 的结果字典
    """
    try:
        print(f"开始使用 Gemini 进行风格化重生成...")
        print(f"  参考图片: {reference_image_path}")
        print(f"  当前图片: {current_image_path}")

        # 将两张图片转换为 base64
        reference_b64 = image_to_base64(reference_image_path)
        current_b64 = image_to_base64(current_image_path)

        if not reference_b64 or not current_b64:
            return {
                'success': False,
                'image_path': None,
                'error': '图片转换失败'
            }

        # 创建 OpenAI 客户端
        client = openai.OpenAI(
            api_key=API_KEY,
            base_url=BASE_URL
        )

        # 构建提示词
        prompt = """You are an expert infographic designer. You are given a chart/data visualization image.
Your task is to transform this chart into a beautiful, professional infographic with the following requirements:

**Content Requirements:**
- **DO NOT modify the data, numbers, labels, or any information** shown in the chart
- Keep all chart values, axes, legends, and data points exactly as they appear
- Preserve the chart type and structure

**Visual Enhancement:**
- Add a professional, eye-catching design with modern aesthetics
- Use a harmonious color palette that enhances readability
- Add appropriate decorative elements, icons, or illustrations
- Create a clean, well-organized layout
- Use professional typography for titles and labels
- Add subtle backgrounds or patterns if appropriate
- Ensure visual consistency throughout the design

**Quality Standards:**
- High resolution and clarity
- No blurry text or distorted elements
- Professional and polished appearance
- Suitable for presentation or publication

Generate a stunning infographic that transforms the raw chart into a visually appealing, professional design while keeping all the data intact."""
        # 调用 Gemini 模型
        response = client.chat.completions.create(
            model="gemini-3-pro-image-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": reference_b64
                            }
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": current_b64
                            }
                        }
                    ]
                }
            ],
            modalities=["text","image"],
            max_tokens=8192,
            temperature=0.7
        )
        print(response)
        if (
            hasattr(response.choices[0].message, "multi_mod_content")
            and response.choices[0].message.multi_mod_content is not None
        ):
            for part in response.choices[0].message.multi_mod_content:
                if "text" in part and part["text"] is not None:
                    print(part["text"])
                
                # Process image content
                elif "inline_data" in part and part["inline_data"] is not None:
                    print("[Image content received]")
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    mime_type = part["inline_data"].get("mime_type", "image/png")
                    print(f"Image type: {mime_type}")
                    
                    image = Image.open(BytesIO(image_data))
                    
                    # Save image
                    output_dir = os.path.join(os.path.dirname(output_path))
                    os.makedirs(output_dir, exist_ok=True)
                    output_path = os.path.join(output_dir, "edited_image.jpg")
                    image.save(output_path)
                    print(f"Image saved to: {output_path}")
                    return {
                        'success': True,
                        'image_path': output_path
                    }

        return {
            'success': False,
            'image_path': None,
            'error': '不支持的响应格式'
        }

    except Exception as e:
        print(f"Gemini 风格化重生成失败: {e}")
        import traceback
        traceback.print_exc()

        return {
            'success': False,
            'image_path': None,
            'error': str(e)
        }


def process_final_export(png_base64: str, reference_image_path: str, session_id: str,
                         background_color: str = '#ffffff', materials: dict = None,
                         force_regenerate: bool = False) -> dict:
    """
    处理最终导出：接收 PNG base64 -> 自动裁剪 -> Gemini 风格化 -> 保存到缓存

    Args:
        png_base64: 前端导出的 PNG 图片（base64 编码，带 data URI 前缀）
        reference_image_path: 用户选择的参考信息图表路径
        session_id: 当前会话 ID
        background_color: 背景颜色，用于自动裁剪
        materials: 使用的素材信息（标题、配图、variation等）
        force_regenerate: 是否强制重新生成（True=AI精修，False=可以使用缓存）

    Returns:
        dict: 包含最终生成结果的字典
    """
    try:
        # 0. 检查素材缓存（仅在非强制重新生成时）
        if materials and not force_regenerate:
            cache_result = check_material_cache(materials)
            if cache_result.get('found'):
                print(f"[素材缓存] 使用缓存的精修结果（最新版本）")
                cache_path = cache_result['cache_path']

                # 复制缓存图片到当前session
                final_png_path = f"buffer/{session_id}/export_final.png"
                import shutil
                shutil.copy2(cache_path, final_png_path)

                return {
                    'success': True,
                    'image_path': final_png_path,
                    'from_cache': True,
                    'cache_key': cache_result['cache_key'],
                    'version': cache_result['latest_version']['version'],
                    'total_versions': cache_result['total_versions']
                }

        # 1. 保存前端传来的 PNG
        intermediate_png_path = f"buffer/{session_id}/export_intermediate.png"

        # 解析 base64 数据
        if png_base64.startswith('data:image'):
            # 移除 data URI 前缀
            png_data = png_base64.split(',')[1]
        else:
            png_data = png_base64

        # 解码并保存
        image_bytes = base64.b64decode(png_data)
        os.makedirs(os.path.dirname(intermediate_png_path), exist_ok=True)

        with open(intermediate_png_path, 'wb') as f:
            f.write(image_bytes)

        print(f"保存中间 PNG 成功: {intermediate_png_path}")

        # 2. 自动裁剪图片（去除背景，保留内容）
        cropped_image_path = auto_crop_image(
            image_path=intermediate_png_path,
            background_color=background_color,
            padding=50  # 50px padding
        )

        print(f"自动裁剪完成: {cropped_image_path}")

        # 3. 使用 Gemini 进行风格化重生成
        final_png_path = f"buffer/{session_id}/export_final.png"
        result = refine_with_gemini(
            reference_image_path=reference_image_path,
            current_image_path=cropped_image_path,
            output_path=final_png_path
        )

        # 4. 如果成功，保存到素材缓存
        if result.get('success') and materials:
            cache_result = save_to_material_cache(
                materials=materials,
                result_image_path=result['image_path'],
                method='refine'
            )
            if cache_result:
                result['cache_info'] = cache_result
                result['from_cache'] = False

        return result

    except Exception as e:
        print(f"最终导出处理失败: {e}")
        import traceback
        traceback.print_exc()

        return {
            'success': False,
            'error': str(e)
        }



def direct_generate_with_ai(chart_image_path: str, output_path: str, materials: dict = None,
                           force_regenerate: bool = False) -> dict:
    """
    使用 Gemini-3-Pro-Image-Preview 模型直接生成最终信息图表（不需要参考图）

    Args:
        chart_image_path: 当前图表的图片路径
        output_path: 输出生成的图片路径
        materials: 使用的素材信息（标题、配图、variation等）
        force_regenerate: 是否强制重新生成（True=AI精修，False=可以使用缓存）

    Returns:
        dict: 包含 success 和 image_path 的结果字典
    """
    try:
        # 0. 检查素材缓存（仅在非强制重新生成时）
        if materials and not force_regenerate:
            cache_result = check_material_cache(materials)
            if cache_result.get('found'):
                print(f"[素材缓存] 使用缓存的AI直接生成结果（最新版本）")
                cache_path = cache_result['cache_path']

                # 复制缓存图片到输出路径
                import shutil
                shutil.copy2(cache_path, output_path)

                return {
                    'success': True,
                    'image_path': output_path,
                    'from_cache': True,
                    'cache_key': cache_result['cache_key'],
                    'version': cache_result['latest_version']['version'],
                    'total_versions': cache_result['total_versions']
                }

        print(f"开始使用 Gemini AI 直接生成信息图表...")
        print(f"  图表图片: {chart_image_path}")

        # 将图表转换为 base64
        chart_b64 = image_to_base64(chart_image_path)

        if not chart_b64:
            return {
                'success': False,
                'image_path': None,
                'error': '图片转换失败'
            }

        # 创建 OpenAI 客户端
        client = openai.OpenAI(
            api_key=API_KEY,
            base_url=BASE_URL
        )

        # 构建提示词
        prompt = """You are an expert infographic designer. You are given a chart/data visualization image.

Your task is to transform this chart into a beautiful, professional infographic with the following requirements:

**Content Requirements:**
- **DO NOT modify the data, numbers, labels, or any information** shown in the chart
- Keep all chart values, axes, legends, and data points exactly as they appear
- Preserve the chart type and structure

**Visual Enhancement:**
- Add a professional, eye-catching design with modern aesthetics
- Use a harmonious color palette that enhances readability
- Add appropriate decorative elements, icons, or illustrations
- Create a clean, well-organized layout
- Use professional typography for titles and labels
- Add subtle backgrounds or patterns if appropriate
- Ensure visual consistency throughout the design

**Quality Standards:**
- High resolution and clarity
- No blurry text or distorted elements
- Professional and polished appearance
- Suitable for presentation or publication

Generate a stunning infographic that transforms the raw chart into a visually appealing, professional design while keeping all the data intact."""

        # 调用 Gemini 模型
        response = client.chat.completions.create(
            model="gemini-3-pro-image-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": chart_b64
                            }
                        }
                    ]
                }
            ],
            modalities=["text", "image"],
            max_tokens=8192,
            temperature=0.7
        )

        if (
            hasattr(response.choices[0].message, "multi_mod_content")
            and response.choices[0].message.multi_mod_content is not None
        ):
            for part in response.choices[0].message.multi_mod_content:
                if "text" in part and part["text"] is not None:
                    print(part["text"])

                # Process image content
                elif "inline_data" in part and part["inline_data"] is not None:
                    print("[AI生成的图片已接收]")
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    mime_type = part["inline_data"].get("mime_type", "image/png")
                    print(f"图片类型: {mime_type}")

                    image = Image.open(BytesIO(image_data))

                    # Save image
                    output_dir = os.path.dirname(output_path)
                    os.makedirs(output_dir, exist_ok=True)
                    image.save(output_path)
                    print(f"图片已保存到: {output_path}")

                    result = {
                        'success': True,
                        'image_path': output_path,
                        'from_cache': False
                    }

                    # 保存到素材缓存
                    if materials:
                        cache_result = save_to_material_cache(
                            materials=materials,
                            result_image_path=output_path,
                            method='direct'
                        )
                        if cache_result:
                            result['cache_info'] = cache_result

                    return result

        return {
            'success': False,
            'image_path': None,
            'error': '不支持的响应格式'
        }

    except Exception as e:
        print(f"AI直接生成失败: {e}")
        import traceback
        traceback.print_exc()

        return {
            'success': False,
            'image_path': None,
            'error': str(e)
        }
