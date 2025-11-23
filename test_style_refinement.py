"""
测试 style_refinement 模块的基本功能
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from chart_modules.style_refinement import svg_to_png

# 测试 SVG 内容
test_svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
    <rect x="0" y="0" width="400" height="200" fill="#f5f3ef"/>
    <text x="200" y="100" text-anchor="middle" font-size="24" fill="#333">
        测试 SVG 转 PNG
    </text>
    <circle cx="100" cy="100" r="30" fill="#ff6a00"/>
    <rect x="250" y="70" width="60" height="60" fill="#3f8aff"/>
</svg>
"""

def test_svg_to_png():
    """测试 SVG 转 PNG 功能"""
    print("=" * 60)
    print("测试 SVG 转 PNG 功能")
    print("=" * 60)

    output_path = "test_output.png"

    # 删除旧的测试文件
    if os.path.exists(output_path):
        os.remove(output_path)

    # 执行转换
    success = svg_to_png(test_svg, output_path, "#f5f3ef")

    if success and os.path.exists(output_path):
        file_size = os.path.getsize(output_path)
        print(f"\n✅ 测试通过！")
        print(f"   输出文件: {output_path}")
        print(f"   文件大小: {file_size} bytes")
        print(f"\n请检查生成的 {output_path} 文件")
    else:
        print(f"\n❌ 测试失败！")
        print(f"   SVG 转 PNG 失败")

if __name__ == "__main__":
    test_svg_to_png()
