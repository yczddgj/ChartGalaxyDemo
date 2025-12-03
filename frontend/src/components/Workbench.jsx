import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { fabric } from 'fabric';
import './Workbench.css';

// 导入新创建的 hooks
import { useHistory } from './hooks/useHistory';
import { useCanvas } from './hooks/useCanvas';
import { useChartData } from './hooks/useChartData';
import { useAssets } from './hooks/useAssets';

// 导入工具函数
import { loadChartToCanvas as loadChartToCanvasUtil } from './utils/canvasUtils';

// 导入组件
import { Sidebar } from './WorkbenchComponents/Sidebar';
import { CanvasControls } from './WorkbenchComponents/CanvasControls';
import { DataPreviewModal } from './WorkbenchComponents/DataPreviewModal';
import { RefinedImageModal } from './WorkbenchComponents/RefinedImageModal';

// 导入常量
import { DEFAULT_PROMPT } from './constants';

function Workbench() {
  // ========== 基础状态 ==========
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [layoutNeedsFreshLoad, setLayoutNeedsFreshLoad] = useState(false);

  // ========== 使用 Hooks ==========
  
  // History hook - 需要先初始化，因为 useCanvas 需要它
  const {
    snapshotCount,
    historyRef,
    handleUndo,
    handleRedo,
    handleDelete,
    clearSnapshots,
    saveCanvasState,
    setCanvas: setCanvasInHistory
  } = useHistory();

  // Canvas hook - 需要 historyRef 和 saveCanvasState
  const {
    canvas,
    setCanvas,
    hasSelection,
    canvasRef,
    mainPreviewRef,
    canvasWrapperRef,
    resetPanOffsets,
    scrollMainPreviewToCenter
  } = useCanvas(saveCanvasState, handleUndo, handleRedo);

  // 同步 canvas 到 useHistory
  useEffect(() => {
    if (canvas) {
      setCanvasInHistory(canvas);
    }
  }, [canvas, setCanvasInHistory]);

  // Chart Data hook
  const {
    chartTypes,
    totalChartTypes,
    selectedChartType,
    chartTypePage,
    chartTypesLoading,
    chartTypesLoadingText,
    variations,
    totalVariations,
    selectedVariation,
    variationPage,
    variationLoading,
    variationLoadingText,
    references,
    totalReferences,
    selectedReference,
    referencePage,
    referenceProcessing,
    referenceProcessingText,
    setReferenceProcessing,
    setReferenceProcessingText,
    setChartTypePage,
    fetchChartTypes,
    handleChartTypeNext,
    handleChartTypeSelect,
    setVariationPage,
    fetchVariations,
    handleVariationNext,
    handleVariationSelect,
    setSelectedReference,
    setReferencePage,
    fetchReferences,
    handleReferenceNext,
    resetChartData,
    pollStatus
  } = useChartData();

  // Assets hook
  const {
    titleImage,
    setTitleImage,
    selectedPictograms,
    setSelectedPictograms,
    titleOptions,
    setTitleOptions,
    pictogramOptions,
    setPictogramOptions,
    titleLoading,
    titleLoadingText,
    pictogramLoading,
    pictogramLoadingText,
    previewTimestamp,
    generateTitle,
    regenerateTitle,
    generatePictogram,
    regeneratePictogram,
    resetAssets
  } = useAssets(selectedFile, pollStatus, selectedVariation);

  // ========== 其他状态 ==========
  const [sidebarView, setSidebarView] = useState('config');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [editConfig, setEditConfig] = useState({
    colorScheme: 'default',
    textSize: 'medium',
    textStyle: 'normal',
    prompt: DEFAULT_PROMPT
  });
  const [isRefining, setIsRefining] = useState(false);
  const [refinedImages, setRefinedImages] = useState([]);
  const [showRefinedModal, setShowRefinedModal] = useState(false);
  const [selectedRefinedImage, setSelectedRefinedImage] = useState(null);
  const [savedPositions, setSavedPositions] = useState({
    chart: null,
    title: null,
    pictograms: []
  });
  const [isOptimizing, setIsOptimizing] = useState(false); // 优化布局的loading状态
  const loadTimeoutRef = useRef(null); // 防抖定时器
  const isLoadingRef = useRef(false); // 跟踪是否正在加载，用于防止并发

  // --- Initialization ---
  useEffect(() => {
    // Fetch Files
    axios.get('/api/files')
      .then(res => setCsvFiles(res.data.files))
      .catch(err => console.error(err));
  }, []);

  // --- Logic: Data Selection ---
  const handleFileSelect = async (e) => {
    const file = e.target.value;

    // Reset downstream state using hooks
    resetChartData();
    resetAssets();
    clearSnapshots();

    // Clear canvas when switching data
    if (canvas) {
      canvas.clear();
      canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
      setBgColor('#ffffff');
      const canvasWrapper = document.querySelector('.canvas-wrapper');
      if (canvasWrapper) {
        canvasWrapper.style.backgroundColor = '#ffffff';
      }
    }

    // Reset saved positions
    setSavedPositions({ chart: null, title: null, pictograms: [] });

    setSelectedFile(file);
    if (file) {
      setLoading(true);
      setLoadingText('Analyzing data...');
      try {
        // Start finding references/chart types
        await axios.get(`/api/start_find_reference/${file}`);
        pollStatus(() => {
            fetchChartTypes();
        }, 'find_reference');
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }
  };

  // --- Logic: Data Preview ---
  const handleDataPreview = async () => {
    if (!selectedFile) {
      alert('请先选择数据集');
            return;
        }

    try {
      setLoading(true);
      setLoadingText('Loading data preview...');
      const response = await axios.get(`/api/data/preview/${selectedFile}`);
      setPreviewData(response.data);
      setShowDataPreview(true);
      } catch (err) {
      console.error('Failed to load data preview:', err);
      alert('无法加载数据预览');
    } finally {
        setLoading(false);
      }
  };


  // --- Logic: Chart Types ---
  // 注意：fetchChartTypes, handleChartTypeNext, handleChartTypeSelect 等函数
  // 现在由 useChartData hook 提供，不再需要在这里定义
  
  // 保留这些辅助函数，因为它们可能被其他地方使用
  // 检查图片是否存在
  const checkImageExists = (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // 设置超时，避免长时间等待
      setTimeout(() => resolve(false), 3000);
    });
  };

  // 验证并过滤 chart types，只保留图片存在的
  const validateChartTypes = async (chartTypes) => {
    setLoadingText('Validating chart type images...');
    const validatedTypes = [];
    
    for (const type of chartTypes) {
      const imageUrl = type.image_url || `/static/chart_types/${type.type}.png`;
      const exists = await checkImageExists(imageUrl);
      if (exists) {
        validatedTypes.push(type);
      }
    }
    
    return validatedTypes;
  };

  // 合并使用相同图片的 chart types
  const mergeChartTypesByImage = (chartTypes) => {
    const imageMap = {}; // image_url -> [chart types]
    
    // 按图片分组
    for (const type of chartTypes) {
      const imageUrl = type.image_url || `/static/chart_types/${type.type}.png`;
      if (!imageMap[imageUrl]) {
        imageMap[imageUrl] = [];
      }
      imageMap[imageUrl].push(type);
    }
    
    // 合并相同图片的 chart types
    const mergedTypes = [];
    for (const [imageUrl, types] of Object.entries(imageMap)) {
      if (types.length === 1) {
        // 只有一个 chart type，直接添加
        mergedTypes.push(types[0]);
      } else {
        // 多个 chart types 使用同一张图片，合并
        // 使用第一个作为主要类型，但保留所有类型信息
        const primaryType = types[0];
        mergedTypes.push({
          ...primaryType,
          type: types.map(t => t.type).join(' / '), // 合并名称，用 " / " 分隔
          mergedTypes: types.map(t => t.type), // 保存所有合并的类型名称
          image_url: imageUrl
        });
      }
    }
    
    return mergedTypes;
  };

  // 旧的 fetchChartTypes 函数已删除，现在使用 useChartData hook 提供的版本
  const _old_fetchChartTypes = async () => {
    setChartTypesLoading(true);
    setChartTypesLoadingText('Recommending chart types...');
    try {
      // 先获取第一页，了解总数
      const firstRes = await axios.get('/api/chart_types');
      const total = firstRes.data.total;
      let allChartTypes = [...firstRes.data.chart_types];
      
      // 如果总数大于第一页的数量，继续获取剩余页
      if (total > allChartTypes.length) {
        setChartTypesLoadingText(`Recommending chart types... (${allChartTypes.length}/${total})`);
        // 循环获取所有页，直到获取完所有数据
        let attempts = 0;
        const maxAttempts = Math.ceil(total / 3) + 2; // 防止无限循环
        
        while (allChartTypes.length < total && attempts < maxAttempts) {
          attempts++;
          const nextRes = await axios.get('/api/chart_types/next');
          if (nextRes.data.chart_types && nextRes.data.chart_types.length > 0) {
            // 避免重复添加
            const newItems = nextRes.data.chart_types.filter(
              item => !allChartTypes.some(existing => existing.type === item.type)
            );
            if (newItems.length > 0) {
              allChartTypes = [...allChartTypes, ...newItems];
              setChartTypesLoadingText(`Recommending chart types... (${allChartTypes.length}/${total})`);
            } else {
              // 没有新数据了，可能已经获取完
              break;
            }
          } else {
            break; // 没有更多数据了
          }
        }
      }
      
      // 预先验证所有图片，过滤掉不存在的
      setChartTypesLoadingText('Validating chart type images...');
      const validatedTypes = await validateChartTypes(allChartTypes);
      
      // 合并使用相同图片的 chart types
      setChartTypesLoadingText('Merging chart types...');
      const mergedTypes = mergeChartTypesByImage(validatedTypes);
      
      setTotalChartTypes(mergedTypes.length);
      setChartTypes(mergedTypes);
      setChartTypesLoading(false);
    } catch (err) {
      console.error(err);
      setChartTypesLoading(false);
    }
  };

  const loadMoreChartTypes = async (onSuccess) => {
    setChartTypesLoading(true);
    setChartTypesLoadingText('Loading more chart types...');
    try {
        const res = await axios.get('/api/chart_types/next');
        if (res.data.chart_types && res.data.chart_types.length > 0) {
            // 预先验证新加载的图片，过滤掉不存在的
            const validatedNewItems = await validateChartTypes(res.data.chart_types);
            
            setChartTypes(prev => {
                // 合并新数据和已有数据
                const allTypes = [...prev, ...validatedNewItems];
                // 重新合并所有类型（包括新加载的）
                const mergedAll = mergeChartTypesByImage(allTypes);
                setTotalChartTypes(mergedAll.length);
                return mergedAll;
            });
            
                if (onSuccess) onSuccess();
        }
        setChartTypesLoading(false);
    } catch (err) {
        console.error(err);
        setChartTypesLoading(false);
    }
  };

  // --- Logic: Variations / References / Assets ---

  // 监听variation变化，设置需要重新布局
  useEffect(() => {
    if (selectedVariation) {
      console.log('[DEBUG] selectedVariation changed to:', selectedVariation, '- setting layoutNeedsFreshLoad = true');
      setLayoutNeedsFreshLoad(true);
    }
  }, [selectedVariation]);

  const handleReferenceSelect = async (refName) => {
    // Reset downstream state
    setTitleImage('');
    setSelectedPictograms('');
    setTitleOptions([]);
    setPictogramOptions([]);
    setSavedPositions({ chart: null, title: null, pictograms: [] });
    setLayoutNeedsFreshLoad(true);

    setSelectedReference(refName);
    setReferenceProcessing(true);
    setReferenceProcessingText('Extracting style...');
    try {
      const dataName = selectedFile.replace('.csv', '');
      // 1. Extract Layout/Style
      await axios.get(`/api/start_layout_extraction/${refName}/${dataName}`);
      
      pollStatus(async () => {
          setReferenceProcessing(false);
          // 2. Generate Title
          await generateTitle();
      }, 'layout_extraction', false);
    } catch (err) {
      console.error(err);
      setReferenceProcessing(false);
    }
  };

  const loadMoreReferencesData = async (onSuccess) => {
    setLoading(true);
    setLoadingText('Loading more references...');
    try {
        const res = await axios.get('/api/references/next');
        const { random_images } = res.data;
        const newRefs = (random_images || []).filter(Boolean);
        
        if (newRefs.length > 0) {
            setReferences(prev => {
                const newItems = newRefs.filter(item => !prev.includes(item));
                return [...prev, ...newItems];
            });
            if (onSuccess) onSuccess();
        } else {
            // No more items
        }
        setLoading(false);
    } catch (err) {
        console.error(err);
        setLoading(false);
    }
  };

  // Auto-reload canvas when assets change (with debounce)
  useEffect(() => {
      console.log('[DEBUG] Auto-reload useEffect triggered:', { selectedVariation, titleImage, selectedPictograms, canvas: !!canvas, layoutNeedsFreshLoad });
      
      if (!canvas || !selectedVariation || (!titleImage && !selectedPictograms)) {
          return undefined;
      }
      
      // 清除之前的定时器
      if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
      }
      
      // 根据layoutNeedsFreshLoad决定是否保留位置
      const shouldPreservePositions = !layoutNeedsFreshLoad;
      
      // 使用防抖：快速切换时只执行最后一次
      // 切换title/pictogram时使用较短的延迟（300ms），切换variation时立即执行
      const debounceDelay = shouldPreservePositions ? 300 : 0;
      
      let cancelled = false;
      
      loadTimeoutRef.current = setTimeout(async () => {
          // 如果已经有操作在进行，跳过本次
          if (isLoadingRef.current) {
              console.log('[DEBUG] Skipping load because another operation is in progress');
              return;
          }
          
          console.log('[DEBUG] Loading canvas with preservePositions=', shouldPreservePositions);
          
          isLoadingRef.current = true;
          
          try {
              await loadChartToCanvas(
                  selectedVariation,
                  `/currentfilepath/variation_${selectedVariation}.png`,
                  shouldPreservePositions
              );
              
              if (!cancelled && layoutNeedsFreshLoad) {
                  setLayoutNeedsFreshLoad(false);
              }
          } catch (error) {
              console.error('[ERROR] loadChartToCanvas failed:', error);
          } finally {
              isLoadingRef.current = false;
          }
      }, debounceDelay);
      
      return () => {
          cancelled = true;
          if (loadTimeoutRef.current) {
              clearTimeout(loadTimeoutRef.current);
          }
      };
  }, [canvas, selectedVariation, titleImage, selectedPictograms]);
  // 注意：titleImage和selectedPictograms的变化会触发重新加载，但会保留位置（preservePositions=true）

  // Auto-load refinement history when both title and pictogram are available
  useEffect(() => {
      const loadRefinementHistory = async () => {
          // Only load history if we have all required materials
          if (!titleImage || !selectedPictograms || !selectedVariation) {
              return;
          }

          console.log('Loading refinement history for materials:', {
              titleImage,
              pictogram: selectedPictograms,
              chart_type: selectedVariation
          });

          try {
              const response = await axios.post('/api/material_history', {
                  title: titleImage,
                  pictogram: selectedPictograms,
                  chart_type: selectedVariation
              });

              if (response.data.found && response.data.versions && response.data.versions.length > 0) {
                  console.log(`Found ${response.data.total_versions} historical versions`);

                  // Convert versions to refinedImages format
                  const historyImages = response.data.versions.map(version => ({
                      url: `/${version.url}?t=${Date.now()}`,
                      timestamp: new Date(version.timestamp).getTime(),
                      version: version.version,
                      fromHistory: true
                  }));

                  // Set the refined images with history
                  setRefinedImages(historyImages);

                  console.log('Loaded refinement history:', historyImages.length, 'images');
              } else {
                  console.log('No refinement history found for these materials');
                  // Clear refined images if no history
                  setRefinedImages([]);
              }
          } catch (error) {
              console.error('Failed to load refinement history:', error);
              // Don't clear images on error, keep existing state
          }
      };

      loadRefinementHistory();
  }, [titleImage, selectedPictograms, selectedVariation]);

  // Debug函数：输出所有canvas元素的坐标信息
  const debugCanvasElements = () => {
      console.log('[DEBUG] debugCanvasElements called');
      console.log('[DEBUG] canvas:', canvas);
      
      if (!canvas) {
          console.log('[DEBUG] Canvas is not initialized');
          return;
      }
      
      const objects = canvas.getObjects();
      console.log('[DEBUG] canvas.getObjects():', objects);
      
      if (objects.length === 0) {
          console.log('[DEBUG] Canvas is empty, no objects found');
          return;
      }
      
      console.log('[DEBUG] Found', objects.length, 'objects');
      console.log('=== Canvas Elements Coordinates Debug ===');
      console.log(`Total objects: ${objects.length}`);
      
      objects.forEach((obj, index) => {
          const bounds = obj.getBoundingRect();
          const elementInfo = {
              index: index,
              type: obj.type || 'unknown',
              left: Math.round(obj.left || 0),
              top: Math.round(obj.top || 0),
              width: Math.round(obj.width * (obj.scaleX || 1)),
              height: Math.round(obj.height * (obj.scaleY || 1)),
              scaleX: obj.scaleX || 1,
              scaleY: obj.scaleY || 1,
              originX: obj.originX || 'left',
              originY: obj.originY || 'top',
              boundingRect: {
                  left: Math.round(bounds.left),
                  top: Math.round(bounds.top),
                  width: Math.round(bounds.width),
                  height: Math.round(bounds.height),
                  right: Math.round(bounds.left + bounds.width),
                  bottom: Math.round(bounds.top + bounds.height)
              }
          };
          
          // 根据索引推断元素类型
          if (index === 0) {
              elementInfo.elementType = 'Chart';
              console.log('📊 Chart:', elementInfo);
          } else if (index === 1) {
              elementInfo.elementType = 'Title';
              console.log('📝 Title:', elementInfo);
          } else {
              elementInfo.elementType = `Pictogram ${index - 1}`;
              console.log(`🖼️  ${elementInfo.elementType}:`, elementInfo);
          }
      });
      
      // 输出布局信息摘要
      if (objects.length > 0) {
          const chart = objects[0];
          const chartBounds = chart.getBoundingRect();
          console.log('\n--- Layout Summary ---');
          console.log('Chart:', {
              center: { x: Math.round(chart.left), y: Math.round(chart.top) },
              bounds: {
                  left: Math.round(chartBounds.left),
                  top: Math.round(chartBounds.top),
                  right: Math.round(chartBounds.left + chartBounds.width),
                  bottom: Math.round(chartBounds.top + chartBounds.height)
              }
          });
          
          if (objects.length > 1) {
              const title = objects[1];
              const titleBounds = title.getBoundingRect();
              const spacing = Math.round(titleBounds.bottom - chartBounds.top);
              console.log('Title:', {
                  center: { x: Math.round(title.left), y: Math.round(title.top) },
                  bounds: {
                      left: Math.round(titleBounds.left),
                      top: Math.round(titleBounds.top),
                      right: Math.round(titleBounds.left + titleBounds.width),
                      bottom: Math.round(titleBounds.top + titleBounds.height)
                  },
                  spacingToChart: spacing
              });
          }
          
          if (objects.length > 2) {
              objects.slice(2).forEach((pictogram, idx) => {
                  const picBounds = pictogram.getBoundingRect();
                  console.log(`Pictogram ${idx + 1}:`, {
                      center: { x: Math.round(pictogram.left), y: Math.round(pictogram.top) },
                      bounds: {
                          left: Math.round(picBounds.left),
                          top: Math.round(picBounds.top),
                          right: Math.round(picBounds.left + picBounds.width),
                          bottom: Math.round(picBounds.top + picBounds.height)
                      },
                      insideChart: picBounds.left >= chartBounds.left && 
                                 picBounds.right <= chartBounds.right &&
                                 picBounds.top >= chartBounds.top &&
                                 picBounds.bottom <= chartBounds.bottom
                  });
              });
          }
      }
      console.log('=== End Debug Output ===\n');
  };

  // Wrapper for loadChartToCanvasUtil that handles loading state
  const loadChartToCanvas = async (variationName, directUrl = null, preservePositions = false) => {
      if (!canvas || !selectedFile) return;
      setLoading(true);
      setLoadingText('Updating canvas...');
      
      try {
        await loadChartToCanvasUtil({
          canvas,
          variationName,
          selectedFile,
          titleImage,
          selectedPictograms,
          savedPositions,
          setSavedPositions,
          bgColor,
          setBgColor,
          directUrl,
          preservePositions,
          setIsOptimizing  // 传递优化loading状态的setter
        });
        
        // Save initial canvas state after loading
        saveCanvasState();
        
              setLoading(false);
      } catch (err) {
        console.error('Failed to load chart to canvas:', err);
          setLoading(false);
      }
  };

  const handleDownloadCanvas = async () => {
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

    const tempCanvas = new fabric.StaticCanvas(null, {
      width: exportWidth,
      height: exportHeight,
      backgroundColor: canvas.backgroundColor || '#ffffff'
    });

    try {
      // Clone objects into temporary canvas, offsetting by exportLeft/top
      const clonePromises = objects.map(obj => {
        return new Promise(resolve => {
          obj.clone(clone => {
            clone.set({
              left: clone.left - exportLeft,
              top: clone.top - exportTop,
              evented: false,
              selectable: false
            });
            tempCanvas.add(clone);
            resolve();
          });
        });
      });

      await Promise.all(clonePromises);
      tempCanvas.renderAll();

      const dataUrl = tempCanvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 2,
        enableRetinaScaling: true
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `workbench_canvas_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export canvas:', error);
      alert('导出失败，请稍后重试');
      } finally {
      tempCanvas.dispose();
      }
  };

  // --- Background Color Management ---
  const handleBgColorChange = (color) => {
      if (!canvas) return;
      setBgColor(color);
      canvas.setBackgroundColor(color, canvas.renderAll.bind(canvas));
      
      // Also apply to canvas wrapper
      const canvasWrapper = document.querySelector('.canvas-wrapper');
      if (canvasWrapper) {
          canvasWrapper.style.backgroundColor = color;
      }
  };

  // --- Redo Functionality (Reset Reference Selection) ---
  const handleRedoReset = () => {
    // 清空参考图片选择
    setSelectedReference('');
    
    // 清空参考图片处理状态
    setReferenceProcessing(false);
    setReferenceProcessingText('');
    
    // 清空所有相关的资源和结果
    resetAssets();
    
    // 清空精修图片历史
    setRefinedImages([]);
    setSelectedRefinedImage(null);
    
    // 清空保存的位置
    setSavedPositions({ chart: null, title: null, pictograms: [] });
    
    // 清空画布
    if (canvas) {
      canvas.clear();
      canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
      setBgColor('#ffffff');
      const canvasWrapper = document.querySelector('.canvas-wrapper');
      if (canvasWrapper) {
        canvasWrapper.style.backgroundColor = '#ffffff';
      }
    }
    
    // 重置布局标志
    setLayoutNeedsFreshLoad(false);
  };

  // --- Refine Functionality ---
  const handleRefine = async () => {
      if (!canvas) {
          alert('Canvas not initialized');
          return;
      }
      
      setIsRefining(true);
      setLoading(true);
      setLoadingText('正在使用 AI 精修信息图表...');
      
      try {
          // Export full canvas to PNG base64 (2x resolution)
          const pngDataURL = canvas.toDataURL({
              format: 'png',
              quality: 1,
              multiplier: 2
          });
          
          // Get background color for backend processing
          const backgroundColor = canvas.backgroundColor || '#ffffff';
          
          // Send to backend for refinement with auto-cropping
          // Include material information for caching
          console.log('[DEBUG] AI精修参数:', {
              title: titleImage,
              pictogram: selectedPictograms || '',
              chart_type: selectedVariation,
              force_regenerate: true
          });
          
          const response = await axios.post('/api/export_final', {
              png_base64: pngDataURL,
              background_color: backgroundColor,
              title: titleImage,
              pictogram: selectedPictograms || '',
              chart_type: selectedVariation,
              force_regenerate: true  // Always generate new version for AI refine button
          });
          
          if (response.data.status === 'started') {
              // Poll for completion
              await pollRefinementStatus();
          } else {
              throw new Error(response.data.error || '生成失败');
          }
          
      } catch (error) {
          console.error('Refine failed:', error);
          alert('精修失败: ' + error.message);
      } finally {
          setIsRefining(false);
          setLoading(false);
      }
  };
  
  const pollRefinementStatus = async () => {
      const maxAttempts = 120; // Max 2 minutes
      let attempts = 0;
      
      while (attempts < maxAttempts) {
          try {
              const response = await axios.get('/api/status');
              const status = response.data;
              
              // Update loading text with progress
              if (status.progress) {
                  setLoadingText(status.progress);
              }
              
              if (status.step === 'final_export' && status.completed) {
                  if (status.status === 'completed') {
                      // Success! Reload the refinement history to get the new version
                      console.log('Refinement completed, reloading history...');

                      // Reload history after successful refinement
                      try {
                          const historyResponse = await axios.post('/api/material_history', {
                              title: titleImage,
                              pictogram: selectedPictograms || '',
                              chart_type: selectedVariation
                          });

                          if (historyResponse.data.found && historyResponse.data.versions && historyResponse.data.versions.length > 0) {
                              const historyImages = historyResponse.data.versions.map(version => ({
                                  url: `/${version.url}?t=${Date.now()}`,
                                  timestamp: new Date(version.timestamp).getTime(),
                                  version: version.version,
                                  fromHistory: true
                              }));

                              setRefinedImages(historyImages);
                              console.log('Reloaded history:', historyImages.length, 'images');
                          }
                      } catch (historyError) {
                          console.error('Failed to reload history:', historyError);
                          // Fallback: add just the new image
                      const refinedUrl = `/api/download_final?t=${Date.now()}`;
                      setRefinedImages(prev => [...prev, {
                          url: refinedUrl,
                          timestamp: Date.now()
                      }]);
                      }

                      return;
                  } else if (status.status === 'error') {
                      throw new Error(status.progress || '精修失败');
                  }
              }
              
          } catch (error) {
              console.error('Status check failed:', error);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
      }
      
      throw new Error('精修超时，请重试');
  };
  
  const downloadRefinedImage = (imageUrl) => {
      const link = document.createElement('a');
      link.href = imageUrl || '/api/download_final';
      link.download = `infographic_refined_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };
  
  const handleImageClick = async (image) => {
    // If clicking the same image, just open zoom modal
    if (selectedRefinedImage && selectedRefinedImage.url === image.url) {
      setShowRefinedModal(true);
      return;
    }

    setSelectedRefinedImage(image);
    
    // Save current canvas state before loading refined image if we haven't already saved it for this switch
    if (canvas && !historyRef.current.savedBeforeRefine) {
        const currentState = JSON.stringify(canvas.toJSON());
        // Save to a special slot or just ensure it's in history
        historyRef.current.savedStateBeforeRefine = currentState;
    }

    if (canvas) {
        // Clear canvas and load the refined image as a background or main image
        canvas.clear();
        canvas.setBackgroundColor(bgColor, canvas.renderAll.bind(canvas));
        
        fabric.Image.fromURL(image.url, (img) => {
            if (!img) return;
            
            // Scale image to fit canvas while maintaining aspect ratio
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const imgRatio = img.width / img.height;
            const canvasRatio = canvasWidth / canvasHeight;
            
            let scale = 1;
            if (imgRatio > canvasRatio) {
                scale = (canvasWidth * 0.9) / img.width;
            } else {
                scale = (canvasHeight * 0.9) / img.height;
            }
            
            img.set({
                scaleX: scale,
                scaleY: scale,
                left: canvasWidth / 2,
                top: canvasHeight / 2,
                originX: 'center',
                originY: 'center',
                selectable: true
            });
            
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
            
            // Save to history so user can undo/switch back
            saveCanvasState();
        }, { crossOrigin: 'anonymous' });
    }
  };

  // Restore to previous edit state (before viewing refined image)
  const restoreEditState = () => {
      if (canvas && historyRef.current.savedStateBeforeRefine) {
          canvas.loadFromJSON(historyRef.current.savedStateBeforeRefine, () => {
              canvas.renderAll();
              setSelectedRefinedImage(null);
          });
      }
  };

  // --- Pagination Helpers ---
  const getPagedData = (data, page, pageSize) => {
      const start = page * pageSize;
      return data.slice(start, start + pageSize);
  };

  const totalPages = (data, pageSize) => Math.ceil(data.length / pageSize);

  // --- Render ---
  return (
    <div className="workbench-container">
      <Sidebar
        sidebarView={sidebarView}
        setSidebarView={setSidebarView}
        csvFiles={csvFiles}
        selectedFile={selectedFile}
        onFileSelect={handleFileSelect}
        onDataPreview={handleDataPreview}
        chartTypes={chartTypes}
        totalChartTypes={totalChartTypes}
        selectedChartType={selectedChartType}
        chartTypePage={chartTypePage}
        chartTypesLoading={chartTypesLoading}
        chartTypesLoadingText={chartTypesLoadingText}
        onChartTypePageChange={setChartTypePage}
        onChartTypeNext={handleChartTypeNext}
        onChartTypeSelect={handleChartTypeSelect}
        variations={variations}
        totalVariations={totalVariations}
        selectedVariation={selectedVariation}
        variationPage={variationPage}
        variationLoading={variationLoading}
        variationLoadingText={variationLoadingText}
        previewTimestamp={previewTimestamp}
        onVariationPageChange={setVariationPage}
        onVariationNext={handleVariationNext}
        onVariationSelect={handleVariationSelect}
        references={references}
        totalReferences={totalReferences}
        selectedReference={selectedReference}
        referencePage={referencePage}
        referenceProcessing={referenceProcessing}
        referenceProcessingText={referenceProcessingText}
        onReferencePageChange={setReferencePage}
        onReferenceNext={handleReferenceNext}
        onReferenceSelect={handleReferenceSelect}
        onReferenceDeselect={() => setSelectedReference('')}
        titleImage={titleImage}
        setTitleImage={setTitleImage}
        selectedPictograms={selectedPictograms}
        setSelectedPictograms={setSelectedPictograms}
        titleOptions={titleOptions}
        pictogramOptions={pictogramOptions}
        titleLoading={titleLoading}
        titleLoadingText={titleLoadingText}
        pictogramLoading={pictogramLoading}
        pictogramLoadingText={pictogramLoadingText}
        onRegenerateTitle={regenerateTitle}
        onRegeneratePictogram={regeneratePictogram}
        bgColor={bgColor}
        onBgColorChange={handleBgColorChange}
        editConfig={editConfig}
        onEditConfigChange={setEditConfig}
        isRefining={isRefining}
        onRefine={handleRefine}
        refinedImages={refinedImages}
        onImageClick={handleImageClick}
      />

      <div className="main-preview" ref={mainPreviewRef}>
        <div className="preview-header">可编辑画布</div>
        <CanvasControls
          canvas={canvas}
          hasSelection={hasSelection}
          snapshotCount={snapshotCount}
          onDelete={handleDelete}
          onRedo={handleRedoReset}
          onDownload={handleDownloadCanvas}
          hasReference={!!selectedReference}
        />
        <div className="canvas-wrapper" ref={canvasWrapperRef} style={{ position: 'relative' }}>
            <canvas id="workbenchCanvas" />
            {isOptimizing && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <div style={{
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #3498db',
                  borderRadius: '50%',
                  width: '50px',
                  height: '50px',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <div style={{
                  marginTop: '16px',
                  fontSize: '16px',
                  color: '#333',
                  fontWeight: 500
                }}>优化布局中...</div>
              </div>
            )}
        </div>
                </div>
                
      <DataPreviewModal
        show={showDataPreview}
        previewData={previewData}
        selectedFile={selectedFile}
        onClose={() => setShowDataPreview(false)}
      />

      <RefinedImageModal
        show={showRefinedModal}
        selectedImage={selectedRefinedImage}
        onClose={() => setShowRefinedModal(false)}
        onDownload={downloadRefinedImage}
      />
    </div>
  );
}

export default Workbench;
