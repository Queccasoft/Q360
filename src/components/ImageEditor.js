import React, { useRef, useState, useEffect } from 'react';
import { 
  Container, Row, Col, Button, ButtonGroup, 
  Form, Card, ListGroup, InputGroup, Accordion, Dropdown, DropdownButton, Badge
} from 'react-bootstrap';
import JSZip from 'jszip';

// Grid Drawing
const drawGrid = (ctx, w, h, size, color = '#ccc') => {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= w; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y <= h; y += size) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.restore();
};

// Text Wrapping
const getWrappedLines = (ctx, text, maxWidth) => {
  if (!text) return [];
  const words = text.split(' ');
  let lines = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) { currentLine += " " + word; } 
    else { lines.push(currentLine); currentLine = word; }
  }
  lines.push(currentLine);
  return lines;
};

// Advanced Path Rendering
const drawAdvancedPath = (ctx, points, type, isPreview = false) => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (type === 'line') {
    // Simple polyline
    points.forEach(pt => ctx.lineTo(pt.x, pt.y));
  } 
  else if (type === 'bezier') {
    // 1) Bezier: Straight by default, curve if point was long-clicked (stored in pt.isCurve)
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      
      // If the target point was long-clicked, we curve TO it.
      // We use a simple control point that creates a smooth arc relative to the previous segment
      if (curr.isCurve) {
        // Calculate a control point perpendicular to the midpoint
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        // Simple quadratic curve through midpoint
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x)/2, (prev.y + curr.y)/2); 
        // A smoother "S" curve logic requires 2 control points, but for a simple "curve if long press":
        ctx.quadraticCurveTo(midX, midY + 20, curr.x, curr.y); // Arbitrary curve offset, or use interaction logic
      } else {
        ctx.lineTo(curr.x, curr.y);
      }
    }
  } 
  else if (type === 'bspline') {
    // 2) BSpline: Straight lines during preview (isClosing=false), Curves when finished
    if (isPreview) {
      points.forEach(pt => ctx.lineTo(pt.x, pt.y));
    } else {
      // Cubic B-Spline Interpolation Logic
      // We loop through points and use a smoothing kernel (Chaikin's algorithm or Catmull-Rom simplified)
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        for (let t = 0; t <= 1; t += 0.1) {
          // Catmull-Rom formulation for smoothness through points
          const t2 = t * t;
          const t3 = t2 * t;
          const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
          const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
          ctx.lineTo(x, y);
        }
      }
    }
  } 
  else if (type === 'spiro') {
    // 3) Spiro: Curves always convex OUT of the average shape
    // First, find centroid of the shape
    let cx = 0, cy = 0;
    points.forEach(p => { cx += p.x; cy += p.y; });
    cx /= points.length;
    cy /= points.length;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      
      // Midpoint of segment
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;

      // Vector from Centroid to Midpoint
      const vx = mx - cx;
      const vy = my - cy;
      
      // Control point is pushed OUTWARD from the center
      const factor = 0.5; // How much it bulges out
      const cpx = mx + vx * factor;
      const cpy = my + vy * factor;

      ctx.quadraticCurveTo(cpx, cpy, p2.x, p2.y);
    }
  } 
  else {
    // Fallback for brush/eraser
    points.forEach(pt => ctx.lineTo(pt.x, pt.y));
  }
  ctx.stroke();
};

const ImageEditor = ({ fileHandle, onSave, onDownload }) => {
  const canvasRef = useRef(null);
  const imageCache = useRef({}); 
  const [refresh, setRefresh] = useState(0);

  // -- Canvas State --
  const [isRawImageMode, setIsRawImageMode] = useState(false);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [canvasColor, setCanvasColor] = useState('#ffffff');
  const [canvasBgType, setCanvasBgType] = useState('color'); // 'color', 'transparent', 'image'
  const [canvasBgImage, setCanvasBgImage] = useState(null);
  const [layers, setLayers] = useState([{ id: 'layer_0', name: 'Base Layer', opacity: 1, visible: true, locked: false, elements: [] }]);
  const [selectedLayerId, setSelectedLayerId] = useState('layer_0');
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]); 
  const [selectionBox, setSelectionBox] = useState(null); // { x, y, width, height } for rubber-band selection
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);

  // -- Tool & Brush State --
  const [clipboard, setClipboard] = useState(null);
  const [tool, setTool] = useState('select'); 
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(10);
  const [brushShape, setBrushShape] = useState('circle'); // circle, square, triangle, slash
  const [mouseDownTime, setMouseDownTime] = useState(0); // Track duration for Bezier
  const polyTools = ['line', 'bezier', 'bspline', 'spiro']; // Define which tools use Point-to-Point logic

  // -- Interaction State --
  const [interactionMode, setInteractionMode] = useState(null); 
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialState, setInitialState] = useState(null);
  const [drawPoints, setDrawPoints] = useState([]); // Used for Scissor AND Painting
  const [activePath, setActivePath] = useState([]);

  // -- History --
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

  const HANDLE_SIZE = 10;
  const ROTATE_OFFSET = 30;

  const createNewProject = () => {
  if (window.confirm("Are you sure? Unsaved changes will be lost.")) {
    setLayers([{ id: 'layer_0', name: 'Base Layer', opacity: 1, visible: true, locked: false, elements: [] }]);
    setCanvasColor('#ffffff');
    setCanvasBgType('color');
    setCanvasBgImage(null);
    setSelectedLayerId('layer_0');
    setSelectedElementId(null);
    setProjectName('Untitled Project');
    setHistory([]);
    setHistoryStep(-1);
  }
  };

  const saveHistory = (newLayers, newColor) => {
    const snapshot = { layers: JSON.parse(JSON.stringify(newLayers)), canvasColor: newColor || canvasColor };
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(snapshot);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const step = history[historyStep - 1];
      setLayers(step.layers);
      setCanvasColor(step.canvasColor);
      setHistoryStep(historyStep - 1);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const step = history[historyStep + 1];
      setLayers(step.layers);
      setCanvasColor(step.canvasColor);
      setHistoryStep(historyStep + 1);
    }
  };

  useEffect(() => { if (history.length === 0) saveHistory(layers, canvasColor); }, []);

  useEffect(() => {
  // Sync selectedElementId with the primary selection for backward compatibility
  setSelectedElementId(selectedIds.length > 0 ? selectedIds[0] : null);
}, [selectedIds]);

  // Rendering Engine
useEffect(() => {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  
  // 1. Draw Background
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous frame

  if (canvasBgType === 'transparent') {
    const size = 20;
    for (let i = 0; i < canvas.width; i += size) {
      for (let j = 0; j < canvas.height; j += size) {
        ctx.fillStyle = (i / size + j / size) % 2 === 0 ? '#eee' : '#fff';
        ctx.fillRect(i, j, size, size);
      }
    }
  } else if (canvasBgType === 'color') {
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (canvasBgType === 'image' && imageCache.current[canvasBgImage]) {
     // Draw background image scaled to fit
     ctx.drawImage(imageCache.current[canvasBgImage], 0, 0, canvas.width, canvas.height);
  }

  // Draw Grid Layer
    if (showGrid) {
      drawGrid(ctx, canvas.width, canvas.height, gridSize);
    }

  layers.forEach(layer => {
    if (!layer.visible) return;

    // 2. Layer Buffer
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    const layerCtx = layerCanvas.getContext('2d');
    
    layerCtx.save();
    layerCtx.globalAlpha = layer.opacity;

    layer.elements.forEach(el => {
      if (el.visible === false) return;
      
      layerCtx.save();
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      layerCtx.translate(cx, cy);
      layerCtx.rotate((el.rotation * Math.PI) / 180);
      layerCtx.translate(-cx, -cy);

      // Scissor Logic
      if (el.cropPath && el.cropPath.length > 0) {
        layerCtx.beginPath();
        layerCtx.moveTo(el.cropPath[0].x + el.x, el.cropPath[0].y + el.y);
        el.cropPath.forEach(p => layerCtx.lineTo(p.x + el.x, p.y + el.y));
        layerCtx.closePath(); layerCtx.clip();
      }

      if (el.type === 'image' && imageCache.current[el.src]) {
        layerCtx.drawImage(imageCache.current[el.src], el.x, el.y, el.width, el.height);
      } else if (el.type === 'text') {
  // Construct the font string: e.g., "italic bold 30px Arial"
  layerCtx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${el.fontSize}px ${el.fontFamily || 'Arial'}`; 
  layerCtx.fillStyle = el.color; 
  layerCtx.textBaseline = 'top';
  
  const lines = getWrappedLines(layerCtx, el.text, el.width);
  lines.forEach((line, i) => {
    const lineY = el.y + (i * el.fontSize * 1.2);
    layerCtx.fillText(line, el.x, lineY);
    
    // Manual Underline Logic
    if (el.underline) {
      const metrics = layerCtx.measureText(line);
      layerCtx.beginPath();
      layerCtx.strokeStyle = el.color;
      layerCtx.lineWidth = Math.max(1, el.fontSize / 15);
      // Draw line at the bottom of the text
      layerCtx.moveTo(el.x, lineY + el.fontSize);
      layerCtx.lineTo(el.x + metrics.width, lineY + el.fontSize);
      layerCtx.stroke();
    }
  });
} else if (el.type === 'frame') {
        layerCtx.strokeStyle = el.color; layerCtx.lineWidth = el.borderWidth;
        layerCtx.strokeRect(el.x, el.y, el.width, el.height);
      } else if (el.type === 'drawing') {
          el.paths.forEach(p => {
            layerCtx.save();
            if (p.mode === 'eraser') layerCtx.globalCompositeOperation = 'destination-out';
            if (p.mode === 'blur') layerCtx.filter = `blur(${p.size/2}px)`;
            layerCtx.strokeStyle = (p.mode === 'eraser') ? 'rgba(0,0,0,1)' : p.color; 
            layerCtx.fillStyle = p.color; 
            layerCtx.lineWidth = p.size;
            layerCtx.lineCap = 'round'; layerCtx.lineJoin = 'round';
            if (['draw', 'eraser', 'line', 'bezier', 'bspline', 'spiro'].includes(p.mode)) {
              // Pass false for isPreview
              drawAdvancedPath(layerCtx, p.points, p.mode, false);
            }
            else if (p.mode === 'brush' || p.mode === 'blur') {
               p.points.forEach(pt => renderShape(layerCtx, p.shape, pt.x, pt.y, p.size));
            } 
            else if (p.mode === 'spray') {
               p.points.forEach(pt => {
                 for(let i=0; i<8; i++) {
                   const r = Math.random() * p.size; const a = Math.random() * 2 * Math.PI;
                   layerCtx.fillRect(pt.x + Math.cos(a)*r, pt.y + Math.sin(a)*r, 1, 1);
                 }
               });
            }
            layerCtx.restore();
          });
        }
      layerCtx.restore();
  });

// --- ERASER APPLIES TO THE WHOLE LAYER BUFFER ---
    if (activePath.length > 0 && selectedLayerId === layer.id && tool === 'eraser') {
        layerCtx.save(); 
        layerCtx.globalCompositeOperation = 'destination-out';
        layerCtx.lineWidth = brushSize; 
        layerCtx.lineCap = 'round'; 
        layerCtx.lineJoin = 'round';
        drawAdvancedPath(layerCtx, activePath, 'draw');
        layerCtx.restore();
    }
    layerCtx.restore(); // This restores the Layer Buffer's globalAlpha
    ctx.drawImage(layerCanvas, 0, 0); // Draw the finished layer to the main canvas

  // Selection UI (On Main Context)
      if (selectionBox) {
        ctx.save();
        ctx.strokeStyle = '#007bff'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
        ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
        ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
        ctx.restore();
      }

      // Draw Group Selection Bounds
      const bounds = getSelectionBounds(selectedIds, layers);
      if (bounds && tool === 'select') {
        ctx.save();
        ctx.strokeStyle = '#007bff'; ctx.lineWidth = 2;
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // Resize Handle (Bottom-Right of Group)
        ctx.fillStyle = 'white'; ctx.strokeStyle = '#007bff';
        ctx.fillRect(bounds.x + bounds.width - 6, bounds.y + bounds.height - 6, 12, 12);
        ctx.strokeRect(bounds.x + bounds.width - 6, bounds.y + bounds.height - 6, 12, 12);

        // Rotate Handle (Top Center of Group)
        const rotY = bounds.y - 30;
        ctx.beginPath(); ctx.moveTo(bounds.cx, bounds.y); ctx.lineTo(bounds.cx, rotY); ctx.stroke();
        ctx.fillStyle = '#007bff'; ctx.beginPath(); ctx.arc(bounds.cx, rotY, 6, 0, Math.PI * 2); ctx.fill();
        
        ctx.restore();
      }    });

  // Preview Path (Main Context)
    if (activePath.length > 0 && tool !== 'select' && tool !== 'eraser') {
    ctx.save();
    ctx.strokeStyle = tool === 'draw-crop' ? 'red' : brushColor;
    ctx.lineWidth = brushSize; 
    ctx.lineCap = 'round';

    // If it's a Poly tool, we might want to visualize the dots specifically
    if (polyTools.includes(tool)) {
      // Draw the points so user sees where they clicked
      activePath.forEach(pt => {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI*2); ctx.fillStyle='red'; ctx.fill();
      });
      // IMPORTANT: For BSpline, user requested "Straight lines" during clicking
      // So we force type 'line' or pass isPreview=true
      const previewMode = (tool === 'bspline') ? 'line' : tool;
      drawAdvancedPath(ctx, activePath, previewMode, true);
    } else {
      drawAdvancedPath(ctx, activePath, tool, true);
    }

    ctx.restore();
  }
}, [layers, canvasColor, canvasBgType, canvasBgImage, selectedElementId, tool, activePath, refresh, canvasSize]);

useEffect(() => {
    if (fileHandle) {
      loadFromHandle(fileHandle);
    }
  }, [fileHandle]);

  const loadFromHandle = async (handle) => {
    const file = await handle.getFile();
    if (handle.name.endsWith('.qcanva')) {
      // Reuse your existing logic but pass the 'file' object directly
      await loadProject(file); 
    } else {
      // It's a flat image: PNG/JPG/SVG
      // 1. Create new project
      // 2. Add as a layer or background
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        imageCache.current[url] = img;
        setCanvasBgImage(url);
        setCanvasBgType('image');
        setProjectName(handle.name.split('.')[0]);
      };
    }
  };

  const renderShape = (ctx, shape, x, y, size) => {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, size/2, 0, Math.PI*2);
    else if (shape === 'square') ctx.rect(x-size/2, y-size/2, size, size);
    else if (shape === 'triangle') {
      ctx.moveTo(x, y-size/2); ctx.lineTo(x-size/2, y+size/2); ctx.lineTo(x+size/2, y+size/2); ctx.closePath();
    } else if (shape === 'slash') {
      ctx.moveTo(x-size/2, y+size/2); ctx.lineTo(x+size/2, y-size/2);
    }
    ctx.fill(); if(shape === 'slash') ctx.stroke();
  };

    // -- Interaction Logic --
    const getMouse = (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      let x = e.clientX - r.left;
      let y = e.clientY - r.top;

      // Global Snap Logic: If enabled, round coordinates to the nearest grid intersection
      if (snapToGrid) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }
      return { x, y };
    };

    // Get Bounding Box of Selection
    const getSelectionBounds = (ids, currentLayers) => {
      if (ids.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let found = false;

      currentLayers.forEach(l => {
        l.elements.forEach(el => {
          if (ids.includes(el.id)) {
            found = true;
            // Basic bounds
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
          }
        });
      });

      if (!found) return null;
      return { 
        x: minX, y: minY, 
        width: maxX - minX, height: maxY - minY, 
        cx: minX + (maxX - minX) / 2, 
        cy: minY + (maxY - minY) / 2 
      };
    };

    const toLocal = (x, y, el) => {
        const cx = el.x + el.width/2, cy = el.y + el.height/2;
        const rad = -el.rotation * Math.PI / 180;
        const dx = x - cx, dy = y - cy;
        return { x: dx * Math.cos(rad) - dy * Math.sin(rad) + cx, y: dx * Math.sin(rad) + dy * Math.cos(rad) + cy };
    };
    
  const handleMouseDown = (e) => {
  const { x, y } = getMouse(e);
  const isCtrl = e.ctrlKey || e.metaKey;
  // DRAWING TOOLS
  if (tool !== 'select') {
    if (polyTools.includes(tool)) {
      setMouseDownTime(Date.now()); // START TIMER
      // Add point to existing path instead of starting over
      setActivePath(prev => [...prev, { x, y, isCurve: false }]);
      //setActivePath(prev => [...prev, { x, y }]);
    } else {
      // Standard "drag" drawing (brush, spray, etc.)
      setInteractionMode('drawing-path');
      setActivePath([{ x, y }]);
    }
    return; 
  }
  // SELECTION LOGIC
  const bounds = getSelectionBounds(selectedIds, layers);
  if (bounds) {
    // Resize Handle Hit Test
    if (Math.abs(x - (bounds.x + bounds.width)) < 15 && Math.abs(y - (bounds.y + bounds.height)) < 15) {
      setInteractionMode('resizing-group');
      setDragStart({ x, y });
      setInitialState({ bounds, layers: JSON.parse(JSON.stringify(layers)) });
      return;
    }
    // Rotate Handle Hit Test
    if (Math.abs(x - bounds.cx) < 15 && Math.abs(y - (bounds.y - 30)) < 15) {
      setInteractionMode('rotating-group');
      setDragStart({ x, y });
      // Calculate initial angle so rotation doesn't "jump"
      const startAngle = Math.atan2(y - bounds.cy, x - bounds.cx);
      setInitialState({ bounds, startAngle, layers: JSON.parse(JSON.stringify(layers)) });
      return;
    }
  }

  // Element Hit Testing
  let hitId = null;
  let hitLayerId = null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible || l.locked) continue;
    for (let j = l.elements.length - 1; j >= 0; j--) {
      const el = l.elements[j];
      // Ensure canvas ignores locked elements
      if (el.locked) continue;
      const local = toLocal(x, y, el);
      if (local.x >= el.x && local.x <= el.x + el.width && local.y >= el.y && local.y <= el.y + el.height) {
        hitId = el.id; hitLayerId = l.id; break;
      }
    }
    if (hitId) break;
  }

  // Set Interaction
  if (hitId) {
    if (isCtrl) {
      setSelectedIds(prev => prev.includes(hitId) ? prev.filter(id => id !== hitId) : [...prev, hitId]);
    } else if (!selectedIds.includes(hitId)) {
      setSelectedIds([hitId]);
      setSelectedLayerId(hitLayerId);
    }
    setInteractionMode('dragging');
    setDragStart({ x, y });
    setInitialState(null); // Explicitly null for dragging
  } else {
    if (!isCtrl) setSelectedIds([]);
    setInteractionMode('box-selecting');
    setDragStart({ x, y });
    setSelectionBox({ x, y, width: 0, height: 0 });
    setInitialState(null);
  }
  };

  const handleMouseMove = (e) => {
  const { x, y } = getMouse(e);
  if (!interactionMode) return;

  // 1. Path Drawing Logic
  if (interactionMode === 'drawing-path') {
    if (polyTools.includes(tool)) return; // Poly tools handle their own points
    setActivePath(prev => [...prev, { x, y }]);
    return;
  }

  // 2. Box Selection
  if (interactionMode === 'box-selecting') {
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    setSelectionBox({
      x: dx > 0 ? dragStart.x : x,
      y: dy > 0 ? dragStart.y : y,
      width: Math.abs(dx),
      height: Math.abs(dy)
    });
    return;
  }

  // 3. Object Dragging
  if (interactionMode === 'dragging') {
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    const nl = layers.map(l => ({
      ...l,
      elements: l.elements.map(el => {
        if (!selectedIds.includes(el.id)) return el;
        return { ...el, x: el.x + dx, y: el.y + dy };
      })
    }));
    setLayers(nl);
    setDragStart({ x, y });
    return;
  }

  // 4. Group Resizing & Rotating (STABLE MATH)
  if (initialState && (interactionMode === 'resizing-group' || interactionMode === 'rotating-group')) {
    const { bounds, startAngle, layers: oldLayers } = initialState;

      if (interactionMode === 'resizing-group') {
      // --- [CHANGE START] NEW SCALING LOGIC ---
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      let scaleX, scaleY;
      let anchorX, anchorY;

      if (isCtrl) {
        // SCALE FROM CENTER
        // Distance from center / Initial Half-Width
        scaleX = (x - bounds.cx) / ((bounds.width / 2) || 0.1);
        scaleY = (y - bounds.cy) / ((bounds.height / 2) || 0.1);
        anchorX = bounds.cx;
        anchorY = bounds.cy;
      } else {
        // SCALE FROM TOP-LEFT (Standard)
        scaleX = (x - bounds.x) / (bounds.width || 0.1);
        scaleY = (y - bounds.y) / (bounds.height || 0.1);
        anchorX = bounds.x;
        anchorY = bounds.y;
      }

      // PROPORTIONAL SCALING (SHIFT)
      if (isShift) {
        // Use the larger scale to drive both axes to maintain aspect ratio
        const dominantScale = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
        scaleX = dominantScale;
        scaleY = dominantScale;
      }

      const nl = layers.map(l => ({
        ...l,
        elements: l.elements.map(el => {
          if (!selectedIds.includes(el.id)) return el;
          const orig = oldLayers.find(ol => ol.id === l.id).elements.find(oe => oe.id === el.id);
          
          return {
            ...el,
            // If Center scaling: Position expands outward from center
            // If Standard scaling: Position expands from top-left
            x: anchorX + (orig.x - anchorX) * scaleX,
            y: anchorY + (orig.y - anchorY) * scaleY,
            width: orig.width * scaleX,
            height: orig.height * scaleY
          };
        })
      }));
      setLayers(nl);
      // --- [CHANGE END] ---
    }

    // ROTATE: Orbit based on angle difference
    if (interactionMode === 'rotating-group') {
      const currentAngle = Math.atan2(y - bounds.cy, x - bounds.cx);
      const angleDiff = currentAngle - startAngle;

      const nl = layers.map(l => ({
        ...l,
        elements: l.elements.map(el => {
          if (!selectedIds.includes(el.id)) return el;
          const orig = oldLayers.find(ol => ol.id === l.id).elements.find(oe => oe.id === el.id);
          
          // Calculate orbit position
          const relX = (orig.x + orig.width/2) - bounds.cx;
          const relY = (orig.y + orig.height/2) - bounds.cy;
          
          const cos = Math.cos(angleDiff);
          const sin = Math.sin(angleDiff);
          
          const rotatedX = relX * cos - relY * sin;
          const rotatedY = relX * sin + relY * cos;

          return {
            ...el,
            x: bounds.cx + rotatedX - (orig.width * (el.width/orig.width)) / 2,
            y: bounds.cy + rotatedY - (orig.height * (el.height/orig.height)) / 2,
            rotation: orig.rotation + (angleDiff * 180 / Math.PI)
          };
        })
      }));
      setLayers(nl);
    }
  }
  };

  const handleMouseUp = (e) => {
const { x, y } = getMouse(e);
// Check for Bezier long-press
if (tool === 'bezier' && mouseDownTime > 0) {
  const duration = Date.now() - mouseDownTime;
  if (duration > 300) {
    // Mark the LAST point added as a curve point
    setActivePath(prev => {
      const newPath = [...prev];
      if (newPath.length > 0) {
        newPath[newPath.length - 1].isCurve = true;
      }
      return newPath;
    });
  }
  setMouseDownTime(0); // Reset timer
}

if (interactionMode === 'drawing-path') {
  if (tool === 'draw-crop') {
    // Apply path as crop to selected elements instead of creating new layer
    if (selectedIds.length > 0) {
      const nl = layers.map(l => ({
        ...l,
        elements: l.elements.map(el => {
          if (selectedIds.includes(el.id)) {
              // Normalize points relative to element position
              const localPoints = activePath.map(p => ({ x: p.x - el.x, y: p.y - el.y }));
              return { ...el, cropPath: localPoints };
          }
          return el;
        })
      }));
      setLayers(nl);
      saveHistory(nl);
    }
    setActivePath([]);
    setInteractionMode(null);
    return;
  }
  if (activePath.length > 1) {
    const newEl = {
      id: 'draw_' + Date.now(),
      type: 'drawing',
      locked: true,
      x: 0, y: 0, width: canvasSize.width, height: canvasSize.height,
      rotation: 0, visible: true, locked: true,
      paths: [{ mode: tool, points: [...activePath], color: brushColor, size: brushSize, shape: brushShape }]
    };
    const nl = layers.map(l => l.id === selectedLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
    setLayers(nl);
    saveHistory(nl);
  }
  setActivePath([]);
}

else if (interactionMode === 'box-selecting' && selectionBox) {
  // Find all elements inside the selectionBox
  const hitIds = [];
  layers.forEach(l => {
    if(l.locked || !l.visible) return;
    l.elements.forEach(el => {
      if (el.locked) return; 
      const cx = el.x + el.width/2;
      const cy = el.y + el.height/2;
      // Check if center of element is inside box
      if (cx >= selectionBox.x && cx <= selectionBox.x + selectionBox.width &&
          cy >= selectionBox.y && cy <= selectionBox.y + selectionBox.height) {
        hitIds.push(el.id);
      }
    });
  });
  setSelectedIds(hitIds);
  setSelectionBox(null);
} else if (interactionMode) {
  saveHistory(layers);
}

setInteractionMode(null);
setDragStart({ x:0, y:0 });
  };

  const addNewLayer = (pos) => {
      const nl = { id: 'layer_'+Date.now(), name: 'Layer '+layers.length, opacity: 1, visible: true, elements: [] };
      const idx = layers.findIndex(l => l.id === selectedLayerId);
      let newArr = [...layers];
      if (pos === 'above') newArr.splice(idx+1, 0, nl);
      else if (pos === 'below') newArr.splice(idx, 0, nl);
      else newArr.push(nl);
      setLayers(newArr); setSelectedLayerId(nl.id); saveHistory(newArr);
  };

  const addElement = (type) => {
  const newEl = { 
      id: 'el_' + Date.now(), 
      type, 
      x: 100, y: 100, 
      width: 200, height: 150, 
      rotation: 0, 
      cropPath: [], 
      locked: false, // Default unlocked for new text/frames
      visible: true,
      ...(type === 'text' ? { text: 'Double Click to Edit', fontSize: 30, 
          color: '#000000',
          fontFamily: 'Arial',
          fontWeight: 'normal', // 'bold' or 'normal'
          fontStyle: 'normal',   // 'italic' or 'normal'
          underline: false } : { borderWidth: 5, color: '#000000' })
  };
  const nl = layers.map(l => l.id === selectedLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
  setLayers(nl); 
  setSelectedElementId(newEl.id); 
  saveHistory(nl);
  };

  const deleteElement = (elId) => {
  const nl = layers.map(l => ({ ...l, elements: l.elements.filter(e => e.id !== elId) }));
  setLayers(nl);
  setSelectedElementId(null);
  saveHistory(nl);
  };

  const duplicateElement = (el, layerId) => {
      if (!el) return;
      const newEl = { 
      ...JSON.parse(JSON.stringify(el)), 
      id: 'el_' + Date.now() + Math.random(), // Unique ID
      x: el.x + 20, // Offset so user sees it
      y: el.y + 20 
      };
      const nl = layers.map(l => l.id === layerId ? { ...l, elements: [...l.elements, newEl] } : l);
      setLayers(nl);
      setSelectedElementId(newEl.id);
      saveHistory(nl);
  };

  const moveElement = (layerId, elId, direction) => {
    const nl = layers.map(l => {
      if (l.id !== layerId) return l;
      const idx = l.elements.findIndex(e => e.id === elId);
      if (idx === -1) return l;
      
      const newElements = [...l.elements];
      if (direction === 'up' && idx < newElements.length - 1) {
        [newElements[idx], newElements[idx + 1]] = [newElements[idx + 1], newElements[idx]];
      } else if (direction === 'down' && idx > 0) {
        [newElements[idx], newElements[idx - 1]] = [newElements[idx - 1], newElements[idx]];
      }
      return { ...l, elements: newElements };
    });
    setLayers(nl);
    saveHistory(nl);
  };

  const handleImage = (e) => {
    if (!e.target.files || !e.target.files[0]) return; // Added: Guard clause
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image(); img.src = evt.target.result;
      img.onload = () => {
        imageCache.current[img.src] = img;
        const newEl = { id: 'img_'+Date.now(), type:'image', src: img.src, x:100, y:100, width:200, height: 200*(img.height/img.width), rotation:0 };
        const nl = layers.map(l => l.id === selectedLayerId ? {...l, elements: [...l.elements, newEl]} : l);
        setLayers(nl); 
        saveHistory(nl);
        setRefresh(prev => prev + 1); 
      }
    }; 
    reader.readAsDataURL(e.target.files[0]);
    e.target.value = ''; // Added: Clear value to allow re-importing same file
  };

  const finalizePath = () => {
  if (activePath.length < 2) {
    setActivePath([]);
    return;
  }
  const newEl = {
    id: 'poly_' + Date.now(),
    type: 'drawing',
    x: 0, y: 0,
    width: canvasSize.width,
    height: canvasSize.height,
    rotation: 0,
    locked: true,
    visible: true,
    paths: [{ mode: tool, points: [...activePath], color: brushColor, size: brushSize }]
  };
  const nl = layers.map(l => l.id === selectedLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
  setLayers(nl);
  saveHistory(nl);
  setActivePath([]);
  setInteractionMode(null);
  };

  let activeEl = null;
  layers.forEach(l => l.elements.forEach(e => { if(e.id === selectedElementId) activeEl = e; }));

useEffect(() => {
  const handleKeyDown = (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const isCtrl = e.ctrlKey || e.metaKey;

    // Helper: Get all currently selected elements
    const getSelectedElements = () => {
      const selected = [];
      layers.forEach(l => {
        l.elements.forEach(el => {
          if (selectedIds.includes(el.id)) selected.push(el);
        });
      });
      return selected;
    };

    if ((e.key === 'Enter' || e.key === 'Escape') && activePath.length > 0 && polyTools.includes(tool)) {
      e.preventDefault();
      const newEl = {
        id: 'poly_' + Date.now(),
        type: 'drawing',
        x: 0, y: 0,
        width: canvasSize.width,
        height: canvasSize.height,
        rotation: 0,
        locked: true,
        visible: true,
        paths: [{ mode: tool, points: [...activePath], color: brushColor, size: brushSize }]
      };
      const nl = layers.map(l => l.id === selectedLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
      setLayers(nl);
      saveHistory(nl);
      setActivePath([]);
      setInteractionMode(null);
      return; // Stop execution after finalizing
    }

    // Copy (Ctrl + C)
    if (isCtrl && e.key === 'c' && selectedIds.length > 0) {
      e.preventDefault();
      setClipboard(JSON.parse(JSON.stringify(getSelectedElements())));
    }

    // Paste (Ctrl + V)
    if (isCtrl && e.key === 'v' && clipboard && Array.isArray(clipboard)) {
      e.preventDefault();
      const newIds = [];
      const nl = layers.map(l => {
        if (l.id !== selectedLayerId) return l;
        
        const pastedElements = clipboard.map(el => ({
          ...JSON.parse(JSON.stringify(el)),
          id: 'el_' + Date.now() + Math.random(),
          x: el.x + 20,
          y: el.y + 20
        }));
        
        pastedElements.forEach(el => newIds.push(el.id));
        return { ...l, elements: [...l.elements, ...pastedElements] };
      });
      
      setLayers(nl);
      setSelectedIds(newIds); // Select the new copies
      saveHistory(nl);
    }

    // Cut (Ctrl + X)
    if (isCtrl && e.key === 'x' && selectedIds.length > 0) {
      e.preventDefault();
      const itemsToCut = getSelectedElements();
      setClipboard(JSON.parse(JSON.stringify(itemsToCut)));
      
      const nl = layers.map(l => ({
        ...l,
        elements: l.elements.filter(el => !selectedIds.includes(el.id))
      }));
      setLayers(nl);
      setSelectedIds([]);
      saveHistory(nl);
    }

    // Delete / Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const nl = layers.map(l => ({ 
        ...l, 
        elements: l.elements.filter(el => !selectedIds.includes(el.id)) 
      }));
      setLayers(nl); setSelectedIds([]); saveHistory(nl);
    }

  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeEl, clipboard, selectedLayerId, selectedElementId, activePath, tool, brushSize, brushColor, selectedIds]);

const getBlobFromURL = async (url) => {
  const response = await fetch(url);
  return await response.blob();
};

const handleFileAction = async (actionType, format) => {
  const fileName = projectName.trim() || "untitled";
  let blob;

  if (format === 'qcanva') {
    // 1. Logic for .qcanva (Project)
    const zip = new JSZip();
    const assetsFolder = zip.folder("assets");
    const stateToSave = {
      projectName, version: "1.0", canvasSize, canvasColor, canvasBgType,
      canvasBgImage: null,
      layers: JSON.parse(JSON.stringify(layers))
    };

    let assetCounter = 0;
    // Process Background
    if (canvasBgType === 'image' && canvasBgImage) {
      const b = await getBlobFromURL(canvasBgImage);
      const name = `bg_image_${Date.now()}.png`;
      assetsFolder.file(name, b);
      stateToSave.canvasBgImage = `assets/${name}`;
    }
    // Process Layers (using for...of for async)
    for (const layer of stateToSave.layers) {
      for (const el of layer.elements) {
        if (el.type === 'image' && el.src && (el.src.startsWith('blob:') || el.src.startsWith('data:'))) {
          assetCounter++;
          const b = await getBlobFromURL(el.src);
          const name = `img_${el.id}_${assetCounter}.png`;
          assetsFolder.file(name, b);
          el.src = `assets/${name}`;
        }
      }
    }
    zip.file("project.json", JSON.stringify(stateToSave, null, 2));
    blob = await zip.generateAsync({ type: "blob" });
  } else {
    // 2. Logic for Image Export (PNG/JPEG)
    const canvas = canvasRef.current;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 1.0));
  }

  // 3. Send to FileManager
  const extension = `.${format}`;
  if (actionType === 'save') {
    onSave(blob, fileName, extension);
  } else {
    onDownload(blob, fileName, extension);
  }
};

// 1. Standalone logic to process the actual File object
const processFile = async (fileOrEvent) => {
  // SAFETY CHECK: If this received an event instead of a file, extract the file
  let file = fileOrEvent;
  if (fileOrEvent.target && fileOrEvent.target.files) {
    file = fileOrEvent.target.files[0];
  }
  if (!file) return;

  const nameFromSelector = file.name.replace(/\.[^/.]+$/, "");
  setProjectName(nameFromSelector);

  try {
    const zip = await JSZip.loadAsync(file);
    const jsonStr = await zip.file("project.json").async("string");
    const projectState = JSON.parse(jsonStr);

    // Rehydrate Assets
    for (const layer of projectState.layers) {
      for (const el of layer.elements) {
        if (el.type === 'image' && el.src && el.src.startsWith('assets/')) {
          try {
            const blob = await zip.file(el.src).async("blob");
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;
            await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
            imageCache.current[url] = img;
            el.src = url;
          } catch (err) { console.warn("Could not load image:", el.src); }
        }
      }
    }

    // Handle Background Image if exists
    if (projectState.canvasBgType === 'image' && projectState.canvasBgImage) {
        const blob = await zip.file(projectState.canvasBgImage).async("blob");
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await new Promise(r => img.onload = r);
        imageCache.current[url] = img;
        projectState.canvasBgImage = url;
    }

    setCanvasSize(projectState.canvasSize);
    setCanvasColor(projectState.canvasColor);
    setCanvasBgType(projectState.canvasBgType);
    if(projectState.canvasBgImage) setCanvasBgImage(projectState.canvasBgImage);
    setLayers(projectState.layers);
    setHistory([]); 
    saveHistory(projectState.layers, projectState.canvasColor);
    setRefresh(prev => prev + 1);
  } catch (err) {
    console.error("Load failed", err);
    alert("Invalid project file");
  }
};

// 2. Updated UI handler for the "Load Project" button
const loadProject = async (e) => {
  // Capture the file and target immediately before any async gap
  const file = e.target?.files?.[0]; 
  const target = e.target; 

  if (!file) return;

  await processFile(file);

  // Use the captured 'target' instead of 'e.target'
  if (target) {
    target.value = ''; 
  }
};

useEffect(() => {
  const init = async () => {
    if (!fileHandle) return;
    
    const file = await fileHandle.getFile();
    setProjectName(file.name.replace(/\.[^/.]+$/, ""));

    if (file.name.endsWith('.qcanva')) {
      setIsRawImageMode(false);
      await processFile(file); // Your refactored loader
    } else {
      // It's a PNG/JPG/SVG
      setIsRawImageMode(true);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        imageCache.current[url] = img;
        setCanvasBgImage(url);
        setCanvasBgType('image');
      };
    }
  };
  init();
}, [fileHandle]);

  return (
    <Container fluid className="p-3 bg-light min-vh-100 font-monospace">
      <Card className="mb-3 shadow-sm border-0">
        <Card.Body className="py-2 d-flex align-items-center gap-3 flex-wrap">
          {/* NEW: Project Name Input */}
          <InputGroup size="sm" style={{ width: '250px' }}>
            <InputGroup.Text className="bg-dark text-white border-dark">Project</InputGroup.Text>
            <Form.Control 
              placeholder="Enter filename..." 
              value={projectName} 
              onChange={(e) => setProjectName(e.target.value)}
              className="border-dark"
            />
          </InputGroup>

          {/* NEW: Create New Button */}
          <Button variant="outline-danger" size="sm" onClick={createNewProject}>
            + New Project
          </Button>
          <Button variant="outline-dark" size="sm" onClick={() => document.getElementById('load-project-input').click()}>
          📂 Load Project
        </Button>
        {/* Hidden input for Import */}
        <input
          type="file"
          id="load-project-input"
          accept=".qcanva"
          style={{ display: 'none' }}
          onChange={loadProject}
        />
          <Form.Control type="file" size="sm" onChange={handleImage} style={{width: '180px'}} />
          <ButtonGroup size="sm">
            <Button variant="outline-dark" onClick={undo}>Undo</Button>
            <Button variant="outline-dark" onClick={redo}>Redo</Button>
          </ButtonGroup>
          <Form.Check type="switch" label="Grid" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)} />
          <Form.Check type="switch" label="Snap" checked={snapToGrid} onChange={e=>setSnapToGrid(e.target.checked)} />
            {showGrid && <Form.Control type="number" size="sm" value={gridSize} onChange={e=>setGridSize(+e.target.value)} style={{width:'50px'}} />}
          <div className="vr" />
          <DropdownButton size="sm" variant="primary" title="+ New Layer">
            <Dropdown.Item onClick={() => addNewLayer('above')}>Add Above Selection</Dropdown.Item>
            <Dropdown.Item onClick={() => addNewLayer('below')}>Add Below Selection</Dropdown.Item>
          </DropdownButton>
          <div className="vr" />
          <Button variant="dark" size="sm" onClick={() => addElement('text')}>+ Text</Button>
          <Button variant="dark" size="sm" onClick={() => addElement('frame')}>+ Frame</Button>
          <Form.Control type="color" size="sm" value={canvasColor} onChange={e => setCanvasColor(e.target.value)} onBlur={() => saveHistory(layers)} style={{width:'40px'}} />
          <div className="ms-auto d-flex gap-2 align-items-center">
          <span className="text-muted small me-1">Save to Folder:</span>
          <ButtonGroup size="sm">
            <Button variant="primary" onClick={() => handleFileAction('save', 'qcanva')}>.qcanva</Button>
            <Button variant="primary" onClick={() => handleFileAction('save', 'png')}>PNG</Button>
            <Button variant="primary" onClick={() => handleFileAction('save', 'jpeg')}>JPEG</Button>
          </ButtonGroup>

          <div className="vr mx-2" />

          <span className="text-muted small me-1">Download:</span>
          <ButtonGroup size="sm">
            <Button variant="outline-success" onClick={() => handleFileAction('download', 'qcanva')}>.qcanva</Button>
            <Button variant="outline-success" onClick={() => handleFileAction('download', 'png')}>PNG</Button>
            <Button variant="outline-success" onClick={() => handleFileAction('download', 'jpeg')}>JPEG</Button>
          </ButtonGroup>
        </div>
        </Card.Body>
      </Card>

      {/* Toolbar for Painting */}
      <Card className="mb-3 border-0 shadow-sm bg-white">
        <Card.Body className="py-2 d-flex gap-2 align-items-center">
            <ButtonGroup size="sm">
              <Button variant={tool==='select'?'primary':'outline-primary'} onClick={()=>setTool('select')}>Select</Button>
              <Button variant={tool==='draw'?'primary':'outline-primary'} onClick={()=>setTool('draw')} title="Freehand">Draw</Button>
              <Button variant={tool==='line'?'primary':'outline-primary'} onClick={()=>setTool('line')} title="Straight Line">Line</Button>
              <Button variant={tool==='bezier'?'primary':'outline-primary'} onClick={()=>setTool('bezier')} title="Quadratic Bezier">Bezier</Button>
              <Button variant={tool==='bspline'?'primary':'outline-primary'} onClick={()=>setTool('bspline')} title="Cubic B-Spline">BSpline</Button>
              <Button variant={tool==='spiro'?'primary':'outline-primary'} onClick={()=>setTool('spiro')} title="Spiro/Catmull">Spiro</Button>
              <Button variant={tool==='brush'?'primary':'outline-primary'} onClick={()=>setTool('brush')}>Brush</Button>
              <Button variant={tool==='spray'?'primary':'outline-primary'} onClick={()=>setTool('spray')}>Spray</Button>
              <Button variant={tool==='blur'?'primary':'outline-primary'} onClick={()=>setTool('blur')}>Blur</Button>
              <Button variant={tool==='eraser'?'primary':'outline-primary'} onClick={()=>setTool('eraser')}>Eraser</Button>
              {activePath.length > 0 && polyTools.includes(tool) && (
                <Button 
                  onClick={finalizePath}
                  variant='outline-danger'
                >
                  Stop Drawing
                </Button>
              )}
            </ButtonGroup>
            <div className="vr" />
            <Form.Control type="color" size="sm" value={brushColor} onChange={e=>setBrushColor(e.target.value)} style={{width:'40px'}} />
            <Form.Control type="number" size="sm" value={brushSize} onChange={e=>setBrushSize(+e.target.value)} style={{width:'60px'}} />
            <Form.Select size="sm" value={brushShape} onChange={e=>setBrushShape(e.target.value)} style={{width:'100px'}}>
                <option value="circle">Circle</option><option value="square">Square</option>
                <option value="triangle">Triangle</option><option value="slash">Slash</option>
            </Form.Select>
        </Card.Body>
      </Card>

      <Row>
        <Col lg={8} className="bg-secondary bg-opacity-10 rounded d-flex justify-content-center p-4 overflow-auto" style={{maxHeight:'75vh'}}>
          <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="shadow bg-white" />
{/* --- FLOATING ACCESSIBILITY MENU --- */}
{selectedIds.length > 0 && (
  (() => {
    const bounds = getSelectionBounds(selectedIds, layers);
    if (!bounds) return null;

    return (
      <div style={{
        position: 'absolute',
        top: bounds.y - 45,
        left: bounds.x,
        display: 'flex',
        gap: '4px',
        background: '#333',
        padding: '4px',
        borderRadius: '6px',
        zIndex: 1000
      }} onMouseDown={e => e.stopPropagation()}>
        <Button size="sm" variant="dark" onClick={() => {
            // Duplicate Logic
            const newEls = [];
            layers.forEach(l => l.elements.forEach(el => {
                if (selectedIds.includes(el.id)) {
                    newEls.push({...JSON.parse(JSON.stringify(el)), id: 'el_'+Date.now()+Math.random(), x: el.x+20, y: el.y+20});
                }
            }));
            const nl = layers.map(l => l.id === selectedLayerId ? {...l, elements: [...l.elements, ...newEls]} : l);
            setLayers(nl); setSelectedIds(newEls.map(n => n.id)); saveHistory(nl);
        }} title="Duplicate">📑</Button>

        <Button size="sm" variant="dark" onClick={() => {
            const nl = layers.map(l => ({...l, elements: l.elements.filter(el => !selectedIds.includes(el.id))}));
            setLayers(nl); setSelectedIds([]); saveHistory(nl);
        }} title="Delete">🗑️</Button>

        <Button size="sm" variant="dark" onClick={() => {
            // Move Up inside layer
            const nl = layers.map(l => {
                if (l.id !== selectedLayerId) return l;
                const els = [...l.elements];
                selectedIds.forEach(id => {
                    const idx = els.findIndex(e => e.id === id);
                    if (idx < els.length - 1) [els[idx], els[idx+1]] = [els[idx+1], els[idx]];
                });
                return {...l, elements: els};
            });
            setLayers(nl); saveHistory(nl);
        }} title="Move Up">⬆️</Button>

        <Button size="sm" variant="dark" onClick={() => {
            // Move Down inside layer
            const nl = layers.map(l => {
                if (l.id !== selectedLayerId) return l;
                const els = [...l.elements];
                selectedIds.forEach(id => {
                    const idx = els.findIndex(e => e.id === id);
                    if (idx > 0) [els[idx], els[idx-1]] = [els[idx-1], els[idx]];
                });
                return {...l, elements: els};
            });
            setLayers(nl); saveHistory(nl);
        }} title="Move Down">⬇️</Button>
      </div>
    );
  })()
)}
        </Col>

        <Col lg={4}>
          <Accordion defaultActiveKey="0">
            <Accordion.Item eventKey="0">
              <Accordion.Header>Layers & Hierarchy</Accordion.Header>
              <Accordion.Body className="p-0">
                <div className="p-2 bg-light border-bottom d-flex gap-2">
                    <Button variant="outline-secondary" size="sm" className="flex-fill" onClick={() => {
                        const idx = layers.findIndex(l => l.id === selectedLayerId);
                        if(idx < layers.length-1) { let nl = [...layers]; [nl[idx], nl[idx+1]] = [nl[idx+1], nl[idx]]; setLayers(nl); saveHistory(nl); }
                    }}>Move Layer Up</Button>
                    <Button variant="outline-secondary" size="sm" className="flex-fill" onClick={() => {
                        const idx = layers.findIndex(l => l.id === selectedLayerId);
                        if(idx > 0) { let nl = [...layers]; [nl[idx], nl[idx-1]] = [nl[idx-1], nl[idx]]; setLayers(nl); saveHistory(nl); }
                    }}>Move Layer Down</Button>
                </div>
                <ListGroup variant="flush">
                  {[...layers].reverse().map(l => (
                    <div key={l.id} className={`p-2 border-bottom ${selectedLayerId === l.id ? 'bg-primary bg-opacity-10' : ''}`}>
                        <div className="d-flex justify-content-between align-items-center">
                            <div onClick={() => setSelectedLayerId(l.id)} style={{ cursor: 'pointer' }}>
                            <small className="fw-bold">{l.locked ? '🔒 ' : ''}{l.name}</small>
                            </div>
                            <div className="d-flex gap-1 align-items-center">
                            {/* Visibility Toggle */}
                            <Form.Check 
                                type="checkbox" 
                                checked={l.visible} 
                                onChange={() => setLayers(layers.map(ly => ly.id === l.id ? { ...ly, visible: !ly.visible } : ly))} 
                                title="Show/Hide Layer"
                            />
                            {/* Layer Lock Toggle */}
                            <Button variant="link" size="sm" className="p-0 text-dark" onClick={() => {
                                setLayers(layers.map(ly => ly.id === l.id ? { ...ly, locked: !ly.locked } : ly));
                            }}>
                                {l.locked ? '🔓' : '🔒'}
                            </Button>
                            <Form.Range style={{ width: '40px' }} min="0" max="1" step="0.1" value={l.opacity} onChange={e => setLayers(layers.map(ly => ly.id === l.id ? { ...ly, opacity: +e.target.value } : ly))} />
                            </div>
                        </div>
                        
                        {/* Elements loop */}
                        <div className="ps-3 border-start">
                            {l.elements.map(el => (
                            <div key={el.id} className="d-flex justify-content-between align-items-center mb-1">
                            <div className={`small p-1 flex-grow-1 ${selectedElementId === el.id ? 'bg-primary text-white rounded' : ''}`}
                                onClick={() => { if(!el.locked && !l.locked) setSelectedElementId(el.id); setSelectedLayerId(l.id); }}>
                                {el.locked ? '🔒 ' : ''}{el.type}
                            </div>

                            <div className="d-flex align-items-center gap-1"> {/* CHANGED: Added gap and buttons */}
                                <Button variant="link" size="sm" className="p-0 text-muted" onClick={() => moveElement(l.id, el.id, 'up')}>↑</Button>
                                <Button variant="link" size="sm" className="p-0 text-muted" onClick={() => moveElement(l.id, el.id, 'down')}>↓</Button>
                                
                                {/* ADDED: Duplicate Icon Button */}
                                <Button variant="link" size="sm" className="p-0 text-primary" title="Duplicate" onClick={() => duplicateElement(el, l.id)}>📋</Button>
                                
                                <Button variant="link" size="sm" className="p-0 text-muted" onClick={() => {
                                setLayers(layers.map(ly => ({ ...ly, elements: ly.elements.map(e => e.id === el.id ? { ...e, locked: !e.locked } : e) })));
                                }}>
                                {el.locked ? '🔓' : '🔒'}
                                </Button>

                                {/* ADDED: Delete Icon Button */}
                                <Button variant="link" size="sm" className="p-0 text-danger" title="Delete" onClick={() => deleteElement(el.id)}>✕</Button>
                            </div>
                            </div>
                            ))}
                        </div>
                    </div>
                  ))}
                </ListGroup>
              </Accordion.Body>
            </Accordion.Item>

            {activeEl && (
              <Accordion.Item eventKey="1">
                <Accordion.Header>Object Properties ({activeEl.type})</Accordion.Header>
                <Accordion.Body>
                    {/* Explicit Transform Inputs */}
                    <Row className="mb-2 g-1">
                        <Col xs={4}><Form.Control size="sm" type="number" placeholder="W" value={Math.round(activeEl.width)} onChange={e=>setLayers(layers.map(l=>({...l, elements:l.elements.map(el=>el.id===selectedElementId?{...el, width:+e.target.value}:el)})))} /></Col>
                        <Col xs={4}><Form.Control size="sm" type="number" placeholder="H" value={Math.round(activeEl.height)} onChange={e=>setLayers(layers.map(l=>({...l, elements:l.elements.map(el=>el.id===selectedElementId?{...el, height:+e.target.value}:el)})))} /></Col>
                        <Col xs={4}><Form.Control size="sm" type="number" placeholder="Rot" value={Math.round(activeEl.rotation)} onChange={e=>setLayers(layers.map(l=>({...l, elements:l.elements.map(el=>el.id===selectedElementId?{...el, rotation:+e.target.value}:el)})))} /></Col>
                    </Row>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <Form.Check 
                            type="switch" 
                            label="Visible" 
                            checked={activeEl.visible !== false} 
                            onChange={(e) => {
                                setLayers(layers.map(l => ({
                                    ...l, elements: l.elements.map(el => el.id === selectedElementId ? { ...el, visible: e.target.checked } : el)
                                })));
                            }}
                        />
                        <Badge bg="secondary">Rotation: {Math.round(activeEl.rotation)}°</Badge>
                    </div>
                  <ButtonGroup size="sm" className="w-100 mb-2">
                    <Button variant={tool==='draw-crop'?'danger':'outline-danger'} onClick={()=>setTool('draw-crop')}>✂ Scissor</Button>
                    <Button variant="outline-info" onClick={()=>{
                        const r = Math.min(activeEl.width, activeEl.height)/2;
                        const path = Array.from({length:37}, (_, i)=>({x:activeEl.width/2+r*Math.cos(i*10*Math.PI/180), y:activeEl.height/2+r*Math.sin(i*10*Math.PI/180)}));
                        setLayers(layers.map(l=>({ ...l, elements: l.elements.map(e=>e.id===selectedElementId?{...e, cropPath:path}:e) })));
                    }}>◯ Circle</Button>
                  </ButtonGroup>
                  {activeEl.type === 'text' && (
                    <>
                    {/* Text Content Area */}
                    <Form.Control 
                      as="textarea" rows={2} size="sm" className="mb-2"
                      value={activeEl.text} 
                      onChange={e=>setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, text:e.target.value}:el)})))} 
                      onBlur={()=>saveHistory(layers)} 
                    />

                    {/* Font Family Selection */}
                    <Form.Select size="sm" className="mb-2" value={activeEl.fontFamily || 'Arial'} 
                      onChange={e=>setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, fontFamily:e.target.value}:el)})))}>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </Form.Select>

                    {/* Size and Color Row */}
                    <Row className="mb-2 g-1">
                      <Col xs={8}>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text">Size</span>
                          <Form.Control type="number" value={activeEl.fontSize} 
                            onChange={e=>setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, fontSize:+e.target.value}:el)})))} />
                        </div>
                      </Col>
                      <Col xs={4}>
                        <Form.Control type="color" size="sm" className="w-100" value={activeEl.color} 
                          onChange={e=>setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, color:e.target.value}:el)})))} />
                      </Col>
                    </Row>

                    {/* Style Toggles: Bold, Italic, Underline */}
                    <ButtonGroup size="sm" className="w-100 mb-2">
                      <Button 
                        variant={activeEl.fontWeight === 'bold' ? 'primary' : 'outline-secondary'}
                        onClick={() => setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold'}:el)})))}
                      ><strong>B</strong></Button>
                      <Button 
                        variant={activeEl.fontStyle === 'italic' ? 'primary' : 'outline-secondary'}
                        onClick={() => setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic'}:el)})))}
                      ><em>I</em></Button>
                      <Button 
                        variant={activeEl.underline ? 'primary' : 'outline-secondary'}
                        onClick={() => setLayers(layers.map(l=>({...l, elements: l.elements.map(el=>el.id===selectedElementId?{...el, underline: !el.underline}:el)})))}
                      ><u>U</u></Button>
                    </ButtonGroup>
                    </>
                  )}
                  <ButtonGroup size="sm" className="w-100 mb-2">
                    <Button variant="outline-primary" onClick={() => duplicateElement(activeEl, selectedLayerId)}>Duplicate Object</Button>
                    </ButtonGroup>

                    <Button variant="danger" size="sm" className="w-100 mt-2" onClick={() => deleteElement(selectedElementId)}> {/* CHANGED: Uses refactored deleteElement */}
                    Delete Object
                    </Button>
                </Accordion.Body>
              </Accordion.Item>
            )}
          </Accordion>

          <Card className="mt-3 shadow-sm border-0">
            <Card.Header className="small py-1">Canvas Dimensions</Card.Header>
            <Card.Body className="p-2">
                <Form.Select size="sm" className="mb-2" value={canvasBgType} onChange={e => setCanvasBgType(e.target.value)}>
                    <option value="color">Solid Color</option>
                    <option value="transparent">Transparent</option>
                    <option value="image">Background Image</option>
                </Form.Select>
                {canvasBgType === 'image' && (
                  <Form.Control type="file" size="sm" className="mb-2" onChange={(e) => {
                    if (!e.target.files[0]) return; // Added: Guard clause
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const img = new Image(); img.src = evt.target.result;
                      img.onload = () => { imageCache.current[img.src] = img; setCanvasBgImage(img.src); setRefresh(r=>r+1); };
                    }; reader.readAsDataURL(e.target.files[0]);
                    e.target.value = ''; // Added: Clear value to allow re-importing same file
                  }} />
                )}
              <InputGroup size="sm">
                <InputGroup.Text>W</InputGroup.Text>
                <Form.Control type="number" value={canvasSize.width} onChange={e=>setCanvasSize({...canvasSize, width:+e.target.value})} />
                <InputGroup.Text>H</InputGroup.Text>
                <Form.Control type="number" value={canvasSize.height} onChange={e=>setCanvasSize({...canvasSize, height:+e.target.value})} />
              </InputGroup>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ImageEditor;