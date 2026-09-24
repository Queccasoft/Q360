import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Stack, Card, InputGroup, Dropdown, ButtonGroup, Spinner, Alert, Container, Row, Collapse, Col } from 'react-bootstrap';
import { Keyboard } from '@capacitor/keyboard';
import { Rnd } from 'react-rnd'; 
import pptxgen from "pptxgenjs";
import { jsPDF } from "jspdf";
import * as pdfjsLib from 'pdfjs-dist';
import html2canvas from "html2canvas";
import JSZip from "jszip";
import "./QSlideTheme.css";
import MultiChartGen from "./MultiChartGen";
import TextEditorEngine from "./TextEditorEngine";
// Configures the worker locally using your bundler's asset compiler
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', // Note: change to .js if using an older v2/v3 version of pdfjs-dist
    import.meta.url
).toString();
const QSlide = ({ fileHandle, onSave, onDownload, onShare }) => {
    // PLATFORM TRACKING STATE
      const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
      const [isMobile, setIsMobile] = useState(window.innerWidth < 992);

    // History for Undo/Redo
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Clipboard for Cut/Copy/Paste
    const [selectedIds, setSelectedIds] = useState([]);
    const [clipboard, setClipboard] = useState([]);

    const [fileName, setFileName] = useState(fileHandle?.name || "Presentation");
    // Default state
    const [slides, setSlides] = useState([{ title: "Slide Title", background: 'FFFFFF', elements: [] }]);
    const [draggedIdx, setDraggedIdx] = useState(null);
    const [activeSlideIdx, setActiveSlideIdx] = useState(0);
    const [selectedId, setSelectedId] = useState(null);
    const [showGrid, setShowGrid] = useState(false);
    const [isSlideshow, setIsSlideshow] = useState(false);
    const [isLoading, setIsLoading] = useState(false); // New loading state
    const [errorMsg, setErrorMsg] = useState(null); // Error handling
    const [isDrawMode, setIsDrawMode] = useState(false);
    const [drawColor, setDrawColor] = useState('FF0000'); // Clean hex string
    const [drawSize, setDrawSize] = useState(4);
    const [currentDrawingPath, setCurrentDrawingPath] = useState(null); // Tracks active path string
    // New States
    const [showChartModal, setShowChartModal] = useState(false);
    const [chartInput, setChartInput] = useState({
        title: "New Chart",
        type: "pie", // Default
        isGrouped: false,
        // For Single:
        data: [{ label: "Item 1", value: 10, color: "#36A2EB" }],
        // For Grouped:
        labels: ["Q1", "Q2"], 
        series: [{ label: "Series 1", values: [10, 20], color: "#FF6384" }]
    });
    const [editingId, setEditingId] = useState(null);
    const [savedRange, setSavedRange] = useState(null);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [isControlPressed, setIsControlPressed] = useState(false);
    const [draggingConnectorId, setDraggingConnectorId] = useState(null);
    const [darkMode, setDarkMode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [slideColor, setSlideColor] = useState('#ffffff');
    const [slideBgImage, setSlideBgImage] = useState();
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    
    const stageRef = useRef(null);
    const [stageWidth, setStageWidth] = useState(800); 
    // NEW STATE FOR CUSTOM DIMENSIONS
    const [slideDim, setSlideDim] = useState({ w: 1200, h: 675 }); // Default 16:9
    const [tempDim, setTempDim] = useState({ w: 1200, h: 675 });

    // STATE & REF FOR SCALING
    const containerRef = useRef(null);
    const [zoom, setZoom] = useState(1);

    // UPDATE HARDCODED VARS
    const PPT_W = 10;
    const SNAP_THRESHOLD = 15; 

    useEffect(() => {
    const handleKeyDown = (e) => {
        const activeEl = document.activeElement;
        // Check if user is typing inside an input, textarea, or rich text editor
        const isTyping = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable
        );

        // Cross-platform control key support
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const key = e.key.toLowerCase();

        if (e.key === 'Shift') setIsShiftPressed(true);
        if (e.key === 'Control' || e.key === 'Meta') setIsControlPressed(true);

        // 0. GLOBAL APPLICATION SHORTCUTS
        if (isCtrl && key === 'p') { 
            e.preventDefault(); 
            if (typeof handlePrint === 'function') handlePrint(); 
            return; 
        }

        // 1. TEXT EDITING OVERRIDE (Slides Shortcuts)
        if (isTyping) {
            // Apply Rich Text Commands ONLY if we are inside a ContentEditable element
            if (isCtrl && activeEl.isContentEditable) {
                const selection = window.getSelection();

                // Core Formatting: Ctrl + B / I / U
                if (key === 'b') { e.preventDefault(); TextEditorEngine.execute('bold', null, selection); return; }
                if (key === 'i') { e.preventDefault(); TextEditorEngine.execute('italic', null, selection); return; }
                if (key === 'u') { e.preventDefault(); TextEditorEngine.execute('underline', null, selection); return; }

                // Strikethrough: Ctrl + Shift + X
                if (isShift && key === 'x') { e.preventDefault(); TextEditorEngine.execute('strikethrough', null, selection); return; }
                
                // Clear Formatting: Ctrl + \
                if (key === '\\') { e.preventDefault(); TextEditorEngine.execute('removeformat', null, selection); return; }
                
                // Insert Link: Ctrl + K
                if (key === 'k') { 
                    e.preventDefault(); 
                    const url = prompt("Enter link URL:", "https://");
                    if (url) TextEditorEngine.execute('createlink', url, selection); 
                    return; 
                }

                // Alignment: Ctrl + Shift + L / E / R / J
                if (isShift && key === 'l') { e.preventDefault(); TextEditorEngine.execute('justifyleft', null, selection); updateSelectedElements({ align: 'left' }, true); return; }
                if (isShift && key === 'e') { e.preventDefault(); TextEditorEngine.execute('justifycenter', null, selection); updateSelectedElements({ align: 'center' }, true); return; }
                if (isShift && key === 'r') { e.preventDefault(); TextEditorEngine.execute('justifyright', null, selection); updateSelectedElements({ align: 'right' }, true); return; }
                if (isShift && key === 'j') { e.preventDefault(); TextEditorEngine.execute('justifyfull', null, selection); updateSelectedElements({ align: 'justify' }, true); return; }
                
                // Indentation: Ctrl + ] or [
                if (key === ']') { e.preventDefault(); TextEditorEngine.execute('indent', null, selection); return; }
                if (key === '[') { e.preventDefault(); TextEditorEngine.execute('outdent', null, selection); return; }
                
                // Script: Ctrl + . or ,
                if (key === '.') { e.preventDefault(); TextEditorEngine.execute('superscript', null, selection); return; }
                if (key === ',') { e.preventDefault(); TextEditorEngine.execute('subscript', null, selection); return; }

                // Font Size: Ctrl + Shift + > or <
                if (isShift && (key === '>' || key === '.')) { 
                    e.preventDefault(); 
                    if (selectedIds.length > 0) {
                        const el = slides[activeSlideIdx].elements.find(el => selectedIds.includes(el.id));
                        if(el) {
                            const newSize = (parseInt(el.fontSize) || 16) + 1;
                            TextEditorEngine.execute('fontsize', `${newSize}px`, selection);
                            updateSelectedElements({ fontSize: newSize }, true);
                        }
                    }
                    return; 
                }
                if (isShift && (key === '<' || key === ',')) { 
                    e.preventDefault(); 
                    if (selectedIds.length > 0) {
                        const el = slides[activeSlideIdx].elements.find(el => selectedIds.includes(el.id));
                        if(el) {
                            const newSize = Math.max(1, (parseInt(el.fontSize) || 16) - 1);
                            TextEditorEngine.execute('fontsize', `${newSize}px`, selection);
                            updateSelectedElements({ fontSize: newSize }, true);
                        }
                    }
                    return; 
                }

                // Placeholder for Accessibility / Advanced APIs
                if (isShift && key === 's') { e.preventDefault(); alert("Voice Dictation triggered (Require Speech API hook)"); return; }
                if (isShift && key === 'u') { e.preventDefault(); alert("Read Aloud triggered (Require Speech Synthesis hook)"); return; }

                // Allow native browser execution for standard clipboard interactions
                if (['c', 'v', 'x', 'a'].includes(key)) return; 
            }
            
            // Allow cursor navigation and text deletion to operate natively inside ALL text fields
            if (['delete', 'backspace', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'tab'].includes(key)) return;
        }

        // ==========================================
        // 2. GLOBAL ELEMENT SHORTCUTS
        // ==========================================
        
        // Undo / Redo
        if (isCtrl && key === 'z') { 
            e.preventDefault(); 
            if (isShift) redo(); // Cmd + Shift + Z (Mac Redo)
            else undo();         // Ctrl + Z (Undo)
            return; 
        }
        if (isCtrl && key === 'y') { e.preventDefault(); redo(); return; } // Ctrl + Y (Windows Redo)

        // Z-Index
        if (isCtrl && e.key === 'ArrowUp') { e.preventDefault(); moveZIndex('up'); return; }
        if (isCtrl && e.key === 'ArrowDown') { e.preventDefault(); moveZIndex('down'); return; }

        // Select All Elements
        if (isCtrl && key === 'a') {
            e.preventDefault();
            setSelectedIds(slides[activeSlideIdx].elements.map(el => el.id));
            return;
        }

        // Copy, Cut, Paste Entire Elements
        if (isCtrl && key === 'c') { e.preventDefault(); copyElement(); return; }
        if (isCtrl && key === 'x') { e.preventDefault(); cutElement(); return; }
        if (isCtrl && key === 'v') { e.preventDefault(); pasteElement(); return; }

        // Duplicate Elements (Ctrl + D)
        if (isCtrl && key === 'd') {
            e.preventDefault(); 
            if (selectedIds.length > 0) {
                const newIds = [];
                const newElements = [];
                slides[activeSlideIdx].elements.forEach(el => {
                    if (selectedIds.includes(el.id)) {
                        const dup = JSON.parse(JSON.stringify(el));
                        dup.id = Date.now() + Math.random();
                        dup.x += 20; dup.y += 20;
                        newIds.push(dup.id);
                        newElements.push(dup);
                    }
                });
                const newSlides = [...slides];
                newSlides[activeSlideIdx].elements.push(...newElements);
                setSlides(newSlides);
                setSelectedIds(newIds);
                saveToHistory(newSlides);
            }
            return;
        }

        // Delete Elements
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedIds.length > 0) {
                e.preventDefault();
                const newSlides = [...slides];
                newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.filter(
                    el => !selectedIds.includes(el.id)
                );
                setSlides(newSlides);
                setSelectedIds([]);
                saveToHistory(newSlides);
            }
            return;
        }

        // Nudge Elements or Change Slides
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            if (selectedIds.length > 0) {
                const nudgeFactor = e.shiftKey ? 10 : 2; 
                let dx = 0, dy = 0;
                if (e.key === 'ArrowUp') dy = -nudgeFactor;
                if (e.key === 'ArrowDown') dy = nudgeFactor;
                if (e.key === 'ArrowLeft') dx = -nudgeFactor;
                if (e.key === 'ArrowRight') dx = nudgeFactor;

                const newSlides = [...slides];
                newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(el => {
                    if (selectedIds.includes(el.id)) return { ...el, x: (el.x || 0) + dx, y: (el.y || 0) + dy };
                    return el;
                });
                setSlides(newSlides);
                saveToHistory(newSlides);
            } else {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveSlideIdx((prev) => (prev + 1) % slides.length);
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setActiveSlideIdx((prev) => (prev - 1 + slides.length) % slides.length);
            }
        }
    };

    const handleKeyUp = (e) => {
        if (e.key === 'Shift') setIsShiftPressed(false);
        if (e.key === 'Control' || e.key === 'Meta') setIsControlPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
}, [slides, activeSlideIdx, selectedIds, clipboard, historyIndex, history]);
const saveToHistory = (newSlides) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newSlides)));
    
    // Limit history to 50 steps for performance
    if (newHistory.length > 50) newHistory.shift();
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
};

const undo = () => {
    if (historyIndex > 0) {
        const prevIndex = historyIndex - 1;
        setSlides(JSON.parse(JSON.stringify(history[prevIndex])));
        setHistoryIndex(prevIndex);
    }
};

const redo = () => {
    if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setSlides(JSON.parse(JSON.stringify(history[nextIndex])));
        setHistoryIndex(nextIndex);
    }
};

const CustomResizeHandle = ({ side }) => {
    const isCorner = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(side);
    const style = {
        width: isCorner ? '14px' : '24px',
        height: isCorner ? '14px' : '24px',
        backgroundColor: '#fff',
        border: '2px solid #0078D4',
        borderRadius: isCorner ? '50%' : '4px',
        position: 'absolute',
        // Center the side handles
        ...(side === 'top' && { left: '50%', transform: 'translateX(-50%)', top: '-7px' }),
        ...(side === 'bottom' && { left: '50%', transform: 'translateX(-50%)', bottom: '-7px' }),
        ...(side === 'left' && { top: '50%', transform: 'translateY(-50%)', left: '-7px' }),
        ...(side === 'right' && { top: '50%', transform: 'translateY(-50%)', right: '-7px' }),
    };
    return <div style={style} className="resize-handle" />;
};

    useEffect(() => {
        if (stageRef.current) setStageWidth(stageRef.current.offsetWidth);
    }, [activeSlideIdx, isSlideshow]);

    // DYNAMIC ZOOM EFFECT
    useEffect(() => {
        const calculateZoom = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                // Leave 40px padding in editor mode, 0px in slideshow mode
                const paddingW = isSlideshow ? 0 : 60; 
                const paddingH = isSlideshow ? 0 : 60;
                
                const scaleW = (clientWidth - paddingW) / slideDim.w;
                const scaleH = (clientHeight - paddingH) / slideDim.h;
                
                // Pick the smaller scale to ensure it fits entirely in the window
                setZoom(Math.min(scaleW, scaleH, 1)); // Remove the ', 1' if you want it to scale UP (zoom in) beyond 100% on huge screens
            }
        };

        calculateZoom();
        window.addEventListener('resize', calculateZoom);
        return () => window.removeEventListener('resize', calculateZoom);
    }, [slideDim, isSlideshow]); // Recalculate if dimensions or view mode changes

    useEffect(() => {
    const loadInitialFile = async () => {
        if (fileHandle) {
            const file = await fileHandle.getFile();
            // Call the shared processor
            processFileImport(file);
        }
    };
    loadInitialFile();
}, [fileHandle]); // Triggers when the user selects a new file in FileManager

const parseNativePPTX = async (zip) => {
    const newSlides = [];
    
    // --- 1. Detect Slide Dimensions from presentation.xml ---
    const presXmlText = await zip.file("ppt/presentation.xml")?.async("text");
    if (!presXmlText) return [];
    
    const presDoc = new DOMParser().parseFromString(presXmlText, "text/xml");
    const sldSz = presDoc.getElementsByTagName("p:sldSz")[0];
    const cxEmu = parseInt(sldSz.getAttribute("cx"));
    const cyEmu = parseInt(sldSz.getAttribute("cy"));

    // Conversion: 1 inch = 914,400 EMUs. 1 inch = 96 pixels.
    const wPx = Math.round((cxEmu / 914400) * 96);
    const hPx = Math.round((cyEmu / 914400) * 96);

    // Update editor state to match imported file
    setSlideDim({ w: wPx, h: hPx });
    setTempDim({ w: wPx, h: hPx });

    // Helper: EMU to PX (now dynamic based on file's internal scale)
    const emuToPxImport = (val) => (val / 914400) * 96;

    let slideIdx = 1;
    while (true) {
        const slidePath = `ppt/slides/slide${slideIdx}.xml`;
        const slideFile = zip.file(slidePath);
        if (!slideFile) break;

        const xmlText = await slideFile.async("text");
        const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
        const elements = [];

        // --- 2. Get Background ---
        let bgColor = "FFFFFF";
        const bgPr = xmlDoc.getElementsByTagName("p:bgPr")[0];
        const srgbClr = bgPr?.getElementsByTagName("a:srgbClr")[0];
        if (srgbClr) bgColor = srgbClr.getAttribute("val");

        // --- 3. Process Graphic Frames (Tables) ---
        const graphicFrames = xmlDoc.getElementsByTagName("p:graphicFrame");
        Array.from(graphicFrames).forEach(frame => {
            const tbl = frame.getElementsByTagName("a:tbl")[0];
            if (tbl) {
                const xfrm = frame.getElementsByTagName("a:off")[0];
                const ext = frame.getElementsByTagName("a:ext")[0];
                const rows = Array.from(tbl.getElementsByTagName("a:tr")).map(tr => 
                    Array.from(tr.getElementsByTagName("a:tc")).map(tc => 
                        Array.from(tc.getElementsByTagName("a:t")).map(t => t.textContent).join(" ")
                    )
                );

                elements.push({
                    id: Date.now() + Math.random(), type: 'table', tableData: rows,
                    x: emuToPxImport(parseInt(xfrm.getAttribute("x"))),
                    y: emuToPxImport(parseInt(xfrm.getAttribute("y"))),
                    w: emuToPxImport(parseInt(ext.getAttribute("cx"))),
                    h: emuToPxImport(parseInt(ext.getAttribute("cy"))),
                    fontSize: 14, borderColor: '000000', borderWidth: 1
                });
            }
        });

        // --- 4. Process Images ---
        const relsPath = `ppt/slides/_rels/slide${slideIdx}.xml.rels`;
        const relsText = await zip.file(relsPath)?.async("text") || "";
        const relsDoc = new DOMParser().parseFromString(relsText, "text/xml");
        const relMap = {};
        Array.from(relsDoc.getElementsByTagName("Relationship")).forEach(rel => {
            relMap[rel.getAttribute("Id")] = rel.getAttribute("Target").replace('../', 'ppt/');
        });

        const pics = xmlDoc.getElementsByTagName("p:pic");
        for (const pic of Array.from(pics)) {
            const rId = pic.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed");
            const xfrm = pic.getElementsByTagName("a:off")[0];
            const ext = pic.getElementsByTagName("a:ext")[0];

            if (rId && relMap[rId] && xfrm && ext) {
                const imgFile = zip.file(relMap[rId]);
                if (imgFile) {
                    const imgData = await imgFile.async("base64");
                    elements.push({
                        id: Date.now() + Math.random(), type: 'image',
                        data: `data:image/png;base64,${imgData}`,
                        x: emuToPxImport(parseInt(xfrm.getAttribute("x"))),
                        y: emuToPxImport(parseInt(xfrm.getAttribute("y"))),
                        w: emuToPxImport(parseInt(ext.getAttribute("cx"))),
                        h: emuToPxImport(parseInt(ext.getAttribute("cy"))),
                        rotate: 0, borderColor: '000000', borderWidth: 0
                    });
                }
            }
        }

        // --- 5. Process Shapes & Text ---
        const shapes = xmlDoc.getElementsByTagName("p:sp");
        Array.from(shapes).forEach((sp) => {
            const txBody = sp.getElementsByTagName("p:txBody")[0];
            const xfrm = sp.getElementsByTagName("a:off")[0];
            const ext = sp.getElementsByTagName("a:ext")[0];

            if (xfrm && ext) {
                let fullText = "";
                if (txBody) {
                    fullText = Array.from(txBody.getElementsByTagName("a:p")).map(p => 
                        Array.from(p.getElementsByTagName("a:t")).map(t => t.textContent).join("")
                    ).join("\n");
                }

                const sFill = sp.getElementsByTagName("a:solidFill")[0];
                const fillClr = sFill?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val") || "none";
                
                const tFill = txBody?.getElementsByTagName("a:solidFill")[0];
                const textColor = tFill?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val") || "333333";

                const baseEl = {
                    id: Date.now() + Math.random(),
                    x: emuToPxImport(parseInt(xfrm.getAttribute("x"))),
                    y: emuToPxImport(parseInt(xfrm.getAttribute("y"))),
                    w: emuToPxImport(parseInt(ext.getAttribute("cx"))),
                    h: emuToPxImport(parseInt(ext.getAttribute("cy"))),
                    rotate: 0
                };

                if (fullText.trim().length > 0) {
                    elements.push({ ...baseEl, type: 'text', text: fullText, color: textColor, fill: fillClr === 'none' ? 'none' : fillClr, fontSize: 18, fontFace: 'Arial', align: 'center' });
                } else if (fillClr !== 'none') {
                    elements.push({ ...baseEl, type: 'shape', shapeType: 'RECTANGLE', points: 4, fill: fillClr, borderColor: '000000', borderWidth: 1 });
                }
            }
        });

        newSlides.push({ title: `Slide ${slideIdx}`, background: bgColor, elements });
        slideIdx++;
    }
    return newSlides;
};
    
const parseNativeODP = async (zip) => {
    const contentXml = await zip.file("content.xml")?.async("text");
    const stylesXml = await zip.file("styles.xml")?.async("text");
    if (!contentXml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(contentXml, "text/xml");
    const newSlides = [];

    // --- 0. Read Real Page Dimensions ---
    let actualWidthPixels = slideDim.w; // Fallback to current state
    let actualHeightPixels = slideDim.h;
    
    if (stylesXml) {
        const stylesDoc = parser.parseFromString(stylesXml, "text/xml");
        const pageLayout = stylesDoc.getElementsByTagName("style:page-layout-properties")[0];
        if (pageLayout) {
            const pw = pageLayout.getAttribute("fo:page-width");
            const ph = pageLayout.getAttribute("fo:page-height");
            
            // ODP typically saves at ~96 DPI. (1 cm = 37.79527559 pixels)
            if (pw && pw.includes('cm')) actualWidthPixels = Math.round(parseFloat(pw) * 37.795);
            if (ph && ph.includes('cm')) actualHeightPixels = Math.round(parseFloat(ph) * 37.795);
        }
    }

    // Set the dimensions in the app state!
    setSlideDim({ w: actualWidthPixels, h: actualHeightPixels });
    setTempDim({ w: actualWidthPixels, h: actualHeightPixels });

    // --- 1. Unit Conversion (cm/in to pixels mapping to the new width) ---
    const parseUnit = (val) => {
        if (!val) return 0;
        const num = parseFloat(val);
        // Map 1cm to pixels
        if (val.includes('cm')) return num * 37.795; 
        if (val.includes('in')) return num * 96;
        return num; 
    };

    // --- 2. Build Style Map ---
    const styles = xmlDoc.getElementsByTagName("style:style");
    const styleMap = {};

    Array.from(styles).forEach(s => {
        const name = s.getAttribute("style:name");
        const data = {};

        // Slide Background
        const dpProps = s.getElementsByTagName("style:drawing-page-properties")[0];
        if (dpProps) {
            data.fillColor = dpProps.getAttribute("draw:fill-color")?.replace('#', '');
        }

        // Graphic Props (Borders, Fills)
        const gProps = s.getElementsByTagName("style:graphic-properties")[0];
        if (gProps) {
            // Fill
            if (!data.fillColor) data.fillColor = gProps.getAttribute("draw:fill-color")?.replace('#', '');
            data.fillType = gProps.getAttribute("draw:fill"); 
            
            // Borders (Stroke)
            data.stroke = gProps.getAttribute("draw:stroke"); 
            data.strokeColor = gProps.getAttribute("svg:stroke-color")?.replace('#', '');
            
            const strokeW = gProps.getAttribute("svg:stroke-width");
            // Export logic was: width * 0.035 = cm. 
            // Import: cm / 0.035 = width
            if (strokeW) data.strokeWidth = Math.round(parseFloat(strokeW) / 0.035);
        }

        // Text Props
        const tProps = s.getElementsByTagName("style:text-properties")[0];
        if (tProps) {
            data.color = tProps.getAttribute("fo:color")?.replace('#', '');
            data.fontFace = tProps.getAttribute("style:font-name");
            const fSize = tProps.getAttribute("fo:font-size");
            if (fSize) data.fontSize = parseFloat(fSize);
        }
        
        // Paragraph Props
        const pProps = s.getElementsByTagName("style:paragraph-properties")[0];
        if (pProps) {
            data.align = pProps.getAttribute("fo:text-align");
        }

        styleMap[name] = data;
    });

    // --- 3. Transform Helper ---
    const parseTransform = (el, defaultX, defaultY) => {
        const transform = el.getAttribute("draw:transform");
        let x = defaultX, y = defaultY, rotate = 0;
        if (transform) {
            const rotateMatch = transform.match(/rotate\s*\(\s*([^)]+)\s*\)/);
            if (rotateMatch) rotate = -1 * (parseFloat(rotateMatch[1]) * 180 / Math.PI);
            
            const translateMatch = transform.match(/translate\s*\(\s*([^ ]+)\s+([^)]+)\s*\)/);
            if (translateMatch) {
                x = parseUnit(translateMatch[1]);
                y = parseUnit(translateMatch[2]);
            }
        }
        return { x, y, rotate };
    };

    // --- 4. Process Slides ---
    const pages = xmlDoc.getElementsByTagName("draw:page");

    for (const page of Array.from(pages)) {
        const elements = [];
        let slideTitle = "Imported Slide";
        
        const pageStyleName = page.getAttribute("draw:style-name");
        const bgColor = styleMap[pageStyleName]?.fillColor || "FFFFFF";

        const childNodes = Array.from(page.childNodes).filter(node => 
            ['draw:frame', 'draw:custom-shape', 'draw:rect', 'draw:ellipse', 'draw:line'].includes(node.nodeName)
        );

        for (const node of childNodes) {
            let x = parseUnit(node.getAttribute("svg:x"));
            let y = parseUnit(node.getAttribute("svg:y"));
            let w = parseUnit(node.getAttribute("svg:width"));
            let h = parseUnit(node.getAttribute("svg:height"));
            const styleName = node.getAttribute("draw:style-name");
            const style = styleMap[styleName] || {};
            
            const tData = parseTransform(node, x, y);
            x = tData.x; y = tData.y; const rotate = tData.rotate;

            const extractTextData = (parentNode) => {
                const p = parentNode.getElementsByTagName("text:p")[0];
                if (!p) return null;
                const span = p.getElementsByTagName("text:span")[0];
                const pStyle = styleMap[p.getAttribute("text:style-name")] || {};
                const tStyle = styleMap[span?.getAttribute("text:style-name")] || {};
                return {
                    text: parentNode.textContent || "",
                    align: pStyle.align || 'center',
                    color: tStyle.color || '000000',
                    fontSize: tStyle.fontSize || 12,
                    fontFace: tStyle.fontFace || 'Arial'
                };
            };

            // Detect Title
            const presClass = node.getAttribute("presentation:class");
            if (presClass === 'title' || presClass === 'header') {
                const txt = extractTextData(node);
                if (txt && txt.text.trim()) slideTitle = txt.text.trim();
                continue; 
            }

            // --- 4a. Lines ---
            if (node.nodeName === 'draw:line') {
                const x2 = parseUnit(node.getAttribute("svg:x2"));
                const y2 = parseUnit(node.getAttribute("svg:y2"));
                elements.push({
                    id: Date.now() + Math.random(), type: 'line',
                    x, y, w: x2 - x, h: y2 - y,
                    borderColor: style.strokeColor || '000000', borderWidth: style.strokeWidth || 1, rotate: 0
                });
                continue;
            }

            // --- 4b. Shapes ---
            if (['draw:rect', 'draw:ellipse', 'draw:custom-shape'].includes(node.nodeName)) {
                let shapeType = 'RECTANGLE';
                let points = 5;
                if (node.nodeName === 'draw:ellipse') shapeType = 'ELLIPSE';
                else if (node.nodeName === 'draw:custom-shape') {
                    const type = node.getElementsByTagName("draw:enhanced-geometry")[0]?.getAttribute("draw:type");
                    if (type?.startsWith('star')) { shapeType = 'CUSTOM_STAR'; points = parseInt(type.replace('star', '')) || 5; }
                    else if (type === 'non-primitive') shapeType = 'CUSTOM_POLY';
                }

                const txt = extractTextData(node);
                elements.push({
                    id: Date.now() + Math.random(), type: 'shape', shapeType, points,
                    x, y, w, h, rotate,
                    fill: style.fillType === 'none' ? 'none' : (style.fillColor || '0078D4'),
                    borderColor: style.strokeColor || '000000', borderWidth: style.strokeWidth || 0,
                    text: txt?.text || "", color: txt?.color || "000000",
                    fontSize: txt?.fontSize || 14, align: txt?.align || "center", fontFace: txt?.fontFace || "Arial"
                });
                continue;
            }

            // --- 4c. Frames (Tables, Images, Text) ---
            if (node.nodeName === 'draw:frame') {
                // TABLE FIX: Parse text:p content inside cells
                if (node.getElementsByTagName("table:table").length > 0) {
                    const rows = Array.from(node.getElementsByTagName("table:table-row")).map(r => 
                        Array.from(r.getElementsByTagName("table:table-cell")).map(c => {
                            // Extract text from the paragraph inside the cell
                            const p = c.getElementsByTagName("text:p")[0];
                            return p ? p.textContent : (c.textContent || "");
                        })
                    );
                    elements.push({
                        id: Date.now() + Math.random(), type: 'table', tableData: rows,
                        x, y, w, h, rotate, fontSize: 14, borderColor: '000000', borderWidth: 1
                    });
                    continue;
                }

                // IMAGE FIX: Apply borders from style
                const imgTag = node.getElementsByTagName("draw:image")[0];
                if (imgTag) {
                    const href = imgTag.getAttribute("xlink:href");
                    const imgFile = zip.file(href);
                    if (imgFile) {
                        const b64 = await imgFile.async("base64");
                        elements.push({
                            id: Date.now() + Math.random(), 
                            type: 'image', 
                            data: `data:image/png;base64,${b64}`,
                            x, y, w, h, rotate, 
                            // Correctly map stroke styles to border
                            borderColor: style.strokeColor || '000000', 
                            borderWidth: style.stroke === 'none' ? 0 : (style.strokeWidth || 0)
                        });
                    }
                    continue;
                }

                // Text Box
                const txt = extractTextData(node);
                if (txt && txt.text.trim()) {
                    elements.push({
                        id: Date.now() + Math.random(), type: 'text',
                        text: txt.text, x, y, w, h, rotate,
                        fill: style.fillType === 'none' ? 'none' : (style.fillColor || 'ffffff'),
                        color: txt.color, fontSize: txt.fontSize, fontFace: txt.fontFace, align: txt.align
                    });
                }
            }
        }
        
        newSlides.push({ title: slideTitle, background: bgColor, elements });
    }

    return newSlides;
};

const parseNativePDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const importedSlides = [];

    // 1. Extract the base presentation dimensions from the first page at scale 1
    const firstPage = await pdf.getPage(1);
    const globalViewport = firstPage.getViewport({ scale: 1 });
    const pdfDimensions = {
        w: Math.round(globalViewport.width),
        h: Math.round(globalViewport.height)
    };

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Use scale 1 for structural element layout dimensions
        const layoutViewport = page.getViewport({ scale: 1 });
        
        // Use scale 2 for high-resolution visual rendering context crispness
        const renderViewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = renderViewport.height;
        canvas.width = renderViewport.width;

        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        const base64Image = canvas.toDataURL('image/jpeg', 0.9);

        // 2. Map page elements using their own structural width/height
        importedSlides.push({
            title: `Page ${i}`,
            background: 'FFFFFF',
            elements: [
                {
                    id: `pdf-layer-${i}-${Date.now()}`,
                    type: 'image',
                    data: base64Image,
                    x: 0,
                    y: 0,
                    w: Math.round(layoutViewport.width), // Matches the PDF page width exactly
                    h: Math.round(layoutViewport.height) // Matches the PDF page height exactly
                }
            ]
        });
    }

    // Return both the compiled slides and the determined global dimensions
    return { slides: importedSlides, dimensions: pdfDimensions };
};

const parseMarkdownFile = (text) => {
    // 1. Try to recover lossless structure via native metadata context comment
    var STATE = "//"
    const stateMatch = text.match(STATE);
    text = text.replace(/&nbsp;/g, ' ');
    if (stateMatch && stateMatch[1]) {
        try {
            const parsed = JSON.parse(stateMatch[1]);
            if (parsed.slides && parsed.dimensions) {
                return parsed; // Successful perfect extraction
            }
        } catch (e) {
            console.warn("Failed parsing inline markdown state wrapper, falling back to raw text markdown rendering layout.", e);
        }
    }
    
    // 2. Fallback Rule: Parse custom external/raw markdown files into elegant canvas layouts
    const compiledSlides = [];
    const sections = text.split(/\n(?:---|===|\*\*\*|___)\n/g); // Split slide layouts at page breaks
    
    sections.forEach((section, index) => {
        const lines = section.split('\n');
        let slideTitle = `Slide ${index + 1}`;
        const elements = [];
        let activeTable = null;
        let runningY = 120; // Safe initial viewport vertical layout tracking cascading offset
        
        lines.forEach(line => {
            const lineStr = line.trim();
            if (!lineStr) return;
            
            // Build markdown tables dynamically on the fly
            if (lineStr.startsWith('|')) {
                if (lineStr.match(/\|[\s-|-]*\|/)) return; // Ignore row markdown separators
                const columns = lineStr.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                
                if (!activeTable) {
                    activeTable = {
                        id: Date.now() + Math.random(),
                        type: 'table',
                        tableData: [columns],
                        x: 100, y: runningY, w: 600, h: 140,
                        fontSize: 14, borderColor: '000000', borderWidth: 1
                    };
                    elements.push(activeTable);
                    runningY += 180;
                } else {
                    activeTable.tableData.push(columns);
                }
                return;
            } else {
                activeTable = null; // Close current open table frame context mapping
            }
            
            // Map heading structures
            if (lineStr.startsWith('#')) {
                const pureHeadingContent = lineStr.replace(/^#+\s*/, '');
                if (lineStr.startsWith('# ') || lineStr.startsWith('## ')) {
                    slideTitle = pureHeadingContent;
                } else {
                    elements.push({
                        id: Date.now() + Math.random(), type: 'text', text: pureHeadingContent,
                        x: 100, y: runningY, w: 800, h: 50,
                        fontSize: 24, fontFace: 'Arial', color: '000000', fill: 'none', align: 'left'
                    });
                    runningY += 70;
                }
            } 
            // Extract Markdown Images
            else if (lineStr.match(/^!\[.*\]\((.*)\)/)) {
                const urlMatch = lineStr.match(/^!\[.*\]\((.*)\)/);
                elements.push({
                    id: Date.now() + Math.random(), type: 'image',
                    data: urlMatch ? urlMatch[1] : 'https://via.placeholder.com/300',
                    x: 100, y: runningY, w: 400, h: 250, rotate: 0, borderColor: '000000', borderWidth: 0
                });
                runningY += 280;
            }
            // Standard lists/paragraphs
            else {
                elements.push({
                    id: Date.now() + Math.random(), type: 'text', text: lineStr,
                    x: 100, y: runningY, w: 1000, h: 60,
                    fontSize: 18, fontFace: 'Arial', color: '333333', fill: 'none', align: 'left'
                });
                runningY += 80;
            }
        });
        
        compiledSlides.push({
            title: slideTitle,
            background: 'FFFFFF',
            elements: elements
        });
    });
    
    return {
        slides: compiledSlides,
        dimensions: { w: 1200, h: 675 } // Fallback canvas sizing context
    };
};

const pxToIn = (px) => parseFloat(((px / slideDim.w) * PPT_W).toFixed(2));
    // --- Element Snap Logic (Unchanged) ---
    const getSnappedPos = (id, x, y, w, h) => {
        let snapX = x;
        let snapY = y;
        const others = slides[activeSlideIdx].elements.filter(el => el.id !== id);
        others.forEach(target => {
            const targetX = [target.x, target.x + target.w, target.x + (target.w / 2)];
            const targetY = [target.y, target.y + target.h, target.y + (target.h / 2)];
            const myX = [x, x + w, x + (w / 2)];
            const myY = [y, y + h, y + (h / 2)];
            // Check X axis
            myX.forEach((mPoint, mIdx) => {
                targetX.forEach(tPoint => {
                    if (Math.abs(mPoint - tPoint) < SNAP_THRESHOLD) {
                        if (mIdx === 0) snapX = tPoint; 
                        if (mIdx === 1) snapX = tPoint - w;
                        if (mIdx === 2) snapX = tPoint - (w / 2);
                    }
                });
            });
            // Check Y axis
            myY.forEach((mPoint, mIdx) => {
                targetY.forEach(tPoint => {
                    if (Math.abs(mPoint - tPoint) < SNAP_THRESHOLD) {
                        if (mIdx === 0) snapY = tPoint; 
                        if (mIdx === 1) snapY = tPoint - h; 
                        if (mIdx === 2) snapY = tPoint - (h / 2); 
                    }
                });
            });
        });
        return { x: snapX, y: snapY };
    };

const addElement = (type, shapeType = 'RECTANGLE') => {
    const newId = Date.now();
    let tableData = null;
    let points = 5;

    if (type === 'table') {
        const rows = parseInt(prompt("Rows:", "3")) || 3;
        const cols = parseInt(prompt("Cols:", "3")) || 3;
        tableData = Array(rows).fill(null).map(() => Array(cols).fill("Cell"));
    }
    
    if (shapeType === 'CUSTOM_POLY' || shapeType === 'CUSTOM_STAR') {
        points = parseInt(prompt(shapeType === 'CUSTOM_POLY' ? "Enter number of vertices (3-8):" : "Enter star points (4-10):", "5")) || 5;
    }

    const newElem = {
        id: newId, type, shapeType, points,
        text: type === 'text' ? 'New Text' : (type === 'richtext' ? '<div>Rich Text</div>' : ''),
        x: 100, 
        y: 100, 
        w: type === 'line' ? 200 : (type === 'connector' ? 100 : (shapeType === 'RECTANGLE'?250 : 150)), 
        h: type === 'line' ? 5 : (type === 'connector' ? 100 : 150),
        fill: (type === 'text' || type === 'richtext') ? 'none' : '0078D4',
        color: '333333', 
        borderColor: '000000', 
        borderWidth: (type === 'line' || type === 'connector') ? 2 : 1,
        fontSize: 18, fontFace: 'Arial', align: 'center', rotate: 0,
        data: null, tableData: tableData,

        opacity: 1,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, marginUnit: 'px',
        paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0, paddingUnit: 'px',
        animationEffect: 'none', animationDuration: 1
    };
    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements.push(newElem);
    setSlides(newSlides);
    setSelectedIds([newId]);
};

const modifyTable = (elementId, action, direction = 1) => {
    const currentSlide = slides[activeSlideIdx];
    const targetElement = currentSlide.elements.find(el => el.id === elementId);
    
    if (!targetElement || targetElement.type !== 'table') return;

    // Deep clone the array matrix to safely trigger React re-renders
    const newTableData = JSON.parse(JSON.stringify(targetElement.tableData));
    const numRows = newTableData.length;
    const numCols = newTableData[0].length;

    if (action === 'addRow') {
        const newRow = Array(numCols).fill("");
        // Insert at end (1) or beginning (-1)
        if (direction === 1) newTableData.push(newRow);
        else newTableData.unshift(newRow);
    } 
    else if (action === 'addCol') {
        newTableData.forEach(row => {
            // Insert at end (1) or beginning (-1)
            if (direction === 1) row.push("");
            else row.unshift("");
        });
    } 
    else if (action === 'delRow' && numRows > 1) {
        newTableData.pop(); // Remove bottom row
    } 
    else if (action === 'delCol' && numCols > 1) {
        newTableData.forEach(row => row.pop()); // Remove rightmost column
    }

    // Apply the matrix update to the element
    updateElement(elementId, { tableData: newTableData });
};

const copyElement = () => {
    const elements = slides[activeSlideIdx].elements.filter(el => selectedIds.includes(el.id));
    if (elements.length > 0) setClipboard(JSON.parse(JSON.stringify(elements)));
};

const cutElement = () => {
    const elements = slides[activeSlideIdx].elements.filter(el => selectedIds.includes(el.id));
    if (elements.length > 0) {
        setClipboard(JSON.parse(JSON.stringify(elements)));
        const updatedSlides = [...slides];
        updatedSlides[activeSlideIdx].elements = updatedSlides[activeSlideIdx].elements.filter(el => !selectedIds.includes(el.id));
        setSlides(updatedSlides);
        saveToHistory(updatedSlides);
        setSelectedIds([]);
    }
};

const pasteElement = () => {
    if (!clipboard || clipboard.length === 0) return;
    const newIds = [];
    const newElements = clipboard.map(el => {
        const newEl = JSON.parse(JSON.stringify(el));
        newEl.id = Date.now() + Math.random(); // Unique IDs for duplicates
        newEl.x += 20; 
        newEl.y += 20;
        newIds.push(newEl.id);
        return newEl;
    });
    const updatedSlides = [...slides];
    updatedSlides[activeSlideIdx].elements.push(...newElements);
    setSlides(updatedSlides);
    saveToHistory(updatedSlides);
    setSelectedIds(newIds); // Focus all pasted items
};

const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const newId = Date.now();
        const newSlides = [...slides];
        newSlides[activeSlideIdx].elements.push({
            id: newId, type: 'image', data: event.target.result,
            x: 100, y: 100, w: 300, h: 200, rotate: 0,
            borderColor: '000000', borderWidth: 0
        });
        setSlides(newSlides);
        setSelectedIds([newId])
    };
    reader.readAsDataURL(file);
};

const handleMediaUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const newId = Date.now();
        const newSlides = [...slides];
        
        const newMediaElement = {
            id: newId,
            type: type, // 'video' or 'audio'
            data: event.target.result,
            x: 100,
            y: 100,
            w: type === 'video' ? 480 : 320,
            h: type === 'video' ? 270 : 54, // Native audio track sizing footprint
            rotate: 0,
            borderColor: '000000',
            borderWidth: 0,
            // Custom play options required
            play: {
                delay: 0, // value in seconds
                mode: 'once' // 'once' or 'loop'
            }
        };

        newSlides[activeSlideIdx].elements.push(newMediaElement);
        setSlides(newSlides);
        setSelectedIds([newId]);
        saveToHistory(newSlides);
    };
    reader.readAsDataURL(file);
};

const updateElement = (id, changes, skipHistory = false) => {
    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(el => 
        el.id === id ? { ...el, ...changes } : el
    );
    // Save to history automatically unless told otherwise
    if (!skipHistory) saveToHistory(newSlides);
    setSlides(newSlides);
};

    // Save Logic
    const generatePPTXBlob = async () => {
    setIsLoading(true);
    try {
        const pres = new pptxgen();
        
        // PptxGenJS uses inches. Standard web DPI is 96.
        const widthInches = slideDim.w / 96;
        const heightInches = slideDim.h / 96;
        
        pres.defineLayout({ name: 'CUSTOM', width: widthInches, height: heightInches });
        pres.layout = 'CUSTOM';

        // Local helper for coordinate conversion (96 DPI standard)
        const pxToIn = (px) => px / 96;

        // Helper to strip HTML from richtext for PPTX compatibility
        const stripHtmlToText = (html) => {
            if (!html) return "";
            return html
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>|<\/div>/gi, '\n')
                .replace(/<[^>]+>/g, '') // Strip remaining tags
                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                .trim();
        };

        slides.forEach(slideData => {
            let slide = pres.addSlide();
            
            // Background
            if (slideData.background) {
                slide.background = { fill: slideData.background.replace('#', '') };
            }

            // Title
            if (slideData.title) {
                slide.addText(slideData.title, { 
                    x: 0, y: 0.2, w: widthInches, 
                    fontSize: 24, color: '363636', bold: true, align: 'center' 
                });
            }

            slideData.elements.forEach(el => {
                const common = { 
                    x: pxToIn(el.x), 
                    y: pxToIn(el.y), 
                    w: pxToIn(el.w) || 0.1, // Prevent 0-width crashes
                    h: pxToIn(el.h) || 0.1, 
                    rotate: el.rotate || 0
                };
                
                const lineOpt = el.borderWidth > 0 
                    ? { color: (el.borderColor || '000000').replace('#', ''), width: el.borderWidth } 
                    : undefined;
                
                const fillColor = el.fill && el.fill !== 'none' 
                    ? { color: el.fill.replace('#', '') } 
                    : undefined;

                if (el.type === 'shape') {
                    let sType = 'rect';
                    if (el.shapeType === 'ELLIPSE') sType = 'ellipse';
                    if (el.shapeType === 'TRIANGLE' || (el.shapeType === 'CUSTOM_POLY' && el.points === 3)) sType = 'triangle';
                    if (el.shapeType === 'CUSTOM_POLY' && el.points === 5) sType = 'pentagon';
                    if (el.shapeType === 'CUSTOM_POLY' && el.points === 6) sType = 'hexagon';
                    if (el.shapeType === 'CUSTOM_STAR') sType = `star${el.points > 4 && el.points < 7 ? el.points : 5}`;
                    
                    slide.addShape(sType, { ...common, fill: fillColor, line: lineOpt });
                } 
                else if (el.type === 'image') {
                    slide.addImage({ data: el.data, ...common, line: lineOpt });
                } 
                else if (el.type === 'line') {
                    slide.addShape('line', { ...common, line: lineOpt });
                } 
                else if (el.type === 'connector') {
                    // Connectors render as lines with an ending arrowhead
                    slide.addShape('line', { 
                        ...common, 
                        line: { 
                            color: (el.borderColor || '000000').replace('#', ''), 
                            pt: el.borderWidth || 2,
                            endArrowType: 'triangle' 
                        } 
                    });
                }
                else if (el.type === 'text') {
                    slide.addText(el.text, { 
                        ...common, 
                        fontSize: el.fontSize || 14, 
                        color: (el.color || '000000').replace('#', ''), 
                        fontFace: el.fontFace || 'Arial', 
                        align: el.align || 'center', 
                        fill: fillColor, 
                        line: lineOpt 
                    });
                }
                else if (el.type === 'richtext') {
                    slide.addText(stripHtmlToText(el.text), { 
                        ...common, 
                        fontSize: el.fontSize || 14, 
                        color: (el.color || '000000').replace('#', ''), 
                        align: el.align || 'left', 
                        fill: fillColor, 
                        line: lineOpt 
                    });
                }
                else if (el.type === 'table') {
                    slide.addTable(el.tableData, { 
                        ...common, 
                        border: { pt: el.borderWidth || 1, color: (el.borderColor || '000000').replace('#', '') }, 
                        fontSize: el.fontSize || 12 
                    });
                }
            });
        });

        return await pres.write({ outputType: 'blob' });
    } catch (e) {
        console.error("PPTX Error:", e);
        alert("Error saving PPTX file: " + e.message);
    } finally {
        setIsLoading(false);
    }
};
    
const generateODPBlob = async () => {
    //if (!activeFolder) return;
    setIsLoading(true);

    try {
        const zip = new JSZip();

        // 1. Mimetype - MUST be first, uncompressed
        zip.file("mimetype", "application/vnd.oasis.opendocument.presentation", { compression: "STORE" });

        // 2. Generate XMLs
        const contentXml = generateContentXml(slides, slideDim);
        const stylesXml = generateStylesXml(slideDim);
        
        // 3. Manifest
        const manifestEntries = [
            '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>',
            '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
            '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
        ];

        // 4. Image Handling
        slides.forEach(slide => slide.elements.forEach(el => {
            if (el.type === 'image' && el.data?.includes('base64,')) {
                const imgPath = `Pictures/${el.id}.png`;
                zip.file(imgPath, el.data.split('base64,')[1], { base64: true });
                manifestEntries.push(`<manifest:file-entry manifest:full-path="${imgPath}" manifest:media-type="image/png"/>`);
            }
        }));

        const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
    ${manifestEntries.join('\n    ')}
</manifest:manifest>`;

        // 5. Build ZIP
        zip.folder("META-INF").file("manifest.xml", manifestXml);
        zip.file("content.xml", contentXml);
        zip.file("styles.xml", stylesXml);

        // 6. Save
        return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.oasis.opendocument.presentation" });
    } catch (e) {
        console.error("ODP Error:", e);
        alert("Save failed: " + e.message);
    } finally {
        setIsLoading(false);
    }
};

// Helper: Rotation Logic
// Direction negated and transform order corrected to prevent "drift"
const getTransform = (el, x, y, w, h) => {
    if (el.rotation || el.rotate) {
        // 1. Negate the angle to fix the direction (e.g., -30 becomes 30)
        const angleDegrees = (el.rotation || el.rotate);
        const rad = (-angleDegrees * Math.PI) / 180; 

        // 2. To rotate around the center and keep position stable:
        // We calculate the center point in CM
        const centerX = parseFloat(x) + parseFloat(w) / 2;
        const centerY = parseFloat(y) + parseFloat(h) / 2;

        return `draw:transform="rotate (${rad}) translate (${x} ${y})"`;
    }
    return `svg:x="${x}" svg:y="${y}"`;
};

// Helper: Polygon Logic
const getPolygonPath = (points) => {
    const radius = 10800;
    const center = 10800;
    let path = "";
    for (let i = 0; i < points; i++) {
        const angle = (i * 2 * Math.PI) / points - Math.PI / 2;
        const x = Math.round(center + radius * Math.cos(angle));
        const y = Math.round(center + radius * Math.sin(angle));
        path += (i === 0 ? "M " : " L ") + x + " " + y;
    }
    return path + " Z";
};

const generateContentXml = (slides, currentDim) => {
    // Convert exact pixels to ODP centimeters at 96 DPI
    const toCm = (val) => (val / 37.795).toFixed(3) + "cm";
    const fullWidthCm = toCm(currentDim.w);
    
    // Global arrowhead definition for connectors
    let autoStyles = `
        <draw:marker draw:name="Arrow" svg:viewBox="0 0 20 20" svg:d="M0 0l10 10-10 10z"/>
    `;
    let slidesXml = "";

    // Helper to extract text from HTML (for richtext)
    const extractText = (htmlText) => {
        if (!htmlText) return "";
        return htmlText
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>|<\/div>/gi, '\n')
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/</g, '&lt;')
            .trim();
    };

    slides.forEach((slide, sIdx) => {
        const bgStyle = `bg${sIdx}`;
        autoStyles += `<style:style style:name="${bgStyle}" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#${(slide.background || 'FFFFFF').replace('#', '')}"/></style:style>`;
        
        slidesXml += `<draw:page draw:name="page${sIdx + 1}" draw:style-name="${bgStyle}" draw:master-page-name="Default">`;

        // FIXED TITLE INTEGRATION: Dynamically fills document width instead of hardcoded 20cm
        if (slide.title || slide.name) {
            const titleText = slide.title || slide.name;
            slidesXml += `
            <draw:frame presentation:class="title" draw:layer="layout" svg:width="${fullWidthCm}" svg:height="3cm" svg:x="0cm" svg:y="0.5cm">
                <draw:text-box>
                    <text:p text:style-name="P_Title">${titleText.replace(/&/g, '&amp;')}</text:p>
                </draw:text-box>
            </draw:frame>`;
            
            if (!autoStyles.includes('style:name="P_Title"')) {
                autoStyles += `
                <style:style style:name="P_Title" style:family="paragraph">
                    <style:paragraph-properties fo:text-align="center"/>
                    <style:text-properties fo:font-size="32pt" fo:font-weight="bold"/>
                </style:style>`;
            }
        }

        slide.elements.forEach((el, eIdx) => {
            const gName = `gr_${sIdx}_${eIdx}`;
            const pName = `pr_${sIdx}_${eIdx}`;
            const tName = `tx_${sIdx}_${eIdx}`;
            
            const wVal = el.w || 10; 
            const hVal = el.h || 10;
            const [x, y, w, h] = [toCm(el.x), toCm(el.y), toCm(wVal), toCm(hVal)];
            
            // Assume getTransform exists in your scope (handles rotation)
            const posAttr = typeof getTransform === 'function' ? getTransform(el, x, y) : `svg:x="${x}" svg:y="${y}"`;
            
            const isConnector = el.type === 'connector';
            const markerProp = isConnector ? `draw:marker-end="Arrow" draw:marker-end-width="0.3cm"` : "";

            autoStyles += `
            <style:style style:name="${gName}" style:family="graphic" style:parent-style-name="Standard">
                <style:graphic-properties 
                    draw:fill="${(el.fill === 'none' || !el.fill) ? 'none' : 'solid'}" 
                    draw:fill-color="#${(el.fill || 'ffffff').replace('#', '')}" 
                    draw:stroke="${(el.borderWidth > 0 || isConnector || el.type === 'line') ? 'solid' : 'none'}" 
                    svg:stroke-width="${(el.borderWidth || 2) * 0.035}cm" 
                    svg:stroke-color="#${(el.borderColor || '000000').replace('#', '')}" 
                    draw:textarea-vertical-align="top" 
                    draw:auto-grow-height="false"
                    fo:padding="0.1cm" 
                    fo:margin="0cm"
                    ${markerProp}/>
            </style:style>
            <style:style style:name="${pName}" style:family="paragraph">
                <style:paragraph-properties fo:text-align="${el.align || (el.type === 'richtext' ? 'left' : 'center')}"/>
            </style:style>
            <style:style style:name="${tName}" style:family="text">
                <style:text-properties 
                    fo:color="#${(el.color || '000000').replace('#', '')}" 
                    fo:font-size="${el.fontSize || 12}pt" 
                    style:font-name="${el.fontFace || 'Arial'}"
                />
            </style:style>`;

            // Format text or richtext with proper XML line breaks
            const rawString = el.type === 'richtext' ? extractText(el.text) : (el.text || "");
            const textMarkup = rawString
                ? `<draw:text-box><text:p text:style-name="${pName}">` + 
                  rawString.split('\n').map(line => `<text:span text:style-name="${tName}">${line.replace(/</g, '&lt;')}</text:span>`).join('</text:p><text:p text:style-name="${pName}">') +
                  `</text:p></draw:text-box>`
                : "";

            // --- ELEMENT SWITCH ---
            if (el.type === 'line' || el.type === 'connector') {
                const x2 = toCm(el.x + wVal);
                const y2 = toCm(el.y + hVal);
                slidesXml += `<draw:line draw:style-name="${gName}" draw:layer="layout" svg:x1="${x}" svg:y1="${y}" svg:x2="${x2}" svg:y2="${y2}"/>`;
            } 
            else if (el.shapeType === 'CUSTOM_STAR' || el.shapeType === 'CUSTOM_POLY') {
                const geom = el.shapeType === 'CUSTOM_STAR' 
                    ? `draw:type="star${el.points}"` 
                    : `draw:type="non-primitive" draw:enhanced-path="${getPolygonPath(el.points)}"`; // Assuming getPolygonPath exists
                
                slidesXml += `
                <draw:custom-shape draw:style-name="${gName}" draw:layer="layout" svg:width="${w}" svg:height="${h}" ${posAttr}>
                    <draw:enhanced-geometry draw:viewBox="0 0 21600 21600" ${geom}>
                         <draw:text-areas draw:text-areas="0 0 21600 21600"/>
                    </draw:enhanced-geometry>
                    ${textMarkup}
                </draw:custom-shape>`;
            } 
            else if (el.type === 'text' || el.type === 'richtext') {
                slidesXml += `<draw:frame draw:style-name="${gName}" draw:layer="layout" svg:width="${w}" svg:height="${h}" ${posAttr}>${textMarkup}</draw:frame>`;
            } 
            else if (el.type === 'shape') {
                const tag = el.shapeType === 'ELLIPSE' ? 'draw:ellipse' : 'draw:rect';
                slidesXml += `<${tag} draw:style-name="${gName}" draw:layer="layout" svg:width="${w}" svg:height="${h}" ${posAttr}>${textMarkup}</${tag}>`;
            } 
            else if (el.type === 'image') {
                slidesXml += `<draw:frame draw:style-name="${gName}" draw:layer="layout" svg:width="${w}" svg:height="${h}" ${posAttr}><draw:image xlink:href="Pictures/${el.id}.png"/></draw:frame>`;
            } 
            else if (el.type === 'table') {
                slidesXml += `
                <draw:frame draw:style-name="${gName}" draw:layer="layout" svg:width="${w}" svg:height="${h}" ${posAttr}>
                    <table:table>
                        ${Array(el.tableData[0].length).fill(`<table:table-column/>`).join('')}
                        ${el.tableData.map(row => `
                            <table:table-row>
                                ${row.map(cell => `
                                    <table:table-cell office:value-type="string">
                                        <text:p text:style-name="${pName}">
                                            <text:span text:style-name="${tName}">${cell.replace(/</g, '&lt;').replace(/&/g, '&amp;')}</text:span>
                                        </text:p>
                                    </table:table-cell>
                                `).join('')}
                            </table:table-row>
                        `).join('')}
                    </table:table>
                </draw:frame>`;
            }
        });
        slidesXml += `</draw:page>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content 
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" 
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" 
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" 
    xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" 
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" 
    xmlns:xlink="http://www.w3.org/1999/xlink" 
    xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" 
    office:version="1.2">
    <office:automatic-styles>${autoStyles}</office:automatic-styles>
    <office:body><office:presentation>${slidesXml}</office:presentation></office:body>
</office:document-content>`;
};

const generateStylesXml = (currentDim) => {
    // Define the master page dimensions based on user's pixel choice
    const pwCm = (currentDim.w / 37.795).toFixed(3) + "cm";
    const phCm = (currentDim.h / 37.795).toFixed(3) + "cm";

    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles 
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" 
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" 
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" 
    office:version="1.2">
    <office:styles>
        <style:style style:name="Standard" style:family="graphic">
            <style:graphic-properties draw:stroke="none" draw:fill="none"/>
        </style:style>
    </office:styles>
    <office:master-styles>
        <style:page-layout style:name="PM1">
            <style:page-layout-properties fo:page-width="${pwCm}" fo:page-height="${phCm}" fo:margin="0cm"/>
        </style:page-layout>
        <draw:master-page draw:name="Default" style:page-layout-name="PM1"/>
    </office:master-styles>
</office:document-styles>`;
};

const renderShape = (el) => {
        const stroke = `#${el.borderColor}`;
        const fill = `#${el.fill}`;
        const sw = el.borderWidth;
        if (el.shapeType === 'ELLIPSE') return <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: `${sw}px solid ${stroke}`, backgroundColor: fill }} />;
        if (el.shapeType === 'RECTANGLE') return <div style={{ width: '100%', height: '100%', border: `${sw}px solid ${stroke}`, backgroundColor: fill }} />;
        return (
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={getSvgPath(el)} fill={fill} stroke={stroke} strokeWidth={sw * 2} vectorEffect="non-scaling-stroke" />
            </svg>
        );
    };

const getSvgPath = (el) => {
    if (el.shapeType === 'TRIANGLE' || el.shapeType === 'CUSTOM_POLY') {
        const sides = el.shapeType === 'TRIANGLE' ? 3 : el.points;
        let pts = [];
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
            pts.push(`${50 + 50 * Math.cos(angle)},${50 + 50 * Math.sin(angle)}`);
        }
        return `M ${pts.join(' L ')} Z`;
    }
    if (el.shapeType === 'CUSTOM_STAR') {
        let pts = [];
        const spikes = el.points;
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? 50 : 20;
            const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
            pts.push(`${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`);
        }
        return `M ${pts.join(' L ')} Z`;
    }
    return "";
};

const activeSlide = slides[activeSlideIdx];
// Uses the first selected element as the "lead" for toolbar states
const selectedElement = selectedIds.length > 0 ? activeSlide?.elements.find(el => el.id === selectedIds[0]) : null;    
const generateQSlideBlob = async () => {
  setIsLoading(true);
  try {
    const zip = new JSZip();
    const assetsFolder = zip.folder("assets");
    
    // 1. Prepare JSON (deep clone to avoid mutating live state)
    const exportedSlides = JSON.parse(JSON.stringify(slides));

    for (const slide of exportedSlides) {
      for (const el of slide.elements) {
        // Extract base64 images to the assets folder
        if (el.type === 'image' && el.data?.startsWith('data:')) {
          const mimeParts = el.data.split(';')[0].split('/');
          const extension = mimeParts[1] || 'png';
          const assetName = `${el.id}.${extension}`;
          const base64Data = el.data.split('base64,')[1];
          
          assetsFolder.file(assetName, base64Data, { base64: true });
          
          // Rewrite the data property to a relative path for the JSON
          el.data = `assets/${assetName}`;
        }
      }
    }

    // 2. Add the manifest
    zip.file("presentation.json", JSON.stringify({
      version: "1.0",
      timestamp: new Date().toISOString(),
      dimensions: slideDim,
      slides: exportedSlides
    }, null, 2));

    // 3. Generate the ZIP as a blob
    return await zip.generateAsync({ type: "blob" });
  } catch (e) {
    console.error("Deep Export Error:", e);
    setErrorMsg("Deep Export failed: " + e.message);
  } finally {
    setIsLoading(false);
  }
};

const generateHTMLBlob = async (mode = 'export') => {
    setIsLoading(true);
    try {
        // Stringify your state and escape HTML characters to prevent script injection breaks
        const rawState = JSON.stringify({ dimensions: slideDim, slides: slides }).replace(/</g, '\\u003c');
        
        // Adjust styling based on whether we are exporting to file or sending to printer
        const bodyBg = mode === 'print' ? '#ffffff' : '#2b2b2b';
        const slideShadow = mode === 'print' ? 'none' : '0 10px 30px rgba(0,0,0,0.5)';
        const margins = mode === 'print' ? '0' : '40px 20px';

        let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName || "Presentation"}</title>
    <script type="application/json" id="qslide-state">${rawState}</script>
    <style>
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-up { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slide-left { from { transform: translateX(50px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes zoom-in { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes bounce { 
    0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 
    40% { transform: translateY(-30px); } 
    60% { transform: translateY(-15px); } 
}
        body { 
            background: ${bodyBg}; margin: 0; padding: ${margins}; 
            display: flex; flex-direction: column; align-items: center; gap: 40px; 
            font-family: Arial, sans-serif; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
        }
        .slide { 
            width: ${slideDim.w}px; 
            height: ${slideDim.h}px; 
            position: relative; 
            overflow: hidden; 
            box-shadow: ${slideShadow}; 
            flex-shrink: 0;
            background-size: cover;
            background-position: center;
            page-break-after: always; 
        }
        .element { position: absolute; box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; height: 100%; }
        td { border: 1px solid #000; text-align: center; }
        
        @media print {
            @page { size: ${slideDim.w}px ${slideDim.h}px; margin: 0; }
            body { 
                padding: 0; 
                gap: 0; 
                display: block; /* CRITICAL: Disables flexbox during print to prevent freezing */
                background: #ffffff; 
            }
            .slide { 
                box-shadow: none; 
                margin: 0; 
                page-break-after: always; 
                page-break-inside: avoid; /* Prevents elements from splitting across pages */
            }
        }
        
        @media (max-width: ${slideDim.w + 40}px) {
            .slide { transform: scale(calc(100vw / ${slideDim.w + 40})); transform-origin: top center; }
            body { gap: calc(${slideDim.h}px * (100vw / ${slideDim.w + 40}) - ${slideDim.h - 40}px); }
        }
    </style>
</head>
<body>`;

        for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            htmlContent += `<div class="slide" style="background-color: #${slide.background || 'FFFFFF'};">`;

            // 1. Render Vector Layer (Connectors & Drawings)
            const connectors = slide.elements.filter(e => e.type === 'connector');
            const drawings = slide.elements.filter(e => e.type === 'drawing');
            
            if (connectors.length > 0 || drawings.length > 0) {
                htmlContent += `<svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;">
                    <defs>
                        <marker id="arrowhead-html-${i}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#000000" />
                        </marker>
                    </defs>`;
                    
                connectors.forEach(conn => {
                    // Pass the current slide's elements so it maps coordinates correctly
                    const pts = getDynamicConnection(conn, slide.elements); 
                    if (pts) {
                        const pathData = getMindMapPath(pts, conn.shapeType);
                        htmlContent += `<path d="${pathData}" fill="none" stroke="#${conn.borderColor || '000000'}" stroke-width="${conn.borderWidth || 2}" marker-end="url(#arrowhead-html-${i})" />`;
                    }
                });

                drawings.forEach(draw => {
                    htmlContent += `<path d="${draw.pathData}" fill="none" stroke="#${draw.borderColor || 'FF0000'}" stroke-width="${draw.borderWidth || 4}" stroke-linecap="round" stroke-linejoin="round" />`;
                });
                htmlContent += `</svg>`;
            }

            // 2. Render Standard Elements
            slide.elements.forEach(el => {
                if (el.type === 'connector' || el.type === 'drawing') return;

                // Apply Opacity, Margin, Padding, and Animation to the OUTER absolute wrapper
                const baseStyle = `left: ${el.x}px; top: ${el.y}px; width: ${el.w}px; height: ${el.h}px; z-index: 2;
                    opacity: ${el.opacity !== undefined ? el.opacity : 1};
                    margin: ${el.marginTop||0}${el.marginUnit||'px'} ${el.marginRight||0}${el.marginUnit||'px'} ${el.marginBottom||0}${el.marginUnit||'px'} ${el.marginLeft||0}${el.marginUnit||'px'};
                    padding: ${el.paddingTop||0}${el.paddingUnit||'px'} ${el.paddingRight||0}${el.paddingUnit||'px'} ${el.paddingBottom||0}${el.paddingUnit||'px'} ${el.paddingLeft||0}${el.paddingUnit||'px'};
                    animation: ${el.animationEffect && el.animationEffect !== 'none' ? `${el.animationEffect} ${el.animationDuration || 1}s ease-in-out both` : 'none'};`;

                htmlContent += `<div class="element" style="${baseStyle}">`;
                
                // Apply Rotation to the INNER wrapper
                htmlContent += `<div style="width: 100%; height: 100%; transform: rotate(${el.rotate || 0}deg);">`;

                if (el.type === 'text') {
                    htmlContent += `<div style="width: 100%; height: 100%; color: #${el.color}; font-size: ${el.fontSize}px; font-family: ${el.fontFace}; text-align: ${el.align}; border: ${el.borderWidth}px solid #${el.borderColor}; background-color: ${el.fill === 'none' ? 'transparent' : '#' + el.fill}; padding: 4px; box-sizing: border-box; white-space: pre-wrap; overflow: hidden;">${el.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
                } 
                else if (el.type === 'richtext') {
                    htmlContent += `<div style="width: 100%; height: 100%; border: ${el.borderWidth || 0}px solid #${el.borderColor || '000'}; background-color: ${el.fill === 'none' ? 'transparent' : '#' + el.fill}; text-align: ${el.align || 'left'}; padding: 8px; box-sizing: border-box; overflow: ${el.overflowType || 'auto'};">${el.text}</div>`;                }
                else if (el.type === 'image') {
                    htmlContent += `<img src="${el.data}" style="width: 100%; height: 100%; object-fit: fill; border: ${el.borderWidth}px solid #${el.borderColor};" />`;
                }
                else if (el.type === 'line') {
                    htmlContent += `<div style="width: 100%; height: ${el.borderWidth}px; background-color: #${el.borderColor}; margin-top: 50%;"></div>`;
                }
                else if (el.type === 'table') {
                    htmlContent += `<table style="border: ${el.borderWidth}px solid #${el.borderColor}; font-size: 10px;"><tbody>`;
                    el.tableData.forEach(row => {
                        htmlContent += `<tr>`;
                        row.forEach(cell => { htmlContent += `<td style="border: ${el.borderWidth}px solid #${el.borderColor};">${cell}</td>`; });
                        htmlContent += `</tr>`;
                    });
                    htmlContent += `</tbody></table>`;
                }
                else if (el.type === 'shape') {
                    const sw = el.borderWidth;
                    const stroke = `#${el.borderColor}`;
                    const fill = `#${el.fill}`;
                    if (el.shapeType === 'ELLIPSE') {
                        htmlContent += `<div style="width: 100%; height: 100%; border-radius: 50%; border: ${sw}px solid ${stroke}; background-color: ${fill};"></div>`;
                    } else if (el.shapeType === 'RECTANGLE') {
                        htmlContent += `<div style="width: 100%; height: 100%; border: ${sw}px solid ${stroke}; background-color: ${fill};"></div>`;
                    } else {
                        const path = getSvgPath(el); 
                        htmlContent += `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 2}" vector-effect="non-scaling-stroke" />
                        </svg>`;
                    }
                }
                else if (el.type === 'chart') {
                    // Charts require complex JS rendering engines. A static placeholder is injected for HTML.
                    htmlContent += `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border: 1px dashed #999; background: #fafafa; color: #666; font-size: 14px; font-weight: bold; text-align: center;">📊 Interactive Chart:<br/>${el.chartConfig?.title}</div>`;
                }
                else if (el.type === 'video') {
                    const isLooping = el.play?.mode === 'loop' ? 'loop' : '';
                    htmlContent += `
                        <video id="media-${el.id}" src="${el.data}" controls ${isLooping} style="width: 100%; height: 100%; object-fit: contain; background: #000; border: ${el.borderWidth}px solid #${el.borderColor};"></video>
                        <script>
                            window.addEventListener('load', () => {
                                setTimeout(() => {
                                    const vid = document.getElementById('media-${el.id}');
                                    if(vid) vid.play().catch(err => console.log('Autoplay deferred for user interaction context activation setup.'));
                                }, ${(el.play?.delay || 0) * 1000});
                            });
                        </script>
                    `;
                }
                else if (el.type === 'audio') {
                    const isLooping = el.play?.mode === 'loop' ? 'loop' : '';
                    htmlContent += `
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; background: #f1f3f4; padding: 4px; border-radius: 4px; border: ${el.borderWidth}px solid #${el.borderColor};">
                            <audio id="media-${el.id}" src="${el.data}" controls ${isLooping} style="width: 100%;"></audio>
                        </div>
                        <script>
                            window.addEventListener('load', () => {
                                setTimeout(() => {
                                    const aud = document.getElementById('media-${el.id}');
                                    if(aud) aud.play().catch(err => console.log('Autoplay deferred.'));
                                }, ${(el.play?.delay || 0) * 1000});
                            });
                        </script>
                    `;
                }

                htmlContent += `</div> </div>`;
            })
            htmlContent += `</div>`; 
        }

        htmlContent += `</body></html>`;
        return new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    } catch (e) {
        console.error("HTML Export Error:", e);
        alert("HTML Generation failed: " + e.message);
    } finally {
        setIsLoading(false);
    }
};

const generateMDBlob = async () => {
    setIsLoading(true);
    try {
        let mdContent = `# ${fileName || "Presentation"}\n\n`;
        
        slides.forEach((slide, sIdx) => {
            if (sIdx > 0) {
                mdContent += `\n---\n\n`; // Markdown horizontal rule acts as slide break
            }
            mdContent += `## ${slide.title || `Slide ${sIdx + 1}`}\n\n`;
            
            // Sort elements vertically then horizontally so the document reads sequentially and cleanly
            const sortedElements = [...slide.elements].sort((a, b) => (a.y - b.y) || (a.x - b.x));
            
            sortedElements.forEach(el => {
                if (el.type === 'text' || el.type === 'richtext') {
                    // Remove internal HTML tags if any to provide clean markdown content
                    const cleanText = el.text.replace(/<[^>]*>/g, '').trim();
                    if (cleanText) {
                        mdContent += `${cleanText}\n\n`;
                    }
                } else if (el.type === 'image') {
                    // Save standard image token link (skip long raw base64 data for readability)
                    const imageSource = el.data.startsWith('data:') ? '[Embedded Image Asset]' : el.data;
                    mdContent += `![Image Link](${imageSource})\n\n`;
                } else if (el.type === 'table') {
                    if (el.tableData && el.tableData.length > 0) {
                        el.tableData.forEach((row, rIdx) => {
                            mdContent += `| ${row.join(' | ')} |\n`;
                            if (rIdx === 0) {
                                mdContent += `| ${row.map(() => '---').join(' | ')} |\n`; // Table header line divider
                            }
                        });
                        mdContent += `\n`;
                    }
                } else if (el.type === 'chart') {
                    mdContent += `📊 **Chart: ${el.chartConfig?.title || 'Interactive Chart'}** (${el.chartConfig?.type || 'Pie'})\n\n`;
                }
            });
        });
        
        // Append raw presentation context state cleanly inside hidden metadata comment block for round-trips
        const rawState = JSON.stringify({ dimensions: slideDim, slides: slides });
        mdContent += `\n\n`;
        
        return new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    } catch (e) {
        console.error("Markdown Export Error:", e);
        alert("Markdown generation failed: " + e.message);
    } finally {
        setIsLoading(false);
    }
};

const generateSVGBlob = async () => {
    setIsLoading(true);
    try {
        const slide = slides[activeSlideIdx];
        
        // Wrap state in CDATA so special characters don't break the XML parser
        const rawState = JSON.stringify({ dimensions: slideDim, slides: slides });

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${slideDim.w} ${slideDim.h}" width="${slideDim.w}" height="${slideDim.h}">
            <metadata id="qslide-state"><![CDATA[${rawState}]]></metadata>
            <rect width="100%" height="100%" fill="#${slide.background || 'FFFFFF'}" />`;

        // 1. Vector Layers (Connectors & Drawings)
        const connectors = slide.elements.filter(e => e.type === 'connector');
        const drawings = slide.elements.filter(e => e.type === 'drawing');

        if (connectors.length > 0 || drawings.length > 0) {
            svgContent += `<defs>
                <marker id="arrowhead-svg" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#000000" />
                </marker>
            </defs>`;

            connectors.forEach(conn => {
                const pts = getDynamicConnection(conn, slide.elements);
                if (pts) {
                    const pathData = getMindMapPath(pts, conn.shapeType);
                    svgContent += `<path d="${pathData}" fill="none" stroke="#${conn.borderColor || '000000'}" stroke-width="${conn.borderWidth || 2}" marker-end="url(#arrowhead-svg)" />`;
                }
            });

            drawings.forEach(draw => {
                svgContent += `<path d="${draw.pathData}" fill="none" stroke="#${draw.borderColor || 'FF0000'}" stroke-width="${draw.borderWidth || 4}" stroke-linecap="round" stroke-linejoin="round" />`;
            });
        }

        // Helper: Converts loose HTML (like <br>) into Strict XML (<br/>) for SVGs
        const getStrictXHTML = (html) => {
            if (!html) return "";
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const xml = new XMLSerializer().serializeToString(doc.body);
            return xml.replace(/^<body[^>]*>/i, '').replace(/<\/body>$/i, '');
        };

        // 2. Standard Elements
        slide.elements.forEach(el => {
            if (el.type === 'connector' || el.type === 'drawing') return;

            const opacity = el.opacity !== undefined ? el.opacity : 1;
            const transform = `translate(${el.x}, ${el.y}) rotate(${el.rotate || 0} ${el.w/2} ${el.h/2})`;
            
            svgContent += `<g transform="${transform}" opacity="${opacity}">`;

            if (el.type === 'shape') {
                const sw = el.borderWidth || 0;
                const stroke = `#${el.borderColor}`;
                const fill = `#${el.fill}`;
                if (el.shapeType === 'ELLIPSE') {
                    svgContent += `<ellipse cx="${el.w/2}" cy="${el.h/2}" rx="${el.w/2}" ry="${el.h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
                } else if (el.shapeType === 'RECTANGLE') {
                    svgContent += `<rect width="${el.w}" height="${el.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
                } else {
                    const path = getSvgPath(el); 
                    svgContent += `<svg width="${el.w}" height="${el.h}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 2}" vector-effect="non-scaling-stroke" /></svg>`;
                }
            } else if (el.type === 'image') {
                svgContent += `<image href="${el.data}" width="${el.w}" height="${el.h}" preserveAspectRatio="none" />`;
            } else if (el.type === 'line') {
                svgContent += `<rect y="${el.h/2 - (el.borderWidth||1)/2}" width="${el.w}" height="${el.borderWidth||1}" fill="#${el.borderColor}" />`;
            } else {
                // Strict XHTML applied to complex foreignObject containers
                const htmlContent = el.type === 'text' 
                    ? `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;color:#${el.color};font-size:${el.fontSize}px;font-family:${el.fontFace};text-align:${el.align};border:${el.borderWidth}px solid #${el.borderColor};background-color:${el.fill === 'none'?'transparent':'#'+el.fill};padding:4px;box-sizing:border-box;white-space:pre-wrap;">${el.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
                    : el.type === 'richtext'
                    ? `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;border:${el.borderWidth||0}px solid #${el.borderColor||'000'};background-color:${el.fill==='none'?'transparent':'#'+el.fill};text-align:${el.align||'left'};padding:8px;box-sizing:border-box;overflow:${el.overflowType||'auto'};">${getStrictXHTML(el.text)}</div>`
                    : el.type === 'table'
                    ? `<table xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;border-collapse:collapse;font-size:10px;"><tbody>${el.tableData.map(row => `<tr>${row.map(cell => `<td style="border:${el.borderWidth}px solid #${el.borderColor};text-align:center;">${getStrictXHTML(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
                    : `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #999;background:#fafafa;color:#666;font-size:14px;font-weight:bold;text-align:center;">📊 Chart:<br/>${el.chartConfig?.title}</div>`;

                svgContent += `<foreignObject width="${el.w}" height="${el.h}">${htmlContent}</foreignObject>`;
            }

            svgContent += `</g>`;
        });

        svgContent += `</svg>`;
        return new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    } catch (e) {
        console.error("SVG Export Error:", e);
        alert("SVG Generation failed: " + e.message);
    } finally {
        setIsLoading(false);
    }
};

const handleAction = async (ext, mode) => {
    setIsLoading(true);
    try{
        let blob = null;
        // 1. Generate Blob based on extension
        if (ext === '.pptx') blob = await generatePPTXBlob();
        else if (ext === '.qslide') blob = await generateQSlideBlob();
        else if (ext === '.odp') blob = await generateODPBlob();
        else if (ext === '.pdf') blob = await generatePDFBlob();
        else if (ext === '.html') blob = await generateHTMLBlob();
        else if (ext === '.md') blob = await generateMDBlob();
        else if (ext === '.svg') blob = await generateSVGBlob();

        if (!blob) return;
        // Ensure we don't accidentally double-extension (e.g., "file.txt.txt")
        const cleanName = fileName.replace(/\.[^/.]+$/, "");

        if (mode === 'save') {
            if (onSave) onSave(blob, cleanName, ext);
            else alert("Save handler not connected.");
        } else if (mode === 'download') {
            if (onDownload) onDownload(blob, cleanName, ext);
            else alert("Download handler not connected.");
        } else if (mode === 'share') {
            if (onShare) onShare(blob, cleanName, ext);
            else alert("Share handler not connected.");
        }
    }catch (e) {
        console.error(e);
        alert(`Error during ${mode}: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
        
    };

const processFileImport = async (file) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.svg')) {
            const text = await file.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "image/svg+xml");
            
            // Safety Check: If the SVG is still corrupted somehow, abort gracefully
            const parserError = doc.querySelector("parsererror");
            if (parserError) {
                throw new Error("The imported SVG file is corrupted or not properly formatted XML.");
            }

            const metadata = doc.getElementById('qslide-state');
            
            if (metadata && metadata.textContent.trim()) {
                try {
                    // It's a QSlide vector backup -> Restore the Presentation
                    const parsedState = JSON.parse(metadata.textContent.trim());
                    if (parsedState.dimensions) {
                        setSlideDim(parsedState.dimensions);
                        setTempDim(parsedState.dimensions);
                    }
                    setSlides(parsedState.slides || []);
                } catch (jsonErr) {
                    console.error("SVG Metadata Parse Error:", jsonErr);
                    throw new Error("Failed to read QSlide backup data from this SVG. The JSON data is malformed.");
                }
            } else {
                // It's a normal internet SVG -> Insert it as an image onto the current slide
                // Use encodeURIComponent to ensure special characters don't break btoa formatting
                const base64SVG = btoa(unescape(encodeURIComponent(text)));
                const newId = Date.now();
                const newSlides = [...slides];
                newSlides[activeSlideIdx].elements.push({
                    id: newId, type: 'image', 
                    data: `data:image/svg+xml;base64,${base64SVG}`,
                    x: 100, y: 100, w: 300, h: 300, rotate: 0,
                    borderColor: '000000', borderWidth: 0
                });
                setSlides(newSlides);
                setSelectedIds([newId]);
            }
            return; // Exit early
        }
        if (fileName.endsWith('.md')) {
            const rawText = await file.text();
            const { slides: parsedSlides, dimensions: parsedDimensions } = parseMarkdownFile(rawText);
            setSlideDim(parsedDimensions);
            setTempDim(parsedDimensions);
            setSlides(parsedSlides);
            return;
        }
        if (fileName.endsWith('.pdf')) {
            // Destructure both the parsed slides and the original PDF dimensions
            const { slides: importedSlides, dimensions } = await parseNativePDF(file);
            setSlideDim(dimensions);
            setTempDim(dimensions); 
            setSlides(importedSlides);
            return; // Exit early to skip JSZip parsing
        }
        if (fileName.endsWith('.html')) {
            const text = await file.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const stateScript = doc.getElementById('qslide-state');
            
            if (stateScript) {
                const parsedState = JSON.parse(stateScript.textContent);
                if (parsedState.dimensions) {
                    setSlideDim(parsedState.dimensions);
                    setTempDim(parsedState.dimensions);
                }
                setSlides(parsedState.slides || []);
            } else {
                throw new Error("This HTML file is missing embedded QSlide data and cannot be fully restored.");
            }
            return;
        }
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        // --- 1. HANDLE .QSLIDE (New Deep Export Format) ---
        if (fileName.endsWith('.qslide') && loadedZip.file("presentation.json")) {
            const stateStr = await loadedZip.file("presentation.json").async("text");
            const parsedState = JSON.parse(stateStr);
            const importedSlides = parsedState.slides || [];

            // Restore custom dimensions if present
            if (parsedState.dimensions) {
                setSlideDim(parsedState.dimensions);
                setTempDim(parsedState.dimensions);
            }

            // REHYDRATION: Convert relative asset paths back to base64 for the editor
            for (const slide of importedSlides) {
                for (const el of slide.elements) {
                    if (el.type === 'image' && el.data?.startsWith('assets/')) {
                        const assetFile = loadedZip.file(el.data);
                        if (assetFile) {
                            const b64 = await assetFile.async("base64");
                            const ext = el.data.split('.').pop();
                            // Restore the data URI format
                            el.data = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`;
                        }
                    }
                }
            }
            setSlides(importedSlides);
        } 
        // --- 2. HANDLE .PPTX (Standard or Legacy with app_state) ---
        else if (fileName.endsWith('.pptx')) {
            // Check for the legacy deep-save logic (if you still want to support opening old files)
            if (loadedZip.file("docProps/app_state.json")) {
                const stateStr = await loadedZip.file("docProps/app_state.json").async("text");
                const parsed = JSON.parse(stateStr);
                setSlides(parsed.slides || []);
            } else {
                // Parse standard PowerPoint using your existing helper
                const imported = await parseNativePPTX(loadedZip);
                setSlides(imported);
            }
        }
        // --- 3. HANDLE .ODP (Standard) ---
        else if (fileName.endsWith('.odp')) {
            // Parse standard ODP using your existing helper
            const imported = await parseNativeODP(loadedZip);
            setSlides(imported);
        } else {
            throw new Error("Unsupported file format");
        }

    } catch (err) {
        console.error("Import Error:", err);
        setErrorMsg("Failed to parse file: " + err.message);
    } finally {
        setIsLoading(false);
    }
};

// --- ADDITION: File Input Handler ---
const handleImportClick = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Pass the browser File object to the processor
    processFileImport(file);

    // Reset the input so the same file can be imported twice if needed
    e.target.value = null;
};

const getContrastYIQ = (hexcolor) => {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
};

const getSlideStyle = (color, image, darkMode) => {
    // 1. Determine the base background color
    // If color exists and isn't a default 'blank' value, use it. Otherwise, use theme colors.
    console.log("DARK MODE: ",darkMode)
    const bgColor = color && color !== '#ffffff' && color !== '' 
        ? color 
        : (darkMode ? '#1e1e1e' : '#ffffff');

    // 2. Adjust the image overlay based on the theme
    // We use a dark overlay for dark mode so the image doesn't look "washed out"
    const overlay = darkMode && (!color || color === '#ffffff')
        ? 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4))'
        : 'linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.4))';

    return {
        backgroundColor: bgColor,
        backgroundImage: image ? `${overlay}, url(${image})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'overlay',
        color: getContrastYIQ(bgColor),
        transition: 'background-color 0.3s ease' // Smooth transition when toggling dark mode
    };
};

useEffect(() => {
          // Detect Screen Size
          const handleResize = () => setIsMobile(window.innerWidth < 992);
          window.addEventListener('resize', handleResize);
      
          // Keyboard Listeners (Capacitor)
          if (window.Capacitor && window.Capacitor.isNativePlatform()) {
              Keyboard.addListener('keyboardWillShow', () => setIsKeyboardOpen(true));
              Keyboard.addListener('keyboardWillHide', () => setIsKeyboardOpen(false));
          } else {
              // PWA/Browser Fallback
              const visualViewport = window.visualViewport;
              if (visualViewport) {
                  visualViewport.addEventListener('resize', () => {
                      setIsKeyboardOpen(visualViewport.height < window.innerHeight * 0.85);
                  });
              }
          }
      }, []);

const getConnectorPointSnap = (id, targetX, targetY) => {
    // Exclude the current connector and other connectors from being snapping targets
    const others = slides[activeSlideIdx].elements.filter(el => el.id !== id && el.type !== 'connector');
    let snappedX = targetX;
    let snappedY = targetY;
    const SNAP_RADIUS = 20; // How close you need to be to snap

    others.forEach(target => {
        // Define the 4 edge centers for the target element
        const edgeCenters = [
            { x: target.x + target.w / 2, y: target.y },             // Top Center
            { x: target.x + target.w, y: target.y + target.h / 2 },  // Right Center
            { x: target.x + target.w / 2, y: target.y + target.h },  // Bottom Center
            { x: target.x, y: target.y + target.h / 2 }              // Left Center
        ];

        edgeCenters.forEach(center => {
            if (Math.abs(targetX - center.x) < SNAP_RADIUS && Math.abs(targetY - center.y) < SNAP_RADIUS) {
                snappedX = center.x;
                snappedY = center.y;
            }
        });
    });
    return { x: snappedX, y: snappedY };
};
const getDynamicConnection = (conn, elementsContext = slides[activeSlideIdx]?.elements) => {
    if (!elementsContext) return null;
    const activeSlide = slides[activeSlideIdx];
    const source = elementsContext.find(el => el.id === conn.sourceId);
    const target = elementsContext.find(el => el.id === conn.targetId);
    if (!source) return null;

    const getCenters = (el) => [
        { x: el.x + el.w / 2, y: el.y, side: 'top' },
        { x: el.x + el.w, y: el.y + el.h / 2, side: 'right' },
        { x: el.x + el.w / 2, y: el.y + el.h, side: 'bottom' },
        { x: el.x, y: el.y + el.h / 2, side: 'left' }
    ];

    const sourcePoints = getCenters(source);

    if (target) {
        const targetPoints = getCenters(target);
        let minDistance = Infinity;
        let bestPair = { start: sourcePoints[1], end: targetPoints[3] };

        sourcePoints.forEach(sp => {
            targetPoints.forEach(tp => {
                const dist = Math.hypot(sp.x - tp.x, sp.y - tp.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestPair = { start: sp, end: tp };
                }
            });
        });
        // RETURN SIDE HERE
        return { x1: bestPair.start.x, y1: bestPair.start.y, x2: bestPair.end.x, y2: bestPair.end.y, side: bestPair.start.side };
    }

    // For dangling connectors
    let minDistance = Infinity;
    let bestStart = sourcePoints[1];
    sourcePoints.forEach(sp => {
        const dist = Math.hypot(sp.x - conn.tempEnd.x, sp.y - conn.tempEnd.y);
        if (dist < minDistance) { minDistance = dist; bestStart = sp; }
    });

    return { x1: bestStart.x, y1: bestStart.y, x2: conn.tempEnd.x, y2: conn.tempEnd.y, side: bestStart.side };
};
const getMindMapPath = (pts, shapeType) => {
    if (!pts) return '';
    const { x1, y1, x2, y2, side } = pts;

    if (shapeType === 'L') {
        // Orthogonal L-Curve
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        if (side === 'top' || side === 'bottom') {
            return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
        } else {
            return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        }
    } else {
        // Smooth S-Curve Bezier
        let cX1 = x1, cY1 = y1, cX2 = x2, cY2 = y2;
        const offset = 50;

        if (side === 'right') cX1 += offset;
        else if (side === 'left') cX1 -= offset;
        else if (side === 'top') cY1 -= offset;
        else if (side === 'bottom') cY1 += offset;

        // Pull the target control point logically based on approach
        if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
            cX2 = x2 + (x2 > x1 ? -offset : offset);
        } else {
            cY2 = y2 + (y2 > y1 ? -offset : offset);
        }

        return `M ${x1} ${y1} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${x2} ${y2}`;
    }
};

const addConnector = (shapeType = 'S') => {
    const activeSlide = slides[activeSlideIdx];
    
    // 1. Get the most recently selected ID from the array
    const currentSelectedId = selectedIds[selectedIds.length - 1];
    const source = activeSlide?.elements.find(el => el.id === currentSelectedId);

    if (!source || source.type === 'connector') {
        alert("Select a shape or text first to start a connection.");
        return;
    }

    const newId = Date.now();
    const newElem = {
        id: newId,
        type: 'connector',
        shapeType: shapeType, // 'S' or 'L'
        sourceId: source.id,
        targetId: null,
        // Default position slightly to the right of the source
        tempEnd: { x: source.x + source.w + 60, y: source.y + source.h / 2 },
        borderColor: '000000',
        borderWidth: 2,
    };

    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements.push(newElem);
    setSlides(newSlides);
    
    // 2. Select the newly created connector using the array system
    setSelectedIds([newId]);
};

const generatePDFBlob = async () => {
    const orientation = slideDim.w > slideDim.h ? 'landscape' : 'portrait';
    const pdf = new jsPDF(orientation, 'px', [slideDim.w, slideDim.h]);
    const originalIdx = activeSlideIdx;

    const currentZoom = zoom;
    setZoom(1);
    await new Promise(resolve => setTimeout(resolve, 100)); 

    for (let i = 0; i < slides.length; i++) {
        setActiveSlideIdx(i);
        
        // --- NEW: Dynamic Delay Logic ---
        const hasChart = slides[i].elements.some(el => el.type === 'chart');
        const waitTime = hasChart ? 2000 : 300; // 2s for charts, 0.3s for others
        await new Promise(resolve => setTimeout(resolve, waitTime));

        const canvas = await html2canvas(stageRef.current, {
            scale: 2, 
            useCORS: true,
            backgroundColor: null,
            width: slideDim.w,
            height: slideDim.h,
            logging: false // Keep console clean
        });

        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage([slideDim.w, slideDim.h], orientation);
        pdf.addImage(imgData, 'PNG', 0, 0, slideDim.w, slideDim.h);
    }

    setActiveSlideIdx(originalIdx);
    setZoom(currentZoom);
    
    return pdf.output('blob'); 
};

const saveChart = () => {
    // 1. Construct the configuration object
    const config = {
        title: chartInput.title,
        type: chartInput.type,
        ...(chartInput.isGrouped 
            ? { labels: chartInput.labels, series: chartInput.series } 
            : { data: chartInput.data })
    };

    if (editingId) {
        // 2. UPDATE existing element
        updateElement(editingId, { chartConfig: config });
    } else {
        // 3. INSERT new element
        const newChartElement = {
            id: Date.now(),
            type: 'chart',
            x: 100, // Default starting position
            y: 100,
            w: 450, // Default starting size
            h: 300,
            rotate: 0,
            chartConfig: config
        };
        const updatedSlides = [...slides];
        updatedSlides[activeSlideIdx].elements.push(newChartElement);
        setSlides(updatedSlides);
        setSelectedId(newChartElement.id);
    }

    // 4. Cleanup
    setShowChartModal(false);
    setEditingId(null); 
};

const handleEditChart = (el) => {
    setEditingId(el.id);
    setChartInput({
        title: el.chartConfig.title,
        type: el.chartConfig.type,
        isGrouped: !!el.chartConfig.series, 
        data: el.chartConfig.data || [{ label: "", value: 0, color: "#cccccc" }],
        labels: el.chartConfig.labels || [],
        series: el.chartConfig.series || []
    });
    setShowChartModal(true);
};

const moveZIndex = (direction) => {
    if (selectedIds.length !== 1) return;
    const selectedId = selectedIds[0];
    
    setSlides(prevSlides => {
        const newSlides = [...prevSlides];
        const slide = newSlides[activeSlideIdx];
        const elements = [...slide.elements];
        const index = elements.findIndex(el => el.id === selectedId);

        if (index === -1) return prevSlides;

        if (direction === 'up' && index < elements.length - 1) {
            // Swap with next element (Move to front)
            [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
        } else if (direction === 'down' && index > 0) {
            // Swap with previous element (Move to back)
            [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
        }

        slide.elements = elements;
        return newSlides;
    });
};

const moveLayerZIndex = (targetId, direction) => {
    const newSlides = [...slides];
    const slide = newSlides[activeSlideIdx];
    const elements = [...slide.elements];
    const index = elements.findIndex(el => el.id === targetId);

    if (index === -1) return;

    if (direction === 'up' && index < elements.length - 1) {
        [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
    } else if (direction === 'down' && index > 0) {
        [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
    } else {
        return; // No change needed
    }

    slide.elements = elements;
    setSlides(newSlides);
    saveToHistory(newSlides);
};

const handleConnectorMove = (clientX, clientY) => {
    if (!draggingConnectorId || !stageRef.current) return;

    // Get stage bounds to calculate relative mouse position
    const rect = stageRef.current.getBoundingClientRect();
    const rawX = (clientX - rect.left) / zoom;
    const rawY = (clientY - rect.top) / zoom;

    // Check if the endpoint snaps onto any other element's edges
    const snapped = getConnectorPointSnap(draggingConnectorId, rawX, rawY);

    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(el => {
        if (el.id === draggingConnectorId) {
            return {
                ...el,
                tempEnd: { x: snapped.x, y: snapped.y }
            };
        }
        return el;
    });
    setSlides(newSlides);
};

const handleConnectorEnd = (clientX, clientY) => {
    if (!draggingConnectorId || !stageRef.current) return;

    const rect = stageRef.current.getBoundingClientRect();
    const rawX = (clientX - rect.left) / zoom;
    const rawY = (clientY - rect.top) / zoom;

    // Find if we are dropping near an element to lock the connection
    const activeSlide = slides[activeSlideIdx];
    const targetElement = activeSlide.elements.find(el => {
        if (el.id === draggingConnectorId || el.type === 'connector') return false;
        
        // Simple bounding box check with padding to detect if dropped inside/near a target
        const padding = 20;
        return (
            rawX >= el.x - padding &&
            rawX <= el.x + el.w + padding &&
            rawY >= el.y - padding &&
            rawY <= el.y + el.h + padding
        );
    });

    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(el => {
        if (el.id === draggingConnectorId) {
            return {
                ...el,
                targetId: targetElement ? targetElement.id : null, // Lock to shape ID or leave dangling
                tempEnd: targetElement ? null : el.tempEnd // Clear temp position if snapped
            };
        }
        return el;
    });

    setSlides(newSlides);
    saveToHistory(newSlides);
    setDraggingConnectorId(null); // Reset dragging state
};

const renderSlideContent = (isPresentation = false) => {
    return (
        <>
            {/* SVG Connector Layer */}
            <svg style={{ 
                position: 'absolute', 
                inset: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none', 
                zIndex: 1,
                overflow: 'visible' 
            }}>
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#000000" />
                    </marker>
                </defs>

                {activeSlide?.elements.filter(el => el.type === 'connector').map(conn => {
                    const pts = getDynamicConnection(conn);
                    if (!pts) return null;

                    const pathData = getMindMapPath(pts, conn.shapeType);
                    const isSelected = selectedId === conn.id;

                    return (
                        <g key={conn.id}>
                            <path 
                                d={pathData} 
                                fill="none" 
                                stroke="transparent" 
                                strokeWidth="15" 
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onMouseDown={(e) => { e.stopPropagation(); setSelectedIds([conn.id]); }}
                            />
                            <path 
                                d={pathData} 
                                fill="none" 
                                stroke={isSelected ? '#0078D4' : `#${conn.borderColor || '000000'}`} 
                                strokeWidth={conn.borderWidth || 2} 
                                markerEnd="url(#arrowhead)"
                                style={{ pointerEvents: 'none' }} 
                            />
                            {isSelected && (
                                <circle 
                                    cx={pts.x2} cy={pts.y2} r={8} 
                                    fill="white" stroke="#0078D4" strokeWidth={2}
                                    style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDraggingConnectorId(conn.id);
                                    }}
                                />
                            )}
                        </g>
                    );
                })}
                {activeSlide?.elements.filter(el => el.type === 'drawing').map(draw => (
                    <path
                        key={draw.id}
                        d={draw.pathData}
                        fill="none"
                        stroke={`#${draw.borderColor || 'FF0000'}`}
                        strokeWidth={draw.borderWidth || 4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'none' }} // Lets click-actions pass through to standard elements
                    />
                ))}
            </svg>

            {/* FIX 1: Hide the editing title bar entirely during presentations to prevent layout crowding */}
            {!isPresentation && (
                <input 
                    className="h4 border-0 w-100 text-center mt-2 bg-transparent" 
                    value={activeSlide?.title || ""}
                    onChange={(e) => { const ns = [...slides]; ns[activeSlideIdx].title = e.target.value; setSlides(ns); }}
                    onBlur={() => saveToHistory(slides)} 
                    style={{ outline: 'none' }} 
                />
            )}

            {/* Filter OUT connectors so they don't get positioning boxes */}
            {activeSlide?.elements.filter(el => el.type !== 'connector').map((el) => {
                
                // Isolate the core inner element content layout tree
                const innerElementLayout = (
                    <div style={{
        width: '100%', height: '100%',
        // 1. Play animation ONLY during presentation mode to avoid annoying the user while editing
        animation: (el.animationEffect && el.animationEffect !== 'none' && isPresentation) 
            ? `${el.animationEffect} ${el.animationDuration || 1}s ease-in-out both` 
            : 'none',
        // 2. Apply Spacing and Opacity
        opacity: el.opacity !== undefined ? el.opacity : 1,
        marginTop: `${el.marginTop || 0}${el.marginUnit || 'px'}`,
        marginBottom: `${el.marginBottom || 0}${el.marginUnit || 'px'}`,
        marginLeft: `${el.marginLeft || 0}${el.marginUnit || 'px'}`,
        marginRight: `${el.marginRight || 0}${el.marginUnit || 'px'}`,
        paddingTop: `${el.paddingTop || 0}${el.paddingUnit || 'px'}`,
        paddingBottom: `${el.paddingBottom || 0}${el.paddingUnit || 'px'}`,
        paddingLeft: `${el.paddingLeft || 0}${el.paddingUnit || 'px'}`,
        paddingRight: `${el.paddingRight || 0}${el.paddingUnit || 'px'}`,
    }}>
        {/* 3. Isolate Rotation inside the nested wrapper so it doesn't fight the animation transform */}
        <div style={{ 
            width: '100%', height: '100%', 
            transform: `rotate(${el.rotate || 0}deg)`, 
            outline: (selectedIds.includes(el.id) && !isPresentation) ? '2px solid #0078D4' : 'none' 
        }}>
                        {el.type === 'text' && (
                            <textarea className="w-100 h-100 p-1" 
                                style={{ 
                                    color: `#${el.color || '000'}`, fontSize: `${el.fontSize || 16}px`, fontFamily: el.fontFace || 'Arial', textAlign: el.align || 'center', resize: 'none', border: `${el.borderWidth || 0}px solid #${el.borderColor || '000'}`, backgroundColor: el.fill === 'none' ? 'transparent' : `#${el.fill || 'fff'}` 
                                }}
                                value={el.text} 
                                // onChange={(e) => updateElement(el.id, { text: e.target.value })}
                                // onBlur={() => saveToHistory(slides)} 
                                // onMouseDown={(e) => {
                                //     e.stopPropagation(); // CRITICAL: Stops Rnd from stealing the mouse click
                                //     if (!selectedIds.includes(el.id)) handleElementSelect(e, el.id); // Select element to show handles
                                // }}
                                // onKeyDown={(e) => {
                                //     // Native Tab Space Insertion
                                //     if (e.key === 'Tab') {
                                //         e.preventDefault();
                                //         const start = e.target.selectionStart;
                                //         const end = e.target.selectionEnd;
                                //         const val = e.target.value;
                                //         updateElement(el.id, { text: val.substring(0, start) + "    " + val.substring(end) });
                                //         setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 4; }, 0);
                                //     }
                                // }}
                                readOnly={isPresentation}
                            />
                        )}
                        {el.type === 'richtext' && (
                            <div 
                                id={`richtext-${el.id}`}
                                className="w-100 h-100 p-2 text-editor-content" 
                                style={{ 
                                    border: `${el.borderWidth || 0}px solid #${el.borderColor || '000'}`, backgroundColor: el.fill === 'none' ? 'transparent' : `#${el.fill || 'fff'}`, overflow: el.overflowType || 'auto', outline: 'none', userSelect: 'text', cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                }}
                                contentEditable={!isSlideshow}
                                suppressContentEditableWarning={true}
                                dangerouslySetInnerHTML={{ __html: el.text }}
                                // UNCOMMENT WILL ALLOW EDIT IN SLIDESHOW (CHANGE contentEditable={isSlideshow})
                                // onMouseDown={(e) => {
                                //     e.stopPropagation(); // CRITICAL: Stops Rnd from stealing focus!
                                //     if (!selectedIds.includes(el.id)) {
                                //         handleElementSelect(e, el.id); // Triggers resize handles to appear
                                //     }
                                // }}
                                // onKeyDown={(e) => {
                                //     if (e.key === 'Tab') {
                                //         e.preventDefault();
                                //         document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                                //     }
                                // }}
                                // onBlur={(e) => {
                                //     updateElement(el.id, { text: e.target.innerHTML });
                                //     saveToHistory(slides);
                                // }}
                            />
                        )}
                        {el.type === 'shape' && renderShape(el)}
                        {el.type === 'image' && <img src={el.data} className="w-100 h-100" style={{ objectFit: 'fill', border: `${el.borderWidth}px solid #${el.borderColor}` }} draggable="false" alt="" />}
                        {el.type === 'line' && <div className="w-100" style={{ height: `${el.borderWidth}px`, backgroundColor: `#${el.borderColor}`, marginTop: '50%' }} />}
                        {el.type === 'table' && (
                            <table className="table table-bordered m-0 h-100 w-100 bg-white" style={{ border: `${el.borderWidth}px solid #${el.borderColor}`, fontSize: '10px' }}>
                                <tbody>{el.tableData.map((row, rIdx) => (<tr key={rIdx}>{row.map((cell, cIdx) => (
                                    <td key={cIdx} style={{ border: `${el.borderWidth}px solid #${el.borderColor}` }} className="p-0">
                                        <input className="w-100 border-0 text-center" value={cell} readOnly={isPresentation}
                                            onChange={(e) => { const newData = [...el.tableData]; newData[rIdx][cIdx] = e.target.value; updateElement(el.id, { tableData: newData }); }} />
                                    </td>
                                ))}</tr>))}</tbody>
                            </table>
                        )}
                        {el.type === 'chart' && (
                            <div style={{ width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
                                <MultiChartGen chartsDataArray={[el.chartConfig]} />
                            </div>
                        )}
                        {el.type === 'connector' && (
                            <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                                <defs>
                                    <marker id={`arrow-${el.id}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                        <polygon points="0 0, 10 3.5, 0 7" fill={`#${el.borderColor}`} />
                                    </marker>
                                </defs>
                                <path 
                                    d={el.shapeType === 'S' ? `M 0 0 C ${el.w/2} 0 ${el.w/2} ${el.h} ${el.w} ${el.h}` : `M 0 0 L ${el.w/2} 0 L ${el.w/2} ${el.h} L ${el.w} ${el.h}`} 
                                    fill="none" stroke={`#${el.borderColor}`} strokeWidth={el.borderWidth} markerEnd={`url(#arrow-${el.id})`}
                                />
                            </svg>
                        )}
                    </div>
                    </div>
                );

                // If in presentation mode, bypass heavy Rnd calculations and render a lightweight absolute div
                if (isPresentation) {
                    return (
                        <div 
                            key={el.id}
                            style={{
                                position: 'absolute',
                                left: `${el.x}px`,
                                top: `${el.y}px`,
                                width: `${el.w}px`,
                                height: `${el.h}px`
                            }}
                        >
                            {innerElementLayout}
                        </div>
                    );
                }

                // Standard editable Rnd wrapper wrapper for workspace editing
                return (
                    <Rnd 
                        key={el.id} 
                        size={{ width: el.w, height: el.h }} 
                        position={{ x: el.x, y: el.y }}
                        onDragStop={(e, d) => {
                            let finalX = d.x; let finalY = d.y;
                            if (showGrid) {
                                finalX = Math.round(finalX / 20) * 20; finalY = Math.round(finalY / 20) * 20;
                            } else {
                                if (el.type === 'connector') {
                                    const snapped = getConnectorPointSnap(el.id, d.x, d.y); finalX = snapped.x; finalY = snapped.y;
                                } else {
                                    const snapped = getSnappedPos(el.id, d.x, d.y, el.w, el.h); finalX = snapped.x; finalY = snapped.y;
                                }
                            }
                            updateElement(el.id, { x: finalX, y: finalY });
                        }}
                        onResizeStop={(e, dir, ref, delta, pos) => {
                            let finalW = ref.offsetWidth; let finalH = ref.offsetHeight;
                            if (el.type === 'connector' && !showGrid) {
                                const snappedEnd = getConnectorPointSnap(el.id, pos.x + finalW, pos.y + finalH);
                                if (snappedEnd.x !== pos.x + finalW || snappedEnd.y !== pos.y + finalH) {
                                    finalW = Math.max(10, snappedEnd.x - pos.x); finalH = Math.max(10, snappedEnd.y - pos.y);
                                }
                            }
                            updateElement(el.id, { w: finalW, h: finalH, ...pos });
                        }}
                        onMouseDown={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                    >
                        {innerElementLayout}
                    </Rnd>
                );
            })}
        </>
    );
};

const handleRichTextCommand = (e, command, value = null) => {
    if (e) {
        e.preventDefault(); // CRITICAL: Stops button from taking focus
        e.stopPropagation();
    }
    const selection = window.getSelection();
    let range = null;
    // Use saved range if current selection is lost (e.g., clicking a color input)
    if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
    } else if (savedRange) {
        range = savedRange;
        selection.removeAllRanges();
        selection.addRange(range);
    }
    if (!range) return;
    // Execute the command natively. The DOM updates, but React state doesn't.
    // This perfectly preserves the cursor position!
    TextEditorEngine.execute(command, value, selection);
    // We rely on the `onBlur` event of the richtext div to save to React state later.
};

const handleInsertLink = useCallback(() => {
    const url = prompt("Enter link URL:");
    if (url) {
        handleRichTextCommand('createlink', url); 
    }
}, [handleRichTextCommand]);

const getCanvasCoords = (clientX, clientY) => {
    if (!stageRef.current) return { x: 0, y: 0 };
    const rect = stageRef.current.getBoundingClientRect();
    // Compute exact position offsetting the bounding container and the active zoom scale
    return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom
    };
};

const handleDrawStart = (clientX, clientY) => {
    if (!isDrawMode) return;
    const coords = getCanvasCoords(clientX, clientY);
    setCurrentDrawingPath(`M ${coords.x.toFixed(1)} ${coords.y.toFixed(1)}`);
};

const handleDrawMove = (clientX, clientY) => {
    if (!isDrawMode || !currentDrawingPath) return;
    const coords = getCanvasCoords(clientX, clientY);
    setCurrentDrawingPath(prev => `${prev} L ${coords.x.toFixed(1)} ${coords.y.toFixed(1)}`);
};

const handleDrawEnd = () => {
    if (!isDrawMode || !currentDrawingPath) return;

    const newId = Date.now();
    const drawingElement = {
        id: newId,
        type: 'drawing',
        pathData: currentDrawingPath,
        borderColor: drawColor,    // Using existing schema properties
        borderWidth: drawSize,     // Using existing schema properties
        x: 0, y: 0, w: slideDim.w, h: slideDim.h, rotate: 0 // Bound to stage coordinate origin
    };

    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements.push(drawingElement);
    
    setSlides(newSlides);
    setCurrentDrawingPath(null);
    saveToHistory(newSlides);
};

const handleElementSelect = (e, id) => {
    // If it's a native or synthetic event, stop propagation
    if (e && e.stopPropagation) e.stopPropagation();
    
    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    if (isMulti) {
        // Toggle selection
        setSelectedIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    } else {
        // Single selection
        if (!selectedIds.includes(id)) setSelectedIds([id]);
    }
};

const updateSelectedElements = (changes, skipHistory = false) => {
    const newSlides = [...slides];
    newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(el => 
        selectedIds.includes(el.id) ? { ...el, ...changes } : el
    );
    if (!skipHistory) saveToHistory(newSlides);
    setSlides(newSlides);
};

const handlePrint = async () => {
    setIsLoading(true);
    try {
        // Generate the HTML optimized for printing
        const blob = await generateHTMLBlob('print');
        const url = URL.createObjectURL(blob);
        
        // Use a hidden iframe to bypass popup blockers
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = url;
        
        document.body.appendChild(iframe);

        // Wait for iframe to load its content before triggering print
        iframe.onload = () => {
            setIsLoading(false);
            iframe.contentWindow.print();
            
            // Clean up memory after the print dialog closes
            setTimeout(() => {
                document.body.removeChild(iframe);
                URL.revokeObjectURL(url);
            }, 1000);
        };
    } catch (e) {
        console.error(e);
        alert("Error preparing print: " + e.message);
        setIsLoading(false);
    }
};
    return (
        <Container fluid className={`app-wrapper p-0 ${darkMode ? 'dark-mode border' : ''}`} style={{...getSlideStyle(slideColor, slideBgImage, darkMode), maxHeight: '100vh', maxWidth: '100vw', display: 'flex', flexDirection: 'column' }}>
            <style>{`
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slide-up { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slide-left { from { transform: translateX(50px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes zoom-in { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes bounce { 
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 
        40% { transform: translateY(-30px); } 
        60% { transform: translateY(-15px); } 
    }
`}</style>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="position-absolute w-100 h-100 d-flex justify-content-center align-items-center bg-white opacity-75" style={{ zIndex: 1060 }}>
                    <Spinner animation="border" variant="primary" />
                </div>
            )}
            <div className="p-2 border-bottom d-flex align-items-center gap-2">
                    <input 
                className="flex-grow-1 bg-transparent border-0 fw-bold fs-5" 
                value={fileName} 
                onChange={e => setFileName(e.target.value)} 
                placeholder="Filename"
                style={{ outline: 'none' }}
            />
                    <Button variant="qslide-outline-btn" className='qslide-outline-btn' onClick={() => setShowSettings(!showSettings)} style={{ 
                                width: '2.6rem', 
                                height: '2.6rem', 
                                borderRadius: '50px', 
                                position: 'relative',
                                flexShrink: 0
                    }}>
                        <i className="bi bi-gear"></i>
                    </Button>
                    {/* Dark Mode Toggle */}
                    <Button onClick={() => setDarkMode(!darkMode)} title="Toggle Dark Mode" variant="qslide-outline-btn" className='qslide-outline-btn me-3' size="sm" style={{ 
                                width: '2.6rem', 
                                height: '2.6rem', 
                                borderRadius: '50px', 
                                position: 'relative',
                                flexShrink: 0
                    }}><i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'} `}></i></Button>
                </div>

                <Collapse in={showSettings}>
                <div className="p-3 border-bottom">
                <div className="d-flex align-items-center justify-content-left gap-3 mb-1 bg-opacity-10 flex-nowrap" style={{
                position: 'sticky',
                overflowX: 'auto', 
                whiteSpace: 'nowrap',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
                }}>
                <style>{`
                .sticky-toolbar::-webkit-scrollbar {
                display: none; /* Chrome, Safari and Opera */
                }
                `}</style>
                <span className="text-muted small fw-bold mb-0">CANVAS SIZE (PX):</span>
                            
                            <Form.Group className="d-flex align-items-center mb-0">
                                <Form.Control 
                                    type="number" size="sm" style={{ width: '80px' }} 
                                    value={tempDim.w} 
                                    onChange={e => setTempDim({ ...tempDim, w: parseInt(e.target.value) || 0 })} 
                                />
                                <span className="mx-2 text-muted">×</span>
                                <Form.Control 
                                    type="number" size="sm" style={{ width: '80px' }} 
                                    value={tempDim.h} 
                                    onChange={e => setTempDim({ ...tempDim, h: parseInt(e.target.value) || 0 })} 
                                />
                            </Form.Group>
                            
                            <Button size="sm" variant="dark" onClick={() => setSlideDim(tempDim)}>
                                Apply
                            </Button>
                            
                            <small className="text-muted ms-3">
                                Current: {slideDim.w} x {slideDim.h}
                            </small>
                </div>
                </div>
                </Collapse>
                
                {/* KEYBOARD TOOLBAR FOR MOBILE */}
                 {window.Capacitor && window.Capacitor.isNativePlatform() && isMobile && isKeyboardOpen &&
                    <div className={ `sticky-toolbar d-flex gap-2 p-2 border-bottom flex-nowrap ${isMobile && isKeyboardOpen ? 'fixed-bottom shadow-lg' : 'sticky-top'}`} 
                    onMouseDown={(e) => e.preventDefault()}
                    style={{ 
                          position: isMobile && isKeyboardOpen ? 'fixed' : 'sticky', 
                          top: isMobile && isKeyboardOpen ? 'auto' : 0,
                          bottom: isMobile && isKeyboardOpen ? 0 : 'auto', 
                          //zIndex: 1060,
                          backdropFilter: 'blur(10px)', // Adds a nice modern touch
                          // --- Horizontal scrolling and hidden scrollbar logic ---
                          overflowX: 'scroll', 
                          whiteSpace: 'nowrap',
                          msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                          scrollbarWidth: 'none',   /* Firefox */
                          WebkitOverflowScrolling: 'touch' /* Smooth scrolling for iOS */
                      }}
      >
                            <Button title="Undo (Ctrl + z)" variant="qslide-btn" className='qslide-btn' size="sm" disabled={historyIndex <= 0} onClick={() => undo()}><i className='bi bi-arrow-counterclockwise'></i></Button>
                            <Button title="Redo (Ctrl + y)" variant="qslide-btn" className='qslide-btn' size="sm" disabled={historyIndex >= history.length - 1} onClick={() => redo()}><i className='bi bi-arrow-clockwise'></i></Button>
                    {selectedElement && (
                                <Stack direction="horizontal" gap={2} >
                                    <Button title="Cut (Ctrl+X)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => cutElement()}><i className='bi bi bi-scissors'></i></Button>
                                    <Button title="Copy (Ctrl+C)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => copyElement()}><i className='bi bi-files'></i></Button>
                                    <Button title="Paste (Ctrl+V)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => pasteElement()}><i className='bi bi-clipboard-fill'></i></Button>
                                    <Button title="Move Layer Up (Ctrl+Up Arrow)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => moveZIndex('up')}><i className='bi bi-arrow-up-circle-fill'></i></Button>
                                    <Button title="Move Layer Down (Ctrl+Down Arrow)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => moveZIndex('down')}><i className='bi bi-arrow-down-circle-fill'></i></Button>
                                    
                                        <div className="d-flex align-items-center gap-2 rounded px-2 border" style={{ width: 'fit-content' }}>
                                            {/* Minus Button: Decrements rotation by 1 or 5 degrees */}
                                            <i 
                                                className="bi bi-dash-circle cursor-pointer text-muted" 
                                                onClick={() => updateSelectedElements( { rotate: Math.max(0, selectedElement.rotate - 5) })}
                                            ></i>

                                            <Form.Range 
                                                style={{ width: '80px' }} 
                                                min="0" 
                                                max="360" 
                                                value={selectedElement.rotate} 
                                                onChange={(e) => updateSelectedElements( { rotate: parseInt(e.target.value) })} 
                                            />

                                            {/* Plus Button: Increments rotation */}
                                            <i 
                                                className="bi bi-plus-circle cursor-pointer text-muted" 
                                                onClick={() => updateSelectedElements( { rotate: Math.min(360, selectedElement.rotate + 5) })}
                                            ></i>
                                            
                                            {/* Optional: Show the degree number */}
                                            <small className="text-muted" style={{ minWidth: '30px' }}>{selectedElement.rotate}°</small>
                                        </div>
                                    
                                    {selectedElement.type === 'text' && (
                                        <>
                                        {/* <Form.Select size="sm" style={{ width: '100px' }} value={selectedElement.fontFace} onChange={(e) => updateSelectedElements( { fontFace: e.target.value })}>
                                                <option value="Arial">Arial</option><option value="Courier New">Courier</option><option value="Georgia">Georgia</option>
                                        </Form.Select> */}
                                        <ButtonGroup size="sm" className='gap-2' style={{flexShrink:0}}>
                                            <Button className={selectedElement.align === 'left' ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => updateSelectedElements( { align: 'left' })}><i className='bi bi-justify-left'></i></Button>
                                            <Button className={selectedElement.align === 'center' ? "qslide-outline-btn" : "qslide-btn"} onClick={() => updateSelectedElements( { align: 'center' })}><i className='bi bi-justify'></i></Button>
                                            <Button className={selectedElement.align === 'right' ? "qslide-outline-btn" : "qslide-btn"} onClick={() => updateSelectedElements( { align: 'right' })}><i className='bi bi-justify-right'></i></Button>
                                        </ButtonGroup>
                                        </>
                                        
                                    )}

                                    {/* BLOCK TEXT COLOR */}
                                    <label 
                                        className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                        title='Slide Background Color'
                                        style={{ 
                                            width: '2rem', 
                                            height: '2rem', 
                                            borderRadius: '50px', 
                                            backgroundColor: `#${selectedElement.type === 'text' ? selectedElement.color : selectedElement.fill}`,
                                            position: 'relative',
                                            cursor: 'pointer'
                                        }} 
                                    >
                                        <i className="bi bi-pencil-fill" style={{ color: getContrastYIQ(`#${selectedElement.type === 'text' ? selectedElement.color : selectedElement.fill}`) }}></i>
                                        <input 
                                            type="color"
                                            hidden 
                                            onChange={(e) => {
                                                const changes = selectedElement.type === 'text' 
                                                    ? { color: e.target.value.replace('#', '') } 
                                                    : { fill: e.target.value.replace('#', '') };
                                                updateSelectedElements(changes); // Clean and simple
                                            }}
                                        />
                                    </label>
                                    {/* BLOCK TEXT BACKGROUND COLOR */}
                                    <label 
                                        className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                        title='Slide Background Color'
                                        style={{ 
                                            width: '2rem', 
                                            height: '2rem', 
                                            borderRadius: '50px', 
                                            backgroundColor: `#${selectedElement.fill === 'none' ? 'FFFFFF' : selectedElement.fill}`,
                                            position: 'relative',
                                            cursor: 'pointer'
                                        }} 
                                    >
                                        <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(`#${selectedElement.fill === 'none' ? 'FFFFFF' : selectedElement.fill}`) }}></i>
                                        <input 
                                            type="color"
                                            hidden 
                                            onChange={(e) => updateSelectedElements({ fill: e.target.value.replace('#', '') })}
                                        />
                                    </label>
                                    {/* BLOCK TEXT AREA BORDER COLOR */}
                                    <label 
                                        className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                        title='Slide Background Color'
                                        style={{ 
                                            width: '2rem', 
                                            height: '2rem', 
                                            borderRadius: '50px', 
                                            backgroundColor: `#${selectedElement.borderColor}`,
                                            position: 'relative',
                                            cursor: 'pointer'
                                        }} 
                                    >
                                        <i className="bi bi-border-all" style={{ color: getContrastYIQ(`#${selectedElement.borderColor}`) }}></i>
                                        <input 
                                            type="color"
                                            hidden 
                                            onChange={(e) => updateSelectedElements({ borderColor: e.target.value.replace('#', '') })}
                                        />
                                    </label>
                                    <Button title="📐 Scale preserve aspect ratio (Shift Drag)" variant={isShiftPressed ? "qslide-outline-btn" : "qslide-btn"} className={isShiftPressed ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => setIsShiftPressed(!isShiftPressed)}>
                                        <i className='bi bi-aspect-ratio-fill'></i> 
                                    </Button>
                                    <Button title="Scale around center (Ctrl Drag)" variant={isControlPressed ? "qslide-outline-btn" : "qslide-btn"} className={isControlPressed ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => setIsControlPressed(!isControlPressed)}>
                                        <i className='bi bi-arrows-fullscreen'></i>
                                    </Button>
                                    <Form.Control type="number" size="sm" value={selectedElement.borderWidth} onChange={(e) => updateSelectedElements( { borderWidth: parseInt(e.target.value) })} style={{ width: '3rem' }} />
                                    <Button title="Delete element" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => { 
                                        setSlides(slides.map((s, i) => i === activeSlideIdx ? { 
                                            ...s, 
                                            elements: s.elements.filter(e => !selectedIds.includes(e.id)) // Exclude all selected IDs
                                        } : s)); 
                                        setSelectedIds([]); // Clear the array
                                    }}>
                                        <i className='bi bi-trash'></i>
                                    </Button>
                                </Stack>
                            )}
                </div>}
            
            <Row className="p-0 position-relative">
                {errorMsg && <Alert variant="warning" className="m-2">{errorMsg}</Alert>}
                
                <div className="editor-box d-flex flex-column border-0" style={{ height: '85vh', maxWidth: '99.5vw'}}>
                        {/* TOOLBAR FOR DESKTOP & MOBILE */}
                        <div className="border-bottom p-2 d-flex flex-nowrap align-items-center gap-2"
                        style={{ 
                          position: 'sticky', 
                          top: 0,
                          bottom: 'auto', 
                          //zIndex: 1060,
                          backdropFilter: 'blur(10px)', // Adds a nice modern touch
                          // --- Horizontal scrolling and hidden scrollbar logic ---
                          overflowX: 'scroll', 
                          whiteSpace: 'nowrap',
                          msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                          scrollbarWidth: 'none',   /* Firefox */
                          WebkitOverflowScrolling: 'touch' /* Smooth scrolling for iOS */
                      }}>

                            <Form.Group controlId="shapeSelect">
                            <Form.Select 
                                size="sm" 
                                className="qslide-btn"
                                style={{minWidth: '5rem', flexShrink: 0}}
                                onChange={(e) => {
                                if (e.target.value) {
                                    addElement('shape', e.target.value);
                                    e.target.value = "";
                                }
                                }}
                            >
                                <option value="" disabled='true'>+ Shape</option>
                                <option value="RECTANGLE">Rectangle</option>
                                <option value="ELLIPSE">Circle</option>
                                <option value="TRIANGLE">Triangle</option>
                                <option value="CUSTOM_POLY">Polygon</option>
                                <option value="CUSTOM_STAR">Star</option>
                            </Form.Select>
                            </Form.Group>
                            
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" title='Insert Block Text' onClick={() => addElement('text')}><i className='bi bi-type'></i></Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" title="Insert Rich Text" onClick={() => addElement('richtext')}><i className='bi bi-file-earmark-richtext'></i></Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" title='Insert Table' onClick={() => addElement('table')}><i className='bi bi-table'></i></Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" title='Insert Chart' onClick={() => setShowChartModal(true)}><i className='bi bi-pie-chart-fill'></i></Button>
                            <div className="d-flex align-items-center gap-2">
                                <Button 
                                    variant="qslide-btn" className="qslide-btn" size="sm" title='Draw' onClick={() => {
                                        setIsDrawMode(!isDrawMode);
                                        setSelectedIds([]); // Clear selections to isolate focus
                                    }}
                                ><i className={`bi ${isDrawMode ? 'bi-brush-fill' : 'bi-brush'}`}></i> {isDrawMode ? " Drawing Mode ON" : ""} </Button>

                                {isDrawMode && (
                                    <>
                                        {/* Brush Color Picker */}
                                        <label title="Brush Color" className="btn qslide-btn btn-sm mb-0 d-flex align-items-center cursor-pointer">
                                            <i className="bi bi-palette-fill text-white me-1"></i>
                                            <input 
                                                type="color" 
                                                value={`#${drawColor}`}
                                                onChange={(e) => setDrawColor(e.target.value.replace('#', ''))} 
                                            />
                                        </label>

                                        {/* Brush Size Slider */}
                                        <div className="d-flex align-items-center text-white gap-1 bg-secondary px-2 py-1 rounded">
                                            <i className="bi bi-border-width" style={{ fontSize: '12px' }}></i>
                                            <input 
                                                type="range" 
                                                min="1" 
                                                max="15" 
                                                value={drawSize} 
                                                style={{ width: '60px', height: '4px', cursor: 'pointer' }}
                                                onChange={(e) => setDrawSize(parseInt(e.target.value))} 
                                            />
                                            <span style={{ fontSize: '12px', minWidth: '15px' }} className="text-center">{drawSize}px</span>
                                        </div>
                                    </>
                                )}
                            </div>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" title="Insert Line" onClick={() => addElement('line')}>---</Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => addConnector('L')} title="L Connector">
                                <i className='bi bi-arrow-return-right'></i>
                            </Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => addConnector('S')} title="S Connector">
                                <i className='bi bi-bezier2'></i>
                            </Button>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => setIsSlideshow(true)} title="Start Slideshow"><i className="bi bi-play-fill"></i></Button>                            
                            <label className="btn qslide-btn mb-0 d-flex align-items-center justify-content-center" title="Insert Image"
                                style={{ width: '2rem', padding: '0', border: 'none', height: '2rem', borderRadius: '50px', flexShrink: 0}} 
                                            >
                                    <i className="bi bi-image-fill"></i>
                                    <input 
                                        type="file" 
                                        hidden 
                                        accept="image/*" 
                                        onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (!file) return;
                                                    const reader = new FileReader();
                                                    reader.onload = (event) => {
                                                        const newId = Date.now();
                                                        const newSlides = [...slides];
                                                        newSlides[activeSlideIdx].elements.push({
                                                            id: newId, type: 'image', data: event.target.result,
                                                            x: 100, y: 100, w: 300, h: 200, rotate: 0,
                                                            borderColor: '000000', borderWidth: 0
                                                        });
                                                        setSlides(newSlides);
                                                        setSelectedIds([newId]);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }}
                                    />
                                </label>
                            <label className="btn qslide-btn mb-0 d-flex align-items-center justify-content-center" title="Insert Video"
                                style={{ width: '2rem', padding: '0', border: 'none', height: '2rem', borderRadius: '50px', flexShrink: 0}} 
                                            >
                                    <i className="bi bi-camera-reels-fill"></i>
                                    <input 
                                        type="file" 
                                        hidden 
                                        accept="video/*" 
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;

                                            const reader = new FileReader();
                                            reader.onload = (event) => {
                                                const newId = Date.now();
                                                const newSlides = [...slides];
                                                
                                                const newVideoElement = {
                                                    id: newId,
                                                    type: 'video',
                                                    data: event.target.result,
                                                    x: 100,
                                                    y: 100,
                                                    w: 480,
                                                    h: 270,
                                                    rotate: 0,
                                                    borderColor: '000000',
                                                    borderWidth: 0,
                                                    // Custom play options required
                                                    play: {
                                                        delay: 0, // value in seconds
                                                        mode: 'once' // 'once' or 'loop'
                                                    }
                                                };

                                                newSlides[activeSlideIdx].elements.push(newVideoElement);
                                                setSlides(newSlides);
                                                setSelectedIds([newId]);
                                                saveToHistory(newSlides);
                                            };
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                </label>
                            <label className="btn qslide-btn mb-0 d-flex align-items-center justify-content-center" title="Insert Audio"
                                style={{ width: '2rem', padding: '0', border: 'none', height: '2rem', borderRadius: '50px', flexShrink: 0}} 
                                            >
                                    <i className="bi bi-file-music"></i>
                                    <input 
                                        type="file" 
                                        hidden 
                                        accept="audio/*" 
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;

                                            const reader = new FileReader();
                                            reader.onload = (event) => {
                                                const newId = Date.now();
                                                const newSlides = [...slides];
                                                
                                                const newAudioElement = {
                                                    id: newId,
                                                    type: 'audio',
                                                    data: event.target.result,
                                                    x: 100,
                                                    y: 100,
                                                    w: 320,
                                                    h: 54,
                                                    rotate: 0,
                                                    borderColor: '000000',
                                                    borderWidth: 0,
                                                    play: {
                                                        delay: 0, // value in seconds
                                                        mode: 'once' // 'once' or 'loop'
                                                    }
                                                };

                                                newSlides[activeSlideIdx].elements.push(newAudioElement);
                                                setSlides(newSlides);
                                                setSelectedIds([newId]);
                                                saveToHistory(newSlides);
                                            };
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                </label>
                            <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => setShowGrid(!showGrid)} title="Grid"><i className={showGrid ? "bi bi-grid-fill" : "bi bi-grid"}></i></Button>
                            <label 
                                className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                title='Slide Background Color'
                                style={{ 
                                    width: '2rem', 
                                    height: '2rem', 
                                    borderRadius: '50px', 
                                    //border: '2px solid black',
                                    backgroundColor: `#${activeSlide?.background || 'FFFFFF'}`,
                                    position: 'relative',
                                    cursor: 'pointer'
                                }} 
                            >
                                <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(`#${activeSlide?.background || 'FFFFFF'}`) }}></i>
                                <input 
                                    type="color"
                                    hidden 
                                     onChange={(e) => {
                                        const ns = [...slides];
                                        ns[activeSlideIdx].background = e.target.value.replace('#', '');
                                        setSlides(ns);
                                    }}
                                />
                            </label>
                            <div className="vr mx-1" />
                            <Button title="Undo (Ctrl + Z)" variant="qslide-btn" className='qslide-btn' size="sm" disabled={historyIndex <= 0} onClick={() => undo()}><i className='bi bi-arrow-counterclockwise'></i></Button>
                            <Button title="Redo (Ctrl + Y)" variant="qslide-btn" className='qslide-btn' size="sm" disabled={historyIndex >= history.length - 1} onClick={() => redo()}><i className='bi bi-arrow-clockwise'></i></Button>
                            
                            
                            {selectedElement && (
                                <Stack direction="horizontal" gap={2} >
                                    <Button title="Cut (Ctrl+X)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => cutElement()}><i className='bi bi bi-scissors'></i></Button>
                                    <Button title="Copy (Ctrl+C)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => copyElement()}><i className='bi bi-files'></i></Button>
                                    <Button title="Paste (Ctrl+V)" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => pasteElement()}><i className='bi bi-clipboard-fill'></i></Button>
                                    <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => moveZIndex('up')}><i className='bi bi-arrow-up-circle-fill'></i></Button>
                                    <Button variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => moveZIndex('down')}><i className='bi bi-arrow-down-circle-fill'></i></Button>
                                        <div className="d-flex align-items-center gap-2 rounded px-2 border" style={{ width: 'fit-content' }}>
                                            {/* Minus Button: Decrements rotation by 1 or 5 degrees */}
                                            <i 
                                                className="bi bi-dash-circle cursor-pointer text-muted" 
                                                onClick={() => updateSelectedElements( { rotate: Math.max(0, selectedElement.rotate - 5) })}
                                            ></i>

                                            <Form.Range 
                                                style={{ width: '80px' }} 
                                                min="0" 
                                                max="360" 
                                                value={selectedElement.rotate} 
                                                onChange={(e) => updateSelectedElements( { rotate: parseInt(e.target.value) })} 
                                            />

                                            {/* Plus Button: Increments rotation */}
                                            <i 
                                                className="bi bi-plus-circle cursor-pointer text-muted" 
                                                onClick={() => updateSelectedElements( { rotate: Math.min(360, selectedElement.rotate + 5) })}
                                            ></i>
                                            
                                            {/* Optional: Show the degree number */}
                                            <small className="text-muted" style={{ minWidth: '30px' }}>{selectedElement.rotate}°</small>
                                        </div>
                                    
                                    {selectedElement.type === 'text' && (
                                        <>
                                        <ButtonGroup size="sm" className='gap-2' style={{flexShrink:0}}>
                                            <Button className={selectedElement.align === 'left' ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => updateSelectedElements( { align: 'left' })}><i className='bi bi-justify-left'></i></Button>
                                            <Button className={selectedElement.align === 'center' ? "qslide-outline-btn" : "qslide-btn"} onClick={() => updateSelectedElements( { align: 'center' })}><i className='bi bi-justify'></i></Button>
                                            <Button className={selectedElement.align === 'right' ? "qslide-outline-btn" : "qslide-btn"} onClick={() => updateSelectedElements( { align: 'right' })}><i className='bi bi-justify-right'></i></Button>
                                        </ButtonGroup>
                                        </>
                                    )}
                                    {/* --- RICH TEXT FORMATTING --- */}
                                    {(selectedElement.type === 'richtext' || selectedElement.type === 'table') && (
                                        <div className="d-flex align-items-center gap-1 border-end pe-2 me-2">
                                            <ButtonGroup size="sm" className='gap-2'>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Bold (Ctrl + B)' onMouseDown={(e) => handleRichTextCommand(e, 'bold')}><i className='bi bi-type-bold'></i></Button> 
                                                <Button variant="qslide-btn" className="qslide-btn" title='Italics (Ctrl + I)' onMouseDown={(e) => handleRichTextCommand(e, 'italic')}><i className='bi bi-type-italic'></i></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Underline (Ctrl + U)' onMouseDown={(e) => handleRichTextCommand(e, 'underline')}><i className='bi bi-type-underline'></i></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Strikethrough (Ctrl + Shift + X)' onMouseDown={(e) => handleRichTextCommand(e, 'strikethrough')}><i className='bi bi-type-strikethrough'></i></Button>
                                            </ButtonGroup>

                                            <ButtonGroup size="sm" className='gap-2'>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Subscript (Ctrl + ,)' onMouseDown={(e) => handleRichTextCommand(e, 'subscript')}>X<sub>s</sub></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Clear Formatting (Ctrl + \)' onMouseDown={(e) => handleRichTextCommand(e, 'removeFormat')}>X</Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Superscript (Ctrl + .)' onMouseDown={(e) => handleRichTextCommand(e, 'superscript')}>X<sup>s</sup></Button>
                                            </ButtonGroup>

                                            <ButtonGroup size="sm" className='gap-2'>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Align Left (Ctrl + Shift + L)' onMouseDown={(e) => { handleRichTextCommand(e, 'justifyleft'); updateSelectedElements( { align: 'left' });}}><i className='bi bi-justify-left'></i></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Align Center (Ctrl + Shift + E)' onMouseDown={(e) => { handleRichTextCommand(e, 'justifycenter'); updateSelectedElements( { align: 'center' });}}><i className='bi bi-justify'></i></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='Align Right (Ctrl + Shift + R)' onMouseDown={(e) => { handleRichTextCommand(e, 'justifyright'); updateSelectedElements( { align: 'right' });}}><i className='bi bi-justify-right'></i></Button>
                                            </ButtonGroup>

                                            <ButtonGroup size='sm' className='gap-2'>
                                            {/* Decrease Indent Button */}
                                            <Button 
                                            onClick={(e) => handleRichTextCommand(e, 'outdent')} title="Decrease Indent (Ctrl + [)" variant="qslide-btn" className='qslide-btn' size="sm"
                                            >
                                            <i className="bi bi-text-indent-left"></i>
                                            </Button>
                                            
                                            {/* Increase Indent Button */}
                                            <Button onClick={(e) => handleRichTextCommand(e, 'indent')} title="Increase Indent (Ctrl + ])" variant="qslide-btn" className='qslide-btn' size="sm">
                                            <i className="bi bi-text-indent-right"></i>
                                            </Button>
                                            {/* Character Spacing (Letter Spacing) */}
                                            <Button onClick={(e) => handleRichTextCommand(e, 'letterspacing', 2)} title="Character Spacing" variant="qslide-btn" className='qslide-btn' size="sm">
                                            <i className="bi bi-arrows-expand"></i>
                                            </Button>
                                            
                                            {/* Word Spacing */}
                                            <Button onClick={(e) => handleRichTextCommand(e, 'wordspacing', 10)} title="Word Spacing" variant="qslide-btn" className='qslide-btn' size="sm">
                                            <i className="bi bi-distribute-horizontal"></i>
                                            </Button>
                                            
                                            {/* Line Height (Block Level) */}
                                            <Button onClick={(e) => handleRichTextCommand(e,'lineheight', '2')} title="Line Spacing" variant="qslide-btn" className='qslide-btn' size="sm"><i className="bi bi-text-paragraph"></i></Button>
                                            </ButtonGroup>

                                            <ButtonGroup size="sm" className='gap-2'>
                                                <Button variant="qslide-btn" className="qslide-btn" title='' onMouseDown={(e) => handleRichTextCommand(e, 'insertunorderedlist')}><i className='bi bi-list-ul'></i></Button>
                                                <Button variant="qslide-btn" className="qslide-btn" title='' onMouseDown={(e) => handleRichTextCommand(e, 'insertorderedlist')}><i className='bi bi-list-ol'></i></Button>
                                            </ButtonGroup>
                                            <ButtonGroup size="sm" className='gap-2'>   
                                                <Button onClick={handleInsertLink} title="Insert Hyperlink (Ctrl+K)" variant="qslide-btn" className='qslide-btn' size="sm"><i className="bi bi-link"></i></Button>
                                            </ButtonGroup>
                                         
                                            {/* Rich Text Colors */}
                                            <label title="Text Color" className="btn qslide-btn btn-sm mb-0 d-flex align-items-center">
                                                <i className="bi bi-pencil-fill text-white"></i>
                                                <input type="color" hidden onInput={(e) => handleRichTextCommand(null, 'forecolor', e.target.value)} />
                                            </label>
                                            <label title="Highlight Color" className="btn qslide-btn btn-sm mb-0 d-flex align-items-center">
                                                <i className="bi bi-bucket-fill text-warning"></i>
                                                <input type="color" hidden onInput={(e) => handleRichTextCommand(null, 'backcolor', e.target.value)} />
                                            </label>
                                            
                                            {/* Rich Text Font Size */}
                                            <div className="d-flex align-items-center qslide-outline-btn px-1 gap-1 p-0">
                                                <Button 
                                                    variant="qslide-btn" 
                                                    className="p-0 qslide-btn" 
                                                    title='Decrease Font Size (Ctrl + Shift + <)' 
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        const currentSize = parseInt(selectedElement.fontSize) || 16;
                                                        const newSize = Math.max(1, currentSize - 1);
                                                        // Apply natively to the selection
                                                        handleRichTextCommand(null, 'fontsize', newSize + 'px');
                                                        // Sync to element property for the input display
                                                        updateSelectedElements( { fontSize: newSize }, true);
                                                    }}
                                                >
                                                    <i className="bi bi-dash"></i>
                                                </Button>

                                                <Form.Control 
                                                    type="text" 
                                                    size="sm" 
                                                    className="text-center border-0 p-0 qslide-btn"
                                                    style={{ width: '2rem', fontSize: '14px', boxShadow: 'none' }}
                                                    value={selectedElement.fontSize || 16}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        updateSelectedElements( { fontSize: val }, true);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleRichTextCommand(null, 'fontsize', e.target.value + 'px');
                                                            e.target.blur();
                                                        }
                                                    }}
                                                />

                                                <Button 
                                                    variant="qslide-btn" 
                                                    className="p-0 qslide-btn"
                                                    title='Increase Font Size (Ctrl + Shift + >)'
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        const currentSize = parseInt(selectedElement.fontSize) || 16;
                                                        const newSize = currentSize + 1;
                                                        // Apply natively to the selection
                                                        handleRichTextCommand(null, 'fontsize', newSize + 'px');
                                                        // Sync to element property for the input display
                                                        updateSelectedElements( { fontSize: newSize }, true);
                                                    }}
                                                >
                                                    <i className="bi bi-plus"></i>
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                {(selectedElement.type != 'richtext' &&
                                <>
                                {/* BLOCK TEXT COLOR */}
                                <label 
                                    className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                    title='Text Color'
                                    style={{ 
                                        width: '2rem', 
                                        height: '2rem', 
                                        borderRadius: '50px', 
                                        backgroundColor: `#${selectedElement.type === 'text' ? selectedElement.color : selectedElement.fill}`,
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }} 
                                >
                                    <i className="bi bi-pencil-fill" style={{ color: getContrastYIQ(`#${selectedElement.type === 'text' ? selectedElement.color : selectedElement.fill}`) }}></i>
                                    <input 
                                        type="color"
                                        hidden 
                                        onChange={(e) => {
                                            const changes = selectedElement.type === 'text' 
                                                ? { color: e.target.value.replace('#', '') } 
                                                : { fill: e.target.value.replace('#', '') };
                                            updateSelectedElements(changes); // Clean and simple
                                        }}
                                    />
                                </label>
                                {/* BLOCK TEXT BACKGROUND COLOR */}
                                <label 
                                    className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                    title='Text Background Color'
                                    style={{ 
                                        width: '2rem', 
                                        height: '2rem', 
                                        borderRadius: '50px', 
                                        backgroundColor: `#${selectedElement.fill === 'none' ? 'FFFFFF' : selectedElement.fill}`,
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }} 
                                >
                                    <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(`#${selectedElement.fill === 'none' ? 'FFFFFF' : selectedElement.fill}`) }}></i>
                                    <input 
                                        type="color"
                                        hidden 
                                        onChange={(e) => updateSelectedElements({ fill: e.target.value.replace('#', '') })}
                                    />
                                </label>
                                </>
                            )}
                            {/* BLOCK MARGIN COLOR */}
                                <label 
                                    className="btn btn-light rounded-circle mb-0 d-flex align-items-center justify-content-center"
                                    title='Margin Color'
                                    style={{ 
                                        width: '2rem', 
                                        height: '2rem', 
                                        borderRadius: '50px', 
                                        backgroundColor: `#${selectedElement.borderColor}`,
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }} 
                                >
                                    <i className="bi bi-border-all" style={{ color: getContrastYIQ(`#${selectedElement.borderColor}`) }}></i>
                                    <input 
                                        type="color"
                                        hidden 
                                        onChange={(e) => updateSelectedElements({ borderColor: e.target.value.replace('#', '') })}
                                    />
                                </label>
                                <Form.Control type="number" size="sm" value={selectedElement.borderWidth} onChange={(e) => updateSelectedElements( { borderWidth: parseInt(e.target.value) })} style={{ width: '3rem' }} />

                                <Button title="📐 Scale preserve aspect ratio (Shift Drag)" variant={isShiftPressed ? "qslide-outline-btn" : "qslide-btn"} className={isShiftPressed ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => setIsShiftPressed(!isShiftPressed)}>
                                    <i className='bi bi-aspect-ratio-fill'></i> 
                                </Button>
                                <Button title="Scale around center (Ctrl Drag)" variant={isControlPressed ? "qslide-outline-btn" : "qslide-btn"} className={isControlPressed ? "qslide-outline-btn" : "qslide-btn"} size="sm" onClick={() => setIsControlPressed(!isControlPressed)}>
                                    <i className='bi bi-arrows-fullscreen'></i>
                                </Button>
                                <Button title="Delete element" variant="qslide-btn" className='qslide-btn' size="sm" onClick={() => { 
                                    setSlides(slides.map((s, i) => i === activeSlideIdx ? { 
                                        ...s, 
                                        elements: s.elements.filter(e => !selectedIds.includes(e.id)) // Exclude all selected IDs
                                    } : s)); 
                                    setSelectedIds([]); // Clear the array
                                }}>
                                    <i className='bi bi-trash'></i>
                                </Button>
                                </Stack>
                            )}
                        </div>
                    

                    <div className="d-flex flex-grow-1 overflow-scroll"
                    style={{
                        whiteSpace: 'nowrap',
                          msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                          scrollbarWidth: 'none',   /* Firefox */
                          WebkitOverflowScrolling: 'touch'
                    }}>
                        <div className="border-end bg-transparent p-2" style={{ width: '8rem', maxHeight:'73vh', overflow: 'scroll', flexShrink:0,whiteSpace: 'nowrap',
                        msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                        scrollbarWidth: 'none',   /* Firefox */
                        WebkitOverflowScrolling: 'touch'
                        }}>
                            {slides.map((s, idx) => (
                                <div 
                                    key={idx} 
                                    className="position-relative mb-2"
                                    // --- DRAG & DROP ATTRIBUTES ---
                                    draggable
                                    onDragStart={() => setDraggedIdx(idx)}
                                    onDragOver={(e) => e.preventDefault()} // Necessary to allow dropping
                                    onDrop={() => {
                                        if (draggedIdx === null || draggedIdx === idx) return;
                                        
                                        // 1. Reorder the slides array
                                        const reorderedSlides = [...slides];
                                        const [movedSlide] = reorderedSlides.splice(draggedIdx, 1);
                                        reorderedSlides.splice(idx, 0, movedSlide);
                                        
                                        setSlides(reorderedSlides);
                                        saveToHistory(reorderedSlides);

                                        // 2. Adjust active slide index seamlessly so selection tracks the slide
                                        if (activeSlideIdx === draggedIdx) {
                                            setActiveSlideIdx(idx);
                                        } else if (activeSlideIdx > draggedIdx && activeSlideIdx <= idx) {
                                            setActiveSlideIdx(activeSlideIdx - 1);
                                        } else if (activeSlideIdx < draggedIdx && activeSlideIdx >= idx) {
                                            setActiveSlideIdx(activeSlideIdx + 1);
                                        }

                                        setDraggedIdx(null); // Reset drag state
                                    }}
                                    style={{ cursor: 'grab' }}
                                >
                                    <Card 
                                        onClick={() => setActiveSlideIdx(idx)}
                                        title={s.title}
                                        className={`p-1 cursor-pointer ${activeSlideIdx === idx ? 'qslide-outline-btn' : ''}`}
                                        style={{ aspectRatio: '16/9', backgroundColor: `#${s.background}` }}
                                    >
                                        Slide {idx + 1}
                                    </Card>   
                                    {/* SLIDE DELETE BUTTON */}
                                    {slides.length > 1 && (
                                        <Button 
                                            variant="danger" 
                                            size="sm" 
                                            className="position-absolute top-0 end-0 p-0" 
                                            style={{ width: '1.5rem', height: '1.5rem' }} 
                                            onClick={() => {
                                                const newSlides = slides.filter((_, i) => i !== idx);
                                                setSlides(newSlides);
                                                saveToHistory(newSlides);
                                                // Reset active index safe guard if current active is deleted
                                                if (activeSlideIdx >= newSlides.length) {
                                                    setActiveSlideIdx(newSlides.length - 1);
                                                }
                                            }}
                                        >
                                            ×
                                        </Button>
                                    )}
                                </div>
                            ))}
                            <Button variant="qslide-btn" size="sm" className="qslide-btn w-100" onClick={() => {
                                const newSlides = [...slides, { title: "New Slide", background: 'FFFFFF', elements: [] }];
                                setSlides(newSlides);
                                saveToHistory(newSlides);
                            }}>+ New Slide</Button>
                        </div>

                        <div ref={containerRef} // This measures the available space!
                        className={`flex-grow-1 d-flex justify-content-center align-items-center p-3 bg-secondary`}
                             onClick={() => setActiveSlideIdx((prev) => (prev + 1) % slides.length)}>
                            
                            <div ref={stageRef} 
                            style={{
                                width: `${slideDim.w}px`,
                                height: `${slideDim.h}px`,
                                transform: `scale(${zoom})`, // The Magic Shrink/Grow!
                                transformOrigin: 'center center',
                                backgroundColor: `#${activeSlide?.background || 'FFFFFF'}`, 
                                position: 'relative',
                                backgroundImage: showGrid ? 'radial-gradient(#ccc 1px, transparent 1px)' : 'none', 
                                backgroundSize: '20px 20px',
                                boxShadow: '0 5px 25px rgba(0,0,0,0.3)',
                                cursor: isDrawMode ? 'crosshair' : 'default'
                            }}
                            onClick={(e) => e.stopPropagation()}
                            // --- REVISED MOUSE EVENTS ---
                            onMouseDown={(e) => {
                                if (isDrawMode) handleDrawStart(e.clientX, e.clientY);
                                else setSelectedIds([]); // Clear selections when clicking empty space
                            }}
                            onMouseMove={(e) => {
                                if (isDrawMode) handleDrawMove(e.clientX, e.clientY);
                                else handleConnectorMove(e.clientX, e.clientY);
                            }}
                            onMouseUp={(e) => {
                                if (isDrawMode) handleDrawEnd();
                                else handleConnectorEnd(e.clientX, e.clientY);
                            }}
                            // --- REVISED TOUCH EVENTS ---
                            onTouchStart={(e) => {
                                if (isDrawMode) {
                                    const touch = e.touches[0];
                                    handleDrawStart(touch.clientX, touch.clientY);
                                }
                            }}
                            onTouchMove={(e) => {
                                if (draggingConnectorId || isDrawMode) e.preventDefault(); 
                                const touch = e.touches[0];
                                if (isDrawMode) handleDrawMove(touch.clientX, touch.clientY);
                                else handleConnectorMove(touch.clientX, touch.clientY);
                            }}
                            onTouchEnd={(e) => {
                                if (isDrawMode) handleDrawEnd();
                                else {
                                    const touch = e.changedTouches[0];
                                    handleConnectorEnd(touch.clientX, touch.clientY);
                                }
                            }}
                            >

                                {/* The SVG container MUST have pointerEvents: 'none' so you can click the shapes behind it */}
                                <svg style={{ 
                                    position: 'absolute', 
                                    inset: 0, 
                                    width: '100%', 
                                    height: '100%', 
                                    pointerEvents: 'none', // Critical: allows clicking through to stage
                                    zIndex: 1,
                                    overflow: 'visible' 
                                }}>
                                    {/* Define the Arrowhead Marker once */}
                                    <defs>
                                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                            <polygon points="0 0, 10 3.5, 0 7" fill="#000000" />
                                        </marker>
                                    </defs>

                                    {activeSlide?.elements.filter(el => el.type === 'connector').map(conn => {
                                        const pts = getDynamicConnection(conn);
                                        if (!pts) return null;
                                        
                                        // Ensure 'side' is passed into the generator
                                        const pathData = getMindMapPath(pts, conn.shapeType);
                                        const isSelected = selectedIds.includes(conn.id);

                                        return (
                                            <g key={conn.id}>
                                                {/* INVISIBLE THICK PATH: Makes it much easier to click the line */}
                                                <path 
                                                    d={pathData} 
                                                    fill="none" 
                                                    stroke="transparent" 
                                                    strokeWidth="15" 
                                                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                                    onMouseDown={(e) => { e.stopPropagation(); setSelectedIds([conn.id]); }}
                                                    onTouchStart={(e) => { e.stopPropagation(); setSelectedIds([conn.id]); }}
                                                />
                                                
                                                {/* VISIBLE PATH */}
                                                <path 
                                                    d={pathData} 
                                                    fill="none" 
                                                    stroke={isSelected ? '#0078D4' : `#${conn.borderColor || '000000'}`} 
                                                    strokeWidth={conn.borderWidth || 2} 
                                                    markerEnd="url(#arrowhead)"
                                                    style={{ pointerEvents: 'none' }} // Let the thick path handle clicks
                                                />

                                                {/* HANDLE: Only visible when selected */}
                                                {/* HANDLE: Only visible when selected */}
                                                {isSelected && (
                                                <circle 
                                                cx={pts.x2} cy={pts.y2} r={8} 
                                                fill="white" stroke="#0078D4" strokeWidth={2}
                                                style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    setDraggingConnectorId(conn.id); // Ensure this state is still being set!
                                                }}
                                                onTouchStart={(e) => {
                                                    e.stopPropagation();
                                                    setDraggingConnectorId(conn.id);
                                                }}
                                                />
                                                )}
                                            </g>
                                        );
                                    })}
                                    {/* --- SAVED DRAWINGS LAYER --- */}
                                    {activeSlide?.elements.filter(el => el.type === 'drawing').map(draw => (
                                        <path
                                            key={draw.id}
                                            d={draw.pathData}
                                            fill="none"
                                            stroke={`#${draw.borderColor || 'FF0000'}`}
                                            strokeWidth={draw.borderWidth || 4}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ pointerEvents: 'none' }} // Lets click-actions pass through to standard elements
                                        />
                                    ))}

                                    {/* --- ACTIVE REAL-TIME PATH DRAWING LAYER --- */}
                                    {currentDrawingPath && (
                                        <path
                                            d={currentDrawingPath}
                                            fill="none"
                                            stroke={`#${drawColor}`}
                                            strokeWidth={drawSize}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ pointerEvents: 'none' }}
                                        />
                                    )}
                                </svg>
                                
                                <input className="h4 border-0 w-100 text-center mt-2 bg-transparent" value={activeSlide?.title || ""}
                                    onChange={(e) => { const ns = [...slides]; ns[activeSlideIdx].title = e.target.value; setSlides(ns); }} 
                                    style={{ outline: 'none' }} />

                                {/* Filter OUT connectors so they don't get Rnd boxes */}
                                {activeSlide?.elements.filter(el => el.type !== 'connector').map((el) => (
                                    <Rnd
    key={el.id}
    dragHandleClassName={el.type === 'richtext' ? 'move-handle' : 'rnd-drag-any'}
    // Use el.w/el.h if they exist, otherwise fallback to prevent "invisible" components
    size={{ width: el.w || 100, height: el.h || 100 }}
    position={{ x: el.x || 0, y: el.y || 0 }}
    scale={zoom}
    lockAspectRatio={isShiftPressed}
    disableDragging={el.isLocked || false}
    enableResizing={(!el.isLocked && selectedIds.includes(el.id)) ? { 
        top: true, right: true, bottom: true, left: true,
        topLeft: true, topRight: true, bottomLeft: true, bottomRight: true
    } : false}
    
    // Changed selection logic to use the new handler
    onDragStart={(e) => {
        if (el.isLocked) return e.preventDefault();
        handleElementSelect(e, el.id);
    }}
    onResizeStart={(e) => {
        if (el.isLocked) return e.preventDefault();
        handleElementSelect(e, el.id);
    }}
    onMouseDown={(e) => {
        if (el.isLocked) return;
        handleElementSelect(e, el.id);
    }}

    onDragStop={(e, d) => {
        // Calculate the raw delta of the dragged item
        let finalX = d.x;
        let finalY = d.y;
        
        // Snapping logic only applies if a single item is dragged
        if (showGrid) {
            finalX = Math.round(finalX / 20) * 20;
            finalY = Math.round(finalY / 20) * 20;
        } else if (selectedIds.length === 1) { 
            const snapped = getSnappedPos(el.id, d.x, d.y, el.w, el.h);
            finalX = snapped.x;
            finalY = snapped.y;
        }

        // Calculate corrected delta after snapping
        const correctedDeltaX = finalX - (el.x || 0);
        const correctedDeltaY = finalY - (el.y || 0);

        // Apply this delta shift to ALL selected items together
        const newSlides = [...slides];
        newSlides[activeSlideIdx].elements = newSlides[activeSlideIdx].elements.map(item => {
            if (selectedIds.includes(item.id)) {
                return { 
                    ...item, 
                    x: (item.x || 0) + correctedDeltaX, 
                    y: (item.y || 0) + correctedDeltaY 
                };
            }
            return item;
        });

        setSlides(newSlides);
        saveToHistory(newSlides);
    }}

    onResizeStop={(e, dir, ref, delta, pos) => {
        let finalW = parseInt(ref.style.width);
        let finalH = parseInt(ref.style.height);
        let finalX = pos.x;
        let finalY = pos.y;

        // --- Precise Center Scaling Math ---
        if (isControlPressed) {
            // We calculate how much the user expanded one side (delta)
            // and apply that same growth to the opposite side.
            const dw = delta.width;
            const dh = delta.height;

            // If we pull the Right handle, Rnd keeps X static. 
            // We must shift X left to simulate center growth.
            if (dir.includes("Right")) finalX = el.x - dw;
            if (dir.includes("Left")) finalX = pos.x; // Rnd already shifted X

            if (dir.includes("bottom")) finalY = el.y - dh;
            if (dir.includes("top")) finalY = pos.y; // Rnd already shifted Y

            finalW = el.w + dw * 2;
            finalH = el.h + dh * 2;
        }

        updateElement(el.id, { 
            w: finalW, 
            h: finalH, 
            x: finalX, 
            y: finalY 
        });
        saveToHistory(slides);
    }}

    resizeHandleComponent={{
        top: <CustomResizeHandle side="top" />,
        right: <CustomResizeHandle side="right" />,
        bottom: <CustomResizeHandle side="bottom" />,
        left: <CustomResizeHandle side="left" />,
        topLeft: <CustomResizeHandle side="topLeft" />,
        topRight: <CustomResizeHandle side="topRight" />,
        bottomLeft: <CustomResizeHandle side="bottomLeft" />,
        bottomRight: <CustomResizeHandle side="bottomRight" />,
    }}
>
    {/* Use a fallback for rotation to prevent CSS breaking if el.rotate is null */}
    {/* 1. OUTER WRAPPER: Handles Spacing, Opacity, and Animations */}
                            <div 
                                className={el.type !== 'richtext' ? 'rnd-drag-any' : ''}
                                style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    pointerEvents: el.isLocked ? 'none' : 'auto',
                                    boxSizing: 'border-box', // Crucial so padding pushes inward, not outward
                                    opacity: el.opacity !== undefined ? el.opacity : 1,
                                    marginTop: `${el.marginTop || 0}${el.marginUnit || 'px'}`,
                                    marginBottom: `${el.marginBottom || 0}${el.marginUnit || 'px'}`,
                                    marginLeft: `${el.marginLeft || 0}${el.marginUnit || 'px'}`,
                                    marginRight: `${el.marginRight || 0}${el.marginUnit || 'px'}`,
                                    paddingTop: `${el.paddingTop || 0}${el.paddingUnit || 'px'}`,
                                    paddingBottom: `${el.paddingBottom || 0}${el.paddingUnit || 'px'}`,
                                    paddingLeft: `${el.paddingLeft || 0}${el.paddingUnit || 'px'}`,
                                    paddingRight: `${el.paddingRight || 0}${el.paddingUnit || 'px'}`,
                                    animation: (el.animationEffect && el.animationEffect !== 'none') 
                                        ? `${el.animationEffect} ${el.animationDuration || 1}s ease-in-out both` 
                                        : 'none'
                                }}
                            >
                                {/* 2. INNER WRAPPER: Isolates Rotation to prevent layout collapsing */}
                                <div style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    transform: `rotate(${el.rotate || 0}deg)`, 
                                    outline: (selectedId === el.id) ? '2px solid #0078D4' : 'none' 
                                }}>
                                    
                                    {/* 3. CONTENT WRAPPER: Holds the actual elements */}
                                    <div 
                                        className={el.type !== 'richtext' ? 'rnd-drag-any' : ''}
                                        style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}
                                    >
                                        {el.type === 'text' && (
                                            <textarea className="w-100 h-100 p-1" 
                                                style={{ 
                                                    color: `#${el.color || '000'}`, fontSize: `${el.fontSize || 16}px`, fontFamily: el.fontFace || 'Arial', textAlign: el.align || 'center', resize: 'none', border: `${el.borderWidth || 0}px solid #${el.borderColor || '000'}`, backgroundColor: el.fill === 'none' ? 'transparent' : `#${el.fill || 'fff'}` 
                                                }}
                                                value={el.text} 
                                                onChange={(e) => updateElement(el.id, { text: e.target.value })}
                                                onBlur={() => saveToHistory(slides)} 
                                                onMouseDown={(e) => {
                                                    e.stopPropagation(); // CRITICAL: Stops Rnd from stealing the mouse click
                                                    if (!selectedIds.includes(el.id)) handleElementSelect(e, el.id); // Select element to show handles
                                                }}
                                                onKeyDown={(e) => {
                                                    // Native Tab Space Insertion
                                                    if (e.key === 'Tab') {
                                                        e.preventDefault();
                                                        const start = e.target.selectionStart;
                                                        const end = e.target.selectionEnd;
                                                        const val = e.target.value;
                                                        updateElement(el.id, { text: val.substring(0, start) + "    " + val.substring(end) });
                                                        setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 4; }, 0);
                                                    }
                                                }}
                                            />
                                        )}
                                        {el.type === 'richtext' && (
                                            <div 
                                                id={`richtext-${el.id}`}
                                                className="w-100 h-100 p-2 text-editor-content" 
                                                style={{ 
                                                    border: `${el.borderWidth || 0}px solid #${el.borderColor || '000'}`, 
                                                    backgroundColor: el.fill === 'none' ? 'transparent' : `#${el.fill || 'fff'}`, 
                                                    overflow: el.overflowType || 'auto',
                                                    outline: 'none', 
                                                    userSelect: 'text', 
                                                    cursor: 'text',
                                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                    color: 'initial' // Remove if this causes trouble
                                                }}
                                                contentEditable={!isSlideshow}
                                                suppressContentEditableWarning={true}
                                                dangerouslySetInnerHTML={{ __html: el.text }}
                                                
                                                onMouseDown={(e) => {
                                                    e.stopPropagation(); // CRITICAL: Stops Rnd from stealing focus!
                                                    if (!selectedIds.includes(el.id)) {
                                                        handleElementSelect(e, el.id); // Triggers resize handles to appear
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Tab') {
                                                        e.preventDefault();
                                                        handleRichTextCommand(e,'insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    updateElement(el.id, { text: e.target.innerHTML });
                                                    saveToHistory(slides);
                                                }}
                                            />
                                        )}
                                        {el.type === 'shape' && renderShape(el)}
                                        {el.type === 'image' && <img src={el.data} className="w-100 h-100" style={{ objectFit: 'fill', border: `${el.borderWidth}px solid #${el.borderColor}` }} draggable="false" alt="" />}
                                        {el.type === 'line' && <div className="w-100 position-absolute" style={{ height: `${el.borderWidth}px`, backgroundColor: `#${el.borderColor}`, top: '50%', transform: 'translateY(-50%)'}} />}
                                        {el.type === 'table' && (
                                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                <table 
                                                    className="table m-0 h-100 w-100 bg-white" 
                                                    style={{ 
                                                        borderCollapse: 'collapse', 
                                                        border: `${el.borderWidth || 1}px solid #${el.borderColor || '000000'}`, 
                                                        fontSize: `${el.fontSize || 14}px` 
                                                    }}
                                                >
                                                    <tbody>
                                                        {el.tableData.map((row, rIdx) => (
                                                            <tr key={rIdx}>
                                                                {row.map((cell, cIdx) => (
                                                                    <td 
                                                                        key={cIdx} 
                                                                        style={{ 
                                                                            border: `${el.borderWidth || 1}px solid #${el.borderColor || 'cccccc'}`, 
                                                                            padding: '4px',
                                                                            verticalAlign: 'top',
                                                                            backgroundColor: el.fill === 'none' ? 'transparent' : `#${el.fill || 'ffffff'}`
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{ 
                                                                                width: '100%', minHeight: '20px', 
                                                                                outline: 'none', cursor: 'text',
                                                                                wordBreak: 'break-word', whiteSpace: 'pre-wrap'
                                                                            }}
                                                                            contentEditable={!isSlideshow}
                                                                            suppressContentEditableWarning={true}
                                                                            dangerouslySetInnerHTML={{ __html: cell || "" }}
                                                                            onMouseDown={(e) => {
                                                                                e.stopPropagation();
                                                                                if (!selectedIds.includes(el.id)) handleElementSelect(e, el.id);
                                                                            }}
                                                                            onBlur={(e) => {
                                                                                const newData = JSON.parse(JSON.stringify(el.tableData));
                                                                                newData[rIdx][cIdx] = e.target.innerHTML;
                                                                                updateElement(el.id, { tableData: newData });
                                                                                saveToHistory(slides);
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Tab') {
                                                                                    e.preventDefault();
                                                                                    handleRichTextCommand(e,'insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
                                                                                }
                                                                            }}
                                                                        />
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {/* Dynamic Table Controls: Only visible when selected */}
                                                {selectedIds.includes(el.id) && !isSlideshow && (
                                                    <div 
                                                        className="d-flex gap-1 position-absolute shadow-sm rounded bg-white border p-1"
                                                        style={{ top: '-45px', left: '0', zIndex: 50 }}
                                                        onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking buttons
                                                    >
                                                        {/* Row Controls */}
                                                        <ButtonGroup size="sm">
                                                            <Button variant="light" title="Add Row Above" onClick={() => modifyTable(el.id, 'addRow', -1)}><i className="bi bi-arrow-bar-up"></i></Button>
                                                            <Button variant="light" title="Add Row Below" onClick={() => modifyTable(el.id, 'addRow', 1)}><i className="bi bi-arrow-bar-down"></i></Button>
                                                            <Button variant="danger" title="Delete Last Row" onClick={() => modifyTable(el.id, 'delRow')} disabled={el.tableData.length <= 1}><i className="bi bi-dash"></i> Row</Button>
                                                        </ButtonGroup>
                                                        
                                                        {/* Column Controls */}
                                                        <ButtonGroup size="sm">
                                                            <Button variant="light" title="Add Column Left" onClick={() => modifyTable(el.id, 'addCol', -1)}><i className="bi bi-arrow-bar-left"></i></Button>
                                                            <Button variant="light" title="Add Column Right" onClick={() => modifyTable(el.id, 'addCol', 1)}><i className="bi bi-arrow-bar-right"></i></Button>
                                                            <Button variant="danger" title="Delete Last Column" onClick={() => modifyTable(el.id, 'delCol')} disabled={el.tableData[0].length <= 1}><i className="bi bi-dash"></i> Col</Button>
                                                        </ButtonGroup>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {el.type === 'chart' && (
                                            <div style={{ width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
                                                <MultiChartGen chartsDataArray={[el.chartConfig]} />
                                            </div>
                                        )}
                                        {el.type === 'video' && (
                                            <video 
                                                src={el.data} 
                                                controls 
                                                muted
                                                style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} 
                                            />
                                        )}

                                        {el.type === 'audio' && (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#f1f3f4', padding: '4px', borderRadius: '4px' }}>
                                                <audio 
                                                    src={el.data} 
                                                    controls 
                                                    style={{ width: '100%' }} 
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 4. MENU UI: Placed outside the rotation div so the buttons stay perfectly upright! */}
                                {selectedIds.includes(el.id) && (
                                    <div
                                        className={el.type !== 'richtext' ? 'rnd-drag-any' : ''}
                                        style={{ 
                                            position: 'absolute', 
                                            top: '-40px', 
                                            left: '50%', 
                                            transform: 'translateX(-50%)', 
                                            zIndex: 10,
                                            pointerEvents: 'auto' 
                                        }}>
                                        <div className="btn-group shadow-sm gap-2">
                                            <Button size="sm" variant="qslide-btn" className='qslide-btn' onClick={() => moveZIndex('down')} title="Move Down (Ctrl+Down)">
                                                <i className='bi bi-arrow-down-circle-fill'></i>
                                            </Button>
                                            <Button size="sm" variant="qslide-btn" className="move-handle cursor-move qslide-btn" title="Drag to Move">
                                                <i className="bi bi-arrows-move"></i>
                                            </Button>
                                            <Button size="sm" variant="qslide-btn" className='qslide-btn' onClick={(e) => {moveZIndex('up'); e.preventDefault()}} title="Move Up (Ctrl+Up)">
                                                <i className='bi bi-arrow-up-circle-fill'></i>
                                            </Button>
                                            {el.type === 'chart' && (
                                                <Button size="sm" variant="qslide-btn" className='qslide-btn' onClick={() => handleEditChart(el)} title="Edit Chart">
                                                    <i className='bi bi-pie-chart-fill'><sup><i className='bi bi-pencil'></i></sup></i>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Rnd>
                                ))}
                            </div>
                        </div>
                        {/* PROPERTIES MENU DIV */}
                        <div className="border-start bg-transparent p-2" style={{ width: '18rem', maxHeight:'85vh', overflowY: 'auto', flexShrink:0, msOverflowStyle: 'none', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
    {selectedElement ? (
        <div className="d-flex flex-column gap-3 text-wrap" style={{ whiteSpace: 'normal' }}>
            <h6 className="fw-bold mb-0 text-muted border-bottom pb-2"><i className="bi bi-sliders"></i> Element Properties</h6>
            {selectedElement.isLocked && (
                <div className="alert alert-danger p-2 mb-0 text-center small fw-bold shadow-sm">
                    <i className="bi bi-lock-fill me-1"></i> Element is Locked
                    <Button variant="dark" size="sm" className="d-block w-100 mt-2" onClick={() => updateSelectedElements({ isLocked: false })}>
                        Unlock to Edit Position
                    </Button>
                </div>
            )}
            {selectedElement.type === 'richtext' && (
                <div className="border p-2 rounded bg-light bg-opacity-50 mb-3">
                    <small className="fw-bold d-block mb-1">Text Overflow</small>
                    <Form.Select size="sm" value={selectedElement.overflowType || 'auto'} onChange={(e) => updateSelectedElements({ overflowType: e.target.value })}>
                        <option value="auto">Scrollable (Auto)</option>
                        <option value="visible">Wrap / Visible</option>
                        <option value="hidden">Clip / Hidden</option>
                    </Form.Select>
                </div>
            )}
            {/* Position & Rotate */}
            <div className="border p-2 rounded bg-light bg-opacity-50">
                <small className="fw-bold d-block mb-1">Position & Rotation</small>
                <div className="d-flex flex-column gap-2 mb-2">
                    <div className="d-flex gap-2">
                        <InputGroup size="sm">
                            <InputGroup.Text>X</InputGroup.Text>
                            <Form.Control type="number" value={Math.round(selectedElement.x || 0)} onChange={(e) => updateSelectedElements({ x: parseFloat(e.target.value) })} />
                        </InputGroup>
                        <InputGroup size="sm">
                            <InputGroup.Text>Y</InputGroup.Text>
                            <Form.Control type="number" value={Math.round(selectedElement.y || 0)} onChange={(e) => updateSelectedElements({ y: parseFloat(e.target.value) })} />
                        </InputGroup>
                    </div>
                    <div className="d-flex gap-2">
                        <InputGroup size="sm">
                            <InputGroup.Text>W</InputGroup.Text>
                            <Form.Control type="number" value={Math.round(selectedElement.w || 0)} onChange={(e) => updateSelectedElements({ w: parseFloat(e.target.value) })} />
                        </InputGroup>
                        <InputGroup size="sm">
                            <InputGroup.Text>H</InputGroup.Text>
                            <Form.Control type="number" value={Math.round(selectedElement.h || 0)} onChange={(e) => updateSelectedElements({ h: parseFloat(e.target.value) })} />
                        </InputGroup>
                    </div>
                </div>
                <div className="d-flex align-items-center gap-2 rounded px-2 border bg-white">
                    <i className="bi bi-dash-circle cursor-pointer text-muted" onClick={() => updateSelectedElements({ rotate: Math.max(0, (selectedElement.rotate||0) - 5) })}></i>
                    <Form.Range min="0" max="360" value={selectedElement.rotate || 0} onChange={(e) => updateSelectedElements({ rotate: parseInt(e.target.value) })} />
                    <i className="bi bi-plus-circle cursor-pointer text-muted" onClick={() => updateSelectedElements({ rotate: Math.min(360, (selectedElement.rotate||0) + 5) })}></i>
                    <small className="text-muted" style={{ minWidth: '35px' }}>{selectedElement.rotate || 0}°</small>
                </div>
            </div>

            {/* Z-Index */}
            <div className="border p-2 rounded bg-light bg-opacity-50">
                <small className="fw-bold d-block mb-1">Z-Index Layer</small>
                <div className="d-flex justify-content-between align-items-center mt-1">
                    <Button variant="outline-secondary" size="sm" onClick={() => moveZIndex('down')} disabled={selectedIds.length !== 1}><i className="bi bi-layer-backward"></i> Back</Button>
                    <span className="small text-muted fw-bold">Layer {slides[activeSlideIdx].elements.findIndex(el => el.id === selectedElement.id) + 1}</span>
                    <Button variant="outline-secondary" size="sm" onClick={() => moveZIndex('up')} disabled={selectedIds.length !== 1}><i className="bi bi-layer-forward"></i> Front</Button>
                </div>
            </div>

            {/* Opacity */}
            <div className="border p-2 rounded bg-light bg-opacity-50">
                <small className="fw-bold d-block mb-1">Opacity: {Math.round((selectedElement.opacity !== undefined ? selectedElement.opacity : 1) * 100)}%</small>
                <Form.Range min="0" max="1" step="0.1" value={selectedElement.opacity !== undefined ? selectedElement.opacity : 1} onChange={(e) => updateSelectedElements({ opacity: parseFloat(e.target.value) })} />
            </div>

            {/* Margin */}
            <div className="border p-2 rounded bg-light bg-opacity-50">
                <div className="d-flex justify-content-between mb-1">
                    <small className="fw-bold">Margin</small>
                    <Form.Select size="sm" style={{ width: '60px', padding: '0 5px' }} value={selectedElement.marginUnit || 'px'} onChange={(e) => updateSelectedElements({ marginUnit: e.target.value })}>
                        <option value="px">px</option><option value="%">%</option>
                    </Form.Select>
                </div>
                <Row className="g-1 text-center small">
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Top" value={selectedElement.marginTop || 0} onChange={(e) => updateSelectedElements({ marginTop: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Top</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Bottom" value={selectedElement.marginBottom || 0} onChange={(e) => updateSelectedElements({ marginBottom: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Bottom</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Left" value={selectedElement.marginLeft || 0} onChange={(e) => updateSelectedElements({ marginLeft: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Left</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Right" value={selectedElement.marginRight || 0} onChange={(e) => updateSelectedElements({ marginRight: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Right</span></Col>
                </Row>
            </div>

            {/* Padding */}
            <div className="border p-2 rounded bg-light bg-opacity-50">
                <div className="d-flex justify-content-between mb-1">
                    <small className="fw-bold">Padding</small>
                    <Form.Select size="sm" style={{ width: '60px', padding: '0 5px' }} value={selectedElement.paddingUnit || 'px'} onChange={(e) => updateSelectedElements({ paddingUnit: e.target.value })}>
                        <option value="px">px</option><option value="%">%</option>
                    </Form.Select>
                </div>
                <Row className="g-1 text-center small">
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Top" value={selectedElement.paddingTop || 0} onChange={(e) => updateSelectedElements({ paddingTop: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Top</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Bottom" value={selectedElement.paddingBottom || 0} onChange={(e) => updateSelectedElements({ paddingBottom: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Bottom</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Left" value={selectedElement.paddingLeft || 0} onChange={(e) => updateSelectedElements({ paddingLeft: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Left</span></Col>
                    <Col xs={6}><Form.Control size="sm" type="number" placeholder="Right" value={selectedElement.paddingRight || 0} onChange={(e) => updateSelectedElements({ paddingRight: parseFloat(e.target.value) })} /><span className="text-muted" style={{fontSize:'10px'}}>Right</span></Col>
                </Row>
            </div>

            {(selectedElement.type === 'video' || selectedElement.type === 'audio') && (
                <Stack direction="horizontal" gap={3} className="p-2 bg-light border-bottom align-items-center">
                    <Form.Group className="d-flex align-items-center gap-2 mb-0">
                        <Form.Label className="small text-nowrap mb-0">Play Delay (s):</Form.Label>
                        <Form.Control 
                            type="number" 
                            size="sm" 
                            style={{ width: '70px' }}
                            value={selectedElement.play?.delay || 0}
                            onChange={(e) => updateElement(selectedElement.id, {
                                play: { ...selectedElement.play, delay: parseFloat(e.target.value) || 0 }
                            })}
                        />
                    </Form.Group>

                    <Form.Group className="d-flex align-items-center gap-2 mb-0">
                        <Form.Label className="small text-nowrap mb-0">Playback Mode:</Form.Label>
                        <Form.Select 
                            size="sm"
                            value={selectedElement.play?.mode || 'once'}
                            onChange={(e) => updateElement(selectedElement.id, {
                                play: { ...selectedElement.play, mode: e.target.value }
                            })}
                        >
                            <option value="once">Play Once</option>
                            <option value="loop">Loop Playback</option>
                        </Form.Select>
                    </Form.Group>
                </Stack>
            )}

            {/* Animation */}
            <div className="border p-2 rounded bg-light bg-opacity-50 mb-3">
                <small className="fw-bold d-block mb-1">Entry Animation</small>
                <Form.Select size="sm" className="mb-2" value={selectedElement.animationEffect || 'none'} onChange={(e) => updateSelectedElements({ animationEffect: e.target.value })}>
                    <option value="none">None</option>
                    <option value="fade-in">Fade In</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="zoom-in">Zoom In</option>
                    <option value="bounce">Bounce</option>
                </Form.Select>
                <InputGroup size="sm">
                    <InputGroup.Text>Duration</InputGroup.Text>
                    <Form.Control type="number" step="0.1" value={selectedElement.animationDuration || 1} onChange={(e) => updateSelectedElements({ animationDuration: parseFloat(e.target.value) })} />
                    <InputGroup.Text>sec</InputGroup.Text>
                </InputGroup>
            </div>

        </div>
    ) : (
    <div className="d-flex flex-column gap-2 text-wrap" style={{ whiteSpace: 'normal' }}>
        <h6 className="fw-bold mb-0 text-muted border-bottom pb-2">
            <i className="bi bi-layers"></i> Slide Elements
        </h6>
        
        {/* We map the elements array in reverse so the highest Z-Index appears at the top! */}
        <div className="d-flex flex-column-reverse gap-1"> 
            {slides[activeSlideIdx].elements.map((el, index) => (
                <div key={el.id} className={`d-flex align-items-center justify-content-between border p-2 rounded bg-light bg-opacity-50 ${el.isLocked ? 'border-danger border-opacity-50' : ''}`}>
                    
                    <div className="text-truncate fw-bold text-secondary" style={{ maxWidth: '90px', fontSize: '11px' }}>
                        <i className={`bi me-2 ${el.type === 'text' || el.type === 'richtext' ? 'bi-type' : el.type === 'image' ? 'bi-image' : el.type === 'shape' ? 'bi-star' : el.type === 'table' ? 'bi-table' : 'bi-diagram-3'}`}></i>
                        {el.type.toUpperCase()}
                    </div>

                    <div className="d-flex gap-1">
                        {/* Z-Index Controls */}
                        <Button title="Move Layer Down" variant="outline-secondary" size="sm" className="p-1 py-0" disabled={index === 0} onClick={() => moveLayerZIndex(el.id, 'down')}>
                            <i className="bi bi-chevron-down"></i>
                        </Button>
                        <Button title="Move Layer Up" variant="outline-secondary" size="sm" className="p-1 py-0" disabled={index === slides[activeSlideIdx].elements.length - 1} onClick={() => moveLayerZIndex(el.id, 'up')}>
                            <i className="bi bi-chevron-up"></i>
                        </Button>
                        
                        {/* Lock Control */}
                        <Button title="Lock Element Position" variant={el.isLocked ? "danger" : "outline-secondary"} size="sm" className="p-1 py-0" onClick={() => updateElement(el.id, { isLocked: !el.isLocked })}>
                            <i className={`bi ${el.isLocked ? 'bi-lock-fill text-white' : 'bi-unlock'}`}></i>
                        </Button>

                        {/* Select Control */}
                        <Button title="Select Element" variant="primary" size="sm" className="p-1 py-0 px-2" onClick={() => setSelectedIds([el.id])}>
                            Edit
                        </Button>
                    </div>
                </div>
            ))}
        </div>

        {slides[activeSlideIdx].elements.length === 0 && (
            <div className="text-center text-muted mt-4">
                <small>No elements on this slide.</small>
            </div>
        )}
    </div>
)}
</div>
                    </div>
                </div>
                {isSlideshow && <Button variant="qslide-btn" className="position-absolute qslide-btn top-0 end-0 m-3" onClick={() => setIsSlideshow(false)}>x</Button>}
            </Row>
            
            {/* --- FOOTER SAVE BUTTONS --- */}
            <div className="p-3 border-top d-flex justify-content-between align-items-center sticky-bottom"
            style={getSlideStyle(slideColor, slideBgImage, darkMode)}>
                <div className="d-flex gap-2">
                    <Button title="Import Menu" variant="qslide-btn rounded-ui" className='qslide-btn rounded-ui' onClick={() => setShowImportModal(true)}>
                        <i className="bi bi-upload"></i>
                    </Button>
                    <Button title="Download Menu" variant="qslide-btn rounded-ui" className='qslide-btn rounded-ui' onClick={() => setShowDownloadModal(true)}>
                        <i className="bi bi-download"></i>
                    </Button>
                </div>
                <div className="d-flex gap-2">
                    <Button title="Share Menu" variant="primary" onClick={() => setShowShareModal(true)} className="qslide-btn">
                        <i className="bi bi-share"></i>
                    </Button>
                    <Button title="Save Menu" variant="primary" onClick={() => setShowSaveModal(true)} className="qslide-btn">
                        <i className="bi bi-hdd"></i>
                    </Button>
                    <Button title="Print Slides" variant="primary" onClick={handlePrint} className="qslide-btn">
                        <i className="bi bi-printer"></i>
                    </Button>
                </div>
            </div>
            {/* DOWNLOAD MODAL */}
            <Modal 
                show={showDownloadModal} 
                onHide={() => setShowDownloadModal(false)} 
                centered
                data-bs-theme={darkMode ? 'dark' : 'light'}
            >
                <Modal.Header closeButton>
                    <Modal.Title className="h5">
                        <i className="bi bi-download me-2"></i>File Download
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        {[
                            { ext: '.qslide', label: 'QSLIDE', icon: 'bi-pie-chart-fill', color: 'text-danger' },
                            { ext: '.pptx', label: 'PPTX', icon: 'bi-file-earmark-ppt-fill', color: 'text-danger' },
                            { ext: '.odp', label: 'ODP', icon: 'bi-file-earmark-slides-fill', color: 'text-danger' },
                            { ext: '.pdf', label: 'PDF', icon: 'bi-file-earmark-pdf-fill', color: 'text-danger' },
                            { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-danger' },
                            { ext: '.md', label: 'Markdown', icon: 'bi-markdown-fill', color: 'text-danger' },
                            { ext: '.svg', label: 'SVG', icon: 'bi-filetype-svg', color: 'text-danger' }
                        ].map((file, index) => (
                            <div className="col-6" key={index}>
                                <Button 
                                    variant={darkMode ? "outline-light" : "outline-dark"} 
                                    className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
                                    onClick={() => handleAction(file.ext, 'download')}
                                >
                                    <i className={`bi ${file.icon} ${file.color} fs-3 mb-2`}></i>
                                    <span className="small fw-bold">{file.label}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </Modal.Body>
            </Modal>
            
            {/* SAVE MODAL */}
            <Modal 
                show={showSaveModal} 
                onHide={() => setShowSaveModal(false)} 
                centered
                data-bs-theme={darkMode ? 'dark' : 'light'}
            >
                <Modal.Header closeButton>
                    <Modal.Title className="h5">
                        <i className="bi bi-download me-2"></i>File Save
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        {[
                            { ext: '.qslide', label: 'QSLIDE', icon: 'bi-pie-chart-fill', color: 'text-danger' },
                            { ext: '.pptx', label: 'PPTX', icon: 'bi-file-earmark-ppt-fill', color: 'text-danger' },
                            { ext: '.odp', label: 'ODP', icon: 'bi-file-earmark-slides-fill', color: 'text-danger' },
                            { ext: '.pdf', label: 'PDF', icon: 'bi-file-earmark-pdf-fill', color: 'text-danger' },
                            { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-danger' },
                            { ext: '.md', label: 'Markdown', icon: 'bi-markdown-fill', color: 'text-danger' },
                            { ext: '.svg', label: 'SVG', icon: 'bi-filetype-svg', color: 'text-danger' }
                        ].map((file, index) => (
                            <div className="col-6" key={index}>
                                <Button 
                                    // Switches variant based on darkMode
                                    variant={darkMode ? "outline-light" : "outline-dark"} 
                                    className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
                                    onClick={() => handleAction(file.ext, 'save')}
                                >
                                    <i className={`bi ${file.icon} ${file.color} fs-3 mb-2`}></i>
                                    <span className="small fw-bold">{file.label}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </Modal.Body>
            </Modal>
            
            {/* SHARE MODAL */}
            <Modal 
                show={showShareModal} 
                onHide={() => setShowShareModal(false)} 
                centered
                // This attribute switches the modal's internal CSS variables
                data-bs-theme={darkMode ? 'dark' : 'light'}
            >
                <Modal.Header closeButton>
                    <Modal.Title className="h5">
                        <i className="bi bi-download me-2"></i>File Share
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        {[
                            { ext: '.qslide', label: 'QSLIDE', icon: 'bi-pie-chart-fill', color: 'text-danger' },
                            { ext: '.pptx', label: 'PPTX', icon: 'bi-file-earmark-ppt-fill', color: 'text-danger' },
                            { ext: '.odp', label: 'ODP', icon: 'bi-file-earmark-slides-fill', color: 'text-danger' },
                            { ext: '.pdf', label: 'PDF', icon: 'bi-file-earmark-pdf-fill', color: 'text-danger' },
                            { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-danger' },
                            { ext: '.md', label: 'Markdown', icon: 'bi-markdown-fill', color: 'text-danger' },
                            { ext: '.svg', label: 'SVG', icon: 'bi-filetype-svg', color: 'text-danger' }
                        ].map((file, index) => (
                            <div className="col-6" key={index}>
                                <Button 
                                    // Switches variant based on darkMode
                                    variant={darkMode ? "outline-light" : "outline-dark"} 
                                    className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
                                    onClick={() => handleAction(file.ext, 'share')}
                                >
                                    <i className={`bi ${file.icon} ${file.color} fs-3 mb-2`}></i>
                                    <span className="small fw-bold">{file.label}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </Modal.Body>
            </Modal>

            {/* IMPORT MODAL */}
            <Modal 
                show={showImportModal} 
                onHide={() => setShowImportModal(false)} 
                centered
                // This attribute switches the modal's internal CSS variables
                data-bs-theme={darkMode ? 'dark' : 'light'}
            >
                <Modal.Header closeButton>
                    <Modal.Title className="h5">
                        <i className="bi bi-upload me-2"></i>File Import
                        <input 
                        type="file" 
                        id="importInput" 
                        style={{ display: 'none' }} 
                        onChange={handleImportClick} 
                        accept=".pptx,.odp,.qslide" 
                        hidden
                    />
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="row g-3">
                        {[
                            { ext: '.qslide', label: 'QSLIDE', icon: 'bi-pie-chart-fill', color: 'text-danger' },
                            { ext: '.pptx', label: 'PPTX', icon: 'bi-file-earmark-ppt-fill', color: 'text-warning' },
                            { ext: '.odp', label: 'ODP', icon: 'bi-file-earmark-slides-fill', color: 'text-success' },
                            { ext: '.pdf', label: 'PDF', icon: 'bi-file-earmark-pdf-fill', color: 'text-danger' },
                            { ext: '.md', label: 'Markdown', icon: 'bi-markdown-fill', color: 'text-danger' },
                            { ext: '.svg', label: 'SVG', icon: 'bi-filetype-svg', color: 'text-danger' }
                        ].map((file, index) => (
                            <div className="col-6" key={index}>
                                <Button 
                                    // Switches variant based on darkMode
                                    variant={darkMode ? "outline-light" : "outline-dark"} 
                                    className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
                                    onClick={() => document.getElementById('importInput').click()}
                                >
                                    <i className={`bi ${file.icon} ${file.color} fs-3 mb-2`}></i>
                                    <span className="small fw-bold">{file.label}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </Modal.Body>
            </Modal>

        {/* SLIDESHOW MODAL */}
        <Modal show={isSlideshow} fullscreen onHide={() => setIsSlideshow(false)} transition={false}>
            <Modal.Body className="bg-dark p-0 d-flex align-items-center justify-content-center position-relative overflow-hidden">
                {/* Close Button */}
                <Button 
                    variant="danger rounded-circle" 
                    className="position-absolute top-0 end-0 m-3" 
                    style={{ zIndex: 2000 }}
                    onClick={() => setIsSlideshow(false)}
                >
                    <i className='bi bi-x'></i>
                </Button>

                {/* Slide Counter Footer */}
                <div className="position-absolute top-0 start-50 translate-middle-x text-white opacity-50">
                    <h1>{slides[activeSlideIdx].title}</h1>
                </div>

                {/* Navigation Overlay (Invisible areas to click Left/Right) */}
                <div 
                    className="position-absolute h-100 start-0" 
                    style={{ width: '20%', zIndex: 10, cursor: 'w-resize' }} 
                    onClick={() => setActiveSlideIdx(prev => Math.max(0, prev - 1))}
                />
                <div 
                    className="position-absolute h-100 end-0" 
                    style={{ width: '20%', zIndex: 10, cursor: 'e-resize' }} 
                    onClick={() => setActiveSlideIdx(prev => Math.min(slides.length - 1, prev + 1))}
                />

                {/* THE SLIDE (Reusing your stageRef logic) */}
                {/* THE SLIDE (Dynamically auto-scaled to fit screen, locked to original canvas size) */}
{(() => {
    // 1. Define your original editor canvas dimensions here.
    // Replace 1200 and 675 with your actual canvas width/height variables if different!
    const CANVAS_W = slideDim.w || 1200; 
    const CANVAS_H = slideDim.h || 675;

    // 2. Calculate the maximum space we want to take up on the screen
    const availableWidth = window.innerWidth * 0.95;
    const availableHeight = window.innerHeight * 0.85;

    // 3. Find the perfect scale factor so it fits without overflowing
    const scale = Math.min(availableWidth / CANVAS_W, availableHeight / CANVAS_H);

    return (
        <div style={{
            // A. HARD-LOCK dimensions to exactly match your editor canvas
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            
            // B. Apply the calculated scale factor to shrink/grow it
            transform: `scale(${scale})`,
            transformOrigin: 'center center', // This keeps it perfectly centered!
            
            // C. Prevent flexbox from squishing the container
            flexShrink: 0,
            
            // D. Standard styling
            backgroundColor: `#${activeSlide?.background || 'FFFFFF'}`,
            position: 'relative',
            boxShadow: '0 0 50px rgba(0,0,0,0.8)',
            
            // E. Hide anything that tries to render outside the boundaries
            overflow: 'hidden' 
        }}>
            {renderSlideContent(true)} 
        </div>
    );
})()}

                {/* Slide Counter Footer */}
                <div className="position-absolute bottom-0 start-50 translate-middle-x mb-3 text-white opacity-50">
                    Slide {activeSlideIdx + 1} of {slides.length}
                </div>
            </Modal.Body>
        </Modal>

            <Modal show={showChartModal} onHide={() => setShowChartModal(false)} size="lg">
    <Modal.Title>{editingId ? "Edit Chart Data" : "Insert New Chart"}</Modal.Title>
    <Modal.Body>
        <div className="row g-3">
            <div className="col-md-6">
                <label>Chart Title</label>
                <Form.Control value={chartInput.title} onChange={e => setChartInput({...chartInput, title: e.target.value})} />
            </div>
            <div className="col-md-3">
                <label>Type</label>
                <Form.Select value={chartInput.type} onChange={e => setChartInput({...chartInput, type: e.target.value})}>
                    {["pie", "doughnut", "polarArea", "radar", "line", "bar"].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </Form.Select>
            </div>
            <div className="col-md-3 d-flex align-items-end">
                <Form.Check type="switch" label="Grouped Data" disabled={chartInput.type !== 'bar'} checked={chartInput.isGrouped} 
                    onChange={e => setChartInput({...chartInput, isGrouped: e.target.checked})} />
            </div>

            <hr />

            {/* --- SINGLE DATASET MODE --- */}
            {!chartInput.isGrouped ? (
                <div className="col-12">
                    <h6>Data Points</h6>
                    {chartInput.data.map((row, idx) => (
                        <div key={idx} className="d-flex gap-2 mb-2">
                            <Form.Control placeholder="Label" value={row.label} onChange={e => {
                                const newData = [...chartInput.data]; newData[idx].label = e.target.value;
                                setChartInput({...chartInput, data: newData});
                            }} />
                            <Form.Control type="number" placeholder="Value" value={row.value} onChange={e => {
                                const newData = [...chartInput.data]; newData[idx].value = Number(e.target.value);
                                setChartInput({...chartInput, data: newData});
                            }} />
                            <Form.Control type="color" className="p-1" style={{width: '50px'}} value={row.color} onChange={e => {
                                const newData = [...chartInput.data]; newData[idx].color = e.target.value;
                                setChartInput({...chartInput, data: newData});
                            }} />
                            <Button variant="outline-danger" onClick={() => setChartInput({...chartInput, data: chartInput.data.filter((_, i) => i !== idx)})}>×</Button>
                        </div>
                    ))}
                    <Button variant="link" size="sm" onClick={() => setChartInput({...chartInput, data: [...chartInput.data, {label: '', value: 0, color: '#cccccc'}]})}>+ Add Point</Button>
                </div>
            ) : (
                /* --- MULTI-DATASET (GROUPED) MODE --- */
                <div className="col-12">
                    <h6>Categories (X-Axis)</h6>
                    <div className="d-flex gap-2 mb-3">
                        <Form.Control placeholder="Comma separated: Jan, Feb, Mar" value={chartInput.labels.join(', ')} 
                            onChange={e => setChartInput({...chartInput, labels: e.target.value.split(',').map(s => s.trim())})} />
                    </div>
                    <h6>Series</h6>
                    {chartInput.series.map((ser, sIdx) => (
                        <div key={sIdx} className="border p-2 mb-2 rounded bg-light">
                            <div className="d-flex gap-2 mb-2">
                                <Form.Control size="sm" placeholder="Series Name" value={ser.label} onChange={e => {
                                    const newSer = [...chartInput.series]; newSer[sIdx].label = e.target.value;
                                    setChartInput({...chartInput, series: newSer});
                                }} />
                                <Form.Control size="sm" type="color" style={{width: '40px'}} value={ser.color} onChange={e => {
                                    const newSer = [...chartInput.series]; newSer[sIdx].color = e.target.value;
                                    setChartInput({...chartInput, series: newSer});
                                }} />
                                <Button variant="outline-danger" size="sm" onClick={() => setChartInput({...chartInput, series: chartInput.series.filter((_, i) => i !== sIdx)})}>×</Button>
                            </div>
                            <Form.Control size="sm" placeholder="Values (e.g. 10, 20, 30)" value={ser.values.join(', ')} 
                                onChange={e => {
                                    const newSer = [...chartInput.series]; newSer[sIdx].values = e.target.value.split(',').map(v => Number(v.trim()));
                                    setChartInput({...chartInput, series: newSer});
                                }} />
                        </div>
                    ))}
                    <Button variant="link" size="sm" onClick={() => setChartInput({...chartInput, series: [...chartInput.series, {label: '', values: [], color: '#333333'}]})}>+ Add Series</Button>
                </div>
            )}
        </div>
    </Modal.Body>
    <Modal.Footer>
        <Button variant="secondary" onClick={() => {setShowChartModal(false); setEditingId(null);}}>Cancel</Button>
        <Button variant="primary" onClick={saveChart}>
            {editingId ? "Update Chart" : "Insert Chart"}
        </Button>
    </Modal.Footer>
</Modal>
        </Container>
    );
};

export default QSlide;