import React from 'react';

export function CanvasControls({ canvas, hasSelection, snapshotCount, onDelete, onRedo, onDownload }) {
  return (
    <div className="canvas-controls">
      <button 
        onClick={onDelete}
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
        onClick={onRedo}
        disabled={snapshotCount === 0}
        style={{
          padding: '8px 16px',
          background: snapshotCount === 0 ? '#e0e0e0' : '#6366f1',
          color: snapshotCount === 0 ? '#999' : 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: snapshotCount === 0 ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
          fontWeight: '600',
          opacity: snapshotCount === 0 ? 0.5 : 1
        }}
        title="重做 (最多 3 次)"
      >
        🔄 重做
      </button>
      <button
        onClick={onDownload}
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
  );
}

