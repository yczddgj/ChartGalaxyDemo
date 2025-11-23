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

# API 配置
API_KEY = "sk-ho2TtXpXZCd50j5q3d4f29D8Cd6246B28212028a0aF69361"
BASE_URL = "https://aihubmix.com/v1"

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
        prompt = """You are given two images:

1. **Reference Image**: An infographic with a specific visual style (colors, layout, typography, design elements)
2. **Current Image**: A newly generated infographic that needs to be refined

Your task is to regenerate the Current Image by applying the visual style from the Reference Image, while preserving all the data, content, and information from the Current Image.

Specifically:
- Match the color palette from the Reference Image
- Apply similar design aesthetics (shapes, icons, decorative elements)
- Use similar typography style if applicable
- Preserve the layout structure of the Current Image
- Fix visual defects (blurry text, distorted shapes)
- Ensure stability and consistency of **title, chart, pictogram**
- Keep the core content of **title, chart, pictogram** from the Current Image unchanged

Generate a high-quality infographic that looks like it was created with the same design system as the Reference Image."""

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


def process_final_export(png_base64: str, reference_image_path: str, session_id: str) -> dict:
    """
    处理最终导出：接收 PNG base64 -> Gemini 风格化

    Args:
        png_base64: 前端导出的 PNG 图片（base64 编码，带 data URI 前缀）
        reference_image_path: 用户选择的参考信息图表路径
        session_id: 当前会话 ID

    Returns:
        dict: 包含最终生成结果的字典
    """
    try:
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

        # 2. 使用 Gemini 进行风格化重生成
        final_png_path = f"buffer/{session_id}/export_final.png"
        result = refine_with_gemini(
            reference_image_path=reference_image_path,
            current_image_path=intermediate_png_path,
            output_path=final_png_path
        )

        return result

    except Exception as e:
        print(f"最终导出处理失败: {e}")
        import traceback
        traceback.print_exc()

        return {
            'success': False,
            'error': str(e)
        }


def direct_generate_with_ai(chart_image_path: str, output_path: str) -> dict:
    """
    使用 Gemini-3-Pro-Image-Preview 模型直接生成最终信息图表（不需要参考图）

    Args:
        chart_image_path: 当前图表的图片路径
        output_path: 输出生成的图片路径

    Returns:
        dict: 包含 success 和 image_path 的结果字典
    """
    try:
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
        print(f"AI直接生成失败: {e}")
        import traceback
        traceback.print_exc()

        return {
            'success': False,
            'image_path': None,
            'error': str(e)
        }
