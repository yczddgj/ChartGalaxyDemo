import base64
from flask import jsonify
from datetime import datetime
import traceback
import re
import os
import socket
import pandas as pd
import json

# 加载 infographics 主题配置
def load_infographic_themes():
    """加载 infographics 主题配置文件"""
    themes_path = 'infographics/themes.json'
    if os.path.exists(themes_path):
        with open(themes_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

# 获取用户数据的主题关键词
def get_data_keywords(datafile):
    """从用户数据文件中提取主题关键词"""
    json_path = os.path.join('processed_data', datafile.replace('.csv', '.json'))
    keywords = []

    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            metadata = data.get('metadata', {})

            # 从标题和描述中提取关键词
            title = metadata.get('title', '').lower()
            description = metadata.get('description', '').lower()

            # 简单分词（按空格和标点分割）
            text = f"{title} {description}"
            words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
            keywords.extend(words)

            # 从列名中提取关键词
            columns = data.get('data', {}).get('columns', [])
            for col in columns:
                col_name = col.get('name', '').lower()
                col_desc = col.get('description', '').lower()
                keywords.extend(re.findall(r'\b[a-zA-Z]{3,}\b', col_name))
                keywords.extend(re.findall(r'\b[a-zA-Z]{3,}\b', col_desc))

    # 去重
    return list(set(keywords))

# 计算主题相似性
def calculate_theme_similarity(data_keywords, infographic_keywords):
    """计算用户数据与 infographic 的主题相似性（Jaccard 相似度）"""
    if not data_keywords or not infographic_keywords:
        return 0.0

    set1 = set(word.lower() for word in data_keywords)
    set2 = set(word.lower() for word in infographic_keywords)

    intersection = len(set1 & set2)
    union = len(set1 | set2)

    if union == 0:
        return 0.0

    return intersection / union

# 获取按主题相似性排序的 infographics
def get_sorted_infographics_by_theme(datafile):
    """
    根据用户数据的主题，返回按相似性排序的 infographics 列表
    """
    themes = load_infographic_themes()
    data_keywords = get_data_keywords(datafile)

    # 获取所有 infographic 图片
    infographics_dir = 'infographics'
    image_files = []

    if os.path.exists(infographics_dir):
        files = os.listdir(infographics_dir)
        image_files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

    # 计算每个 infographic 的相似性分数
    scored_images = []
    for img in image_files:
        theme_info = themes.get(img, {})
        keywords = theme_info.get('keywords', [])

        # 添加主题名称和描述作为额外关键词
        theme_name = theme_info.get('theme', '').lower().split()
        description = theme_info.get('description', '').lower().split()
        all_keywords = keywords + theme_name + description

        similarity = calculate_theme_similarity(data_keywords, all_keywords)

        scored_images.append({
            'filename': img,
            'similarity': similarity,
            'theme': theme_info.get('theme', 'Unknown'),
            'keywords': keywords
        })

    # 按相似性降序排序
    scored_images.sort(key=lambda x: x['similarity'], reverse=True)

    return scored_images

# 获取processed_data文件夹中的所有CSV文件
def get_csv_files():
    csv_files = []
    data_dir = 'processed_data'
    if os.path.exists(data_dir):
        files = os.listdir(data_dir)
        csv_files = [f for f in files if f.endswith('.csv')]
    print(f"csv_files:{csv_files}")
    return csv_files

# 读取CSV文件内容
def read_csv_data(filename):
    try:
        filepath = os.path.join('processed_data', filename)
        df = pd.read_csv(filepath)
        print(df)
        return df.to_dict('records'), list(df.columns)
    except Exception as e:
        print(f"Error reading CSV file {filename}: {e}")
        return [], []


def image_to_base64(path):
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
        # 返回 data URI，前端可直接作为 <img src="..."> 使用
        ext = os.path.splitext(path)[-1][1:]  # 取后缀
        return f"data:image/{ext};base64,{encoded}"
    
def find_free_port(start_port=5000):
    port = start_port
    while True:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', port))
                return port
        except OSError:
            port += 1

def parse_reference_layout(reference_image_name: str) -> dict:
    """
    从 infographics/annotations.xml 中解析参考图片的布局信息

    Args:
        reference_image_name: 参考图片的文件名（例如 "Art-Origin.png"）

    Returns:
        dict: 包含title、chart、image的位置和尺寸信息，格式为：
        {
            'width': 图片宽度,
            'height': 图片高度,
            'title': {'x': x比例, 'y': y比例, 'width': 宽度比例, 'height': 高度比例},
            'chart': {...},
            'image': {...}
        }
    """
    import xml.etree.ElementTree as ET

    annotations_path = 'infographics/annotations.xml'

    if not os.path.exists(annotations_path):
        return None

    try:
        tree = ET.parse(annotations_path)
        root = tree.getroot()

        # 查找匹配的 image 元素
        for image_elem in root.findall('image'):
            if image_elem.get('name') == reference_image_name:
                img_width = float(image_elem.get('width'))
                img_height = float(image_elem.get('height'))

                layout = {
                    'width': img_width,
                    'height': img_height
                }

                # 提取所有 box 元素
                for box in image_elem.findall('box'):
                    label = box.get('label')
                    xtl = float(box.get('xtl'))
                    ytl = float(box.get('ytl'))
                    xbr = float(box.get('xbr'))
                    ybr = float(box.get('ybr'))

                    # 计算相对位置和尺寸（0-1之间的比例）
                    x_ratio = xtl / img_width
                    y_ratio = ytl / img_height
                    width_ratio = (xbr - xtl) / img_width
                    height_ratio = (ybr - ytl) / img_height

                    layout[label] = {
                        'x': x_ratio,
                        'y': y_ratio,
                        'width': width_ratio,
                        'height': height_ratio,
                        # 保留原始像素坐标用于调试
                        'xtl': xtl,
                        'ytl': ytl,
                        'xbr': xbr,
                        'ybr': ybr
                    }

                return layout

        # 如果没有找到匹配的图片
        print(f"警告: 在 annotations.xml 中未找到图片 {reference_image_name}")
        return None

    except Exception as e:
        print(f"解析 annotations.xml 失败: {e}")
        import traceback
        traceback.print_exc()
        return None