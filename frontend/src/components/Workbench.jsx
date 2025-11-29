import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { fabric } from 'fabric';
import './Workbench.css';

const CANVAS_MIN_WIDTH = 1200;
const CANVAS_MIN_HEIGHT = 900;

function Workbench() {
  // --- State: Data ---
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  
  // --- State: Chart Types ---
  const [chartTypes, setChartTypes] = useState([]);
  const [totalChartTypes, setTotalChartTypes] = useState(0);
  const [selectedChartType, setSelectedChartType] = useState('');
  const [chartTypePage, setChartTypePage] = useState(0);
  const CHART_TYPES_PER_PAGE = 3; // Adjust based on layout

  // --- State: Variations ---
  const [variations, setVariations] = useState([]);
  const [totalVariations, setTotalVariations] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState('');
  const [variationPage, setVariationPage] = useState(0);
  const VARIATIONS_PER_PAGE = 3;

  // --- State: Editor/Preview ---
  const canvasRef = useRef(null);
  const mainPreviewRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const hasAutoCenteredRef = useRef(false);
  const [canvas, setCanvas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleLoadingText, setTitleLoadingText] = useState('');
  const [pictogramLoading, setPictogramLoading] = useState(false);
  const [pictogramLoadingText, setPictogramLoadingText] = useState('');
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());
  const [layoutNeedsFreshLoad, setLayoutNeedsFreshLoad] = useState(false);

  // --- State: Sidebar / Edit Panel ---
  const [sidebarView, setSidebarView] = useState('config');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [editConfig, setEditConfig] = useState({
    colorScheme: 'default',
    textSize: 'medium',
    textStyle: 'normal',
    prompt: `You are an expert infographic designer. You are given a chart/data visualization image.
Your task is to transform this chart into a beautiful, professional infographic with the following requirements:

**Content Requirements:**
- **DO NOT modify the data, numbers, labels, or any information** shown in the chart
- Keep all chart values, axes, legends, and data points exactly as they appear
- Preserve the chart type and structure

**Visual Enhancement:**
- Add a professional, eye-catching design with modern aesthetics
- Use a harmonious color palette that enhances readability
- Add appropriate decorative elements, icons, or illustrations
- Create a clean, well-organized layout
- Use professional typography for titles and labels
- Add subtle backgrounds or patterns if appropriate
- Ensure visual consistency throughout the design

**Quality Standards:**
- High resolution and clarity
- No blurry text or distorted elements
- Professional and polished appearance
- Suitable for presentation or publication

Generate a stunning infographic that transforms the raw chart into a visually appealing, professional design while keeping all the data intact.`
  });
  
  // --- State: Refine ---
  const [isRefining, setIsRefining] = useState(false);
  const [refinedImages, setRefinedImages] = useState([]); // Array of refined image URLs
  const [showRefinedModal, setShowRefinedModal] = useState(false);
  const [selectedRefinedImage, setSelectedRefinedImage] = useState(null);

  // --- State: References & Assets ---
  const [references, setReferences] = useState([]);
  const [totalReferences, setTotalReferences] = useState(0);
  const [referencePage, setReferencePage] = useState(0);
  const REFERENCES_PER_PAGE = 3;
  const [selectedReference, setSelectedReference] = useState('');
  const [titleImage, setTitleImage] = useState('');
  const [selectedPictograms, setSelectedPictograms] = useState([]);
  const [titleOptions, setTitleOptions] = useState([]);
  const [pictogramOptions, setPictogramOptions] = useState([]);
  
  // --- State: Preserve Element Positions ---
  const [savedPositions, setSavedPositions] = useState({
    chart: null,
    title: null,
    pictograms: []
  });

  // --- State: Undo/Redo History ---
  const [history, setHistory] = useState([]); // Array of canvas states (JSON strings)
  const [historyIndex, setHistoryIndex] = useState(-1); // Current position in history
  const [snapshotCount, setSnapshotCount] = useState(0); // Track quick redo availability
  const maxHistorySize = 50; // Limit history size
  const SNAPSHOT_LIMIT = 3;
  const snapshotsRef = useRef([]); // Stores previous state JSONs for quick redo
  const historyRef = useRef({ history: [], historyIndex: -1 }); // Ref to access latest history

  const resetPanOffsets = useCallback(() => {
    if (canvas) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.renderAll();
    }
  }, [canvas]);

  const scrollMainPreviewToCenter = useCallback(() => {
    const container = mainPreviewRef.current;
    const content = canvasWrapperRef.current;
    if (!container || !content) return;
    if (hasAutoCenteredRef.current) return;

    const contentWidth = content.scrollWidth;
    const contentHeight = content.scrollHeight;
    const offsetLeft = content.offsetLeft;
    const offsetTop = content.offsetTop;
    const targetLeft = Math.max(0, offsetLeft + (contentWidth - container.clientWidth) / 2);
    const targetTop = Math.max(0, offsetTop + (contentHeight - container.clientHeight) / 2);

    container.scrollLeft = targetLeft;
    container.scrollTop = targetTop;
    hasAutoCenteredRef.current = true;
  }, []);

  const clearSnapshots = () => {
    if (snapshotsRef.current.length > 0) {
      snapshotsRef.current = [];
      setSnapshotCount(0);
    }
  };

  
  const pushSnapshot = (stateJson) => {
    if (!stateJson) return;
    snapshotsRef.current = [...snapshotsRef.current, stateJson];
    if (snapshotsRef.current.length > SNAPSHOT_LIMIT) {
      snapshotsRef.current.shift();
    }
    setSnapshotCount(snapshotsRef.current.length);
  };

  const popSnapshot = () => {
    if (!snapshotsRef.current.length) return null;
    const json = snapshotsRef.current[snapshotsRef.current.length - 1];
    snapshotsRef.current = snapshotsRef.current.slice(0, -1);
    setSnapshotCount(snapshotsRef.current.length);
    return json;
  };

  const loadStateFromJson = (stateJson) => {
    if (!canvas || !stateJson) return;
    canvas.loadFromJSON(stateJson, () => {
      canvas.renderAll();
      setHistory(prev => {
        const currentIndex = historyRef.current.historyIndex;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(stateJson);
        let newIndex;
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
          newIndex = maxHistorySize - 1;
        } else {
          newIndex = newHistory.length - 1;
        }
        historyRef.current.history = newHistory;
        historyRef.current.historyIndex = newIndex;
        setHistoryIndex(newIndex);
        return newHistory;
      });
    });
  };

  // Sync historyRef with state
  useEffect(() => {
    historyRef.current.history = history;
    historyRef.current.historyIndex = historyIndex;
  }, [history, historyIndex]);

  // --- Initialization ---
  useEffect(() => {
    // Fetch Files
    axios.get('/api/files')
      .then(res => setCsvFiles(res.data.files))
      .catch(err => console.error(err));

    // Initialize Canvas
    const container = document.querySelector('.canvas-wrapper');
    if (!container) {
      console.warn('Canvas wrapper not found, retrying...');
      setTimeout(() => {
        const retryContainer = document.querySelector('.canvas-wrapper');
        if (retryContainer) {
          const computedWidth = retryContainer.clientWidth - 80;
          const computedHeight = retryContainer.clientHeight - 80;
          const canvasWidth = Math.max(computedWidth, CANVAS_MIN_WIDTH);
          const canvasHeight = Math.max(computedHeight, CANVAS_MIN_HEIGHT);
          const c = new fabric.Canvas('workbenchCanvas', {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: '#ffffff',
            selection: true,
            preserveObjectStacking: true
          });
          c.setViewportTransform([1, 0, 0, 1, 0, 0]);
          setCanvas(c);
        }
      }, 100);
      return;
    }
    const computedWidth = container.clientWidth - 80;
    const computedHeight = container.clientHeight - 80;
    // Use container size, but ensure minimum size for usability
    // If container is smaller than minimum, use container size to avoid overflow
    const canvasWidth = computedWidth >= CANVAS_MIN_WIDTH ? computedWidth : Math.max(computedWidth, 800);
    const canvasHeight = computedHeight >= CANVAS_MIN_HEIGHT ? computedHeight : Math.max(computedHeight, 600);
    
    const initialBgColor = '#ffffff';
    const c = new fabric.Canvas('workbenchCanvas', {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: initialBgColor,
      selection: true,
      preserveObjectStacking: true
    });
    
    // Initialize viewport transform for panning
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    setCanvas(c);
    setBgColor(initialBgColor);
    
    // Set canvas wrapper background color
    if (container) {
        container.style.backgroundColor = initialBgColor;
    }

    // Save canvas state function
    const saveCanvasState = () => {
      if (!c) return;
      const prevJson = historyRef.current.history[historyRef.current.historyIndex];
      if (prevJson) {
        pushSnapshot(prevJson);
      }
      const json = JSON.stringify(c.toJSON());
      setHistory(prev => {
        const currentIndex = historyRef.current.historyIndex;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(json);
        // Limit history size
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
          historyRef.current.historyIndex = maxHistorySize - 1;
        } else {
          historyRef.current.historyIndex = newHistory.length - 1;
        }
        historyRef.current.history = newHistory;
        return newHistory;
      });
    };

    // Undo function
    const performUndo = () => {
      if (!c || historyRef.current.historyIndex <= 0) return;
      const currentIndex = historyRef.current.historyIndex;
      pushRedoIndex(currentIndex);
      const newIndex = currentIndex - 1;
      const stateJson = historyRef.current.history[newIndex];
      if (stateJson) {
        c.loadFromJSON(stateJson, () => {
          c.renderAll();
          historyRef.current.historyIndex = newIndex;
          setHistoryIndex(newIndex);
        });
      }
    };

    // Redo function
    const performRedo = () => {
      if (!c) return;
      const redoIndex = popRedoIndex();
      if (redoIndex == null) return;
      const stateJson = historyRef.current.history[redoIndex];
      if (stateJson) {
        c.loadFromJSON(stateJson, () => {
          c.renderAll();
          historyRef.current.historyIndex = redoIndex;
          setHistoryIndex(redoIndex);
        });
      }
    };

    // Keyboard event handler for Delete key
    const handleKeyDown = (e) => {
      if (!c) return;
      // Delete or Backspace key
      if ((e.key === 'Delete' || e.key === 'Backspace') && c.getActiveObject()) {
        e.preventDefault();
        const activeObject = c.getActiveObject();
        if (activeObject) {
          saveCanvasState();
          if (activeObject.type === 'activeSelection') {
            // Multiple objects selected
            activeObject.getObjects().forEach(obj => c.remove(obj));
            c.discardActiveObject();
          } else {
            // Single object selected
            c.remove(activeObject);
          }
          c.renderAll();
        }
      }
      // Ctrl+Z for undo, Ctrl+Y or Ctrl+Shift+Z for redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          performUndo();
        } else if ((e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !e.altKey) {
          e.preventDefault();
          performRedo();
        }
      }
    };

    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyDown);

    // Listen to canvas object changes for history
    c.on('object:added', () => {
      // Debounce to avoid too many history entries
      clearTimeout(c._historyTimeout);
      c._historyTimeout = setTimeout(() => {
        saveCanvasState();
      }, 300);
    });

    c.on('object:removed', () => {
      clearTimeout(c._historyTimeout);
      c._historyTimeout = setTimeout(() => {
        saveCanvasState();
      }, 300);
    });

    c.on('object:modified', () => {
      clearTimeout(c._historyTimeout);
      c._historyTimeout = setTimeout(() => {
        saveCanvasState();
      }, 300);
    });

    // Resize canvas on window resize
    const resizeCanvas = () => {
        const container = document.querySelector('.canvas-wrapper');
        if (container && c) {
            const computedWidth = container.clientWidth - 80;
            const computedHeight = container.clientHeight - 80;
            // Use container size, but ensure minimum size for usability
            // If container is smaller than minimum, use container size to avoid overflow
            const newWidth = computedWidth >= CANVAS_MIN_WIDTH ? computedWidth : Math.max(computedWidth, 800);
            const newHeight = computedHeight >= CANVAS_MIN_HEIGHT ? computedHeight : Math.max(computedHeight, 600);
            c.setWidth(newWidth);
            c.setHeight(newHeight);
            c.renderAll();
        }
    };
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', resizeCanvas);
      if (c._historyTimeout) {
        clearTimeout(c._historyTimeout);
      }
      c.dispose();
    };
  }, []);

  // --- Logic: Data Selection ---
  const handleFileSelect = async (e) => {
    const file = e.target.value;

    // Reset downstream state
    setSelectedChartType('');
    setChartTypes([]);
    setTotalChartTypes(0);
    setChartTypePage(0);

    setSelectedVariation('');
    setVariations([]);
    setTotalVariations(0);
    setVariationPage(0);

    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);

    setTitleImage('');
    setSelectedPictograms([]);
    setTitleOptions([]);
    setPictogramOptions([]);

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

    // Reset history when switching files
    setHistory([]);
    setHistoryIndex(-1);
    historyRef.current.history = [];
    historyRef.current.historyIndex = -1;
    clearSnapshots();

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

  const pollStatus = (callback, targetStep, autoStopLoading = true) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/status');
        const { completed, step } = res.data;

        // If targetStep is provided, ensure we are in that step
        if (targetStep && step !== targetStep) {
            return;
        }

        if (completed) {
          clearInterval(interval);
          if (autoStopLoading) {
            setLoading(false);
          }
          callback(res.data);
        }
      } catch (err) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 500);
  };

  // --- Logic: Chart Types ---
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

  const fetchChartTypes = async () => {
    setLoading(true);
    setLoadingText('Loading chart types...');
    try {
      // 先获取第一页，了解总数
      const firstRes = await axios.get('/api/chart_types');
      const total = firstRes.data.total;
      let allChartTypes = [...firstRes.data.chart_types];
      
      // 如果总数大于第一页的数量，继续获取剩余页
      if (total > allChartTypes.length) {
        setLoadingText(`Loading chart types... (${allChartTypes.length}/${total})`);
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
              setLoadingText(`Loading chart types... (${allChartTypes.length}/${total})`);
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
      setLoadingText('Validating chart type images...');
      const validatedTypes = await validateChartTypes(allChartTypes);
      
      // 合并使用相同图片的 chart types
      setLoadingText('Merging chart types...');
      const mergedTypes = mergeChartTypesByImage(validatedTypes);
      
      setTotalChartTypes(mergedTypes.length);
      setChartTypes(mergedTypes);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadMoreChartTypes = async (onSuccess) => {
    setLoading(true);
    setLoadingText('Loading more chart types...');
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
        setLoading(false);
    } catch (err) {
        console.error(err);
        setLoading(false);
    }
  };

  const handleChartTypeNext = async () => {
      const maxLoadedPage = Math.ceil(chartTypes.length / CHART_TYPES_PER_PAGE) - 1;
      if (chartTypePage < maxLoadedPage) {
          // Data already loaded
          setChartTypePage(p => p + 1);
      } else {
          // Need to load more
          await loadMoreChartTypes(() => {
              setChartTypePage(p => p + 1);
          });
      }
  };


  const handleChartTypeSelect = async (typeItem) => {
    // Reset downstream state
    setSelectedVariation('');
    setVariations([]);
    setTotalVariations(0);
    setVariationPage(0);

    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);

    setTitleImage('');
    setSelectedPictograms([]);
    setTitleOptions([]);
    setPictogramOptions([]);

    // 如果这是合并的类型，使用第一个类型
    const actualType = typeItem.mergedTypes ? typeItem.mergedTypes[0] : typeItem.type;
    setSelectedChartType(actualType);
    setLoading(true);
    setLoadingText('Loading variations...');
    try {
      await axios.get(`/api/chart_types/select/${actualType}`);
      await fetchVariations();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // --- Logic: Variations ---
  const fetchVariations = async () => {
    setLoading(true);
    setLoadingText('Generating variation previews...');
    try {
      const res = await axios.get('/api/variations');
      setTotalVariations(res.data.total);
      // Trigger preview generation
      await axios.get('/api/variations/generate_previews');
      
      // Wait for completion before setting state
      pollStatus((statusData) => {
          // Filter out 'plain' variations as per requirements
          // Note: Backend now filters 'plain' too, but keeping this safe
          const filtered = (res.data.variations || []).filter(v => !v.name.toLowerCase().includes('plain'));
          setVariations(filtered);
          setPreviewTimestamp(Date.now());
      }, 'variation_preview');
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadMoreVariations = async (onSuccess) => {
    setLoading(true);
    setLoadingText('Loading more variations...');
    try {
        const res = await axios.get('/api/variations/next');
        if (res.data.variations && res.data.variations.length > 0) {
            await axios.get('/api/variations/generate_previews');
            pollStatus(() => {
                setVariations(prev => {
                    // Filter out 'plain' variations
                    const validNewItems = res.data.variations.filter(v => !v.name.toLowerCase().includes('plain'));
                    const newItems = validNewItems.filter(item => !prev.some(p => p.name === item.name));
                    return [...prev, ...newItems];
                });
                setPreviewTimestamp(Date.now());
                if (onSuccess) onSuccess();
            }, 'variation_preview');
        } else {
            setLoading(false);
        }
    } catch (err) {
        console.error(err);
        setLoading(false);
    }
  };

  const handleVariationNext = async () => {
      const maxLoadedPage = Math.ceil(variations.length / VARIATIONS_PER_PAGE) - 1;
      if (variationPage < maxLoadedPage) {
          // Data already loaded
          setVariationPage(p => p + 1);
      } else {
          // Need to load more
          await loadMoreVariations(() => {
              setVariationPage(p => p + 1);
          });
      }
  };

  const handleVariationSelect = async (variationName) => {
    // Reset downstream state
    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);

    setTitleImage('');
    setSelectedPictograms([]);
    setTitleOptions([]);
    setPictogramOptions([]);

    setSelectedVariation(variationName);
    // Load into Canvas directly from the generated preview (use PNG)
    loadChartToCanvas(variationName, `/currentfilepath/variation_${variationName}.png`);
    // Fetch references for the next step
    fetchReferences();
  };

  // --- Logic: References & Assets ---
  const fetchReferences = async () => {
    try {
      const res = await axios.get('/api/references');
      const { main_image, random_images, total } = res.data;
      const allRefs = [main_image, ...(random_images || [])].filter(Boolean);
      setReferences(allRefs);
      setTotalReferences(total);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReferenceSelect = async (refName) => {
    // Reset downstream state
    setTitleImage('');
    setSelectedPictograms([]);
    setTitleOptions([]);
    setPictogramOptions([]);
    setSavedPositions({ chart: null, title: null, pictograms: [] });
    setLayoutNeedsFreshLoad(true);

    setSelectedReference(refName);
    setLoading(true);
    setLoadingText('Extracting style & Generating assets...');
    try {
      const dataName = selectedFile.replace('.csv', '');
      // 1. Extract Layout/Style
      await axios.get(`/api/start_layout_extraction/${refName}/${dataName}`);
      
      pollStatus(async () => {
          // 2. Generate Title
          await generateTitle();
      }, 'layout_extraction', false);
    } catch (err) {
      console.error(err);
      setLoading(false);
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

  const handleReferenceNext = async () => {
      const maxLoadedPage = Math.ceil(references.length / REFERENCES_PER_PAGE) - 1;
      if (referencePage < maxLoadedPage) {
          // Data already loaded
          setReferencePage(p => p + 1);
      } else {
          // Need to load more
          await loadMoreReferencesData(() => {
              setReferencePage(p => p + 1);
          });
      }
  };

  const generateTitle = async () => {
      setTitleLoading(true);
      setTitleLoadingText('Generating title...');
      try {
          await axios.get(`/api/start_title_generation/${selectedFile}`);
          pollStatus(async (statusData) => {
              // Update title image state
              const keys = statusData.title_options ? Object.keys(statusData.title_options).sort() : [];
              const options = keys.length > 0 ? keys : ['title_0.png'];
              setTitleOptions(options);
              const newTitleImage = options[0];
              // Don't set title image yet, wait for pictogram
              // setTitleImage(newTitleImage);
              setPreviewTimestamp(Date.now()); // Force refresh images
              
              // 3. Generate Pictogram
              // Use the text from the first generated title
              const titleText = statusData.title_options && statusData.title_options[newTitleImage] 
                                ? statusData.title_options[newTitleImage].title_text 
                                : (statusData.selected_title || 'InfoGraphic');
              
              setTitleLoading(false);
              await generatePictogram(titleText, newTitleImage);
          }, 'title_generation', false);
      } catch (err) {
          console.error(err);
          setTitleLoading(false);
      }
  };

  const regenerateTitle = async () => {
      setTitleLoading(true);
      setTitleLoadingText('Regenerating title...');
      try {
          await axios.get(`/api/regenerate_title/${selectedFile}`);
          pollStatus(async (statusData) => {
              const keys = statusData.title_options ? Object.keys(statusData.title_options).sort() : [];
              const options = keys.length > 0 ? keys : ['title_0.png'];
              setTitleOptions(options);
              setTitleImage(options[0]);
              setPreviewTimestamp(Date.now()); // Force refresh images
              setTitleLoading(false);
          }, 'title_generation');
      } catch (err) {
          console.error(err);
          setTitleLoading(false);
      }
  };

  const generatePictogram = async (titleText, currentTitleImage = null) => {
      setPictogramLoading(true);
      setPictogramLoadingText('Generating pictogram...');
      try {
          // If titleText is not provided (e.g. manual regeneration), try to get it or use default
          const text = titleText || 'InfoGraphic'; 
          await axios.get(`/api/start_pictogram_generation/${encodeURIComponent(text)}`);
          pollStatus((statusData) => {
              console.log('Pictogram generation finished', statusData);
              
              // Ensure we get the options
              let options = [];
              if (statusData.pictogram_options) {
                  options = Object.keys(statusData.pictogram_options).sort();
              }
              
              // Fallback if empty (should not happen if backend works)
              if (options.length === 0) {
                  console.warn('No pictogram options found in statusData');
                  // Try to infer from standard naming if backend failed to populate dict but files exist?
                  options = ['pictogram_0.png', 'pictogram_1.png', 'pictogram_2.png'];
              }

              setPictogramOptions(options);
              
              // Select the first one
              const newPictograms = [options[0]];
              
              // Update states together to trigger single canvas update
              if (currentTitleImage) {
                  setTitleImage(currentTitleImage);
              }
              setSelectedPictograms(newPictograms);
              
              setPreviewTimestamp(Date.now()); // Force refresh images
              setPictogramLoading(false);
              
              // Force update canvas with new assets
              // Use the passed title image if available (since state update might be pending)
              // or fallback to state
              const titleToUse = currentTitleImage || titleImage;
              if (selectedVariation && titleToUse && newPictograms.length > 0) {
                  // We need to call loadChartToCanvas WITHOUT directUrl to force backend composition
                  // But we need to make sure state is updated first or pass params explicitly
                  // Since state updates are async, let's rely on the useEffect hook which watches [titleImage, selectedPictograms]
                  // However, useEffect might not trigger if we just set state here and function ends?
                  // Actually, React state updates trigger re-renders and then useEffects.
                  // So the existing useEffect should handle it.
              }
          }, 'pictogram_generation', true);
      } catch (err) {
          console.error(err);
          setPictogramLoading(false);
      }
  };

  const regeneratePictogram = async () => {
      setPictogramLoading(true);
      setPictogramLoadingText('Regenerating pictogram...');
      try {
          const text = 'InfoGraphic'; 
          await axios.get(`/api/regenerate_pictogram/${encodeURIComponent(text)}`);
          pollStatus((statusData) => {
              console.log('Pictogram regeneration finished', statusData);
              
              // Ensure we get the options
              let options = [];
              if (statusData.pictogram_options) {
                  options = Object.keys(statusData.pictogram_options).sort();
              }
              
              // Fallback if empty
              if (options.length === 0) {
                  console.warn('No pictogram options found in statusData');
                  options = ['pictogram_0.png', 'pictogram_1.png', 'pictogram_2.png'];
              }

              setPictogramOptions(options);
              setSelectedPictograms([options[0]]);
              setPreviewTimestamp(Date.now()); // Force refresh images
              setPictogramLoading(false);
          }, 'pictogram_generation');
      } catch (err) {
          console.error(err);
          setPictogramLoading(false);
      }
  };

  // Auto-reload canvas when assets change
  useEffect(() => {
      console.log('useEffect triggered:', { selectedVariation, titleImage, selectedPictograms, canvas: !!canvas, layoutNeedsFreshLoad });
      if (canvas && selectedVariation && (titleImage || selectedPictograms.length > 0)) {
          const shouldPreservePositions = !layoutNeedsFreshLoad && canvas.getObjects().length > 1;
          let cancelled = false;
          const run = async () => {
              await loadChartToCanvas(
                  selectedVariation,
                  `/currentfilepath/variation_${selectedVariation}.png`,
                  shouldPreservePositions
              );
              if (!cancelled && layoutNeedsFreshLoad) {
                  setLayoutNeedsFreshLoad(false);
              }
          };
          run();
          return () => {
              cancelled = true;
          };
      }
      return undefined;
  }, [canvas, titleImage, selectedPictograms, selectedVariation, layoutNeedsFreshLoad]);

  // Auto-load refinement history when both title and pictogram are available
  useEffect(() => {
      const loadRefinementHistory = async () => {
          // Only load history if we have all required materials
          if (!titleImage || !selectedPictograms || selectedPictograms.length === 0 || !selectedVariation) {
              return;
          }

          console.log('Loading refinement history for materials:', {
              titleImage,
              pictogram: selectedPictograms[0],
              chart_type: selectedVariation
          });

          try {
              const response = await axios.post('/api/material_history', {
                  title: titleImage,
                  pictogram: selectedPictograms[0],
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

  // Note: Initial canvas state is saved in loadChartToCanvas function
  // This useEffect is kept as a backup but may not be needed

  // Update delete button state when selection changes
  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    if (!canvas) return;
    
    const updateSelection = () => {
      setHasSelection(!!canvas.getActiveObject());
    };

    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', updateSelection);

    return () => {
      canvas.off('selection:created', updateSelection);
      canvas.off('selection:updated', updateSelection);
      canvas.off('selection:cleared', updateSelection);
    };
  }, [canvas]);

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

  const loadChartToCanvas = async (variationName, directUrl = null, preservePositions = false) => {
      if (!canvas || !selectedFile) return;
      setLoading(true);
      setLoadingText('Updating canvas...');
      
      try {
          // Save current positions before clearing canvas
          let currentPositions = { chart: null, title: null, pictograms: [] };
          
          if (preservePositions && canvas.getObjects().length > 0) {
              const objects = canvas.getObjects();
              // Assume: first object is chart, second is title, rest are pictograms
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
          } else if (savedPositions.chart || savedPositions.title || savedPositions.pictograms.length > 0) {
              // Use previously saved positions
              currentPositions = savedPositions;
          }
          
      let imageUrl = '';
      let layout = null;

          if (directUrl) {
              // Load directly from the generated file (PNG)
              imageUrl = directUrl;

              // 即使使用 directUrl，也需要获取 layout 信息用于定位
              try {
                  const statusRes = await axios.get('/api/status');
                  const selectedReference = statusRes.data.selected_reference;
                  console.log('Fetched status, selected_reference:', selectedReference);
                  if (selectedReference) {
                      // 从后端获取 layout 信息
                      const layoutRes = await axios.get('/api/layout');
              layout = layoutRes.data.layout;
              console.log('Fetched layout:', layout);
                  }
              } catch (err) {
                  console.warn('Failed to fetch layout info:', err);
              }
          } else {
              // Call backend to generate/composite
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
              // Use PNG url from backend
              imageUrl = res.data.png_url;
              layout = res.data.layout;
          }
          
          // Clear canvas only if it's fully initialized
          if (canvas && canvas.getContext()) {
              canvas.clear();
          }
          // Keep user-selected/background color (default white) instead of backend color
          const canvasBgColor = bgColor || (canvas ? canvas.backgroundColor : '#ffffff') || '#ffffff';
          if (canvas) {
              canvas.setBackgroundColor(canvasBgColor, canvas.renderAll.bind(canvas));
          }
          setBgColor(canvasBgColor);
          
          // Also apply to canvas wrapper
          const canvasWrapper = document.querySelector('.canvas-wrapper');
          if (canvasWrapper) {
              canvasWrapper.style.backgroundColor = canvasBgColor;
          }

          const trimTransparentBorders = (img, alphaThreshold = 8) => {
              if (!img || !img._originalElement) return img;
              const element = img._originalElement;
              if (!element.width || !element.height) return img;

              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = element.width;
              tempCanvas.height = element.height;
              const ctx = tempCanvas.getContext('2d');
              if (!ctx) return img;
              ctx.drawImage(element, 0, 0);

              const { data, width, height } = ctx.getImageData(0, 0, element.width, element.height);
              let minX = width, minY = height, maxX = -1, maxY = -1;

              for (let y = 0; y < height; y++) {
                  for (let x = 0; x < width; x++) {
                      const alpha = data[(y * width + x) * 4 + 3];
                      if (alpha > alphaThreshold) {
                          if (x < minX) minX = x;
                          if (x > maxX) maxX = x;
                          if (y < minY) minY = y;
                          if (y > maxY) maxY = y;
                      }
                  }
              }

              if (maxX === -1 || maxY === -1) {
                  return img;
              }

              const cropWidth = Math.max(1, maxX - minX + 1);
              const cropHeight = Math.max(1, maxY - minY + 1);

              img.set({
                  cropX: minX,
                  cropY: minY,
                  width: cropWidth,
                  height: cropHeight,
                  dirty: true
              });
              img.setCoords();
              return img;
          };

          const addImage = (url, options) => {
              return new Promise((resolve) => {
                  fabric.Image.fromURL(url, (img) => {
                      if (img) {
                          // If we have explicit scale values (from saved positions), use them
                          const hasExplicitScale = options.scaleX !== undefined && options.scaleY !== undefined;
                          
                          // Calculate scale to fit within maxWidth/maxHeight if provided and no explicit scale
                          if (!hasExplicitScale && options.maxWidth && options.maxHeight) {
                              const scale = Math.min(
                                  options.maxWidth / img.width,
                                  options.maxHeight / img.height,
                                  1 // Don't scale up beyond original size
                              );
                              img.scale(scale);
                          } else if (hasExplicitScale) {
                              img.scaleX = options.scaleX;
                              img.scaleY = options.scaleY;
                          }
                          
                          // Remove custom props before setting
                          const { maxWidth, maxHeight, trimTransparent, ...fabricOptions } = options;
                          img.set(fabricOptions);
                          if (trimTransparent) {
                              trimTransparentBorders(img);
                          }
                          canvas.add(img);
                      }
                      resolve(img);
                  });
              });
          };

          // ========== Layout Calculation Helper Functions ==========
          // Constants
          const FIXED_PICTOGRAM_SIZE = 200;
          const PICTOGRAM_PADDING = 30;
          const TITLE_BASE_WIDTH = 700;
          const TITLE_BASE_HEIGHT = 150;
          const MIN_TITLE_CENTER_Y_OFFSET = 50;
          const TITLE_ASPECT_THRESHOLD = 1.9;
          const TITLE_WIDE_WIDTH_RATIO = 2 / 3;
          const TITLE_COMPACT_WIDTH_RATIO = 0.55;
          const TRANSPARENT_ALPHA_THRESHOLD = 35;

          // Calculate chart boundaries from chart options
          const calculateChartBounds = (chartOpts, canvasWidth, canvasHeight) => {
              const maxWidth = chartOpts.maxWidth || canvasWidth * 0.9;
              const maxHeight = chartOpts.maxHeight || canvasHeight * 0.7;
              return {
                  left: chartOpts.left - maxWidth / 2,
                  right: chartOpts.left + maxWidth / 2,
                  top: chartOpts.top - maxHeight / 2,
                  bottom: chartOpts.top + maxHeight / 2,
                  width: maxWidth,
                  height: maxHeight
              };
          };

          // Calculate title position based on chart position
          const calculateTitleOptions = (
              chartOpts,
              canvasWidth,
              canvasHeight,
              titleWidthRatio = TITLE_WIDE_WIDTH_RATIO,
              titlePadding = 0,
              chartBoundsOverride = null,
              titleMaxHeightOverride = TITLE_BASE_HEIGHT
          ) => {
              const chartBounds = chartBoundsOverride || calculateChartBounds(chartOpts, canvasWidth, canvasHeight);
              const chartWidth = chartBounds.width ?? Math.max(1, chartBounds.right - chartBounds.left);
              const titleMaxWidth = Math.max(TITLE_BASE_WIDTH, chartWidth * titleWidthRatio);
              const titleMaxHeight = Math.max(TITLE_BASE_HEIGHT, titleMaxHeightOverride);
              const chartCenterX = chartBounds.left + chartWidth / 2;
              let titleCenterY = chartBounds.top - titlePadding - titleMaxHeight / 2;
              const minTitleCenterY = MIN_TITLE_CENTER_Y_OFFSET + titleMaxHeight / 2;
              
              return {
                  maxWidth: titleMaxWidth,
                  maxHeight: titleMaxHeight,
                  left: chartCenterX || canvasWidth / 2, // 居中
                  top: Math.max(minTitleCenterY, titleCenterY),
                  originX: 'center',
                  originY: 'center'
              };
          };
          
          const getBoundsFromObject = (obj) => {
              if (!obj) return null;
              const rect = obj.getBoundingRect(true);
              return {
                  left: rect.left,
                  top: rect.top,
                  right: rect.left + rect.width,
                  bottom: rect.top + rect.height,
                  width: rect.width,
                  height: rect.height
              };
          };

          // Check if pictogram overlaps with chart
          const checkPictogramOverlap = (pictogramLeft, pictogramTop, pictogramSize, chartBounds) => {
              const halfSize = pictogramSize / 2;
              const pictogramLeftBound = pictogramLeft - halfSize;
              const pictogramRightBound = pictogramLeft + halfSize;
              const pictogramTopBound = pictogramTop - halfSize;
              const pictogramBottomBound = pictogramTop + halfSize;
              
              return !(
                  pictogramRightBound < chartBounds.left || 
                  pictogramLeftBound > chartBounds.right || 
                  pictogramBottomBound < chartBounds.top || 
                  pictogramTopBound > chartBounds.bottom
              );
          };

          // Calculate pictogram position within chart's transparent area
          const calculatePictogramPosition = (chartOpts, canvasWidth, canvasHeight, referencePosition = null) => {
              const chartBounds = calculateChartBounds(chartOpts, canvasWidth, canvasHeight);
              const pictogramHalfSize = FIXED_PICTOGRAM_SIZE / 2;
              
              // Try reference position first if provided
              if (referencePosition) {
                  const overlaps = checkPictogramOverlap(
                      referencePosition.left, 
                      referencePosition.top, 
                      FIXED_PICTOGRAM_SIZE, 
                      chartBounds
                  );
                  if (!overlaps) {
                      return {
                          left: referencePosition.left,
                          top: referencePosition.top
                      };
                  }
              }
              
              // Fallback: place in chart's internal transparent area (bottom-right corner)
              let pictogramLeft = chartBounds.right - pictogramHalfSize - PICTOGRAM_PADDING;
              let pictogramTop = chartBounds.bottom - pictogramHalfSize - PICTOGRAM_PADDING;
              
              // If bottom-right doesn't fit, try bottom-left
              if (pictogramLeft < chartBounds.left + pictogramHalfSize + PICTOGRAM_PADDING) {
                  pictogramLeft = chartBounds.left + pictogramHalfSize + PICTOGRAM_PADDING;
              }
              
              // If vertical space insufficient, place at 70% of chart height
              if (pictogramTop < chartBounds.top + pictogramHalfSize + PICTOGRAM_PADDING) {
                  pictogramTop = chartBounds.top + (chartBounds.bottom - chartBounds.top) * 0.7;
              }
              
              // Ensure pictogram stays within chart bounds
              pictogramLeft = Math.max(
                  chartBounds.left + pictogramHalfSize + PICTOGRAM_PADDING,
                  Math.min(pictogramLeft, chartBounds.right - pictogramHalfSize - PICTOGRAM_PADDING)
              );
              pictogramTop = Math.max(
                  chartBounds.top + pictogramHalfSize + PICTOGRAM_PADDING,
                  Math.min(pictogramTop, chartBounds.bottom - pictogramHalfSize - PICTOGRAM_PADDING)
              );
              
              return { left: pictogramLeft, top: pictogramTop };
          };

          const calculateOutsidePictogramPosition = (chartBounds, canvasWidth, canvasHeight) => {
              if (!chartBounds) {
                  return {
                      left: Math.min(
                          canvasWidth - FIXED_PICTOGRAM_SIZE / 2 - PICTOGRAM_PADDING,
                          canvasWidth / 2
                      ),
                      top: Math.min(
                          canvasHeight - FIXED_PICTOGRAM_SIZE / 2 - PICTOGRAM_PADDING,
                          canvasHeight / 2
                      )
                  };
              }

              const halfSize = FIXED_PICTOGRAM_SIZE / 2;
              const desiredLeft = chartBounds.right + halfSize + PICTOGRAM_PADDING;
              let finalLeft = desiredLeft;
              if (!Number.isFinite(finalLeft)) {
                  finalLeft = chartBounds.right + halfSize + PICTOGRAM_PADDING;
              }

              const chartMidY = chartBounds.top + chartBounds.height / 2;
              let finalTop = chartMidY;
              const minTop = halfSize + PICTOGRAM_PADDING;
              const maxTop = canvasHeight - halfSize - PICTOGRAM_PADDING;
              if (!Number.isFinite(finalTop)) {
                  finalTop = chartBounds.bottom - halfSize - PICTOGRAM_PADDING;
              }
              finalTop = Math.min(Math.max(finalTop, minTop), maxTop);

              return {
                  left: finalLeft,
                  top: finalTop
              };
          };

          const computeRegionAlphaScore = (data, width, height, centerX, centerY, regionWidth, regionHeight) => {
              if (!data || !width || !height) return Infinity;
              const halfW = Math.max(1, Math.floor(regionWidth / 2));
              const halfH = Math.max(1, Math.floor(regionHeight / 2));
              const startX = Math.max(0, Math.floor(centerX - halfW));
              const endX = Math.min(width - 1, Math.floor(centerX + halfW));
              const startY = Math.max(0, Math.floor(centerY - halfH));
              const endY = Math.min(height - 1, Math.floor(centerY + halfH));
              const stepX = Math.max(1, Math.floor(regionWidth / 6));
              const stepY = Math.max(1, Math.floor(regionHeight / 6));

              let totalAlpha = 0;
              let samples = 0;
              for (let y = startY; y <= endY; y += stepY) {
                  for (let x = startX; x <= endX; x += stepX) {
                      const alpha = data[(y * width + x) * 4 + 3];
                      totalAlpha += alpha;
                      samples++;
                  }
              }
              if (samples === 0) return Infinity;
              return totalAlpha / samples;
          };

          const findTransparentAreaPosition = (
              chartObj,
              chartBounds,
              pictogramSize,
              referenceCanvasPosition = null
          ) => {
              try {
                  if (!chartObj || !chartObj._originalElement || !chartBounds) return null;
                  const element = chartObj._originalElement;
                  const naturalWidth = element.width;
                  const naturalHeight = element.height;
                  if (!naturalWidth || !naturalHeight) return null;

                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = naturalWidth;
                  tempCanvas.height = naturalHeight;
                  const ctx = tempCanvas.getContext('2d');
                  if (!ctx) return null;

                  ctx.drawImage(element, 0, 0, naturalWidth, naturalHeight);
                  const imageData = ctx.getImageData(0, 0, naturalWidth, naturalHeight);
                  const data = imageData.data;

                  const scaleX = (chartObj.getScaledWidth() || naturalWidth) / naturalWidth;
                  const scaleY = (chartObj.getScaledHeight() || naturalHeight) / naturalHeight;
                  const regionWidth = Math.max(4, Math.round(pictogramSize / Math.max(scaleX, 0.0001)));
                  const regionHeight = Math.max(4, Math.round(pictogramSize / Math.max(scaleY, 0.0001)));
                  const halfRegionW = Math.floor(regionWidth / 2);
                  const halfRegionH = Math.floor(regionHeight / 2);

                  const clamp01 = (value) => Math.min(1, Math.max(0, value));
                  const candidateCenters = [];

                  const pushCanvasCandidate = (position, priority = 0) => {
                      if (!position) return;
                      const normalizedX = clamp01(
                          (position.left - chartBounds.left) / Math.max(chartBounds.width, 1)
                      );
                      const normalizedY = clamp01(
                          (position.top - chartBounds.top) / Math.max(chartBounds.height, 1)
                      );
                      candidateCenters.push({
                          x: normalizedX * naturalWidth,
                          y: normalizedY * naturalHeight,
                          priority
                      });
                  };

                  if (referenceCanvasPosition) {
                      pushCanvasCandidate(referenceCanvasPosition, 0);
                  }

                  const quadrants = [
                      { x: 0.25, y: 0.75 }, // 左下
                      { x: 0.75, y: 0.75 }, // 右下
                      { x: 0.25, y: 0.25 }, // 左上
                      { x: 0.75, y: 0.25 }  // 右上
                  ];
                  quadrants.forEach((q, index) => {
                      candidateCenters.push({
                          x: q.x * naturalWidth,
                          y: q.y * naturalHeight,
                          priority: index + 1
                      });
                  });

                  const gridSteps = 5;
                  for (let gy = 1; gy < gridSteps; gy++) {
                      for (let gx = 1; gx < gridSteps; gx++) {
                          candidateCenters.push({
                              x: (gx / gridSteps) * naturalWidth,
                              y: (gy / gridSteps) * naturalHeight,
                              priority: 5 + gy + gx
                          });
                      }
                  }

                  let bestCandidate = null;
                  candidateCenters.forEach((candidate) => {
                      const { x, y } = candidate;
                      if (
                          x - halfRegionW < 0 ||
                          x + halfRegionW >= naturalWidth ||
                          y - halfRegionH < 0 ||
                          y + halfRegionH >= naturalHeight
                      ) {
                          return;
                      }
                      const alphaScore = computeRegionAlphaScore(
                          data,
                          naturalWidth,
                          naturalHeight,
                          x,
                          y,
                          regionWidth,
                          regionHeight
                      );
                      if (!isFinite(alphaScore)) return;

                      if (
                          !bestCandidate ||
                          alphaScore + candidate.priority * 2 < bestCandidate.score
                      ) {
                          bestCandidate = {
                              score: alphaScore + candidate.priority * 2,
                              alpha: alphaScore,
                              x,
                              y
                          };
                      }
                  });

                  if (!bestCandidate || bestCandidate.alpha > TRANSPARENT_ALPHA_THRESHOLD) {
                      return null;
                  }

                  const normalizedX = bestCandidate.x / naturalWidth;
                  const normalizedY = bestCandidate.y / naturalHeight;
                  const rawLeft = chartBounds.left + normalizedX * chartBounds.width;
                  const rawTop = chartBounds.top + normalizedY * chartBounds.height;
                  const halfSize = pictogramSize / 2;

                  const clampedLeft = Math.max(
                      chartBounds.left + halfSize + PICTOGRAM_PADDING,
                      Math.min(rawLeft, chartBounds.right - halfSize - PICTOGRAM_PADDING)
                  );
                  const clampedTop = Math.max(
                      chartBounds.top + halfSize + PICTOGRAM_PADDING,
                      Math.min(rawTop, chartBounds.bottom - halfSize - PICTOGRAM_PADDING)
                  );

                  return {
                      left: clampedLeft,
                      top: clampedTop
                  };
              } catch (err) {
                  console.warn('Failed to analyse transparent region for pictogram placement:', err);
                  return null;
              }
          };

          // ========== Main Layout Logic ==========
          // Determine layout options
          let chartOptions, titleOptions, imageOptions;
          let titleNeedsAutoPosition = true;
          let titlePaddingValue = 10;
          let titleWidthRatio = TITLE_WIDE_WIDTH_RATIO;
          let titleHeightOverride = TITLE_BASE_HEIGHT;
          let layoutReferencePosition = null;
          let preferredPictogramPosition = null;

          // Check if we should use saved positions (highest priority)
          if (preservePositions && currentPositions.chart) {
              // Use saved positions for chart
              chartOptions = {
                  ...currentPositions.chart,
                  maxWidth: canvas.width * 0.9,
                  maxHeight: canvas.height * 0.7
              };

              // Title saved positions - 如果preservePositions为true，直接使用保存的位置，不修改
              if (currentPositions.title) {
                  // 直接使用保存的位置，不做任何修改
                  titleOptions = { ...currentPositions.title };
                  titleNeedsAutoPosition = false;
              } else {
                  titleNeedsAutoPosition = true;
              }

              // Pictogram固定大小，放在chart内部的透明区域
              const pictogramPos = calculatePictogramPosition(chartOptions, canvas.width, canvas.height);
              imageOptions = {
                  maxWidth: FIXED_PICTOGRAM_SIZE,
                  maxHeight: FIXED_PICTOGRAM_SIZE,
                  left: pictogramPos.left,
                  top: pictogramPos.top,
                  originX: 'center',
                  originY: 'center'
              };
          } else if (layout && layout.width && layout.height) {
              // 使用参考图布局：将 layout 按比例缩放到画布中并居中
              console.log('Using reference layout:', layout);

              // 计算缩放比例，使 layout 能够放入画布中（留一些边距）
              const padding = 40; // 画布边距
              const layoutScale = Math.min(
                  (canvas.width - padding * 2) / layout.width,
                  (canvas.height - padding * 2) / layout.height
              );

              // 缩放后的 layout 尺寸
              const scaledLayoutWidth = layout.width * layoutScale;
              const scaledLayoutHeight = layout.height * layoutScale;

              // 计算居中偏移量
              const offsetX = (canvas.width - scaledLayoutWidth) / 2;
              const offsetY = (canvas.height - scaledLayoutHeight) / 2;

              console.log('Layout scale:', layoutScale, 'offsetX:', offsetX, 'offsetY:', offsetY);

              // 辅助函数：计算元素在缩放后的 layout 中的位置和尺寸
              const calculateBoxOptions = (box) => {
                  if (!box) return null;

                  // 框在缩放后 layout 中的位置和尺寸（box的坐标是相对比例）
                  const boxX = offsetX + box.x * scaledLayoutWidth;
                  const boxY = offsetY + box.y * scaledLayoutHeight;
                  const boxWidth = box.width * scaledLayoutWidth;
                  const boxHeight = box.height * scaledLayoutHeight;

                  console.log('Box calculated:', { boxX, boxY, boxWidth, boxHeight });

                  return {
                      // 框的中心位置（用于居中放置元素）
                      centerX: boxX + boxWidth / 2,
                      centerY: boxY + boxHeight / 2,
                      maxWidth: boxWidth,
                      maxHeight: boxHeight,
                      originX: 'center',
                      originY: 'center'
                  };
              };

              // Chart options
              let chartTop = null;
              if (layout.chart) {
                  const chartBox = calculateBoxOptions(layout.chart);
                  chartTop = chartBox.centerY;
                  chartOptions = {
                      left: chartBox.centerX,
                      top: chartBox.centerY,
                      maxWidth: chartBox.maxWidth,
                      maxHeight: chartBox.maxHeight,
                      originX: 'center',
                      originY: 'center'
                  };
                  console.log('Chart options:', chartOptions);
              } else {
                  chartOptions = {
                      maxWidth: canvas.width * 0.9,
                      maxHeight: canvas.height * 0.7,
                      left: canvas.width / 2,
                      top: canvas.height / 2,
                      originX: 'center',
                      originY: 'center'
                  };
                  chartTop = canvas.height / 2;
              }

              // Title options - 确保title在chart上方且居中，宽度为chart的2/3
              // 规则：title.top + title.height + padding = chart.top
              const titleBox = calculateBoxOptions(layout.title);
              const titleMaxHeight = titleBox?.maxHeight || TITLE_BASE_HEIGHT;
              titleHeightOverride = titleMaxHeight;
              titlePaddingValue = 0; // title和chart之间的间距
              titleNeedsAutoPosition = true;

              // Image/Pictogram options - 先尝试使用reference layout中的位置，检查是否重叠
              let referencePosition = null;
              if (layout.image) {
                  const imageBox = calculateBoxOptions(layout.image);
                  if (imageBox) {
                      layoutReferencePosition = {
                          left: imageBox.centerX,
                          top: imageBox.centerY
                      };
                      referencePosition = {
                          left: imageBox.centerX,
                          top: imageBox.centerY
                      };
                      const chartBounds = calculateChartBounds(chartOptions, canvas.width, canvas.height);
                      const overlaps = checkPictogramOverlap(
                          referencePosition.left,
                          referencePosition.top,
                          FIXED_PICTOGRAM_SIZE,
                          chartBounds
                      );
                      if (!overlaps) {
                          console.log('Using reference pictogram position (no overlap):', referencePosition);
                      } else {
                          console.log('Reference pictogram position overlaps with chart, adjusting...');
                          referencePosition = null; // Will trigger fallback calculation
                      }
                  }
              }
              
              // 如果reference位置重叠或不存在，使用调整后的位置（放在chart内部的透明区域）
              const pictogramPos = calculatePictogramPosition(
                  chartOptions, 
                  canvas.width, 
                  canvas.height, 
                  referencePosition
              );
              
              if (!referencePosition) {
                  console.log('Pictogram options (adjusted to chart internal transparent area):', pictogramPos);
              }
              
              imageOptions = {
                  maxWidth: FIXED_PICTOGRAM_SIZE,
                  maxHeight: FIXED_PICTOGRAM_SIZE,
                  left: pictogramPos.left,
                  top: pictogramPos.top,
                  originX: 'center',
                  originY: 'center'
              };
          } else {
              // Default layout (no reference)
              // Chart居中偏下
              const chartTop = canvas.height * 0.65;
              chartOptions = {
                  maxWidth: canvas.width * 0.9,
                  maxHeight: canvas.height * 0.7,
                  left: canvas.width / 2,
                  top: chartTop + (canvas.height * 0.7) / 2,
                  originX: 'center',
                  originY: 'center'
              };

              // Title在chart上方且居中 - 延后到chart渲染完成后再计算
              titleNeedsAutoPosition = true;
              titlePaddingValue = 10;

              // Pictogram固定大小，放在chart内部的透明区域
              const pictogramPos = calculatePictogramPosition(chartOptions, canvas.width, canvas.height);
              imageOptions = {
                  maxWidth: FIXED_PICTOGRAM_SIZE,
                  maxHeight: FIXED_PICTOGRAM_SIZE,
                  left: pictogramPos.left,
                  top: pictogramPos.top,
                  originX: 'center',
                  originY: 'center'
              };
          }

          // 1. Add Chart
          let chartObject = null;
          if (imageUrl) {
            const finalUrl = imageUrl.includes('?') ? imageUrl : `${imageUrl}?t=${Date.now()}`;
            chartObject = await addImage(finalUrl, chartOptions);
          }

          let resolvedChartBounds = getBoundsFromObject(chartObject);
          if (!resolvedChartBounds && chartOptions) {
              resolvedChartBounds = calculateChartBounds(chartOptions, canvas.width, canvas.height);
          }

          if (!preservePositions && chartObject && resolvedChartBounds && imageOptions) {
              preferredPictogramPosition = findTransparentAreaPosition(
                  chartObject,
                  resolvedChartBounds,
                  FIXED_PICTOGRAM_SIZE,
                  layoutReferencePosition
              );
              if (!preferredPictogramPosition) {
                  preferredPictogramPosition = calculateOutsidePictogramPosition(
                      resolvedChartBounds,
                      canvas.width,
                      canvas.height
                  );
              }
              if (preferredPictogramPosition) {
                  imageOptions.left = preferredPictogramPosition.left;
                  imageOptions.top = preferredPictogramPosition.top;
              }
          }

          // 2. Add Title (if exists)
          if (titleImage) {
              const shouldAutoAdjustTitle = titleNeedsAutoPosition || !titleOptions;
              if (titleNeedsAutoPosition || !titleOptions) {
                  titleOptions = calculateTitleOptions(
                      chartOptions,
                      canvas.width,
                      canvas.height,
                      titleWidthRatio,
                      titlePaddingValue,
                      resolvedChartBounds,
                      titleHeightOverride
                  );
              }
              const titleUrl = `/currentfilepath/${titleImage}?t=${Date.now()}`;
              const titleObject = await addImage(titleUrl, { ...titleOptions, trimTransparent: true });
              if (titleObject && shouldAutoAdjustTitle && resolvedChartBounds) {
                  const chartWidth = Math.max(
                      1,
                      resolvedChartBounds.width || (resolvedChartBounds.right - resolvedChartBounds.left)
                  );
                  const currentWidth = titleObject.getScaledWidth();
                  const currentHeight = Math.max(1, titleObject.getScaledHeight());
                  const titleAspectRatio = currentWidth / currentHeight;
                  const desiredWidthRatio =
                      titleAspectRatio < TITLE_ASPECT_THRESHOLD
                          ? TITLE_COMPACT_WIDTH_RATIO
                          : TITLE_WIDE_WIDTH_RATIO;
                  const desiredWidth = chartWidth * desiredWidthRatio;
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

          // 3. Add Pictograms (if exist) - 始终使用固定大小
          if (selectedPictograms && selectedPictograms.length > 0) {
              for (let i = 0; i < selectedPictograms.length; i++) {
                  const pName = selectedPictograms[i];
                  const picUrl = `/currentfilepath/${pName}?t=${Date.now()}`;
                  // Clone options and add offset
                  let currentOptions;
                  
                  // Use saved position if available - 如果preservePositions为true，完全使用保存的位置，不修改
                  if (preservePositions && currentPositions.pictograms[i]) {
                      // 直接使用保存的位置，不做任何修改
                      currentOptions = { ...currentPositions.pictograms[i] };
                  } else {
                      currentOptions = { ...imageOptions };
                      // 确保使用固定大小
                      currentOptions.maxWidth = FIXED_PICTOGRAM_SIZE;
                      currentOptions.maxHeight = FIXED_PICTOGRAM_SIZE;
                      // Add slight offset for multiple images so they don't stack perfectly
                      if (i > 0) {
                          currentOptions.left = (currentOptions.left || 0) + i * 20;
                          currentOptions.top = (currentOptions.top || 0) + i * 20;
                      }
                  }
                  
                  await addImage(picUrl, currentOptions);
              }
          }
          debugCanvasElements();
          canvas.renderAll();
          requestAnimationFrame(() => {
            scrollMainPreviewToCenter();
          });

          // Save initial state after loading
          setTimeout(() => {
            if (canvas && canvas.getObjects().length > 0) {
              const json = JSON.stringify(canvas.toJSON());
              clearSnapshots();
              setHistory([json]);
              setHistoryIndex(0);
              historyRef.current.history = [json];
              historyRef.current.historyIndex = 0;
            }
          }, 100);

      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  // --- Undo/Redo Functions ---
  const handleUndo = () => {
    if (!canvas || historyRef.current.historyIndex <= 0) return;
    const newIndex = historyRef.current.historyIndex - 1;
    const stateJson = historyRef.current.history[newIndex];
    if (stateJson) {
      canvas.loadFromJSON(stateJson, () => {
        canvas.renderAll();
        historyRef.current.historyIndex = newIndex;
        setHistoryIndex(newIndex);
      });
    }
  };

  const handleRedo = () => {
    if (!canvas) return;
    const stateJson = popSnapshot();
    if (!stateJson) return;
    loadStateFromJson(stateJson);
  };

  const handleDelete = () => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      // Save state before deletion
      const json = JSON.stringify(canvas.toJSON());
      pushSnapshot(json);
      setHistory(prev => {
        const currentIndex = historyRef.current.historyIndex;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(json);
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
          historyRef.current.historyIndex = maxHistorySize - 1;
        } else {
          historyRef.current.historyIndex = newHistory.length - 1;
        }
        historyRef.current.history = newHistory;
        return newHistory;
      });
      setHistoryIndex(historyRef.current.historyIndex);

      if (activeObject.type === 'activeSelection') {
        // Multiple objects selected
        activeObject.getObjects().forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
      } else {
        // Single object selected
        canvas.remove(activeObject);
      }
      canvas.renderAll();
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
          const response = await axios.post('/api/export_final', {
              png_base64: pngDataURL,
              background_color: backgroundColor,
              title: titleImage,
              pictogram: selectedPictograms.length > 0 ? selectedPictograms[0] : '',
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
                              pictogram: selectedPictograms.length > 0 ? selectedPictograms[0] : '',
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
  
  const handleImageClick = (image) => {
      setSelectedRefinedImage(image);
      setShowRefinedModal(true);
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
      {/* Left Sidebar: Configuration / Edit */}
      <div className="sidebar">
        <div className="sidebar-header">
          {/* <span>{sidebarView === 'config' ? '图表配置' : '编辑面板'}</span> */}
          <div className="sidebar-view-toggle">
            <button
              className={sidebarView === 'config' ? 'active' : ''}
              onClick={() => setSidebarView('config')}
            >
              图表配置
            </button>
            <button
              className={sidebarView === 'edit' ? 'active' : ''}
              onClick={() => setSidebarView('edit')}
            >
              编辑面板
            </button>
          </div>
        </div>

        <div className="sidebar-scroll">
        {sidebarView === 'config' ? (
          <>
            <div className="config-section">
              <div className="section-title">数据集选择</div>
              <div className="dataset-control">
                <select value={selectedFile} onChange={handleFileSelect} className="dataset-select">
                  <option value="">选择数据集...</option>
                  {csvFiles.map(f => (
                    <option key={f} value={f}>{f.replace('.csv', '')}</option>
                  ))}
                </select>
                <button
                  className="upload-btn"
                  title="预览数据"
                  onClick={handleDataPreview}
                  disabled={!selectedFile}
                  style={{
                    opacity: selectedFile ? 1 : 0.5,
                    cursor: selectedFile ? 'pointer' : 'not-allowed',
                    background: selectedFile ? '#4CAF50' : '#ccc'
                  }}
                >
                  👁️
                </button>
              </div>
            </div>

            {selectedFile && (
              <div className="config-section">
                <div className="section-title">推荐图表类型</div>
                <div className="grid-container">
                  {getPagedData(chartTypes, chartTypePage, CHART_TYPES_PER_PAGE).map(type => {
                    // 检查是否选中（考虑合并类型的情况）
                    const isSelected = type.mergedTypes 
                      ? type.mergedTypes.includes(selectedChartType)
                      : selectedChartType === type.type;
                    
                    return (
                      <div 
                        key={type.type} 
                        className={`grid-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleChartTypeSelect(type)}
                        title={type.mergedTypes ? `合并类型: ${type.mergedTypes.join(', ')}` : type.type}
                        style={{ position: 'relative' }}
                      >
                        <img 
                          src={type.image_url || `/static/chart_types/${type.type}.png`}
                          alt={type.type}
                        />
                        {type.mergedTypes && type.mergedTypes.length > 1 && (
                          <div className="merged-badge" style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            fontSize: '10px',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}>
                            {type.mergedTypes.length}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="pagination">
                  <button disabled={chartTypePage === 0} onClick={() => setChartTypePage(p => p - 1)}>&lt;</button>
                  <span>{chartTypePage + 1} / {Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) || 1}</span>
                  <button disabled={chartTypePage >= Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) - 1} onClick={handleChartTypeNext}>&gt;</button>
                </div>
              </div>
            )}

            {selectedChartType && (
              <div className="config-section">
                <div className="section-title">推荐图表变体</div>
                <div className="grid-container">
                  {getPagedData(variations, variationPage, VARIATIONS_PER_PAGE).map(v => (
                    <div 
                      key={v.name} 
                      className={`grid-item ${selectedVariation === v.name ? 'selected' : ''}`}
                      onClick={() => handleVariationSelect(v.name)}
                    >
                      <img 
                        src={`/currentfilepath/variation_${v.name}.png?t=${previewTimestamp}`}
                        alt={v.name}
                        onError={(e) => {
                          e.target.onerror = null; 
                          e.target.style.display = 'none';
                          e.target.parentNode.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;">${v.name}</div>`;
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="pagination">
                  <button disabled={variationPage === 0} onClick={() => setVariationPage(p => p - 1)}>&lt;</button>
                  <span>{variationPage + 1} / {Math.ceil(totalVariations / VARIATIONS_PER_PAGE) || 1}</span>
                  <button disabled={variationPage >= Math.ceil(totalVariations / VARIATIONS_PER_PAGE) - 1} onClick={handleVariationNext}>&gt;</button>
                </div>
              </div>
            )}

            {selectedVariation && references.length > 0 && (
              <div className="config-section">
                <div className="section-title">推荐参考图片</div>
                <div className="grid-container">
                  {getPagedData(references, referencePage, REFERENCES_PER_PAGE).map(ref => (
                    <div 
                      key={ref} 
                      className={`grid-item ${selectedReference === ref ? 'selected' : ''}`}
                      onClick={() => handleReferenceSelect(ref)}
                    >
                      <img 
                        src={`/infographics/${ref}`}
                        alt={ref}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `/static/images/references/${ref}`; 
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="pagination">
                  <button disabled={referencePage === 0} onClick={() => setReferencePage(p => p - 1)}>&lt;</button>
                  <span>{referencePage + 1} / {Math.ceil(totalReferences / REFERENCES_PER_PAGE) || 1}</span>
                  <button disabled={referencePage >= Math.ceil(totalReferences / REFERENCES_PER_PAGE) - 1} onClick={handleReferenceNext}>&gt;</button>
                </div>

                {selectedReference && (
                  <div className="selected-reference-card" style={{marginTop: '15px', border: '1px solid #e0e0e0', padding: '10px', borderRadius: '6px', position: 'relative', backgroundColor: '#fff'}}>
                    <div style={{fontSize: '1rem', marginBottom: '8px', fontWeight: '600', color: '#333'}}>当前参考图片</div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedReference(''); }}
                      style={{position: 'absolute', top: '5px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#666', padding: 0, lineHeight: 1}}
                      title="Remove selection"
                    >×</button>
                    <img 
                      src={`/infographics/${selectedReference}`}
                      alt="Selected" 
                      style={{width: '50%', height: 'auto', objectFit: 'contain', borderRadius: '4px', border: '1px solid #eee', display: 'block', margin: '0 auto'}}
                      onError={(e) => { e.target.src = `/static/images/references/${selectedReference}`; }}
                    />
                  </div>
                )}
              </div>
            )}

            {selectedVariation && (titleImage || selectedPictograms.length > 0) && (
              <div className="config-section">
                <div className="section-title">元素生成结果</div>

                {titleLoading ? (
                  <div className="asset-group" style={{marginBottom: '15px', position: 'relative'}}>
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                      <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>标题</label>
                      <button disabled style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'not-allowed', opacity: 0.6}}>重新生成</button>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', minHeight: '120px'}}>
                      <div className="loading-spinner" style={{width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px'}}></div>
                      <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center'}}>{titleLoadingText}</div>
                    </div>
                  </div>
                ) : titleOptions.length > 0 ? (
                  <div className="asset-group" style={{marginBottom: '15px'}}>
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                      <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>标题</label>
                      <button onClick={regenerateTitle} style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>重新生成</button>
                    </div>
                    <div className="asset-options-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'}}>
                      {titleOptions.map(opt => (
                        <div 
                          key={opt} 
                          className={`asset-option ${titleImage === opt ? 'selected' : ''}`}
                          onClick={() => setTitleImage(opt)}
                          style={{
                            border: titleImage === opt ? '2px solid #007bff' : '1px solid #eee',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            aspectRatio: '1 / 1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#fff'
                          }}
                        >
                          <img 
                            src={`/currentfilepath/${opt}?t=${previewTimestamp}`}
                            alt="Title Option" 
                            style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  titleImage && (
                    <div className="asset-item">
                      <div>
                        <label>Title</label>
                        <button onClick={regenerateTitle}>重新生成</button>
                      </div>
                      <img src={`/currentfilepath/${titleImage}?t=${Date.now()}`} alt="Title" />
                    </div>
                  )
                )}

                {pictogramLoading ? (
                  <div className="asset-group" style={{position: 'relative'}}>
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                      <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>图像（可多选）</label>
                      <button disabled style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'not-allowed', opacity: 0.6}}>重新生成</button>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', minHeight: '120px'}}>
                      <div className="loading-spinner" style={{width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px'}}></div>
                      <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center'}}>{pictogramLoadingText}</div>
                    </div>
                  </div>
                ) : pictogramOptions.length > 0 ? (
                  <div className="asset-group">
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                      <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>图像（可多选）</label>
                      <button onClick={regeneratePictogram} style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>重新生成</button>
                    </div>
                    <div className="asset-options-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'}}>
                      {pictogramOptions.map(opt => (
                        <div 
                          key={opt} 
                          className={`asset-option ${selectedPictograms.includes(opt) ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedPictograms(prev => prev.includes(opt) ? prev.filter(p => p !== opt) : [...prev, opt]);
                          }}
                          style={{
                            border: selectedPictograms.includes(opt) ? '2px solid #007bff' : '1px solid #eee',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            aspectRatio: '1 / 1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#fff',
                            position: 'relative'
                          }}
                        >
                          {selectedPictograms.includes(opt) && (
                            <div style={{position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', background: '#007bff', borderRadius: '50%', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✓</div>
                          )}
                          <img 
                            src={`/currentfilepath/${opt}?t=${previewTimestamp}`}
                            alt="Pictogram Option" 
                            style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  selectedPictograms.length > 0 && (
                    <div className="asset-item">
                      <div>
                        <label>Pictogram</label>
                        <button onClick={regeneratePictogram}>重新生成</button>
                      </div>
                      <img src={`/currentfilepath/${selectedPictograms[0]}?t=${Date.now()}`} alt="Pictogram" />
                    </div>
                  )
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="config-section">
              <div className="section-title">背景颜色</div>
              <div className="color-options" style={{marginBottom: '10px'}}>
                {['#ffffff', '#f5f3ef', '#f0f0f0', '#e8f4f8', '#fff9e6', '#f0fff0', '#fff0f5', '#f5f5dc'].map(c => (
                  <div 
                    key={c} 
                    className="color-swatch" 
                    style={{
                      backgroundColor: c,
                      border: bgColor === c ? '3px solid #667eea' : '1px solid #ddd',
                      boxShadow: bgColor === c ? '0 0 0 2px rgba(102, 126, 234, 0.2)' : 'none'
                    }}
                    onClick={() => handleBgColorChange(c)}
                    title={c}
                  />
                ))}
              </div>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px'}}>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => handleBgColorChange(e.target.value)}
                  style={{
                    width: '35px',
                    height: '36px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      setBgColor(value);
                      if (value.length === 7) {
                        handleBgColorChange(value);
                      }
                    }
                  }}
                  placeholder="#ffffff"
                  style={{
                    width: '90px',
                    padding: '8px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div className="section-title">精修提示词</div>
              <textarea 
                className="prompt-input" 
                placeholder="Enter prompt for refinement..."
                value={editConfig.prompt}
                onChange={(e) => setEditConfig({...editConfig, prompt: e.target.value})}
              />
            </div>

            <div className="config-section">
              <div className="section-title">AI 精修</div>
              <button 
                className="refine-btn"
                onClick={handleRefine}
                disabled={isRefining}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                  fontSize: '1rem',
                  cursor: isRefining ? 'not-allowed' : 'pointer',
                  opacity: isRefining ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(72, 187, 120, 0.3)'
                }}
              >
                <span style={{fontSize: '18px'}}>✨</span>
                <span>{isRefining ? '正在精修...' : 'AI 精修'}</span>
              </button>
            </div>

            <div className="config-section">
              <div className="section-title">精修历史</div>
              {refinedImages.length > 0 ? (
                <div className="refined-gallery-grid">
                  {refinedImages.map((image, index) => (
                    <div 
                      key={image.timestamp}
                      className="refined-gallery-item"
                      onClick={() => handleImageClick(image)}
                      title={`点击查看大图 - ${new Date(image.timestamp).toLocaleTimeString()}`}
                    >
                      <img src={image.url} alt={`Refined ${index + 1}`} />
                      <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px'
                      }}>
                        #{refinedImages.length - index}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="refined-gallery-empty">
                  <div className="refined-gallery-empty-icon">🎨</div>
                  <div className="refined-gallery-empty-text">
                    还没有精修图片<br/>
                    点击“AI 精修”按钮开始
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="main-preview" ref={mainPreviewRef}>
        <div className="preview-toolbar">
          <div className="preview-header">可编辑画布</div>
          <div className="canvas-controls">
            <button 
              onClick={handleDelete}
              disabled={!canvas || !hasSelection}
              style={{
                padding: '8px 16px',
                background: (!canvas || !hasSelection) ? '#e0e0e0' : '#ef4444',
                color: (!canvas || !hasSelection) ? '#999' : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (!canvas || !hasSelection) ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                opacity: (!canvas || !hasSelection) ? 0.5 : 1
              }}
              title="删除选中元素 (Delete)"
            >
              删除
            </button>
            <button
              onClick={handleDownloadCanvas}
              disabled={!canvas}
              style={{
                padding: '8px 16px',
                background: !canvas ? '#e0e0e0' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: !canvas ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                opacity: !canvas ? 0.5 : 1
              }}
              title="裁剪导出当前画布内容"
            >
              下载
            </button>
          </div>
        </div>
        <div className="canvas-wrapper" ref={canvasWrapperRef}>
          <canvas id="workbenchCanvas" />
        </div>
  
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">{loadingText}</div>
        </div>
      )}
      
      {/* Refined Image Zoom Modal */}
      {showRefinedModal && selectedRefinedImage && (
        <div className="refined-preview-modal" onClick={() => setShowRefinedModal(false)}>
          <div className="refined-preview-content" onClick={(e) => e.stopPropagation()}>
            <div className="refined-preview-header">
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
                <span>✨</span>
                <span>AI 精修版 - 放大查看</span>
              </h3>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <button 
                  onClick={() => downloadRefinedImage(selectedRefinedImage.url)}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>下载</span>
                </button>
                <button 
                  className="close-btn" 
                  onClick={() => setShowRefinedModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: 0
                  }}
                >×</button>
              </div>
            </div>
            <div className="refined-image-container" style={{marginTop: '20px', textAlign: 'center'}}>
              <img 
                src={selectedRefinedImage.url} 
                alt="Refined" 
                style={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  borderRadius: '8px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Data Preview Modal */}
      {showDataPreview && previewData && (
        <div className="refined-preview-modal" onClick={() => setShowDataPreview(false)}>
          <div className="refined-preview-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '90%', width: '1000px'}}>
            <div className="refined-preview-header">
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
                <span>📊</span>
                <span>数据预览 - {selectedFile.replace('.csv', '')}</span>
              </h3>
              <button
                className="close-btn"
                onClick={() => setShowDataPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: 0
                }}
              >×</button>
            </div>
            <div style={{marginTop: '20px', maxHeight: '70vh', overflowY: 'auto'}}>
              {previewData.columns && previewData.rows && (
                <div>
                  <div style={{marginBottom: '15px', color: '#666', fontSize: '14px'}}>
                    共 {previewData.total_rows || previewData.rows.length} 行数据，显示前 {previewData.rows.length} 行
                  </div>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <thead>
                      <tr style={{background: '#f5f5f5'}}>
                        {previewData.columns.map((col, idx) => (
                          <th key={idx} style={{
                            padding: '12px',
                            textAlign: 'left',
                            borderBottom: '2px solid #ddd',
                            fontWeight: '600',
                            color: '#333'
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} style={{
                          background: rowIdx % 2 === 0 ? 'white' : '#fafafa',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = rowIdx % 2 === 0 ? 'white' : '#fafafa'}
                        >
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} style={{
                              padding: '10px 12px',
                              borderBottom: '1px solid #eee',
                              color: '#555'
                            }}>
                              {cell !== null && cell !== undefined ? String(cell) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Workbench;
