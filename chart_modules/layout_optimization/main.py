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
from mask_utils import calculate_image_mask, expand_mask
from image_utils import find_best_size_and_position


padding = 50
between_padding = 35

def crop_by_mask(mask: np.ndarray, image):
    """
    根据mask将图片外围的空白部分裁剪掉，仅保留mask非零区域的bounding box。
    """
    # 找到mask中非零（即有效内容）的像素索引
    nonzero = np.argwhere(mask)
    if nonzero.size == 0:  # 如果全部为0，直接返回
        return image

    y_min, x_min = nonzero.min(axis=0)
    y_max, x_max = nonzero.max(axis=0)

    # PIL的crop参数格式为(left, upper, right, lower)
    # 注意右/下是开区间，所以需要+1
    return image.crop((x_min, y_min, x_max + 1, y_max + 1))


def make_infographic(
    data: Dict,
    chart_png_path: str,
    image_png_path: str,
    padding: int,
    between_padding: int,
):

    chart_image = Image.open(chart_png_path)
    mask, _ = calculate_image_mask(chart_png_path, grid_size=5)
    mask = expand_mask(mask, 5)
    
    image_image = Image.open(image_png_path)
    image_mask, _ = calculate_image_mask(image_png_path, grid_size=5)
    image_mask = expand_mask(image_mask, 5)
    
    # Visualize the mask for debugging
    import matplotlib.pyplot as plt
    
    def visualize_mask(mask, title="Mask Visualization"):
        """
        Visualize the mask and return a base64 encoded image
        
        Args:
            mask: The mask array to visualize
            title: Title for the plot
            
        Returns:
            str: Base64 encoded PNG image
        """
        plt.figure(figsize=(10, 8))
        plt.imshow(mask, cmap='viridis')
        plt.colorbar(label='Mask Value')
        plt.title(title)
        plt.grid(True, alpha=0.3)
        
        # Add annotations for dimensions
        height, width = mask.shape
        plt.text(width/2, -10, f"Width: {width}px", ha='center')
        plt.text(-10, height/2, f"Height: {height}px", va='center', rotation=90)
        
        # Save to a bytes buffer
        buf = io.BytesIO()
        plt.tight_layout()
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)
        
        # Convert to base64
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        return img_str
    
    # 把mask保存为png
    mask_img = visualize_mask(mask, "Chart Mask")
    image_mask_img = visualize_mask(image_mask, "Image Mask")
    
    # 把两个mask保存下来
    with open("mask.png", "wb") as f:
        f.write(base64.b64decode(mask_img))
    with open("image_mask.png", "wb") as f:
        f.write(base64.b64decode(image_mask_img))

    image_element = ""
    side_image_size = 0
    side_image_size, side_best_x, side_best_y = find_best_size_and_position(mask, image_image, padding, mode="side")
    measure_side_size = min(side_image_size, 256)
    image_size = side_image_size
    best_x = side_best_x
    best_y = side_best_y
    image_mode = "side"
    # 计算图片区域
    image_rect = {
        'x': best_x,
        'y': best_y,
        'width': image_size,
        'height': image_size
    }
    # 新建画布，尺寸足够放下chart和附加图片（包括padding）
    chart_width, chart_height = chart_image.size

    # 画布宽度等于chart宽+2*padding，高度取chart高和图片区域的y/大小
    canvas_width = chart_width + 2 * padding
    canvas_height = chart_height + 2 * padding

    # 创建白底画布
    from PIL import ImageDraw
    canvas = Image.new("RGBA", (canvas_width, canvas_height), (255,255,255,255))

    # 把chart图贴到画布中间（带padding）
    chart_paste_x = padding
    chart_paste_y = padding
    canvas.paste(chart_image, (chart_paste_x, chart_paste_y), mask=chart_image.convert("RGBA") if chart_image.mode != "RGBA" else chart_image)

    # 将image_image缩放到测得的image_size
    if image_image.width != image_rect['width'] or image_image.height != image_rect['height']:
        image_resized = image_image.resize((image_rect['width'], image_rect['height']), Image.ANTIALIAS)
    else:
        image_resized = image_image

    # 将image贴到对应位置（以整体画布为基准）
    image_paste_x = image_rect['x'] + padding
    image_paste_y = image_rect['y'] + padding
    canvas.paste(image_resized, (image_paste_x, image_paste_y), mask=image_resized.convert("RGBA") if image_resized.mode != "RGBA" else image_resized)

    # 保存或返回结果
    output_path = "chart_modules/layout_optimization/infographic_result.png"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    canvas.save(output_path)
    print(f"Infographic saved to {output_path}")
    print(f"Image positioned at canvas: x={image_paste_x}, y={image_paste_y}, size={image_size}")
    print(f"Image position relative to chart: x={image_rect['x']}, y={image_rect['y']}")
    # return output_path
    # 返回图片的大小和位置（相对于chart，不包含padding）
    return {
        'image_size': image_size,
        'image_x': image_rect['x'],  # 相对于chart的x坐标
        'image_y': image_rect['y'],  # 相对于chart的y坐标
        'output_path': output_path
    }


if __name__ == "__main__":
    make_infographic(
        data={},
        chart_png_path="/data1/liduan/ChartGalaxyDemo/chart_modules/layout_optimization/test0.png",
        image_png_path="/data1/liduan/ChartGalaxyDemo/buffer/App/pictogram_0_8f6a3a3b.png",
        padding=20,
        between_padding=15
    )