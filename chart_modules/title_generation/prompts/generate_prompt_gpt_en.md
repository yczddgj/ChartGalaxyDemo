# Task Requirements
I want to generate a **text image**, which will be used as the title of a poster in the future. Please help me generate a text segment as a **prompt for a text-to-image model** to create an appropriate text image. The content of the text is **"{title}"**, and the RGB color of the image background is {color}. You need to design it from the following three perspectives (**Attention! The following content is provided only as a prompt for your consideration. No response or output is required!**):

## Text Layout and Emphasis
In this aspect, you will decide the **overall layout of the text**. You need to appropriately break down the title "{title}" into lines according to its semantics. and consider whether certain key text should be emphasized. If "{title}" includes two or more sentences, the first sentence should be the main title, and the following sentences do not need to be emphasized.
Please provide: 
1. How many lines the text should be split into.
   - **Strict Constraint**: 
     - If the text is short (approx. < 6 words), use **1 line** or **2 lines**.
     - If the text is medium length, use **2 lines**.
     - Use **3 lines** ONLY if the text is very long.
     - **NEVER** use 4 or more lines.
2. The specific content of each line.
3. If there is key text, provide:
   - The key text that should be emphasized.
   - The method of emphasizing the key text, such as enlarging the font, changing the color, or using different colors for each letter.

## Decoration with Icons
In this aspect, you will decide whether to **decorate the text with icons**. You need to determine if "{title}" is suitable for icon decoration. If so, please provide:
1. Choose one way to decorate the text with icons:
   - Replace a letter or part of a letter with an icon.
   - Add graphics around the text.
2. If you choose to replace a letter or part of a letter with an icon, provide:
   - The specific content of the icon.
   - Which letter (or part of the letter) in which word the icon will replace.
3. If you choose to add graphics around the text, provide:
   - The specific content of the graphics.
   - The position of the graphics.
   - The style of the graphics.
7. **Composition**: The text does NOT need to fill the entire canvas. Prioritize the line breaks specified above over filling the space. Leave empty space if necessary to maintain the correct text layout.

## Font Style and Artistic Effects
In this aspect, you will decide the **font style and artistic effects** for the text. You need to judge whether "{title}" is suitable for a specific font style (e.g., classical, futuristic, anime-style, etc.) and certain artistic text effects (e.g., cracks on the text surface, melting text, etc.). If applicable, please provide:
1. The font style, such as classical, futuristic, anime-style, etc.
2. The artistic effect, such as cracks on the text surface, melting text, burning text, etc.

# Output
**Output Requirements**:
1. Directly output a text segment as a prompt for a text-to-image model, without any markdown code.
2. Describe the design requirements as detailed as possible, but there is no need to elaborate on the purpose and significance of the design.
3. Do not answer each dimension one by one according to the task requirements. Instead, integrate the designs from all dimensions and output them together.
4. **CRITICAL**: You MUST explicitly dictate the line breaks in the generated prompt to strictly enforce the layout (e.g., "Arrange the text in exactly 2 lines. Top line: '...', Bottom line: '...'").
5. Do not mention any requirements regarding the background color.
6. Avoid describing your design solely with stylistic adjectives. You should translate your design into specific presentation methods and scenarios.

Based on the three dimensions above, please output your design:
