import os
import time
import random
from datetime import datetime
from threading import Thread
import traceback
from pathlib import Path
import sys
import hashlib
project_root = Path(__file__).parent
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
print("sys.path:",sys.path)

from chart_modules.layout_extraction import get_compatible_extraction
from chart_modules.ChartGalaxy.example_based_generation.generate_infographic import InfographicImageGenerator
from chart_modules.reference_recognize.extract_chart_type import extract_chart_type
from chart_modules.reference_recognize.extract_main_color import extract_main_color
from chart_modules.generate_variation import generate_variation
from chart_modules.ChartPipeline.modules.infographics_generator.template_utils import block_list
from chart_modules.reference_describe import get_reference_descriptions
from chart_modules.title_generation_new.pipeline import run as new_title_run

# 默认颜色配置（在选择参考图之前使用）
DEFAULT_COLORS = [
    [102, 126, 234],  # 主色
    [118, 75, 162],
    [78, 205, 196],
    [255, 107, 107],
    [255, 230, 109]
]
DEFAULT_BG_COLOR = [245, 243, 239]



def conduct_reference_finding(datafile, generation_status):
    print(conduct_reference_finding)
    datafile = os.path.join('processed_data', datafile.replace(".csv", ".json"))

    generation_status['step'] = 'find_reference'
    generation_status['status'] = 'processing'
    generation_status['completed'] = False

    try:
        generation_status["extraction_templates"] = get_compatible_extraction(datafile)
        # print("筛选的模板:", generation_status["extraction_templates"])
        
        generation_status['status'] = 'completed'
        generation_status['completed'] = True
        

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print("find_reference 出错",e)
        
def conduct_layout_extraction(reference, datafile, generation_status):
    datafile = os.path.join('processed_data', datafile.replace(".csv", ".json"))
    reference = os.path.join('infographics', reference)

    # 保存选中的参考图片路径，供后续标题生成使用
    generation_status['selected_reference'] = reference

    generation_status['step'] = 'layout_extraction'
    generation_status['status'] = 'processing'
    generation_status['completed'] = False

    try:
        # Step 1: 抽取参考信息图表布局
        generation_status['progress'] = '抽取参考信息图表布局...'
        generation_status['style']["colors"], generation_status['style']["bg_color"] = extract_main_color(reference)
        print("提取的颜色: %s %s", generation_status['style']["colors"], generation_status['style']["bg_color"])

        # Step 2: 生成参考图的标题和pictogram描述
        generation_status['progress'] = '分析参考图风格...'
        try:
            descriptions = get_reference_descriptions(reference, use_cache=True)
            if descriptions:
                generation_status['reference_descriptions'] = descriptions
                print(f"已生成参考图描述")
            else:
                generation_status['reference_descriptions'] = None
                print(f"未能生成参考图描述")
        except Exception as desc_error:
            print(f"生成参考图描述时出错: {desc_error}")
            generation_status['reference_descriptions'] = None

        # 现在不需要在这里生成 chart 预览，因为用户已经选择了 chart type 和 variation
        # 只需要保存颜色信息供后续使用

        generation_status['status'] = 'completed'
        generation_status['completed'] = True

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print("conduct_layout_extraction 出错",e)
    
def conduct_title_generation(datafile, generation_status, use_cache=True):

    generation_status['step'] = 'title_generation'
    generation_status['status'] = 'processing'
    generation_status['completed'] = False

    try:
        # 生成3张标题图片（并行），改用 title_generation_new 的生成流程
        generation_status['progress'] = '并行生成标题中...'
        generator = InfographicImageGenerator()
        generator.output_dir = f"buffer/{generation_status['id']}"

        # 优先使用「已选 chart PNG」，若不存在再退回参考图
        chart_path = None
        try:
            session_id = generation_status.get('id')
            selected_chart_type = generation_status.get('selected_chart_type')
            if session_id and selected_chart_type:
                candidate_chart_png = os.path.join(
                    "buffer",
                    str(session_id),
                    f"{selected_chart_type}.png"
                )
                if os.path.exists(candidate_chart_png):
                    chart_path = candidate_chart_png
                    print(f"[title_generation_new] 使用已选 chart PNG 作为风格参考: {chart_path}")
        except Exception as e:
            print(f"[title_generation_new] 查找已选 chart PNG 出错: {e}")

        # 如果没有 chart PNG，则回退到参考信息图
        if chart_path is None:
            chart_path = generation_status.get('selected_reference')
            if chart_path:
                print(f"[title_generation_new] 使用参考信息图作为风格参考: {chart_path}")

        # 获取参考图的标题描述（仅用于生成缓存 hash，不再直接用于图像生成）
        reference_descriptions = generation_status.get('reference_descriptions', {})
        title_style_description = reference_descriptions.get('title_description') if reference_descriptions else None

        # Generate hash for description
        desc_hash = ""
        if title_style_description:
             desc_hash = "_" + hashlib.md5(title_style_description.encode('utf-8')).hexdigest()[:8]

        # 并行生成3个标题选项
        title_options = {}
        results = [None, None, None]
        threads = []

        def generate_title_task(index, output_filename):
            try:
                csv_path = os.path.join('processed_data', datafile)
                # 1. 先用旧流程生成标题文本（不再用其图片生成）
                csv_data = generator.read_csv_data(csv_path)
                title_text = generator.generate_title_text(csv_data)

                # 2. 使用新 pipeline 生成标题图片
                effective_chart_path = chart_path if (chart_path and os.path.exists(chart_path)) else ""
                new_title_run(title_text, effective_chart_path, output_filename, use_cache=use_cache)

                success = os.path.exists(output_filename)
                results[index] = {
                    'title_text': title_text,
                    'image_path': output_filename if success else None,
                    'success': success
                }
                print(f"Generated title {index}: {title_text}, success={success}")
            except Exception as e:
                print(f"generate_title_task error (index={index}): {e}")
                results[index] = {
                    'title_text': "",
                    'image_path': None,
                    'success': False
                }

        for i in range(3):
            output_filename = f"buffer/{generation_status['id']}/title_{i}{desc_hash}.png"
            thread = Thread(target=generate_title_task, args=(i, output_filename))
            thread.start()
            threads.append(thread)

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 收集结果
        for i in range(3):
            if results[i]:
                title_options[f'title_{i}{desc_hash}.png'] = {
                    'title_text': results[i]['title_text'],
                    'image_path': results[i]['image_path'],
                    'success': results[i]['success']
                }

        # 存储所有标题选项
        generation_status['title_options'] = title_options
        # 默认使用第一个标题
        first_key = f'title_0{desc_hash}.png'
        if first_key in title_options:
            generation_status['current_title_text'] = title_options[first_key]['title_text']

        generation_status['status'] = 'completed'
        generation_status['completed'] = True

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print(f"title_generation 出错 {e} {traceback.format_exc()}")

def conduct_pictogram_generation(title, generation_status, use_cache=True):
    generation_status['step'] = 'pictogram_generation'
    generation_status['status'] = 'processing'
    generation_status['progress'] = '并行生成配图中...'
    generation_status['completed'] = False

    try:
        # 生成3张配图（并行）
        generator = InfographicImageGenerator()
        generator.output_dir = f"buffer/{generation_status['id']}"

        # 获取当前标题文本
        title_text = generation_status.get('current_title_text', '')
        if not title_text and title in generation_status.get('title_options', {}):
            title_text = generation_status['title_options'][title].get('title_text', '')

        # 获取参考图的pictogram描述
        reference_descriptions = generation_status.get('reference_descriptions', {})
        pictogram_style_description = reference_descriptions.get('pictogram_description') if reference_descriptions else None

        # Generate hash for description
        desc_hash = ""
        if pictogram_style_description:
             desc_hash = "_" + hashlib.md5(pictogram_style_description.encode('utf-8')).hexdigest()[:8]

        # 并行生成3个配图选项
        pictogram_options = {}
        results = [None, None, None]
        threads = []

        def generate_pictogram_task(index, output_filename):
            result = generator.generate_single_pictogram(
                title_text=title_text,
                colors=generation_status['style']['colors'],
                output_filename=output_filename,
                use_cache=use_cache,
                style_description=pictogram_style_description
            )
            results[index] = result
            print(f"Generated pictogram {index} for: {title_text}")

        for i in range(3):
            output_filename = f"buffer/{generation_status['id']}/pictogram_{i}{desc_hash}.png"
            thread = Thread(target=generate_pictogram_task, args=(i, output_filename))
            thread.start()
            threads.append(thread)

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 收集结果
        for i in range(3):
            if results[i]:
                pictogram_options[f'pictogram_{i}{desc_hash}.png'] = {
                    'pictogram_prompt': results[i]['pictogram_prompt'],
                    'image_path': results[i]['image_path'],
                    'success': results[i]['success']
                }

        # 存储所有配图选项
        generation_status['pictogram_options'] = pictogram_options

        generation_status['status'] = 'completed'
        generation_status['completed'] = True

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print(f"pictogram_generation 出错 {e} {traceback.format_exc()}")


def conduct_chart_type_preview_generation(chart_types_to_generate, generation_status):
    """为每个 chart type 生成预览图（选择该 type 下的随机一个 variation）"""
    generation_status['step'] = 'chart_type_preview'
    generation_status['status'] = 'processing'
    generation_status['progress'] = '生成图表类型预览...'
    generation_status['completed'] = False

    print(f"[DEBUG] conduct_chart_type_preview_generation 开始")
    print(f"[DEBUG] chart_types_to_generate: {chart_types_to_generate}")
    print(f"[DEBUG] selected_data: {generation_status.get('selected_data')}")
    print(f"[DEBUG] id: {generation_status.get('id')}")

    # 存储生成的预览图信息，用于前端正确请求文件名
    chart_type_previews = {}
    threads = []  # 保存所有线程

    try:
        templates = generation_status.get('extraction_templates', [])
        print(f"[DEBUG] 找到 {len(templates)} 个 templates")

        for chart_type_info in chart_types_to_generate:
            chart_type = chart_type_info['type']
            print(f"[DEBUG] 处理 chart_type: {chart_type}")

            # 找到该 chart type 下的所有 templates
            matching_templates = [t for t in templates if len(t[0].split('/')) >= 2 and t[0].split('/')[1] == chart_type]
            print(f"[DEBUG] 匹配的 templates 数量: {len(matching_templates)}")

            # 过滤掉 block_list 中的模板
            filtered_templates = []
            for t in matching_templates:
                template_name = t[0].split('/')[-1]
                if template_name not in block_list:
                    filtered_templates.append(t)
                else:
                    print(f"[DEBUG] 过滤掉被禁用的模板: {template_name}")

            if filtered_templates:
                # 随机选择一个 template
                selected_template = random.choice(filtered_templates)
                variation_name = selected_template[0].split('/')[-1]
                template_path = selected_template[0]  # 模板路径字符串
                template_fields = selected_template[1] if len(selected_template) > 1 else []

                output_path = f"buffer/{generation_status['id']}/charttype_{chart_type.replace(' ', '_')}.svg"
                print(f"[DEBUG] Generating chart type preview: {chart_type}")
                print(f"[DEBUG]   template_path: {template_path}")
                print(f"[DEBUG]   template_fields: {template_fields}")
                print(f"[DEBUG]   variation_name: {variation_name}")
                print(f"[DEBUG]   output_path: {output_path}")
                print(f"[DEBUG]   input: {generation_status['selected_data']}")

                # 存储预览信息
                chart_type_previews[chart_type] = {
                    'variation_name': variation_name,
                    'template': template_path,
                    'output_file': f"charttype_{chart_type.replace(' ', '_')}.svg"
                }

                # 生成预览图 - 传入完整的 template 信息 [path, fields]
                thread = Thread(target=generate_variation, kwargs={
                    'input': generation_status["selected_data"],
                    'output': output_path,
                    'chart_template': [template_path, template_fields],
                    'main_colors': DEFAULT_COLORS,
                    'bg_color': DEFAULT_BG_COLOR,
                })
                thread.start()
                threads.append(thread)
                print(f"[DEBUG] 启动线程生成 {variation_name}")
            else:
                print(f"[DEBUG] 没有找到匹配的 template for {chart_type}")

        # 等待所有线程完成
        for thread in threads:
            thread.join()
        print(f"[DEBUG] 所有预览图生成线程完成")

        # 保存预览图信息到 generation_status
        generation_status['chart_type_previews'] = chart_type_previews

        generation_status['status'] = 'completed'
        generation_status['completed'] = True
        print(f"[DEBUG] conduct_chart_type_preview_generation 完成")

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print(f"[DEBUG] chart_type_preview_generation 出错: {e}")
        print(f"[DEBUG] traceback: {traceback.format_exc()}")


def conduct_variation_preview_generation(variations_to_generate, generation_status):
    """为每个 variation 生成预览图，如果文件已存在则跳过"""
    generation_status['step'] = 'variation_preview'
    generation_status['status'] = 'processing'
    generation_status['progress'] = '生成图表样式预览...'
    generation_status['completed'] = False

    threads = []  # 保存所有线程

    try:
        for variation_info in variations_to_generate:
            template_path = variation_info['template']
            variation_name = variation_info['name']
            template_fields = variation_info.get('fields', [])

            # 检查预览图是否已存在（同时检查 SVG 和 PNG）
            output_svg = f"buffer/{generation_status['id']}/variation_{variation_name}.svg"
            output_png = f"buffer/{generation_status['id']}/variation_{variation_name}.png"

            if os.path.exists(output_svg) and os.path.exists(output_png):
                print(f"[缓存命中] variation 预览图已存在，跳过生成: {variation_name}")
                continue

            print(f"Generating variation preview: {variation_name}")
            print(f"[DEBUG]   template_path: {template_path}")
            print(f"[DEBUG]   template_fields: {template_fields}")

            # 生成预览图 - 传入完整的 template 信息 [path, fields]
            thread = Thread(target=generate_variation, kwargs={
                'input': generation_status["selected_data"],
                'output': output_svg,
                'chart_template': [template_path, template_fields],
                'main_colors': DEFAULT_COLORS,
                'bg_color': DEFAULT_BG_COLOR,
            })
            thread.start()
            threads.append(thread)

        # 等待所有线程完成
        for thread in threads:
            thread.join()
        print(f"[DEBUG] 所有 variation 预览图生成线程完成")

        generation_status['status'] = 'completed'
        generation_status['completed'] = True

    except Exception as e:
        generation_status['status'] = 'error'
        generation_status['progress'] = str(e)
        generation_status['completed'] = True
        print(f"variation_preview_generation 出错 {e} {traceback.format_exc()}")
    


# def simulate_final_generation(image_name):
#     global generation_status
    
#     steps = [
#         ('生成图表...', 1.5),
#         ('按照模板进行元素布局...', 2),
#         ('完成！', 0)
#     ]
    
#     generation_status['step'] = 'final_generation'
#     generation_status['status'] = 'processing'
#     generation_status['completed'] = False
    
#     for step, duration in steps:
#         generation_status['progress'] = step
#         time.sleep(duration)
    
#     generation_status['step'] = 'final_result'
#     generation_status['status'] = 'completed'
#     generation_status['completed'] = True
#     generation_status['image_name'] = image_name


# thread = Thread(target=generate_variation, args=("processed_data/App.json", 
#                                                          f"buffer/20251118080418_1491/d3-js/multiple pie chart/multiple_pie_chart_02.svg", 
#                                                          [
#         "d3-js/multiple pie chart/multiple_pie_chart_02",
#         [
#           "x",
#           "y",
#           "group"
#         ]
#       ],
#     [
#       [
#         227,
#         216,
#         131
#       ],
#       [
#         197,
#         200,
#         200
#       ],
#       [
#         28,
#         144,
#         248
#       ],
#       [
#         37,
#         86,
#         169
#       ],
#       [
#         18,
#         22,
#         24
#       ]
#     ],
#     [
#       245,
#       243,
#       239
#     ],))
# thread.start()