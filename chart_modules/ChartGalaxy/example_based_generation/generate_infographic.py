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
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib

sys.path.append(str(Path(__file__).parent))
# 添加标题生成模块的路径
sys.path.append(str(Path(__file__).parent.parent.parent / "title_generation"))

# ============ 测试模式开关 ============
# 设置为 True 时，不会生成新图片，直接使用固定路径的测试图片
TEST_MODE = False
# 测试图片固定路径
TEST_TITLE_IMAGE = str(Path(__file__).parent / "test_images" / "test_title.png")
TEST_PICTOGRAM_IMAGE = str(Path(__file__).parent / "test_images" / "test_pictogram.png")
# =====================================

API_KEY = "sk-ho2TtXpXZCd50j5q3d4f29D8Cd6246B28212028a0aF69361" # from WangZheng
BASE_URL = "https://aihubmix.com/v1"

class InfographicImageGenerator:
    def __init__(self):
        """
        Initialize image generator

        Args:
            api_key: OpenAI API key
            base_url: Optional API base URL for custom endpoint
        """
        self.client = openai.OpenAI(
            api_key=API_KEY,
            base_url=BASE_URL
        )
        self.processed_data_dir = "processed_data"
        self.output_dir = "generated_images"
        self.prompts_dir = "."

        # 缓存目录 - 放在 buffer 文件夹下，可跨任务共享
        self.cache_dir = "buffer/generation_cache"
        self.title_cache_dir = os.path.join(self.cache_dir, "titles")
        self.pictogram_cache_dir = os.path.join(self.cache_dir, "pictograms")
        self.title_cache_file = os.path.join(self.cache_dir, "title_cache.json")
        self.pictogram_cache_file = os.path.join(self.cache_dir, "pictogram_cache.json")

        # Create output directories
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(f"{self.output_dir}/titles", exist_ok=True)
        os.makedirs(f"{self.output_dir}/pictograms", exist_ok=True)
        # Coming Soon directories
        os.makedirs(f"{self.output_dir}/chart_variations", exist_ok=True)
        os.makedirs(f"{self.output_dir}/final_infographics", exist_ok=True)

        # Create cache directories
        os.makedirs(self.cache_dir, exist_ok=True)
        os.makedirs(self.title_cache_dir, exist_ok=True)
        os.makedirs(self.pictogram_cache_dir, exist_ok=True)

        # Load cache
        self.title_cache = self._load_cache(self.title_cache_file)
        self.pictogram_cache = self._load_cache(self.pictogram_cache_file)

    def _load_cache(self, cache_file: str) -> dict:
        """加载缓存文件"""
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Failed to load cache from {cache_file}: {e}")
                return {}
        return {}

    def _save_cache(self, cache_file: str, cache_data: dict):
        """保存缓存文件"""
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Failed to save cache to {cache_file}: {e}")

    def _generate_cache_key(self, **kwargs) -> str:
        """
        生成缓存键（基于输入参数的哈希值）

        Args:
            **kwargs: 任意数量的键值对参数

        Returns:
            str: SHA256 哈希值
        """
        # 将所有参数转换为字符串并排序，确保相同参数生成相同的键
        param_str = json.dumps(kwargs, sort_keys=True)
        return hashlib.sha256(param_str.encode('utf-8')).hexdigest()
        
    def load_prompt_file(self, filename: str) -> str:
        """Load prompt file content"""
        prompt_path = os.path.join(str(Path(__file__).parent), filename)

        with open(prompt_path, 'r', encoding='utf-8') as f:
            return f.read()
        
    
    def read_csv_data(self, csv_path: str) -> str:
        """Read CSV file and convert to string format"""
        try:
            df = pd.read_csv(csv_path)
            # Convert CSV data to string format, including column names and first few rows of data
            csv_content = f"Columns: {', '.join(df.columns.tolist())}\n"
            csv_content += f"Data shape: {df.shape[0]} rows, {df.shape[1]} columns\n"
            csv_content += "Sample data:\n"
            csv_content += df.head(10).to_string(index=False)
            return csv_content
        except Exception as e:
            print(f"Failed to read CSV file {csv_path}: {e}")
            return ""
    
    def generate_title_text(self, csv_data: str) -> str:
        """Generate title text using GPT-4"""
        try:
            # Load title recommendation prompt
            title_prompt_template = self.load_prompt_file("generate_title_recommendation_prompt.md")
            if not title_prompt_template:
                return "Data Analysis Report"
            
            # Replace CSV data placeholder
            prompt = title_prompt_template.replace("{csv_data}", csv_data)
            
            response = self.client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=50,
                temperature=0.7
            )
            
            title = response.choices[0].message.content.strip()
            print(f"Generated title: {title}")
            return title
            
        except Exception as e:
            print(f"Failed to generate title text: {e}")
            return "Data Insights"
    
    def generate_image_prompt(self, title: str, prompt_type: str, color=None) -> str:
        """Generate image generation prompt"""
        try:
            if prompt_type == "title":
                # Read title prompt file and use GPT-4.1 to generate professional image prompt
                title_prompt_template = self.load_prompt_file("generate_title_image_prompt.md")
                title_prompt = title_prompt_template.replace("{title}", title).replace("{color}", f"{color}")
                
                response = self.client.chat.completions.create(
                    model="gpt-image-1",
                    messages=[
                        {"role": "user", "content": title_prompt}
                    ],
                    max_tokens=300,
                    temperature=0.7
                )
                
                prompt = response.choices[0].message.content.strip()
                print(f"Generated title image prompt: {prompt}...")
                
            elif prompt_type == "pictogram":
                # 直接使用简化的 prompt 模板生成图片
                pictogram_prompt_template = self.load_prompt_file("generate_pictogram_prompt.md")
                prompt = pictogram_prompt_template.replace("{title}", title).replace("{color}", f"{color}")
                print(f"Pictogram prompt: {prompt}")
            
            return prompt
            
        except Exception as e:
            print(f"Failed to generate image prompt: {e}")
            return f"Create a simple {prompt_type} image about {title}"
    
    def generate_image(self, prompt: str, image_type: str, filename: str) -> bool:
        """Generate image using GPT-Image-1"""
        try:
            print(f"Generating {image_type} image: {filename}")

            response = self.client.images.generate(
                model="gpt-image-1",
                prompt=prompt,
                n=1,
                size="1024x1024",
                quality="high",
                background="transparent",  # 生成透明背景图片
            )

            if response and response.data:
                image_base64 = response.data[0].b64_json
                image_data = base64.b64decode(image_base64)
                image= Image.open(BytesIO(image_data))
                # Convert to RGBA mode
                image = image.convert('RGBA')
                data = image.getdata()

                # Convert white (tolerance 20) to transparent
                new_data = []
                for item in data:
                    # Check if RGB value is close to white (tolerance 20)
                    if item[0] > 235 and item[1] > 235 and item[2] > 235:
                        new_data.append((255, 255, 255, 0))
                    else:
                        new_data.append(item)

                image.putdata(new_data)

                # Convert image to numpy array
                img_array = np.array(image)

                # Create binary mask, non-transparent pixels are 1, transparent pixels are 0
                mask = (img_array[:,:,3] > 0).astype(np.uint8)

                # Mark connected regions
                num_labels, labels = cv2.connectedComponents(mask)

                # Calculate number of pixels in each connected region
                for label in range(1, num_labels):
                    area = np.sum(labels == label)
                    # If region pixel count is less than 20, set it to transparent
                    if area < 20:
                        img_array[labels == label] = [255, 255, 255, 0]

                # Convert back to PIL image
                image = Image.fromarray(img_array)

                os.makedirs(os.path.dirname(filename), exist_ok=True)
                image.save(filename)
                print(f"Image saved: {filename}")
                return True

            else:
                print(f"Failed to generate image: {response.status_code}")
                return False

        except Exception as e:
            print(f"Failed to generate image: {e}")
            return False

    def process_csv_file(self, csv_file: str):
        """Process a single CSV file"""
        print(f"\nProcessing CSV file: {csv_file}")
        
        # Read CSV data
        csv_path = os.path.join(self.processed_data_dir, csv_file)
        csv_data = self.read_csv_data(csv_path)
        
        if not csv_data:
            print(f"Skipping file {csv_file} - read failed")
            return
        
        base_filename = os.path.splitext(csv_file)[0]
        
        # Generate 4 images
        for i in range(1):
            print(f"\nGenerating {i+1} set of images...")

            # Generate title text
            title_text = self.generate_title_text(csv_data)
        
            # Generate title image
            title_prompt = self.generate_image_prompt(title_text, "title")
            title_filename = f"{self.output_dir}/titles/{base_filename}_title_{i}.png"
            
            print(title_prompt)
            success = self.generate_image(title_prompt, "title", title_filename)
            if success:
                # Add delay to avoid API limits
                time.sleep(1)
            
            # Generate pictogram image
            pictogram_prompt = self.generate_image_prompt(title_text, "pictogram")
            pictogram_filename = f"{self.output_dir}/pictograms/{base_filename}_pictogram_{i+1}.png"
            
            success = self.generate_image(pictogram_prompt, "pictogram", pictogram_filename)
            if success:
                # Add delay to avoid API limits
                time.sleep(2)
            
            # Coming Soon: generate chart variations and use layout template
    
    def process_all_csv_files(self):
        """Process all CSV files"""
        if not os.path.exists(self.processed_data_dir):
            print(f"Error: Cannot find directory {self.processed_data_dir}")
            return
        
        csv_files = [f for f in os.listdir(self.processed_data_dir) if f.endswith('.csv')]
        
        if not csv_files:
            print(f"No CSV files found in {self.processed_data_dir}")
            return
        
        print(f"Found {len(csv_files)} CSV files")
        
        for csv_file in csv_files:
            try:
                self.process_csv_file(csv_file)
            except Exception as e:
                print(f"Error processing file {csv_file}: {e}")
                continue
    
    def generate_single_title(self, csv_path: str, bg_color: str, output_filename: str, use_cache: bool = True):
        """
        Generate a single title image using the title_generation module

        Args:
            csv_path: Path to the CSV data file
            bg_color: Background color hex code (e.g., "#ff6a00")
            output_filename: Path to save the generated title image
            use_cache: Whether to use cached results (False for regeneration)

        Returns:
            Dict with title text and image path
        """
        import shutil

        # 生成缓存键
        cache_key = self._generate_cache_key(
            csv_path=csv_path,
            bg_color=bg_color,
            type='title'
        )

        # 缓存文件路径（保存在 buffer/generation_cache/titles 中）
        cache_image_filename = f"{cache_key}.png"
        cache_image_path = os.path.join(self.title_cache_dir, cache_image_filename)

        # 检查缓存（如果允许使用缓存）
        if use_cache and cache_key in self.title_cache:
            cached_result = self.title_cache[cache_key]
            print(f"[CACHE HIT] Using cached title for {csv_path}")

            # 检查缓存的文件是否仍然存在
            if os.path.exists(cache_image_path):
                # 复制缓存文件到输出路径
                os.makedirs(os.path.dirname(output_filename), exist_ok=True)
                shutil.copy(cache_image_path, output_filename)

                return {
                    'title_text': cached_result.get('title_text'),
                    'image_path': output_filename,
                    'success': True
                }

            print(f"[CACHE MISS] Cached image not found, regenerating...")

        csv_data = self.read_csv_data(csv_path)

        # Step 1: Generate title text from CSV data using LLM
        title_text = self.generate_title_text(csv_data)

        # 测试模式：直接复制测试图片到缓存和目标路径
        if TEST_MODE:
            print(f"[TEST MODE] Skipping title generation, using test image")
            os.makedirs(os.path.dirname(output_filename), exist_ok=True)
            if os.path.exists(TEST_TITLE_IMAGE):
                # 保存到缓存目录
                shutil.copy(TEST_TITLE_IMAGE, cache_image_path)
                # 复制到输出路径
                shutil.copy(TEST_TITLE_IMAGE, output_filename)

                result = {
                    'title_text': title_text,
                    'cache_path': cache_image_path,
                    'success': True
                }
                # 保存到缓存
                self.title_cache[cache_key] = result
                self._save_cache(self.title_cache_file, self.title_cache)

                return {
                    'title_text': title_text,
                    'image_path': output_filename,
                    'success': True
                }
            else:
                print(f"[TEST MODE] Test image not found: {TEST_TITLE_IMAGE}")
                return {
                    'title_text': title_text,
                    'image_path': None,
                    'success': False
                }

        # Step 2: Generate title image using the title_generation module
        try:
            from generate_full_image import get_image_only_title

            # 先生成到缓存路径
            result_path = get_image_only_title(
                texts=[title_text],
                bg_hex=bg_color,
                save_path=cache_image_path,
                prompt_times=1,
                image_times=1
            )

            success = result_path is not None and os.path.exists(cache_image_path)
            print(f"Title image generation: {'success' if success else 'failed'}")

            if success:
                # 复制到输出路径
                os.makedirs(os.path.dirname(output_filename), exist_ok=True)
                shutil.copy(cache_image_path, output_filename)

                # 保存到缓存元数据
                cache_result = {
                    'title_text': title_text,
                    'cache_path': cache_image_path,
                    'success': True
                }
                self.title_cache[cache_key] = cache_result
                self._save_cache(self.title_cache_file, self.title_cache)

                return {
                    'title_text': title_text,
                    'image_path': output_filename,
                    'success': True
                }
            else:
                return {
                    'title_text': title_text,
                    'image_path': None,
                    'success': False
                }

        except Exception as e:
            print(f"Failed to generate title image: {e}")
            return {
                'title_text': title_text,
                'image_path': None,
                'success': False
            }

    def generate_single_pictogram(self, title_text: str, colors, output_filename: str, use_cache: bool = True):
        """
        Generate a single pictogram image

        Args:
            title_text: The title text for context
            colors: Color palette to use
            output_filename: Path to save the generated pictogram image
            use_cache: Whether to use cached results (False for regeneration)

        Returns:
            Dict with pictogram prompt and success status
        """
        import shutil

        # 生成缓存键
        # 将 colors 转换为可哈希的字符串
        colors_str = str(colors) if colors else ''
        cache_key = self._generate_cache_key(
            title_text=title_text,
            colors=colors_str,
            type='pictogram'
        )

        # 缓存文件路径（保存在 buffer/generation_cache/pictograms 中）
        cache_image_filename = f"{cache_key}.png"
        cache_image_path = os.path.join(self.pictogram_cache_dir, cache_image_filename)

        # 检查缓存（如果允许使用缓存）
        if use_cache and cache_key in self.pictogram_cache:
            cached_result = self.pictogram_cache[cache_key]
            print(f"[CACHE HIT] Using cached pictogram for title: {title_text}")

            # 检查缓存的文件是否仍然存在
            if os.path.exists(cache_image_path):
                # 复制缓存文件到输出路径
                os.makedirs(os.path.dirname(output_filename), exist_ok=True)
                shutil.copy(cache_image_path, output_filename)

                return {
                    'pictogram_prompt': cached_result.get('pictogram_prompt'),
                    'image_path': output_filename,
                    'success': True
                }

            print(f"[CACHE MISS] Cached image not found, regenerating...")

        # 测试模式：直接复制测试图片到缓存和目标路径
        if TEST_MODE:
            print(f"[TEST MODE] Skipping pictogram generation, using test image")
            os.makedirs(os.path.dirname(output_filename), exist_ok=True)
            if os.path.exists(TEST_PICTOGRAM_IMAGE):
                # 保存到缓存目录
                shutil.copy(TEST_PICTOGRAM_IMAGE, cache_image_path)
                # 复制到输出路径
                shutil.copy(TEST_PICTOGRAM_IMAGE, output_filename)

                result = {
                    'pictogram_prompt': '[TEST MODE]',
                    'cache_path': cache_image_path,
                    'success': True
                }
                # 保存到缓存
                self.pictogram_cache[cache_key] = result
                self._save_cache(self.pictogram_cache_file, self.pictogram_cache)

                return {
                    'pictogram_prompt': '[TEST MODE]',
                    'image_path': output_filename,
                    'success': True
                }
            else:
                print(f"[TEST MODE] Test image not found: {TEST_PICTOGRAM_IMAGE}")
                return {
                    'pictogram_prompt': '[TEST MODE]',
                    'image_path': None,
                    'success': False
                }

        # Generate pictogram prompt
        pictogram_prompt = self.generate_image_prompt(title_text, "pictogram", colors)

        # Generate the pictogram image to cache path first
        success = self.generate_image(pictogram_prompt, "pictogram", cache_image_path)

        if success and os.path.exists(cache_image_path):
            # 复制到输出路径
            os.makedirs(os.path.dirname(output_filename), exist_ok=True)
            shutil.copy(cache_image_path, output_filename)

            # 保存到缓存元数据
            cache_result = {
                'pictogram_prompt': pictogram_prompt,
                'cache_path': cache_image_path,
                'success': True
            }
            self.pictogram_cache[cache_key] = cache_result
            self._save_cache(self.pictogram_cache_file, self.pictogram_cache)

            return {
                'pictogram_prompt': pictogram_prompt,
                'image_path': output_filename,
                'success': True
            }
        else:
            return {
                'pictogram_prompt': pictogram_prompt,
                'image_path': None,
                'success': False
            }

def main():
    """Main function"""
    print("=== Infographic Generator ===")
    
    # Create generator and start processing
    generator = InfographicImageGenerator()
    generator.process_all_csv_files()
    
    print("\n=== Processing completed ===")
    print(f"Generated images saved in: {generator.output_dir}")

if __name__ == "__main__":
    main() 
