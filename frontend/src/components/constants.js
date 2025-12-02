// Constants for Workbench component

export const CANVAS_MIN_WIDTH = 1200;
export const CANVAS_MIN_HEIGHT = 900;

export const CHART_TYPES_PER_PAGE = 3;
export const VARIATIONS_PER_PAGE = 3;
export const REFERENCES_PER_PAGE = 3;

export const MAX_HISTORY_SIZE = 50;
export const SNAPSHOT_LIMIT = 3;

export const DEFAULT_PROMPT = `You are an expert Infographic Designer and Data Visualization Specialist.

I am providing two images:
1. **Original Image (Source Content):** A chart containing the specific data, numbers, and structure that must be preserved.
2. **Reference Image (Target Style):** A design sample showing the exact aesthetic, color palette, and visual style I want to apply.

**Your Task:**
Redesign the **Original Image** by strictly applying the visual style of the **Reference Image**.

**Strict Requirements:**

1. **Content Integrity (DO NOT CHANGE):**
   - Keep all data values, numbers, axis labels, legends, and titles EXACTLY as they appear in the Original Image.
   - Do not summarize or alter the text.
   - Maintain the fundamental chart structure (e.g., if the original is a grouped bar chart, keep it a grouped bar chart).

2. **Style Transfer (APPLY FROM REFERENCE):**
   - **Color Palette:** Extract and use the exact hex codes/colors from the Reference Image for backgrounds, data bars/lines, and text.
   - **Typography:** Match the font style (serif/sans-serif), weight (bold/light), and hierarchy used in the Reference Image.
   - **Visual Elements:** Replicate the specific design details such as corner radius (rounded vs sharp), border styles, shadow effects, grid line styles, and background patterns.
   - **Vibe:** Ensure the final output looks like it belongs to the same brand identity or report series as the Reference Image.

**Output:**
Generate a high-fidelity design that combines the *data* of the Original Image with the *look and feel* of the Reference Image.`;

