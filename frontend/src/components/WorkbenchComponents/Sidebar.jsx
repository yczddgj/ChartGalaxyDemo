import React from 'react';
import { CHART_TYPES_PER_PAGE, VARIATIONS_PER_PAGE, REFERENCES_PER_PAGE } from '../constants';

// 分页辅助函数
const getPagedData = (data, page, pageSize) => {
  const start = page * pageSize;
  return data.slice(start, start + pageSize);
};

// 数据集选择组件
export function DatasetSection({ csvFiles, selectedFile, onFileSelect, onDataPreview }) {
  return (
    <div className="config-section">
      <div className="section-title">数据集选择</div>
      <div className="dataset-control">
        <select value={selectedFile} onChange={onFileSelect} className="dataset-select">
          <option value="">选择数据集...</option>
          {csvFiles.map(f => (
            <option key={f} value={f}>{f.replace('.csv', '')}</option>
          ))}
        </select>
        <button
          className="upload-btn"
          title="预览数据"
          onClick={onDataPreview}
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
  );
}

// 图表类型选择组件
export function ChartTypesSection({
  chartTypes,
  totalChartTypes,
  selectedChartType,
  chartTypePage,
  chartTypesLoading,
  chartTypesLoadingText,
  onPageChange,
  onNext,
  onSelect
}) {
  // Don't return null if loading - we want to show the loading animation
  if (!chartTypes || (chartTypes.length === 0 && !chartTypesLoading)) return null;

  return (
    <div className="config-section">
      <div className="section-title">推荐图表类型</div>
      {chartTypesLoading ? (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', minHeight: '200px'}}>
          <div className="loading-spinner" style={{width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px'}}></div>
          <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center'}}>{chartTypesLoadingText}</div>
        </div>
      ) : (
        <>
          <div className="grid-container">
            {getPagedData(chartTypes, chartTypePage, CHART_TYPES_PER_PAGE).map(type => {
              const isSelected = type.mergedTypes 
                ? type.mergedTypes.includes(selectedChartType)
                : selectedChartType === type.type;
              
              return (
                <div 
                  key={type.type} 
                  className={`grid-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelect(type)}
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
            <button disabled={chartTypePage === 0} onClick={() => onPageChange(chartTypePage - 1)}>&lt;</button>
            <span>{chartTypePage + 1} / {Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) || 1}</span>
            <button disabled={chartTypePage >= Math.ceil(totalChartTypes / CHART_TYPES_PER_PAGE) - 1} onClick={onNext}>&gt;</button>
          </div>
        </>
      )}
    </div>
  );
}

// 图表变体选择组件
export function VariationsSection({
  variations,
  totalVariations,
  selectedVariation,
  variationPage,
  variationLoading,
  variationLoadingText,
  previewTimestamp,
  onPageChange,
  onNext,
  onSelect
}) {
  // Don't return null if loading - we want to show the loading animation
  if (!variations || (variations.length === 0 && !variationLoading)) return null;

  return (
    <div className="config-section">
      <div className="section-title">推荐图表变体</div>
      {variationLoading ? (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', minHeight: '200px'}}>
          <div className="loading-spinner" style={{width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px'}}></div>
          {variationLoadingText && <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center'}}>{variationLoadingText}</div>}
        </div>
      ) : (
        <>
          <div className="grid-container">
            {getPagedData(variations, variationPage, VARIATIONS_PER_PAGE).map(v => (
              <div 
                key={v.name} 
                className={`grid-item ${selectedVariation === v.name ? 'selected' : ''}`}
                onClick={() => onSelect(v.name)}
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
            <button disabled={variationPage === 0} onClick={() => onPageChange(variationPage - 1)}>&lt;</button>
            <span>{variationPage + 1} / {Math.ceil(totalVariations / VARIATIONS_PER_PAGE) || 1}</span>
            <button disabled={variationPage >= Math.ceil(totalVariations / VARIATIONS_PER_PAGE) - 1} onClick={onNext}>&gt;</button>
          </div>
        </>
      )}
    </div>
  );
}

// 参考图片选择组件
export function ReferencesSection({
  references,
  totalReferences,
  selectedReference,
  referencePage,
  referenceProcessing,
  referenceProcessingText,
  onPageChange,
  onNext,
  onSelect,
  onDeselect
}) {
  // Don't return null if processing - we want to show the loading animation
  if (!references || (references.length === 0 && !referenceProcessing)) return null;

  return (
    <div className="config-section">
      <div className="section-title">推荐参考图片</div>
      <div className="grid-container">
        {getPagedData(references, referencePage, REFERENCES_PER_PAGE).map(ref => (
          <div 
            key={ref} 
            className={`grid-item ${selectedReference === ref ? 'selected' : ''}`}
            onClick={() => onSelect(ref)}
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
        <button disabled={referencePage === 0} onClick={() => onPageChange(referencePage - 1)}>&lt;</button>
        <span>{referencePage + 1} / {Math.ceil(totalReferences / REFERENCES_PER_PAGE) || 1}</span>
        <button disabled={referencePage >= Math.ceil(totalReferences / REFERENCES_PER_PAGE) - 1} onClick={onNext}>&gt;</button>
      </div>

      {selectedReference && (
        <div className="selected-reference-card" style={{marginTop: '15px', border: '1px solid #e0e0e0', padding: '10px', borderRadius: '6px', position: 'relative', backgroundColor: '#fff'}}>
          <div style={{fontSize: '1rem', marginBottom: '8px', fontWeight: '600', color: '#333'}}>当前参考图片</div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDeselect(); }}
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

      {referenceProcessing && (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', marginTop: '15px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1'}}>
          <div className="loading-spinner" style={{width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '10px'}}></div>
          <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center'}}>{referenceProcessingText}</div>
        </div>
      )}
    </div>
  );
}

// 资源选择组件
export function AssetsSection({
  titleImage,
  setTitleImage,
  selectedPictograms,
  setSelectedPictograms,
  titleOptions,
  pictogramOptions,
  titleLoading,
  titleLoadingText,
  pictogramLoading,
  pictogramLoadingText,
  previewTimestamp,
  onRegenerateTitle,
  onRegeneratePictogram
}) {
  // Don't return null if loading - we want to show the loading animation
  if (!titleImage && !selectedPictograms && !titleLoading && !pictogramLoading) return null;

  return (
    <div className="config-section">
      <div className="section-title">元素生成结果</div>

      {/* Title Selection */}
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
            <button onClick={onRegenerateTitle} style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>重新生成</button>
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
      ) : null}

      {/* Pictogram Selection */}
      {pictogramLoading ? (
        <div className="asset-group" style={{position: 'relative'}}>
          <div className="asset-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
            <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>图像</label>
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
            <label style={{fontSize: '1rem', fontWeight: '600', color: '#666'}}>图像</label>
            <button onClick={onRegeneratePictogram} style={{fontSize: '0.875rem', padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'}}>重新生成</button>
          </div>
          <div className="asset-options-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'}}>
            {pictogramOptions.map(opt => (
              <div 
                key={opt} 
                className={`asset-option ${selectedPictograms === opt ? 'selected' : ''}`}
                onClick={() => setSelectedPictograms(opt)}
                style={{
                  border: selectedPictograms === opt ? '2px solid #007bff' : '1px solid #eee',
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
                  alt="Pictogram Option" 
                  style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 编辑面板组件
export function EditPanel({
  bgColor,
  onBgColorChange,
  editConfig,
  onEditConfigChange,
  isRefining,
  onRefine,
  refinedImages,
  onImageClick
}) {
  return (
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
              onClick={() => onBgColorChange(c)}
              title={c}
            />
          ))}
        </div>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px'}}>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
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
                if (value.length === 7) {
                  onBgColorChange(value);
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
          onChange={(e) => onEditConfigChange({...editConfig, prompt: e.target.value})}
        />
      </div>

      <div className="config-section">
        <div className="section-title">AI 精修</div>
        <button 
          className="refine-btn"
          onClick={onRefine}
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
                onClick={() => onImageClick(image)}
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
              点击"AI 精修"按钮开始
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// 主 Sidebar 组件
export function Sidebar({
  sidebarView,
  setSidebarView,
  csvFiles,
  selectedFile,
  onFileSelect,
  onDataPreview,
  chartTypes,
  totalChartTypes,
  selectedChartType,
  chartTypePage,
  chartTypesLoading,
  chartTypesLoadingText,
  onChartTypePageChange,
  onChartTypeNext,
  onChartTypeSelect,
  variations,
  totalVariations,
  selectedVariation,
  variationPage,
  variationLoading,
  variationLoadingText,
  previewTimestamp,
  onVariationPageChange,
  onVariationNext,
  onVariationSelect,
  references,
  totalReferences,
  selectedReference,
  referencePage,
  referenceProcessing,
  referenceProcessingText,
  onReferencePageChange,
  onReferenceNext,
  onReferenceSelect,
  onReferenceDeselect,
  titleImage,
  setTitleImage,
  selectedPictograms,
  setSelectedPictograms,
  titleOptions,
  pictogramOptions,
  titleLoading,
  titleLoadingText,
  pictogramLoading,
  pictogramLoadingText,
  onRegenerateTitle,
  onRegeneratePictogram,
  bgColor,
  onBgColorChange,
  editConfig,
  onEditConfigChange,
  isRefining,
  onRefine,
  refinedImages,
  onImageClick
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
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
            <DatasetSection
              csvFiles={csvFiles}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              onDataPreview={onDataPreview}
            />

            {selectedFile && (
              <ChartTypesSection
                chartTypes={chartTypes}
                totalChartTypes={totalChartTypes}
                selectedChartType={selectedChartType}
                chartTypePage={chartTypePage}
                chartTypesLoading={chartTypesLoading}
                chartTypesLoadingText={chartTypesLoadingText}
                onPageChange={onChartTypePageChange}
                onNext={onChartTypeNext}
                onSelect={onChartTypeSelect}
              />
            )}

            {selectedChartType && (
              <VariationsSection
                variations={variations}
                totalVariations={totalVariations}
                selectedVariation={selectedVariation}
                variationPage={variationPage}
                variationLoading={variationLoading}
                variationLoadingText={variationLoadingText}
                previewTimestamp={previewTimestamp}
                onPageChange={onVariationPageChange}
                onNext={onVariationNext}
                onSelect={onVariationSelect}
              />
            )}

            {selectedVariation && references.length > 0 && (
              <ReferencesSection
                references={references}
                totalReferences={totalReferences}
                selectedReference={selectedReference}
                referencePage={referencePage}
                referenceProcessing={referenceProcessing}
                referenceProcessingText={referenceProcessingText}
                onPageChange={onReferencePageChange}
                onNext={onReferenceNext}
                onSelect={onReferenceSelect}
                onDeselect={onReferenceDeselect}
              />
            )}

            {selectedVariation && (titleImage || selectedPictograms || titleLoading || pictogramLoading) && (
              <AssetsSection
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
                previewTimestamp={previewTimestamp}
                onRegenerateTitle={onRegenerateTitle}
                onRegeneratePictogram={onRegeneratePictogram}
              />
            )}
          </>
        ) : (
          <EditPanel
            bgColor={bgColor}
            onBgColorChange={onBgColorChange}
            editConfig={editConfig}
            onEditConfigChange={onEditConfigChange}
            isRefining={isRefining}
            onRefine={onRefine}
            refinedImages={refinedImages}
            onImageClick={onImageClick}
          />
        )}
      </div>
    </div>
  );
}

