import { useState, useEffect, useRef } from 'react';
import { MAX_HISTORY_SIZE, SNAPSHOT_LIMIT } from '../constants';

export function useHistory(canvas = null) {
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const snapshotsRef = useRef([]);
  const historyRef = useRef({ history: [], historyIndex: -1 });
  const canvasRef = useRef(canvas);
  
  // Update canvas ref when canvas changes
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

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
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || !stateJson) return;
    currentCanvas.loadFromJSON(stateJson, () => {
      canvas.renderAll();
      setHistory(prev => {
        const currentIndex = historyRef.current.historyIndex;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(stateJson);
        let newIndex;
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift();
          newIndex = MAX_HISTORY_SIZE - 1;
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

  const saveCanvasState = () => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const prevJson = historyRef.current.history[historyRef.current.historyIndex];
    if (prevJson) {
      pushSnapshot(prevJson);
    }
    const json = JSON.stringify(currentCanvas.toJSON());
    setHistory(prev => {
      const currentIndex = historyRef.current.historyIndex;
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(json);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        historyRef.current.historyIndex = MAX_HISTORY_SIZE - 1;
      } else {
        historyRef.current.historyIndex = newHistory.length - 1;
      }
      historyRef.current.history = newHistory;
      return newHistory;
    });
    setHistoryIndex(historyRef.current.historyIndex);
  };

  const handleUndo = () => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || historyRef.current.historyIndex <= 0) return;
    const newIndex = historyRef.current.historyIndex - 1;
    const stateJson = historyRef.current.history[newIndex];
    if (stateJson) {
      currentCanvas.loadFromJSON(stateJson, () => {
        currentCanvas.renderAll();
        historyRef.current.historyIndex = newIndex;
        setHistoryIndex(newIndex);
      });
    }
  };

  const handleRedo = () => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const stateJson = popSnapshot();
    if (!stateJson) return;
    loadStateFromJson(stateJson);
  };

  const handleDelete = () => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const activeObject = currentCanvas.getActiveObject();
    if (activeObject) {
      const json = JSON.stringify(currentCanvas.toJSON());
      pushSnapshot(json);
      setHistory(prev => {
        const currentIndex = historyRef.current.historyIndex;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(json);
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift();
          historyRef.current.historyIndex = MAX_HISTORY_SIZE - 1;
        } else {
          historyRef.current.historyIndex = newHistory.length - 1;
        }
        historyRef.current.history = newHistory;
        return newHistory;
      });
      setHistoryIndex(historyRef.current.historyIndex);

      if (activeObject.type === 'activeSelection') {
        activeObject.getObjects().forEach(obj => currentCanvas.remove(obj));
        currentCanvas.discardActiveObject();
      } else {
        currentCanvas.remove(activeObject);
      }
      currentCanvas.renderAll();
    }
  };

  const resetHistory = () => {
    setHistory([]);
    setHistoryIndex(-1);
    historyRef.current.history = [];
    historyRef.current.historyIndex = -1;
    clearSnapshots();
  };

  const saveInitialState = (stateJson) => {
    if (stateJson) {
      clearSnapshots();
      setHistory([stateJson]);
      setHistoryIndex(0);
      historyRef.current.history = [stateJson];
      historyRef.current.historyIndex = 0;
    }
  };

  // 设置 canvas 的方法，供外部调用
  const setCanvas = (newCanvas) => {
    canvasRef.current = newCanvas;
  };

  // Sync historyRef with state
  useEffect(() => {
    historyRef.current.history = history;
    historyRef.current.historyIndex = historyIndex;
  }, [history, historyIndex]);

  return {
    history,
    historyIndex,
    snapshotCount,
    historyRef,
    saveCanvasState,
    handleUndo,
    handleRedo,
    handleDelete,
    resetHistory,
    saveInitialState,
    clearSnapshots,
    setCanvas
  };
}

