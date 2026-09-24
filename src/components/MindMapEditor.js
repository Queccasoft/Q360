import React, { useState, useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import html2canvas from 'html2canvas';
import { jsPDF } from "jspdf";
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const MindMapEditor = ({ initialData, onUpdate, darkMode }) => {
    // --- State: Data ---
    const [nodes, setNodes] = useState(initialData?.nodes || []);
    const [connectors, setConnectors] = useState(initialData?.connectors || []);
    
    // --- State: History (Undo/Redo) ---
    // We store snapshots of { nodes, connectors }
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // --- State: Viewport ---
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    
    // --- State: Interaction ---
    const [selectedId, setSelectedId] = useState(null);
    const [selectionType, setSelectionType] = useState(null);
    
    // --- Dragging Logic ---
    const [dragMode, setDragMode] = useState(null);
    const [draggingId, setDraggingId] = useState(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 }); 
    const [initialItemPos, setInitialItemPos] = useState({ x: 0, y: 0 });
    const [tempDragEnd, setTempDragEnd] = useState(null); // {x, y} for connector dragging

    const canvasRef = useRef(null);
    const contentRef = useRef(null);
    const fileInputRef = useRef(null);

    // --- Sync & Import ---
    useEffect(() => { onUpdate({ nodes, connectors }); }, [nodes, connectors]);

    // --- History Helper ---
    const addToHistory = () => {
        setHistory(prev => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), connectors: JSON.parse(JSON.stringify(connectors)) }]);
        setRedoStack([]); // Clear redo stack on new action
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        const newHistory = history.slice(0, -1);
        
        // Push current to redo
        setRedoStack(prev => [...prev, { nodes, connectors }]);
        
        setNodes(previousState.nodes);
        setConnectors(previousState.connectors);
        setHistory(newHistory);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[redoStack.length - 1];
        const newRedo = redoStack.slice(0, -1);

        // Push current to history
        setHistory(prev => [...prev, { nodes, connectors }]);

        setNodes(nextState.nodes);
        setConnectors(nextState.connectors);
        setRedoStack(newRedo);
    };

    // --- Handlers ---

    const handleImportJSON = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.nodes && data.connectors) {
                    addToHistory(); // Save state before import
                    setNodes(data.nodes);
                    setConnectors(data.connectors);
                    setPan({ x: 20, y: 20 }); setScale(1);
                }
            } catch (err) { alert("Failed to parse JSON."); }
        };
        reader.readAsText(file);
        e.target.value = null;
    };

    const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    const getContrastYIQ = (hexcolor) => {
        if(!hexcolor) return 'black';
        hexcolor = hexcolor.replace("#", "");
        const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
        return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
    };

    // --- Actions ---
    const addNode = () => {
        addToHistory();
        const centerX = (-pan.x + (canvasRef.current.clientWidth / 2)) / scale;
        const centerY = (-pan.y + (canvasRef.current.clientHeight / 2)) / scale;
        const newNode = { id: generateId(), x: centerX - 60, y: centerY - 25, text: 'New Node', color: '#ff8103' };
        setNodes([...nodes, newNode]);
        setSelectedId(newNode.id); setSelectionType('node');
    };

    const addConnector = () => {
        if (selectionType !== 'node' || !selectedId) return;
        
        // MODIFICATION: Removed Limit of 4
        // MODIFICATION: Clockwise logic (Top, Right, Bottom, Left)
        const existingConns = connectors.filter(c => c.sourceNodeId === selectedId);
        const count = existingConns.length;
        
        // Pattern: Top (0), Right (1), Bottom (2), Left (3)
        // You requested: Up, Right, Bottom, Left
        const sides = ['top', 'right', 'bottom', 'left'];
        const nextSide = sides[count % 4]; 
        
        addToHistory();
        const newConn = {
            id: generateId(), sourceNodeId: selectedId, targetNodeId: null,
            side: nextSide, text: '', color: '#000000'
        };
        setConnectors([...connectors, newConn]);
        setSelectedId(newConn.id); setSelectionType('connector');
    };

    const forkConnector = () => {
        if (selectionType !== 'connector' || !selectedId) return;
        const parentConn = connectors.find(c => c.id === selectedId);
        if (!parentConn) return;
        
        addToHistory();
        const newConn = {
            ...parentConn, id: generateId(), targetNodeId: null, 
            text: parentConn.text + ' (Fork)',
            forkIndex: (parentConn.forkIndex || 0) + 1
        };
        setConnectors([...connectors, newConn]);
    };

    const handleDelete = () => {
         if (!selectedId) return;
         addToHistory(); // Save before delete
         if (selectionType === 'node') {
             const deleteRec = (nid, ns, cs) => {
                 let nRes = ns.filter(n => n.id !== nid);
                 let cRes = cs.filter(c => c.sourceNodeId !== nid && c.targetNodeId !== nid);
                 const children = cs.filter(c => c.sourceNodeId === nid && c.targetNodeId).map(c => c.targetNodeId);
                 children.forEach(childId => {
                     const r = deleteRec(childId, nRes, cRes);
                     nRes = r.n; cRes = r.c;
                 });
                 return {n: nRes, c: cRes};
             };
             const res = deleteRec(selectedId, nodes, connectors);
             setNodes(res.n); setConnectors(res.c);
         } else {
             setConnectors(connectors.filter(c => c.id !== selectedId));
         }
         setSelectedId(null); setSelectionType(null);
    };

    // --- Helper: Get Coordinates (MODIFIED FOR 4-SIDE SNAP) ---
    const getConnectorPoints = (conn, isDragging = false) => {
        const source = nodes.find(n => n.id === conn.sourceNodeId);
        if (!source) return null;

        const nodeW = 120; const nodeH = 50;
        let x1 = source.x + nodeW/2; 
        let y1 = source.y + nodeH/2;
        
        // Source Anchor Logic (Fixed by 'side' property)
        if (conn.side === 'right') x1 += nodeW/2; 
        else if (conn.side === 'left') x1 -= nodeW/2;
        else if (conn.side === 'top') y1 -= nodeH/2; 
        else if (conn.side === 'bottom') y1 += nodeH/2;

        let x2, y2;

        if (isDragging && tempDragEnd) {
            x2 = tempDragEnd.x;
            y2 = tempDragEnd.y;
        } else if (conn.targetNodeId) {
            const target = nodes.find(n => n.id === conn.targetNodeId);
            if (target) {
                // MODIFICATION: Dynamic Snapping to Closest Side
                // We calculate the angle between source anchor (x1,y1) and target center
                const tx = target.x + nodeW/2;
                const ty = target.y + nodeH/2;
                
                const dx = tx - x1;
                const dy = ty - y1;
                
                // Determine dominant axis to snap to Right/Left/Top/Bottom
                // Normalize angle calculation
                if (Math.abs(dx) > Math.abs(dy)) {
                    // Left or Right
                    if (dx > 0) { // Target is to the Right of Source
                        x2 = target.x; // Snap to Target Left Edge
                        y2 = ty;
                    } else { // Target is to the Left of Source
                        x2 = target.x + nodeW; // Snap to Target Right Edge
                        y2 = ty;
                    }
                } else {
                    // Top or Bottom
                    if (dy > 0) { // Target is Below Source
                        x2 = tx;
                        y2 = target.y; // Snap to Target Top Edge
                    } else { // Target is Above Source
                        x2 = tx;
                        y2 = target.y + nodeH; // Snap to Target Bottom Edge
                    }
                }
            } else {
                x2 = x1 + 50; y2 = y1;
            }
        } else {
            // Dangling Logic (No target)
            const stubLen = 60; 
            x2 = x1; y2 = y1;
            if (conn.side === 'right') x2 += stubLen; 
            else if (conn.side === 'left') x2 -= stubLen;
            else if (conn.side === 'top') y2 -= stubLen; 
            else if (conn.side === 'bottom') y2 += stubLen;
            
            if(conn.forkIndex) y2 += (conn.forkIndex * 30);
        }

        return { x1, y1, x2, y2 };
    };

    const getPathString = (pts, side) => {
        if(!pts) return '';
        const { x1, y1, x2, y2 } = pts;
        const cX = (x1 + x2) / 2;
        const cY = (y1 + y2) / 2;
        
        // Simple Bezier for smooth curves based on orientation
        let controlX1 = x1, controlY1 = y1, controlX2 = x2, controlY2 = y2;

        // Source Control Point
        if(side === 'right') controlX1 += 50;
        else if(side === 'left') controlX1 -= 50;
        else if(side === 'top') controlY1 -= 50;
        else if(side === 'bottom') controlY1 += 50;

        // Target Control Point (Heuristic: Assume target entry is opposite to movement)
        // If x2 > x1 (moving right), assume target entry is from left, so control pulls left
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal approach
             controlX2 = x2 + (dx > 0 ? -50 : 50);
        } else {
            // Vertical approach
             controlY2 = y2 + (dy > 0 ? -50 : 50);
        }

        return `M ${x1} ${y1} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${x2} ${y2}`;
    };

    // --- POINTER EVENTS ---
    const handlePointerDown = (e, type, id) => {
        e.stopPropagation();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = canvasRef.current.getBoundingClientRect();
        const worldX = (clientX - rect.left - pan.x) / scale;
        const worldY = (clientY - rect.top - pan.y) / scale;

        setStartPos({ x: clientX, y: clientY });

        if (type === 'node') {
            addToHistory(); // Save state before dragging starts
            setDragMode('node');
            setDraggingId(id);
            const node = nodes.find(n => n.id === id);
            setInitialItemPos({ x: node.x, y: node.y });
            setSelectedId(id); setSelectionType('node');
        } 
        else if (type === 'connector-handle') {
            addToHistory(); // Save state before dragging connector
            setDragMode('connector');
            setDraggingId(id);
            setTempDragEnd({ x: worldX, y: worldY });
            setSelectedId(id); setSelectionType('connector');
        }
        else {
            setDragMode('pan');
            setInitialItemPos({ x: pan.x, y: pan.y });
            setSelectedId(null); setSelectionType(null);
        }
    };

    const handlePointerMove = (e) => {
        if (!dragMode) return;
        e.preventDefault(); e.stopPropagation();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - startPos.x;
        const deltaY = clientY - startPos.y;

        if (dragMode === 'node') {
            const newX = initialItemPos.x + (deltaX / scale);
            const newY = initialItemPos.y + (deltaY / scale);
            setNodes(prev => prev.map(n => n.id === draggingId ? { ...n, x: newX, y: newY } : n));
        } 
        else if (dragMode === 'connector') {
            const rect = canvasRef.current.getBoundingClientRect();
            const worldX = (clientX - rect.left - pan.x) / scale;
            const worldY = (clientY - rect.top - pan.y) / scale;
            setTempDragEnd({ x: worldX, y: worldY });
        }
        else if (dragMode === 'pan') {
            setPan({ x: initialItemPos.x + deltaX, y: initialItemPos.y + deltaY });
        }
    };

    const handlePointerUp = (e) => {
        if (dragMode === 'connector' && draggingId) {
            const connector = connectors.find(c => c.id === draggingId);
            // Snap Logic
            const droppedNode = nodes.find(n => 
                tempDragEnd.x >= n.x && tempDragEnd.x <= n.x + 120 &&
                tempDragEnd.y >= n.y && tempDragEnd.y <= n.y + 50
            );

            if (droppedNode && droppedNode.id !== connector.sourceNodeId) {
                // MODIFICATION: Removed Connection Limit Check
                // MODIFICATION: Logic for snapping is handled in getConnectorPoints visually, 
                // here we just link the ID.
                setConnectors(prev => prev.map(c => c.id === draggingId ? { ...c, targetNodeId: droppedNode.id } : c));
            } else {
                setConnectors(prev => prev.map(c => c.id === draggingId ? { ...c, targetNodeId: null } : c));
            }
        }
        setDragMode(null);
        setDraggingId(null);
        setTempDragEnd(null);
    };

    // --- Data Updates (Wrappers for History) ---
    const updateText = (val) => {
        // Debouncing history for text typing is complex, 
        // for simplicity we won't add history on every keystroke here, 
        // or we assume the user clicks the node first (which saved history).
        // Ideally, save history onBlur, but to keep it simple:
        // We will just update state. You might want to add onFocus logic for history.
        if (selectionType === 'node') setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, text: val } : n));
        else setConnectors(prev => prev.map(c => c.id === selectedId ? { ...c, text: val } : c));
    };

    const updateColor = (val) => {
        addToHistory(); // Save on color change
        if (selectionType === 'node') setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, color: val } : n));
        else setConnectors(prev => prev.map(c => c.id === selectedId ? { ...c, color: val } : c));
    };

// --- EXPORT LOGIC ---
const saveFile = async (fileName, data, isBase64 = false) => {
    // 1. NATIVE ANDROID/IOS LOGIC
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            await Filesystem.writeFile({
                path: fileName,
                data: data,
                directory: Directory.Documents,
                // If it's Base64 (PNG/PDF), we don't set encoding. 
                // If it's Text (JSON/SVG), we use UTF8.
                encoding: isBase64 ? undefined : Encoding.UTF8,
            });
            alert(`Saved to Documents: ${fileName}`);
        } catch (e) {
            console.error('Native save error', e);
            alert("Export failed on device.");
        }
        return;
    }

    // 2. WEB BROWSER / PWA FALLBACK
    const finalHref = isBase64 
        ? `data:application/octet-stream;base64,${data}` 
        : `data:text/plain;charset=utf-8,${encodeURIComponent(data)}`;

    const link = document.createElement('a');
    link.href = finalHref;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
};
// const saveFile = async (fileName, data, isBase64 = false) => {
//     // 1. NATIVE ANDROID/IOS LOGIC (Capacitor AAB/APK)
//     if (window.Capacitor && window.Capacitor.isNativePlatform()) {
//         try {
//             await Filesystem.writeFile({
//                 path: fileName,
//                 data: data,
//                 directory: Directory.Documents,
//                 encoding: isBase64 ? undefined : Encoding.UTF8,
//             });
//             alert(`File saved to Documents: ${fileName}`);
//         } catch (e) {
//             console.error('Native save error', e);
//             alert("Native save failed. Check permissions.");
//         }
//         return;
//     }

//     // 2. PWA / MOBILE BROWSER & DESKTOP LOGIC
//     let blob;
    
//     // Convert data to a proper Blob. Mobile browsers handle Blobs 
//     // much better than massive Base64 Data URLs.
//     if (isBase64) {
//         const byteCharacters = atob(data); // Decode base64
//         const byteNumbers = new Array(byteCharacters.length);
//         for (let i = 0; i < byteCharacters.length; i++) {
//             byteNumbers[i] = byteCharacters.charCodeAt(i);
//         }
//         const byteArray = new Uint8Array(byteNumbers);
        
//         // Guess the MIME type for better mobile OS handling
//         const ext = fileName.split('.').pop().toLowerCase();
//         const mimeType = ext === 'png' ? 'image/png' : 
//                          ext === 'pdf' ? 'application/pdf' : 
//                          ext === 'qnote' ? 'application/zip' : 'application/octet-stream';
                         
//         blob = new Blob([byteArray], { type: mimeType });
//     } else {
//         blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
//     }

//     const blobUrl = URL.createObjectURL(blob);
//     const link = document.createElement('a');
//     link.href = blobUrl;
//     link.download = fileName;
    
//     document.body.appendChild(link);
//     link.click();
    
//     // CRITICAL FIX FOR MOBILE WEB: 
//     // Wait 1.5 seconds. Mobile OS download managers need a moment to register 
//     // the click before we destroy the URL and DOM element.
//     setTimeout(() => {
//         document.body.removeChild(link);
//         URL.revokeObjectURL(blobUrl); // Frees up browser memory
//     }, 1500); 
// };
const downloadJSON = async () => {
    const jsonString = JSON.stringify({ nodes, connectors }, null, 2);
    await saveFile(`MindMap_${Date.now()}.json`, jsonString, false);
};

const downloadSVG = async () => {
    const data = getMapSVGData();
    if (!data) return;
    await saveFile(`MindMap_${Date.now()}.svg`, data.svgString, false);
};

const downloadMapAsPNG = async () => {
    const data = getMapSVGData();
    if (!data) return;
    
    const canvas = await svgToCanvas(data.svgString, data.width, data.height);
    const dataUrl = canvas.toDataURL("image/png");
    const base64Data = dataUrl.split(',')[1]; // Extract raw base64
    
    await saveFile(`MindMap_${Date.now()}.png`, base64Data, true);
};

const downloadPDF = async () => {
    const data = getMapSVGData();
    if (!data) return;
    const canvas = await svgToCanvas(data.svgString, data.width, data.height);
    const imgData = canvas.toDataURL('image/png');
    
    const orientation = data.width > data.height ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'px', [data.width, data.height]);
    pdf.addImage(imgData, 'PNG', 0, 0, data.width, data.height);
    
    const fileName = `MindMap_${Date.now()}.pdf`;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        // For mobile, get the PDF as a base64 string
        const base64PDF = pdf.output('datauristring').split(',')[1];
        await saveFile(fileName, base64PDF, true);
    } else {
        // For desktop, use the standard jsPDF save
        pdf.save(fileName);
    }
};
    
// --- 1. Centralized SVG Generator ---
const getMapSVGData = () => {
    if (!contentRef.current || nodes.length === 0) return null;

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if(n.x < minX) minX = n.x;
        if(n.y < minY) minY = n.y;
        if(n.x + 140 > maxX) maxX = n.x + 140;
        if(n.y + 60 > maxY) maxY = n.y + 60;
    });

    const padding = 60;
    const footerSpace = 40; // Extra space for the watermark
    const width = (maxX - minX) + (padding * 2);
    const height = (maxY - minY) + (padding * 2) + footerSpace;

    // 2. Extract Connectors
    const originalSvg = contentRef.current.querySelector('svg');
    const connectorsContent = originalSvg.innerHTML;

    // 3. Map Nodes to SVG
    let nodesSvgMarkup = '';
    nodes.forEach(node => {
        const x = node.x - minX + padding;
        const y = node.y - minY + padding;
        const textColor = getContrastYIQ(node.color);
        
        nodesSvgMarkup += `
            <g transform="translate(${x}, ${y})">
                <rect width="120" height="50" rx="25" fill="${node.color}" />
                <text x="60" y="30" fill="${textColor}" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="14">
                    ${node.text}
                </text>
            </g>`;
    });

    // 4. Final SVG String with centered watermark
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="${darkMode ? '#1e1e1e' : '#f8f9fa'}" />
            
            <g transform="translate(${-minX + padding}, ${-minY + padding})">
                ${connectorsContent}
            </g>
            ${nodesSvgMarkup}

            <text 
                x="${width / 2}" 
                y="${height - 20}" 
                fill="${darkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'}" 
                text-anchor="middle" 
                font-family="sans-serif" 
                font-size="12" 
                font-style="italic"
            >
                Created with QNote
            </text>
        </svg>`.trim();

    return { svgString, width, height };
};

// --- 2. Helper to convert SVG String to Canvas ---
const svgToCanvas = async (svgString, width, height) => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        canvas.width = width * 2; // Double scale for high quality
        canvas.height = height * 2;
        ctx.scale(2, 2);

        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };
        img.src = url;
    });
};

const shareViaWebAPI = async () => {
    const data = getMapSVGData();
    if (!data) return;
    
    const canvas = await svgToCanvas(data.svgString, data.width, data.height);
    const dataUrl = canvas.toDataURL("image/png");
    const base64Data = dataUrl.split(',')[1];
    const fileName = `MindMap_Share.png`;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache
            });

            await Share.share({
                title: 'Mind Map',
                url: savedFile.uri,
            });
        } catch (err) {
            console.error(err);
        }
    } else {
        // Fallback to Web Share or Download
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.share) {
            await navigator.share({ files: [file], title: 'Mind Map' });
        } else {
            downloadMapAsPNG();
        }
    }
};
    return (
        <div className="d-flex flex-column h-100" style={{userSelect: 'none', overflow:'hidden'}}>
             {/* Toolbar */}
             <div className={`p-2 d-flex gap-2 align-items-center border-bottom ${darkMode ? 'bg-dark border-secondary' : 'bg-light'}`}
            style={{zIndex: 100, position: 'sticky', overflowX: 'auto', whiteSpace: 'nowrap', msOverflowStyle: 'none', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'}}>
                <style>{`.sticky-toolbar::-webkit-scrollbar { display: none; }`}</style>
                {/* NEW: UNDO/REDO BUTTONS */}
                <Button className='saffron-btn' size="sm" onClick={handleUndo} disabled={history.length === 0} title="Undo"><i className="bi bi-arrow-counterclockwise"></i></Button>
                <Button className='saffron-btn' size="sm" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo"><i className="bi bi-arrow-clockwise"></i></Button>
                <div className="vr mx-1"></div>

                <Button className='saffron-btn' title="Add Node" size="sm" onClick={addNode}><i className="bi bi-plus"></i></Button>
                <Button className='saffron-btn' title="Add Connector" size="sm" onClick={addConnector} disabled={selectionType !== 'node'}><i className="bi bi-arrows-move"></i></Button>
                <Button className='saffron-btn' title="Fork Connector" size="sm" onClick={forkConnector} disabled={selectionType !== 'connector'}><i className="bi bi-signpost-split"></i></Button>
                <Button className='saffron-btn' title="Delete" size="sm" onClick={handleDelete} disabled={!selectedId}><i className="bi bi-trash"></i></Button>
                {selectedId && (
                    <>
                    <Form.Control title="Color" type="color" size="sm" style={{width: '2rem', height: '2rem', borderRadius: '50px', padding: 0, flexShrink: 0,}}
                        value={selectionType === 'node' ? nodes.find(n=>n.id===selectedId)?.color : connectors.find(c=>c.id===selectedId)?.color}
                        onChange={(e) => updateColor(e.target.value)} />
                    <Form.Control size="sm" type="text" placeholder="Label..." style={{width: '15rem'}}
                        value={selectionType === 'node' ? nodes.find(n=>n.id===selectedId)?.text : connectors.find(c=>c.id===selectedId)?.text}
                        onChange={(e) => updateText(e.target.value)} />
                    </>
                )}
                <div className="d-flex gap-1 ms-auto">
                    <div className="d-flex align-items-center gap-1 bg-white rounded px-2 border" style={{minWidth:'auto'}}>
                        <i className="bi bi-zoom-out small text-muted" onClick={() => setScale(s => Math.max(0.2, s - 0.1))}></i>
                        <Form.Range min={0.2} max={2.0} step={0.1} value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} style={{width: 'auto'}}/>
                        <i className="bi bi-zoom-in small text-muted" onClick={() => setScale(s => Math.min(2.0, s + 0.1))}></i>
                    </div>
                    <Button variant="outline-primary rounded-ui" size="sm" onClick={() => fileInputRef.current.click()}><i className="bi bi-file-earmark-arrow-up"></i></Button>
                    <input type="file" ref={fileInputRef} hidden accept=".json" onChange={handleImportJSON} />
                    <Button variant="outline-danger rounded-ui" size="sm" onClick={downloadMapAsPNG}><i className="bi bi-filetype-png text-danger"></i></Button>
                    <Button variant="outline-primary rounded-ui" size="sm" onClick={downloadJSON}><i className="bi bi-filetype-json text-primary"></i></Button>
                    <Button variant="outline-danger rounded-ui" size="sm" onClick={downloadPDF}><i className="bi bi-file-earmark-pdf text-danger"></i></Button>
                    <Button variant="outline-warning rounded-ui" size="sm" onClick={downloadSVG}><i className="bi bi-filetype-svg text-warning"></i></Button>
                    <Button variant="outline-success rounded-ui" size="sm" onClick={shareViaWebAPI}><i className="bi bi-send-fill text-success"></i></Button>
                </div>
            </div>

            <div ref={canvasRef} className="flex-grow-1 position-relative overflow-hidden"
                style={{ backgroundColor: darkMode ? '#1e1e1e' : '#f8f9fa', cursor: dragMode === 'pan' ? 'grabbing' : 'default', touchAction: 'none' }}
                onPointerDown={(e) => handlePointerDown(e, 'pan')}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <div ref={contentRef}
                    style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none'
                    }}
                >
                    <svg className="overflow-visible" style={{width: '100%', height: '100%'}}>
                        {connectors.map(conn => {
                            const isSel = selectedId === conn.id;
                            const isDragging = dragMode === 'connector' && draggingId === conn.id;
                            const pts = getConnectorPoints(conn, isDragging);
                            if(!pts) return null;
                            const d = getPathString(pts, conn.side); // Modified Bezier logic inside
                            
                            // Arrowhead Math
                            const angle = Math.atan2(pts.y2 - pts.y1, pts.x2 - pts.x1);
                            // Adjust angle if approaching from specific sides for cleaner look
                            // (Simplistic approach: use the calculated angle between last control point and end)
                            const arrowLen = 10;
                            const ax = pts.x2 - arrowLen * Math.cos(angle - Math.PI/6);
                            const ay = pts.y2 - arrowLen * Math.sin(angle - Math.PI/6);
                            const bx = pts.x2 - arrowLen * Math.cos(angle + Math.PI/6);
                            const by = pts.y2 - arrowLen * Math.sin(angle + Math.PI/6);

                            return (
                                <g key={conn.id} style={{pointerEvents: 'auto'}}>
                                    <path d={d} stroke="transparent" strokeWidth="20" fill="none" style={{cursor: 'pointer'}}
                                          onPointerDown={(e) => { e.stopPropagation(); setSelectedId(conn.id); setSelectionType('connector'); }}/>
                                    <path d={d} stroke={conn.color} strokeWidth={isSel?3:2} fill="none" style={{filter: isSel ? 'drop-shadow(0 0 3px orange)' : 'none'}}/>
                                    <polygon points={`${pts.x2},${pts.y2} ${ax},${ay} ${bx},${by}`} fill={conn.color} />
                                    <circle cx={pts.x2} cy={pts.y2} r={8} fill={isSel ? "orange" : "rgba(0,0,0,0.1)"} stroke="white" strokeWidth="1"
                                        className="connector-handle" style={{cursor: 'crosshair'}}
                                        onPointerDown={(e) => handlePointerDown(e, 'connector-handle', conn.id)}
                                    />
                                    {conn.text && (
                                        <text fontSize="12" fill={conn.color} textAnchor="middle" dy="-5" x={(pts.x1+pts.x2)/2} y={(pts.y1+pts.y2)/2}>
                                            {conn.text}
                                        </text>
                                    )}
                                </g>
                            )
                        })}
                    </svg>
                    {nodes.map(node => (
                        <div key={node.id}
                            className="position-absolute d-flex align-items-center justify-content-center shadow"
                            style={{
                                left: node.x, top: node.y, width: '120px', height: '50px',
                                backgroundColor: node.color, color: getContrastYIQ(node.color),
                                borderRadius: '25px',
                                border: selectedId === node.id ? '3px solid #0d6efd' : '2px solid rgba(255,255,255,0.2)',
                                cursor: 'grab', fontSize: '0.9rem', fontWeight: '600',
                                zIndex: 10, pointerEvents: 'auto', userSelect: 'none', touchAction: 'none'
                            }}
                            onPointerDown={(e) => handlePointerDown(e, 'node', node.id)}
                        >
                            <span className="text-truncate px-2">{node.text}</span>
                        </div>
                    ))}
                </div>
                <div className="position-absolute bottom-0 end-0 p-2 opacity-50 small pe-none">{Math.round(scale * 100)}% | {nodes.length} Nodes</div>
            </div>
        </div>
    );
};

export default MindMapEditor;