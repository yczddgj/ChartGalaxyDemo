from sklearn.cluster import KMeans
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
from collections import Counter
import os
import pandas as pd
import openai
import requests
from pathlib import Path
import time
import json
from typing import List, Dict, Optional
from PIL import Image
import base64
import numpy as np
import cv2
from io import BytesIO
import sys
import difflib

sys.path.append(Path(__file__).parent)
print(f"extract Python路径: {sys.path}")

import sys
import os
from pathlib import Path

# Add project root to sys.path to allow importing config
project_root = Path(__file__).resolve().parents[2]
sys.path.append(str(project_root))

import config

API_KEY = config.OPENAI_API_KEY
BASE_URL = config.OPENAI_BASE_URL

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def process_string(s):
    # 找到第一个数字字符的位置
    first_digit_pos = None
    for i, char in enumerate(s):
        if char.isdigit():
            first_digit_pos = i
            break
    
    # 如果有数字，截断数字及其后面的部分
    if first_digit_pos is not None:
        return s[:first_digit_pos].rstrip('_')  # 同时去掉末尾可能的下划线
    else:
        return s

def parse_chart_response(response_str):
    """
    解析大模型返回的 JSON 字符串，提取 major_categories、type_id 和 chart name。
    
    参数:
        response_str (str): 模型输出的 JSON 格式字符串
    
    返回:
        list: 按顺序排列的大类，每类包含其候选图表类型
    """
    try:
        data = json.loads(response_str)

        result = []
        for category_info in data.get("major_categories", []):
            category_name = category_info.get("category", "")
            candidates = category_info.get("candidates", [])
            result.append({
                "category": category_name,
                "candidates": candidates
            })
        print(result)
        return result

    except json.JSONDecodeError as e:
        print("❌ JSON解析失败:", e)
        return []

def get_response(image_path):
    with open(f"{Path(__file__).parent}/get_chart_type.md", 'r', encoding='utf-8') as f:
        prompt = f.read()
    client = openai.OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL
    )
    base64_image = encode_image(image_path)
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # 确保模型支持图像
        messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=300
        )
    res = response.choices[0].message.content.strip()
    res = res.replace("```json","").replace("```","")
    res = parse_chart_response(res)
    return res

def jaccard_similarity(words1, words2):
    """计算两个词集合的 Jaccard 相似度"""
    set1, set2 = set(words1), set(words2)
    intersection = set1 & set2
    union = set1 | set2
    if not union:
        return 0
    return len(intersection) / len(union)

def get_weighted_best_matches(target_types, candidates_templates, topk=5):
    
    candidates = [item[0].split("/")[-1] for item in candidates_templates]
    
    cleaned_candidates = list({process_string(s) for s in candidates})

    category_weights = {
        cat["category"]: len(target_types) - idx / 2
        for idx, cat in enumerate(target_types)
    }
    
    scored = []
    for c in cleaned_candidates:
        c_tokens = c.split('_')
        best_score = 0
        for cat_entry in target_types:
            cat_weight = category_weights[cat_entry["category"]]
            for t in cat_entry["candidates"]:
                t_tokens = t.split('_')
                score = jaccard_similarity(t_tokens, c_tokens)
                weighted_score = score * cat_weight
                if weighted_score > best_score:
                    best_score = weighted_score
        scored.append((c, best_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    scored = [item[0] for item in scored]
    
    res = []
    
    for s in scored:
        count = 0
        for c in candidates_templates:
            if s in c[0]:
                res.append(c)
                count += 1
        if len(res) > 4:
            break
        if count > 1:
            continue
        
    return res[:topk]
    

def extract_chart_type(image_path, extraction_templates):
    response = get_response(image_path)
    # print("response:",response)
    # print("extraction_templates:",extraction_templates)
    templates = get_weighted_best_matches(response, extraction_templates)
    # print("templates:",templates)
    return templates
    

def main():
    print(get_weighted_best_matches([
            {
                "category": "Pie & Donut Charts",
                "candidates": [
                    "pie_chart",
                    "donut_chart"
                ]
            },
            {
                "category": "Specialized Charts",
                "candidates": [
                    "treemap"
                ]
            },
            {
                "category": "Bar Charts",
                "candidates": [
                    "vertical_bar_chart",
                    "vertical_group_bar_chart"
                ]
            }
        ]
    ,[
        'horizontal_group_bar_chart', 'triangle_group_bar_chart', 'small_multiple_area_chart',
        'vertical_group_bar_chart', 'alluvial_diagram', 'range_area_chart_icons',
        'stacked_area_chart', 'radial_stacked_area_chart_grid', 'radial_bar_chart',
        'radial_range_area_chart_grid', 'group_radial_bar_chart', 'layered_area_chart',
        'radial_layered_area_plain_chart', 'layered_spline_area_plain_chart',
        'small_multiples_spline_graphs_plain_chart', 'diverging_area_plain_chart',
        'radial_layered_spline_area_chart_grid', 'small_multiple_area_plain_chart',
        'small_multiple_spline_area_plain_chart', 'stacked_radial_bar_chart',
        'multiple_radar_chart', 'slope_chart_plain_chart', 'dumbbell_plot_plain_chart',
        'span_plain_chart', 'multiple_area_chart', 'spline_graph', 'stepped_line_graph_plain_chart',
        'radial_stacked_area_plain_chart', 'layered_area_plain_chart',
        'small_multiples_gauge_plain_chart', 'test', 'horizontal_diverging_bar_chart',
        'spline_stacked_area_chart', 'multiple_line_graph', 'horizontal_range_bar_chart',
        'diverging_spline_area_plain_chart', 'small_multiples_semicircle_pie_plain_chart',
        'multiple_spline_graph', 'circular_stacked_bar_plain_chart', 'stacked_area_plain_chart',
        'spline_graph_plain_chart', 'horizontal_group_dot_bar_chart', 'alluvial_diagram_plain_chart',
        'slope_chart', 'multiple_pie_chart', 'radial_range_area_plain_chart',
        'small_multiple_step_line_graph_icons', 'multiple_radar_line_chart',
        'radial_stacked_bar_plain_chart', 'radial_layered_area_chart_grid', 'vertical_range_chart',
        'horizontal_group_bar_plain_chart', 'multiple_radar_spline_chart',
        'small_multiple_step_line_graph_plain_chart', 'multiple_step_line_graph',
        'range_area_plain_chart', 'radial_grouped_bar_plain_chart', 'small_multiple_line_graph',
        'spline_multiple_area_chart', 'radial_layered_spline_area_plain_chart',
        'diverging_bar_plain_chart', 'range_area_chart', 'stacked_area_chart_icons',
        'line_graph_plain_chart', 'vertical_group_bar_plain_chart',
        'small_multiples_line_graphs_plain_chart', 'stacked_circular_bar_chart',
        'spline_layered_area_chart'
    ]))
    
