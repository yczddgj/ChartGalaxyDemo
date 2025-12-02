import os
import json
from typing import Optional
from dataclasses import dataclass
from openai import OpenAI
import io
import base64
from PIL import Image
from PIL import ImageDraw, ImageFont
from abc import ABC, abstractmethod
import requests
import re
import numpy as np
import sys

from enum import Enum

# 导入mask_utils中的方法
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'layout_optimization'))
from mask_utils import extract_background_color_kmeans

# OpenAI API Configuration
OPENAI_API_KEY = "sk-NNBhkfmYuZB6IQCY7f9eCd8841864eB6B3C7Fc0a7d4a8360"
OPENAI_BASE_URL = "https://aihubmix.com/v1"

client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL
)

design_prompt = """
You are a experienced designer for infographics.


I want to generate a **text image**, which will be used as the title of a poster in the future.
Please help me generate a text segment as a **prompt for a text-to-image model** to create an appropriate text image.
The content of the text is **"{title}"**
The background color is **{background_color}**.
The style of the paired chart is **{chart_style}**.
Note that the title may be broken into multiple lines, and the lines are separated by "\n".

Note: the visual element do not include data visualizations, such as bar charts, line charts, etc.

You are provided with a structured **Visual Element Design Space** that categorizes how visual elements can be combined with title text through different semantic associations and visual combination methods.

Visual Element Design Space:

**Visual-Element-and-Title Association**:

Visual-Element-and-Title Association defines which property of the visual elements is used to convey meaning or enhance the relationship with the title. It can be categorized into the following types:

- Shape: The whole shape of the visual element is used, including its length, area, and appearance.
- Silhouette: This category uses the contour lines to construct the relationship between the visual element and the title.
- Orientation: Use perceived orientation to convey insight, such as using downward orientation to convey bad meaning.
- Structure: Visual structures, such as the connectivity structure of a network.
- Color: Colors evoke strong cultural and emotional associations.
- Function: The function of a visual element refers to its practical or intended use, or what it can result in, such as the seed dispersal function of dandelion.
- Status: The status of a visual element refers to its condition or situation, such as a horse in motion, an unplugged plug, or a worried expression on a person.
- Process: A process refers to a series of actions, changes, or steps that unfold over time. Should show a series of middle points of a process, such as the process of climbing a ladder, rocket ascending into the sky.

**Visual Combination Method**:

Visual Combination Method defines how visual elements are visually integrated with the title.
It can be categorized into the following types:

1. Juxtaposition
- Definition: The title text and visual elements are placed side by side spatially, remaining independent and without overlap.

2. Overlay
- Definition: The title text and visual elements partially or completely overlap, with visual elements serving as the background or foreground.

3. Fusion
- Definition: The title text and visual elements are integrated, forming a partially or fully unified design.

4. Replacement
- Definition: Visual elements directly replace specific parts of the title text.

**Visual Combination Scope** – At what level should the visual element be combined with the title text?  
   Choose one of the following:

   - **Title-level**: The visual element interacts with the entire title as a whole.  
   - **Multi-letter-level**: The visual element interacts with a group of letters.  
   - **Letter-level**: The visual element targets specific individual letters.  
   - **Stroke-level**: The visual element integrates into the fine-grained strokes or segments of letters.

**Target** – Which specific part(s) of the title text should be integrated with the visual element, based on your selected scope?

**Font Style / Artistic Effect**  
   The background color is **{background_color}**.
   The style of the paired chart is **{chart_style}**.
   What kind of font appearance or artistic effect should be applied to the title text?  
   Consider elements like boldness, distortion, texture, handwritten or mechanical style, etc.
   The style of title text should be consistent with the style of paired chart.
   
   
Think and analye step by step:
1. What visual element used?
2. how to combine the visual element with the title text? including: combination method, scope, target.
3. what font style and text layout should be applied to the title text?

Finally, directly output a text segment as a prompt for a text-to-image model, without any markdown code.

NOTE:
1. Describe the design requirements as detailed as possible, but there is no need to elaborate on the purpose and significance of the design.
2. Do not answer each dimension one by one according to the task requirements. Instead, describe them as a whole and make it easy to understand by text-to-image model.
3. Let the text-to-image model know that the generated image should with a transparent background.
4. Strictly follow the multiple lines I determined for the title.
"""


def generate_design_prompt(title: str, background_color_hex: str, chart_style: str) -> str:
    response = client.chat.completions.create(
        model="gemini-2.5-flash",
        messages=[
            # 仅输出风格与材质等设计指导，不涉及排版/字号/对齐
            {"role": "user", "content": design_prompt.format(title=title, background_color=background_color_hex, chart_style=chart_style)}
        ]
    )
    return response.choices[0].message.content


def extract_style_description(image_path: str) -> str:
    """
    Use a large language model to generate a concise summary of an image's style.
    Input: Path to the image.
    Output: A brief summary of the image's visual style and key elements.
    """
    # Read and encode the image
    image = Image.open(image_path)
    img_buffer = io.BytesIO()
    image.save(img_buffer, format='PNG')
    img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')

    prompt = (
        "As an experienced graphic designer, please summarize in a concise way the main visual style, font style, dominant color(s), color scheme or palette, as well as major decorative or image elements of this image. "
        "Don't write long paragraphs; instead, provide several representative visual keywords or short phrases separated by commas. "
        "Describe both the style and the color characteristics in detail (for example, name specific colors, like 'navy blue background, golden accents, white text', or mention obvious palettes such as 'pastel rainbow, black and white contrast, earth tones'). "
        "Avoid generic one-word answers like 'minimalist'; be sure to mention a few core style characteristics. "
        "Here is the image (base64, png):"
    )

    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
    response = client.chat.completions.create(
        model="gpt-4o",
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
                            "url": f"data:image/png;base64,{img_base64}"
                        }
                    }
                ]
            }
        ]
    )
    return response.choices[0].message.content


def line_breaks(title: str) -> list[list[str]]:
    """
    Uses Gemini to split the title into 2 and 3 lines for better layout.
    """
    prompt = f"""
    You are an expert in typography and layout for infographics.
    Your task is to split the given title into 2 lines and 3 lines to make it visually balanced and semantically correct.

    Title: "{title}"

    Please provide the output in strictly valid JSON format as follows:
    {{
        "two_lines": ["First line", "Second line"],
        "three_lines": ["First line", "Second line", "Third line"]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        
        content = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        result = json.loads(content.strip())
        return [result.get("two_lines", [title]), result.get("three_lines", [title])]
        
    except Exception as e:
        print(f"Error in line_breaks: {e}")
        return [[title], [title]]






@dataclass
class Boundingbox:
    x: float
    y: float
    width: float
    height: float

@dataclass
class FontConfig:
    font_family: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"  # 使用系统中可用的字体
    font_size: int = 12
    font_weight: str = "normal"
    font_color: tuple[int, int, int] = (0, 0, 0)



def get_font(font_config: FontConfig):
    """
    获取字体，如果指定字体不存在则使用默认字体
    """
    try:
        return ImageFont.truetype(font_config.font_family, font_config.font_size)
    except OSError:
        # 如果指定字体不存在，尝试使用系统默认字体
        try:
            # 尝试使用DejaVu Sans字体
            return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_config.font_size)
        except OSError:
            # 如果还是失败，使用PIL的默认字体
            return ImageFont.load_default()


class Element(ABC):
    def __init__(self):
        self.bounding_box = None

class Text(Element):
    def __init__(self, content: str, font_config: FontConfig):
        super().__init__()
        self.content = content
        self.font_config = font_config
        self.font = get_font(font_config)
        self.bounding_box = None
        self.baseline = None
    def get_size(self):
        # 创建临时画布
        draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        bbox = draw.textbbox((0, 0), self.content, font=self.font)
        left, top, right, bottom = bbox
        ascent, descent = self.font.getmetrics()
        baseline_y = bottom - descent
        self.bounding_box = Boundingbox(left, top, right - left, bottom - top)
        self.baseline = baseline_y
        
    def __str__(self):
        return f"Text(bounding_box={self.bounding_box}, content={self.content})"


class LayoutType(Enum):
    """布局类型枚举"""
    HORIZONTAL = "horizontal"  # 水平布局
    VERTICAL = "vertical"      # 竖直布局


class Layout:
    """布局类，支持水平和竖直两种布局类型"""
    
    def __init__(self, layout_type: LayoutType, padding: float = 0.0):
        """
        初始化布局
        
        Args:
            layout_type: 布局类型（水平或竖直）
            padding: 元素之间的空隙大小
        """
        self.layout_type = layout_type
        self.padding = padding
    
    def layout(self, elements: list[Element], start_x: float = 0.0, start_y: float = 0.0) -> list[Element]:
        """
        对元素列表进行布局
        
        Args:
            elements: 要布局的元素列表
            start_x: 起始x坐标
            start_y: 起始y坐标
            
        Returns:
            布局后的元素列表（bounding_box已更新）
        """
        if not elements:
            return elements
        
        # 确保所有元素都有尺寸信息
        for element in elements:
            if hasattr(element, 'get_size'):
                element.get_size()
        
        current_x = start_x
        current_y = start_y
        
        for i, element in enumerate(elements):
            # 设置元素的bounding_box位置
            if element.bounding_box is not None:
                element.bounding_box.x = current_x
                element.bounding_box.y = current_y
                
                # 根据布局类型计算下一个元素的位置
                if self.layout_type == LayoutType.HORIZONTAL:
                    # 水平布局：从左到右
                    current_x += element.bounding_box.width + self.padding
                elif self.layout_type == LayoutType.VERTICAL:
                    # 竖直布局：从上到下
                    current_y += element.bounding_box.height + self.padding
        
        return elements


def layout(elements: list[Element], layout_type: LayoutType, padding: float = 0.0, start_x: float = 0.0, start_y: float = 0.0) -> list[Element]:
    """
    便捷的layout函数，直接对元素列表进行布局
    
    Args:
        elements: 要布局的元素列表
        layout_type: 布局类型（水平或竖直）
        padding: 元素之间的空隙大小
        start_x: 起始x坐标
        start_y: 起始y坐标
        
    Returns:
        布局后的元素列表（bounding_box已更新）
    """
    layout_obj = Layout(layout_type, padding)
    return layout_obj.layout(elements, start_x, start_y)


def draw(elements):
    # 只考虑Text元素（假设其他类型可忽略），计算所有元素的boundingbox总边界
    min_x = min((e.bounding_box.x for e in elements if hasattr(e, "bounding_box")), default=0)
    min_y = min((e.bounding_box.y for e in elements if hasattr(e, "bounding_box")), default=0)
    max_x = max((e.bounding_box.x + e.bounding_box.width for e in elements if hasattr(e, "bounding_box")), default=0)
    max_y = max((e.bounding_box.y + e.bounding_box.height for e in elements if hasattr(e, "bounding_box")), default=0)

    width = max_x - min_x
    height = max_y - min_y
    
    # 把width和height上取整
    width = int(round(width))
    height = int(round(height))
    
    print(f"width: {width}, height: {height}")
    # 创建透明背景的图片（RGBA）
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for element in elements:
        if isinstance(element, Text):
            # 将元素位置偏移到以(0,0)为左上角
            draw.text(
                (element.bounding_box.x - min_x, element.bounding_box.y - min_y),
                element.content,
                font=element.font,
                fill=element.font_config.font_color if hasattr(element, "font_config") and hasattr(element.font_config, "font_color") else (0, 0, 0, 255)
            )
    return image

def generate_sketch(title_lines: list[str]):
    elements = []
    for line in title_lines:
        element = Text(line, FontConfig(font_size=24))
        elements.append(element)

    # 使用水平布局，设置适当的padding
    layouted_elements = layout(elements, LayoutType.VERTICAL, padding=8.0)
    
    # 绘制布局后的元素
    image = draw(layouted_elements)
    return image

def generate_image(prompt: str, output_path: str, draft_path: Optional[str] = None):
    # 说明：prompt 仅包含风格/材质/色彩等设计指导；在此处通过 draft 明确排版与相对字号
    if draft_path:
        img = Image.open(draft_path).convert('RGBA')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        draft_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        user_text = (
            "You are a professional typography image generator. Generate a title image with PURE WHITE background. "
            "Follow the provided Draft image STRICTLY for: line breaks, layout/alignment, and relative font sizes. "
            "Do not change the layout or line order. Improve styling only (textures, materials, strokes, effects). "
            "IMPORTANT: The background must be PURE WHITE (#FFFFFF). Do not use transparent or any other colored background.\n\n"
            "Design brief (no layout instructions included):\n" + prompt +
            "\n\nNow, refine the title according to the draft's typography: keep exact line breaks and relative sizes."
        )
        print("user_prompt: ", user_text)
        print("before response")
        response = client.chat.completions.create(
            model="gemini-3-pro-image-preview",
            messages=[
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{draft_b64}"}},
                ]},
            ],
            modalities=["text", "image"]
        )
        print("after response")
    else:
        # 无草稿时退化到仅基于设计描述生成
        response = client.chat.completions.create(
            model="gemini-3-pro-image-preview",
            messages=[
                {"role": "user", "content": prompt}
            ],
            modalities=["text", "image"]
        )
    
    # 处理 Gemini 多模态响应
    image_saved = False
    if (
        hasattr(response.choices[0].message, "multi_mod_content")
        and response.choices[0].message.multi_mod_content is not None
    ):
        for part in response.choices[0].message.multi_mod_content:
            if "inline_data" in part and part["inline_data"] is not None:
                print("[Image content received]")
                image_base64 = part["inline_data"]["data"]
                if image_base64:
                    image_bytes = base64.b64decode(image_base64)
                    generated_img = Image.open(io.BytesIO(image_bytes))
                    # 将白色背景转为透明
                    generated_img = remove_white_background(generated_img)
                    # 裁剪透明边缘
                    generated_img = crop_transparent_margins(generated_img)
                    generated_img.save(output_path)
                    print(f"图片已保存至：{output_path}")
                    image_saved = True
                    return generated_img
    
    if not image_saved:
        print("未在响应中找到图片数据。")
    return None

def remove_white_background(img: Image.Image, tolerance: int = 50) -> Image.Image:
    """
    使用mask_utils中的KMeans聚类方法删除背景色，支持多种背景色（如灰白格）。
    
    Args:
        img: 输入图片
        tolerance: 颜色容差值（0-255），用于判断接近背景色的像素
    
    Returns:
        转换后的RGBA图片
    """
    from sklearn.cluster import KMeans
    from PIL import ImageFilter
    
    # 确保图片是RGBA模式
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 转换为RGB进行背景色检测
    img_rgb = img.convert('RGB')
    
    # 对图像进行高斯模糊以减少噪声
    blur_img = img_rgb.filter(ImageFilter.GaussianBlur(radius=2))
    
    # 使用KMeans聚类分析图像颜色
    img_array = np.array(blur_img)
    pixels = img_array.reshape(-1, 3).astype(np.float32)
    
    # 使用KMeans进行聚类，k=5可以捕捉主要颜色
    kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
    kmeans.fit(pixels)
    
    # 获取每个聚类的标签和数量
    labels = kmeans.labels_
    centers = kmeans.cluster_centers_
    unique_labels, counts = np.unique(labels, return_counts=True)
    
    # 按像素数量排序聚类
    sorted_indices = np.argsort(-counts)  # 降序排列
    
    print(f"检测到的聚类中心颜色和像素占比:")
    for idx in sorted_indices[:5]:
        color = tuple(int(c) for c in centers[idx])
        ratio = counts[idx] / len(labels) * 100
        print(f"  颜色 {color}: {ratio:.2f}%")
    
    # 识别背景色：选择最大的1-2个聚类作为背景色候选
    # 判断是否是灰白格背景：检查前两个最大聚类的颜色是否都接近白色/浅色
    background_colors = []
    
    # 第一大聚类（最多像素的颜色）
    largest_idx = sorted_indices[0]
    bg_color_1 = centers[largest_idx]
    background_colors.append(bg_color_1)
    
    # 检查第二大聚类是否也是背景色
    if len(sorted_indices) > 1:
        second_idx = sorted_indices[1]
        bg_color_2 = centers[second_idx]
        count_ratio = counts[second_idx] / counts[largest_idx]
        
        # 判断是否是双色背景（如灰白格）
        # 灰白格特征：
        # 1. 第二大聚类占比足够大（至少20%）
        # 2. 两种颜色都是无彩色（灰度色，RGB通道差异小）
        # 3. 或者颜色距离适中（不太近也不太远，20-150之间）
        brightness_1 = np.mean(bg_color_1)
        brightness_2 = np.mean(bg_color_2)
        
        # 检查是否为灰度色（RGB通道值接近）
        def is_grayscale(color):
            return np.std(color) < 15  # RGB通道标准差小于15，认为是灰度色
        
        is_gray_1 = is_grayscale(bg_color_1)
        is_gray_2 = is_grayscale(bg_color_2)
        
        # 计算颜色距离
        color_distance = np.linalg.norm(bg_color_1 - bg_color_2)
        
        # 判断条件：
        # 1. 占比足够（>20%）且都是灰度色（白-灰、灰-深灰等）
        # 2. 或占比足够且颜色距离适中（排除颜色完全相同或完全不同的情况）
        both_grayscale = is_gray_1 and is_gray_2
        color_dist_moderate = 20 < color_distance < 150
        
        if count_ratio > 0.2 and (both_grayscale or color_dist_moderate):
            background_colors.append(bg_color_2)
            bg_type = "灰度双色" if both_grayscale else "彩色双色"
            print(f"检测到{bg_type}背景: {tuple(int(c) for c in bg_color_1)} 和 {tuple(int(c) for c in bg_color_2)}, 颜色距离: {color_distance:.1f}")
        else:
            print(f"检测到单色背景: {tuple(int(c) for c in bg_color_1)}")
    
    # 计算每个背景色聚类的平均距离，用于自适应阈值
    adaptive_tolerances = []
    for bg_color in background_colors:
        # 找到属于这个聚类的像素
        cluster_idx = np.where(centers == bg_color)[0]
        if len(cluster_idx) > 0:
            cluster_pixels = pixels[labels == cluster_idx[0]]
            mean_dist = np.linalg.norm(cluster_pixels - bg_color, axis=1).mean()
            adaptive_tolerance = max(tolerance, mean_dist * 1.5)
            adaptive_tolerances.append(adaptive_tolerance)
        else:
            adaptive_tolerances.append(tolerance)
    
    print(f"自适应阈值: {[f'{t:.2f}' for t in adaptive_tolerances]}")
    
    # 获取原始图像数据（不模糊）
    data = np.array(img)
    rgb_data = data[:, :, :3].astype(np.float32)
    
    # 创建背景mask：对每个背景色计算距离
    background_mask = np.zeros(rgb_data.shape[:2], dtype=bool)
    
    for bg_color, adaptive_tol in zip(background_colors, adaptive_tolerances):
        bg_color_array = np.array(bg_color, dtype=np.float32)
        color_diff = rgb_data - bg_color_array
        distance = np.sqrt(np.sum(color_diff ** 2, axis=2))
        
        # 距离小于阈值的像素被认为是这个背景色
        background_mask |= (distance <= adaptive_tol)
    
    # 设置背景像素为透明
    data[background_mask, 3] = 0
    
    # 统计透明像素比例
    transparent_ratio = np.sum(background_mask) / background_mask.size * 100
    print(f"背景像素比例: {transparent_ratio:.2f}%")
    
    # 创建新图片
    new_img = Image.fromarray(data, 'RGBA')
    return new_img

def crop_transparent_margins(img: Image.Image, padding: int = 0) -> Image.Image:
    """
    裁剪RGBA图片四周的全透明边缘，保留有内容的区域。
    可选padding用于在内容周围保留一些像素边距。
    """
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    alpha = img.split()[3]
    bbox = alpha.getbbox()
    if bbox is None:
        return img
    left, upper, right, lower = bbox
    if padding > 0:
        left = max(0, left - padding)
        upper = max(0, upper - padding)
        right = min(img.width, right + padding)
        lower = min(img.height, lower + padding)
    return img.crop((left, upper, right, lower))


def run(title: str, chart_path: str, output_path: str, use_cache: bool = True):
    # 缓存检查：如果输出文件已存在且 use_cache=True，直接返回
    if use_cache and os.path.exists(output_path):
        print(f"[CACHE HIT] Title file already exists: {output_path}")
        return
    
    # 如果 use_cache=False，删除已存在的文件以强制重新生成
    if not use_cache and os.path.exists(output_path):
        print(f"[CACHE BYPASS] Deleting existing file to force regeneration: {output_path}")
        os.remove(output_path)
    
    background_color = "#ffffff"
    two_lines, three_lines = line_breaks(title)
    
    # 提取图表风格描述（chart_style 保留）
    style_description = extract_style_description(chart_path)
    print(f"style_description: {style_description}")
    
    # 生成仅包含风格/材质/色彩的设计提示，不包含排版与字号
    design_prompt = generate_design_prompt(title, background_color, chart_style=style_description)
    print(f"design_prompt: {design_prompt}")
    
    sketch_image = generate_sketch(two_lines)
    tmp_path = "./tmp.png"
    sketch_image.save(tmp_path)
    
    generated_image = generate_image(design_prompt, output_path, draft_path=None)
    print(f"generated_image: {generated_image}")
    generated_image = crop_transparent_margins(generated_image)
    crop_output_path = "./crop_output.png"
    generated_image.save(crop_output_path)
    

    # # 2. 生成title，如果已经有生成好的文件，直接读取
    # output_json_path = os.path.join(output_dir, f"{json_path.split('/')[-1].split('.')[0]}.json")
    # if os.path.exists(output_json_path):
    #     logger.info(f"{output_json_path} 已存在，直接读取。")
    # else:
    #     title_flag = process(input=json_path, output=output_json_path)
    #     if not title_flag:
    #         logger.error(f"Title generation failed for {json_path}")
    #         return
    # with open(output_json_path, 'r', encoding='utf-8') as f:
    #     title_json = json.load(f)
    # title = title_json["titles"]["main_title"]
    # subtitle = title_json["titles"]["sub_title"]
    # print(f"finished title generation")

    



    # # 提取图表风格描述（chart_style 保留）
    # style_description = extract_style_description(chart_path)
    # print(f"style_description: {style_description}")

    # 生成仅包含风格/材质/色彩的设计提示，不包含排版与字号
    # design_prompt = generate_design_prompt(title, background_color, chart_style=style_description)
    # # 基于Draft严格跟随排版与相对字号生成标题图片
    # main_title_png = os.path.join(output_dir, f"{json_path.split('/')[-1].split('.')[0]}_title.png")
    # generated_image = generate_image(design_prompt, main_title_png, draft_path=draft_path if 'draft_path' in locals() else None)
    # generated_image = crop_transparent_margins(generated_image)
    # crop_image_path = os.path.join(output_dir, f"{json_path.split('/')[-1].split('.')[0]}_title_crop.png")
    # generated_image.save(crop_image_path)
    # # 3. 计算title放置位置与大小（side模式），并拼接到chart图上
    # # try:
    # padding_px = 20
    # width, height, x, y = find_best_size_and_position(mask, crop_image_path, padding_px)
    # if width > 0 and height > 0:
    #     chart_img = Image.open(chart_path).convert("RGBA")
    #     title_img = Image.open(crop_image_path).convert("RGBA")
    #     # 按计算的尺寸缩放title
    #     title_img_resized = title_img.resize((width, height), Image.LANCZOS)
    #     # 叠加到chart上
    #     composed = Image.new("RGBA", chart_img.size)
    #     composed.paste(chart_img, (0, 0))
    #     composed.paste(title_img_resized, (x, y), mask=title_img_resized)
    #     composed_path = os.path.join(output_dir, f"{json_path.split('/')[-1].split('.')[0]}_composed.png")
    #     composed.save(composed_path)
    #     logger.info(f"Composed image saved: {composed_path}")
    # else:
    #     logger.warning("No valid placement found for title. Skipping composition.")
    

if __name__ == "__main__":
    title = "App Downloads Growth: iOS vs Google Play"
    chart_path = "/data1/liduan/ChartGalaxyDemo/buffer/App/variation_vertical_group_bar_chart_13.png"
    output_path = "./output.png"
    run(title, chart_path, output_path)