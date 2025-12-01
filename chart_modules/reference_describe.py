"""
生成参考图表的标题和pictogram的文字描述
包括颜色、风格、布局等信息
"""

import os
import json
import base64
import xml.etree.ElementTree as ET
from PIL import Image
from io import BytesIO
import openai
from pathlib import Path

import sys
import os
from pathlib import Path

# Add project root to sys.path to allow importing config
project_root = Path(__file__).resolve().parents[1]
sys.path.append(str(project_root))

import config

API_KEY = config.OPENAI_API_KEY
BASE_URL = config.OPENAI_BASE_URL

# 描述缓存文件路径
DESCRIPTION_CACHE_FILE = "infographics/reference_descriptions.json"


def load_description_cache():
    """加载描述缓存"""
    if os.path.exists(DESCRIPTION_CACHE_FILE):
        try:
            with open(DESCRIPTION_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载描述缓存失败: {e}")
    return {}


def save_description_cache(cache):
    """保存描述缓存"""
    try:
        os.makedirs(os.path.dirname(DESCRIPTION_CACHE_FILE), exist_ok=True)
        with open(DESCRIPTION_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"保存描述缓存失败: {e}")


def get_reference_regions(reference_image_name):
    """
    从annotations.xml中获取参考图的title和image区域坐标

    Args:
        reference_image_name: 参考图片文件名 (如 "Art-Origin.png")

    Returns:
        dict: 包含title和image区域的坐标信息
    """
    annotations_path = 'infographics/annotations.xml'

    if not os.path.exists(annotations_path):
        print(f"annotations.xml不存在")
        return None

    try:
        tree = ET.parse(annotations_path)
        root = tree.getroot()

        for image_elem in root.findall('image'):
            if image_elem.get('name') == reference_image_name:
                regions = {
                    'width': float(image_elem.get('width')),
                    'height': float(image_elem.get('height'))
                }

                for box in image_elem.findall('box'):
                    label = box.get('label')
                    if label in ['title', 'image']:
                        regions[label] = {
                            'xtl': float(box.get('xtl')),
                            'ytl': float(box.get('ytl')),
                            'xbr': float(box.get('xbr')),
                            'ybr': float(box.get('ybr'))
                        }

                return regions

        print(f"未找到图片 {reference_image_name} 的标注信息")
        return None

    except Exception as e:
        print(f"解析annotations.xml失败: {e}")
        return None


def crop_region(image_path, region):
    """
    裁剪图片的指定区域

    Args:
        image_path: 图片路径
        region: 区域坐标 {'xtl', 'ytl', 'xbr', 'ybr'}

    Returns:
        PIL.Image: 裁剪后的图片
    """
    try:
        img = Image.open(image_path)
        cropped = img.crop((
            int(region['xtl']),
            int(region['ytl']),
            int(region['xbr']),
            int(region['ybr'])
        ))
        return cropped
    except Exception as e:
        print(f"裁剪图片失败: {e}")
        return None


def image_to_base64(image):
    """将PIL Image转换为base64字符串"""
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')


def generate_title_description(title_image):
    """
    使用GPT-4V生成标题区域的文字描述

    Args:
        title_image: PIL.Image 标题区域图片

    Returns:
        str: 标题的详细描述，包括颜色、字体风格、行数等
    """
    client = openai.OpenAI(api_key=API_KEY, base_url=BASE_URL)

    img_base64 = image_to_base64(title_image)

    prompt = """请仔细分析这个标题图片，并提供详细的描述，用于指导生成类似风格的标题。请包括以下方面：

1. **文字布局**: 标题分成了几行？每行大概有多少文字？文字是居中、左对齐还是右对齐？
2. **字体风格**: 字体是什么类型（如无衬线、衬线、手写体、艺术字体等）？是粗体还是细体？有没有斜体？
3. **颜色方案**: 文字的主要颜色是什么？有没有使用渐变或多种颜色？背景是什么颜色/是否透明？
4. **装饰效果**: 有没有阴影、描边、发光等效果？有没有图标或装饰元素融入文字中？
5. **整体风格**: 整体给人什么感觉（如现代简约、复古、科技感、手绘风格等）？

请用简洁的英文描述，方便后续用于图像生成prompt。描述要具体且实用。"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"生成标题描述失败: {e}")
        return None


def generate_pictogram_description(pictogram_image):
    """
    使用GPT-4V生成pictogram区域的文字描述

    Args:
        pictogram_image: PIL.Image pictogram区域图片

    Returns:
        str: pictogram的详细描述，包括颜色、风格、内容等
    """
    client = openai.OpenAI(api_key=API_KEY, base_url=BASE_URL)

    img_base64 = image_to_base64(pictogram_image)

    prompt = """请仔细分析这个图表配图/插图（pictogram），并提供详细的描述，用于指导生成类似风格的配图。请包括以下方面：

1. **内容主题**: 图像描绘的是什么？主要元素有哪些？
2. **绘制风格**: 是扁平化设计、3D渲染、手绘风格、等距视图还是其他风格？线条是粗还是细？
3. **颜色方案**: 使用了哪些主要颜色？颜色是鲜艳的还是柔和的？有没有使用渐变？
4. **背景处理**: 背景是透明的、纯色的还是有图案的？
5. **整体特点**: 有什么独特的视觉特点？（如阴影、高光、纹理等）

请用简洁的英文描述，方便后续用于图像生成prompt。描述要具体且实用，不要描述文字内容。"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"生成pictogram描述失败: {e}")
        return None


def get_reference_descriptions(reference_image_path, use_cache=True):
    """
    获取参考图的标题和pictogram描述

    Args:
        reference_image_path: 参考图片路径 (如 "infographics/Art-Origin.png")
        use_cache: 是否使用缓存

    Returns:
        dict: {
            'title_description': 标题描述,
            'pictogram_description': pictogram描述
        }
    """
    reference_filename = os.path.basename(reference_image_path)

    # 检查缓存
    if use_cache:
        cache = load_description_cache()
        if reference_filename in cache:
            print(f"[缓存命中] 使用缓存的参考图描述: {reference_filename}")
            return cache[reference_filename]

    print(f"[生成描述] 正在为 {reference_filename} 生成描述...")

    # 获取区域坐标
    regions = get_reference_regions(reference_filename)
    if not regions:
        print(f"无法获取 {reference_filename} 的区域信息")
        return None

    result = {
        'title_description': None,
        'pictogram_description': None
    }

    # 裁剪并分析标题区域
    if 'title' in regions:
        title_img = crop_region(reference_image_path, regions['title'])
        if title_img:
            result['title_description'] = generate_title_description(title_img)
            print(f"标题描述: {result['title_description'][:100]}...")

    # 裁剪并分析pictogram区域 (image标签)
    if 'image' in regions:
        pictogram_img = crop_region(reference_image_path, regions['image'])
        if pictogram_img:
            result['pictogram_description'] = generate_pictogram_description(pictogram_img)
            print(f"Pictogram描述: {result['pictogram_description'][:100]}...")

    # 保存到缓存
    cache = load_description_cache()
    cache[reference_filename] = result
    save_description_cache(cache)

    return result


if __name__ == "__main__":
    # 测试
    test_reference = "infographics/Art-Origin.png"
    descriptions = get_reference_descriptions(test_reference, use_cache=False)
    print("\n===== 测试结果 =====")
    print(f"标题描述:\n{descriptions.get('title_description')}")
    print(f"\nPictogram描述:\n{descriptions.get('pictogram_description')}")
