import requests
import sys
import os
from io import BytesIO
from PIL import Image
import numpy as np

# Add project root to sys.path to import config
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

import config
from generate_prompt import get_prompt
from crop_image import crop
from check_image import check
from openai import OpenAI
import base64
import os

# 获取当前文件所在目录的绝对路径
_current_dir = os.path.dirname(os.path.abspath(__file__))

def remove_background(image_path, tolerance=30):
    """
    Removes the background from an image by detecting the most common color (likely background)
    and making it transparent.
    
    Args:
        image_path (str): Path to the image file.
        tolerance (int): Tolerance for color matching (0-255).
    
    Returns:
        str: Path to the image with background removed.
    """
    try:
        img = Image.open(image_path).convert("RGBA")
        data = np.array(img)
        
        # Find the most frequent color (assuming it's the background)
        # Only consider the RGB channels for frequency analysis
        rgb_data = data[:, :, :3]
        colors, counts = np.unique(rgb_data.reshape(-1, 3), axis=0, return_counts=True)
        bg_color = colors[counts.argmax()]
        
        print(f"Detected background color: {bg_color}")

        # Create a mask for pixels that match the background color within tolerance
        mask = np.all(np.abs(data[:, :, :3] - bg_color) <= tolerance, axis=2)
        
        # Set alpha channel to 0 for matching pixels
        data[mask, 3] = 0
        
        # Create new image from modified data
        new_img = Image.fromarray(data)
        
        # Save the processed image
        new_img.save(image_path, "PNG")
        print(f"Background removed from: {image_path}")
        return image_path
    except Exception as e:
        print(f"Error removing background: {e}")
        return image_path

def get_image(  bg_hex,
                prompt_path = None,
                save_path = 'images/title/generated_image.png',
                res = "RESOLUTION_1408_576"):
    # 使用绝对路径
    if prompt_path is None:
        prompt_path = os.path.join(_current_dir, 'prompts/generated_output.md')
    client = OpenAI(
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL
    )
    with open(prompt_path, 'r', encoding='utf-8') as file:
        image_prompt = file.read()
    print("image_prompt: ", image_prompt)

    try:
        # 使用 chat completion 接口调用 Gemini 3.0 Pro
        response = client.chat.completions.create(
            model="gemini-3-pro-image-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": image_prompt
                        }
                    ]
                }
            ],
            modalities=["text", "image"],
            max_tokens=8192,
            temperature=0.7
        )
        
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
                        with open(save_path, "wb") as f:
                            f.write(image_bytes)
                        print(f"图片已保存至：{save_path}")
                        
                        # Remove background immediately after saving
                        # remove_background(save_path)
                        
                        image_saved = True
                        break # 只保存第一张图片
        
        if not image_saved:
            print("未在响应中找到图片数据。")
            
    except Exception as e:
        print(f"Error generating image with Gemini: {e}")
        import traceback
        traceback.print_exc()

    return save_path

def get_title(title,
            bg_hex,
            prompt_times = 2,
            image_times = 4,
            image_res = "RESOLUTION_1536_640",#"RESOLUTION_1408_576",
            save_path = 'images/title/generated_image.png',
            style_description = None):
    succ = 0
    save_path_list = []
    for i in range(prompt_times):
        if succ == 1:
            break
        print("Prompt times: ", i)
        get_prompt(title, bg_hex, style_description=style_description)
        print("Prompt generated.")
        for j in range(image_times):
            print("Image times: ", j)
            # 如果只生成一张图片，直接使用传入的路径
            if prompt_times == 1 and image_times == 1:
                save_path_file = save_path if save_path.endswith('.png') else f"{save_path}.png"
            else:
                save_path_file = f"{save_path}_{i}.png"
            save_path_list.append(save_path_file)
            image_response = get_image(bg_hex=bg_hex, res=image_res, save_path=save_path_file)
            print("image_response: ", image_response)
            # succ = 1
            # crop(image_path=save_path)
            check_result, check_response = check(title, image_path=save_path_file)
            print("check_response: ", check_response)
            print("check_result: ", check_result)

            if check_result == "Yes":
                succ = 1
                break
            # break
    return succ, save_path_list
