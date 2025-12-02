import React from 'react';

export function RefinedImageModal({ show, selectedImage, onClose, onDownload }) {
  if (!show || !selectedImage) return null;

  return (
    <div className="refined-preview-modal" onClick={onClose}>
      <div className="refined-preview-content" onClick={(e) => e.stopPropagation()}>
        <div className="refined-preview-header">
          <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
            <span>✨</span>
            <span>AI 精修版 - 放大查看</span>
          </h3>
          <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
            <button 
              onClick={() => onDownload(selectedImage.url)}
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
              onClick={onClose}
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
            src={selectedImage.url} 
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
  );
}

