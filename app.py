from flask import Flask, render_template, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import pandas as pd
import os
import time
import random
import socket
import random
from threading import Thread
import traceback
import sys
import json
import re
import hashlib
import shutil
from pathlib import Path
from datetime import datetime
import difflib

project_root = Path(__file__).parent.parent  # 根据实际结构调整
sys.path.append("ChartPipeline")
# print(f"Python路径: {sys.path}")

from chart_modules.util import image_to_base64, find_free_port, get_csv_files, read_csv_data, get_sorted_infographics_by_theme, parse_reference_layout
from chart_modules.generate_variation import generate_variation
from chart_modules.process import conduct_reference_finding, conduct_layout_extraction, conduct_title_generation, conduct_pictogram_generation, conduct_chart_type_preview_generation, conduct_variation_preview_generation
from chart_modules.style_refinement import process_final_export, direct_generate_with_ai, svg_to_png, check_material_cache
from chart_modules.ChartPipeline.modules.infographics_generator.template_utils import block_list
from chart_modules.ChartPipeline.modules.chart_type_recommender.chart_type_recommender import recommend_chart_types_with_llm


app = Flask(__name__)
CORS(app)

# 加载parsed_variations.json
PARSED_VARIATIONS = []
try:
    with open('parsed_variations.json', 'r', encoding='utf-8') as f:
        PARSED_VARIATIONS = json.load(f)
except Exception as e:
    print(f"Warning: Could not load parsed_variations.json: {e}")

# 存储生成状态
generation_status = {
    'step': 'idle',
    'status': 'idle',
    'progress': '',
    'completed': False,
    'style': {},
    'selected_data': '',
    'selected_pictogram': '',
    'selected_title': '',  # 添加选中的标题信息
    "extraction_templates" : [],
    'id': ''
}

# 分页状态（不需要持久化）
reference_page = 0

CACHE_FILE = "generation_status_cache.json"

def load_generation_status():
    """每次读取最新的 generation_status（如果文件不存在，则写入初始值）"""
    global generation_status
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                generation_status = json.load(f)
        except:
            pass
    else:
        # 第一次运行自动写入
        save_generation_status()

def save_generation_status():
    """每次更新 generation_status 都保存到 cache 中"""
    global generation_status
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(generation_status, f, indent=2, ensure_ascii=False)

def threaded_task(task_fn, *args):
    """
    线程用 wrapper：
    1) 先执行任务函数
    2) 任务函数结束之后保存 generation_status
    """
    global generation_status
    try:
        task_fn(*args)
    finally:
        save_generation_status()   # 👈 线程结束后更新 cache


@app.route('/authoring/generate_final')
def authoring():
    global generation_status
    # app.logger.debug("final generation_status")
    # app.logger.debug(generation_status)
    
    charttype = request.args.get('charttype', 'bar')
    datafile = request.args.get('data', 'test')
    title = request.args.get('title', '')
    pictogram = request.args.get('pictogram', '')
    
    return render_template('main.html', charttype = charttype, data = datafile, title = title, pictogram = pictogram)

@app.route('/authoring/chart', methods=['GET'])
def generate_chart():
    global generation_status
    load_generation_status()

    charttype = request.args.get('charttype', 'bar')
    datafile = request.args.get('data', 'test')
    title = request.args.get('title', '')
    pictogram = request.args.get('pictogram', '')

    app.logger.info(f"Chart type: {charttype}")
    app.logger.info(f"Data: {datafile}")

    try:
        # 处理标题路径
        if not title or title == '':
            # 如果没有提供标题，尝试从 generation_status 获取第一个
            if 'title_options' in generation_status and generation_status['title_options']:
                 # title_options keys are filenames like "title_0_hash.png"
                 first_title = sorted(list(generation_status['title_options'].keys()))[0]
                 title = f"buffer/{generation_status['id']}/{first_title}"
            else:
                 # Fallback
                 title = f"buffer/{generation_status['id']}/title_0.png"
        elif "origin_images" not in title:
            # 如果不是 origin_images，添加 buffer 路径
            title = f"buffer/{generation_status['id']}/{title}"

        # 处理配图路径
        if not pictogram or pictogram == '':
            # 如果没有提供配图，尝试从 generation_status 获取第一个
            if 'pictogram_options' in generation_status and generation_status['pictogram_options']:
                 first_pictogram = sorted(list(generation_status['pictogram_options'].keys()))[0]
                 pictogram = f"buffer/{generation_status['id']}/{first_pictogram}"
            else:
                 pictogram = f"buffer/{generation_status['id']}/pictogram_0.png"
        elif "origin_images" not in pictogram:
            # 如果不是 origin_images，添加 buffer 路径
            pictogram = f"buffer/{generation_status['id']}/{pictogram}"
            
        img1_base64 = image_to_base64(title)
        img2_base64 = image_to_base64(pictogram)

        # 查找选中的 variation 的完整模板信息
        selected_variation = None
        variations = generation_status.get('available_variations', [])
        for v in variations:
            if v['name'] == charttype:
                selected_variation = v
                break

        if selected_variation:
            template_path = selected_variation['template']
            template_fields = selected_variation.get('fields', [])
            chart_template = [template_path, template_fields]
        else:
            # 回退：尝试从 extraction_templates 中查找
            templates = generation_status.get('extraction_templates', [])
            for t in templates:
                if t[0].endswith(charttype):
                    template_path = t[0]
                    template_fields = t[1] if len(t) > 1 else []
                    chart_template = [template_path, template_fields]
                    break
            else:
                # 如果还找不到，使用原来的方式（可能会失败）
                chart_template = charttype

        current_time = datetime.now().strftime("%Y%m%d%H%M%S")
        output_path = f"buffer/{generation_status['id']}/{charttype}.svg"
        print("generate_variation:", charttype, chart_template, generation_status['style']["colors"], generation_status['style']["bg_color"])

        svg = generate_variation(
            input = f"processed_data/{datafile}.json",
            output = output_path,
            chart_template = chart_template,
            main_colors = generation_status['style']["colors"],
            bg_color = generation_status['style']["bg_color"]
        )

        # generate_variation now also generates a PNG file at output_path.replace('.svg', '.png')
        png_filename = f"{charttype}.png"
        png_url = f"/currentfilepath/{png_filename}"

        with open(output_path, 'r', encoding='utf-8') as file:
            svg = file.read()

        if svg is None:
            return jsonify({'error': 'no result'}), 401

        # 获取背景色并转换为 hex 格式
        bg_color = generation_status['style'].get("bg_color", [245, 243, 239])
        if isinstance(bg_color, list) and len(bg_color) == 3:
            bg_hex = "#{:02x}{:02x}{:02x}".format(bg_color[0], bg_color[1], bg_color[2])
        else:
            bg_hex = "#f5f3ef"

        # 将 SVG 转换为 PNG，使用透明背景
        png_output_path = output_path.replace('.svg', '.png')
        svg_to_png(svg, png_output_path, background_color=None)

        # 将 PNG 转换为 base64
        chart_base64 = image_to_base64(png_output_path)

        # 解析参考图的布局信息
        layout = None
        reference_image_path = generation_status.get('selected_reference')
        if reference_image_path:
            # 提取文件名（例如 "infographics/Art-Origin.png" -> "Art-Origin.png"）
            reference_filename = os.path.basename(reference_image_path)
            layout = parse_reference_layout(reference_filename)
            if layout:
                print(f"成功解析参考图布局: {reference_filename}")
            else:
                print(f"未找到参考图布局信息: {reference_filename}")

        # 返回 JSON 字典（chart 现在是 PNG 图片而不是 SVG）
        return jsonify({
            'chart': chart_base64,
            'img1': img1_base64,
            'img2': img2_base64,
            'bg_color': bg_hex,
            'layout': layout  # 添加布局信息
        })

    except Exception as e:
        app.logger.error(f'Unsupported: {e}\n{traceback.format_exc()}')
        return jsonify({'error': f'Unsupported: {e}', 'trace': traceback.format_exc()}), 500

@app.route('/')
def index():
    csv_files = get_csv_files()
    return render_template('index.html', csv_files=csv_files)

@app.route('/api/data/<datafile>')
def get_data(datafile):
    data, columns = read_csv_data(datafile)
    return jsonify({
        'data': data,
        'columns': columns
    })

@app.route('/api/start_find_reference/<datafile>')
def start_find_reference(datafile):
    # 寻找适配的variation
    global generation_status, reference_page
    load_generation_status()

    generation_status["selected_data"] = f'processed_data/{datafile.replace("csv","json")}'
    # 使用数据集名称作为 buffer 文件夹名，去除 .csv 扩展名
    # 这样同一个数据集的生成结果会保存在同一个文件夹中，实现缓存复用
    dataset_name = datafile.replace('.csv', '')
    generation_status['id'] = dataset_name

    # 确保 buffer 文件夹存在
    buffer_dir = f'buffer/{dataset_name}'
    os.makedirs(buffer_dir, exist_ok=True)

    # 重置 chart type 和 variation 相关状态
    generation_status['chart_type_page'] = 0
    generation_status['variation_page'] = 0
    generation_status['selected_chart_type'] = ''
    generation_status['extraction_templates'] = None
    generation_status['available_chart_types'] = None
    save_generation_status()

    # 重置 reference 分页（内存变量）
    reference_page = 0

    # 启动布局抽取线程
    thread = Thread(target = threaded_task, args=(conduct_reference_finding, datafile, generation_status,))
    thread.start()
    return jsonify({'status': 'started'})

@app.route('/api/start_layout_extraction/<reference>/<datafile>')
def start_layout_extraction(reference, datafile):
    # 寻找适配的variation
    global generation_status
    load_generation_status()
    app.logger.debug("generation_status")
    app.logger.debug(generation_status)
    
    # 启动布局抽取线程
    thread = Thread(target=threaded_task, args=(conduct_layout_extraction, reference, datafile, generation_status,))
    thread.start()

    return jsonify({'status': 'started'})

@app.route('/api/start_title_generation/<datafile>')
def start_title_generation(datafile):
    """生成标题图片"""
    global generation_status
    load_generation_status()
    # 需要开始保存生成的结果，创建一个ID
    
    # 启动布局抽取线程
    thread = Thread(target=threaded_task, args=(conduct_title_generation, datafile,generation_status,))
    thread.start()
    
    return jsonify({'status': 'started'})

@app.route('/api/start_pictogram_generation/<title>')
def start_pictogram_generation(title):
    global generation_status
    load_generation_status()
    app.logger.debug(f"title_text:{title}")

    # 启动配图生成线程
    thread = Thread(target=threaded_task, args=(conduct_pictogram_generation, title, generation_status,))
    thread.start()

    return jsonify({'status': 'started'})

@app.route('/api/regenerate_title/<datafile>')
def regenerate_title(datafile):
    """重新生成单张标题图片"""
    global generation_status
    load_generation_status()

    # 启动标题重新生成线程，use_cache=False 强制重新生成
    thread = Thread(target=threaded_task, args=(conduct_title_generation, datafile, generation_status, False))
    thread.start()

    return jsonify({'status': 'started'})

@app.route('/api/regenerate_pictogram/<title>')
def regenerate_pictogram(title):
    """重新生成单张配图图片"""
    global generation_status
    load_generation_status()

    # 启动配图重新生成线程，use_cache=False 强制重新生成
    thread = Thread(target=threaded_task, args=(conduct_pictogram_generation, title, generation_status, False))
    thread.start()

    return jsonify({'status': 'started'})

# @app.route('/api/generate_final/<filename>')
# def generate_final_infographic(filename):
#     global generation_status
    
#     # 从请求中获取选择的标题索引
#     selected_title_index = request.args.get('selected_title_index', '0')
#     base_name = filename.replace('.csv', '')
    
#     # 普通处理：使用默认的图片名称
#     image_name = filename.replace('.csv', '.png')
    
#     # 检查图片是否存在
#     image_path = os.path.join('infographics', image_name)
#     if not os.path.exists(image_path):
#         return jsonify({'error': '对应的信息图表不存在'}), 404
    
#     # 启动最终生成线程
#     thread = Thread(target=simulate_final_generation, args=(image_name,))
#     thread.start()
    
#     return jsonify({'status': 'started'})

@app.route('/api/status')
def get_status():
    # Do NOT load from file here, as it might overwrite in-memory progress updates from running threads
    # load_generation_status()
    return jsonify(generation_status)

@app.route('/api/layout')
def get_layout():
    """获取当前选中参考图的布局信息"""
    global generation_status
    load_generation_status()

    layout = None
    reference_image_path = generation_status.get('selected_reference')
    if reference_image_path:
        reference_filename = os.path.basename(reference_image_path)
        layout = parse_reference_layout(reference_filename)

    return jsonify({'layout': layout})

@app.route('/api/chart_types')
def get_chart_types():
    """获取推荐的 chart type 列表，基于数据特征使用大模型推荐，每次返回3个"""
    global generation_status
    load_generation_status()

    # 检查是否有选中的数据文件，如果有则使用大模型推荐
    selected_data = generation_status.get('selected_data', '')
    use_llm_recommendation = False
    llm_recommendations = []
    
    if selected_data and os.path.exists(selected_data):
        try:
            # 读取数据文件
            with open(selected_data, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 获取所有可用的图表类型名称（从 PARSED_VARIATIONS）
            available_chart_type_names = []
            templates = generation_status.get('extraction_templates', [])
            available_variations = set()
            for template in templates:
                parts = template[0].split('/')
                if len(parts) >= 3:
                    available_variations.add(parts[2])
            
            for parsed_item in PARSED_VARIATIONS:
                chart_type_name = parsed_item['name']
                variations = parsed_item.get('variations', [])
                if any(v in available_variations for v in variations):
                    available_chart_type_names.append(chart_type_name)
            
            # 使用大模型推荐
            print(f"[DEBUG] 使用大模型推荐图表类型，数据文件: {selected_data}")
            llm_recommendations = recommend_chart_types_with_llm(data, available_chart_type_names)
            use_llm_recommendation = True
            print(f"[DEBUG] 大模型推荐结果: {llm_recommendations}")
        except Exception as e:
            print(f"[WARNING] 使用大模型推荐失败: {e}")
            import traceback
            traceback.print_exc()
            use_llm_recommendation = False

    # 如果缓存中已有 available_chart_types，直接使用
    if generation_status.get('available_chart_types'):
        chart_types = generation_status['available_chart_types']
        # 验证缓存中的图片文件是否仍然存在
        static_chart_types_dir = os.path.join(app.root_path, 'static', 'chart_types')
        filtered_chart_types = []
        for ct in chart_types:
            if ct.get('image_url'):
                # 从 image_url 中提取文件名，例如 "/static/chart_types/Bar Chart.png" -> "Bar Chart.png"
                image_filename = ct['image_url'].replace('/static/chart_types/', '')
                image_path = os.path.join(static_chart_types_dir, image_filename)
                if os.path.exists(image_path):
                    filtered_chart_types.append(ct)
                    print(f"图片文件存在: {image_path}")
                else:
                    print(f"图片文件不存在: {image_path}")
        chart_types = filtered_chart_types
        # 如果过滤后有变化，更新缓存
        if len(chart_types) != len(generation_status['available_chart_types']):
            generation_status['available_chart_types'] = chart_types
            save_generation_status()
    else:
        # 从 extraction_templates 中提取可用的 chart type
        templates = generation_status.get('extraction_templates', [])
        
        # 1. 收集所有可用的 variation 名称
        available_variations = set()
        for template in templates:
            # 模板格式: "d3-js/grouped scatterplot/grouped_scatterplot_plain_chart_01"
            parts = template[0].split('/')
            if len(parts) >= 3:
                variation_name = parts[2]
                available_variations.add(variation_name)

        # 2. 根据 PARSED_VARIATIONS 确定可用的 chart type
        available_types = set()
        for parsed_item in PARSED_VARIATIONS:
            chart_type_name = parsed_item['name']
            variations = parsed_item.get('variations', [])
            for v in variations:
                if v in available_variations:
                    available_types.add(chart_type_name)
                    break

        # 按照 parsed_variations.json 的顺序筛选和排序
        chart_types = []
        
        # 获取所有示意图文件
        chart_type_images = {}
        static_chart_types_dir = os.path.join(app.root_path, 'static', 'chart_types')
        if os.path.exists(static_chart_types_dir):
            files = os.listdir(static_chart_types_dir)
            for f in files:
                if f.lower().endswith('.png'):
                    # Key is lowercase filename without extension
                    key = f.lower().replace('.png', '')
                    chart_type_images[key] = f

        for parsed_item in PARSED_VARIATIONS:
            chart_type_name = parsed_item['name']
            # 只保留在 extraction_templates 中出现的 chart type
            if chart_type_name in available_types:
                # 找一个代表性模板
                representative_template = None
                type_variations = set(parsed_item.get('variations', []))
                
                for template in templates:
                    parts = template[0].split('/')
                    if len(parts) >= 3:
                        variation_name = parts[2]
                        if variation_name in type_variations:
                            representative_template = template[0]
                            break
                
                # Find matching image
                image_filename = None
                search_name = chart_type_name.lower()
                
                # 1. Try exact match (lowercase)
                if search_name in chart_type_images:
                    image_filename = chart_type_images[search_name]
                    print(f"[MATCH] Exact match: '{chart_type_name}' -> '{image_filename}'")
                else:
                    # 2. Try fuzzy match (提高阈值到 0.85，并验证相似度)
                    matches = difflib.get_close_matches(search_name, chart_type_images.keys(), n=1, cutoff=0.85)
                    if matches:
                        matched_key = matches[0]
                        # 计算实际相似度
                        similarity = difflib.SequenceMatcher(None, search_name, matched_key).ratio()
                        # 额外检查：确保匹配的关键词有重叠（至少有一个主要词匹配）
                        search_words = set(search_name.split())
                        matched_words = set(matched_key.split())
                        common_words = search_words & matched_words
                        # 排除常见词 "chart", "bar", "area" 等
                        meaningful_words = {'chart', 'bar', 'area', 'line', 'graph', 'pie', 'donut', 'scatter', 'radar', 'gauge', 'funnel', 'treemap', 'heatmap', 'histogram'}
                        meaningful_common = common_words - meaningful_words
                        
                        if similarity >= 0.85 and (len(meaningful_common) > 0 or similarity >= 0.9):
                            image_filename = chart_type_images[matched_key]
                            print(f"[MATCH] Fuzzy match: '{chart_type_name}' -> '{image_filename}' (similarity: {similarity:.2f}, common words: {meaningful_common})")
                        else:
                            print(f"[MATCH] Fuzzy match rejected: '{chart_type_name}' -> '{matched_key}' (similarity: {similarity:.2f} too low or no meaningful words)")
                    
                    # 3. If not found and contains "multiple", try removing "multiple"
                    if not image_filename and 'multiple' in search_name:
                        # Remove 'multiple' and 'small' (often appear together) and extra spaces
                        stripped_name = search_name.replace('multiple', '').replace('small', '').strip()
                        # Clean up double spaces if any
                        stripped_name = ' '.join(stripped_name.split())
                        
                        # Try exact match with stripped name
                        if stripped_name in chart_type_images:
                            image_filename = chart_type_images[stripped_name]
                            print(f"[MATCH] Exact match (stripped): '{chart_type_name}' -> '{image_filename}'")
                        else:
                            # Try fuzzy match with stripped name (同样提高阈值)
                            matches = difflib.get_close_matches(stripped_name, chart_type_images.keys(), n=1, cutoff=0.85)
                            if matches:
                                matched_key = matches[0]
                                similarity = difflib.SequenceMatcher(None, stripped_name, matched_key).ratio()
                                search_words = set(stripped_name.split())
                                matched_words = set(matched_key.split())
                                common_words = search_words & matched_words
                                meaningful_words = {'chart', 'bar', 'area', 'line', 'graph', 'pie', 'donut', 'scatter', 'radar', 'gauge', 'funnel', 'treemap', 'heatmap', 'histogram'}
                                meaningful_common = common_words - meaningful_words
                                
                                if similarity >= 0.85 and (len(meaningful_common) > 0 or similarity >= 0.9):
                                    image_filename = chart_type_images[matched_key]
                                    print(f"[MATCH] Fuzzy match (stripped): '{chart_type_name}' -> '{image_filename}' (similarity: {similarity:.2f})")
                    
                    if not image_filename:
                        print(f"[MATCH] No match found for: '{chart_type_name}'")
                
                # 检查图片文件是否真实存在
                if image_filename:
                    image_path = os.path.join(static_chart_types_dir, image_filename)
                    if os.path.exists(image_path):
                        image_url = f"/static/chart_types/{image_filename}"
                        chart_types.append({
                            'type': chart_type_name,
                            'template': representative_template,
                            'image_url': image_url
                        })
                    # 如果文件不存在，跳过这个 chart type

        # 保存到 generation_status
        generation_status['available_chart_types'] = chart_types
        save_generation_status()  # 保存到缓存文件

    # 如果使用了大模型推荐，只返回推荐的图表类型（最多6个）
    if use_llm_recommendation and llm_recommendations:
        # 只使用推荐的图表类型，不包含其他未推荐的
        recommended_chart_types = []
        recommended_type_names = set()
        
        # 创建推荐类型名称到推荐信息的映射
        recommendation_map = {rec['type']: rec for rec in llm_recommendations}
        
        # 只添加推荐的图表类型（按推荐顺序，最多6个）
        for rec in llm_recommendations[:6]:  # 确保最多6个
            chart_type_name = rec['type']
            if chart_type_name in recommended_type_names:
                continue  # 跳过重复的
            
            # 在 chart_types 中查找匹配的项
            found = False
            for ct in chart_types:
                if ct['type'] == chart_type_name:
                    # 添加推荐信息
                    ct['confidence'] = rec.get('confidence', 0.5)
                    ct['reasoning'] = rec.get('reasoning', '')
                    recommended_chart_types.append(ct)
                    recommended_type_names.add(chart_type_name)
                    found = True
                    break
            
            # 如果在现有 chart_types 中没找到，创建一个新的
            if not found:
                # 尝试从 PARSED_VARIATIONS 获取信息
                for parsed_item in PARSED_VARIATIONS:
                    if parsed_item['name'] == chart_type_name:
                        # 获取图片
                        image_filename = None
                        static_chart_types_dir = os.path.join(app.root_path, 'static', 'chart_types')
                        if os.path.exists(static_chart_types_dir):
                            files = os.listdir(static_chart_types_dir)
                            chart_type_images = {f.lower().replace('.png', ''): f for f in files if f.lower().endswith('.png')}
                            search_name = chart_type_name.lower()
                            if search_name in chart_type_images:
                                image_filename = chart_type_images[search_name]
                        
                        image_url = f"/static/chart_types/{image_filename}" if image_filename else None
                        recommended_chart_types.append({
                            'type': chart_type_name,
                            'template': None,
                            'image_url': image_url,
                            'confidence': rec.get('confidence', 0.5),
                            'reasoning': rec.get('reasoning', '')
                        })
                        recommended_type_names.add(chart_type_name)
                        break
        
        chart_types = recommended_chart_types
        print(f"[DEBUG] 只返回推荐的图表类型（{len(chart_types)}个）: {[ct['type'] for ct in chart_types]}")

    # 分页获取，每页3个
    page = generation_status.get('chart_type_page', 0)
    page_size = 3
    start_idx = page * page_size
    end_idx = start_idx + page_size

    current_page_types = chart_types[start_idx:end_idx]
    has_more = end_idx < len(chart_types)

    return jsonify({
        'chart_types': current_page_types,
        'page': page,
        'total': len(chart_types),
        'has_more': has_more,
        'recommended': use_llm_recommendation  # 标识是否使用了推荐
    })

@app.route('/api/chart_types/generate_previews')
def generate_chart_type_previews():
    """为当前页的 chart types 生成预览图"""
    global generation_status
    load_generation_status()

    print(f"[DEBUG API] generate_chart_type_previews 被调用")
    print(f"[DEBUG API] generation_status keys: {generation_status.keys()}")

    chart_types = generation_status.get('available_chart_types', [])
    page = generation_status.get('chart_type_page', 0)
    page_size = 3
    start_idx = page * page_size
    end_idx = start_idx + page_size
    current_page_types = chart_types[start_idx:end_idx]

    print(f"[DEBUG API] available_chart_types 数量: {len(chart_types)}")
    print(f"[DEBUG API] current_page_types: {current_page_types}")
    print(f"[DEBUG API] extraction_templates 数量: {len(generation_status.get('extraction_templates', []))}")

    # 启动预览生成线程
    thread = Thread(target=threaded_task, args=(conduct_chart_type_preview_generation, current_page_types, generation_status,))
    thread.start()

    return jsonify({'status': 'started', 'chart_types': current_page_types})

@app.route('/api/chart_types/next')
def get_next_chart_types():
    """获取下一批 chart types（加载更多功能）"""
    global generation_status
    load_generation_status()

    chart_types = generation_status.get('available_chart_types', [])
    page = generation_status.get('chart_type_page', 0)
    page_size = 3
    total_pages = (len(chart_types) + page_size - 1) // page_size

    # 加载下一页（不循环，如果已经到最后一页则不再加载）
    if (page + 1) < total_pages:
        generation_status['chart_type_page'] = page + 1
        save_generation_status()

    return get_chart_types()

@app.route('/api/chart_types/select/<chart_type>')
def select_chart_type(chart_type):
    """选择一个 chart type，并生成对应的 variations，按照parsed_variations.json的顺序"""
    global generation_status
    load_generation_status()

    generation_status['selected_chart_type'] = chart_type
    generation_status['variation_page'] = 0  # 重置 variation 分页

    # 从 parsed_variations.json 中获取该 chart type 的 variation 顺序
    parsed_variations_for_type = []
    for parsed_item in PARSED_VARIATIONS:
        if parsed_item['name'] == chart_type:
            parsed_variations_for_type = parsed_item['variations']
            break

    # 筛选该 chart type 下的所有可用 variations
    templates = generation_status.get('extraction_templates', [])
    available_variation_templates = {}  # variation_name -> template_info

    print(f"[DEBUG] 开始筛选 chart type: {chart_type}")
    print(f"[DEBUG] extraction_templates 总数: {len(templates)}")

    for template in templates:
        parts = template[0].split('/')
        if len(parts) >= 2 and parts[1] == chart_type:
            # 提取 variation 名称 (最后一部分)
            variation_name = parts[-1] if len(parts) >= 3 else template[0]

            # 过滤掉 block_list 中的模板
            if variation_name in block_list:
                print(f"[过滤] 跳过被禁用的样式: {variation_name}")
                continue

            available_variation_templates[variation_name] = {
                'name': variation_name,
                'template': template[0],
                'fields': template[1] if len(template) > 1 else []
            }

    print(f"[DEBUG] 找到的可用 variation 模板数: {len(available_variation_templates)}")
    print(f"[DEBUG] 可用 variation 名称: {list(available_variation_templates.keys())}")
    print(f"[DEBUG] parsed_variations.json 中的 variation 数: {len(parsed_variations_for_type)}")
    print(f"[DEBUG] parsed_variations.json 中的 variation 名称: {parsed_variations_for_type}")

    # 按照 parsed_variations.json 的顺序排序
    variations = []
    for variation_name in parsed_variations_for_type:
        if variation_name in available_variation_templates:
            variations.append(available_variation_templates[variation_name])
        else:
            print(f"[警告] variation '{variation_name}' 在 parsed_variations.json 中，但不在 extraction_templates 中")

    print(f"[DEBUG] 最终筛选出的 variations 数: {len(variations)}")
    print(f"[DEBUG] 最终 variations: {[v['name'] for v in variations]}")

    generation_status['available_variations'] = variations
    save_generation_status()

    return jsonify({
        'status': 'selected',
        'chart_type': chart_type,
        'variation_count': len(variations)
    })

@app.route('/api/variations')
def get_variations():
    """获取当前 chart type 的 variations，每次返回3个，并验证是否在parsed_variations.json中"""
    global generation_status, PARSED_VARIATIONS
    load_generation_status()

    # 重新加载 parsed_variations.json 以确保使用最新数据
    try:
        with open('parsed_variations.json', 'r', encoding='utf-8') as f:
            PARSED_VARIATIONS = json.load(f)
    except Exception as e:
        print(f"Warning: Could not reload parsed_variations.json: {e}")

    variations = generation_status.get('available_variations', [])
    selected_chart_type = generation_status.get('selected_chart_type', '')
    
    # 获取当前图表类型在 parsed_variations.json 中的有效 variation 列表
    valid_variation_names = set()
    if selected_chart_type:
        for parsed_item in PARSED_VARIATIONS:
            if parsed_item['name'] == selected_chart_type:
                valid_variation_names = {v for v in parsed_item['variations']}
                break
    
    # 过滤掉不在 parsed_variations.json 中的 variations
    if valid_variation_names:
        filtered_variations = [v for v in variations if v.get('name') in valid_variation_names]
        # 如果过滤后数量变化，更新缓存
        if len(filtered_variations) != len(variations):
            generation_status['available_variations'] = filtered_variations
            save_generation_status()
        variations = filtered_variations

    # 分页获取，每页3个
    page = generation_status.get('variation_page', 0)
    page_size = 3
    start_idx = page * page_size
    end_idx = start_idx + page_size

    current_page_variations = variations[start_idx:end_idx]
    has_more = end_idx < len(variations)

    return jsonify({
        'variations': current_page_variations,
        'page': page,
        'total': len(variations),
        'has_more': has_more,
        'chart_type': selected_chart_type
    })

@app.route('/api/variations/generate_previews')
def generate_variation_previews():
    """为 variations 生成预览图，支持为所有或当前页生成"""
    global generation_status
    load_generation_status()

    variations = generation_status.get('available_variations', [])
    print("variations", variations)
    # 检查是否要生成所有variations的预览图（通过查询参数）
    generate_all = request.args.get('all', 'false').lower() == 'true'
    
    if generate_all:
        # 为所有variations生成预览图
        variations_to_generate = variations
    else:
        # 只为当前页生成
        page = generation_status.get('variation_page', 0)
        page_size = 3
        start_idx = page * page_size
        end_idx = start_idx + page_size
        variations_to_generate = variations[start_idx:end_idx]

    # 启动预览生成线程
    thread = Thread(target=threaded_task, args=(conduct_variation_preview_generation, variations_to_generate, generation_status,))
    thread.start()

    return jsonify({'status': 'started', 'variations': variations_to_generate, 'total': len(variations_to_generate)})

@app.route('/api/variations/next')
def get_next_variations():
    """获取下一批 variations（加载更多功能）"""
    global generation_status
    load_generation_status()

    variations = generation_status.get('available_variations', [])
    page = generation_status.get('variation_page', 0)
    page_size = 3
    total_pages = (len(variations) + page_size - 1) // page_size

    # 加载下一页（不循环，如果已经到最后一页则不再加载）
    if (page + 1) < total_pages:
        generation_status['variation_page'] = page + 1
        save_generation_status()

    return get_variations()

@app.route('/api/variation/selection')
def get_extraction_templates():
    global generation_status
    load_generation_status()
    # app.logger.debug(generation_status)
    return jsonify([item[0].split("/")[-1] for item in generation_status['style']['variation']])

@app.route('/api/references')
def get_references():
    """获取参考图：基于主题相似性排序，支持分页（首次返回5张，可加载更多）"""
    global generation_status, reference_page
    load_generation_status()

    # 获取当前用户的数据文件
    selected_data = generation_status.get('selected_data', '')
    datafile = selected_data.replace('processed_data/', '').replace('.json', '.csv') if selected_data else ''

    # 获取分页参数
    page = reference_page
    page_size = 3

    if datafile:
        # 根据主题相似性排序
        sorted_images = get_sorted_infographics_by_theme(datafile)
    else:
        # 如果没有数据文件，使用随机排序
        infographics_dir = 'infographics'
        image_files = []
        if os.path.exists(infographics_dir):
            files = os.listdir(infographics_dir)
            image_files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg')) and 'Origin' in f]
            random.shuffle(image_files)

        sorted_images = [{'filename': f, 'similarity': 0.0, 'theme': 'Unknown'} for f in image_files]

    # 分页
    start_idx = page * page_size
    end_idx = start_idx + page_size
    current_page_images = sorted_images[start_idx:end_idx]
    has_more = end_idx < len(sorted_images)

    # 提取文件名
    image_names = [img['filename'] for img in current_page_images]

    # 所有图片地位一样，不区分主图和其他图
    return jsonify({
        'main_image': None,  # 不再有主图的概念
        'random_images': image_names,  # 所有图片都一样显示
        'page': page,
        'total': len(sorted_images),
        'has_more': has_more,
        'similarities': {img['filename']: img['similarity'] for img in current_page_images}
    })

@app.route('/api/references/next')
def get_next_references():
    """获取下一批参考图（加载更多功能）"""
    global generation_status, reference_page
    load_generation_status()

    # 获取当前数据文件
    selected_data = generation_status.get('selected_data', '')
    datafile = selected_data.replace('processed_data/', '').replace('.json', '.csv') if selected_data else ''

    if datafile:
        sorted_images = get_sorted_infographics_by_theme(datafile)
    else:
        return jsonify({'status': 'error', 'message': 'No data file selected'}), 400

    page = reference_page
    page_size = 3
    total_pages = (len(sorted_images) + page_size - 1) // page_size

    # 加载下一页（不循环）
    if (page + 1) < total_pages:
        reference_page = page + 1

    return get_references()

@app.route('/api/titles')
def get_titles():
    """获取标题图片"""
    # 获取other_infographics目录中的所有图片
    global generation_status
    load_generation_status()
    # app.logger.debug(generation_status['title_options'])
    return jsonify(list(generation_status['title_options'].keys()))


@app.route('/api/pictograms')
def get_pictograms():
    """获取配图图片"""
    global generation_status
    load_generation_status()
    return jsonify(list(generation_status['pictogram_options'].keys()))

@app.route('/infographics/<filename>')
def serve_image(filename):
    return send_from_directory('infographics', filename)

@app.route('/origin_images/titles/<filename>')
def serve_origin_title(filename):
    return send_from_directory('origin_images/titles', filename)

@app.route('/generated_images/titles/<filename>')
def serve_generated_title(filename):
    return send_from_directory('generated_images/titles', filename)

@app.route('/origin_images/pictograms/<filename>')
def serve_origin_pictogram(filename):
    return send_from_directory('origin_images/pictograms', filename)

@app.route('/generated_images/pictograms/<filename>')
def serve_generated_pictogram(filename):
    return send_from_directory('generated_images/pictograms', filename)

@app.route('/other_infographics/<filename>')
def serve_other_infographic(filename):
    return send_from_directory('infographics', filename)

@app.route('/currentfilepath/<filename>')
def serve_static_file(filename):
    return send_from_directory(f'buffer/{generation_status["id"]}', filename)

@app.route('/static/<filename>')
def serve_file(filename):
    return send_from_directory(f'static', filename)


@app.route('/api/export_final', methods=['POST'])
def export_final():
    """
    处理最终导出：接收前端 PNG base64，使用 Gemini 进行风格化
    """
    global generation_status
    load_generation_status()

    try:
        data = request.json
        png_base64 = data.get('png_base64')
        background_color = data.get('background_color', '#ffffff')

        # 从前端接收素材信息
        title = data.get('title', '')
        pictogram = data.get('pictogram', '')
        chart_type = data.get('chart_type', '')

        # 是否强制重新生成（AI精修按钮传true，进一步编辑传false）
        force_regenerate = data.get('force_regenerate', False)

        if not png_base64:
            return jsonify({'error': '缺少 PNG 数据'}), 400

        # 获取参考图片路径
        reference_image_path = generation_status.get('selected_reference')
        if not reference_image_path:
            return jsonify({'error': '未选择参考图片'}), 400

        # 获取会话 ID
        session_id = generation_status.get('id')
        if not session_id:
            return jsonify({'error': '会话 ID 不存在'}), 400

        # 构建素材信息
        materials = {
            'title': title,
            'pictogram': pictogram,
            'reference': reference_image_path,
            'chart_type': chart_type
        }

        # 获取当前选中的variation
        variations = generation_status.get('available_variations', [])
        for v in variations:
            if v['name'] == chart_type:
                materials['variation'] = v['name']
                break

        # 启动后台线程处理导出
        def export_task():
            try:
                generation_status['step'] = 'final_export'
                generation_status['status'] = 'processing'

                # 根据是否强制重新生成设置不同的提示
                if force_regenerate:
                    generation_status['progress'] = '正在AI精修...'
                else:
                    generation_status['progress'] = '正在加载...'

                generation_status['completed'] = False
                save_generation_status()

                # 处理导出
                result = process_final_export(
                    png_base64=png_base64,
                    reference_image_path=reference_image_path,
                    session_id=session_id,
                    background_color=background_color,
                    materials=materials,
                    force_regenerate=force_regenerate
                )

                if result['success']:
                    generation_status['status'] = 'completed'
                    if result.get('from_cache'):
                        generation_status['progress'] = f"加载完成！（版本{result.get('version', 1)}）"
                    else:
                        # 获取新版本号
                        cache_info = result.get('cache_info', {})
                        version = cache_info.get('version', 1)
                        generation_status['progress'] = f"AI精修完成！（版本{version}）"
                    generation_status['final_image_path'] = result['image_path']
                else:
                    generation_status['status'] = 'error'
                    generation_status['progress'] = result.get('error', '导出失败')

                generation_status['completed'] = True
                save_generation_status()

            except Exception as e:
                generation_status['status'] = 'error'
                generation_status['progress'] = str(e)
                generation_status['completed'] = True
                save_generation_status()
                print(f"导出任务出错: {e}")
                traceback.print_exc()

        thread = Thread(target=export_task)
        thread.start()

        return jsonify({'status': 'started'})

    except Exception as e:
        print(f"导出 API 出错: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/ai_direct_generate', methods=['POST'])
def ai_direct_generate():
    """
    使用AI直接生成最终信息图表（不需要参考图）
    """
    global generation_status
    load_generation_status()

    try:
        data = request.json
        chart_svg = data.get('chart_svg')
        data_file = data.get('data_file')

        # 从前端接收素材信息
        title = data.get('title', '')
        pictogram = data.get('pictogram', '')
        chart_type = data.get('chart_type', '')

        # 是否强制重新生成（AI精修按钮传true，进一步编辑传false）
        force_regenerate = data.get('force_regenerate', False)

        if not chart_svg:
            return jsonify({'status': 'error', 'message': '缺少图表SVG数据'}), 400

        # 使用已有的session_id（即generation_status中的id）
        session_id = generation_status.get('id')
        if not session_id:
            return jsonify({'status': 'error', 'message': '会话ID不存在，请先选择数据'}), 400

        # 构建素材信息（AI直接生成不使用参考图）
        materials = {
            'title': title,
            'pictogram': pictogram,
            'chart_type': chart_type
        }

        # 获取当前选中的variation
        variations = generation_status.get('available_variations', [])
        for v in variations:
            if v['name'] == chart_type:
                materials['variation'] = v['name']
                break

        buffer_dir = f"buffer/{session_id}"
        os.makedirs(buffer_dir, exist_ok=True)

        # 1. 将SVG转换为PNG
        chart_png_path = os.path.join(buffer_dir, "chart_for_ai_direct.png")

        # 保存SVG
        chart_svg_path = os.path.join(buffer_dir, "chart_for_ai_direct.svg")
        with open(chart_svg_path, 'w', encoding='utf-8') as f:
            f.write(chart_svg)

        # SVG转PNG
        if not svg_to_png(chart_svg, chart_png_path):
            return jsonify({'status': 'error', 'message': 'SVG转PNG失败'}), 500

        # 2. 使用AI直接生成（包含素材缓存检查）
        output_path = os.path.join(buffer_dir, "ai_direct_generated.jpg")

        print(f"开始AI直接生成，图表路径: {chart_png_path}")
        print(f"force_regenerate: {force_regenerate}")

        result = direct_generate_with_ai(
            chart_png_path,
            output_path,
            materials=materials,
            force_regenerate=force_regenerate
        )

        if result['success']:
            # 更新状态
            generation_status['ai_direct_image'] = result['image_path']
            generation_status['final_image_path'] = result['image_path']
            generation_status['step'] = 'ai_direct_generate'
            generation_status['completed'] = True
            save_generation_status()

            # 返回通过 /currentfilepath/ 可访问的路径
            filename = os.path.basename(result['image_path'])
            accessible_path = f'currentfilepath/{filename}'

            return jsonify({
                'status': 'success',
                'image_path': accessible_path,
                'result_image': accessible_path,
                'from_cache': result.get('from_cache', False),
                'version': result.get('version'),
                'total_versions': result.get('total_versions')
            })
        else:
            return jsonify({
                'status': 'error',
                'message': result.get('error', 'AI生成失败')
            }), 500

    except Exception as e:
        print(f"AI直接生成失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/download_final')
def download_final():
    """
    下载最终生成的图片
    """
    global generation_status
    load_generation_status()

    final_image_path = generation_status.get('final_image_path')
    if not final_image_path or not os.path.exists(final_image_path):
        return jsonify({'error': '最终图片不存在'}), 404

    # 返回文件
    directory = os.path.dirname(final_image_path)
    filename = os.path.basename(final_image_path)

    return send_from_directory(directory, filename, as_attachment=True)

@app.route('/api/material_history', methods=['POST'])
def get_material_history():
    """
    获取指定素材组合的所有精修历史版本
    """
    global generation_status
    load_generation_status()

    try:
        data = request.json
        title = data.get('title', '')
        pictogram = data.get('pictogram', '')
        chart_type = data.get('chart_type', '')

        # 获取参考图
        reference_image_path = generation_status.get('selected_reference')

        # 构建素材信息
        materials = {
            'title': title,
            'pictogram': pictogram,
            'reference': reference_image_path,
            'chart_type': chart_type
        }

        # 获取variation
        variations = generation_status.get('available_variations', [])
        for v in variations:
            if v['name'] == chart_type:
                materials['variation'] = v['name']
                break

        # 检查缓存历史
        cache_result = check_material_cache(materials)

        if cache_result.get('found'):
            # 转换路径为可访问的URL
            session_id = generation_status.get('id')
            all_versions = []

            for version in cache_result['all_versions']:
                # 复制到当前session目录以便访问
                cache_path = version['cache_path']
                version_number = version['version']
                accessible_filename = f"history_v{version_number}.jpg"
                accessible_path = f"buffer/{session_id}/{accessible_filename}"

                # 复制文件
                os.makedirs(os.path.dirname(accessible_path), exist_ok=True)
                shutil.copy2(cache_path, accessible_path)

                all_versions.append({
                    'version': version_number,
                    'url': f'currentfilepath/{accessible_filename}',
                    'timestamp': version.get('timestamp'),
                    'method': version.get('method')
                })

            return jsonify({
                'found': True,
                'total_versions': cache_result['total_versions'],
                'versions': all_versions
            })
        else:
            return jsonify({
                'found': False,
                'total_versions': 0,
                'versions': []
            })

    except Exception as e:
        print(f"获取素材历史失败: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/files')
def get_files():
    csv_files = get_csv_files()
    return jsonify({'files': csv_files})


@app.route('/api/data/preview/<filename>')
def preview_data(filename):
    """
    预览CSV数据
    返回前10行数据
    """
    try:
        # 读取CSV文件
        file_path = os.path.join('processed_data', filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404

        df = pd.read_csv(file_path)

        # 获取列名和前10行数据
        columns = df.columns.tolist()
        preview_rows = df.head(10).values.tolist()
        total_rows = len(df)

        return jsonify({
            'columns': columns,
            'rows': preview_rows,
            'total_rows': total_rows
        })
    except Exception as e:
        print(f"Error previewing data: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # 自动寻找可用端口
    free_port = find_free_port()
    print(f"Starting server on port {free_port}")
    # 启用热重载：当代码文件修改时自动重启服务器
    app.run(debug=True, host='0.0.0.0', port=5185, use_reloader=True)
