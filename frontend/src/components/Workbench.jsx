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
  const [editConfig, setEditConfig] = useState({
    colorScheme: 'default',
    textSize: 'medium',
    textStyle: 'normal',
    prompt: ''
  });

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

  // --- Initialization ---
  useEffect(() => {
    // Fetch Files
    axios.get('/api/files')
      .then(res => setCsvFiles(res.data.files))
      .catch(err => console.error(err));

    // Initialize Canvas
    const c = new fabric.Canvas('workbenchCanvas', {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true
    });
    setCanvas(c);

    // Resize canvas on window resize (optional, simple implementation)
    const resizeCanvas = () => {
        const container = document.querySelector('.main-preview');
        if (container) {
            // c.setWidth(container.clientWidth);
            // c.setHeight(container.clientHeight);
            // c.renderAll();
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
    // Start asset generation
    generateTitle();
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
    // Assets are already generated, do not reset

    setSelectedReference(refName);
    // Just trigger extraction in background, do not block UI or update canvas
    try {
      const dataName = selectedFile.replace('.csv', '');
      // 1. Extract Layout/Style
      axios.get(`/api/start_layout_extraction/${refName}/${dataName}`);
    } catch (err) {
      console.error(err);
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
              
              // Fetch references after assets are generated
              fetchReferences();
              
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
          loadChartToCanvas(selectedVariation, `/currentfilepath/variation_${selectedVariation}.png`);
      }
  }, [titleImage, selectedPictograms]);

  const loadChartToCanvas = async (variationName, directUrl = null) => {
      if (!canvas || !selectedFile) return;
      setLoading(true);
      setLoadingText('Updating canvas...');
      
      try {
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
          if (bgColor) {
            canvas.setBackgroundColor(bgColor, canvas.renderAll.bind(canvas));
          }

          const addImage = (url, options) => {
              return new Promise((resolve) => {
                  fabric.Image.fromURL(url, (img) => {
                      if (img) {
                          // Calculate scale to fit within maxWidth/maxHeight if provided
                          if (options.maxWidth && options.maxHeight) {
                              const scale = Math.min(
                                  options.maxWidth / img.width,
                                  options.maxHeight / img.height,
                                  1 // Don't scale up beyond original size? Or maybe allow it?
                                  // main.html logic: Math.min(maxWidth / img.width, maxHeight / img.height, 1)
                              );
                              img.scale(scale);
                          } else if (options.scaleX && options.scaleY) {
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
          let chartOptions = {
              maxWidth: canvas.width * 0.9,
              maxHeight: canvas.height * 0.7,
              left: canvas.width * 0.05,
              top: canvas.height * 0.15,
              originX: 'left',
              originY: 'top'
          };
          let titleOptions = {
              maxWidth: 400,
              maxHeight: 150,
              left: 20,
              top: 20,
              originX: 'left',
              originY: 'top'
          };
          let imageOptions = {
              maxWidth: 200,
              maxHeight: 200,
              left: canvas.width - 220,
              top: canvas.height - 220,
              originX: 'left',
              originY: 'top'
          };

          if (layout) {
              console.log('Using reference layout:', layout);
              if (layout.chart) {
                  chartOptions = {
                      left: layout.chart.x * canvas.width,
                      top: layout.chart.y * canvas.height,
                      maxWidth: layout.chart.width * canvas.width,
                      maxHeight: layout.chart.height * canvas.height,
                      originX: 'left',
                      originY: 'top'
                  };
              }
              if (layout.title) {
                  titleOptions = {
                      left: layout.title.x * canvas.width,
                      top: layout.title.y * canvas.height,
                      maxWidth: layout.title.width * canvas.width,
                      maxHeight: layout.title.height * canvas.height,
                      originX: 'left',
                      originY: 'top'
                  };
              }
              if (layout.image) {
                  imageOptions = {
                      left: layout.image.x * canvas.width,
                      top: layout.image.y * canvas.height,
                      maxWidth: layout.image.width * canvas.width,
                      maxHeight: layout.image.height * canvas.height,
                      originX: 'left',
                      originY: 'top'
                  };
              }
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
                  const currentOptions = { ...imageOptions };
                  // Add slight offset for multiple images so they don't stack perfectly
                  if (i > 0) {
                      currentOptions.left = (currentOptions.left || 0) + i * 20;
                      currentOptions.top = (currentOptions.top || 0) + i * 20;
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
        <div className="sidebar-header">Configuration</div>
        
        {/* Dataset Section */}
        <div className="config-section">
          <div className="section-title">Dataset</div>
          <div className="dataset-control">
            <select value={selectedFile} onChange={handleFileSelect} className="dataset-select">
              <option value="">Select Dataset...</option>
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
          <div className="section-title">Types</div>
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
          <div className="section-title">Variation</div>
          <div className="grid-container">
            {getPagedData(variations, variationPage, VARIATIONS_PER_PAGE).map(v => (
               <div 
                 key={v.name} 
                 className={`grid-item ${selectedVariation === v.name ? 'selected' : ''}`}
                 onClick={() => handleVariationSelect(v.name)}
               >
                 <img 
                    src={`/currentfilepath/variation_${v.name}.svg?t=${previewTimestamp}`}
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

        {/* Assets Section */}
        {selectedVariation && (titleImage || selectedPictograms.length > 0) && (
        <div className="config-section">
            <div className="section-title">Generated Assets</div>
            
            {/* Title Selection */}
            {titleOptions.length > 0 ? (
                <div className="asset-group" style={{marginBottom: '15px'}}>
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <label style={{fontSize: '12px', fontWeight: '600', color: '#666'}}>Title</label>
                        <button onClick={regenerateTitle} style={{fontSize: '10px', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>Regenerate</button>
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
                            <button onClick={regenerateTitle}>Regenerate</button>
                        </div>
                        <img src={`/currentfilepath/${titleImage}?t=${Date.now()}`} alt="Title" />
                    </div>
                )
            )}

            {/* Pictogram Selection */}
            {pictogramOptions.length > 0 ? (
                <div className="asset-group">
                    <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <label style={{fontSize: '12px', fontWeight: '600', color: '#666'}}>Pictogram (Multi-select)</label>
                        <button onClick={regeneratePictogram} style={{fontSize: '10px', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>Regenerate</button>
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
                            <button onClick={regeneratePictogram}>Regenerate</button>
                        </div>
                        <img src={`/currentfilepath/${selectedPictograms[0]}?t=${Date.now()}`} alt="Pictogram" />
                    </div>
                )
            )}
        </div>
        )}

        {/* Reference Section */}
        {selectedVariation && references.length > 0 && (
        <div className="config-section">
          <div className="section-title">Reference Style</div>
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
                  <div style={{fontSize: '12px', marginBottom: '8px', fontWeight: '600', color: '#333'}}>Example Selected</div>
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
      </div>

      {/* Main Preview Area */}
      <div className="main-preview">
        <div className="preview-header">预览图</div>
        <div className="canvas-wrapper">
            <canvas id="workbenchCanvas" />
        </div>
        
        {/* Edit Button */}
        <button className="edit-fab" onClick={() => setShowEditPanel(!showEditPanel)}>
            Edit
        </button>

        {/* Edit Panel (Floating) */}
        {showEditPanel && (
            <div className="edit-panel">
                <div className="edit-panel-header">
                    <span>Edit Configuration</span>
                    <button className="close-btn" onClick={() => setShowEditPanel(false)}>×</button>
                </div>
                <div className="edit-row">
                    <label>Color</label>
                    <div className="color-options">
                        {/* Mock D3 Schemes */}
                        {['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'].map(c => (
                            <div key={c} className="color-swatch" style={{backgroundColor: c}} />
                        ))}
                        <a href="#" className="d3-link">d3 Scheme</a>
                    </div>
                </div>
                <div className="edit-row">
                    <label>Text</label>
                    <div className="text-controls">
                        <select defaultValue="Medium">
                            <option>Small</option>
                            <option>Medium</option>
                            <option>Large</option>
                        </select>
                        <select defaultValue="Normal">
                            <option>Normal</option>
                            <option>Bold</option>
                            <option>Italic</option>
                        </select>
                        <input type="color" title="Text Color" style={{marginLeft: '5px', height: '24px', width: '24px', border: 'none', padding: 0, cursor: 'pointer'}} />
                    </div>
                </div>
                <div className="edit-row">
                    <label>Prompt</label>
                    <textarea 
                        className="prompt-input" 
                        placeholder="Enter prompt for refinement..."
                        value={editConfig.prompt}
                        onChange={(e) => setEditConfig({...editConfig, prompt: e.target.value})}
                    />
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
    </div>
  );
}

export default Workbench;
