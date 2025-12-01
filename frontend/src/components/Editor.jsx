import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fabric } from 'fabric';
import axios from 'axios';

function Editor() {
  const [searchParams] = useSearchParams();
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(100);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initCanvas = () => {
      const c = new fabric.Canvas('fabricCanvas', {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        selection: true,
        preserveObjectStacking: true
      });
      setCanvas(c);
      return c;
    };

    const c = initCanvas();
    
    // Load data
    const chartType = searchParams.get('charttype');
    const data = searchParams.get('data');
    const title = searchParams.get('title');
    const pictogram = searchParams.get('pictogram');

    if (chartType && data) {
      loadChartData(c, chartType, data, title, pictogram);
    }

    // Event listeners
    c.on('selection:created', (e) => updateOpacity(e.selected[0]));
    c.on('selection:updated', (e) => updateOpacity(e.selected[0]));
    c.on('selection:cleared', () => setOpacity(100));

    return () => {
      c.dispose();
    };
  }, []);

  const updateOpacity = (obj) => {
    if (obj) {
      setOpacity(Math.round((obj.opacity || 1) * 100));
    }
  };

  const loadChartData = async (c, chartType, data, title, pictogram) => {
    try {
      const res = await axios.get('/authoring/chart', {
        params: { charttype: chartType, data, title, pictogram }
      });
      
      const { svg, img1, img2, bg_color } = res.data;

      c.clear();
      if (bg_color) {
        c.setBackgroundColor(bg_color, c.renderAll.bind(c));
        setBgColor(bg_color);
      }

      // Load Chart (SVG)
      if (svg) {
        fabric.loadSVGFromString(svg, (objects, options) => {
          const obj = fabric.util.groupSVGElements(objects, options);
          obj.set({
            left: c.width / 2,
            top: c.height / 2,
            originX: 'center',
            originY: 'center'
          });
          obj.scaleToWidth(c.width * 0.8);
          c.add(obj);
          c.renderAll();
        });
      }

      // Load Title (Image)
      if (img1) {
        fabric.Image.fromURL(img1, (img) => {
          img.set({
            left: c.width / 2,
            top: 50,
            originX: 'center',
            originY: 'top'
          });
          img.scaleToWidth(c.width * 0.6);
          c.add(img);
          c.renderAll();
        });
      }

      // Load Pictogram (Image)
      if (img2) {
        fabric.Image.fromURL(img2, (img) => {
          img.set({
            left: 100,
            top: 100,
            originX: 'center',
            originY: 'center'
          });
          img.scaleToWidth(100);
          c.add(img);
          c.renderAll();
        });
      }

    } catch (err) {
      console.error(err);
      alert('加载图表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBgColorChange = (e) => {
    const color = e.target.value;
    setBgColor(color);
    if (canvas) {
      canvas.setBackgroundColor(color, canvas.renderAll.bind(canvas));
    }
  };

  const handleOpacityChange = (e) => {
    const val = parseInt(e.target.value);
    setOpacity(val);
    if (canvas) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        activeObj.set('opacity', val / 100);
        canvas.renderAll();
      }
    }
  };

  const exportImage = () => {
    if (!canvas) return;
    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2
    });
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'infographic.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🎨 ChartGalaxy Editor</h1>
      </div>

      <div className="main-content" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '30px' }}>
        <div className="sidebar">
          <div className="card">
            <div className="card-title">工具栏</div>
            
            <div className="control-group">
              <label className="form-label">背景颜色</label>
              <div className="color-input-wrapper">
                <input type="color" value={bgColor} onChange={handleBgColorChange} className="form-input" />
                <input type="text" value={bgColor} onChange={handleBgColorChange} className="form-input" />
              </div>
            </div>

            <div className="control-group">
              <label className="form-label">透明度: {opacity}%</label>
              <input type="range" min="0" max="100" value={opacity} onChange={handleOpacityChange} className="form-input" />
            </div>

            <div className="control-group">
              <button className="btn btn-primary" onClick={exportImage} style={{ width: '100%' }}>
                ⬇️ 导出图片
              </button>
            </div>
          </div>
        </div>

        <div className="canvas-card">
          <div id="canvas-container">
            <canvas id="fabricCanvas" />
          </div>
        </div>
      </div>
      
      {/* Loading Overlay - Removed per user request */}
      {/*
      {loading && (
        <div className="loading-overlay" style={{ display: 'flex' }}>
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-text">加载编辑器...</div>
          </div>
        </div>
      )}
      */}
    </div>
  );
}

export default Editor;
