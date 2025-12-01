import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Wizard() {
  const navigate = useNavigate();
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [tableData, setTableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [generationId, setGenerationId] = useState(null);
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());
  const [currentChartSVG, setCurrentChartSVG] = useState('');
  const [aiResultImage, setAiResultImage] = useState('');
  
  // Steps: 'data', 'chartType', 'variation', 'reference', 'title', 'pictogram', 'aiResult'
  const [currentStep, setCurrentStep] = useState('data');

  // State for each step
  const [chartTypes, setChartTypes] = useState([]);
  const [selectedChartType, setSelectedChartType] = useState('');
  
  const [variations, setVariations] = useState([]);
  const [selectedVariation, setSelectedVariation] = useState('');
  
  const [references, setReferences] = useState({ main: null, others: [] });
  const [selectedReference, setSelectedReference] = useState('');
  
  const [titles, setTitles] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [titleText, setTitleText] = useState(''); // Need to fetch text for pictogram generation
  
  const [pictograms, setPictograms] = useState([]);
  const [selectedPictogram, setSelectedPictogram] = useState('');

  useEffect(() => {
    axios.get('/api/files')
      .then(res => setCsvFiles(res.data.files))
      .catch(err => console.error(err));
  }, []);

  const pollStatus = (callback) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/status');
        if (res.data.id) {
            setGenerationId(res.data.id);
        }
        if (res.data.completed) {
          clearInterval(interval);
          setLoading(false);
          callback(res.data);
        }
      } catch (err) {
        clearInterval(interval);
        setLoading(false);
        console.error(err);
      }
    }, 1000);
  };

  // Step 1: Data Selection
  const handleFileSelect = async (e) => {
    const file = e.target.value;
    setSelectedFile(file);
    if (file) {
      setLoading(true);
      setLoadingText('加载数据中...');
      try {
        const res = await axios.get(`/api/data/${file}`);
        setTableData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setTableData(null);
    }
  };

  const startChartTypeSelection = async () => {
    setLoading(true);
    setLoadingText('正在分析数据并寻找适配图表...');
    try {
      await axios.get(`/api/start_find_reference/${selectedFile}`);
      pollStatus(() => {
        fetchChartTypes();
        setCurrentStep('chartType');
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // Step 2: Chart Type Selection
  const fetchChartTypes = async () => {
    try {
      const res = await axios.get('/api/chart_types');
      setChartTypes(res.data.chart_types);
      
      setLoading(true);
      setLoadingText('正在生成预览图...');
      await axios.get('/api/chart_types/generate_previews');
      pollStatus(() => {
        setPreviewTimestamp(Date.now());
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadMoreChartTypes = async () => {
    try {
      const res = await axios.get('/api/chart_types/next');
      setChartTypes(res.data.chart_types);
      
      setLoading(true);
      setLoadingText('正在生成预览图...');
      await axios.get('/api/chart_types/generate_previews');
      pollStatus(() => {
        setPreviewTimestamp(Date.now());
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const selectChartType = async (type) => {
    setSelectedChartType(type);
    setLoading(true);
    setLoadingText('正在加载图表样式...');
    try {
      await axios.get(`/api/chart_types/select/${type}`);
      await fetchVariations();
      setCurrentStep('variation');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Variation Selection
  const fetchVariations = async () => {
    try {
      const res = await axios.get('/api/variations');
      setVariations(res.data.variations);
      
      setLoading(true);
      setLoadingText('正在生成样式预览...');
      await axios.get('/api/variations/generate_previews');
      pollStatus(() => {
        setPreviewTimestamp(Date.now());
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadMoreVariations = async () => {
    try {
      const res = await axios.get('/api/variations/next');
      setVariations(res.data.variations);
      
      setLoading(true);
      setLoadingText('正在生成样式预览...');
      await axios.get('/api/variations/generate_previews');
      pollStatus(() => {
        setPreviewTimestamp(Date.now());
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const selectVariation = async (variationName) => {
    setSelectedVariation(variationName);
    setLoading(true);
    setLoadingText('正在加载参考图表...');
    try {
      // Fetch SVG content for AI generation
      const svgUrl = `/currentfilepath/variation_${variationName}.svg`;
      try {
        const svgRes = await axios.get(svgUrl);
        setCurrentChartSVG(svgRes.data);
      } catch (e) {
        console.warn("Failed to fetch SVG content", e);
      }

      await fetchReferences();
      setCurrentStep('reference');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Reference Selection
  const fetchReferences = async () => {
    try {
      const res = await axios.get('/api/references');
      setReferences({
        main: res.data.main_image,
        others: res.data.random_images
      });
    } catch (err) {
      console.error(err);
    }
  };

  const loadMoreReferences = async () => {
    try {
      const res = await axios.get('/api/references');
      // Append new random images to others
      setReferences(prev => ({
        ...prev,
        others: [...prev.others, ...res.data.random_images]
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const selectReference = async (ref) => {
    if (ref === 'ai_direct') {
        await directGenerateWithAI();
        return;
    }

    setSelectedReference(ref);
    setLoading(true);
    setLoadingText('正在提取布局并生成标题...');
    try {
      await axios.get(`/api/start_layout_extraction/${ref}/${selectedFile}`);
      pollStatus(async () => {
        // Start title generation after layout extraction
        await axios.get(`/api/start_title_generation/${selectedFile}`);
        pollStatus((statusData) => {
          // Fetch titles
          // statusData contains title_options which has text
          // But we also need to fetch the list of generated images
          fetchTitles(statusData);
          setCurrentStep('title');
        });
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const directGenerateWithAI = async () => {
    setLoading(true);
    setLoadingText('AI正在生成信息图表...');
    try {
        const res = await axios.post('/api/ai_direct_generate', {
            chart_svg: currentChartSVG,
            data_file: selectedFile
        });
        
        if (res.data.status === 'success') {
            setLoading(false);
            showDirectResult(res.data.image_path);
        } else if (res.data.status === 'started') {
            pollDirectGenerateStatus();
        }
    } catch (err) {
        console.error(err);
        setLoading(false);
        alert('AI生成失败，请重试');
    }
  };

  const pollDirectGenerateStatus = () => {
      const interval = setInterval(async () => {
          try {
              const res = await axios.get('/api/status');
              if (res.data.step === 'ai_direct_generate' && res.data.completed) {
                  clearInterval(interval);
                  setLoading(false);
                  showDirectResult(res.data.result_image);
              } else if (res.data.status === 'error') {
                  clearInterval(interval);
                  setLoading(false);
                  alert('AI生成失败: ' + res.data.progress);
              }
          } catch (err) {
              clearInterval(interval);
              setLoading(false);
          }
      }, 1000);
  };

  const showDirectResult = (imagePath) => {
      setAiResultImage(imagePath);
      setCurrentStep('aiResult');
  };

  // Step 5: Title Selection
  const fetchTitles = async (statusData) => {
    try {
      const res = await axios.get('/api/titles');
      setTitles(res.data);
      if (res.data.length > 0) {
        setSelectedTitle(res.data[0]);
        // Extract text for the first title
        if (statusData && statusData.title_options && statusData.title_options[res.data[0]]) {
            setTitleText(statusData.title_options[res.data[0]].title_text);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const regenerateTitle = async () => {
    setLoading(true);
    setLoadingText('重新生成标题...');
    try {
      await axios.get(`/api/regenerate_title/${selectedFile}`);
      pollStatus((statusData) => {
        fetchTitles(statusData);
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const confirmTitle = async () => {
    setLoading(true);
    setLoadingText('正在生成配图...');
    try {
      // We need the text of the selected title to generate pictogram
      // We can get it from status or just pass the title filename if backend handles it?
      // Backend `start_pictogram_generation` takes `title` (text).
      // We need to find the text corresponding to `selectedTitle`.
      // Let's fetch status again to be sure.
      const statusRes = await axios.get('/api/status');
      const options = statusRes.data.title_options;
      const text = options[selectedTitle]?.title_text || "Default Title";
      
      await axios.get(`/api/start_pictogram_generation/${encodeURIComponent(text)}`);
      pollStatus(() => {
        fetchPictograms();
        setCurrentStep('pictogram');
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // Step 6: Pictogram Selection
  const fetchPictograms = async () => {
    try {
      const res = await axios.get('/api/pictograms');
      setPictograms(res.data);
      if (res.data.length > 0) {
        setSelectedPictogram(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const regeneratePictogram = async () => {
    setLoading(true);
    setLoadingText('重新生成配图...');
    try {
        // Need title text again
        const statusRes = await axios.get('/api/status');
        const options = statusRes.data.title_options;
        const text = options[selectedTitle]?.title_text || "Default Title";

        await axios.get(`/api/regenerate_pictogram/${encodeURIComponent(text)}`);
        pollStatus(() => {
            fetchPictograms();
        });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const confirmPictogram = () => {
    // Navigate to Editor with all selections
    const params = new URLSearchParams({
        charttype: selectedVariation, // The variation name is used as charttype in generate_chart
        data: selectedFile.replace('.csv', ''), // Backend expects filename without extension sometimes? 
        // Wait, `generate_chart` in app.py: `datafile = request.args.get('data', 'test')`
        // And `title = f"buffer/{generation_status['id']}/{title}"`
        // So we pass the filename of the title and pictogram
        title: selectedTitle,
        pictogram: selectedPictogram
    });
    navigate(`/editor?${params.toString()}`);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🌌 ChartGalaxy</h1>
        <p>智能信息图表生成</p>
      </div>

      {/* Step 1: Data */}
      <div className={`card ${currentStep !== 'data' ? 'hidden' : ''}`}>
        <div className="card-header">📊 数据选择与预览</div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">选择数据集：</label>
            <select className="form-select" value={selectedFile} onChange={handleFileSelect}>
              <option value="">请选择一个数据集...</option>
              {csvFiles.map(file => (
                <option key={file} value={file}>{file.replace('.csv', '')}</option>
              ))}
            </select>
          </div>
          {tableData && (
            <div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>{tableData.columns.map(col => <th key={col}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tableData.data.slice(0, 10).map((row, i) => (
                      <tr key={i}>{tableData.columns.map(col => <td key={col}>{row[col]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-center" style={{ marginTop: '25px' }}>
                <button className="btn btn-primary" onClick={startChartTypeSelection}>➡️ 下一步</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Chart Type */}
      <div className={`card ${currentStep !== 'chartType' ? 'hidden' : ''}`}>
        <div className="card-header">📊 选择图表类型</div>
        <div className="card-body">
          <div className="chart-type-container">
            {chartTypes.map(type => (
              <div key={type.type} 
                   className={`chart-type-item ${selectedChartType === type.type ? 'selected' : ''}`}
                   onClick={() => setSelectedChartType(type.type)}>
                <div className="chart-type-image-container">
                   <img 
                        src={`/currentfilepath/charttype_${type.type.replace(/ /g, '_')}.svg?t=${previewTimestamp}`} 
                        className="chart-type-image" 
                        alt={type.type}
                        onError={(e) => {e.target.onerror = null; e.target.src = "https://via.placeholder.com/150?text=No+Preview"}}
                   />
                </div>
                <div className="chart-type-label">{type.type}</div>
              </div>
            ))}
          </div>
          <div className="text-center" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={loadMoreChartTypes}>➕ 加载更多</button>
            <button className="btn btn-primary" disabled={!selectedChartType} onClick={() => selectChartType(selectedChartType)}>✅ 选择此类型</button>
          </div>
        </div>
      </div>

      {/* Step 3: Variation */}
      <div className={`card ${currentStep !== 'variation' ? 'hidden' : ''}`}>
        <div className="card-header">📝 选择图表样式</div>
        <div className="card-body">
          <div className="variation-container">
            {variations.map(v => (
              <div key={v.name} 
                   className={`variation-item ${selectedVariation === v.name ? 'selected' : ''}`}
                   onClick={() => setSelectedVariation(v.name)}>
                <div className="variation-image-container">
                   <img 
                        src={`/currentfilepath/variation_${v.name}.svg?t=${previewTimestamp}`} 
                        className="variation-image" 
                        alt={v.name}
                        onError={(e) => {e.target.onerror = null; e.target.src = "https://via.placeholder.com/150?text=No+Preview"}}
                   />
                </div>
                <div className="variation-label">{v.name}</div>
              </div>
            ))}
          </div>
          <div className="text-center" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={loadMoreVariations}>➕ 加载更多</button>
            <button className="btn btn-primary" disabled={!selectedVariation} onClick={() => selectVariation(selectedVariation)}>✅ 选择此样式</button>
          </div>
        </div>
      </div>

      {/* Step 4: Reference */}
      <div className={`card ${currentStep !== 'reference' ? 'hidden' : ''}`}>
        <div className="card-header">🎨 选择参考图表</div>
        <div className="card-body">
          <div className="reference-grid">
            {/* AI Direct Generation Option */}
            <div className={`reference-item ai-direct-item ${selectedReference === 'ai_direct' ? 'selected' : ''}`}
                 onClick={() => setSelectedReference('ai_direct')}>
                <div className="reference-image-container ai-direct-container">
                    <div className="ai-direct-content">
                        <div className="ai-direct-icon">🤖</div>
                        <div className="ai-direct-title">AI直接生成</div>
                        <div className="ai-direct-desc">使用大模型直接生成最终信息图表</div>
                    </div>
                </div>
            </div>

            {references.main && (
                <div className={`reference-item ${selectedReference === references.main ? 'selected' : ''}`}
                     onClick={() => setSelectedReference(references.main)}>
                    <div className="reference-image-container">
                        <img src={`/other_infographics/${references.main}`} className="reference-image" alt="Main Reference" />
                    </div>
                </div>
            )}
            {references.others.map(ref => (
                <div key={ref} className={`reference-item ${selectedReference === ref ? 'selected' : ''}`}
                     onClick={() => setSelectedReference(ref)}>
                    <div className="reference-image-container">
                        <img src={`/other_infographics/${ref}`} className="reference-image" alt="Reference" />
                    </div>
                </div>
            ))}
          </div>
          <div className="text-center" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={loadMoreReferences}>➕ 加载更多</button>
            <button className="btn btn-primary" disabled={!selectedReference} onClick={() => selectReference(selectedReference)}>
                {selectedReference === 'ai_direct' ? '🤖 AI直接生成信息图表' : '✨ 选择此参考图表'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 5: Title */}
      <div className={`card ${currentStep !== 'title' ? 'hidden' : ''}`}>
        <div className="card-header">📝 标题预览</div>
        <div className="card-body">
          <div className="single-selection-container">
            {selectedTitle && (
                <div className="single-selection-item">
                    <div className="selection-image-container">
                        <img src={`/currentfilepath/${selectedTitle}`} className="selection-image" alt="Generated Title" />
                    </div>
                </div>
            )}
            <div className="title-text-display">{titleText}</div>
          </div>
          <div className="text-center" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={regenerateTitle}>🔄 重新生成</button>
            <button className="btn btn-primary" onClick={confirmTitle}>✅ 确认标题</button>
          </div>
        </div>
      </div>

      {/* Step 6: Pictogram */}
      <div className={`card ${currentStep !== 'pictogram' ? 'hidden' : ''}`}>
        <div className="card-header">🎭 配图预览</div>
        <div className="card-body">
          <div className="single-selection-container">
            {selectedPictogram && (
                <div className="single-selection-item">
                    <div className="selection-image-container">
                        <img src={`/currentfilepath/${selectedPictogram}`} className="selection-image" alt="Generated Pictogram" />
                    </div>
                </div>
            )}
          </div>
          <div className="text-center" style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={regeneratePictogram}>🔄 重新生成</button>
            <button className="btn btn-primary" onClick={confirmPictogram}>🎨 生成最终图表</button>
          </div>
        </div>
      </div>

      {/* Step 7: AI Result */}
      <div className={`card ${currentStep !== 'aiResult' ? 'hidden' : ''}`}>
        <div className="card-header">✨ AI生成结果</div>
        <div className="card-body">
          <div className="single-selection-container">
            {aiResultImage && (
                <div className="single-selection-item" style={{maxWidth: '800px'}}>
                    <div className="selection-image-container">
                        <img src={`/${aiResultImage}`} className="selection-image" alt="AI Generated Result" />
                    </div>
                </div>
            )}
          </div>
          <div className="text-center" style={{ marginTop: '30px' }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>🔄 重新开始</button>
          </div>
        </div>
      </div>

      {/* Loading Overlay - Removed per user request */}
      {/*
      {loading && (
        <div className="loading-overlay" style={{ display: 'flex' }}>
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-text">{loadingText}</div>
          </div>
        </div>
      )}
      */}
    </div>
  );
}

export default Wizard;
