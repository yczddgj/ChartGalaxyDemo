"""
为 infographics 文件夹中的图片生成主题和关键词
通过 GPT-4o-mini 视觉模型分析图片内容
"""
import os
import json
import base64
import openai
from pathlib import Path
from typing import Dict, List
import time

import sys
import os
from pathlib import Path

# Add project root to sys.path to allow importing config
project_root = Path(__file__).resolve().parents[1]
sys.path.append(str(project_root))

import config

API_KEY = config.OPENAI_API_KEY
BASE_URL = config.OPENAI_BASE_URL

def encode_image(image_path):
    """将图片编码为 base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def analyze_infographic(image_path: str) -> Dict:
    """
    使用 GPT-4o-mini 分析 infographic 图片内容
    返回主题、关键词和描述
    """
    prompt = """Please analyze this infographic image and provide:

1. Main theme (a concise category, 2-4 words)
2. Keywords (8-12 relevant keywords related to the content, topics, and domain)
3. Description (a brief 1-2 sentence description of what the infographic is about)

Focus on:
- The actual data and information shown in the infographic
- The topics and subjects covered
- The domain or industry it relates to
- Visual elements and themes presented

Return your response in the following JSON format:
{
  "theme": "Main Theme Category",
  "keywords": ["keyword1", "keyword2", "keyword3", ...],
  "description": "Brief description of the infographic content"
}

Return ONLY the JSON, no additional text."""

    try:
        client = openai.OpenAI(
            api_key=API_KEY,
            base_url=BASE_URL
        )

        base64_image = encode_image(image_path)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
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
            max_tokens=500,
            temperature=0.3
        )

        content = response.choices[0].message.content.strip()

        # 尝试提取 JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        result = json.loads(content)
        return result

    except Exception as e:
        print(f"  ❌ Error analyzing {image_path}: {e}")
        return {
            "theme": "Unknown",
            "keywords": [],
            "description": "Unable to analyze image"
        }

def generate_themes_for_all_infographics():
    """为所有 infographics 生成主题配置"""
    infographics_dir = Path('infographics')

    # 获取所有图片（包括 Origin 和其他命名的图片）
    image_files = sorted([f for f in os.listdir(infographics_dir)
                         if f.lower().endswith(('.png', '.jpg', '.jpeg'))])

    print(f"Found {len(image_files)} infographic images to analyze...\n")

    themes = {}

    for i, img_file in enumerate(image_files, 1):
        print(f"[{i}/{len(image_files)}] Analyzing {img_file}...")

        image_path = infographics_dir / img_file

        try:
            result = analyze_infographic(str(image_path))
            themes[img_file] = result
            print(f"  ✓ Theme: {result['theme']}")
            print(f"  ✓ Keywords: {', '.join(result['keywords'][:5])}...")
            print()

            # 添加延迟避免 API 限流
            time.sleep(1)

        except Exception as e:
            print(f"  ❌ Failed: {e}\n")
            themes[img_file] = {
                "theme": "Unknown",
                "keywords": [],
                "description": "Analysis failed"
            }

    # 保存到 JSON 文件
    output_path = infographics_dir / 'themes.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(themes, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Generated themes for {len(themes)} infographics")
    print(f"✅ Saved to {output_path}")

    return themes

if __name__ == "__main__":
    print("="*60)
    print("Infographic Theme Generator")
    print("="*60)
    print()

    themes = generate_themes_for_all_infographics()

    print("\n" + "="*60)
    print("Summary:")
    print("="*60)

    # 统计主题分布
    theme_counts = {}
    for data in themes.values():
        theme = data.get('theme', 'Unknown')
        theme_counts[theme] = theme_counts.get(theme, 0) + 1

    print("\nTheme distribution:")
    for theme, count in sorted(theme_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {theme}: {count}")
