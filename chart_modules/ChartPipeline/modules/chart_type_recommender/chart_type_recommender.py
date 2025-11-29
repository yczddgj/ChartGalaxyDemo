#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
图表类型推荐模块 (chart_type_recommender)
基于输入数据特征，使用大模型自动推荐最合适的图表类型
"""

import json
import logging
import argparse
from typing import Dict, List, Any, Tuple
import sys
import os
from pathlib import Path

# 添加项目路径以导入 style_refinement
project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

try:
    from chart_modules.style_refinement import API_KEY, BASE_URL
    import openai
except ImportError:
    # 如果导入失败，使用默认配置
    API_KEY = "sk-NNBhkfmYuZB6IQCY7f9eCd8841864eB6B3C7Fc0a7d4a8360"
    BASE_URL = "https://aihubmix.com/v1"
    import openai

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 支持的图表类型
CHART_TYPES = [
    "vertical_bar_chart",
    "horizontal_bar_chart",
    "vertical_stacked_bar_chart",
    "horizontal_stacked_bar_chart",
    "grouped_bar_chart",
    "line_chart",
    "area_chart",
    "pie_chart",
    "donut_chart",
    "scatter_plot",
    "bubble_chart",
    "heatmap"
]

def analyze_data_structure(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    分析数据结构，提取关键特征
    
    Args:
        data: 输入数据对象
        
    Returns:
        包含数据特征的字典
    """
    features = {}
    
    # 提取列信息
    columns = data.get("data", {}).get("columns", [])
    features["column_count"] = len(columns)
    
    # 分析列类型
    time_columns = []
    number_columns = []
    categorical_columns = []
    
    for col in columns:
        data_type = col.get("data_type", "")
        if data_type == "time":
            time_columns.append(col["name"])
        elif data_type == "number":
            number_columns.append(col["name"])
        elif data_type == "categorical":
            categorical_columns.append(col["name"])
    
    features["time_columns"] = time_columns
    features["number_columns"] = number_columns
    features["categorical_columns"] = categorical_columns
    
    # 分析数据行数
    rows = data.get("data", {}).get("data", [])
    features["row_count"] = len(rows)
    
    return features

def recommend_chart_types_with_llm(data: Dict[str, Any], available_chart_types: List[str] = None) -> List[Dict[str, Any]]:
    """
    使用大模型基于数据特征推荐合适的图表类型（最多6个）
    
    Args:
        data: 原始数据对象
        available_chart_types: 可用的图表类型列表，如果为None则使用默认列表
        
    Returns:
        推荐的图表类型列表，按置信度排序，最多6个
    """
    if available_chart_types is None:
        available_chart_types = CHART_TYPES
    
    try:
        # 分析数据结构
        data_features = analyze_data_structure(data)
        
        # 准备数据摘要
        columns = data.get("data", {}).get("columns", [])
        rows = data.get("data", {}).get("data", [])
        
        # 构建数据摘要
        data_summary = {
            "列数": len(columns),
            "行数": len(rows),
            "时间列": data_features["time_columns"],
            "数值列": data_features["number_columns"],
            "分类列": data_features["categorical_columns"],
            "列详情": [{"name": col.get("name", ""), "type": col.get("data_type", "")} for col in columns]
        }
        
        # 构建数据表格（只取前20行，避免token过多）
        data_table_rows = []
        column_names = [col.get("name", "") for col in columns]
        
        # 添加表头
        if column_names and rows:
            # 转义markdown特殊字符
            def escape_markdown(text):
                text = str(text)
                # 转义管道符和换行符
                text = text.replace("|", "\\|").replace("\n", " ").replace("\r", " ")
                return text
            
            # 表头
            header = "| " + " | ".join([escape_markdown(name) for name in column_names]) + " |"
            separator = "| " + " | ".join(["---"] * len(column_names)) + " |"
            data_table_rows.append(header)
            data_table_rows.append(separator)
            
            # 添加数据行（最多20行）
            for i, row in enumerate(rows[:20]):
                row_values = []
                for col_name in column_names:
                    # 从行数据中获取对应列的值
                    if isinstance(row, dict):
                        value = row.get(col_name, "")
                    elif isinstance(row, list) and i < len(rows):
                        # 如果row是列表，按列索引获取
                        col_index = column_names.index(col_name) if col_name in column_names else -1
                        value = row[col_index] if 0 <= col_index < len(row) else ""
                    else:
                        value = ""
                    
                    # 如果是列表或字典，转换为字符串
                    if isinstance(value, (list, dict)):
                        value = json.dumps(value, ensure_ascii=False)
                    
                    # 限制单元格内容长度并转义
                    value_str = str(value) if value is not None else ""
                    if len(value_str) > 50:
                        value_str = value_str[:47] + "..."
                    row_values.append(escape_markdown(value_str))
                
                data_table_rows.append("| " + " | ".join(row_values) + " |")
            
            if len(rows) > 20:
                data_table_rows.append(f"\n*注：还有 {len(rows) - 20} 行数据未显示*")
        
        data_table = "\n".join(data_table_rows) if data_table_rows else "（无数据）"
        
        # 准备提示词
        prompt = f"""你是一个数据可视化专家。请根据以下数据特征和具体数据表格，从可用的图表类型中推荐最合适的图表类型（最多6个）。

数据特征：
{json.dumps(data_summary, ensure_ascii=False, indent=2)}

具体数据表格：
{data_table}

可用的图表类型：
{', '.join(available_chart_types)}

请仔细分析数据特征和具体数据内容，推荐最多6个最合适的图表类型，并按照适合程度从高到低排序。
对于每个推荐的图表类型，请提供：
1. 图表类型名称（必须从可用列表中选择，完全匹配）
2. 置信度（0-1之间的浮点数）
3. 推荐理由（简短说明为什么这个图表类型适合这些数据）

请以JSON格式返回，格式如下：
{{
  "recommendations": [
    {{
      "type": "图表类型名称",
      "confidence": 0.95,
      "reasoning": "推荐理由"
    }}
  ]
}}

只返回JSON，不要其他文字。"""
        
        # 调用大模型（使用 Gemini 2.0 Flash）
        client = openai.OpenAI(
            api_key=API_KEY,
            base_url=BASE_URL
        )
        
        response = client.chat.completions.create(
            model="gemini-2.0-flash",  # 使用 Gemini 2.0 Flash 模型
            messages=[
                {"role": "system", "content": "你是一个专业的数据可视化专家，擅长根据数据特征和具体数据内容推荐最合适的图表类型。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        # 解析响应
        content = response.choices[0].message.content.strip()
        
        # 尝试提取JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        result = json.loads(content)
        recommendations = result.get("recommendations", [])
        
        # 验证和过滤：确保类型在可用列表中，并限制最多6个
        valid_recommendations = []
        seen_types = set()
        
        for rec in recommendations[:6]:  # 最多取6个
            chart_type = rec.get("type", "").strip()
            # 尝试匹配可用的图表类型（不区分大小写，支持部分匹配）
            matched_type = None
            chart_type_lower = chart_type.lower()
            
            for available_type in available_chart_types:
                if chart_type_lower == available_type.lower() or chart_type_lower in available_type.lower() or available_type.lower() in chart_type_lower:
                    matched_type = available_type
                    break
            
            if matched_type and matched_type not in seen_types:
                valid_recommendations.append({
                    "type": matched_type,
                    "confidence": float(rec.get("confidence", 0.5)),
                    "reasoning": rec.get("reasoning", "适合展示这些数据")
                })
                seen_types.add(matched_type)
        print(valid_recommendations)
        # 如果大模型没有返回有效推荐，使用规则作为后备
        if not valid_recommendations:
            logger.warning("大模型未返回有效推荐，使用规则作为后备")
            return recommend_chart_types_fallback(data_features, available_chart_types)
        
        # 按置信度排序
        valid_recommendations.sort(key=lambda x: x["confidence"], reverse=True)
        
        return valid_recommendations[:6]  # 确保最多6个
        
    except Exception as e:
        logger.error(f"使用大模型推荐图表类型失败: {e}")
        logger.info("回退到规则推荐方法")
        # 如果大模型失败，使用规则方法作为后备
        data_features = analyze_data_structure(data)
        return recommend_chart_types_fallback(data_features, available_chart_types)


def recommend_chart_types_fallback(data_features: Dict[str, Any], available_chart_types: List[str]) -> List[Dict[str, Any]]:
    """
    基于规则的图表类型推荐（作为大模型失败时的后备方案）
    
    Args:
        data_features: 数据特征字典
        available_chart_types: 可用的图表类型列表
        
    Returns:
        推荐的图表类型列表，最多6个
    """
    recommendations = []
    
    # 检查基本条件
    has_time = len(data_features["time_columns"]) > 0
    has_number = len(data_features["number_columns"]) > 0
    has_category = len(data_features["categorical_columns"]) > 0
    
    # 时间序列分析
    if has_time and has_number:
        if has_category:
            # 具有分类的时间序列
            for chart_type in ["vertical_stacked_bar_chart", "grouped_bar_chart", "area_chart", "line_chart"]:
                if chart_type in available_chart_types and len(recommendations) < 6:
                    recommendations.append({
                        "type": chart_type,
                        "confidence": 0.8 - len(recommendations) * 0.1,
                        "reasoning": f"适合展示具有分类维度的时间序列数据"
                    })
        else:
            # 简单时间序列
            for chart_type in ["line_chart", "vertical_bar_chart", "area_chart"]:
                if chart_type in available_chart_types and len(recommendations) < 6:
                    recommendations.append({
                        "type": chart_type,
                        "confidence": 0.85 - len(recommendations) * 0.1,
                        "reasoning": f"适合展示时间序列数据"
                    })
    
    # 分类比较
    elif has_category and has_number and not has_time:
        for chart_type in ["horizontal_bar_chart", "vertical_bar_chart", "pie_chart", "donut_chart"]:
            if chart_type in available_chart_types and len(recommendations) < 6:
                recommendations.append({
                    "type": chart_type,
                    "confidence": 0.8 - len(recommendations) * 0.1,
                    "reasoning": f"适合比较分类数据"
                })
    
    # 如果没有匹配的推荐，提供默认选项
    if not recommendations:
        default_types = ["vertical_bar_chart", "horizontal_bar_chart", "line_chart", "pie_chart"]
        for chart_type in default_types:
            if chart_type in available_chart_types and len(recommendations) < 6:
                recommendations.append({
                    "type": chart_type,
                    "confidence": 0.6 - len(recommendations) * 0.05,
                    "reasoning": "通用图表类型，适合大多数数据展示需求"
                })
    
    return recommendations[:6]  # 确保最多6个


def recommend_chart_types(data_features: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    基于数据特征推荐合适的图表类型（兼容旧接口，内部调用大模型推荐）
    
    Args:
        data_features: 数据特征字典（为了兼容，但实际需要完整数据对象）
        
    Returns:
        推荐的图表类型列表，按置信度排序
    """
    # 如果传入的是完整数据对象，直接使用
    print("recommend_chart_types")
    if "data" in data_features:
        return recommend_chart_types_with_llm(data_features)
    
    # 否则使用规则方法
    return recommend_chart_types_fallback(data_features, CHART_TYPES)

def process(input: str, output: str) -> bool:
    """
    处理输入数据并生成图表类型推荐
    
    Args:
        input: 输入JSON文件路径
        output: 输出JSON文件路径
        
    Returns:
        处理成功返回True，否则返回False
    """
    try:
        # 读取输入数据
        logger.info(f"读取输入文件: {input}")
        with open(input, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 分析数据特征
        logger.info("分析数据结构和特征")
        data_features = analyze_data_structure(data)
        
        # 生成图表类型推荐（使用大模型）
        logger.info("使用大模型生成图表类型推荐")
        chart_type_recommendations = recommend_chart_types_with_llm(data, CHART_TYPES)
        
        # 添加推荐结果到原始数据
        data["chart_type"] = chart_type_recommendations
        
        # 写入输出文件
        logger.info(f"写入输出文件: {output}")
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logger.info("图表类型推荐完成")
        return True
        
    except Exception as e:
        logger.error(f"处理失败: {str(e)}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ChartPipeline - 图表类型推荐模块")
    parser.add_argument("--input", required=True, help="输入JSON文件路径")
    parser.add_argument("--output", required=True, help="输出JSON文件路径")
    
    args = parser.parse_args()
    
    process(input=args.input, output=args.output) 