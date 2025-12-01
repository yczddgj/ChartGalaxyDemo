import json
import os
import sys
from typing import Dict, Optional, List, Tuple, Set, Union
from logging import getLogger
import logging
import time
import numpy as np
import subprocess
import re
from lxml import etree
from PIL import Image
import base64
import io
import tempfile
import random
import fcntl
import time
import traceback
from pathlib import Path
from bs4 import BeautifulSoup

project_root = Path(__file__).parent
sys.path.append(os.path.join(os.path.dirname(__file__), 'ChartPipeline'))
print("sys.path:",sys.path)

from chart_modules.ChartPipeline.modules.chart_engine.chart_engine import get_template_for_chart_name
from chart_modules.ChartPipeline.modules.chart_engine.utils.paint_innerchart import render_chart_to_svg
from chart_modules.ChartPipeline.modules.infographics_generator.svg_utils import extract_svg_content, adjust_and_get_bbox
from chart_modules.ChartPipeline.modules.infographics_generator.template_utils import select_template
from chart_modules.ChartPipeline.modules.infographics_generator.data_utils import process_temporal_data, process_numerical_data, deduplicate_combinations
from chart_modules.ChartPipeline.modules.chart_engine.template.template_registry import get_template_for_chart_type, get_template_for_chart_name
from chart_modules.reference_recognize.generate_color import generate_distinct_palette, rgb_to_hex

padding = 50
between_padding = 35


from chart_modules.style_refinement import svg_to_png

def make_infographic(data: Dict, chart_svg_content: str, output_dir: str, bg_color) -> str:
    bg_color = rgb_to_hex(bg_color)
    chart_content, chart_width, chart_height, chart_offset_x, chart_offset_y = adjust_and_get_bbox(chart_svg_content, bg_color)
    # bg_color = "#000001"
    chart_svg_content = f"""<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='{chart_width}' height='{chart_height}'>
        {chart_content}</svg>"""
    output_dir_path = os.path.dirname(output_dir)

    # 检查目录是否存在，如果不存在则创建
    if not os.path.exists(output_dir_path):
        os.makedirs(output_dir_path)
    
    with open(output_dir, 'w', encoding='utf-8') as f:
        f.write(chart_svg_content)
        
    # Convert to PNG
    if output_dir.endswith('.svg'):
        png_path = output_dir.replace('.svg', '.png')
        try:
            print(f"Converting to PNG: {png_path}")
            # 使用新的 SVG -> HTML -> Screenshot 方法
            success = svg_to_png(chart_svg_content, png_path, background_color=None)
            if success:
                print(f"Converted to PNG: {png_path}")
            else:
                print(f"Error converting to PNG: conversion failed")
        except Exception as e:
            print(f"Error converting to PNG: {e}")
            
    return output_dir


def generate_variation(input: str, output: str, chart_template, main_colors = None, bg_color = None) -> bool:
    """
    Pipeline入口函数，处理单个文件的信息图生成

    Args:
        input: 输入JSON文件路径
        output: 输出SVG文件路径
        chart_template: 可以是字符串（模板路径）或列表 [模板路径, 字段列表]

    Returns:
        bool: 处理是否成功
    """
    try:
        print(f"[DEBUG generate_variation] 开始")
        print(f"[DEBUG generate_variation] input: {input}")
        print(f"[DEBUG generate_variation] output: {output}")
        print(f"[DEBUG generate_variation] chart_template: {chart_template}")
        print(f"[DEBUG generate_variation] main_colors: {main_colors}")
        print(f"[DEBUG generate_variation] bg_color: {bg_color}")

        # 处理 chart_template 格式
        if isinstance(chart_template, list):
            # 格式: [template_path, fields] 或 [[template_path, fields]]
            if len(chart_template) >= 2 and isinstance(chart_template[1], list):
                template_path = chart_template[0]
                template_fields = chart_template[1]
            else:
                template_path = chart_template[0]
                template_fields = []
            template_for_select = [(template_path, template_fields)]
        else:
            # 字符串格式的模板路径
            template_path = chart_template
            template_for_select = [(template_path, [])]

        print("chart_template:", chart_template)
        print("template_for_select:", template_for_select)
        # 读取输入文件
        with open(input, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["name"] = input

        # 选择模板
        engine, chart_type, chart_name, ordered_fields = select_template(template_for_select)

        # 检查模板是否被过滤（在block_list中）
        if engine is None or chart_name is None:
            print(f"[跳过] 模板在block_list中，不生成: {chart_template}")
            return False

        # 颜色
        # print(data["colors"])
        data = generate_distinct_palette(data, main_colors, bg_color)
        # print(data)
        # 处理数据
        process_data_start = time.time()
        for i, field in enumerate(ordered_fields):
            data["data"]["columns"][i]["role"] = field
        process_temporal_data(data)
        process_numerical_data(data)
        deduplicate_combinations(data)
        
        # print("数据:",time.time())
        
        # 获取图表模板
        get_template_start = time.time()
        print("chart_name:",chart_name)
        engine_obj, template = get_template_for_chart_name(chart_name)
        if engine_obj is None or template is None:
            logger.error(f"Failed to load template: {engine}/{chart_type}/{chart_name}")
            return False

        # print("模板:",time.time())
        
        # 处理输出文件名，将路径分隔符替换为下划线
        title_font_family = "Arial"
        if "hand" in chart_name:
            title_font_family = "Comics"
        
        if '-' in engine:
            framework, framework_type = engine.split('-')
        elif '_' in engine:
            framework, framework_type = engine.split('_')
        else:
            framework = engine
            framework_type = None

        # print("开始渲染:",time.time())
        _, chart_svg_content = render_chart_to_svg(
            json_data=data,
            js_file=template,
            framework=framework,
            framework_type=framework_type
        )
        chart_inner_content = extract_svg_content(chart_svg_content)
        
        assemble_start = time.time()
        data["chart_type"] = chart_type
        
        # print("渲染结束:",time.time())
        
        print("bg_color:",bg_color)
        return make_infographic(
            data=data,
            chart_svg_content=chart_inner_content,
            output_dir=output,
            bg_color=bg_color
        )
                
    except Exception as e:
        print(f"Error processing infographics: {e} {traceback.format_exc()}")
        return False
    
    

if __name__ == "__main__":
    start = time.time()
    generate_variation(
        input="processed_data/App.json",
        output="/data/minzhi/code/ChartGalaxyDemo/buffer/1.svg",
        chart_template = ['d3-js/multiple pie chart/multiple_pie_chart_02', ['x', 'y', 'group']],
        main_colors = [[25, 33, 24], [234, 232, 216], [243, 228, 146], [100, 110, 99], [171, 172, 148]],
        bg_color = [255, 255, 255]
    )
    process_time = time.time() - start
    print(f"渲染{process_time:.4f} seconds")