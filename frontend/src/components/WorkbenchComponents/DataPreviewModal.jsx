import React from 'react';

export function DataPreviewModal({ show, previewData, selectedFile, onClose }) {
  if (!show || !previewData) return null;

  return (
    <div className="refined-preview-modal" onClick={onClose}>
      <div className="refined-preview-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '90%', width: '1000px'}}>
        <div className="refined-preview-header">
          <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
            <span>📊</span>
            <span>数据预览 - {selectedFile.replace('.csv', '')}</span>
          </h3>
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
  );
}

