import axios from 'axios';
import { fabric } from 'fabric';

// Constants for canvas layout
const FIXED_PICTOGRAM_SIZE = 150;  // 调整pictogram默认大小
const TITLE_ASPECT_THRESHOLD = 2.0;
const TITLE_COMPACT_WIDTH_RATIO = 0.45;
const TITLE_WIDE_WIDTH_RATIO = 0.65;
const MIN_TITLE_CENTER_Y_OFFSET = 60;
const TITLE_PADDING_RATIO = 0.02;

// Helper function to update existing fabric image object
async function updateImageObject(fabricObject, newUrl) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 10000); // 10秒超时
    
    fabric.Image.fromURL(newUrl, (img) => {
      clearTimeout(timeout);
      
      if (!img || !img.getElement()) {
        reject(new Error('Failed to load image'));
        return;
      }
      
      try {
        // 保存当前的变换状态
        const currentState = {
          left: fabricObject.left,
          top: fabricObject.top,
          scaleX: fabricObject.scaleX,
          scaleY: fabricObject.scaleY,
          angle: fabricObject.angle,
          originX: fabricObject.originX,
          originY: fabricObject.originY
        };
        
        // 更新图片源
        fabricObject.setElement(img.getElement());
        fabricObject.set(currentState);
        fabricObject.setCoords();
        resolve(fabricObject);
      } catch (error) {
        reject(error);
      }
    }, { crossOrigin: 'anonymous' });
  });
}

// Helper function to capture chart+title as image
async function getChartWithTitleImage(canvas) {
  try {
    // 只导出当前canvas上的chart和title（前两个对象）
    const objects = canvas.getObjects();
    if (objects.length < 1) return null;
    
    // 临时隐藏pictogram（如果有）
    const pictograms = objects.slice(2);
    pictograms.forEach(obj => obj.set('visible', false));
    canvas.renderAll();
    
    // 计算chart和title的bounding box
    const visibleObjects = objects.slice(0, 2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    visibleObjects.forEach(obj => {
      const rect = obj.getBoundingRect(true, true);
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.left + rect.width);
      maxY = Math.max(maxY, rect.top + rect.height);
    });
    
    // 添加padding
    const padding = 20;
    const exportLeft = Math.floor(minX - padding);
    const exportTop = Math.floor(minY - padding);
    const exportWidth = Math.ceil(maxX - minX + padding * 2);
    const exportHeight = Math.ceil(maxY - minY + padding * 2);
    
    // 导出为dataURL
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      left: exportLeft,
      top: exportTop,
      width: exportWidth,
      height: exportHeight
    });
    
    // 恢复pictogram可见性
    pictograms.forEach(obj => obj.set('visible', true));
    canvas.renderAll();
    
    return {
      dataUrl,
      bounds: {
        left: exportLeft,
        top: exportTop,
        width: exportWidth,
        height: exportHeight
      }
    };
  } catch (error) {
    console.error('Error capturing chart with title:', error);
    return null;
  }
}

export async function loadChartToCanvas({
  canvas,
  variationName,
  selectedFile,
  titleImage,
  selectedPictograms,
  savedPositions,
  setSavedPositions,
  bgColor,
  setBgColor,
  directUrl = null,
  preservePositions = false,
  enableOptimization = null,  // null表示自动判断：当!preservePositions时启用优化
  setIsOptimizing = null  // 优化loading状态的setter
}) {
  if (!canvas || !selectedFile) return;
  
  // 决定是否启用优化：
  // - 如果明确指定了enableOptimization，使用该值
  // - 否则，当不保留位置时(!preservePositions)才启用优化
  const shouldOptimize = enableOptimization !== null ? enableOptimization : !preservePositions;
  
  try {
    // Save current positions before clearing canvas (only when explicitly preserving)
    let currentPositions = { chart: null, title: null, pictograms: [] };
    
    if (preservePositions && canvas.getObjects().length > 0) {
      const objects = canvas.getObjects();
      if (objects[0]) {
        currentPositions.chart = {
          left: objects[0].left,
          top: objects[0].top,
          scaleX: objects[0].scaleX,
          scaleY: objects[0].scaleY,
          angle: objects[0].angle,
          originX: objects[0].originX,
          originY: objects[0].originY
        };
      }
      if (objects[1]) {
        currentPositions.title = {
          left: objects[1].left,
          top: objects[1].top,
          scaleX: objects[1].scaleX,
          scaleY: objects[1].scaleY,
          angle: objects[1].angle,
          originX: objects[1].originX,
          originY: objects[1].originY
        };
      }
      for (let i = 2; i < objects.length; i++) {
        currentPositions.pictograms.push({
          left: objects[i].left,
          top: objects[i].top,
          scaleX: objects[i].scaleX,
          scaleY: objects[i].scaleY,
          angle: objects[i].angle,
          originX: objects[i].originX,
          originY: objects[i].originY
        });
      }
      setSavedPositions(currentPositions);
    }
    // 移除了 else if 分支，不再使用 savedPositions 进行初始化
    
    let imageUrl = '';
    let layout = null;

    console.log("directUrl", directUrl);
    if (directUrl) {
      imageUrl = directUrl;
      try {
        const statusRes = await axios.get('/api/status');
        const selectedReference = statusRes.data.selected_reference;
        if (selectedReference) {
          const layoutRes = await axios.get('/api/layout');
          layout = layoutRes.data.layout;
          console.log("layout", layout);
        }
      } catch (err) {
        console.warn('Failed to fetch layout info:', err);
      }
    } else {
      const dataName = selectedFile.replace('.csv', '');
      const titlePath = titleImage ? titleImage : 'origin_images/titles/App_title.png';
      const pictogramPath = selectedPictograms.length > 0 ? selectedPictograms[0] : 'origin_images/pictograms/App_pictogram.png';

      const res = await axios.get('/authoring/chart', {
        params: { 
          charttype: variationName, 
          data: dataName,
          title: titlePath,
          pictogram: pictogramPath
        }
      });
      imageUrl = res.data.png_url;
      layout = res.data.layout;
      console.log("layout", layout);
    }
    
    // 只有在不保留位置时才清空canvas
    // 保留位置时，我们会更新现有对象而不是重新创建
    if (canvas && canvas.getContext() && !preservePositions) {
      canvas.clear();
    }
    
    const canvasBgColor = bgColor || (canvas ? canvas.backgroundColor : '#ffffff') || '#ffffff';
    if (canvas) {
      canvas.setBackgroundColor(canvasBgColor, canvas.renderAll.bind(canvas));
    }
    setBgColor(canvasBgColor);
    
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    if (canvasWrapper) {
      canvasWrapper.style.backgroundColor = canvasBgColor;
    }

    const addImage = (url, options) => {
      return new Promise((resolve) => {
        fabric.Image.fromURL(url, (img) => {
          if (img) {
            const hasExplicitScale = options.scaleX !== undefined && options.scaleY !== undefined;
            
            if (!hasExplicitScale && options.maxWidth && options.maxHeight) {
              const scale = Math.min(
                options.maxWidth / img.width,
                options.maxHeight / img.height,
                1
              );
              img.scale(scale);
            } else if (hasExplicitScale) {
              img.scaleX = options.scaleX;
              img.scaleY = options.scaleY;
            }
            
            const { maxWidth, maxHeight, ...fabricOptions } = options;
            img.set(fabricOptions);
            canvas.add(img);
          }
          resolve(img);
        });
      });
    };

    // Determine layout options
    let chartOptions, titleOptions, imageOptions;

    if (preservePositions && currentPositions.chart) {
      chartOptions = {
        ...currentPositions.chart,
        maxWidth: canvas.width * 0.9,
        maxHeight: canvas.height * 0.7
      };

      if (currentPositions.title) {
        titleOptions = currentPositions.title;
        console.log("set title options from current positions");
      } else {
        titleOptions = {
          maxWidth: 400,
          maxHeight: 150,
          left: 20,
          top: 20,
          originX: 'left',
          originY: 'top'
        };
      }

      imageOptions = {
        maxWidth: 200,
        maxHeight: 200,
        left: canvas.width - 220,
        top: canvas.height - 220,
        originX: 'left',
        originY: 'top'
      };
    } else if (layout && layout.width && layout.height) {
      const padding = 40;
      const layoutScale = Math.min(
        (canvas.width - padding * 2) / layout.width,
        (canvas.height - padding * 2) / layout.height
      );

      const scaledLayoutWidth = layout.width * layoutScale;
      const scaledLayoutHeight = layout.height * layoutScale;
      const offsetX = (canvas.width - scaledLayoutWidth) / 2;
      const offsetY = (canvas.height - scaledLayoutHeight) / 2;

      const calculateBoxOptions = (box) => {
        if (!box) return null;
        const boxX = offsetX + box.x * scaledLayoutWidth;
        const boxY = offsetY + box.y * scaledLayoutHeight;
        const boxWidth = box.width * scaledLayoutWidth;
        const boxHeight = box.height * scaledLayoutHeight;

        return {
          centerX: boxX + boxWidth / 2,
          centerY: boxY + boxHeight / 2,
          maxWidth: boxWidth,
          maxHeight: boxHeight,
          originX: 'center',
          originY: 'center'
        };
      };

      if (layout.chart) {
        const chartBox = calculateBoxOptions(layout.chart);
        chartOptions = {
          left: chartBox.centerX,
          top: chartBox.centerY,
          maxWidth: chartBox.maxWidth,
          maxHeight: chartBox.maxHeight,
          originX: 'center',
          originY: 'center'
        };
      } else {
        chartOptions = {
          maxWidth: canvas.width * 0.9,
          maxHeight: canvas.height * 0.7,
          left: canvas.width / 2,
          top: canvas.height / 2,
          originX: 'center',
          originY: 'center'
        };
      }

      if (layout.title) {
        const titleBox = calculateBoxOptions(layout.title);
        titleOptions = {
          left: titleBox.centerX,
          top: titleBox.centerY,
          maxWidth: titleBox.maxWidth,
          maxHeight: titleBox.maxHeight,
          originX: 'center',
          originY: 'center',
          // 保存layout信息供后续使用
          layoutInfo: {
            boxWidth: titleBox.maxWidth,
            boxHeight: titleBox.maxHeight,
            chartWidth: layout.chart ? calculateBoxOptions(layout.chart).maxWidth : null
          }
        };
      } else {
        titleOptions = {
          maxWidth: 400,
          maxHeight: 150,
          left: canvas.width / 2,
          top: 80,
          originX: 'center',
          originY: 'center'
        };
      }

      if (layout.image) {
        const imageBox = calculateBoxOptions(layout.image);
        imageOptions = {
          left: imageBox.centerX,
          top: imageBox.centerY,
          maxWidth: imageBox.maxWidth,
          maxHeight: imageBox.maxHeight,
          originX: 'center',
          originY: 'center'
        };
      } else {
        imageOptions = {
          maxWidth: 200,
          maxHeight: 200,
          left: canvas.width - 120,
          top: canvas.height - 120,
          originX: 'center',
          originY: 'center'
        };
      }
    } else {
      chartOptions = {
        maxWidth: canvas.width * 0.9,
        maxHeight: canvas.height * 0.7,
        left: canvas.width * 0.05,
        top: canvas.height * 0.15,
        originX: 'left',
        originY: 'top'
      };

      titleOptions = {
        maxWidth: 400,
        maxHeight: 150,
        left: 20,
        top: 20,
        originX: 'left',
        originY: 'top'
      };

      imageOptions = {
        maxWidth: 200,
        maxHeight: 200,
        left: canvas.width - 220,
        top: canvas.height - 220,
        originX: 'left',
        originY: 'top'
      };
    }

    // Add Chart
    if (imageUrl) {
      const finalUrl = imageUrl.includes('?') ? imageUrl : `${imageUrl}?t=${Date.now()}`;
      await addImage(finalUrl, chartOptions);
    }

    // 如果需要优化且有pictogram，先进行优化计算
    let optimizedPictogramOptions = null;
    if (shouldOptimize && selectedPictograms && selectedPictograms.length > 0) {
      try {
        // 开始优化，显示loading
        if (setIsOptimizing) {
          setIsOptimizing(true);
        }
        
        // 临时添加title以获取chart+title的bounds
        const titleUrl = titleImage ? `/currentfilepath/${titleImage}?t=${Date.now()}` : null;
        let tempTitleObject = null;
        if (titleUrl) {
          tempTitleObject = await addImage(titleUrl, titleOptions);
          
          // 应用title的自动调整逻辑
          if (tempTitleObject && canvas.getObjects().length > 1) {
            const chartObject = canvas.getObjects()[0];
            if (chartObject) {
              const chartBounds = chartObject.getBoundingRect();
              const resolvedChartBounds = {
                left: chartBounds.left,
                top: chartBounds.top,
                right: chartBounds.left + chartBounds.width,
                bottom: chartBounds.top + chartBounds.height
              };
              
              // 使用相同的title调整逻辑
              if (titleOptions.layoutInfo && titleOptions.layoutInfo.chartWidth) {
                const layoutInfo = titleOptions.layoutInfo;
                const actualChartWidth = resolvedChartBounds.right - resolvedChartBounds.left;
                const widthRatio = layoutInfo.boxWidth / layoutInfo.chartWidth;
                const desiredTitleWidth = actualChartWidth * widthRatio;
                const currentWidth = Math.max(1, tempTitleObject.getScaledWidth());
                if (currentWidth > 0 && desiredTitleWidth > 0) {
                  const scaleFactor = desiredTitleWidth / currentWidth;
                  tempTitleObject.scaleX = (tempTitleObject.scaleX || 1) * scaleFactor;
                  tempTitleObject.scaleY = (tempTitleObject.scaleY || 1) * scaleFactor;
                  tempTitleObject.setCoords();
                }
                const TITLE_CHART_PADDING = 20;
                const titleHeight = tempTitleObject.getScaledHeight();
                const chartCenterX = (resolvedChartBounds.left + resolvedChartBounds.right) / 2;
                const chartTop = resolvedChartBounds.top;
                const desiredTitleCenterY = chartTop - TITLE_CHART_PADDING - titleHeight / 2;
                const minTitleCenterY = titleHeight / 2 + 10;
                tempTitleObject.set({
                  left: chartCenterX,
                  top: Math.max(minTitleCenterY, desiredTitleCenterY)
                });
                tempTitleObject.setCoords();
              }
            }
          }
        }
        
        // 获取chart+title的图片用于优化
        const chartWithTitleResult = await getChartWithTitleImage(canvas);
        
        // 移除临时的title
        if (tempTitleObject) {
          canvas.remove(tempTitleObject);
        }
        
        if (chartWithTitleResult) {
          const { dataUrl, bounds } = chartWithTitleResult;
          const pName = selectedPictograms[0];
          const picUrl = `/currentfilepath/${pName}?t=${Date.now()}`;
          
          // 加载pictogram图片并转换为base64
          const pictogramBase64 = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = img.width;
              tempCanvas.height = img.height;
              const ctx = tempCanvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              resolve(tempCanvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = picUrl;
          });
          
          // 调用后端优化API
          const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://127.0.0.1:5185' 
            : `http://${window.location.hostname}:5185`;
          
          const apiUrl = `${backendUrl}/api/optimize_image_position`;
          console.log('[DEBUG] 正在调用优化API:', apiUrl);
          
          const optimizeRes = await axios.post(apiUrl, {
            chart_with_title_image: dataUrl,
            pictogram_image: pictogramBase64,
            canvas_width: canvas.width,
            canvas_height: canvas.height
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (optimizeRes.data.success) {
            const { image_size, image_x, image_y } = optimizeRes.data;
            const canvasX = bounds.left + image_x;
            const canvasY = bounds.top + image_y;
            
            optimizedPictogramOptions = {
              left: canvasX,
              top: canvasY,
              maxWidth: image_size,
              maxHeight: image_size,
              originX: 'left',
              originY: 'top'
            };
            
            console.log('[DEBUG] 优化计算完成，pictogram位置:', optimizedPictogramOptions);
          }
        }
      } catch (error) {
        console.warn('优化失败，将使用默认位置:', error);
      }
    }

    // Add or Update Title
    if (titleImage) {
      const titleUrl = `/currentfilepath/${titleImage}?t=${Date.now()}`;
      let titleObject;
      
      // 如果保留位置且canvas上已有title对象（第二个对象），则更新它
      if (preservePositions && canvas.getObjects().length >= 2) {
        const existingTitle = canvas.getObjects()[1];
        console.log('[DEBUG] 更新现有title对象');
        try {
          await updateImageObject(existingTitle, titleUrl);
          titleObject = existingTitle;
        } catch (error) {
          console.error('[ERROR] 更新title失败，回退到重新添加:', error);
          // 更新失败时，移除旧对象并添加新的
          canvas.remove(existingTitle);
          titleObject = await addImage(titleUrl, titleOptions);
        }
      } else {
        // 否则添加新的title
        titleObject = await addImage(titleUrl, titleOptions);
        
        // 如果保留位置且有保存的title位置，直接恢复
        if (preservePositions && currentPositions.title && titleObject) {
          titleObject.set({
            left: currentPositions.title.left,
            top: currentPositions.title.top,
            scaleX: currentPositions.title.scaleX,
            scaleY: currentPositions.title.scaleY,
            angle: currentPositions.title.angle,
            originX: currentPositions.title.originX,
            originY: currentPositions.title.originY
          });
          titleObject.setCoords();
          console.log('[DEBUG] 恢复title位置:', currentPositions.title);
        }
      }
      
      // Auto-adjust title position and size relative to chart
      // 但如果我们保留了位置（preservePositions=true），就不要自动调整
      const shouldAdjustTitle = !preservePositions || !currentPositions.title;
      if (titleObject && canvas.getObjects().length > 1 && shouldAdjustTitle) {
        const chartObject = canvas.getObjects()[0];
        if (chartObject) {
          const chartBounds = chartObject.getBoundingRect();
          const resolvedChartBounds = {
            left: chartBounds.left,
            top: chartBounds.top,
            right: chartBounds.left + chartBounds.width,
            bottom: chartBounds.top + chartBounds.height
          };
          
          // 如果有layout信息，使用layout中的宽度比例
          console.log('[DEBUG] titleOptions.layoutInfo:', titleOptions.layoutInfo);
          if (titleOptions.layoutInfo && titleOptions.layoutInfo.chartWidth) {
            const layoutInfo = titleOptions.layoutInfo;
            const actualChartWidth = resolvedChartBounds.right - resolvedChartBounds.left;
            
            // 计算layout中title和chart的宽度比例
            const widthRatio = layoutInfo.boxWidth / layoutInfo.chartWidth;
            
            console.log('[DEBUG] 使用layout宽度比例:', {
              layoutInfo,
              actualChartWidth,
              widthRatio,
              desiredTitleWidth: actualChartWidth * widthRatio
            });
            
            // 根据实际chart宽度和比例计算title应该的宽度
            const desiredTitleWidth = actualChartWidth * widthRatio;
            
            const currentWidth = Math.max(1, titleObject.getScaledWidth());
            if (currentWidth > 0 && desiredTitleWidth > 0) {
              const scaleFactor = desiredTitleWidth / currentWidth;
              titleObject.scaleX = (titleObject.scaleX || 1) * scaleFactor;
              titleObject.scaleY = (titleObject.scaleY || 1) * scaleFactor;
              titleObject.setCoords();
            }
            
            // 调整title位置：使其与chart的boundingBox保持20px的padding
            const TITLE_CHART_PADDING = 20;
            const titleHeight = titleObject.getScaledHeight();
            const chartCenterX = (resolvedChartBounds.left + resolvedChartBounds.right) / 2;
            const chartTop = resolvedChartBounds.top;
            
            // title的中心点应该在：chart顶部 - padding - title高度的一半
            const desiredTitleCenterY = chartTop - TITLE_CHART_PADDING - titleHeight / 2;
            const minTitleCenterY = titleHeight / 2 + 10; // 距离顶部至少10px
            
            titleObject.set({
              left: chartCenterX,
              top: Math.max(minTitleCenterY, desiredTitleCenterY)
            });
            titleObject.setCoords();
          } else {
            // 使用原有的自动调整逻辑（没有layout信息时的fallback）
            console.log('[DEBUG] 没有layout信息，使用默认宽度比例');
            const titlePaddingValue = canvas.height * TITLE_PADDING_RATIO;
            const chartWidth = resolvedChartBounds.right - resolvedChartBounds.left;
            const currentWidth = Math.max(1, titleObject.getScaledWidth());
            const currentHeight = Math.max(1, titleObject.getScaledHeight());
            const titleAspectRatio = currentWidth / currentHeight;
            const desiredWidthRatio = titleAspectRatio < TITLE_ASPECT_THRESHOLD
              ? TITLE_COMPACT_WIDTH_RATIO
              : TITLE_WIDE_WIDTH_RATIO;
            const desiredWidth = chartWidth * desiredWidthRatio;
            
            console.log('[DEBUG] 使用默认宽度比例:', {
              titleAspectRatio,
              desiredWidthRatio,
              chartWidth,
              desiredWidth
            });
            
            if (currentWidth > 0 && desiredWidth > 0) {
              const scaleFactor = desiredWidth / currentWidth;
              titleObject.scaleX = (titleObject.scaleX || 1) * scaleFactor;
              titleObject.scaleY = (titleObject.scaleY || 1) * scaleFactor;
              titleObject.setCoords();
            }
            
            const trimmedWidth = titleObject.getScaledWidth();
            const trimmedHeight = titleObject.getScaledHeight();
            const chartCenterX = (resolvedChartBounds.left + resolvedChartBounds.right) / 2;
            const chartTop = resolvedChartBounds.top;
            const paddingPx = titlePaddingValue;
            const minTitleCenterY = MIN_TITLE_CENTER_Y_OFFSET + trimmedHeight / 2;
            const desiredTop = chartTop - paddingPx - trimmedHeight / 2;
            
            titleObject.set({
              left: chartCenterX,
              top: Math.max(minTitleCenterY, desiredTop)
            });
            titleObject.setCoords();
          }
        }
      }
    }

    // Add or Update Pictograms (使用之前优化计算好的位置)
    if (selectedPictograms && selectedPictograms.length > 0) {
      console.log('[DEBUG] Adding/updating pictograms:', {
        count: selectedPictograms.length,
        preservePositions,
        optimizedPictogramOptions: !!optimizedPictogramOptions,
        canvasObjectCount: canvas.getObjects().length
      });
      
      for (let i = 0; i < selectedPictograms.length; i++) {
        const pName = selectedPictograms[i];
        const picUrl = `/currentfilepath/${pName}?t=${Date.now()}`;
        
        // 如果保留位置且canvas上已有对应的pictogram对象，则更新它
        const pictogramIndex = 2 + i; // pictogram从第3个对象开始
        if (preservePositions && canvas.getObjects().length > pictogramIndex) {
          const existingPictogram = canvas.getObjects()[pictogramIndex];
          console.log('[DEBUG] 更新现有pictogram对象', i);
          try {
            await updateImageObject(existingPictogram, picUrl);
          } catch (error) {
            console.error('[ERROR] 更新pictogram失败，回退到重新添加:', error);
            // 更新失败时，移除旧对象并添加新的
            canvas.remove(existingPictogram);
            const currentOptions = { ...imageOptions };
            currentOptions.maxWidth = FIXED_PICTOGRAM_SIZE;
            currentOptions.maxHeight = FIXED_PICTOGRAM_SIZE;
            await addImage(picUrl, currentOptions);
          }
        } else {
          // 否则添加新的pictogram
          let currentOptions;
          
          if (preservePositions && currentPositions.pictograms[i]) {
            // 保留之前的位置
            currentOptions = { ...currentPositions.pictograms[i] };
          } else if (i === 0 && optimizedPictogramOptions) {
            // 使用优化后的位置
            currentOptions = optimizedPictogramOptions;
          } else {
            // 使用默认位置
            currentOptions = { ...imageOptions };
            currentOptions.maxWidth = FIXED_PICTOGRAM_SIZE;
            currentOptions.maxHeight = FIXED_PICTOGRAM_SIZE;
            if (i > 0) {
              currentOptions.left = (currentOptions.left || 0) + i * 20;
              currentOptions.top = (currentOptions.top || 0) + i * 20;
            }
          }
          
          console.log('[DEBUG] Adding pictogram', i, 'with options:', currentOptions);
          try {
            await addImage(picUrl, currentOptions);
          } catch (error) {
            console.error('[ERROR] Failed to add pictogram', i, ':', error);
            throw error;
          }
        }
      }
    }

    canvas.renderAll();
    
    // 渲染完成后关闭优化loading
    if (setIsOptimizing) {
      // 延迟一点点关闭，确保渲染已完成
      setTimeout(() => setIsOptimizing(false), 100);
    }
    
    return { success: true };
  } catch (err) {
    console.error('Error loading chart to canvas:', err);
    throw err;
  }
}

export function downloadCanvas(canvas) {
  if (!canvas) return;
  const objects = canvas.getObjects().filter(obj => obj.visible);
  if (!objects.length) {
    alert('画布中没有可导出的元素');
    return;
  }

  const padding = 16;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  objects.forEach(obj => {
    const rect = obj.getBoundingRect(true, true);
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  });

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    alert('无法计算画布范围，请重试');
    return;
  }

  const exportLeft = Math.floor(minX - padding);
  const exportTop = Math.floor(minY - padding);
  const exportWidth = Math.max(Math.ceil(maxX - minX + padding * 2), 1);
  const exportHeight = Math.max(Math.ceil(maxY - minY + padding * 2), 1);

  const dataUrl = canvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: 2,
    left: exportLeft,
    top: exportTop,
    width: exportWidth,
    height: exportHeight,
    enableRetinaScaling: true
  });

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `workbench_canvas_${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

