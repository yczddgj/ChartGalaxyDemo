from openai import OpenAI
import os

# 获取当前文件所在目录的绝对路径
_current_dir = os.path.dirname(os.path.abspath(__file__))

def get_prompt( title,
                bg_color,
                prompt_path = None,
                save_path = None):
    # 使用绝对路径
    if prompt_path is None:
        prompt_path = os.path.join(_current_dir, 'prompts/generate_prompt_gpt_en.md')
    if save_path is None:
        save_path = os.path.join(_current_dir, 'prompts/generated_output.md')
    with open(prompt_path, 'r', encoding='utf-8') as file:
        generate_prompt = file.read()
    generate_prompt = generate_prompt.replace("{title}", title)
    generate_prompt = generate_prompt.replace("{color}", bg_color)

    client = OpenAI(
        api_key="sk-ug32KbbvEDPucqnaB207A5EcEd6f47Dc887c14249a12Ff43",
        base_url="https://aihubmix.com/v1"
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
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
