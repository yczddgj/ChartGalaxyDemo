import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { fabric } from 'fabric';
import './Workbench.css';

function Workbench() {
  // --- State: Data ---
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  
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
  const [canvas, setCanvas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());

  // --- State: Edit Panel ---
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [editConfig, setEditConfig] = useState({
    colorScheme: 'default',
    textSize: 'medium',
    textStyle: 'normal',
    prompt: `You are given two images:

1. **Reference Image**: An infographic with a specific visual style (colors, layout, typography, design elements)
2. **Current Image**: A newly generated infographic that needs to be refined

Your task is to refine the Current Image by applying the visual style from the Reference Image, while preserving all the data, content, and information from the Current Image.

Specifically:
- Match the color palette from the Reference Image
- Apply similar design aesthetics (shapes, icons, decorative elements)
- Use similar typography style if applicable
- Preserve the layout structure of the Current Image
- Fix visual defects (blurry text, distorted shapes)
- Ensure stability and consistency of **title, chart, pictogram**
- Keep the core content of **title, chart, pictogram** from the Current Image unchanged

Generate a high-quality infographic that looks like it was created with the same design system as the Reference Image.`
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

  // --- Initialization ---
  useEffect(() => {
    // Fetch Files
    axios.get('/api/files')
      .then(res => setCsvFiles(res.data.files))
      .catch(err => console.error(err));

    // Initialize Canvas
    const container = document.querySelector('.canvas-wrapper');
    const canvasWidth = container ? container.clientWidth - 80 : 800;
    const canvasHeight = container ? container.clientHeight - 80 : 600;
    
    const initialBgColor = '#ffffff';
    const c = new fabric.Canvas('workbenchCanvas', {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: initialBgColor,
      selection: true,
      preserveObjectStacking: true
    });
    setCanvas(c);
    setBgColor(initialBgColor);
    
    // Set canvas wrapper background color
    if (container) {
        container.style.backgroundColor = initialBgColor;
    }

    // Resize canvas on window resize
    const resizeCanvas = () => {
        const container = document.querySelector('.canvas-wrapper');
        if (container && c) {
            const newWidth = container.clientWidth - 80;
            const newHeight = container.clientHeight - 80;
            c.setWidth(newWidth);
            c.setHeight(newHeight);
            c.renderAll();
        }
    };
    window.addEventListener('resize', resizeCanvas);

    return () => {
      c.dispose();
      window.removeEventListener('resize', resizeCanvas);
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

  const pollStatus = (callback, targetStep) => {
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
          setLoading(false);
          callback(res.data);
        }
      } catch (err) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 500);
  };

  // --- Logic: Chart Types ---
  const fetchChartTypes = async () => {
    setLoading(true);
    setLoadingText('Loading chart types...');
    try {
      const res = await axios.get('/api/chart_types');
      setTotalChartTypes(res.data.total);
      setChartTypes(res.data.chart_types);
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
            setChartTypes(prev => {
                const newItems = res.data.chart_types.filter(item => !prev.some(p => p.type === item.type));
                return [...prev, ...newItems];
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

  const handleChartTypeSelect = async (type) => {
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

    setSelectedChartType(type);
    setLoading(true);
    setLoadingText('Loading variations...');
    try {
      await axios.get(`/api/chart_types/select/${type}`);
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
      }, 'layout_extraction');
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
      setLoadingText('Generating title...');
      try {
          await axios.get(`/api/start_title_generation/${selectedFile}`);
          pollStatus(async (statusData) => {
              // Update title image state
              const options = statusData.title_options ? Object.keys(statusData.title_options).sort() : ['title_0.png'];
              setTitleOptions(options);
              const newTitleImage = options[0];
              setTitleImage(newTitleImage);
              
              // 3. Generate Pictogram
              // Use the text from the first generated title
              const titleText = statusData.title_options && statusData.title_options[newTitleImage] 
                                ? statusData.title_options[newTitleImage].title_text 
                                : (statusData.selected_title || 'InfoGraphic');
                                
              await generatePictogram(titleText, newTitleImage);
          }, 'title_generation');
      } catch (err) {
          console.error(err);
          setLoading(false);
      }
  };

  const regenerateTitle = async () => {
      setLoading(true);
      setLoadingText('Regenerating title...');
      try {
          await axios.get(`/api/regenerate_title/${selectedFile}`);
          pollStatus(async (statusData) => {
              const options = statusData.title_options ? Object.keys(statusData.title_options).sort() : ['title_0.png'];
              setTitleOptions(options);
              setTitleImage(options[0]);
              setLoading(false);
          }, 'title_generation');
      } catch (err) {
          console.error(err);
          setLoading(false);
      }
  };

  const generatePictogram = async (titleText, currentTitleImage = null) => {
      setLoadingText('Generating pictogram...');
      try {
          // If titleText is not provided (e.g. manual regeneration), try to get it or use default
          const text = titleText || 'InfoGraphic'; 
          await axios.get(`/api/start_pictogram_generation/${encodeURIComponent(text)}`);
          pollStatus((statusData) => {
              const options = statusData.pictogram_options ? Object.keys(statusData.pictogram_options).sort() : ['pictogram_0.png'];
              setPictogramOptions(options);
              const newPictograms = [options[0]];
              setSelectedPictograms(newPictograms);
              setLoading(false);
              
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
          }, 'pictogram_generation');
      } catch (err) {
          console.error(err);
          setLoading(false);
      }
  };

  const regeneratePictogram = async () => {
      setLoading(true);
      setLoadingText('Regenerating pictogram...');
      try {
          const text = 'InfoGraphic'; 
          await axios.get(`/api/regenerate_pictogram/${encodeURIComponent(text)}`);
          pollStatus((statusData) => {
              const options = statusData.pictogram_options ? Object.keys(statusData.pictogram_options).sort() : ['pictogram_0.png'];
              setPictogramOptions(options);
              setSelectedPictograms([options[0]]);
              setLoading(false);
          }, 'pictogram_generation');
      } catch (err) {
          console.error(err);
          setLoading(false);
      }
  };

  // Auto-reload canvas when assets change
  useEffect(() => {
      if (selectedVariation && (titleImage || selectedPictograms.length > 0)) {
          // Use direct URL for chart to avoid re-generation, and overlay assets in frontend
          // Pass true to indicate we should preserve positions
          loadChartToCanvas(selectedVariation, `/currentfilepath/variation_${selectedVariation}.png`, true);
      }
  }, [titleImage, selectedPictograms]);

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
          let bgColor = '#ffffff';
          let layout = null;

          if (directUrl) {
              // Load directly from the generated file (PNG)
              imageUrl = directUrl;
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
              bgColor = res.data.bg_color;
              layout = res.data.layout;
          }
          
          canvas.clear();
          // Use background color from response or keep current canvas background
          let canvasBgColor = bgColor || canvas.backgroundColor || '#ffffff';
          if (canvasBgColor) {
            canvas.setBackgroundColor(canvasBgColor, canvas.renderAll.bind(canvas));
            setBgColor(canvasBgColor);
            
            // Also apply to canvas wrapper
            const canvasWrapper = document.querySelector('.canvas-wrapper');
            if (canvasWrapper) {
                canvasWrapper.style.backgroundColor = canvasBgColor;
            }
          }

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

          // Check if we should use saved positions (highest priority)
          if (preservePositions && currentPositions.chart) {
              // Use saved positions for chart
              chartOptions = {
                  ...currentPositions.chart,
                  maxWidth: canvas.width * 0.9,
                  maxHeight: canvas.height * 0.7
              };
          } else if (layout && layout.chart) {
              // Use layout from backend (from reference)
              console.log('Using reference layout:', layout);
              chartOptions = {
                  left: layout.chart.x * canvas.width,
                  top: layout.chart.y * canvas.height,
                  maxWidth: layout.chart.width * canvas.width,
                  maxHeight: layout.chart.height * canvas.height,
                  originX: 'left',
                  originY: 'top'
              };
          } else {
              // Default layout
              chartOptions = {
                  maxWidth: canvas.width * 0.9,
                  maxHeight: canvas.height * 0.7,
                  left: canvas.width * 0.05,
                  top: canvas.height * 0.15,
                  originX: 'left',
                  originY: 'top'
              };
          }

          // Title options
          if (preservePositions && currentPositions.title) {
              titleOptions = currentPositions.title;
          } else if (layout && layout.title) {
              titleOptions = {
                  left: layout.title.x * canvas.width,
                  top: layout.title.y * canvas.height,
                  maxWidth: layout.title.width * canvas.width,
                  maxHeight: layout.title.height * canvas.height,
                  originX: 'left',
                  originY: 'top'
              };
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

          // Image/Pictogram options
          if (layout && layout.image) {
              imageOptions = {
                  left: layout.image.x * canvas.width,
                  top: layout.image.y * canvas.height,
                  maxWidth: layout.image.width * canvas.width,
                  maxHeight: layout.image.height * canvas.height,
                  originX: 'left',
                  originY: 'top'
              };
          } else {
              imageOptions = {
                  maxWidth: 200,
                  maxHeight: 200,
                  left: canvas.width - 220,
                  top: canvas.height - 220,
                  originX: 'left',
                  originY: 'top'
              };
          }

          // 1. Add Chart
          if (imageUrl) {
            const finalUrl = imageUrl.includes('?') ? imageUrl : `${imageUrl}?t=${Date.now()}`;
            await addImage(finalUrl, chartOptions);
          }

          // 2. Add Title (if exists)
          if (titleImage) {
              const titleUrl = `/currentfilepath/${titleImage}?t=${Date.now()}`;
              await addImage(titleUrl, titleOptions);
          }

          // 3. Add Pictograms (if exist)
          if (selectedPictograms && selectedPictograms.length > 0) {
              for (let i = 0; i < selectedPictograms.length; i++) {
                  const pName = selectedPictograms[i];
                  const picUrl = `/currentfilepath/${pName}?t=${Date.now()}`;
                  // Clone options and add offset
                  let currentOptions;
                  
                  // Use saved position if available
                  if (preservePositions && currentPositions.pictograms[i]) {
                      currentOptions = currentPositions.pictograms[i];
                  } else {
                      currentOptions = { ...imageOptions };
                      // Add slight offset for multiple images so they don't stack perfectly
                      if (i > 0) {
                          currentOptions.left = (currentOptions.left || 0) + i * 20;
                          currentOptions.top = (currentOptions.top || 0) + i * 20;
                      }
                  }
                  
                  await addImage(picUrl, currentOptions);
              }
          }

          canvas.renderAll();

      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
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
          const response = await axios.post('/api/export_final', {
              png_base64: pngDataURL,
              background_color: backgroundColor
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
                      // Success! Add refined image to the list
                      const refinedUrl = `/api/download_final?t=${Date.now()}`;
                      setRefinedImages(prev => [...prev, {
                          url: refinedUrl,
                          timestamp: Date.now()
                      }]);
                      // Keep edit panel open to show the result
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
      {/* Left Sidebar: Configuration */}
      <div className="sidebar">
        <div className="sidebar-header">图表配置</div>
        
        {/* Dataset Section */}
        <div className="config-section">
          <div className="section-title">数据集选择</div>
          <div className="dataset-control">
            <select value={selectedFile} onChange={handleFileSelect} className="dataset-select">
              <option value="">选择数据集...</option>
              {csvFiles.map(f => (
                <option key={f} value={f}>{f.replace('.csv', '')}</option>
              ))}
            </select>
            <button className="upload-btn" title="Upload (Not Supported)" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>↑</button>
          </div>
        </div>

        {/* Types Section */}
        {selectedFile && (
        <div className="config-section">
          <div className="section-title">推荐图表类型</div>
          <div className="grid-container">
            {getPagedData(chartTypes, chartTypePage, CHART_TYPES_PER_PAGE).map(type => (
               <div 
                 key={type.type} 
                 className={`grid-item ${selectedChartType === type.type ? 'selected' : ''}`}
                 onClick={() => handleChartTypeSelect(type.type)}
               >
                 <img 
                    src={type.image_url || `/static/chart_types/${type.type}.png`}
                    alt={type.type}
                    onError={(e) => {
                        e.target.onerror = null; 
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;">${type.type}</div>`;
                    }}
                 />
               </div>
            ))}
          </div>
          {/* Pagination */}
          <div className="pagination">
             <button disabled={chartTypePage === 0} onClick={() => setChartTypePage(p => p - 1)}>&lt;</button>
             <span>{chartTypePage + 1} / {Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) || 1}</span>
             <button disabled={chartTypePage >= Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) - 1} onClick={handleChartTypeNext}>&gt;</button>
          </div>
        </div>
        )}

        {/* Variation Section */}
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
          {/* Pagination */}
          <div className="pagination">
             <button disabled={variationPage === 0} onClick={() => setVariationPage(p => p - 1)}>&lt;</button>
             <span>{variationPage + 1} / {Math.ceil(totalVariations / VARIATIONS_PER_PAGE) || 1}</span>
             <button disabled={variationPage >= Math.ceil(totalVariations / VARIATIONS_PER_PAGE) - 1} onClick={handleVariationNext}>&gt;</button>
          </div>
        </div>
        )}

        {/* Reference Section */}
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
                        // Try static path if infographics fails
                        e.target.src = `/static/images/references/${ref}`; 
                    }}
                 />
               </div>
            ))}
          </div>
          {/* Pagination */}
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

        {/* Assets Section */}
        {selectedVariation && (titleImage || selectedPictograms.length > 0) && (
        <div className="config-section">
            <div className="section-title">元素生成结果</div>
            
            {/* Title Selection */}
            {titleOptions.length > 0 ? (
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
                /* Fallback for legacy state or single image */
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

            {/* Pictogram Selection */}
            {pictogramOptions.length > 0 ? (
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
                                    setSelectedPictograms(prev => {
                                        if (prev.includes(opt)) {
                                            return prev.filter(p => p !== opt);
                                        } else {
                                            return [...prev, opt];
                                        }
                                    });
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
                /* Fallback */
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
      </div>

      {/* Main Preview Area */}
      <div className="main-preview">
        <div className="preview-header">可编辑画布</div>
        <div className="canvas-wrapper">
            <canvas id="workbenchCanvas" />
        </div>
        
        {/* Edit Button */}
        <button className="edit-fab" onClick={() => setShowEditPanel(!showEditPanel)}>
            进一步编辑
        </button>

        {/* Edit Panel (Floating) */}
        {showEditPanel && (
            <div className="edit-panel">
                <div className="edit-panel-header">
                    <span>✏️ 进一步编辑</span>
                    <button className="close-btn" onClick={() => { setShowEditPanel(false); }}>×</button>
                </div>
                
                <div className="edit-panel-content">
                {/* Left Column: Controls */}
                <div className="edit-controls-column">
                <div className="edit-controls-row">
                    <div className="edit-row">
                        <label>背景颜色</label>
                        <div className="color-options" style={{marginBottom: '10px'}}>
                            {/* Common background colors */}
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
                        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <input 
                                type="color" 
                                value={bgColor} 
                                onChange={(e) => handleBgColorChange(e.target.value)}
                                style={{
                                    width: '50px',
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
                                    flex: 1,
                                    padding: '8px 12px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>
                    </div>
                    
                    <div className="edit-row">
                        <label>精修提示词 (Prompt)</label>
                        <textarea 
                            className="prompt-input" 
                            placeholder="Enter prompt for refinement..."
                            value={editConfig.prompt}
                            onChange={(e) => setEditConfig({...editConfig, prompt: e.target.value})}
                        />
                    </div>
                </div>
                
                <div className="edit-row">
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
                </div>
                
                {/* Right Column: Refined Images Gallery */}
                <div className="refined-gallery-column">
                    <div className="refined-gallery-header">
                        <span className="refined-gallery-title">✨ 精修历史</span>
                        <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>
                            {refinedImages.length} 张图片
                        </span>
                    </div>
                    
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
                                点击左侧的"AI 精修"按钮开始
                            </div>
                        </div>
                    )}
                </div>
                </div>
            </div>
        )}
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
                  <span>⬇️</span>
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
    </div>
  );
}

export default Workbench;
