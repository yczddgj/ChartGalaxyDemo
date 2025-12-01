from openai import OpenAI
import os
import sys

# Add project root to sys.path to import config
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

import config

# 获取当前文件所在目录的绝对路径
_current_dir = os.path.dirname(os.path.abspath(__file__))

def get_prompt( title,
                bg_color,
                prompt_path = None,
                save_path = None,
                style_description = None):
    # 使用绝对路径
    if prompt_path is None:
        prompt_path = os.path.join(_current_dir, 'prompts/generate_prompt_gpt_en.md')
    if save_path is None:
        save_path = os.path.join(_current_dir, 'prompts/generated_output.md')
    with open(prompt_path, 'r', encoding='utf-8') as file:
        generate_prompt = file.read()
    generate_prompt = generate_prompt.replace("{title}", title)
    generate_prompt = generate_prompt.replace("{color}", bg_color)

    # # 如果有参考图风格描述，添加到prompt中
    # if style_description:
    #     generate_prompt += f"\n\n## Reference Style Guide\nIMPORTANT: Please follow this visual style from the reference image when designing the title:\n{style_description}"
    #     print(f"Added style description to title prompt")

    client = OpenAI(
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL
    )
    response = client.chat.completions.create(
        model="gemini-2.5-flash",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                    "type": "text",
                    "text": generate_prompt},
                    ]
            }
        ]
    )
    #print(response.choices[0])
    generated_text = response.choices[0].message.content
    generated_text = "Generate a text image with the content of \"" + title + "\". " + generated_text
    with open(save_path, 'w', encoding='utf-8') as output_file:
        output_file.write(generated_text)
    return save_path
