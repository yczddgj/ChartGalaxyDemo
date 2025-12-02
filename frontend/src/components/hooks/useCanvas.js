import { useState, useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { CANVAS_MIN_WIDTH, CANVAS_MIN_HEIGHT } from '../constants';

export function useCanvas(historyRef, saveCanvasState) {
  const [canvas, setCanvas] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const canvasRef = useRef(null);
  const mainPreviewRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const hasAutoCenteredRef = useRef(false);

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

  // Initialize Canvas
  useEffect(() => {
    // Fetch Files will be handled in parent component
    
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
    
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setCanvas(c);
    
    if (container) {
      container.style.backgroundColor = initialBgColor;
    }

    // Note: Undo/Redo functions are handled by useHistory hook
    // This hook only handles canvas initialization and selection state

    // Keyboard event handler for Delete key only
    // Undo/Redo is handled by useHistory hook
    const handleKeyDown = (e) => {
      if (!c) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && c.getActiveObject()) {
        e.preventDefault();
        const activeObject = c.getActiveObject();
        if (activeObject) {
          if (saveCanvasState) {
            saveCanvasState();
          }
          if (activeObject.type === 'activeSelection') {
            activeObject.getObjects().forEach(obj => c.remove(obj));
            c.discardActiveObject();
          } else {
            c.remove(activeObject);
          }
          c.renderAll();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Listen to canvas object changes for history
    c.on('object:added', () => {
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

    // Update selection state
    const updateSelection = () => {
      setHasSelection(!!c.getActiveObject());
    };

    c.on('selection:created', updateSelection);
    c.on('selection:updated', updateSelection);
    c.on('selection:cleared', updateSelection);

    // Resize canvas on window resize
    const resizeCanvas = () => {
      const container = document.querySelector('.canvas-wrapper');
      if (container && c) {
        const computedWidth = container.clientWidth - 80;
        const computedHeight = container.clientHeight - 80;
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
      c.off('selection:created', updateSelection);
      c.off('selection:updated', updateSelection);
      c.off('selection:cleared', updateSelection);
      c.dispose();
    };
  }, []); // Empty deps - only run once on mount

  return {
    canvas,
    setCanvas,
    hasSelection,
    canvasRef,
    mainPreviewRef,
    canvasWrapperRef,
    resetPanOffsets,
    scrollMainPreviewToCenter
  };
}

