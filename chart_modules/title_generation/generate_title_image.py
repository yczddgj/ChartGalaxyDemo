import requests
from generate_prompt import get_prompt
from crop_image import crop
from check_image import check
from openai import OpenAI
import base64
import os

# 获取当前文件所在目录的绝对路径
_current_dir = os.path.dirname(os.path.abspath(__file__))

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

    result = client.images.generate(
        model="gpt-image-1",
        prompt=image_prompt,
        n=1, # 单次出图数量，最多 10 张
        size="1536x1024", # 1024x1024 (square), 1536x1024 (3:2 landscape), 1024x1536 (2:3 portrait), auto (default) 
        quality="low", # high, medium, low, auto (default)
        moderation="low", # low, auto (default) 需要升级 openai 包 📍
        background="transparent", # transparent, opaque, auto (default)
    )
    # 遍历所有返回的图片数据
    for i, image_data in enumerate(result.data):
        image_base64 = image_data.b64_json
        if image_base64: # 确保 b64_json 不为空
            image_bytes = base64.b64decode(image_base64)
            # --- 文件名冲突处理逻辑开始 ---
            # current_index = i
            # while True:
                # # 构建带自增序号的文件名
                # file_name = f"{current_index}.png"
                # file_path = os.path.join(output_dir, file_name) # 构建完整文件路径

                # # 检查文件是否存在
                # if not os.path.exists(file_path):
                #     break # 文件名不冲突，跳出循环

                # # 文件名冲突，增加序号
                # current_index += 1

            # # 使用找到的唯一 file_path 保存图片到文件
            # with open(file_path, "wb") as f:
            #     f.write(image_bytes)
            with open(save_path, "wb") as f:
                f.write(image_bytes)
            print(f"图片已保存至：{save_path}")
        else:
            print(f"第 {i} 张图片数据为空，跳过保存。")
    return save_path
    # payload = { "image_request": {
    #         "prompt": image_prompt,
    #         #"aspect_ratio": "ASPECT_16_9",
    #         "model": "V_2",
    #         "magic_prompt_option": "AUTO",
    #         "style_type": "DESIGN",
    #         "resolution": res,
    #         "color_palette":{
    #             "members":[
    #                 {
    #                 "color_hex": bg_hex,
    #                 "color_weight": 1
    #                 }
    #             ]
    #         }
    #     } }
    # headers = {
    #     "Api-Key": api_key,
    #     "Content-Type": "application/json"
    # }
    # response = requests.post(url, json=payload, headers=headers)
    # data = response.json()
    # image_url = data['data'][0]['url']
    # response_image = requests.get(image_url)
    # if response_image.status_code == 200:
    #     with open(save_path, 'wb') as file:
    #         file.write(response_image.content)
    # return response

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
            succ = 1
            # crop(image_path=save_path)
            # check_result, check_response = check(title, image_path=save_path)
            # print("check_response: ", check_response)
            # print("check_result: ", check_result)

            # if check_result == "Yes":
            #     succ = 1
            #     break
            # break
    return succ, save_path_list
