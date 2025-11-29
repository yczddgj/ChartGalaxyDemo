from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.service import Service as ChromeService
from PIL import Image
import time
import tempfile
import random
import os
import sys

def get_driver(max_retries=1, delay=0):
    """
    启动稳定的 headless Chrome，支持 Linux headless 环境。
    """
    for attempt in range(1, max_retries + 1):
        try:
            options = webdriver.ChromeOptions()
            # Headless + 软件渲染，保证 Linux 下稳定启动
            options.add_argument("--headless=new")   # 新版 headless
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-software-rasterizer")
            options.add_argument("--disable-gpu")
            # options.add_argument("--remote-debugging-port=9222")
            options.add_argument("--disable-extensions")
            options.add_argument("--disable-background-networking")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-sync")
            options.add_argument("--disable-translate")
            options.add_argument("--metrics-recording-only")
            options.add_argument("--mute-audio")

            unique_tmpdir = "/data1/jiangning/dataset/ICLR_dataset/chromium_tmp"
            cache_dir = os.path.join(unique_tmpdir, "cache")
            crash_dir = os.path.join(unique_tmpdir, "crash")
            media_cache_dir = os.path.join(unique_tmpdir, "media_cache")
            os.makedirs(cache_dir, exist_ok=True)
            os.makedirs(crash_dir, exist_ok=True)
            os.makedirs(media_cache_dir, exist_ok=True)

            options.add_argument(f"--disk-cache-dir={cache_dir}")
            options.add_argument(f"--media-cache-dir={media_cache_dir}")
            options.add_argument(f"--crash-dumps-dir={crash_dir}")

            service = ChromeService(
                log_output=open(f"chromedriver_attempt{attempt}.log", "w")
            )
            # service = ChromeService(log_output=sys.stdout)  # 打印 chromedriver log
            options.add_argument("--enable-logging")
            options.add_argument("--v=1")
            options.add_argument("--log-file=chrome.log")   # 打印 Chrome log

            unique_tmpdir = tempfile.mkdtemp(prefix="chrome_")
            options.add_argument(f"--user-data-dir={unique_tmpdir}")

            driver = webdriver.Chrome(options=options)
            print(f">>> ChromeDriver started successfully on attempt {attempt}")
            return driver
        except WebDriverException as e:
            if attempt < max_retries:
                print(f"[Retry {attempt}/{max_retries}] Chrome 启动失败: {e}, {delay}s 后重试...")
                time.sleep(delay)
            else:
                raise  # 超过重试次数，抛出异常


def take_screenshot(driver: webdriver.Chrome, html_path: str):
    """
    对 HTML 文件中的 SVG 进行截图并保存为 PNG
    
    Args:
        driver: Chrome WebDriver 实例
        html_path: HTML 文件的绝对路径
    """
    import os
    from selenium.common.exceptions import NoSuchElementException
    
    # 确保使用绝对路径
    html_path = os.path.abspath(html_path)
    
    # 生成输出路径
    base_path = os.path.splitext(html_path)[0]
    full_screenshot_path = f"{base_path}_full.png"
    png_path = f"{base_path}.png"
    
    try:
        # 加载 HTML 文件
        driver.get(f'file://{html_path}')
        time.sleep(0.3)  # 增加等待时间，确保 SVG 加载完成

        # 查找 SVG 元素
        try:
            svg = driver.find_element("css selector", "svg")
        except NoSuchElementException:
            raise Exception(f"在 HTML 文件中未找到 SVG 元素: {html_path}")

        # 获取 SVG 尺寸
        svg_width = driver.execute_script("return arguments[0].getBoundingClientRect().width;", svg)
        svg_height = driver.execute_script("return arguments[0].getBoundingClientRect().height;", svg)
        
        if svg_width <= 0 or svg_height <= 0:
            raise Exception(f"SVG 尺寸无效: width={svg_width}, height={svg_height}")
        
        required_width = int(svg_width + 500)
        required_height = int(svg_height + 500)

        if required_width > 1920 or required_height > 1080:
            driver.set_window_size(required_width, required_height)
            time.sleep(0.3)

        # 获取 SVG 位置和尺寸
        location = svg.location
        size = svg.size

        x = location['x']
        y = location['y']
        width = size['width']
        height = size['height']

        # 保存完整截图
        driver.save_screenshot(full_screenshot_path)

        # 裁剪并保存 PNG
        image = Image.open(full_screenshot_path)
        left = round(x)
        top = round(y)
        right = round(x + width)
        bottom = round(y + height)
        
        # 确保裁剪坐标在图像范围内
        img_width, img_height = image.size
        left = max(0, min(left, img_width))
        top = max(0, min(top, img_height))
        right = max(left, min(right, img_width))
        bottom = max(top, min(bottom, img_height))
        
        cropped_image = image.crop((left, top, right, bottom))
        cropped_image.save(png_path)
        
        # 清理完整截图文件
        try:
            if os.path.exists(full_screenshot_path):
                os.remove(full_screenshot_path)
        except:
            pass
            
    except Exception as e:
        print(f"截图失败: {e}")
        raise


