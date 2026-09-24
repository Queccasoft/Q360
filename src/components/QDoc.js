import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Collapse, Container, Row, Col, Form, Modal, Card, Tabs, ButtonGroup, Tab, Image, Dropdown } from 'react-bootstrap';
import OcrModal from './OcrModal';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Keyboard } from '@capacitor/keyboard';
import JSZip from "jszip";
import CryptoJS from 'crypto-js';
import "./QDocTheme.css";
import TextEditorEngine from "./TextEditorEngine";
import MindMapEditor from './MindMapEditor';
// import initPdfEngine from './pdf_engine';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
const DrawingCanvas = ({ id, initialData, onRemove, saveRef, onPreview, darkMode }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null); // Added to measure the container
    const [isDrawing, setIsDrawing] = useState(false);
    
    const [brushColor, setBrushColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(3);
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // --- 1. Dynamic Resolution Setup ---
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        const ctx = canvas.getContext('2d');

        // Set internal resolution to match display size
        const resizeCanvas = () => {
            const { width, height } = container.getBoundingClientRect();
            
            // Temporary save current content
            const tempImage = canvas.toDataURL();
            
            canvas.width = width;
            canvas.height = height;

            // Restore content after resize
            const img = new window.Image();
            img.onload = () => ctx.drawImage(img, 0, 0, width, height);
            img.src = initialData || tempImage;
        };

        resizeCanvas();
        // Capture initial state for Undo
        setHistory([canvas.toDataURL()]);

        saveRef(() => canvas.toDataURL('image/png'));
        
        // Optional: Re-align on window resize
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [initialData, saveRef]);

    const getCoordinates = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        // Handle both Touch and Mouse
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        // Crucial Fix: Map CSS pixels to Canvas internal pixels
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);
        
        return { x, y };
    };

    const startDrawing = (e) => {
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current.getContext('2d');
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            setIsDrawing(false);
            const currentState = canvasRef.current.toDataURL();
            setHistory(prev => [...prev, currentState]);
            setRedoStack([]);
        }
    };

    const handleUndo = () => {
        if (history.length <= 1) return;
        const newHistory = history.slice(0, -1);
        const previous = newHistory[newHistory.length - 1];
        setRedoStack(prev => [history[history.length - 1], ...prev]);
        setHistory(newHistory);
        const img = new window.Image();
        img.onload = () => {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = previous;
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[0];
        setHistory(prev => [...prev, next]);
        setRedoStack(prev => prev.slice(1));
        const img = new window.Image();
        img.onload = () => {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = next;
    };

    return (
        <div ref={containerRef} className={`mb-4 border rounded shadow-sm overflow-hidden ${darkMode ? 'bg-dark border-secondary' : 'bg-light'}`} 
             style={{ height: '400px', width: '100%' }}> {/* Set a fixed viewport height, width stays 100% */}
            
            <div className="d-flex align-items-center gap-2 p-2 border-bottom bg-opacity-10 bg-secondary">
                <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)}
                    style={{ width: '30px', height: '30px', flexShrink: 0, border: 'none', borderRadius: '4px' }} />
                
                <input type="range" min="1" max="20" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="form-range d-none d-sm-block" style={{ width: '80px' }} />

                <div className="vr mx-1"></div>

                <Button variant="outline-secondary" size="sm" onClick={handleUndo} disabled={history.length <= 1}><i className="bi bi-arrow-90deg-left"></i></Button>
                <Button variant="outline-secondary" size="sm" onClick={handleRedo} disabled={redoStack.length === 0}><i className="bi bi-arrow-90deg-right"></i></Button>
                <Button variant="outline-secondary" size="sm" onClick={() => {
                    const ctx = canvasRef.current.getContext('2d');
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    stopDrawing();
                }}><i className="bi bi-eraser"></i></Button>

                <div className="ms-auto d-flex gap-1">
                    <Button variant="outline-primary" size="sm" onClick={() => onPreview(canvasRef.current.toDataURL())}><i className="bi bi-arrows-fullscreen"></i></Button>
                    <Button variant="outline-danger" size="sm" onClick={() => onRemove(id)}><i className="bi bi-trash"></i></Button>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 'calc(100% - 50px)', touchAction: 'none', cursor: 'crosshair', backgroundColor: '#fff' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerOut={stopDrawing}
            />
        </div>
    );
};

const splitHtmlAtHeight = (htmlContent, maxPxHeight, containerWidth, paddingStyles) => {
    // 1. Create the invisible off-screen yardstick
    const yardstick = document.createElement('div');
    yardstick.style.position = 'absolute';
    yardstick.style.visibility = 'hidden';
    yardstick.style.width = `${containerWidth}px`;
    yardstick.style.padding = paddingStyles;
    yardstick.style.boxSizing = 'border-box';
    yardstick.style.whiteSpace = 'pre-wrap';
    yardstick.style.wordBreak = 'break-word';
    yardstick.innerHTML = htmlContent;
    document.body.appendChild(yardstick);

    // If it doesn't overflow, return the whole thing
    if (yardstick.scrollHeight <= maxPxHeight) {
        document.body.removeChild(yardstick);
        return { pageHtml: htmlContent, remainderHtml: null };
    }

    // 2. Binary search via TreeWalker to find the exact overflowing text node
    const walker = document.createTreeWalker(yardstick, NodeFilter.SHOW_TEXT, null, false);
    let currentNode;
    let splitNode = null;

    while ((currentNode = walker.nextNode())) {
        const range = document.createRange();
        range.selectNode(currentNode);
        const rect = range.getBoundingClientRect();
        
        // We found the node that crosses the boundary
        if (rect.bottom - yardstick.getBoundingClientRect().top > maxPxHeight) {
            splitNode = currentNode;
            break;
        }
    }

    if (!splitNode) {
        // Fallback if measurement fails
        document.body.removeChild(yardstick);
        return { pageHtml: htmlContent, remainderHtml: null };
    }

    // 3. The Slicer: Split the text node exactly at the character that overflows
    const splitRange = document.createRange();
    let charIndex = 0;
    for (let i = 0; i < splitNode.length; i++) {
        splitRange.setStart(splitNode, 0);
        splitRange.setEnd(splitNode, i);
        if (splitRange.getBoundingClientRect().bottom - yardstick.getBoundingClientRect().top > maxPxHeight) {
            charIndex = Math.max(0, i - 1);
            break;
        }
    }

    // Split the actual text
    const textPart1 = splitNode.nodeValue.substring(0, charIndex);
    const textPart2 = splitNode.nodeValue.substring(charIndex);

    // 4. Clone the tree upwards to properly close/reopen tags (The <strong> fix)
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');

    let currentParent = splitNode.parentNode;
    
    // Build the remainder tree (Page 2)
    let bottomClone = currentParent.cloneNode(false); // clones tag without children
    bottomClone.appendChild(document.createTextNode(textPart2));
    
    // Build the first page tree (Page 1)
    splitNode.nodeValue = textPart1; 

    // Move all siblings AFTER the split node into the Page 2 tree
    let nextSib = splitNode.nextSibling;
    while (nextSib) {
        let toMove = nextSib;
        nextSib = nextSib.nextSibling;
        bottomClone.appendChild(toMove.cloneNode(true));
        toMove.remove();
    }

    // Bubble up to the root, closing and reopening tags as we go
    while (currentParent !== yardstick) {
        const nextParent = currentParent.parentNode;
        if (nextParent !== yardstick) {
            const newBottomClone = nextParent.cloneNode(false);
            newBottomClone.appendChild(bottomClone);
            
            let sibling = currentParent.nextSibling;
            while (sibling) {
                let toMove = sibling;
                sibling = sibling.nextSibling;
                newBottomClone.appendChild(toMove.cloneNode(true));
                toMove.remove();
            }
            bottomClone = newBottomClone;
        } else {
            let sibling = currentParent.nextSibling;
            while(sibling) {
                let toMove = sibling;
                sibling = sibling.nextSibling;
                container2.appendChild(toMove.cloneNode(true));
                toMove.remove();
            }
            container2.insertBefore(bottomClone, container2.firstChild);
        }
        currentParent = nextParent;
    }

    container1.innerHTML = yardstick.innerHTML;

    document.body.removeChild(yardstick);

    return {
        pageHtml: container1.innerHTML,
        remainderHtml: container2.innerHTML
    };
};

const QDoc = ({ 
  initialText = "", 
    initialFileName = "Untitled", 
    onSave, 
    fileHandle,
    onSubmit = () => {}, // Default to empty function to prevent crash
    onDownload,
    onShare,
    fullscreen = false,
    editorStyle = {},
    editorGutterStyle = {}
}) => {
    // Ref for hidden inputs
    const fileInputRefOdt = useRef(null);
    const fileInputRefTxt = useRef(null);
    const fileInputRefQDoc = useRef(null);
    const fileInputRefDocx = useRef(null);
    const fileInputRefLocalImage = useRef(null);
    const typingHistoryTimeoutRef = useRef(null);
    const syncChunkTimeoutRef = useRef(null);

    const [status, setStatus] = useState({ type: '', msg: '' });
    const [currentFileName, setCurrentFileName] = useState(initialFileName);
    const editorRef = useRef(null);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
    const [activeTab, setActiveTab] = useState('editor');
    const [showSettings, setShowSettings] = useState(false);
    const [mediaItems, setMediaItems] = useState([]);
    const [canvases, setCanvases] = useState([]); // { id, data }
    const [viewMode, setViewMode] = useState('smooth'); // 'smooth' or 'paged'
    const [pageDims, setPageDims] = useState({ width: 800, height: 1120 }); // Approx A4 dimensions in px
    const [totalPages, setTotalPages] = useState(1);
    
    // Data Extractor and CSV States
    const [showExtractorModal, setShowExtractorModal] = useState(false);
    const [extractType, setExtractType] = useState('email'); // Options: 'email' | 'phone' | 'link'
    const [extractedCsvData, setExtractedCsvData] = useState('');
            
    const lineNumberRef = useRef(null); // Ref for line number gutter
    const canvasRefs = useRef({}); // Store refs to canvas save functions
    
    // Line Number State
    const [lineCount, setLineCount] = useState(1);
    const [searchText, setSearchText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matchCount, setMatchCount] = useState(0);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [syntaxRules, setSyntaxRules] = useState([]);
    const [showRulesModal, setShowRulesModal] = useState(false);

    // Recording State
    const [recordingType, setRecordingType] = useState(null); // 'image', 'video', or 'audio'
    const [isRecording, setIsRecording] = useState(false);
    const [stream, setStream] = useState(null);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const videoPreviewRef = useRef(null);

    // States for content metrics
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [charNoSpaceCount, setCharNoSpaceCount] = useState(0);

    // State for formatting options
    const [darkMode, setDarkMode] = useState(false);
    const [highlightColor, setHighlightColor] = useState('#ffff00');
    const [fontColor, setFontColor] = useState('#ffff00');
    const [docColor, setDocColor] = useState('');
    const [docBgImage, setDocBgImage] = useState();

    // Password options
    const [password, setPassword] = useState(''); // For setting/entering password
    const [isLocked, setIsLocked] = useState(false); // Toggle for "Protect this note"
    const [decryptionPass, setDecryptionPass] = useState(''); // Input for unlocking
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [pendingEncryptedData, setPendingEncryptedData] = useState("");

    // Color and Font size Options
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [selectedBackColor, setSelectedBackColor] = useState('#ffff00');
    const [shadowConfig, setShadowConfig] = useState({ color: '#ff8103', blur: 4, offset: 2 });
    const [savedRange, setSavedRange] = useState(null);
    const [selectedSizeIndex, setSelectedSizeIndex] = useState('16'); 

    // State for search options
    const [isCaseSensitive, setIsCaseSensitive] = useState(false);
    const [isWholeWord, setIsWholeWord] = useState(false);
    
    // State for Collapse Controls
    //const [pendingContent, setPendingContent] = useState("");
    // Replace standard content state with Virtualized Array State
const [documents, setDocuments] = useState([]);
const [currentDocId, setCurrentDocId] = useState(null);
const [showPageSettingsModal, setShowPageSettingsModal] = useState(false);
const [showDocumentMenu,setShowDocumentMenu] = useState(false);
const [showDocDeck, setShowDocDeck] = useState(true);
const [draggedDocId, setDraggedDocId] = useState(null);

// Global settings fallback
const [globalDocSettings, setGlobalDocSettings] = useState({
    docWidth: 800,
    docHeight: 1120,
    docColor: '#ffffff',
    docBgImage: '',
    leftMargin: 20,
    rightMargin: 20,
    topMargin: 20,
    bottomMargin: 20,
    typeMode: 'continuous'
});

// UI states for new features
const [showExportModal, setShowExportModal] = useState(false);
const [exportConfig, setExportConfig] = useState(null); // Tracks extension and mode
    const [isDataReady, setIsDataReady] = useState(false);
    const [previewMedia, setPreviewMedia] = useState(null);
    const [lastLoadTime, setLastLoadTime] = useState(Date.now());
    const [openFormatControls, setOpenFormatControls] = useState(false);
    const [openSearchControls, setOpenSearchControls] = useState(false);
    const [openInsertControls, setOpenInsertControls] = useState(false);
    const [openSectionControls, setOpenSectionControls] = useState(false);
    const [sectionStyles, setSectionStyles] = useState({
    name: "Section",
    headingTextColor: '#023568',
    bgColor: '#f8f9fa',
    radius: '8' // Using a number for the range slider
});
    const [videoMenu, setVideoMenu] = useState({ show: false, x: 0, y: 0, target: null });
    const [isListening, setIsListening] = useState(false);
    
    // Print Modal Settings
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printConfig, setPrintConfig] = useState({
        width: 794, // Approx A4 width in pixels at 96dpi
        height: 1123, // Approx A4 height
        useFilters: true,
        showImages: true,
        showVideos: true,
        pageRange: 'all', // 'all' or '1,3,5'
        estimatedPages: 1
    });

    //Media & MindMap Elements
    const [mindMapData, setMindMapData] = useState({ nodes: [], connectors: [] });
    
    // State to hold references to the actual DOM span elements
    const allMatchElementsRef = useRef([]);

    // Add these updated styles to your component
    const HIGHLIGHT_CLASS = 'search-match';

    const historyRef = useRef([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const MAX_HISTORY = 50; // Limit memory usage

    const [showOcrModal, setShowOcrModal] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showShadowModal, setShowShadowModal] = useState(false);
        
//     const saveState = useCallback(() => {
//     if (!editorRef.current) return;
    
//     // 1. Sync the current editor content to the chunk array for the snapshot
//     const syncedDocs = documents.map(d => 
//         d.primaryId === currentDocId ? { ...d, content: editorRef.current.innerHTML } : d
//     );
    
//     const currentState = {
//         docs: syncedDocs,
//         activeId: currentDocId
//     };

//     // 2. Prevent saving duplicates (using stringify for deep array comparison)
//     const lastState = historyRef.current[historyIndex];
//     if (lastState && JSON.stringify(lastState.docs) === JSON.stringify(currentState.docs)) return;

//     // 3. Update the history stack
//     const newHistory = historyRef.current.slice(0, historyIndex + 1);
//     newHistory.push(currentState);
    
//     if (newHistory.length > MAX_HISTORY) newHistory.shift();
//     historyRef.current = newHistory;
//     setHistoryIndex(newHistory.length - 1);
// }, [historyIndex, documents, currentDocId]);

    // HOOK 4
    const saveState = useCallback(() => {
        console.log("hook 4")
    if (!editorRef.current) return;
    
    const currentContent = editorRef.current.innerHTML;
    
    // 1. Sync the current editor content to the chunk array for the snapshot
    const syncedDocs = documents.map(d => 
        d.primaryId === currentDocId ? { ...d, content: currentContent } : d
    );
    
    const currentState = {
        docs: syncedDocs,
        activeId: currentDocId
    };

    // 2. Prevent saving duplicates (Fast Comparison)
    const lastState = historyRef.current[historyIndex];
    if (lastState) {
        // Find the active document in the last state and compare strings directly
        const lastActiveDoc = lastState.docs.find(d => d.primaryId === currentDocId);
        if (lastActiveDoc && lastActiveDoc.content === currentContent) {
            return; // No changes to the active document, abort save
        }
    }

    // 3. Update the history stack
    const newHistory = historyRef.current.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    setHistoryIndex(newHistory.length - 1);
}, [historyIndex, documents, currentDocId]);

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

const processLargeTextFile = async (file, isHtml = false) => {
    const text = await file.text();
    const MAX_SIZE = 0.5 * 1024 * 1024; // 0.5 MB
    let chunks = [];

    if (file.size > MAX_SIZE) {
        const chunkSize = Math.floor(text.length / Math.ceil(file.size / MAX_SIZE));
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
    } else {
        chunks = [text];
    }

    let lineCounter = 1;
    const newDocs = chunks.map((chunk, index) => {
        const linesInChunk = chunk.split('\n').length;
        const startLine = lineCounter;
        const endLine = lineCounter + linesInChunk - 1;
        lineCounter = endLine + 1;
        
        const docId = `doc_${Date.now()}_${index}`;
        
        // Wrap the chunk in the first element of our page array
        const structuredContent = `<div class="qdoc-page">${chunk}</div>`;

        return {
            title: `${file.name.replace(/\.[^/.]+$/, "")} - Part ${index + 1}`,
            primaryId: docId,
            nextId: null, 
            prevId: null, 
            content: structuredContent,
            startLine, endLine,
            docWidth: globalDocSettings.docWidth,
            docHeight: globalDocSettings.docHeight,
            typeMode: globalDocSettings.typeMode,
            leftMargin: globalDocSettings.leftMargin,
            rightMargin: globalDocSettings.rightMargin,
            topMargin: globalDocSettings.topMargin,
            bottomMargin: globalDocSettings.bottomMargin,
            globalStylesOverride: false 
        };
    });

    for (let i = 0; i < newDocs.length; i++) {
        if (i > 0) newDocs[i].prevId = newDocs[i - 1].primaryId;
        if (i < newDocs.length - 1) newDocs[i].nextId = newDocs[i + 1].primaryId;
    }

    setDocuments(newDocs);
    if (newDocs.length > 0) {
        setCurrentDocId(newDocs[0].primaryId);
        historyRef.current = [{ docs: newDocs, activeId: newDocs[0].primaryId }];
        setHistoryIndex(0);
    }
    setIsDataReady(true);
};

// Retrieve the currently active document
const currentDoc = documents.find(d => d.primaryId === currentDocId) || null;

// Calculate active styles
const activeStyles = useMemo(() => {
    if (!currentDoc) return {};
    
    // Check if local document overrides global settings
    const config = currentDoc.globalStylesOverride ? currentDoc : globalDocSettings;

    return {
        width: `${config.docWidth}px`,
        minHeight: config.typeMode === 'paged' ? `${config.docHeight}px` : 'auto',
        padding: `${config.topMargin}px ${config.rightMargin}px ${config.bottomMargin}px ${config.leftMargin}px`,
        backgroundColor: config.globalStylesOverride ? (currentDoc.docColor || globalDocSettings.docColor) : globalDocSettings.docColor,
        backgroundImage: config.globalStylesOverride ? `url(${currentDoc.docBgImage})` : `url(${globalDocSettings.docBgImage})`
    };
}, [currentDoc, globalDocSettings]);

// Effect to inject content when current document changes
// Add this ref near your other refs
const lastRenderedDocId = useRef(null);

// HOOK 5
useEffect(() => {
    console.log("hook 5 - Initializing Root Page Array")
    if (!isDataReady) {
        if (documents.length === 0) {
            const docId = `doc_${Date.now()}`;
            
            // Ensure the initial string contains the root page element
            const defaultHtml = initialText || '<p><br></p>';
            const pageWrappedContent = defaultHtml.includes('qdoc-page') 
                ? defaultHtml 
                : `<div class="qdoc-page">${defaultHtml}</div>`;

            const initialDoc = {
                title: currentFileName || "Untitled",
                primaryId: docId,
                nextId: null, prevId: null,
                content: pageWrappedContent, 
                startLine: 1, endLine: 1,
                docWidth: globalDocSettings?.docWidth || 800,
                docHeight: globalDocSettings?.docHeight || 1120,
                typeMode: globalDocSettings?.typeMode || 'smooth',
                leftMargin: globalDocSettings?.leftMargin || 40,
                rightMargin: globalDocSettings?.rightMargin || 40,
                topMargin: globalDocSettings?.topMargin || 40,
                bottomMargin: globalDocSettings?.bottomMargin || 40,
                globalStylesOverride: false 
            };
            
            setDocuments([initialDoc]);
            setCurrentDocId(docId);
            historyRef.current = [{ docs: [initialDoc], activeId: docId }];
            setHistoryIndex(0);
        }
        setIsDataReady(true);
    }
}, [isDataReady, documents.length, currentFileName, initialText, globalDocSettings]);

const calculatePages = useCallback(() => {
    if (!editorRef.current) return;
    
    // Instead of doing math based on scrollHeight, we now count 
    // the actual array of page elements in the DOM
    const pages = editorRef.current.querySelectorAll('.qdoc-page');
    setTotalPages(pages.length || 1);
}, []);

// HOOK 6
useEffect(() => {
    console.log("hook 6")
    calculatePages();
}, [viewMode, pageDims, calculatePages]);

const showAlert = (type, msg) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
};

const getContrastYIQ = (hexcolor) => {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
};

const getDocStyle = (color, image, darkMode) => {
    // 1. Determine the base background color
    // If color exists and isn't a default 'blank' value, use it. Otherwise, use theme colors.
    //console.log("DARK MODE: ",darkMode)
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

const encryptData = (data, pass) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), pass).toString();
};

const decryptData = (ciphertext, pass) => {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, pass);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return null; // Wrong password
        return JSON.parse(decryptedString);
    } catch (e) {
        return null; 
    }
};

// Helper to convert Blob URLs back to Base64 for the encrypted bundle
const toBase64 = (url) => fetch(url).then(r => r.blob()).then(blob => 
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    })
);

const handleUnlock = async (e) => {
    if (e) e.preventDefault();

    const decrypted = decryptData(pendingEncryptedData, decryptionPass);

    if (decrypted) {
        const hydratedMedia = await Promise.all((decrypted.mediaItems || []).map(async item => {
            if (item.base64) {
                const res = await fetch(item.base64);
                const blob = await res.blob();
                return { ...item, url: URL.createObjectURL(blob), base64: null };
            }
            return item;
        }));

        const hydratedCanvases = (decrypted.canvases || []).map(c => ({
            ...c,
            data: c.base64
        }));

        setDocColor(decrypted.docColor || '');
        setDocBgImage(decrypted.docBgImage || '');
        setSyntaxRules(decrypted.rules || []);
        setMediaItems(hydratedMedia);
        setCanvases(hydratedCanvases);

        const validMindMap = decrypted.mindMap || { nodes: [], connectors: [] };
        setMindMapData(validMindMap);
        setLastLoadTime(Date.now());
        setIsLocked(true);
        setPassword(decryptionPass);

        // --- RESTORE ALL DOCUMENTS OR FALLBACK TO SINGLE CONTENT ---
        let loadedDocs = [];
        
        if (decrypted.documents && decrypted.documents.length > 0) {
            loadedDocs = decrypted.documents;
        } else if (decrypted.docs && decrypted.docs.length > 0) {
            loadedDocs = decrypted.docs;
        } else if (Array.isArray(decrypted) && decrypted.length > 0 && decrypted[0].primaryId) {
            loadedDocs = decrypted;
        } else {
            // Fallback for older/single text saves
            const docId = `doc_${Date.now()}`;
            loadedDocs = [{
                title: currentFileName,
                primaryId: docId,
                nextId: null,
                prevId: null,
                content: decrypted.content || '',
                startLine: 1,
                endLine: Math.max(1, (decrypted.content || '').split('\n').length),
                docWidth: globalDocSettings?.docWidth || 800,
                docHeight: globalDocSettings?.docHeight || 1120,
                typeMode: globalDocSettings?.typeMode || 'smooth',
                leftMargin: globalDocSettings?.leftMargin || 40,
                rightMargin: globalDocSettings?.rightMargin || 40,
                topMargin: globalDocSettings?.topMargin || 40,
                bottomMargin: globalDocSettings?.bottomMargin || 40,
                globalStylesOverride: false 
            }];
        }

        const activeId = loadedDocs[0].primaryId;
        setDocuments(loadedDocs);
        setCurrentDocId(activeId);

        // Inject content directly into DOM
        if (editorRef.current) {
            editorRef.current.innerHTML = loadedDocs[0].content || '';
        }

        historyRef.current = [{ docs: loadedDocs, activeId: activeId }];
        setHistoryIndex(0);

        setShowUnlockModal(false);
        setDecryptionPass('');
        setPendingEncryptedData(null);
    } else {
        alert("Invalid Password!");
        setDecryptionPass('');
    }
};
    const startDictation = () => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Your browser does not support speech recognition. Try Chrome.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // Set your preferred language
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        insertDictatedText(transcript);
    };
    recognition.start();
};

// HOOK 7
useEffect(() => {
    console.log("hook 7 - Structural Enforcer")
    if (editorRef.current) {
        const html = editorRef.current.innerHTML.trim();
        // If empty or lacking our page array structure, inject it
        if (html === "" || !html.includes('qdoc-page')) {
            editorRef.current.innerHTML = `<div class="qdoc-page"><p><br></p></div>`;
        }
    }
}, []);
const handleFormat = useCallback((method, value = null, customRange = null) => {
    editorRef.current.focus();
    
    const selection = window.getSelection();
    
    // If we have a custom saved range, ensure the selection uses it
    if (customRange) {
        selection.removeAllRanges();
        selection.addRange(customRange);
    }
    
    // Execute via Engine
    TextEditorEngine.execute(method, value, selection);

    if (saveState) saveState(); 
}, [saveState]);

const insertDictatedText = (text) => {
    // Simply call the bridge
    handleFormat('insertText', text);
    if (handleInput) handleInput();
};

const handleReadAloud = () => {
    if ('speechSynthesis' in window) {
        // 1. Stop any current speech
        window.speechSynthesis.cancel();

        const editor = editorRef.current;
        if (!editor) return;

        // 2. Get the clean text directly from the element
        // .innerText is better than .textContent here because it respects line breaks
        const plainText = editor.innerText || editor.textContent || "";

        if (plainText.trim() === "") return;

        // 3. Create and configure the utterance
        const utterance = new SpeechSynthesisUtterance(plainText);
        
        // Optional: Match the pitch/rate to a more natural feel
        utterance.rate = 1.0; 
        utterance.pitch = 1.0;
        utterance.lang = 'en-US';

        // 4. Speak!
        window.speechSynthesis.speak(utterance);
    } else {
        alert("Text-to-speech is not supported in this browser.");
    }
};
    const handleInsertOcrText = useCallback((extractedText) => {
    handleFormat('insertText', extractedText);
}, [handleFormat]);

    const removeHighlights = useCallback(() => {
    if (!editorRef.current) return;
    
    // Find all our custom search spans
    const matches = editorRef.current.querySelectorAll('.search-match');
    
    matches.forEach(el => {
        const parent = el.parentNode;
        // Move all children of the span (the text) out of the span
        while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
        }
        // Remove the empty span
        parent.removeChild(el);
    });

    // Merge split text nodes back together (crucial for clean HTML)
    editorRef.current.normalize();
    allMatchElementsRef.current = [];
    }, []);

    const getSearchRegex = useCallback(() => {
        if (searchText.length === 0) return null;
        let escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (isWholeWord) {
            escapedSearchText = `\\b${escapedSearchText}\\b`;
        }
        const flags = 'g' + (isCaseSensitive ? '' : 'i');
        return new RegExp(escapedSearchText, flags);
    }, [searchText, isWholeWord, isCaseSensitive]);


    // 1. Function to clean the text content
    const getCleanText = useCallback(() => {
    // Combine HTML from all chunks, preferring live editor state for the active chunk
    const combinedHtml = documents.map(d => 
        d.primaryId === currentDocId && editorRef.current 
            ? editorRef.current.innerHTML 
            : d.content
    ).join(' ');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = combinedHtml;
    const content = tempDiv.innerText;
    
    allMatchElementsRef.current = [];
    return content || initialText;
}, [initialText, documents, currentDocId]);

const calculateMetrics = useCallback(() => {
    console.log("calculate metrics")
    // Map over chunks to extract plain text without touching the DOM
    const allText = documents.map(d => {
        if (d.primaryId === currentDocId && editorRef.current) {
            // Active doc: rely on the browser's existing layout engine
            return editorRef.current.innerText || '';
        } else {
            // Inactive docs: Strip HTML tags using regex and normalize spaces
            // Replacing with a space prevents words from merging (e.g., <p>Hello</p><p>World</p> -> Hello World)
            return d.content
                .replace(/<[^>]+>/g, ' ') 
                .replace(/&nbsp;/g, ' ')
                .replace(/&[a-z]+;/gi, ''); // strip other standard HTML entities for accurate char counts
        }
    }).join('\n');

    const totalChars = allText.length; 
    const charsNoSpace = allText.replace(/\s/g, '').length; 
    const words = allText.trim().split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    
    setCharCount(totalChars);
    setCharNoSpaceCount(charsNoSpace);
    setWordCount(totalWords);
}, [documents, currentDocId]);
useEffect(() => {
    console.log("hook 01")
    if (currentDoc && editorRef.current && lastRenderedDocId.current !== currentDocId) {
        editorRef.current.innerHTML = currentDoc.content;
        lastRenderedDocId.current = currentDocId; // Lock it so it doesn't fire while typing
        calculateMetrics();
    }
}, [currentDocId, currentDoc, calculateMetrics]);

    // Calculate the number of lines
    const calculateLineCount = useCallback(() => {
        if (!editorRef.current) return;
        // Count lines based on newline characters
        const text = editorRef.current.innerText || '';
        const count = text.split('\n').length;
        setLineCount(count);

        // Optional: Ensure line number gutter height matches editor content height
        if (lineNumberRef.current && editorRef.current) {
            // Using min-height is a simple way to ensure the gutter starts at the editor's height
            lineNumberRef.current.style.minHeight = `${editorRef.current.offsetHeight}px`;
        }
    }, []);

    const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
        const prevIndex = historyIndex - 1;
        const prevState = historyRef.current[prevIndex];
        
        // Restore array and active chunk
        setDocuments(prevState.docs);
        setCurrentDocId(prevState.activeId);
        setHistoryIndex(prevIndex);
        
        // Immediately inject the restored active chunk into the DOM
        const activeDoc = prevState.docs.find(d => d.primaryId === prevState.activeId);
        if (activeDoc && editorRef.current) {
            editorRef.current.innerHTML = activeDoc.content;
        }
        
        calculateMetrics();
        calculateLineCount();
    }
}, [historyIndex, calculateMetrics, calculateLineCount]);

    const handleRedo = useCallback(() => {
    if (historyIndex < historyRef.current.length - 1) {
        const nextIndex = historyIndex + 1;
        const nextState = historyRef.current[nextIndex];
        
        setDocuments(nextState.docs);
        setCurrentDocId(nextState.activeId);
        setHistoryIndex(nextIndex);
        
        const activeDoc = nextState.docs.find(d => d.primaryId === nextState.activeId);
        if (activeDoc && editorRef.current) {
            editorRef.current.innerHTML = activeDoc.content;
        }
        
        calculateMetrics();
        calculateLineCount();
    }
}, [historyIndex, historyRef.current.length, calculateMetrics, calculateLineCount]);

    // Function to update the DOM to show the active match (Search/Replace logic)
    const setActiveHighlight = useCallback((index) => {
    if (allMatchElementsRef.current.length === 0) return;

    // Reset all matches to default state
    allMatchElementsRef.current.forEach(el => {
        el.classList.remove('bg-black', 'text-white'); // Active state classes
        el.classList.add('bg-yellow-300'); // Default highlight
    });

    const activeEl = allMatchElementsRef.current[index];
    if (activeEl) {
        activeEl.classList.remove('bg-yellow-300');
        activeEl.classList.add('bg-black', 'text-white'); // Apply active styling
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setCurrentMatchIndex(index);
}, []);


    // 2. Highlight all occurrences of the search text (Search/Replace logic)
    const handleSearch = useCallback(() => {
    if (!editorRef.current) return;

    // First, clear existing highlights without touching other HTML tags
    removeHighlights();

    if (searchText.length < 1) {
        setMatchCount(0);
        setCurrentMatchIndex(-1);
        return;
    }

    const regex = getSearchRegex();
    if (!regex) return;

    // Use a TreeWalker to find all text nodes
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];
    let node;
    while (node = walker.nextNode()) {
        nodesToProcess.push(node);
    }

    let count = 0;
    nodesToProcess.forEach(textNode => {
        const matches = [...textNode.nodeValue.matchAll(regex)];
        if (matches.length > 0) {
            const parent = textNode.parentNode;
            let lastIdx = 0;
            const fragment = document.createDocumentFragment();

            matches.forEach(match => {
                // Text before match
                fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIdx, match.index)));
                
                // The match itself (highlighted)
                const span = document.createElement('span');
                span.className = `${HIGHLIGHT_CLASS} bg-yellow-300 rounded`;
                span.innerText = match[0];
                fragment.appendChild(span);
                
                lastIdx = match.index + match[0].length;
                count++;
            });

            // Remaining text
            fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIdx)));
            parent.replaceChild(fragment, textNode);
        }
    });

    setMatchCount(count);
    allMatchElementsRef.current = Array.from(editorRef.current.querySelectorAll(`.${HIGHLIGHT_CLASS}`));

    if (count > 0) {
        setActiveHighlight(0);
    } else {
        setCurrentMatchIndex(-1);
    }
}, [searchText, getSearchRegex, removeHighlights]);

    // 3. Perform single replacement on the active match (Search/Replace logic)
    const handleReplace = useCallback(() => {
    if (currentMatchIndex === -1 || allMatchElementsRef.current.length === 0) return;
    
    const activeEl = allMatchElementsRef.current[currentMatchIndex];
    
    // 1. Update the text of the span to the replacement text
    activeEl.innerText = replaceText;
    
    // 2. Remove the highlight class so it's no longer a "match"
    activeEl.className = ''; 
    
    // 3. Convert the span back into a regular text node to keep the DOM clean
    const parent = activeEl.parentNode;
    if (parent) {
        parent.replaceChild(document.createTextNode(activeEl.innerText), activeEl);
        parent.normalize(); // Merge adjacent text nodes to maintain editor integrity
    }

    // 4. Refresh search state
    setTimeout(() => {
        handleSearch(); // Find remaining matches
        calculateMetrics();
        calculateLineCount();
    }, 10);
}, [currentMatchIndex, replaceText, handleSearch, calculateMetrics, calculateLineCount]);

    // 4. Navigate to the next match
    const handleNextMatch = useCallback(() => {
        if (matchCount <= 1) return;
        const nextIndex = (currentMatchIndex + 1) % matchCount;
        setActiveHighlight(nextIndex);
    }, [currentMatchIndex, matchCount, setActiveHighlight]);

    // 5. Navigate to the previous match
    const handlePrevMatch = useCallback(() => {
        if (matchCount <= 1) return;
        let prevIndex = (currentMatchIndex - 1 + matchCount) % matchCount;
        setActiveHighlight(prevIndex);
    }, [currentMatchIndex, matchCount, setActiveHighlight]);
    
    // 6. Perform the full replacement (Search/Replace logic)
    const handleReplaceAll = useCallback(() => {
    if (!editorRef.current || searchText.length < 1) return;

    // Use the already captured matches in allMatchElementsRef
    allMatchElementsRef.current.forEach(span => {
        span.innerText = replaceText;
        const parent = span.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(span.innerText), span);
        }
    });

    if (editorRef.current) {
        editorRef.current.normalize();
    }

    // Reset search state
    setSearchText('');
    setMatchCount(0);
    setCurrentMatchIndex(-1);
    allMatchElementsRef.current = [];
    calculateMetrics();
    calculateLineCount();
}, [searchText, replaceText, calculateMetrics, calculateLineCount]);
    
    // 7. Handle final submission of the document
    const handleSubmit = useCallback(() => {
        const finalContent = getCleanText(); 
        if (editorRef.current) {
            editorRef.current.innerText = finalContent;
        }
        calculateMetrics();
        calculateLineCount();
        onSubmit(finalContent);
        
        setSearchText('');
        setMatchCount(0);
        setCurrentMatchIndex(-1);
        allMatchElementsRef.current = [];
    }, [onSubmit, getCleanText, calculateMetrics, calculateLineCount]);
    
// HOOK 9
// Add a debounced save for typing
useEffect(() => {
    console.log("hook 9")
    const timer = setTimeout(() => {
        if (searchText === '') saveState(); 
    }, 1000); // Save state after 1 second of inactivity
    return () => clearTimeout(timer);
}, [charCount, saveState, searchText]);

    // --- Capture/Stop Logic ---
const startRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "inactive") {
        mediaRecorder.start();
        setIsRecording(true);
    }
};

const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        setIsRecording(false);
        // We don't call stopMedia() here yet if you want the preview to stay 
        // until the blob is processed, but usually, we cleanup:
        setRecordingType(null); 
    }
};

const startMedia = async (type) => {
    // 1. Capacitor Native Photo logic
    if (type === 'image' && window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const image = await Camera.getPhoto({
                quality: 90,
                resultType: CameraResultType.Uri,
                source: CameraSource.Prompt
            });
            const response = await fetch(image.webPath);
            const blob = await response.blob();
            const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            addMediaItem(file, 'image');
            return; 
        } catch (err) { return; }
    }

    // 2. Browser / PWA / Native Audio-Video logic
    try {
        const constraints = {
            video: (type === 'image' || type === 'video') ? { facingMode: "user" } : false,
            audio: true
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        setRecordingType(type);
        
        if (videoPreviewRef.current && (type === 'image' || type === 'video')) {
            videoPreviewRef.current.srcObject = newStream;
        }

        if (type === 'video' || type === 'audio') {
            // Select MIME type based on browser support
            const mimeType = type === 'video' ? 'video/webm' : 'audio/webm';
            const recorder = new MediaRecorder(newStream, {
                mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : ''
            });
            
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: recorder.mimeType });
                const ext = type === 'video' ? 'webm' : 'webm'; // or 'mp4'/'wav' depending on support
                const file = new File([blob], `rec_${Date.now()}.${ext}`, { type: blob.type });
                addMediaItem(file, type);
                // Important: cleanup stream tracks after recording stops
                newStream.getTracks().forEach(track => track.stop());
            };

            setMediaRecorder(recorder);
        }
    } catch (err) {
        console.error(err);
        alert("Camera/Mic access denied or not available.");
    }
};

const captureImage = () => {
    if (!videoPreviewRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoPreviewRef.current.videoWidth;
    canvas.height = videoPreviewRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoPreviewRef.current, 0, 0);
    
    canvas.toBlob((blob) => {
        const file = new File([blob], `img_${Date.now()}.jpg`, { type: 'image/jpeg' });
        addMediaItem(file, 'image');
        stopMedia();
    }, 'image/jpeg');
};

const stopMedia = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    setStream(null);
    setRecordingType(null);
    setIsRecording(false);
    setMediaRecorder(null);
};

const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) addMediaItem(file, type);
};

const formatBytes = (bytes) => {
if (!bytes || bytes === 0) return '0 Bytes';
const k = 1024;
const sizes = ['Bytes', 'KB', 'MB', 'GB'];
const i = Math.floor(Math.log(bytes) / Math.log(k));
return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
const totalSize = [...mediaItems, ...canvases].reduce((acc, item) => acc + (item.size || 0), 0);

    const addMediaItem = (file, type) => {
        const url = URL.createObjectURL(file);
        setMediaItems(prev => [...prev, { 
            id: Date.now() + Math.random(), 
            type, 
            url, 
            file, 
            name: file.name,
            size: file.size 
        }]);
    };

    const addCanvas = () => {
        setCanvases(prev => [...prev, { id: Date.now(), data: null }]);
    };

    const removeCanvas = (id) => {
        setCanvases(prev => prev.filter(c => c.id !== id));
        delete canvasRefs.current[id];
    };

    const downloadMedia = async (url, type) => {
    let base64Data = "";
    const fileName = `QDoc_Export_${Date.now()}.${url.startsWith('data:image/png') ? 'png' : (type === 'video' ? 'mp4' : 'jpg')}`;

    try {
        if (url.startsWith('data:')) {
            // It's already a Data URL (like from drawing preview)
            base64Data = url.split(',')[1];
        } else {
            // It's a Blob URL (e.g. blob:http://...)
            // We must fetch it and convert to Base64 for the native bridge
            const response = await fetch(url);
            const blob = await response.blob();
            base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
        }

        // Send the normalized base64 data to our helper
        //await saveFile(fileName, base64Data, true);
    } catch (err) {
        console.error("Media download failed", err);
        alert("Could not process download.");
    }
};

    const removeMediaItem = (id) => {
        setMediaItems(prev => prev.filter(item => item.id !== id));
    };

    const openShadowModal = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        setSavedRange(selection.getRangeAt(0));
        setShowShadowModal(true);
    } else {
        showAlert('warning', 'Please select some text first!');
    }
    };
// HOOK 10
useEffect(() => {
    console.log("hook 10")
    return () => {
        if (typingHistoryTimeoutRef.current) {
            clearTimeout(typingHistoryTimeoutRef.current);
        }
    };
}, []);
    
    // INSERT HANDLERS
    const handleInsertImage = useCallback(() => {
    const url = prompt("Enter the image URL:");
    if (url) {
        const imgHtml = `<img src="${url}" class="resizable-img" style="width: 200px; cursor: pointer; display: inline-block;" />`;
        handleFormat('insertHTML', imgHtml);
    }
}, [handleFormat]);

const handleInsertIframe = useCallback(() => {
    const url = prompt("Enter Web URL or Local File Path to Embed:");
    if (url) {
        const iframeHtml = `
        <div class="iframe-container" contenteditable="false" style="resize: both; overflow: hidden; width: 400px; height: 300px; border: 1px solid #ccc; position: relative; display: inline-block; margin: 10px;">
            <div class="iframe-header" style="background: #eee; padding: 4px; cursor: pointer; text-align: right; font-size: 12px; color: black; border-bottom: 1px solid #ccc;" onclick="const newUrl = prompt('Edit URL:', this.nextElementSibling.src); if(newUrl) this.nextElementSibling.src = newUrl;">
                <i class="bi bi-pencil"></i> Edit Link
            </div>
            <iframe src="${url}" style="width: 100%; height: calc(100% - 26px); border: none; pointer-events: auto;"></iframe>
        </div><p><br></p>`;
        handleFormat('insertHTML', iframeHtml);
    }
}, [handleFormat]);

const handleLocalImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const imgHtml = `<img src="${event.target.result}" class="resizable-img" style="width: 300px; cursor: pointer; display: inline-block; margin: 10px;" />`;
            handleFormat('insertHTML', imgHtml);
        };
        reader.readAsDataURL(file);
    }
};

const handleApply = () => {
    // Call your existing function with the state values
    insertCollapsible({
        name: sectionStyles.name,
        headingTextColor: sectionStyles.headingTextColor,
        bgColor: sectionStyles.bgColor,
        radius: `${sectionStyles.radius}px`
    });
    setOpenSectionControls(false); // Close after inserting
};
const insertCollapsible = (sectionStyles = {name: "Section", headingTextColor: '#f8f9fa' , bgColor: '#f8f9fa', radius: '8px' }) => {
    const editor = editorRef.current;
    if (!editor) return;

    const html = `
        <div class="qdoc-collapsible" contenteditable="false" style="border-radius: ${sectionStyles.radius}">
            <div class="collapsible-header" style="background-color: ${sectionStyles.bgColor}" 
                 onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                <span style="color: ${sectionStyles.headingTextColor}">${sectionStyles.name}</span>
                <i class="bi bi-chevron-down"></i>
            </div>
            <div class="collapsible-content" contenteditable="true">
                <p>Enter content here...</p>
            </div>
        </div><p>&nbsp;</p>
    `;
    
    // Insert at cursor or end
    handleFormat('insertHTML', html);
};

const applyTextShadow = () => {
    if (!savedRange) return;

    // Call the engine with our custom handler and the config object
    handleFormat('textshadow', shadowConfig, savedRange);
    
    setSavedRange(null);
    setShowShadowModal(false);
};

const removeTextShadow = () => {
    if (!savedRange) return;
    
    let parentSpan = savedRange.commonAncestorContainer;
    if (parentSpan.nodeType === 3) parentSpan = parentSpan.parentNode;
    
    const existingSpan = parentSpan.closest('span[data-qshadow="true"]');
    if (existingSpan) {
        // Unwrap the span but keep the text
        const text = existingSpan.innerHTML;
        existingSpan.outerHTML = text;
    }
    setShowShadowModal(false);
};

const handleVideoFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        insertVideoHtml(url);
    }
};

const insertVideoHtml = (src) => {
    const videoHtml = `<video src="${src}" controls class="resizable-video" style="width: 300px; display: block; margin: 10px 0;"></video><p><br></p>`;
    handleFormat('insertHTML', videoHtml);
};
// HOOK 11
useEffect(() => {
    console.log("Hook 11")
    const editor = editorRef.current;
    if (!editor) return;

    const handleMouseDown = (e) => {
        if (e.target.tagName === 'IMG') {
            const img = e.target;
            const startX = e.clientX;
            const startWidth = img.offsetWidth;

            // Simple "drag to resize" logic
            const onMouseMove = (moveEvent) => {
                const currentX = moveEvent.clientX;
                const newWidth = startWidth + (currentX - startX);
                img.style.width = `${newWidth}px`;
                img.style.height = 'auto'; // Maintain aspect ratio
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                calculateMetrics(); // Update counts if necessary
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            
            // Prevent the default browser drag-and-drop behavior
            e.preventDefault();
        }
    };
    const handleLinkClick = (e) => {
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault(); // Prevent standard browser navigation
            const href = link.getAttribute('href');
            if (window.handleDocumentLinkClick) {
                window.handleDocumentLinkClick(href);
            }
        }
    };
    editor.addEventListener('click', handleLinkClick);
    editor.addEventListener('mousedown', handleMouseDown);
    return () => {
        editor.removeEventListener('mousedown', handleMouseDown);
        editor.removeEventListener('click', handleLinkClick);
        // Automatically save state when the modal is closed to open a new file
        if (saveState) saveState(); 
    };
}, [calculateMetrics, saveState]);

const handleInsertLink = useCallback(() => {
    const url = prompt("Enter link URL:");
    if (url) {
        handleFormat('createlink', url); 
    }
}, [handleFormat]);

const handleInsertUnorderedList = useCallback(() => {
    handleFormat('insertunorderedlist');
}, [handleFormat]);

const handleInsertOrderedList = useCallback(() => {
    handleFormat('insertorderedlist');
}, [handleFormat]);

    const syncInteractiveElements = () => {
    if (!editorRef.current) return;
    
    // 1. Sync Checkboxes
    editorRef.current.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked ? cb.setAttribute('checked', '') : cb.removeAttribute('checked');
    });

    // 2. Sync Radios
    editorRef.current.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked ? radio.setAttribute('checked', '') : radio.removeAttribute('checked');
    });

    // 3. Sync Toggle Lists
    editorRef.current.querySelectorAll('details').forEach(detail => {
        detail.open ? detail.setAttribute('open', '') : detail.removeAttribute('open');
    });
};

const insertCheckbox = () => {
    editorRef.current.focus();
    const html = '<span><input type="checkbox" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; margin-right: 0.5rem;">&nbsp;</span>';    
    handleFormat('inserthtml', html);
    if (typeof handleInput === 'function') handleInput();
};

const insertToggleList = () => {
    editorRef.current.focus();
    const toggleHtml = `
        <details class="custom-toggle" style="border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 8px; margin: 8px 0;">
            <summary style="cursor: pointer; font-weight: 600; padding: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>New Toggle List</span>
                <button class="delete-element-btn" style="border: none; background: none; color: #dc3545; cursor: pointer;" contenteditable="false">
                    <i class="bi bi-trash"></i>
                </button>
            </summary>
            <div style="padding: 10px; margin-top: 5px; border-top: 1px solid rgba(0,0,0,0.05);" contenteditable="true">
                Type hidden content here...
            </div>
        </details><br>`;
    handleFormat('inserthtml', toggleHtml);
    if (typeof handleInput === 'function') handleInput();
};

const insertRadioButton = () => {
    const count = prompt("Options?", "2");
    if (!count || isNaN(count)) return;

    const groupId = `group_${Date.now()}`;
    let optionsHtml = '';
    for (let i = 1; i <= parseInt(count); i++) {
        optionsHtml += `
            <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
                <input type="radio" name="${groupId}" id="${groupId}_${i}" ${i === 1 ? 'checked' : ''}>
                <label for="${groupId}_${i}" style="margin: 0;" contenteditable="true">Option ${i}</label>
            </div>`;
    }

    const containerHtml = `
        <div class="radio-container" contenteditable="false" style="border: 1px solid rgba(0,0,0,0.1); padding: 10px; border-radius: 8px; margin: 8px 0; display: inline-block; min-width: 180px; background: rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <span style="font-size: 0.7rem; color: gray; font-weight: bold;">RADIO GROUP</span>
                <button class="delete-element-btn" style="border: none; background: none; color: #dc3545; cursor: pointer;" title="Delete">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            </div>
            <div style="outline: none;" contenteditable="true">${optionsHtml}</div>
        </div><br>`;
    
    handleFormat('inserthtml', containerHtml);
    if (typeof handleInput === 'function') handleInput();
};

    // Insert Table (Dynamic Rows/Cols)
    const handleInsertTable = useCallback(() => {
        editorRef.current.focus();
        
        // Use prompt for simplicity to get input
        const rowsInput = prompt("Enter the number of rows (e.g., 3):", "3");
        const colsInput = prompt("Enter the number of columns (e.g., 3):", "3");

        const rows = parseInt(rowsInput);
        const cols = parseInt(colsInput);

        if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) {
            alert("Invalid input. Please enter valid positive numbers for rows and columns.");
            return;
        }

        let tableHTML = `
            <table border="1" style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            <thead><tr>`;

        // 1. Generate Headers
        for (let i = 1; i <= cols; i++) {
            tableHTML += `<th>Header ${i}</th>`;
        }
        tableHTML += `</tr></thead><tbody>`;

        // 2. Generate Data Rows
        for (let i = 1; i <= rows; i++) {
            tableHTML += `<tr>`;
            for (let j = 1; j <= cols; j++) {
                tableHTML += `<td>Cell R${i}C${j}</td>`;
            }
            tableHTML += `</tr>`;
        }
        
        tableHTML += `</tbody></table><p>Type here...</p>`;
        
        handleFormat('inserthtml', tableHTML);
    }, [handleFormat]);

    const fileInputRef = useRef(null); // Ref for hidden file input

const applySyntaxRules = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    // 1. CLEANUP PHASE: Unwrap all existing syntax spans
    const existing = editor.querySelectorAll('[data-syntax-rule="true"]');
    existing.forEach(el => {
        // Unwrap: move children out, then remove the span
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
    });
    
    // CRITICAL: Merge text nodes back together. 
    // Without this, "Hello" might be split into "He" and "llo", breaking future searches.
    editor.normalize(); 

    // 2. APPLY RULES PHASE
    // We snapshot text nodes first so our loop isn't affected by DOM changes during iteration
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    const nodeSnapshot = [];
    while (walker.nextNode()) nodeSnapshot.push(walker.currentNode);

    syntaxRules.forEach(rule => {
        const { type, val, caseSensitive, style } = rule;
        if (!val && type !== 'equals' && type !== 'greaterThan' && type !== 'lessThan') return;

        const searchVal = caseSensitive ? val : val.toLowerCase();

        // BLOCK RULES (Applied to parent elements like <p>, <td>)
        if (['equals', 'startsWith', 'endsWith', 'greaterThan', 'lessThan'].includes(type)) {
            const blocks = editor.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, td, th');
            blocks.forEach(block => {
                let text = block.innerText.trim();
                if (!caseSensitive) text = text.toLowerCase();
                
                let match = false;
                const numText = parseFloat(text);
                const numVal = parseFloat(searchVal);

                if (type === 'equals') match = text === searchVal;
                else if (type === 'startsWith') match = text.startsWith(searchVal);
                else if (type === 'endsWith') match = text.endsWith(searchVal);
                else if (type === 'greaterThan' && !isNaN(numText) && !isNaN(numVal)) match = numText > numVal;
                else if (type === 'lessThan' && !isNaN(numText) && !isNaN(numVal)) match = numText < numVal;

                if (match) {
                    block.dataset.syntaxRule = "true";
                    Object.assign(block.style, {
                        color: style.color || '',
                        backgroundColor: style.backgroundColor || '',
                        fontSize: style.fontSize ? `${style.fontSize}pt` : ''
                    });
                }
            });
        }
        
        // INLINE RULES (Contains) - Applied to text nodes
    // INLINE RULES (Contains)
if (type === 'contains' && val) {
    nodeSnapshot.forEach(node => {
        // We only process nodes that are still in the DOM and are actual text
        if (!node.parentNode || node.nodeType !== Node.TEXT_NODE) return;

        const originalText = node.nodeValue;
        let segments = [{ text: originalText, style: null }];

        // Run EVERY rule against the current segments
        syntaxRules.forEach(rule => {
            if (rule.type !== 'contains' || !rule.val) return;

            const newSegments = [];
            const regex = new RegExp(
                rule.val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                rule.caseSensitive ? 'g' : 'gi'
            );

            segments.forEach(seg => {
                // Only try to match text that hasn't been styled by a previous rule yet
                if (seg.style) {
                    newSegments.push(seg);
                    return;
                }

                let lastIdx = 0;
                let match;
                while ((match = regex.exec(seg.text)) !== null) {
                    if (match.index > lastIdx) {
                        newSegments.push({ text: seg.text.slice(lastIdx, match.index), style: null });
                    }
                    newSegments.push({ 
                        text: match[0], 
                        style: rule.style // Assign the style object from the rule
                    });
                    lastIdx = regex.lastIndex;
                }
                if (lastIdx < seg.text.length) {
                    newSegments.push({ text: seg.text.slice(lastIdx), style: null });
                }
            });
            segments = newSegments;
        });

        // Only update the DOM if we actually found matches
        if (segments.length > 1 || (segments.length === 1 && segments[0].style)) {
            const fragment = document.createDocumentFragment();
            segments.forEach(seg => {
                if (seg.style) {
                    const span = document.createElement('span');
                    span.className = 'syntax-wrapper';
                    span.dataset.syntaxRule = "true";
                    span.textContent = seg.text;
                    Object.assign(span.style, {
                        color: seg.style.color || '',
                        backgroundColor: seg.style.backgroundColor || '',
                        fontSize: seg.style.fontSize ? `${seg.style.fontSize}pt` : ''
                    });
                    fragment.appendChild(span);
                } else {
                    fragment.appendChild(document.createTextNode(seg.text));
                }
            });
            node.parentNode.replaceChild(fragment, node);
        }
    });
}
    });
};
const clearAllSyntaxRules = () => {
    setSyntaxRules([]);
    setTimeout(() => {
        applySyntaxRules();        
        if (typeof calculateMetrics === 'function') {
            calculateMetrics();
        }
    }, 0);
};

const handleExportRules = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(syntaxRules));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "syntax_rules.json");
    dlAnchorElem.click();
};

const handleImportRules = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const json = JSON.parse(ev.target.result);
            if (Array.isArray(json)) setSyntaxRules(json);
            else alert("Invalid JSON format");
        } catch(err) { alert("Error parsing JSON"); }
    };
    reader.readAsText(file);
};
 
    const handleOdtFileChange = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);

    // 1. Extract Images
    const imageMap = {}; 
    const imagePromises = [];
    content.forEach((relativePath, zipEntry) => {
        if (relativePath.startsWith("Pictures/")) {
        const promise = zipEntry.async("blob").then((blob) => {
        imageMap[relativePath] = URL.createObjectURL(blob);
        });
        imagePromises.push(promise);
        }
    });
    await Promise.all(imagePromises);

    if (content.file("content.xml")) {
        const xmlText = await content.file("content.xml").async("string");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // 2. PARSE STYLES & FONT DEFS
        const textStyles = {}; 
        const paragraphStyles = {}; 
        const listStyles = {}; 

        // Helper: Map ODT pt size to HTML 1-7 scale
        const mapFontSize = (ptStr) => {
        if (!ptStr) return null;
        const pt = parseFloat(ptStr);
        if (pt <= 8) return "1";
        if (pt <= 10) return "2";
        if (pt <= 12) return "3";
        if (pt <= 14) return "4";
        if (pt <= 18) return "5";
        if (pt <= 24) return "6";
        return "7";
        };

        const styles = xmlDoc.getElementsByTagName("style:style");
        for (let i = 0; i < styles.length; i++) {
        const style = styles[i];
        const styleName = style.getAttribute("style:name");
        
        const textProps = style.getElementsByTagName("style:text-properties")[0];
        if (textProps) {
        // Font Name & Size
        const fontName = textProps.getAttribute("style:font-name") || textProps.getAttribute("fo:font-family");
        const fontSize = mapFontSize(textProps.getAttribute("fo:font-size"));

        // Existing Props
        const fw = textProps.getAttribute("fo:font-weight") || textProps.getAttribute("style:font-weight");
        const bold = fw === "bold";
        const fs = textProps.getAttribute("fo:font-style") || textProps.getAttribute("style:font-style");
        const italic = fs === "italic";
        const tus = textProps.getAttribute("style:text-underline-style");
        const underline = tus && tus !== "none";
        const color = textProps.getAttribute("fo:color");
        const backgroundColor = textProps.getAttribute("fo:background-color") || textProps.getAttribute("style:text-background-color");
        
        let subSuper = null;
        const textPos = textProps.getAttribute("style:text-position");
        if (textPos) {
        if (textPos.includes("super")) subSuper = "super";
        else if (textPos.includes("sub")) subSuper = "sub";
        }

        textStyles[styleName] = { bold, italic, underline, color, backgroundColor, subSuper, fontName, fontSize };
        }

        const paraProps = style.getElementsByTagName("style:paragraph-properties")[0];
        if (paraProps) {
        const align = paraProps.getAttribute("fo:text-align");
        const textAlign = align === 'start' ? 'left' : align === 'end' ? 'right' : align;
        paragraphStyles[styleName] = { textAlign };
        }
        }

        // Parse List Styles
        const listStyleTags = xmlDoc.getElementsByTagName("text:list-style");
        for (let i = 0; i < listStyleTags.length; i++) {
        const lStyle = listStyleTags[i];
        const name = lStyle.getAttribute("style:name");
        const hasNumbering = lStyle.getElementsByTagName("text:list-level-style-number").length > 0;
        listStyles[name] = hasNumbering ? "ol" : "ul";
        }

        // 3. INLINE PROCESSOR
        const processInlineNodes = (node) => {
        let html = '';
        node.childNodes.forEach(child => {
        if (child.nodeType === 3) {
        html += child.nodeValue;
        } 
        else if (child.tagName === "text:span") {
        const styleName = child.getAttribute("text:style-name");
        const style = textStyles[styleName];
        let inner = processInlineNodes(child);
        
        if (style) {
            let styleAttr = '';
            if (style.color && style.color !== 'transparent') styleAttr += `color: ${style.color};`;
            if (style.backgroundColor && style.backgroundColor !== 'transparent') styleAttr += `background-color: ${style.backgroundColor};`;
            if (style.fontName) styleAttr += `font-family: '${style.fontName}', sans-serif;`;
            
            // Wrap in color/font span
            if (styleAttr) inner = `<span style="${styleAttr}">${inner}</span>`;
            
            // Wrap in size font tag (compatible with React-Bootstrap editor logic)
            if (style.fontSize) inner = `<font size="${style.fontSize}">${inner}</font>`;
            
            if (style.bold) inner = `<strong>${inner}</strong>`;
            if (style.italic) inner = `<em>${inner}</em>`;
            if (style.underline) inner = `<u>${inner}</u>`;
            if (style.subSuper === 'super') inner = `<sup>${inner}</sup>`;
            if (style.subSuper === 'sub') inner = `<sub>${inner}</sub>`;
        }
        html += inner;
        } 
        else if (child.tagName === "text:tab") html += "&emsp;";
        else if (child.tagName === "text:line-break") html += "<br/>";
        else if (child.tagName === "text:a") {
        const href = child.getAttribute("xlink:href");
        html += `<a href="${href}">${processInlineNodes(child)}</a>`;
        }
        else if (child.tagName === "draw:frame") {
        const width = child.getAttribute("svg:width");
        const height = child.getAttribute("svg:height");
        const frameStyle = `width: ${width}; height: ${height}; display: inline-block;`;
        const imageNode = child.getElementsByTagName("draw:image")[0];
        if (imageNode) {
            const href = imageNode.getAttribute("xlink:href");
            const imageUrl = imageMap[href];
            if (imageUrl) html += `<img src="${imageUrl}" style="${frameStyle}" alt="Embedded" />`;
        }
        }
        });
        return html;
        };

        // 4. BLOCK PROCESSOR
        const processBlockNodes = (node) => {
        let html = '';
        node.childNodes.forEach(child => {
        if (child.tagName === "text:p") {
        const styleName = child.getAttribute("text:style-name");
        const pStyle = paragraphStyles[styleName];
        const alignStyle = pStyle?.textAlign ? `style="text-align: ${pStyle.textAlign}"` : '';
        html += `<p ${alignStyle}>${processInlineNodes(child)}</p>`;
        } 
        else if (child.tagName === "text:h") {
        const level = child.getAttribute("text:outline-level") || "3";
        const safeLevel = Math.min(Math.max(parseInt(level), 1), 6);
        const styleName = child.getAttribute("text:style-name");
        const pStyle = paragraphStyles[styleName];
        const alignStyle = pStyle?.textAlign ? `style="text-align: ${pStyle.textAlign}"` : '';
        html += `<h${safeLevel} ${alignStyle}>${processInlineNodes(child)}</h${safeLevel}>`;
        }
        else if (child.tagName === "text:list") {
        const listStyleName = child.getAttribute("text:style-name");
        const tag = listStyles[listStyleName] || "ul";
        let listHtml = `<${tag}>`;
        child.childNodes.forEach(li => {
            if (li.tagName === "text:list-item") listHtml += `<li>${processBlockNodes(li)}</li>`;
        });
        listHtml += `</${tag}>`;
        html += listHtml;
        }
        else if (child.tagName === "table:table") {
        let tableHtml = '<table border="1" style="width:100%; border-collapse: collapse; margin-bottom: 1em;"><tbody>';
        child.childNodes.forEach(row => {
            if (row.tagName === "table:table-row") {
            tableHtml += '<tr>';
            row.childNodes.forEach(cell => {
            if (cell.tagName === "table:table-cell") {
            const span = cell.getAttribute("table:number-columns-spanned");
            const colSpanAttr = span ? `colspan="${span}"` : '';
            tableHtml += `<td ${colSpanAttr} style="padding: 5px;">${processBlockNodes(cell)}</td>`;
            }
            });
            tableHtml += '</tr>';
            }
        });
        tableHtml += '</tbody></table>';
        html += tableHtml;
        }
        });
        return html;
        };

        // 5. FINISH
        const officeText = xmlDoc.getElementsByTagName("office:text")[0];
        if (officeText && editorRef.current) {
        const finalHtml = processBlockNodes(officeText);
        editorRef.current.focus();
        editorRef.current.innerHTML = finalHtml;
        saveState();
        calculateMetrics();
        calculateLineCount();
        }
    }
    } catch (err) {
    console.error("ODT Parse Error:", err);
    alert("Error opening file.");
    }
    event.target.value = '';
    }, [saveState, calculateMetrics, calculateLineCount]);

const handleDownloadOdt = useCallback(async () => {
  if (!editorRef.current) return;

  const zip = new JSZip();

  // 1. Mandatory mimetype (uncompressed)
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
   <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
     <rootfiles>
       <rootfile full-path="content.xml" media-type="text/xml"/>
     </rootfiles>
   </container>`;
  zip.folder("META-INF").file("container.xml", containerXml);

  // 3. Enhanced Recursive Converter
  const convertToOdt = (nodes) => {
    let xml = '';
    nodes.forEach(node => {
      if (node.nodeType === 3) { // Text Node
        xml += node.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      } else if (node.tagName === 'P' || node.tagName === 'DIV') {
        xml += `<text:p>${convertToOdt(node.childNodes)}</text:p>`;
      } else if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3' || node.tagName === 'H4' || node.tagName === 'H5' || node.tagName === 'H6') {
        const level = node.tagName.substring(1);
        xml += `<text:h text:outline-level="${level}">${convertToOdt(node.childNodes)}</text:h>`;
      } else if (node.tagName === 'STRONG' || node.tagName === 'B') {
        xml += `<text:span text:style-name="Bold">${convertToOdt(node.childNodes)}</text:span>`;
      } else if (node.tagName === 'EM' || node.tagName === 'I') {
        xml += `<text:span text:style-name="Italic">${convertToOdt(node.childNodes)}</text:span>`;
      } else if (node.tagName === 'U') {
        xml += `<text:span text:style-name="Underline">${convertToOdt(node.childNodes)}</text:span>`;
      } 
      // --- LIST HANDLING ---
      else if (node.tagName === 'UL' || node.tagName === 'OL') {
        const styleName = node.tagName === 'OL' ? "L1_Ordered" : "L1_Unordered";
        xml += `<text:list text:style-name="${styleName}">`;
        Array.from(node.childNodes).forEach(li => {
          if (li.tagName === 'LI') {
            // ODT list items must contain a paragraph or header
            xml += `<text:list-item><text:p>${convertToOdt(li.childNodes)}</text:p></text:list-item>`;
          }
        });
        xml += `</text:list>`;
      }
      // --- TABLE HANDLING ---
      else if (node.tagName === 'TABLE') {
        xml += `<table:table table:name="Table1">`;
        // Process TBODY or directly rows
        const rows = node.querySelectorAll('tr');
        rows.forEach(row => {
          xml += `<table:table-row>`;
          row.childNodes.forEach(cell => {
            if (cell.tagName === 'TD' || cell.tagName === 'TH') {
              xml += `<table:table-cell office:value-type="string">`;
              xml += `<text:p>${convertToOdt(cell.childNodes)}</text:p>`;
              xml += `</table:table-cell>`;
            }
          });
          xml += `</table:table-row>`;
        });
        xml += `</table:table>`;
      }
      else if (node.tagName === 'BR') {
        xml += `<text:line-break/>`;
      } else {
        // Fallback for spans or unknown tags
        xml += convertToOdt(node.childNodes);
      }
    });
    return xml;
  };

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = editorRef.current.innerHTML;
  const contentXmlBody = convertToOdt(tempDiv.childNodes);

  // 4. Wrap with Table and List Styles
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content 
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-proportional:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight="bold"/></style:style>
    <style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic" style:font-style="italic"/></style:style>
    <style:style style:name="Underline" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
    
    <text:list-style style:name="L1_Unordered">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•">
        <style:list-level-properties text:list-level-position-and-space-mode="label-alignment"/>
      </text:list-level-style-bullet>
    </text:list-style>
    <text:list-style style:name="L1_Ordered">
      <text:list-level-style-number text:level="1" style:num-format="1">
        <style:list-level-properties text:list-level-position-and-space-mode="label-alignment"/>
      </text:list-level-style-number>
    </text:list-style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${contentXmlBody}
    </office:text>
  </office:body>
</office:document-content>`;

  zip.file("content.xml", contentXml);

  // 5. Build and Trigger Download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document.odt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}, []);

    const triggerFileUpload = () => {
    fileInputRef.current?.click();
    };

    // HOOK 12
    // Side effect to initialize text and metrics
    useEffect(() => {
        console.log("Hook 12")
    if (editorRef.current) {
        if (editorRef.current.innerText === '') {
            editorRef.current.innerText = initialText;
            // FIX: Moved these INSIDE the condition
            calculateMetrics();
            calculateLineCount(); 
        }
    }
}, [initialText, calculateMetrics, calculateLineCount]);

    // Remove highlighting and update metrics whenever the user types
    const handleInput = useCallback(() => {
        // We only clear the tracking state. 
        // We do NOT call removeHighlights here because it would interfere 
        // with the user's typing experience if they are typing inside a match.
        setMatchCount(0);
        setCurrentMatchIndex(-1);
        allMatchElementsRef.current = [];
        
        calculateMetrics(); 
        calculateLineCount();
    }, [calculateMetrics, calculateLineCount]);

    // HOOK 13
    // Rerun search when searchText, case/whole word settings change
    useEffect(() => {
        console.log("hook 13")
        if (searchText.length > 0) {
            handleSearch();
        } else {
            // Use the DOM-safe cleanup
            removeHighlights();
            setMatchCount(0);
            setCurrentMatchIndex(-1);
        }
    }, [searchText, isCaseSensitive, isWholeWord, removeHighlights, handleSearch]);

    const SearchOptionButton = ({ label, isActive, onClick }) => (
        <Button onClick={onClick} variant={isActive ? 'primary' : 'outline-secondary'} size="sm" className="rounded-pill">{label}</Button>
    );
    
    // Component to render the line numbers
    const LineNumberGutter = ({ currentDoc, editorRef }) => {
    const numbers = [];
    if (currentDoc) {
        for (let i = currentDoc.startLine; i <= currentDoc.endLine; i++) {
            numbers.push(i);
        }
    }

    const handleScroll = useCallback(() => {
        if (lineNumberRef.current && editorRef.current) {
            lineNumberRef.current.scrollTop = editorRef.current.scrollTop;
        }
    }, [editorRef]);

    // HOOK 14
    // Hook is now safely above the early return
    useEffect(() => {
        console.log("hook 14")
        const currentEditor = editorRef.current;
        if (currentEditor) {
            currentEditor.addEventListener('scroll', handleScroll);
            return () => currentEditor.removeEventListener('scroll', handleScroll);
        }
    }, [editorRef, handleScroll]);

    if (!currentDoc) return null;

    return (
        <div ref={lineNumberRef} style={editorGutterStyle}>
            {numbers.map(num => (<div key={num}>{num}</div>))}
        </div>
    );
};

const handleCreateNewDoc = () => {
    const newDocId = `doc_${Date.now()}`;
    const newDoc = {
        title: `${currentFileName} - Part ${documents.length + 1}`,
        primaryId: newDocId,
        nextId: null,
        prevId: currentDocId, // Link to current doc
        content: '<p><br></p>',
        startLine: currentDoc ? currentDoc.endLine + 1 : 1,
        endLine: currentDoc ? currentDoc.endLine + 1 : 1,
        docWidth: globalDocSettings?.docWidth || 800,
        docHeight: globalDocSettings?.docHeight || 1120,
        typeMode: globalDocSettings?.typeMode || 'smooth',
        leftMargin: globalDocSettings?.leftMargin || 40,
        rightMargin: globalDocSettings?.rightMargin || 40,
        topMargin: globalDocSettings?.topMargin || 40,
        bottomMargin: globalDocSettings?.bottomMargin || 40,
        globalStylesOverride: false
    };

    setDocuments(prev => {
        const updated = prev.map(d => {
            // Update the current document's nextId and force-save its content
            if (d.primaryId === currentDocId) {
                return { ...d, nextId: newDocId, content: editorRef.current.innerHTML };
            }
            return d;
        });
        return [...updated, newDoc];
    });
    setCurrentDocId(newDocId);
};

const handleNextDoc = () => {
    if (currentDoc && currentDoc.nextId) {
        // Save current content before switching
        setDocuments(docs => docs.map(d => d.primaryId === currentDoc.primaryId ? { ...d, content: editorRef.current.innerHTML } : d));
        setCurrentDocId(currentDoc.nextId);
    }
};

const handlePrevDoc = () => {
    if (currentDoc && currentDoc.prevId) {
        // Save current content before switching
        setDocuments(docs => docs.map(d => d.primaryId === currentDoc.primaryId ? { ...d, content: editorRef.current.innerHTML } : d));
        setCurrentDocId(currentDoc.prevId);
    }
};

// Helper for creating a document object inside complex parsers
const setSingleDocumentState = (html) => {
    const docId = `doc_${Date.now()}`;
    const wrappedContent = `<div class="qdoc-page">${html}</div>`;
    
    const newDoc = {
        title: currentFileName || "Imported Document",
        primaryId: docId,
        nextId: null,
        prevId: null,
        content: wrappedContent,
        startLine: 1,
        endLine: 1,
        docWidth: globalDocSettings?.docWidth || 800,
        docHeight: globalDocSettings?.docHeight || 1120,
        typeMode: viewMode || 'paged',
        leftMargin: 40, rightMargin: 40, topMargin: 40, bottomMargin: 40,
        globalStylesOverride: false
    };

    setDocuments([newDoc]);
    setCurrentDocId(docId);
    
    if (editorRef.current) {
        editorRef.current.innerHTML = wrappedContent;
    }
    
    // Trigger virtual pagination engine after mount
    setTimeout(() => {
        if (typeof runPaginationEngine === 'function') runPaginationEngine();
    }, 100);
};
  
// 1. FILE PROCESSORS (For Imports & Opening)
const processOdt = useCallback(async (file) => {
    if (!file) return;
    try {
        const zip = new JSZip();
        const content = await zip.loadAsync(file);

        // 1. Extract Images
        const imageMap = {}; 
        const imagePromises = [];
        content.forEach((relativePath, zipEntry) => {
            if (relativePath.startsWith("Pictures/")) {
                imagePromises.push(zipEntry.async("blob").then(blob => {
                    imageMap[relativePath] = URL.createObjectURL(blob);
                }));
            }
        });
        await Promise.all(imagePromises);

        // 2. Parse Content
        if (content.file("content.xml")) {
            const xmlText = await content.file("content.xml").async("string");
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            // Check for Parse Errors
            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                console.error("XML Parser Error");
                return;
            }

            // Styles
            const textStyles = {}; 
            const paragraphStyles = {};
            const listStyles = {};

            const mapFontSize = (ptStr) => {
                if (!ptStr) return null;
                const pt = parseFloat(ptStr);
                return pt <= 10 ? "2" : pt <= 12 ? "3" : pt <= 14 ? "4" : "5";
            };

            const styles = xmlDoc.getElementsByTagName("style:style");
            for (let i = 0; i < styles.length; i++) {
                const style = styles[i];
                const name = style.getAttribute("style:name");
                const textProps = style.getElementsByTagName("style:text-properties")[0];
                if (textProps) {
                    textStyles[name] = {
                        bold: (textProps.getAttribute("fo:font-weight") || textProps.getAttribute("style:font-weight")) === "bold",
                        italic: (textProps.getAttribute("fo:font-style") || textProps.getAttribute("style:font-style")) === "italic",
                        underline: (textProps.getAttribute("style:text-underline-style")) !== "none",
                        color: textProps.getAttribute("fo:color"),
                        fontSize: mapFontSize(textProps.getAttribute("fo:font-size"))
                    };
                }
                const paraProps = style.getElementsByTagName("style:paragraph-properties")[0];
                if (paraProps) {
                    const align = paraProps.getAttribute("fo:text-align");
                    paragraphStyles[name] = { textAlign: align === 'start' ? 'left' : align === 'end' ? 'right' : align };
                }
            }

            // Processors
            const processInlineNodes = (node) => {
                let html = '';
                node.childNodes.forEach(child => {
                    if (child.nodeType === 3) html += child.nodeValue;
                    else if (child.tagName === "text:span") {
                        const style = textStyles[child.getAttribute("text:style-name")];
                        let inner = processInlineNodes(child);
                        if (style) {
                            if (style.bold) inner = `<strong>${inner}</strong>`;
                            if (style.italic) inner = `<em>${inner}</em>`;
                            if (style.underline) inner = `<u>${inner}</u>`;
                            if (style.color) inner = `<span style="color:${style.color}">${inner}</span>`;
                            if (style.fontSize) inner = `<font size="${style.fontSize}">${inner}</font>`;
                        }
                        html += inner;
                    } 
                    else if (child.tagName === "text:line-break") html += "<br/>";
                    else if (child.tagName === "draw:frame") {
                        const img = child.getElementsByTagName("draw:image")[0];
                        if (img) {
                            const url = imageMap[img.getAttribute("xlink:href")];
                            const w = child.getAttribute("svg:width") || "auto";
                            html += `<img src="${url}" style="width:${w};" />`;
                        }
                    }
                });
                return html;
            };

            const processBlockNodes = (node) => {
                let html = '';
                node.childNodes.forEach(child => {
                    if (child.tagName === "text:p") {
                        const style = paragraphStyles[child.getAttribute("text:style-name")];
                        const align = style?.textAlign ? `style="text-align:${style.textAlign}"` : '';
                        html += `<p ${align}>${processInlineNodes(child)}</p>`;
                    } 
                    else if (child.tagName === "text:h") {
                        const level = child.getAttribute("text:outline-level") || "3";
                        html += `<h${level}>${processInlineNodes(child)}</h${level}>`;
                    }
                    else if (child.tagName === "table:table") {
                        html += `<table border="1" style="width:100%; border-collapse:collapse;"><tbody>`;
                        child.childNodes.forEach(row => {
                            if(row.tagName === "table:table-row") {
                                html += "<tr>";
                                row.childNodes.forEach(cell => {
                                    if(cell.tagName === "table:table-cell") html += `<td style="padding:5px;">${processBlockNodes(cell)}</td>`;
                                });
                                html += "</tr>";
                            }
                        });
                        html += `</tbody></table>`;
                    }
                });
                return html;
            };
            
            console.log("SET DATA IN ODT");

            const officeText = xmlDoc.getElementsByTagName("office:text")[0];
            if (officeText) {
                const generatedHtml = processBlockNodes(officeText);
                
                // 1. Clear Mind Map data for this file type
                setMindMapData(null); 
                
                // 2. Push to virtualized array using the helper instead of setPendingContent
                setSingleDocumentState(generatedHtml);
                
                console.log("SET DATA IN ODT FINISHED");
            }
        }
    } catch (err) { 
        console.error("ODT Import Error:", err); 
        setIsDataReady(true);
    } finally {
        // ALWAYS signal that loading is finished, even if it failed
        setIsDataReady(true);
    }
}, [setMindMapData]);

const processQDoc = useCallback(async (file) => {

    if (!file) return;
    try {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);

        const docFile = contents.file("document.json");
        if (!docFile) throw new Error("Invalid qDoc: document.json missing");

        const docData = JSON.parse(await docFile.async("string"));
        setIsLocked(false);
        setPassword('');

        if (docData.encrypted) {
            setPendingEncryptedData(docData.payload);
            setShowUnlockModal(true);
            setIsDataReady(true);
            return;
        }
        
        // 1. Sync global properties
        if (docData.globalSettings) {
            setGlobalDocSettings(docData.globalSettings);
        }
        setDocColor(docData.docColor || '');
        setDocBgImage(docData.docBgImage || '');
        setViewMode(docData.viewMode || 'smooth');
        setPageDims(docData.pageDims || { width: 800, height: 1120 });
        
        if (docData.rules) setSyntaxRules(docData.rules);
        setMindMapData(docData.mindMap || { nodes: [], connectors: [] });

        // 2. Hydrate Assets
        const assetMap = {};
        const videoMap = {};
        const mediaMap = {};
        const canvasMap = {};
        const promises = [];

        const assetFolder = contents.folder("assets");
        if (assetFolder) {
            assetFolder.forEach((path, entry) => {
                promises.push(entry.async("blob").then(blob => {
                    assetMap[`assets/images/${path}`] = URL.createObjectURL(blob);
                }));
            });
        }

        const videoFolder = contents.folder("videos");
        if (videoFolder) {
            videoFolder.forEach((path, entry) => {
                promises.push(entry.async("blob").then(blob => {
                    videoMap[`assets/videos/${path}`] = URL.createObjectURL(blob);
                }));
            });
        }

        const mediaFolder = contents.folder("media");
        if (mediaFolder) {
            mediaFolder.forEach((path, entry) => {
                const fullPath = `media/${path}`;
                promises.push(entry.async("blob").then(blob => {
                    const url = URL.createObjectURL(blob);
                    if (path.startsWith("canvases/")) canvasMap[fullPath] = url;
                    else mediaMap[fullPath] = url;
                }));
            });
        }

        await Promise.all(promises);

        // 3. Reconstruct Documents Array (Handle both New Array Logic and Legacy Content)
        let loadedDocs = [];
        const parser = new DOMParser();

        if (docData.documents && Array.isArray(docData.documents)) {
            // MAP OVER SAVED LINKED-LIST
            loadedDocs = docData.documents.map(doc => {
                const tempDoc = parser.parseFromString(doc.content, 'text/html');
                
                tempDoc.querySelectorAll('img').forEach(img => {
                    const internalPath = img.getAttribute('src'); 
                    if (assetMap[internalPath]) img.src = assetMap[internalPath];
                });

                tempDoc.querySelectorAll('video').forEach(v => {
                    const internalPath = v.getAttribute('src');
                    if (videoMap[internalPath]) v.src = videoMap[internalPath];
                });

                return { ...doc, content: tempDoc.body.innerHTML };
            });
        } else {
            // FALLBACK FOR OLD FILES
            const tempDoc = parser.parseFromString(docData.content, 'text/html');
            
            tempDoc.querySelectorAll('img').forEach(img => {
                const internalPath = img.getAttribute('src'); 
                if (assetMap[internalPath]) img.src = assetMap[internalPath];
            });

            tempDoc.querySelectorAll('video').forEach(v => {
                const internalPath = v.getAttribute('src');
                if (videoMap[internalPath]) v.src = videoMap[internalPath];
            });

            const docId = `doc_${Date.now()}`;
            loadedDocs = [{
                title: currentFileName,
                primaryId: docId,
                nextId: null,
                prevId: null,
                content: tempDoc.body.innerHTML,
                startLine: 1,
                endLine: Math.max(1, tempDoc.body.innerHTML.split('\n').length),
                docWidth: docData.pageDims?.width || 800,
                docHeight: docData.pageDims?.height || 1120,
                typeMode: docData.viewMode || 'smooth',
                leftMargin: 40, rightMargin: 40, topMargin: 40, bottomMargin: 40,
                globalStylesOverride: false
            }];
        }

        // 4. Update Secondary States
        if (docData.mediaItems) {
            setMediaItems(docData.mediaItems.map(item => ({ ...item, url: mediaMap[item.internalPath] })));
        }
        if (docData.canvases) {
            setCanvases(docData.canvases.map(c => ({ ...c, data: canvasMap[c.internalPath] })));
        }

        // 5. Finalize State Injection
        setDocuments(loadedDocs);
        setCurrentDocId(loadedDocs[0].primaryId); // Target the start of the list
        // Push loaded QDoc state to history
        historyRef.current = [{ docs: loadedDocs, activeId: loadedDocs[0].primaryId }];
        setHistoryIndex(0);
        setLastLoadTime(Date.now());
        
    } catch (e) {
        console.error("QDOC Import Error:", e);
        alert("Failed to load document: " + e.message);
    } finally {
        // ALWAYS kill the spinner regardless of success or failure
        setIsDataReady(true);
    }
}, [calculateMetrics, setMindMapData, setMediaItems, globalDocSettings]);

const processHtml = useCallback(async (file) => {
    try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        const container = doc.querySelector('.document-page-preview');
        let importedHtml = "";

        if (container) {
            const savedViewMode = container.getAttribute('data-viewmode');
            const savedDocColor = container.getAttribute('data-doccolor');
            const savedWidth = container.getAttribute('data-width');
            const savedHeight = container.getAttribute('data-height');

            if (savedViewMode) setViewMode(savedViewMode);
            if (savedDocColor) setDocColor(savedDocColor);
            if (savedWidth && savedHeight) {
                setPageDims({ width: parseInt(savedWidth), height: parseInt(savedHeight) });
            }
            importedHtml = container.innerHTML;
        } else {
            importedHtml = doc.body?.innerHTML || text;
        }

        setMindMapData(null);
        setSingleDocumentState(importedHtml);
    } catch (err) {
        console.error("HTML Document Import Failure:", err);
        setIsDataReady(true);
        alert("Could not load the HTML resource file successfully.");
    }
}, [calculateMetrics, setMindMapData, globalDocSettings]);

// Core regex extractor engine
const handleExtractData = useCallback((type) => {
    // Combine text from all chunks dynamically
    const allText = documents.map(d => {
        // Strip HTML to get plain text for regex
        const temp = document.createElement('div');
        temp.innerHTML = d.content;
        return temp.innerText;
    }).join('\n');

    let regex;

    if (type === 'email') {
        regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    } else if (type === 'phone') {
        regex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    } else if (type === 'link') {
        regex = /\bhttps?:\/\/[^\s<>"]+|www\.[^\s<>"]+/gi;
    }

    const matches = allText.match(regex) || [];
    const uniqueMatches = [...new Set(matches)]; // Deduplicate instances

    // Build CSV payload array
    let csvLines = ["Index,Extracted Data"];
    uniqueMatches.forEach((item, idx) => {
        const safeItem = item.replace(/"/g, '""'); 
        csvLines.push(`${idx + 1},"${safeItem}"`);
    });

    const generatedCsvString = csvLines.join('\n');
    setExtractedCsvData(generatedCsvString);
}, [documents]);

// Blob parser for exporting CSV 
const getCsvBlob = (contentHtml) => {
    // Strip HTML tags to get raw text for CSV
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHtml || '';
    const cleanText = tempDiv.innerText || '';
    return new Blob([cleanText], { type: 'text/csv;charset=utf-8;' });
};

// Processing handler for importing raw CSV files
const processCsv = useCallback(async (file) => {
    try {
        setMindMapData(null);
        await processLargeTextFile(file);
    } catch (err) {
        console.error("CSV Import Hook Failure:", err);
        setIsDataReady(true);
        alert("Could not render structural CSV data.");
    }
}, [calculateMetrics, setMindMapData]);

const processPdf = useCallback(async (file) => {
    setIsDataReady(false);
    try {
        const fileUrl = URL.createObjectURL(file);
        const iframeHtml = `<iframe src="${fileUrl}" width="100%" height="800px" style="border: none;"></iframe>`;

        setMindMapData(null);
        setSingleDocumentState(iframeHtml);
    } catch (e) {
        alert("Failed to load PDF.");
        setIsDataReady(true);
    }
}, [setMindMapData, globalDocSettings]);

// Markdown Import
const processMd = useCallback(async (file) => {
    try {
        setMindMapData(null);
        // MD files can be chunked just like text files for heavy documents
        await processLargeTextFile(file);
    } catch (err) {
        console.error("Markdown Import Failed:", err);
        setIsDataReady(true);
    }
}, [calculateMetrics, setMindMapData]);

// Markdown & Text Export Logic (Converts HTML back to ![[]])
const getMdBlob = (contentHtml, isTxt = false) => {
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHtml || '';

    // Revert Iframes back to ![[]]
    tempDiv.querySelectorAll('.iframe-container').forEach(container => {
        const iframe = container.querySelector('iframe');
        if (iframe) {
            const src = iframe.getAttribute('src');
            container.parentNode.replaceChild(document.createTextNode(`![[${src}]]`), container);
        }
    });

    // Revert Images back to ![[]]
    tempDiv.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        // Ignore internal base64 data blobs to prevent giant text dumps in md files
        if (!src.startsWith('data:')) {
            img.parentNode.replaceChild(document.createTextNode(`![[${src}]]`), img);
        } else {
            img.parentNode.replaceChild(document.createTextNode(`[Embedded Base64 Image Removed]`), img);
        }
    });

    // Convert links back to [[]]
    tempDiv.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        a.parentNode.replaceChild(document.createTextNode(`[[${href}]]`), a);
    });

    const mimeType = isTxt ? 'text/plain;charset=utf-8;' : 'text/markdown;charset=utf-8;';
    return new Blob([tempDiv.innerText], { type: mimeType });
};

const processDocx = useCallback(async (file) => {
    try {
        let html = "";
        try {
            const zip = new JSZip();
            const content = await zip.loadAsync(file);
            const docFile = content.file("word/document.xml");
            if (!docFile) throw new Error("Missing document.xml");

            const xmlText = await docFile.async("string");
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const paragraphs = xmlDoc.getElementsByTagNameNS("*", "p");

            for (let i = 0; i < paragraphs.length; i++) {
                let pText = "";
                const runs = paragraphs[i].getElementsByTagNameNS("*", "r");

                for (let j = 0; j < runs.length; j++) {
                    const texts = runs[j].getElementsByTagNameNS("*", "t");
                    let runHtml = "";
                    for (let k = 0; k < texts.length; k++) {
                        runHtml += texts[k].textContent;
                    }

                    if (runHtml) {
                        const rPr = runs[j].getElementsByTagNameNS("*", "rPr")[0];
                        if (rPr) {
                            if (rPr.getElementsByTagNameNS("*", "b").length > 0) runHtml = `<strong>${runHtml}</strong>`;
                            if (rPr.getElementsByTagNameNS("*", "i").length > 0) runHtml = `<em>${runHtml}</em>`;
                            if (rPr.getElementsByTagNameNS("*", "u").length > 0) runHtml = `<u>${runHtml}</u>`;

                            const colorNode = rPr.getElementsByTagNameNS("*", "color")[0];
                            if (colorNode) {
                                const hex = colorNode.getAttribute("w:val") || colorNode.getAttribute("val");
                                if (hex) runHtml = `<span style="color:#${hex}">${runHtml}</span>`;
                            }
                        }
                        pText += runHtml;
                    }
                }
                html += `<p>${pText || "<br/>"}</p>`;
            }
        } catch (zipError) {
            console.warn("Standard OpenXML parsing failed. Attempting HTML fallback...", zipError);

            const text = await file.text();
            if (text.includes("<body")) {
                const parser = new DOMParser();
                const htmlDoc = parser.parseFromString(text, "text/html");
                html = htmlDoc.body.innerHTML;
            } else {
                throw zipError;
            }
        }

        setMindMapData(null);
        setSingleDocumentState(html);

    } catch (err) {
        console.error("DOCX Import Failed:", err);
        setIsDataReady(true);
        alert("Could not load DOCX. Ensure it's a valid Word file.");
    }
}, [calculateMetrics, setMindMapData, globalDocSettings]);

// 2. BLOB GENERATORS (For Saving & Downloads)
//const getTxtBlob = () => new Blob([editorRef.current?.innerText || ''], { type: 'text/plain' });
const getTxtBlob = (finalHtml) => getMdBlob(finalHtml,true);
const getDocBlob = (contentHtml) => {
    const fullHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
    <head><meta charset='utf-8'><title>Doc</title></head>
    <body>${contentHtml || ''}</body></html>`;
    return new Blob([fullHtml], { type: 'application/msword;charset=utf-8' });
};

const getQDocBlob = async () => {
    const zip = new JSZip();

    // 1. Sync the active editor's latest content into our documents array
    const syncedDocs = documents.map(d =>
        d.primaryId === currentDocId && editorRef.current
            ? { ...d, content: editorRef.current.innerHTML }
            : d
    );

    // 2. Prepare the base export package with the array architecture
    const exportPackage = {
        meta: { originalName: currentFileName },
        globalSettings: globalDocSettings, // Include root-level global settings
        rules: syntaxRules,
        mindMap: mindMapData,
        documents: [], // We will populate the true linked list here
        docColor, // Kept for backwards compatibility
        docBgImage,
        viewMode,
        pageDims,
        mediaItems: await Promise.all(mediaItems.map(async item => ({
            ...item,
            base64: await toBase64(item.url),
            url: null, file: null
        }))),
        canvases: await Promise.all(canvases.map(async c => ({
            ...c,
            base64: canvasRefs.current[c.id] ? canvasRefs.current[c.id]() : null,
            data: null
        })))
    };

    if (isLocked && password) {
        // ENCRYPTED PATH
        exportPackage.documents = syncedDocs;
        const ciphertext = encryptData(exportPackage, password);
        zip.file("document.json", JSON.stringify({ 
            encrypted: true, 
            payload: ciphertext,
            meta: { originalName: currentFileName }
        }));
    } else {
        // STANDARD PATH
        const assetsFolder = zip.folder("assets");
        const videoFolder = zip.folder("videos");
        const mediaFolder = zip.folder("media"); 
        const canvasFolder = mediaFolder.folder("canvases");

        // 3. Process Images and Videos across ALL documents independently
        const processedDocs = await Promise.all(syncedDocs.map(async (doc, docIndex) => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = doc.content;

            const imgs = tempDiv.querySelectorAll('img');
            const videos = tempDiv.querySelectorAll('video');

            await Promise.all(Array.from(imgs).map(async (img, i) => {
                try {
                    const res = await fetch(img.src);
                    const blob = await res.blob();
                    const ext = blob.type.split('/')[1] || 'png';
                    const name = `img_doc${docIndex}_${i}.${ext}`; 
                    const path = `assets/images/${name}`;
                    assetsFolder.file(name, blob);  
                    img.setAttribute('src', path);  
                } catch (e) { console.warn("Image export fail", e); }
            }));

            await Promise.all(Array.from(videos).map(async (v, i) => {
                try {
                    const res = await fetch(v.src);
                    const blob = await res.blob();
                    const ext = blob.type.split('/')[1] || 'mp4';
                    const name = `video_doc${docIndex}_${i}.${ext}`;
                    const path = `assets/videos/${name}`;
                    videoFolder.file(name, blob); 
                    v.setAttribute('src', path);  
                } catch (e) { console.warn("Video export fail", e); }
            }));

            // Return the preserved row schema
            return { ...doc, content: tempDiv.innerHTML };
        }));

        exportPackage.documents = processedDocs;

        // 4. Process Media Tab Items
        const serializedMedia = await Promise.all(mediaItems.map(async (item, i) => {
            try {
                const res = await fetch(item.url);
                const blob = await res.blob();
                const fileName = `media_${i}_${item.name || 'file'}`;
                mediaFolder.file(fileName, blob);
                return { ...item, internalPath: `media/${fileName}`, url: null, file: null };
            } catch (e) { return null; }
        }));
        exportPackage.mediaItems = serializedMedia.filter(Boolean);

        // 5. Process Canvases
        const serializedCanvases = await Promise.all(canvases.map(async (canvas) => {
            try {
                const dataUrl = canvasRefs.current[canvas.id] ? canvasRefs.current[canvas.id]() : null;
                if (!dataUrl) return canvas;
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const fileName = `canvas_${canvas.id}.png`;
                canvasFolder.file(fileName, blob);
                return { ...canvas, internalPath: `media/canvases/${fileName}`, data: null, size:blob.size };
            } catch (e) { return canvas; }
        }));
        exportPackage.canvases = serializedCanvases;

        // 6. Save the final JSON Structure
        zip.file("document.json", JSON.stringify(exportPackage));
    }
    return await zip.generateAsync({ type: "blob" });
};

const getOdtBlob = async (contentHtml) => {
    const zip = new JSZip();

    // 1. Mimetype (must be first and uncompressed)
    zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });

    // 2. Unpack HTML & resolve internal `.qdoc-page` wrappers
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentHtml || '<div class="qdoc-page"><p></p></div>';

    // Strip outer pagination structural layers for flat XML compilation
    const pages = tempDiv.querySelectorAll('.qdoc-page');
    let flattenedHtml = '';
    if (pages.length > 0) {
        pages.forEach(p => { flattenedHtml += p.innerHTML; });
    } else {
        flattenedHtml = tempDiv.innerHTML;
    }

    const cleanDiv = document.createElement('div');
    cleanDiv.innerHTML = flattenedHtml;

    const manifest = [
        { path: "/", type: "application/vnd.oasis.opendocument.text" },
        { path: "content.xml", type: "text/xml" },
        { path: "META-INF/manifest.xml", type: "text/xml" }
    ];

    // Asset pre-fetching for embeddable media
    const imgs = cleanDiv.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(async (img, i) => {
        try {
            const res = await fetch(img.src);
            const blob = await res.blob();
            const ext = blob.type.split('/')[1] || 'png';
            const fileName = `Pictures/img_${i}.${ext}`;

            zip.file(fileName, blob);
            manifest.push({ path: fileName, type: blob.type });

            img.setAttribute('src', fileName);
            if (!img.style.width) img.style.width = "10cm";
        } catch (e) { console.warn("Image export failed", e); }
    }));

    // Style Registration System
    const automaticStyles = [];
    let styleCounter = 0;

    const rgbToHex = (str) => {
        if (!str || str === 'transparent') return null;
        if (str.startsWith('#')) return str;
        const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        const toHex = (n) => parseInt(n).toString(16).padStart(2, '0');
        return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
    };

    const registerStyle = (node, isBlock = false) => {
        const id = `S${++styleCounter}`;
        const color = rgbToHex(node.style?.color);
        const bgColor = rgbToHex(node.style?.backgroundColor);
        const align = node.style?.textAlign || "left";
        
        const isBold = node.style?.fontWeight === 'bold' || ['B', 'STRONG'].includes(node.tagName);
        const isItalic = node.style?.fontStyle === 'italic' || ['I', 'EM'].includes(node.tagName);
        const isUnderline = node.style?.textDecoration?.includes('underline') || node.tagName === 'U';

        let fontSize = node.style?.fontSize || "12pt";
        if (!fontSize.includes('pt') && !fontSize.includes('px')) fontSize = "12pt";

        let xml = `<style:style style:name="${id}" style:family="${isBlock ? 'paragraph' : 'text'}">`;
        if (isBlock) {
            const odtAlign = align === 'center' ? 'center' : align === 'right' ? 'end' : align === 'justify' ? 'justify' : 'start';
            xml += `<style:paragraph-properties fo:text-align="${odtAlign}"/>`;
        }
        xml += `<style:text-properties `;
        if (color) xml += `fo:color="${color}" `;
        if (bgColor) xml += `fo:background-color="${bgColor}" `;
        xml += `fo:font-size="${fontSize}" `;
        xml += `fo:font-weight="${isBold ? 'bold' : 'normal'}" `;
        xml += `fo:font-style="${isItalic ? 'italic' : 'normal'}" `;
        xml += `style:text-underline-style="${isUnderline ? 'solid' : 'none'}" style:text-underline-width="auto"/>`;
        xml += `</style:style>`;

        automaticStyles.push(xml);
        return id;
    };

    // Recursive HTML -> OpenDocument XML Parser
    const convert = (nodes) => {
        let xml = "";
        nodes.forEach(node => {
            if (node.nodeType === 3) { // Text Node
                const txt = node.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                if (txt.trim().length > 0) {
                    xml += txt;
                }
            } else if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
                xml += `<text:p text:style-name="${registerStyle(node, true)}">${convert(node.childNodes)}</text:p>`;
            } else if (['SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'FONT'].includes(node.tagName)) {
                xml += `<text:span text:style-name="${registerStyle(node, false)}">${convert(node.childNodes)}</text:span>`;
            } else if (node.tagName === 'TABLE') {
                xml += `<table:table>`;
                const rows = node.querySelectorAll('tr');
                if (rows.length > 0) {
                    const colCount = rows[0].querySelectorAll('td, th').length;
                    xml += `<table:table-column table:number-columns-repeated="${colCount}"/>`;
                }
                rows.forEach(row => {
                    xml += `<table:table-row>`;
                    row.querySelectorAll('td, th').forEach(cell => {
                        xml += `<table:table-cell office:value-type="string" table:style-name="TableCellBorders">`;
                        xml += `<text:p text:style-name="${registerStyle(cell, true)}">${convert(cell.childNodes)}</text:p>`;
                        xml += `</table:table-cell>`;
                    });
                    xml += `</table:table-row>`;
                });
                xml += `</table:table>`;
            } else if (node.tagName === 'UL' || node.tagName === 'OL') {
                const styleName = node.tagName === 'OL' ? 'L_Ordered' : 'L_Unordered';
                xml += `<text:list text:style-name="${styleName}">`;
                Array.from(node.children).forEach(li => {
                    xml += `<text:list-item><text:p text:style-name="${registerStyle(li, true)}">${convert(li.childNodes)}</text:p></text:list-item>`;
                });
                xml += `</text:list>`;
            } else if (node.tagName === 'IMG') {
                const path = node.getAttribute('src');
                const w = node.style.width || "10cm";
                xml += `<draw:frame text:anchor-type="as-char" svg:width="${w}">
                <draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>
                </draw:frame>`;
            } else if (node.tagName === 'BR') {
                xml += `<text:line-break/>`;
            } else {
                // Fallback for unhandled inline nodes
                xml += convert(node.childNodes);
            }
        });
        return xml;
    };

    const bodyXml = convert(cleanDiv.childNodes);

    // Full Spec Valid ODT content.xml Manifest
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content 
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" 
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" 
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" 
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" 
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" 
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-proportional:1.0" 
    xmlns:xlink="http://www.w3.org/1999/xlink" 
    xmlns:svg="http://www.w3.org/2000/svg" 
    office:version="1.2">
    <office:scripts/>
    <office:automatic-styles>
        ${automaticStyles.join('')}
        <style:style style:name="TableCellBorders" style:family="table-cell">
            <style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.1cm"/>
        </style:style>
        <text:list-style style:name="L_Unordered">
            <text:list-level-style-bullet text:level="1" text:bullet-char="•"/>
        </text:list-style>
        <text:list-style style:name="L_Ordered">
            <text:list-level-style-number text:level="1" style:num-format="1"/>
        </text:list-style>
    </office:automatic-styles>
    <office:body>
        <office:text>
            ${bodyXml.length > 0 ? bodyXml : '<text:p/>'}
        </office:text>
    </office:body>
</office:document-content>`;

    zip.file("content.xml", contentXml);

    const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
    ${manifest.map(e => `<manifest:file-entry manifest:full-path="${e.path}" manifest:media-type="${e.type}"/>`).join('')}
</manifest:manifest>`;
    
    zip.folder("META-INF").file("manifest.xml", manifestXml);
    return await zip.generateAsync({ type: "blob" });
};

const getHtmlBlob = (finalHtml) => {
    const innerContent = finalHtml || editorRef.current?.innerHTML || '';
    
    // Check if this is a multi-page export containing our custom containers
    const isMultiPage = innerContent.includes('qdoc-page-container');

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${currentFileName}</title>
<style>
    body {
        background-color: #f8f9fa;
        margin: 0;
        padding: 20px;
        display: flex;
        justify-content: center;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        font-family: sans-serif;
    }
    .document-page-preview {
        width: ${pageDims?.width || 800}px;
        background-color: ${docColor || '#ffffff'};
        padding: 40px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        box-sizing: border-box;
    }
    .qdoc-page-container {
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        box-sizing: border-box;
    }
    @media print {
        body { background-color: white; padding: 0; display: block; }
        .document-page-preview, .qdoc-page-container { 
            box-shadow: none; 
            margin: 0 !important; 
        }
    }
</style>
</head>
<body>
    ${isMultiPage 
        ? innerContent 
        : `<div class="document-page-preview" data-viewmode="${viewMode}" data-doccolor="${docColor}" data-width="${pageDims?.width || 800}" data-height="${pageDims?.height || 1120}">${innerContent}</div>`
    }
</body>
</html>`;

    return new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
};
const getCombinedHtml = useCallback(() => {
    const syncedDocs = documents.map(d => 
        d.primaryId === currentDocId && editorRef.current 
            ? { ...d, content: editorRef.current.innerHTML } 
            : d
    );
    
    // The content is already wrapped in .qdoc-page elements. 
    // We just map over the documents and stitch them together.
    return syncedDocs.map(doc => {
        const width = doc.docWidth || globalDocSettings.docWidth;
        const height = doc.docHeight || globalDocSettings.docHeight;
        const bg = doc.globalStylesOverride ? (doc.docColor || globalDocSettings.docColor) : globalDocSettings.docColor;
        
        // We inject the explicit inline styling to the existing .qdoc-page elements
        let htmlWithStyles = doc.content.replace(/<div class="qdoc-page"/g, 
            `<div class="qdoc-page qdoc-page-container" 
            data-id="${doc.primaryId}" 
            style="
                width: ${width}px; 
                min-height: ${height}px; 
                background-color: ${bg}; 
                padding: ${doc.topMargin}px ${doc.rightMargin}px ${doc.bottomMargin}px ${doc.leftMargin}px; 
                page-break-after: always;
                margin-bottom: 20px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                box-sizing: border-box;
            "`
        );
        return htmlWithStyles;
    }).join('');
}, [documents, currentDocId, globalDocSettings]);

const handleAction = (ext, mode) => {
    initiateExport(ext, mode);
};

const initiateExport = (ext, mode) => {
    if (documents.length > 1) {
        setExportConfig({ ext, mode });
        setShowExportModal(true); 
    } else {
        executeExport(ext, mode, 'single');
    }
};

const executeExport = async (ext, mode, scope) => {
    if (!editorRef.current) return;
    
    let finalHtml = "";
    
    // Check scope to determine what HTML to generate
    if (scope === 'single') {
        finalHtml = editorRef.current.innerHTML;
    } else if (scope === 'all') {
        // Use your new getCombinedHtml method here
        finalHtml = getCombinedHtml();
    }

    let blob = null;
    
    // Pass finalHtml down to all blob generators
    if (ext === '.txt') blob = getTxtBlob(finalHtml);
    else if (ext === '.docx') blob = getDocBlob(finalHtml);
    else if (ext === '.qdoc') blob = await getQDocBlob(finalHtml);
    else if (ext === '.odt') blob = await getOdtBlob(finalHtml); 
    else if (ext === '.csv') blob = getCsvBlob(finalHtml);
    else if (ext === '.html') blob = getHtmlBlob(finalHtml); // Now properly receives finalHtml
    else if (ext === '.md') blob = getMdBlob(finalHtml);

    if (!blob) return;

    const cleanName = currentFileName.replace(/\.[^/.]+$/, "");

    if (mode === 'save') {
        if (onSave) onSave(blob, cleanName, ext);
        else alert("Save handler not connected.");
    } else if (mode === 'dl') {
        if (onDownload) onDownload(blob, cleanName, ext);
        else alert("Download handler not connected.");
    } else if (mode === 'share') {
        if (onShare) onShare(blob, cleanName, ext);
        else alert("Share handler not connected.");
    }
};

// HOOK 15
// EFFECTS & RENDER
useEffect(() => {
    console.log("hook 15")
if (!fileHandle) {
    // If it's a "New Session" (no file handle), make sure we are ready
    setIsDataReady(true);
    return;
}

// 1. Load Method (Routes .txt to processLargeTextFile)
const load = async () => {
    setIsDataReady(false);
    const name = fileHandle.name.toLowerCase();
    
    setCurrentFileName(fileHandle.name.replace(/\.[^/.]+$/, ""));
    
    if (name.endsWith('.odt')) await processOdt(fileHandle);
    else if (name.endsWith('.qdoc')) await processQDoc(fileHandle);
    else if (name.endsWith('.docx')) await processDocx(fileHandle);
    else if (name.endsWith('.html') || name.endsWith('.htm')) await processHtml(fileHandle);
    else if (name.endsWith('.csv')) await processCsv(fileHandle);
    else if (name.endsWith('.pdf')) await processPdf(fileHandle);
    else if (name.endsWith('.md')) await processMd(fileHandle);
    else if (name.endsWith('.txt')) {
        // Send plain text to the chunking engine
        await processLargeTextFile(fileHandle);
    }
};
load();
}, []);

// HOOK 16
useEffect(() => {
    console.log("hook 16")
    const editor = editorRef.current;
    // --- FIX: Guard against null ref ---
    if (!editor) return;
    const handleContextMenu = (e) => {
        if (e.target.tagName === 'VIDEO') {
            e.preventDefault();
            setVideoMenu({
                show: true,
                x: e.pageX,
                y: e.pageY,
                target: e.target
            });
        } else {
            setVideoMenu(prev => ({ ...prev, show: false }));
        }
    };
    
    editor.addEventListener('contextmenu', handleContextMenu);
    return () => editor.removeEventListener('contextmenu', handleContextMenu);
}, []);

const calculateEstimatedPages = () => {
    if (!editorRef.current) return 1;
    // Estimate based on scroll height vs page height
    return Math.ceil(editorRef.current.scrollHeight / printConfig.height) || 1;
};

// HOOK 17
// Update estimate whenever modal opens
useEffect(() => {
    console.log("hook 17")
    if (showPrintModal) {
        setPrintConfig(prev => ({ ...prev, estimatedPages: calculateEstimatedPages() }));
    }
}, [showPrintModal]);

const handlePrintProcess = () => {
    let printFrame = document.getElementById('print-iframe');
    if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'print-iframe';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
    }

    // Sync current active editor chunk back to state
    const syncedDocs = documents.map(d => 
        d.primaryId === currentDocId ? { ...d, content: editorRef.current.innerHTML } : d
    );
    
    // Combine all chunks for printing
    const combinedHtml = syncedDocs.map(d => d.content).join('<div style="page-break-after: always;"></div>');

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = combinedHtml;

    // Remove Syntax Highlights if disabled
    if (!printConfig.useFilters) {
        contentDiv.querySelectorAll('[data-syntax-rule="true"]').forEach(el => {
            if (el.tagName === 'SPAN') {
                const parent = el.parentNode;
                while (el.firstChild) parent.insertBefore(el.firstChild, el);
                parent.removeChild(el);
            } else {
                el.style.color = '';
                el.style.backgroundColor = '';
                el.style.fontSize = '';
            }
        });
    }

    // Handle Images
    if (!printConfig.showImages) {
        contentDiv.querySelectorAll('img').forEach(img => img.remove());
    }

    // Handle Videos
    contentDiv.querySelectorAll('video').forEach(vid => {
        if (!printConfig.showVideos) {
            vid.remove();
        } else {
            const placeholder = document.createElement('div');
            placeholder.innerHTML = `[VIDEO: ${vid.getAttribute('src')}]`;
            placeholder.style.border = "1px solid #ccc";
            placeholder.style.padding = "10px";
            placeholder.style.background = "#f9f9f9";
            vid.parentNode.replaceChild(placeholder, vid);
        }
    });

    const html = `
        <html>
        <head>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                @media print {
                    @page { size: auto; margin: 20mm; }
                    body { width: 100%; padding: 0; }
                }
                body { font-family: sans-serif; padding: 20px; }
            </style>
        </head>
        <body>
            ${contentDiv.innerHTML}
        </body>
        </html>
    `;

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    printFrame.onload = () => {
        setTimeout(() => {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
        }, 500);
    };
};

const reflowPagination = useCallback(() => {
    if (viewMode !== 'paged' || !editorRef.current) return;
    
    const editor = editorRef.current;
    const pageLimit = (pageDims?.height || 1120) - (globalDocSettings?.topMargin || 40) - (globalDocSettings?.bottomMargin || 40);
    
    let pages = Array.from(editor.querySelectorAll('.qdoc-page'));
    if (pages.length === 0) return;

    let needsReflow = false;
    // Check if any page is overflowing or if space opened up for pulling text back
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].scrollHeight > pageLimit && pages[i].childNodes.length > 1) needsReflow = true;
        if (pages[i+1] && pages[i].scrollHeight < pageLimit - 30) needsReflow = true; 
    }

    if (!needsReflow) return;

    const savedSelection = saveCursorPosition(editor);

    // 1. FORWARD PASS: Push overflowing text down to the next page
    for (let i = 0; i < pages.length; i++) {
        let page = pages[i];
        
        // Keep at least 1 element to prevent infinite loops on massive singular paragraphs
        while (page.scrollHeight > pageLimit && page.childNodes.length > 1) {
            let lastNode = page.lastChild;
            
            let nextPage = pages[i + 1];
            if (!nextPage) {
                nextPage = document.createElement('div');
                nextPage.className = 'qdoc-page';
                editor.appendChild(nextPage);
                pages.push(nextPage);
            }

            if (nextPage.firstChild) {
                nextPage.insertBefore(lastNode, nextPage.firstChild);
            } else {
                nextPage.appendChild(lastNode);
            }
        }
    }

    // 2. BACKWARD PASS: Pull text up if backspace created empty space
    for (let i = 0; i < pages.length - 1; i++) {
        let page = pages[i];
        let nextPage = pages[i + 1];
        
        while (nextPage && nextPage.firstChild && page.scrollHeight < (pageLimit - 30)) {
            let firstNode = nextPage.firstChild;
            page.appendChild(firstNode);
            
            // If pulling it up made this page overflow, put it back and stop pulling
            if (page.scrollHeight > pageLimit && page.childNodes.length > 1) {
                page.removeChild(firstNode);
                if (nextPage.firstChild) {
                    nextPage.insertBefore(firstNode, nextPage.firstChild);
                } else {
                    nextPage.appendChild(firstNode);
                }
                break;
            }
        }
        
        // Clean up empty pages caused by massive deletions
        const hasMedia = nextPage && nextPage.querySelector('img, video, iframe, canvas');
        if (nextPage && nextPage.textContent.trim() === '' && !hasMedia) {
            nextPage.remove();
            pages.splice(i + 1, 1);
        }
    }

    restoreCursorPosition(editor, savedSelection);
    if (typeof calculatePages === 'function') calculatePages();
    
}, [viewMode, pageDims, globalDocSettings, calculatePages]);

useEffect(() => {
    console.log("hook 18")
    const handleKeyDown = (e) => {
        const isModKey = e.ctrlKey || e.metaKey; // Windows (Ctrl) and Mac (Cmd)
        const key = e.key.toLowerCase();
        const selection = window.getSelection();

        // 1. MODIFIER-BASED COMBINATIONS (Ctrl / Cmd)
        if (isModKey) {
            
            // --- SHIFT COMBINATIONS (Ctrl + Shift + Key) ---
            if (e.shiftKey) {
                switch (key) {
                    case 'z': // Redo Alternative
                        e.preventDefault();
                        handleRedo();
                        return;
                    case 'x': // Strikethrough
                        e.preventDefault();
                        handleFormat('strikeThrough');
                        return;
                    case 'l': // Align Left
                        e.preventDefault();
                        handleFormat('justifyLeft');
                        return;
                    case 'e': // Align Center
                        e.preventDefault();
                        handleFormat('justifyCenter');
                        return;
                    case 'r': // Align Right
                        e.preventDefault();
                        handleFormat('justifyRight');
                        return;
                    case 'j': // Justify Full
                        e.preventDefault();
                        handleFormat('justifyFull');
                        return;
                    case 's': // Voice Dictation (Docs Standard Toggle)
                        e.preventDefault();
                        if (typeof startDictation === 'function') startDictation();
                        return;
                    case 'u': // Read Aloud Toggle Activation
                        e.preventDefault();
                        if (typeof handleReadAloud === 'function') handleReadAloud();
                        return;
                    case '.': // Increase Font Size (Ctrl + Shift + >)
                    case '>':
                        e.preventDefault();
                        setSelectedSizeIndex(prev => {
                            const newSize = Math.min(400, parseInt(prev) + 1);
                            handleFormat('fontSize', newSize);
                            return newSize;
                        });
                        return;
                    case ',': // Decrease Font Size (Ctrl + Shift + <)
                    case '<':
                        e.preventDefault();
                        setSelectedSizeIndex(prev => {
                            const newSize = Math.max(1, parseInt(prev) - 1);
                            handleFormat('fontSize', newSize);
                            return newSize;
                        });
                        return;
                    default:
                        break;
                }
            }

            // --- STANDARD COMBINATIONS (Ctrl + Key) ---
            switch (key) {
                case 'z':
                    e.preventDefault();
                    handleUndo();
                    break;
                case 'y':
                    e.preventDefault();
                    handleRedo();
                    break;
                case 'b':
                    e.preventDefault();
                    handleFormat('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    handleFormat('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    handleFormat('underline');
                    break;
                case '.': // Superscript
                    e.preventDefault();
                    handleFormat('superscript');
                    break;
                case ',': // Subscript
                    e.preventDefault();
                    handleFormat('subscript');
                    break;
                case '[': // Decrease Indent
                    e.preventDefault();
                    handleFormat('outdent');
                    break;
                case ']': // Increase Indent
                    e.preventDefault();
                    handleFormat('indent');
                    break;
                case 'k': // Insert Link image
                    e.preventDefault();
                    if (typeof handleInsertImage === 'function') handleInsertImage();
                    break;
                case 'p': // Document Printing Configuration Menu
                    e.preventDefault();
                    if (typeof setShowPrintModal === 'function') setShowPrintModal(true);
                    break;
                case '\\': // Clear Formatting Structural Tag Layer
                    e.preventDefault();
                    handleFormat('removeFormat');
                    break;
                default:
                    break;
            }
        }

        // 2. STRUCTURAL ACTION OVERRIDES (Enter / Tab)
        // Tab Spaces Custom Override Hook Execution
        if (e.key === 'Tab') {
            e.preventDefault();
            // Injects 4 safe explicit spacer entities via HTML node engine layout
            handleFormat('inserthtml', '&nbsp;&nbsp;&nbsp;&nbsp;');
        }

        // Paragraph Split Engine Call Integration
        if (e.key === 'Enter') {
            const anchorNode = selection.anchorNode?.parentNode;
            const isInList = anchorNode?.closest('ol, ul, li');

            // Allow the browser to manage line list creations naturally, 
            // process standard document workspace block splitting via custom engine execution paths
            if (!isInList) {
                e.preventDefault();
                handleFormat('insertparagraph');
                
                // Immediately force asynchronous document frame measurements updates
                setTimeout(() => {
                    if (typeof calculatePages === 'function') calculatePages();
                    if (typeof calculateLineCount === 'function') calculateLineCount();
                }, 5);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [
    handleUndo, 
    handleRedo, 
    handleFormat, 
    setSelectedSizeIndex, 
    startDictation, 
    handleReadAloud, 
    handleInsertImage, 
    calculatePages, 
    calculateLineCount
]);

// Add this helper function inside the QDoc component
const processObsidianLinks = useCallback(() => {
    if (!editorRef.current) return;
    
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];
    let node;
    while (node = walker.nextNode()) {
        nodesToProcess.push(node);
    }

    nodesToProcess.forEach(textNode => {
        const text = textNode.nodeValue;
        
        // Regex for ![[]] (Embeds) and [[]] (Links)
        const embedRegex = /!\[\[(.*?)\]\]/g;
        const linkRegex = /\[\[(.*?)\]\]/g;

        if (embedRegex.test(text) || linkRegex.test(text)) {
            const parent = textNode.parentNode;
            let newHtml = text
                // 1. Convert simple embeds (Images, HTML) to iframes/imgs
                .replace(embedRegex, (match, fileName) => {
                    if (fileName.match(/\.(png|jpe?g|svg)$/i)) {
                        return `<img src="${fileName}" alt="${fileName}" style="max-width: 100%; border-radius: 8px;" />`;
                    } else if (fileName.endsWith('.html') || fileName.endsWith('.md')) {
                        // Use iframe for simple readable text/web components
                        return `<iframe src="${fileName}" class="embedded-doc" style="width:100%; height:300px; border: 1px solid #ccc; border-radius: 8px;"></iframe>`;
                    } else {
                        // Complex apps (.qdoc, .qslide) render as component placeholders
                        return `<div class="complex-embed-placeholder" style="padding:15px; background:#f0f0f0; border-radius:8px; cursor:pointer;" onclick="window.handleDocumentLinkClick('${fileName}')">
                            <i class="bi bi-box-seam text-primary"></i> Embedded Component: <strong>${fileName}</strong> (Click to Open)
                        </div>`;
                    }
                })
                // 2. Convert standard links to clickable anchors
                .replace(linkRegex, (match, fileName) => {
                    return `<a href="${fileName}" style="color: blue; text-decoration: underline; cursor: pointer;">${fileName}</a>`;
                });

            const span = document.createElement('span');
            span.innerHTML = newHtml;
            parent.replaceChild(span, textNode);
        }
    });
}, []);
// HOOK 19
useEffect(() => {
    console.log("hook 19")
    // Run whenever the active chunk changes and the DOM is ready
    if (isDataReady && editorRef.current) {
        processObsidianLinks();
        
        if (typeof calculateMetrics === 'function') {
            calculateMetrics();
        }
    }
}, [currentDocId, isDataReady, processObsidianLinks, calculateMetrics]);

const saveCursorPosition = (editorElement) => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editorElement.contains(range.startContainer)) return null;

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(editorElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    return preSelectionRange.toString().length;
};

const restoreCursorPosition = (editorElement, offset) => {
    if (offset === null) return;
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT, null, false);
    let charIndex = 0;
    let node;
    const range = document.createRange();
    let found = false;

    while ((node = walker.nextNode())) {
        const nextIndex = charIndex + node.length;
        if (offset <= nextIndex) {
            range.setStart(node, offset - charIndex);
            range.collapse(true);
            found = true;
            break;
        }
        charIndex = nextIndex;
    }

    if (found) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
};

const runPaginationEngine = useCallback(() => {
    if (viewMode !== 'paged' || !editorRef.current) return;

    const editor = editorRef.current;
    const activeDoc = documents.find(d => d.primaryId === currentDocId) || {};
    
    // Get exact dimensions
    const activeWidth = activeDoc.globalStylesOverride && activeDoc.docWidth ? activeDoc.docWidth : (pageDims?.width || 800);
    const activeHeight = activeDoc.globalStylesOverride && activeDoc.docHeight ? activeDoc.docHeight : (pageDims?.height || 1120);
    
    const top = activeDoc.topMargin || 40;
    const bottom = activeDoc.bottomMargin || 40;
    const left = activeDoc.leftMargin || 40;
    const right = activeDoc.rightMargin || 40;
    
    const maxPxHeight = activeHeight - top - bottom;
    const paddingStyles = `${top}px ${right}px ${bottom}px ${left}px`;

    // 1. Save where the user is typing
    const savedCursor = saveCursorPosition(editor);

    // 2. Flatten the Document (Strip old page wrappers to get raw HTML)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editor.innerHTML;
    const pages = tempDiv.querySelectorAll('.qdoc-page');
    
    let rawHtml = '';
    if (pages.length > 0) {
        // Concatenate all page contents seamlessly
        pages.forEach(p => rawHtml += p.innerHTML);
    } else {
        // Fallback if no pages exist yet
        rawHtml = tempDiv.innerHTML;
    }

    // 3. The Cascade Loop
    let remainingHtml = rawHtml;
    const paginatedPages = [];
    let safetyCounter = 0; 

    // Keep slicing until no HTML is left (capped at 1000 pages to prevent infinite browser crashes)
    while (remainingHtml && remainingHtml.trim() !== '' && safetyCounter < 1000) {
        const { pageHtml, remainderHtml } = splitHtmlAtHeight(remainingHtml, maxPxHeight, activeWidth, paddingStyles);
        
        // Wrap the perfectly sliced chunk in a fresh page div
        paginatedPages.push(`<div class="qdoc-page">${pageHtml}</div>`);
        
        remainingHtml = remainderHtml;
        safetyCounter++;
    }

    // 4. Inject the clean pages back into the DOM
    const finalHtml = paginatedPages.join('');
    if (editor.innerHTML !== finalHtml) {
        editor.innerHTML = finalHtml;
    }

    // 5. Restore the cursor so the user doesn't notice the layout swap
    restoreCursorPosition(editor, savedCursor);

    // 6. Sync UI side-effects
    if (typeof calculatePages === 'function') calculatePages();

}, [viewMode, documents, currentDocId, pageDims]);

// HOOK 19
useEffect(() => {
    if (viewMode === 'paged') {
        setTimeout(runPaginationEngine, 50); 
    }
}, [viewMode, runPaginationEngine]);

    return (
        <div className={`app-wrapper ${darkMode ? 'dark-mode border' : ''}`} style={{...getDocStyle(docColor, docBgImage, darkMode), maxHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Form style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                
                {/* --- TOOLBAR & SETTINGS (Condensed from your Modal) --- */}
                <div className="p-2 border-bottom d-flex align-items-center gap-2">
                    <input 
                className="flex-grow-1 bg-transparent border-0 fw-bold fs-5" 
                value={currentFileName} 
                onChange={e => setCurrentFileName(e.target.value)} 
                placeholder="Filename"
                style={{ outline: 'none' }}
            />
                    <Button variant="qdoc-outline-btn" className='qdoc-outline-btn' onClick={() => setShowSettings(!showSettings)}>
                        <i className="bi bi-gear"></i>
                    </Button>
                    {/* Dark Mode Toggle */}
                    <Button title='Toggle Dark Mode' variant="qdoc-outline-btn" className='qdoc-outline-btn' onClick={() => setDarkMode(!darkMode)}>
                        <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'}`}></i>
                    </Button>
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
                                                    {/* VIEW MODE CONTROLS */}
                                                    <div className="form-check form-switch d-flex align-items-center gap-2">
                                                        <input 
                                                            className="form-check-input mt-0" 
                                                            type="checkbox" 
                                                            id="viewModeToggle"
                                                            checked={viewMode === 'paged'}
                                                            onChange={(e) => setViewMode(e.target.checked ? 'paged' : 'smooth')}
                                                        />
                                                        <label className="form-check-label mb-0 fw-bold" htmlFor="viewModeToggle">
                                                            {viewMode === 'paged' ? 'Page Break Mode' : 'Continuous Mode'}
                                                        </label>
                                                    </div>

                                                    {viewMode === 'paged' && (
                                                        <div className="d-flex gap-2 align-items-center border-start ps-3 ms-2">
                                                            <span className="text-muted small">Dimensions (px):</span>
                                                            <input 
                                                                type="number" 
                                                                className="form-control form-control-sm" 
                                                                style={{ width: '80px' }}
                                                                value={pageDims.width}
                                                                onChange={(e) => setPageDims({...pageDims, width: Number(e.target.value)})}
                                                                title="Page Width"
                                                            />
                                                            <span>x</span>
                                                            <input 
                                                                type="number" 
                                                                className="form-control form-control-sm" 
                                                                style={{ width: '80px' }}
                                                                value={pageDims.height}
                                                                onChange={(e) => setPageDims({...pageDims, height: Number(e.target.value)})}
                                                                title="Page Height"
                                                            />
                                                        </div>
                                                    )}
                                                        <h3>Color:</h3>
                                                        <Form.Control 
                                                                    type="color" 
                                                                    size="sm" 
                                                                    value={docColor}
                                                                    onChange={(e) => setDocColor(e.target.value)} 
                                                                    style={{ width: '2.2rem', padding: '0', border: 'none', height: '2.2rem', borderRadius: '50px', flexShrink: 0, border: '2px solid black' }} 
                                                                    title="Text Color"
                                                                />
                                                        <h3>BG Image:</h3>
                                                        <label className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center" 
                                                        style={{ width: '2.2rem', padding: '0', border: 'none', height: '2.2rem', borderRadius: '50px', flexShrink: 0, border: '2px solid black' }} 
                                                                    >
                                                            <i className="bi bi-image-fill"></i>
                                                            <input 
                                                                type="file" 
                                                                hidden 
                                                                accept="image/*" 
                                                                onChange={(e) => {
                                                                    const file = e.target.files[0];
                                                                    if (file) {
                                                                        const reader = new FileReader();
                                                                        reader.onloadend = () => setDocBgImage(reader.result); // Base64 string
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }} 
                                                            />
                                                        </label>
                                                        {docBgImage && (
                                                            <Button variant="danger" size="sm" className="rounded-circle p-0 m-0" style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50px', flexShrink: 0 }} onClick={() => setDocBgImage('')}>
                                                                <i className="bi bi-x"></i>
                                                            </Button>
                                                        )}
                                                        {/* Password Logic (Compact) */}
                                                                                    <div className="d-flex align-items-center gap-2 mb-3 p-2 bg-opacity-10">
                                                                                    {/* 1. Added mb-0 to the label just in case */}
                                                                                    <Form.Label className="mb-0">
                                                                                        <i className={isLocked? "bi bi-shield-lock-fill rounded-ui":"bi bi-shield-slash-fill rounded-ui"} style={{ 
                                                                                            color: isLocked? "green" : "red",
                                                                                            }}>Encrypt:</i>          
                                                                                    </Form.Label>
                                                                                    {/* 2. Added mb-0 to the switch to kill the bottom margin */}
                                                                                    <Form.Check 
                                                                                        type="switch" 
                                                                                        id="lock-switch"
                                                                                        className="mb-0 d-flex align-items-center" // Added flex here too for perfect centering
                                                                                        checked={isLocked}
                                                                                        onChange={(e) => setIsLocked(e.target.checked)}
                                                                                    />
                                                        
                                                                                    {isLocked && (
                                                                                        <Form.Control 
                                                                                            type="password" 
                                                                                            size="sm" 
                                                                                            placeholder="Password" 
                                                                                            className="rounded-ui"
                                                                                            value={password} 
                                                                                            onChange={(e) => setPassword(e.target.value)}
                                                                                            style={{ maxWidth: '10rem' }}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                    </div>
                    </div>
                </Collapse>

                {/* --- TABS SYSTEM --- */}
                 {!isDataReady && fileHandle ? (
        <div className="d-flex justify-content-center align-items-center" style={{height: '50vh'}}>
            <div className="spinner-border text-warning"></div>
        </div>
    ) : (
                 <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k)} justify className="border-0">
                    <Tab eventKey="editor" title="Editor">
                        <div className="editor-wrapper position-relative">
                            {/* RICH TEXT TOOLBAR */}
                            <div className={ `sticky-toolbar d-flex gap-2 p-2 border-bottom flex-nowrap ${isMobile && isKeyboardOpen ? 'fixed-bottom bg-white shadow-lg' : 'sticky-top'}`} 
                            // This one below prevents out of focus problems if misclicked on the toolbar area but will also create problem while selecting textbox in search & replace
                            //onMouseDown={(e) => e.preventDefault()}
                                        style={{ 
                                                position: isMobile && isKeyboardOpen ? 'fixed' : 'sticky', 
                                                top: isMobile && isKeyboardOpen ? 'auto' : 0,
                                                bottom: isMobile && isKeyboardOpen ? 0 : 'auto', 
                                                zIndex: 1060,
                                                backdropFilter: 'blur(10px)', // Adds a nice modern touch
                                                // --- Horizontal scrolling and hidden scrollbar logic ---
                                                overflowX: 'scroll', 
                                                whiteSpace: 'nowrap',
                                                msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                                                scrollbarWidth: 'none',   /* Firefox */
                                                WebkitOverflowScrolling: 'touch' /* Smooth scrolling for iOS */
                                            }}
                            >
{/* FORMAT MENU TOGGLE */}
<Button 
    onClick={() => setOpenFormatControls(!openFormatControls)} 
    title="Toggle Formatting Controls" 
    variant="qdoc-outline-btn" 
    className='qdoc-outline-btn p-2' 
    size="sm" 
    style={{ 
        width: '2.6rem', 
        height: '2.6rem', 
        borderRadius: '50px', 
        position: 'relative',
        flexShrink: 0
    }}
>
    <i className="bi bi-type-bold"></i>
</Button>

{/* FORMAT MENU */}
<Collapse in={openFormatControls}>
<div>
<div style={{ 
    display: 'flex', 
    gap: '1rem', 
    alignItems: 'center', 
    animationName: 'fadeInLeft',
    animationDuration: '1s',
    flexWrap: 'nowrap'
}}>

    {/* UNDO / REDO */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={handleUndo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-arrow-counterclockwise"></i>
        </Button>
        <Button onClick={handleRedo} disabled={historyIndex >= historyRef.current.length - 1} title="Redo (Ctrl+Y)" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-arrow-clockwise"></i>
        </Button>
    </ButtonGroup>

    {/* FONT STYLES */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={() => handleFormat('bold')} title="Bold (Ctrl + B)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-type-bold"></i></Button>
        <Button onClick={() => handleFormat('italic')} title="Italics (Ctrl + I)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-type-italic"></i></Button>
        <Button onClick={() => handleFormat('underline')} title="Underline (Ctrl + U)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-type-underline"></i></Button>
        <Button onClick={() => handleFormat('strikeThrough')} title="Strikethrough (Ctrl + Shift + X)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-type-strikethrough"></i></Button>
    </ButtonGroup>

    {/* SUPERSCRIPT / SUBSCRIPT */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={() => handleFormat('subscript')} title="Subscript (Ctrl + ,)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i>X<sub>2</sub></i></Button>
        <Button onClick={() => handleFormat('removeFormat')} title="Clear Formatting (Ctrl + \)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i>X</i></Button>
        <Button onClick={() => handleFormat('superscript')} title="Superscript (Ctrl + .)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i>X<sup>2</sup></i></Button>
    </ButtonGroup>

    {/* ALIGNMENTS */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={() => handleFormat('justifyLeft')} title="Align Left (Ctrl + Shift + L)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-text-left"></i></Button>
        <Button onClick={() => handleFormat('justifyCenter')} title="Align Center (Ctrl + Shift + E)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-text-center"></i></Button>
        <Button onClick={() => handleFormat('justifyRight')} title="Align Right (Ctrl + Shift + R)" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-text-right"></i></Button>
    </ButtonGroup>

    {/* INDENT & SPACING */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={() => handleFormat('outdent')} title="Decrease Indent (Ctrl + [)" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-text-indent-left"></i>
        </Button>
        <Button onClick={() => handleFormat('indent')} title="Increase Indent (Ctrl + ])" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-text-indent-right"></i>
        </Button>
        <Button onClick={() => handleFormat('letterspacing', 2)} title="Character Spacing" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-arrows-expand"></i>
        </Button>
        <Button onClick={() => handleFormat('wordspacing', 10)} title="Word Spacing" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-distribute-horizontal"></i>
        </Button>
        <Button onClick={() => handleFormat('lineheight', '2')} title="Line Spacing" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-text-paragraph"></i>
        </Button>
    </ButtonGroup>

    {/* SIZE SELECTOR */}
    <div className="d-flex align-items-center" style={{ flexShrink: 0 }}>
        <Form.Label className={`text-sm font-medium me-2 mb-0 ${darkMode ? 'text-light' : 'text-dark'}`}>
            Size:
        </Form.Label>
        <div 
            className="d-flex align-items-center bg-body-tertiary rounded border border-secondary-subtle p-1" 
            style={{ backgroundColor: darkMode ? '#2b3035' : '#f8f9fa' }}
        >
            <Button 
                variant={darkMode ? "outline-light" : "outline-dark"} 
                size="sm" 
                className="border-0 px-2"
                title='Decrease Font Size (Ctrl + Shift + <)'
                onClick={() => {
                    const newSize = Math.max(1, parseInt(selectedSizeIndex) - 1);
                    setSelectedSizeIndex(newSize);
                    handleFormat('fontSize', newSize);
                }}
            >
                <i className="bi bi-dash-lg"></i>
            </Button>
            <span 
                className={`mx-2 fw-bold text-center ${darkMode ? 'text-light' : 'text-dark'}`} 
                style={{ minWidth: '35px', fontSize: '0.9rem' }}
            >
                {selectedSizeIndex}
            </span>
            <Button 
                variant={darkMode ? "outline-light" : "outline-dark"} 
                size="sm" 
                className="border-0 px-2"
                title='Increase Font Size (Ctrl + Shift + >)'
                onClick={() => {
                    const newSize = Math.min(400, parseInt(selectedSizeIndex) + 1);
                    setSelectedSizeIndex(newSize);
                    handleFormat('fontSize', newSize);
                }}
            >
                <i className="bi bi-plus-lg"></i>
            </Button>
        </div>
    </div>

    {/* HIGHLIGHT COLOR */}
    <div style={{ flexShrink: 0 }}>
        <label 
            className="btn btn-light rounded-circle m-0 d-flex align-items-center justify-content-center"
            title='Highlight Color'
            style={{ 
                width: '2.6rem', 
                height: '2.6rem', 
                borderRadius: '50px', 
                border: '2px solid black',
                backgroundColor: highlightColor,
                position: 'relative',
                cursor: 'pointer'
            }} 
        >
            <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(highlightColor) }}></i>
            <input 
                type="color"
                hidden 
                value={highlightColor}
                onChange={(e) => {setHighlightColor(e.target.value); handleFormat('backColor', e.target.value);}}
            />
        </label>
    </div>

    {/* FONT COLOR */}
    <div style={{ flexShrink: 0 }}>
        <label 
            className="btn btn-light rounded-circle m-0 d-flex align-items-center justify-content-center"
            title='Font Color'
            style={{ 
                width: '2.6rem', 
                height: '2.6rem', 
                borderRadius: '50px', 
                border: '2px solid black',
                backgroundColor: fontColor,
                position: 'relative',
                cursor: 'pointer'
            }} 
        >
            <i className="bi bi-pencil-fill" style={{ color: getContrastYIQ(fontColor) }}></i>
            <input 
                type="color"
                hidden 
                value={fontColor}
                onChange={(e) => {setFontColor(e.target.value); handleFormat('foreColor', e.target.value);}}
            />
        </label>
    </div>

    {/* EXTRA ACTIONS */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={() => setShowRulesModal(true)} title="Conditional Syntax Highlighting" variant="qdoc-btn" className='qdoc-btn' size="sm"><i className="bi bi-funnel"></i></Button>
        <Button title='Font Shadow' variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={() => openShadowModal()}><i className='bi bi-lightbulb-fill'></i></Button>
        <Button onClick={() => setShowPrintModal(true)} title="Print (Ctrl + P)" variant="qdoc-btn" className='qdoc-btn' size="sm">🖨</Button>
    </ButtonGroup>

    {/* HIDDEN INPUTS */}
    <input type="file" id="videoInput" hidden accept="video/*" onChange={handleVideoFileChange} />

</div>
</div>
</Collapse>

{/* INSERT MENU TOGGLE */}
<Button 
    onClick={() => setOpenInsertControls(!openInsertControls)} 
    title="Toggle Insert Controls" 
    variant="qdoc-outline-btn" 
    className='qdoc-outline-btn p-2' 
    size="sm" 
    style={{ 
        width: '2.6rem', 
        height: '2.6rem', 
        borderRadius: '50px', 
        position: 'relative',
        flexShrink: 0
    }}
>
    <i className="bi bi-image"></i>
</Button>

{/* INSERT MENU */}
<Collapse in={openInsertControls}>
<div>
<div style={{ 
    display: 'flex', 
    gap: '1rem', 
    alignItems: 'center', 
    animationName: 'fadeInLeft',
    animationDuration: '1s',
    flexWrap: 'nowrap'
}}>

    {/* MEDIA & LINK INSERT BUTTONS */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <input type="file" ref={fileInputRefLocalImage} hidden accept="image/*" onChange={handleLocalImageChange} />
        <Button onClick={() => fileInputRefLocalImage.current.click()} title="Insert Local Image" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-card-image"></i>
        </Button>
        <Button onClick={handleInsertImage} title="Insert Image from URL" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-image"></i>
        </Button>
        <Button onClick={handleInsertIframe} title="Embed Iframe or Local File" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-window-dock"></i>
        </Button>
        <Button onClick={() => document.getElementById('videoInput').click()} title="Insert Video from System" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-play-btn"></i>
        </Button>
        <Button onClick={handleInsertLink} title="Insert Hyperlink (Ctrl+K)" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-link"></i>
        </Button>
        <Button onClick={() => setShowOcrModal(true)} title="OCR Scan" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-camera"></i>
        </Button>
    </ButtonGroup>    

    {/* LISTS & CHECKBOXES */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={handleInsertUnorderedList} title="Insert Unordered List" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-list-ul"></i>
        </Button>
        <Button onClick={handleInsertOrderedList} title="Insert Ordered List" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-list-ol"></i>
        </Button>
        <Button onClick={() => handleFormat('insertnestedorderedlist')} title="Insert Nested Ordered List" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-list-nested"></i>
        </Button>
        <Button onClick={() => handleFormat('insertnestedunorderedlist')} title="Insert Nested Unordered List" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-list-nested"></i>
        </Button>
        <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={insertCheckbox} title="Insert Checkbox">
            <i className="bi bi-check2-square"></i>
        </Button>
        <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={insertToggleList} title="Insert Toggle List">
            <i className="bi bi-toggle-on"></i>
        </Button>
        <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={insertRadioButton} title="Insert Radio Button">
            <i className="bi bi-circle-fill"></i>
        </Button>
    </ButtonGroup>

    {/* TABLE & SECTION INSERT */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={handleInsertTable} title="Insert Custom Table (Rows & Cols)" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-table"></i>
        </Button>
        <Button onClick={() => setOpenSectionControls(!openSectionControls)} title="Insert Collapsible Section" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-list-columns"></i>
        </Button>
    </ButtonGroup>

    {/* VOICE & SPEECH CONTROL */}
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
        <Button onClick={handleReadAloud} title="Read Aloud" variant="qdoc-btn" className='qdoc-btn' size="sm">
            <i className="bi bi-volume-up-fill"></i>
        </Button>
        <Button onClick={startDictation} variant="qdoc-btn" size="sm" className={`qdoc-btn ${isListening ? 'animate-pulse' : ''}`} title="Voice Dictation">
            <i className={`bi ${isListening ? 'bi-mic-fill text-danger' : 'bi-mic '}`}></i>
        </Button>
    </ButtonGroup>

</div>

{/* COLLAPSIBLE SECTION STYLING PANEL */}
<Collapse in={openSectionControls}>
    <div className="mt-3">
        <Card body className="bg-light">
            <Row className="align-items-end g-3">
                <Col md={2}>
                    <Form.Label className="small fw-bold">Background Color</Form.Label>
                    <Form.Control
                        type="color"
                        value={sectionStyles.bgColor}
                        onChange={(e) => setSectionStyles({...sectionStyles, bgColor: e.target.value})}
                        title="Choose background color"
                    />
                </Col>

                <Col md={2}>
                    <Form.Label className="small fw-bold">Heading Text Color</Form.Label>
                    <Form.Control
                        type="color"
                        value={sectionStyles.headingTextColor}
                        onChange={(e) => setSectionStyles({...sectionStyles, headingTextColor: e.target.value})}
                        title="Choose heading color"
                    />
                </Col>

                <Col md={4}>
                    <Form.Label className="small fw-bold">Border Radius: {sectionStyles.radius}px</Form.Label>
                    <Form.Range 
                        min="0" 
                        max="20" 
                        value={sectionStyles.radius}
                        onChange={(e) => setSectionStyles({...sectionStyles, radius: e.target.value})}
                    />
                </Col>

                <Col md={4}>
                    <Form.Label className="small fw-bold">Heading: {sectionStyles.name}</Form.Label>
                    <Form.Control 
                        value={sectionStyles.name}
                        onChange={(e) => setSectionStyles({...sectionStyles, name: e.target.value})}
                    />
                </Col>

                <Col md={2} className="d-grid">
                    <Button variant="primary" size="sm" onClick={handleApply}>
                        Apply
                    </Button>
                </Col>
            </Row>
        </Card>
    </div>
</Collapse>
</div>
</Collapse>
{/* --- END INSERT CONTROLS --- */}


{/* SEARCH AND REPLACE TOGGLE */}
<Button 
    onClick={() => setOpenSearchControls(!openSearchControls)} 
    title="Toggle Search and Replace" 
    variant="qdoc-outline-btn" 
    className='qdoc-outline-btn p-2' 
    size="sm" 
    style={{ 
        width: '2.6rem', 
        height: '2.6rem', 
        borderRadius: '50px', 
        position: 'relative',
        flexShrink: 0
    }}
>
    <i className="bi bi-search"></i>
</Button>

{/* SEARCH AND REPLACE MENU */}
<Collapse in={openSearchControls}>
<div>
<div 
    id="search-controls-collapse" 
    className="p-3 border rounded shadow-sm bg-light"
    style={{ 
        animationName: 'fadeInLeft',
        animationDuration: '1s'
    }}
>
    {/* Inputs */}
    <Row className="g-3 mb-3">
        <Col md>
            <Form.Control 
                type="text" 
                placeholder="Text to find..." 
                value={searchText} 
                onChange={(e) => setSearchText(e.target.value)} 
                size="sm"
            />
        </Col>
        <Col md>
            <Form.Control 
                type="text" 
                placeholder="Replacement text..." 
                value={replaceText} 
                onChange={(e) => setReplaceText(e.target.value)} 
                size="sm"
            />
        </Col>
    </Row>

    {/* METRICS DISPLAY */}
    <Row className="mb-3 border-bottom pb-2">
        <Col xs={4}>
            <p className="text-sm mb-0">
                <i className="bi bi-hash me-1 text-primary"></i><strong>Words:</strong> {wordCount}
            </p>
        </Col>
        <Col xs={4}>
            <p className="text-sm mb-0">
                <i className="bi bi-text-paragraph me-1 text-success"></i><strong>Characters:</strong> {charCount}
            </p>
        </Col>
        <Col xs={4}>
            <p className="text-sm mb-0">
                <i className="bi bi-type me-1 text-info"></i><strong>Chars (No Space):</strong> {charNoSpaceCount}
            </p>
        </Col>
    </Row>

    {/* Options, Status, and Actions */}
    <Row className="g-2 align-items-center justify-content-between">
        <Col xs="auto" className="d-flex gap-2">
            <SearchOptionButton label="Case Sensitive" isActive={isCaseSensitive} onClick={() => setIsCaseSensitive(prev => !prev)}/>
            <SearchOptionButton label="Whole Word" isActive={isWholeWord} onClick={() => setIsWholeWord(prev => !prev)}/>
        </Col>

        <Col xs="auto">
            <p className="text-sm text-muted mb-0">
                {searchText.length > 0 && matchCount > 0 
                    ? `Match ${currentMatchIndex + 1} of ${matchCount}` 
                    : searchText.length > 0 
                        ? "No matches found." 
                        : "Enter text to search."}
            </p>
        </Col>

        <Col xs="auto" className='d-flex gap-2'>
            <Button onClick={handlePrevMatch} disabled={matchCount <= 1} title="Previous Match" variant='qdoc-btn' size="sm" className="qdoc-btn">
                <i className="bi bi-chevron-left"></i>
            </Button>
            <Button onClick={handleNextMatch} disabled={matchCount <= 1} title="Next Match" variant='qdoc-btn' size="sm" className="qdoc-btn">
                <i className="bi bi-chevron-right"></i>
            </Button>
            <Button onClick={handleReplace} disabled={currentMatchIndex === -1 || replaceText.length === 0} title="Replace Current Match" variant='qdoc-btn' className="qdoc-btn" size="sm">
                Replace
            </Button>
            <Button onClick={handleReplaceAll} disabled={matchCount === 0 || replaceText.length === 0} title="Replace All Matches" variant='qdoc-btn' className="qdoc-btn" size="sm">
                Replace All
            </Button>
            <Button onClick={() => setShowExtractorModal(!showExtractorModal)} title="Extract Data" variant='qdoc-btn' size="sm" className="qdoc-btn">
                <i className="bi bi-robot"></i>
            </Button>
        </Col>
    </Row>
</div>
</div>
</Collapse>

{/* DOCUMENT MENU TOGGLE */}
<Button onClick={() => setShowDocumentMenu(!showDocumentMenu)} title="Document Menu" variant="qdoc-outline-btn" className='qdoc-outline-btn p-2' size="sm" style={{ 
        width: '2.6rem', 
        height: '2.6rem', 
        borderRadius: '50px', 
        position: 'relative',
        flexShrink: 0
    }}><i className="bi bi-file-earmark"></i></Button>

{/* DOCUMENT MENU */}
<Collapse in={showDocumentMenu}>
<div>
<div style={{ 
    display: 'flex', 
    gap: '1rem', 
    alignItems: 'center', 
    animationName: 'fadeInLeft',
    animationDuration: '1s'
}}>
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
    <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={() => setShowDocDeck(!showDocDeck)} title="Toggle Document Deck">
        {showDocDeck ? 'Hide Deck' : 'Show Deck'}
    </Button>
    </ButtonGroup>
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
    <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={handleCreateNewDoc}>
        <i className="bi bi-file-earmark-plus"></i>
    </Button>
    </ButtonGroup> 
    <ButtonGroup className='qdoc-btn gap-3' style={{ flexShrink: 0 }}>
    <Button variant="qdoc-btn" className='qdoc-btn' size="sm" onClick={() => setShowPageSettingsModal(true)} title='Document Settings'><i className="bi bi-gear"></i></Button>
    </ButtonGroup>            
    </div>
</div>
</Collapse>
                        
                        {/* <Row className="m-3 col-sm-auto">
                            <Col>
                                <Button
                                    onClick={handleSubmit}
                                    title="Submit Document"
                                    variant="success"
                                    className="w-100"
                                >
                                    Submit Document
                                </Button>
                            </Col>
                        </Row> */}

                        
        </div>
    </div>
    {/* Calculate Active Settings First */}
<div className="d-flex w-100 h-100">
    {/* 🌟 DOCUMENT DECK SIDEBAR */}
    {showDocDeck && (
        <div className="border-end p-2 d-flex flex-column" style={{ 
            width: '10rem', 
            maxHeight:'68vh', 
            overflowY: 'auto', 
            flexShrink:0,
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            backgroundColor: '#f8f9fa'
        }}>
            {documents.map((doc, idx) => {
                const w = doc.globalStylesOverride && doc.docWidth ? doc.docWidth : (globalDocSettings?.docWidth || 800);
                const h = doc.globalStylesOverride && doc.docHeight ? doc.docHeight : (globalDocSettings?.docHeight || 1120);
                const bg = doc.globalStylesOverride && doc.docColor ? doc.docColor : (docColor || '#ffffff');

                return (
                    <div 
                        key={doc.primaryId} 
                        className="position-relative mb-3"
                        draggable
                        onDragStart={() => setDraggedDocId(doc.primaryId)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                            if (!draggedDocId || draggedDocId === doc.primaryId) return;
                            const reordered = [...documents];
                            const dIdx = reordered.findIndex(d => d.primaryId === draggedDocId);
                            const [moved] = reordered.splice(dIdx, 1);
                            reordered.splice(idx, 0, moved);
                            setDocuments(reordered);
                            
                            // Optional: Save reordered state to history here
                            if (typeof saveState === 'function') {
                                setTimeout(saveState, 50);
                            }
                            setDraggedDocId(null);
                        }}
                        style={{ cursor: 'grab' }}
                    >
                        <Card 
                            onClick={() => {
    if (currentDocId === doc.primaryId) return;

    // 1. Clear pending typing syncs so they don't overwrite the new document
    if (syncChunkTimeoutRef.current) clearTimeout(syncChunkTimeoutRef.current);

    // 2. Capture the HTML as a static string BEFORE mutating the DOM
    const savedHtml = editorRef.current ? editorRef.current.innerHTML : '';

    // 3. Queue state update using the static string
    setDocuments(prev => prev.map(d => 
        d.primaryId === currentDocId 
        ? { ...d, content: savedHtml } 
        : d
    ));

    // 4. Switch the active document
    setCurrentDocId(doc.primaryId);

    // 5. Safely inject the new document's content
    if (editorRef.current) {
        editorRef.current.innerHTML = doc.content || '';
    }
}}
                            className="p-0 shadow-sm"
                            style={{ 
                                aspectRatio: `${w} / ${h}`, 
                                backgroundColor: bg,
                                border: currentDocId === doc.primaryId ? '3px solid #0d6efd' : '1px solid #dee2e6',
                                overflow: 'hidden',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {/* Inner label with contrasting text */}
                            <div className="w-100 h-100 d-flex align-items-center justify-content-center p-1 text-center" 
                                 style={{ mixBlendMode: 'difference', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', wordBreak: 'break-word' }}>
                                {doc.title || `Doc ${idx + 1}`}
                            </div>
                        </Card>   
                        
                        {/* DECK DELETE BUTTON */}
                        {documents.length > 1 && (
                            <Button 
                                variant="danger" 
                                size="sm" 
                                className="position-absolute top-0 end-0 p-0 rounded-circle shadow" 
                                style={{ width: '1.4rem', height: '1.4rem', transform: 'translate(30%, -30%)', zIndex: 10, fontSize: '0.8rem', lineHeight: '1' }} 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newDocs = documents.filter(d => d.primaryId !== doc.primaryId);
                                    setDocuments(newDocs);
                                    if (currentDocId === doc.primaryId) {
                                        const newActive = newDocs[Math.max(0, idx - 1)];
                                        setCurrentDocId(newActive.primaryId);
                                        if (editorRef.current) editorRef.current.innerHTML = newActive.content || '';
                                    }
                                }}
                            >
                            &times;
                            </Button>
                        )}

                        {/* DECK DUPLICATE BUTTON */}
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="position-absolute bottom-0 end-0 p-0 rounded-circle shadow" 
                            style={{ width: '1.4rem', height: '1.4rem', transform: 'translate(30%, 30%)', zIndex: 10, fontSize: '0.9rem', lineHeight: '1' }}
                            title="Duplicate Document"
                            onClick={(e) => {
                                e.stopPropagation();
                                const newDocId = `doc_${Date.now()}`;
                                const clonedDoc = { ...doc, primaryId: newDocId, title: `${doc.title || 'Doc'} (Copy)` };
                                const newDocs = [...documents];
                                newDocs.splice(idx + 1, 0, clonedDoc);
                                setDocuments(newDocs);
                            }}
                        >
                            +
                        </Button>
                    </div>
                );
            })}
            
            <Button variant="outline-primary" size="sm" className="w-100 mt-2 flex-shrink-0" onClick={() => {
                const docId = `doc_${Date.now()}`;
                const newDoc = {
                    title: `Document ${documents.length + 1}`,
                    primaryId: docId,
                    content: '<div class="qdoc-page"><p><br></p></div>',
                    docWidth: globalDocSettings?.docWidth || 800,
                    docHeight: globalDocSettings?.docHeight || 1120,
                    topMargin: globalDocSettings?.topMargin || 40,
                    bottomMargin: globalDocSettings?.bottomMargin || 40,
                    leftMargin: globalDocSettings?.leftMargin || 40,
                    rightMargin: globalDocSettings?.rightMargin || 40,
                    globalStylesOverride: false
                };
                setDocuments([...documents, newDoc]);
            }}>
                + Add Document
            </Button>
        </div>
    )}

    {/* 🌟 EDITOR CONTAINER */}
{(() => {
    const activeDoc = documents.find(d => d.primaryId === currentDocId) || {};
    const activeWidth = activeDoc.globalStylesOverride && activeDoc.docWidth ? activeDoc.docWidth : (pageDims?.width || 800);
    const activeHeight = activeDoc.globalStylesOverride && activeDoc.docHeight ? activeDoc.docHeight : (pageDims?.height || 1120);
    const activeColor = activeDoc.globalStylesOverride && activeDoc.docColor ? activeDoc.docColor : (docColor || '#ffffff');

    return (
        <div className="d-flex flex-grow-1" style={{ 
            ...editorStyle,
            whiteSpace: 'pre-wrap', 
            minHeight: '68vh',
            maxHeight: '68vh',
            overflowY: 'scroll',
            outline: 'none', 
            paddingLeft: '0.5%', 
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            backgroundColor: viewMode === 'paged' ? '#e9ecef' : activeColor, 
            padding: viewMode === 'paged' ? '20px 0' : '0'
        }}>
            <style>
                {`
                .qdoc-page {
                    width: ${viewMode === 'paged' ? `${activeWidth}px` : '100%'};
                    min-height: ${viewMode === 'paged' ? `${activeHeight}px` : 'auto'};
                    background-color: ${activeColor};
                    margin: ${viewMode === 'paged' ? '0 auto 25px auto' : '0'};
                    padding: ${activeDoc.topMargin || 40}px ${activeDoc.rightMargin || 40}px ${activeDoc.bottomMargin || 40}px ${activeDoc.leftMargin || 40}px;
                    box-shadow: ${viewMode === 'paged' ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'};
                    box-sizing: border-box;
                    position: relative;
                }
                `}
            </style>

            <LineNumberGutter count={lineCount} editorRef={editorRef} />

            <div 
                ref={editorRef}
                contentEditable="true"
                // onInput={() => {
                //     syncInteractiveElements(); 
                //     handleInput();            
                    
                //     // We run the reflow on a tiny debounce to prevent cursor stutter while typing fast
                //     if (window.reflowTimeoutRef) clearTimeout(window.reflowTimeoutRef);
                //     window.reflowTimeoutRef = setTimeout(() => {
                //         reflowPagination();
                //     }, 150);
                    
                //     if (syncChunkTimeoutRef.current) clearTimeout(syncChunkTimeoutRef.current);
                //     syncChunkTimeoutRef.current = setTimeout(() => {
                //         setDocuments(prevDocs => prevDocs.map(d => 
                //             d.primaryId === currentDocId 
                //             ? { ...d, content: editorRef.current.innerHTML } 
                //             : d
                //         ));
                //     }, 500);

                //     if (typingHistoryTimeoutRef.current) clearTimeout(typingHistoryTimeoutRef.current);
                //     typingHistoryTimeoutRef.current = setTimeout(() => {
                //         if (typeof saveState === 'function') saveState();
                //     }, 800);
                // }}
                onInput={() => {
    syncInteractiveElements(); 
    handleInput();            

    // Trigger the Virtual Layout Engine
    if (window.reflowTimeoutRef) clearTimeout(window.reflowTimeoutRef);
    window.reflowTimeoutRef = setTimeout(() => {
        runPaginationEngine();
    }, 250); // 250ms debounce ensures smooth typing performance

    // Sync to React State Array
    if (syncChunkTimeoutRef.current) clearTimeout(syncChunkTimeoutRef.current);
    syncChunkTimeoutRef.current = setTimeout(() => {
        setDocuments(prevDocs => prevDocs.map(d => 
            d.primaryId === currentDocId 
            ? { ...d, content: editorRef.current.innerHTML } 
            : d
        ));
    }, 500);

    if (typingHistoryTimeoutRef.current) clearTimeout(typingHistoryTimeoutRef.current);
    typingHistoryTimeoutRef.current = setTimeout(() => {
        if (typeof saveState === 'function') saveState();
    }, 800);
}}
                onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                    setTimeout(reflowPagination, 100);
                }}
                onClick={(e) => {
                    const deleteBtn = e.target.closest('.delete-element-btn');
                    if (deleteBtn) {
                        const container = deleteBtn.closest('.radio-container') || deleteBtn.closest('.custom-toggle');
                        if (container) container.remove();
                        setTimeout(reflowPagination, 100); // Reflow if deleting large blocks
                    }
                    syncInteractiveElements();
                    handleInput();
                }}
                suppressContentEditableWarning={true}
                style={{ 
                    outline: 'none',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}
            >
            </div>
        </div>
    );
})()}
</div>
                    </Tab>
                    <Tab eventKey="attachments" title={
                        <span>
            Media ({mediaItems.length}) 
            <small className="ms-2 text-muted" style={{ fontSize: '0.7rem' }}>
                [{formatBytes(totalSize)}]
            </small>
        </span>
                    }>
                         <div className="p-3" style={{...getDocStyle(docColor, docBgImage, darkMode),minHeight: "81.8vh",overflowY:'scroll'}}>
                                                 {/* Attachments Toolbar */}
                                                 <div className="toolbar-container mb-3 d-flex align-items-center flex-nowrap overflow-auto py-2" style={{ scrollbarWidth: 'none' }}>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" title='Attach Image'>
                                                     <i className="bi bi-image"></i> Image <input type="file" hidden accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                                                 </label>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" title='Attach Video'>
                                                     <i className="bi bi-camera-video"></i> Video <input type="file" hidden accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} />
                                                 </label>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" title='Attach Audio'>
                                                     <i className="bi bi-music-note"></i> Audio <input type="file" hidden accept="audio/*" onChange={(e) => handleFileUpload(e, 'audio')} />
                                                 </label>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" title='Attach Canvas' onClick={addCanvas}>
                                                     <i className="bi bi-palette"></i> Canvas
                                                 </label>
                                                 {/* Recording Buttons */}
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('image')} title="Take Photo">
                                                     <i className="bi bi-camera"></i> Camera
                                                 </label>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('video')} title="Record Video">
                                                     <i className="bi bi-camera-reels"></i> Rec Video
                                                 </label>
                                                 <label className="qdoc-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('audio')} title="Record Audio">
                                                     <i className="bi bi-mic"></i> Rec Audio
                                                 </label>
                                             </div>
                         
                                                 {/* Capture Area Logic */}
                                                 {recordingType && (
                                                     <div className="bg-dark p-3 rounded-4 mb-3 text-center position-relative text-white">
                                                         {(recordingType === 'image' || recordingType === 'video') && (
                                                             <video ref={videoPreviewRef} autoPlay muted playsInline className="w-100 rounded-3 mb-2" style={{ maxHeight: '300px' }} />
                                                         )}
                                                         {recordingType === 'audio' && (
                                                             <div className="py-4">
                                                                 <div className={isRecording ? "spinner-grow text-danger" : ""}></div>
                                                                 <p>{isRecording ? "Recording Audio..." : "Ready to Record"}</p>
                                                             </div>
                                                         )}
                                                         <div className="d-flex justify-content-center gap-2">
                                                             {recordingType === 'image' && <Button variant="light" onClick={captureImage}>Capture</Button>}
                                                             {(recordingType === 'video' || recordingType === 'audio') && (
                                                                 !isRecording ? 
                                                                 <Button variant="success" onClick={startRecording}>Start</Button> : 
                                                                 <Button variant="danger" onClick={stopRecording}>Stop & Attach</Button>
                                                             )}
                                                             <Button variant="secondary" onClick={stopMedia}>Cancel</Button>
                                                         </div>
                                                     </div>
                                                 )}
                         
                                                 {/* Attachments Grid */}
                                                 <div className="d-flex flex-wrap gap-3" >
                                                     {mediaItems.map((item) => (
                                                         <div key={item.id} className="position-relative border rounded shadow-sm" style={{ width: '10rem', height: '8rem' }}>
                                                             <div className="w-100 h-100 d-flex align-items-center justify-content-center overflow-hidden rounded" onClick={() => setPreviewMedia(item)}>
                                                                 {item.type === 'image' && <Image src={item.url} className="w-100 h-100 object-fit-cover" />}
                                                                 {item.type === 'video' && <video src={item.url} className="w-100 h-100 object-fit-cover" controls/>}
                                                                 {item.type === 'audio' && <audio src={item.url} className="bi bi-file-earmark-music fs-1 text-primary" controls/>}
                                                             </div>
                                                             <Button variant="danger" size="sm" className="position-absolute top-0 end-0 m-1 rounded-circle" onClick={() => removeMediaItem(item.id)}>✕</Button>
                                                         </div>
                                                     ))}
                                                 </div>
                         
                                                 {/* Drawing Canvases */}
                                                 <div className="mt-4">
                                                     {canvases.map((canvas) => (
                                                         <DrawingCanvas 
                                                             key={`${canvas.id}-${canvas.data ? 'has-data' : 'empty'}`}
                                                             id={canvas.id} 
                                                             initialData={canvas.data} 
                                                             darkMode={darkMode}
                                                             onRemove={removeCanvas} 
                                                             onPreview={(url) => setPreviewMedia({ url, type: 'image' })} // Trigger modal
                                                             saveRef={(ref) => canvasRefs.current[canvas.id] = ref} 
                                                         />
                                                     ))}
                                                 </div>
                                             </div>
                    </Tab>
                    <Tab eventKey="mindmap" title={<span><i className="bi bi-diagram-3"></i> Mind Map</span>}>
                    <div style={{ ...getDocStyle(docColor, docBgImage, darkMode),height: '82vh', width: '100%', overflow: 'hidden',  }}>
                        <MindMapEditor 
                        key={`${fileHandle?.name || 'new'}-${lastLoadTime}`}
                        //key={mindMapData ? 'loaded' : 'empty'}    
                        initialData={mindMapData} 
                            onUpdate={(data) => setMindMapData(data)} 
                            darkMode={false}
                        />
                    </div>
                </Tab>
                </Tabs>)}

                {/* --- FOOTER SAVE BUTTONS --- */}
                <div className="p-3 border-top d-flex justify-content-between align-items-center sticky-bottom"
                style={getDocStyle(docColor, docBgImage, darkMode)}>
                    <div className="d-flex gap-2">
                        <Button title="Import Menu" variant="qdoc-btn rounded-ui" className='qdoc-btn rounded-ui' onClick={() => setShowImportModal(true)}>
                            <i className="bi bi-upload"></i>
                        </Button>
                        <Button title="Download Menu" variant="qdoc-btn rounded-ui" className='qdoc-btn rounded-ui' onClick={() => setShowDownloadModal(true)}>
                            <i className="bi bi-download"></i>
                        </Button>
                    </div>
                    <div className="d-flex gap-2">
                        <Button title="Share Menu" variant="primary" onClick={() => setShowShareModal(true)} className="qdoc-btn">
                            <i className="bi bi-share"></i>
                        </Button>
                        <Button title="Save Menu" variant="primary" onClick={() => setShowSaveModal(true)} className="qdoc-btn">
                            <i className="bi bi-hdd"></i>
                        </Button>
                    </div>
                </div>
            </Form>
            
{/* --- Media Fullscreen Preview Modal --- */}
<Modal 
    show={!!previewMedia} 
    onHide={() => setPreviewMedia(null)} 
    centered 
    size="lg"
    contentClassName={darkMode ? "bg-dark border-secondary" : ""}
>
    <Modal.Header closeButton closeVariant={darkMode ? "white" : undefined} className="border-0">
        <Modal.Title className="small">
            <span>Preview</span>
{previewMedia && (
<span className="badge bg-secondary me-3">
    {formatBytes(previewMedia.size)}
</span>
)}
        </Modal.Title>
    </Modal.Header>
    <Modal.Body className="p-0 text-center bg-black d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        {previewMedia && previewMedia.type === 'image' && (
            <img 
                src={previewMedia.url} 
                alt="Preview" 
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} 
            />                        
        )}
        {previewMedia && previewMedia.type === 'video' && (
            <video 
                src={previewMedia.url} 
                alt="Preview" 
                style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }}
                controls
            />                         
        )}
        {previewMedia && previewMedia.type === 'audio' && (
            <audio 
                src={previewMedia.url} 
                alt="Preview" 
                style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }}
                controls
            />                        
        )}
    </Modal.Body>
    <Modal.Footer className="border-0 justify-content-between">
        <Button className="qdoc-btn" size="sm" onClick={() => setPreviewMedia(null)}>
            Close
        </Button>
        <Button 
            className="qdoc-btn" 
            size="sm" 
            onClick={() => downloadMedia(previewMedia.url, previewMedia.type)}
        >
            <i className="bi bi-download me-2"></i> Download Media
        </Button>
    </Modal.Footer>
</Modal>

{/* SYNTAX RULES MODAL */}
<Modal show={showRulesModal} onHide={() => setShowRulesModal(false)} size="lg">
    <Modal.Header closeButton>
        <Modal.Title>Conditional Formatting Rules</Modal.Title>
    </Modal.Header>
    <Modal.Body>
        <div className="d-flex justify-content-between mb-3">
            <div>
                <Button size="sm" variant="success" onClick={() => setSyntaxRules([...syntaxRules, { id: Date.now(), type: 'contains', val: '', style: { color: '#000000', backgroundColor: '#ffffff', fontSize: '12' }, caseSensitive: false }])}>
                    <i className="bi bi-plus-circle me-2"></i> Add Rule
                </Button>
                <Button size="sm" variant="primary" className="ms-2" onClick={applySyntaxRules}>
                    <i className="bi bi-play-fill me-2"></i> Apply Rules Now
                </Button>
                <Button size="sm" variant="danger" className="ms-2" onClick={clearAllSyntaxRules}>
                    <i className="bi bi-trash me-2"></i> Delete All
                </Button>
            </div>
            <div>
                <input type="file" id="ruleImport" hidden accept=".json" onChange={handleImportRules} />
                <Button size="sm" variant="outline-dark" className="me-2" onClick={() => document.getElementById('ruleImport').click()}>Import JSON</Button>
                <Button size="sm" variant="outline-dark" onClick={handleExportRules}>Export JSON</Button>
            </div>
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {syntaxRules.map((rule, idx) => (
                <div key={rule.id} className="p-2 mb-2 border rounded bg-light">
                    <Row className="g-2 align-items-center">
                        <Col xs={2}>
                            <Form.Select size="sm" value={rule.type} onChange={e => { const n = [...syntaxRules]; n[idx].type = e.target.value; setSyntaxRules(n); }}>
                                <option value="contains">Contains</option>
                                <option value="equals">Equals (Block)</option>
                                <option value="startsWith">Starts With</option>
                                <option value="endsWith">Ends With</option>
                                <option value="greaterThan">Greater Than</option>
                                <option value="lessThan">Less Than</option>
                            </Form.Select>
                        </Col>
                        <Col xs={3}>
                            <Form.Control size="sm" placeholder="Value..." value={rule.val} onChange={e => { const n = [...syntaxRules]; n[idx].val = e.target.value; setSyntaxRules(n); }} />
                        </Col>
                        <Col xs="auto">
                            <Form.Check type="switch" label="Case" checked={rule.caseSensitive} onChange={e => { const n = [...syntaxRules]; n[idx].caseSensitive = e.target.checked; setSyntaxRules(n); }} />
                        </Col>
                        
                        {/* Style Pickers */}
                        <Col xs="auto" className="d-flex align-items-center gap-1 border-start ps-2">
                            <small>Text:</small>
                            <Form.Control type="color" size="sm" value={rule.style.color} onChange={e => { const n = [...syntaxRules]; n[idx].style.color = e.target.value; setSyntaxRules(n); }} style={{width: '30px', padding:0}} />
                        </Col>
                        <Col xs="auto" className="d-flex align-items-center gap-1">
                            <small>Bg:</small>
                            <Form.Control type="color" size="sm" value={rule.style.backgroundColor} onChange={e => { const n = [...syntaxRules]; n[idx].style.backgroundColor = e.target.value; setSyntaxRules(n); }} style={{width: '30px', padding:0}} />
                        </Col>
                            <Col xs="auto" className="d-flex align-items-center gap-1">
                            <small>Sz:</small>
                            <Form.Control type="number" size="sm" value={rule.style.fontSize} onChange={e => { const n = [...syntaxRules]; n[idx].style.fontSize = e.target.value; setSyntaxRules(n); }} style={{width: '50px'}} />
                        </Col>

                        <Col className="text-end">
                            <Button size="sm" variant="danger" onClick={() => setSyntaxRules(syntaxRules.filter(r => r.id !== rule.id))}>
                                <i className="bi bi-trash"></i>
                            </Button>
                        </Col>
                    </Row>
                </div>
            ))}
            {syntaxRules.length === 0 && <p className="text-muted text-center mt-3">No rules defined. Add one to get started.</p>}
        </div>
    </Modal.Body>
</Modal>

{/* --- Text Shadow Modal --- */}
<Modal show={showShadowModal} onHide={() => setShowShadowModal(false)} centered style={{backgroundColor: darkMode?'black':'white', color: darkMode?'white':'black'}}>
    <Modal.Header closeButton style={{backgroundColor: darkMode?'black':'white', color: darkMode?'white':'black'}}>
        <Modal.Title>Text Shadow Settings</Modal.Title>
    </Modal.Header>
    <Modal.Body style={{backgroundColor: darkMode?'black':'white', color: darkMode?'white':'black'}}>
        <div className="mb-3">
            <label className="form-label">Shadow Color</label>
            <input 
                type="color" 
                className="form-control form-control-color w-100" 
                value={shadowConfig.color}
                onChange={(e) => setShadowConfig({...shadowConfig, color: e.target.value})}
            />
        </div>
        <div className="mb-3">
            <label className="form-label">Blur Amount ({shadowConfig.blur}px)</label>
            <input 
                type="range" className="form-range" min="0" max="20" 
                value={shadowConfig.blur}
                onChange={(e) => setShadowConfig({...shadowConfig, blur: e.target.value})}
            />
        </div>
        <div className="mb-3">
            <label className="form-label">Offset ({shadowConfig.offset}px)</label>
            <input 
                type="range" className="form-range" min="0" max="15" 
                value={shadowConfig.offset}
                onChange={(e) => setShadowConfig({...shadowConfig, offset: e.target.value})}
            />
        </div>
    </Modal.Body>
    <Modal.Footer style={{backgroundColor: darkMode?'black':'white', color: darkMode?'white':'black'}}>
    <Button variant="secondary rounded-ui" onClick={() => setShowShadowModal(false)}>Cancel</Button>
    <Button className="saffron-btn" onClick={removeTextShadow}>Remove</Button>
    <Button className="saffron-btn" onClick={applyTextShadow}>Apply</Button>
</Modal.Footer>
</Modal>

{/* LOCAL PAGE SETTINGS MODAL */}
<Modal 
    show={showPageSettingsModal} 
    onHide={() => setShowPageSettingsModal(false)}
    centered
    size="lg"
>
    <Modal.Header closeButton>
        <Modal.Title>Page Settings</Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {(() => {
            const currentDoc = documents.find(d => d.primaryId === currentDocId);
            if (!currentDoc) return <p>No active document.</p>;

            return (
                <div className="local-page-settings">
                    <Form.Group className="mb-4">
                        <Form.Label className="fw-bold">Document Title</Form.Label>
                        <Form.Control 
                            type="text" 
                            placeholder="Enter document title..." 
                            value={currentDoc.title || ''} 
                            onChange={(e) => setDocuments(docs => docs.map(d => 
                                d.primaryId === currentDocId 
                                ? { ...d, title: e.target.value } 
                                : d
                            ))} 
                        />
                    </Form.Group>

                    <Form.Check 
                        type="switch"
                        id="global-override-switch"
                        label="Override Global Styles (Dimensions, Colors, Margins)"
                        className="mb-3 fw-bold"
                        checked={currentDoc.globalStylesOverride || false}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setDocuments(docs => docs.map(d => 
                                d.primaryId === currentDocId 
                                ? { ...d, globalStylesOverride: checked } 
                                : d
                            ));
                        }}
                    />

                    {currentDoc.globalStylesOverride && (
                        <div className="border-top pt-3">
                            <div className="row mb-3">
                                <div className="col-md-6">
                                    <Form.Group>
                                        <Form.Label>Width (px)</Form.Label>
                                        <Form.Control type="number" value={currentDoc.docWidth || ''} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, docWidth: parseInt(e.target.value) || 0 } : d))} />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group>
                                        <Form.Label>Height (px)</Form.Label>
                                        <Form.Control type="number" value={currentDoc.docHeight || ''} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, docHeight: parseInt(e.target.value) || 0 } : d))} />
                                    </Form.Group>
                                </div>
                            </div>
                            
                            <Form.Group className="mb-3">
                                <Form.Label>Background Color</Form.Label>
                                <Form.Control 
                                    type="color" 
                                    value={currentDoc.docColor || '#ffffff'} 
                                    onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, docColor: e.target.value } : d))} 
                                />
                            </Form.Group>

                            <h6 className="mt-4 mb-2 text-muted">Margins (px)</h6>
                            <div className="row g-2">
                                <div className="col-3">
                                    <Form.Label className="small">Top</Form.Label>
                                    <Form.Control type="number" value={currentDoc.topMargin ?? 40} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, topMargin: parseInt(e.target.value) || 0 } : d))} />
                                </div>
                                <div className="col-3">
                                    <Form.Label className="small">Bottom</Form.Label>
                                    <Form.Control type="number" value={currentDoc.bottomMargin ?? 40} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, bottomMargin: parseInt(e.target.value) || 0 } : d))} />
                                </div>
                                <div className="col-3">
                                    <Form.Label className="small">Left</Form.Label>
                                    <Form.Control type="number" value={currentDoc.leftMargin ?? 40} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, leftMargin: parseInt(e.target.value) || 0 } : d))} />
                                </div>
                                <div className="col-3">
                                    <Form.Label className="small">Right</Form.Label>
                                    <Form.Control type="number" value={currentDoc.rightMargin ?? 40} onChange={(e) => setDocuments(docs => docs.map(d => d.primaryId === currentDocId ? { ...d, rightMargin: parseInt(e.target.value) || 0 } : d))} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        })()}
    </Modal.Body>
    <Modal.Footer>
        <Button variant="primary" onClick={() => setShowPageSettingsModal(false)}>
            Done
        </Button>
    </Modal.Footer>
</Modal>

{/* PRINT / EXPORT PDF MODAL */}
<Modal show={showPrintModal} onHide={() => setShowPrintModal(false)}>
    <Modal.Header closeButton>
        <Modal.Title><i className="bi bi-printer me-2"></i>Print & Export PDF</Modal.Title>
    </Modal.Header>
    <Modal.Body>
        <Form>
            {/* 1. Dimensions */}
            <h6 className="fw-bold">1. Page Dimensions (px)</h6>
            <Row className="mb-3">
                <Col>
                    <Form.Label className="small">Width</Form.Label>
                    <Form.Control type="number" value={printConfig.width} onChange={e => setPrintConfig({...printConfig, width: parseInt(e.target.value)})} />
                </Col>
                <Col>
                    <Form.Label className="small">Height</Form.Label>
                    <Form.Control type="number" value={printConfig.height} onChange={e => setPrintConfig({...printConfig, height: parseInt(e.target.value)})} />
                </Col>
            </Row>

            {/* 2. Filters */}
            <h6 className="fw-bold">2. Content Options</h6>
            <div className="mb-3 p-2 bg-light rounded border">
                <Form.Check 
                    type="switch" 
                    id="print-syntax"
                    label="Keep Syntax Highlighting (Colors)" 
                    checked={printConfig.useFilters} 
                    onChange={e => setPrintConfig({...printConfig, useFilters: e.target.checked})}
                />
                <Form.Check 
                    type="switch" 
                    id="print-images"
                    label="Include Images" 
                    checked={printConfig.showImages} 
                    onChange={e => setPrintConfig({...printConfig, showImages: e.target.checked})}
                />
                <Form.Check 
                    type="switch" 
                    id="print-videos"
                    label="Include Video Titles/Placeholders" 
                    checked={printConfig.showVideos} 
                    onChange={e => setPrintConfig({...printConfig, showVideos: e.target.checked})}
                />
            </div>

            {/* 3. Page Selection */}
            <h6 className="fw-bold">3. Pages</h6>
            <p className="text-muted small mb-2">Estimated Pages: <strong>{printConfig.estimatedPages}</strong> (based on height)</p>
            <Form.Group className="mb-3">
                <Form.Label className="small">Print Range (Native Print Dialog)</Form.Label>
                <Form.Control 
                    type="text" 
                    placeholder="Use 'Pages' option in the next screen (e.g. 1-3)" 
                    disabled 
                    className="bg-light"
                />
                <Form.Text className="text-muted">
                    Click "Print Now", then select "Save as PDF" or choose specific pages in the browser dialog.
                </Form.Text>
            </Form.Group>
        </Form>
    </Modal.Body>
    <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowPrintModal(false)}>Cancel</Button>
        <Button variant="primary" onClick={handlePrintProcess}>
            <i className="bi bi-printer-fill me-2"></i> Print Now / Save PDF
        </Button>
    </Modal.Footer>
</Modal>

{/* DATA EXTRACTOR CONTROL MODAL */}
<Modal 
  show={showExtractorModal} 
  onHide={() => setShowExtractorModal(false)} 
  centered 
  size="lg"
  data-bs-theme={darkMode ? 'dark' : 'light'}
>
  <Modal.Header closeButton>
    <Modal.Title className="h5"><i className="bi bi-robot me-2"></i>Data Extractor</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    <Form.Group className="mb-3">
      <Form.Label className="fw-bold">Target Match Selection Type</Form.Label>
      <div className="d-flex gap-2">
        {['email', 'phone', 'link'].map((type) => (
          <Form.Check
            key={type}
            type="radio"
            label={type.toUpperCase() + 's'}
            name="extractTypeGroup"
            id={`extract-${type}`}
            checked={extractType === type}
            onChange={() => { setExtractType(type); handleExtractData(type); }}
            inline
            className="fw-semibold"
          />
        ))}
      </div>
    </Form.Group>

    <Form.Group className="mb-3">
      <Form.Label className="small fw-bold text-muted">Indexed CSV Output Preview</Form.Label>
      <Form.Control
        as="textarea"
        rows={8}
        readOnly
        value={extractedCsvData}
        className="font-monospace small bg-body-tertiary"
      />
    </Form.Group>
  </Modal.Body>
  <Modal.Footer className="d-flex justify-content-between">
    <div className="text-muted small">
      Total Found: <strong>{extractedCsvData.split('\n').length - 1}</strong> lines
    </div>
    <div className="d-flex gap-2">
      <Button 
        variant="qdoc-outline-btn"
        className='qdoc-outline-btn'
        title='Copy to clipboard'
        onClick={() => {
          navigator.clipboard.writeText(extractedCsvData);
          alert("CSV content copied to clipboard!");
        }}
      >
        <i className="bi bi-clipboard"></i>
      </Button>
      <Button 
        variant="qdoc-btn"
        className="qdoc-btn" 
        disabled={!extractedCsvData || extractedCsvData.split('\n').length <= 1}
        onClick={() => {
          insertDictatedText('\n' + extractedCsvData);
          setShowExtractorModal(false);
        }}
        title='Paste directly in editor'
      > Paste
      </Button>
    </div>
  </Modal.Footer>
</Modal>

{/* OCR MODAL */}
<OcrModal 
    show={showOcrModal} 
    onHide={() => setShowOcrModal(false)} 
    onInsert={handleInsertOcrText} 
/>

{/* DOWNLOAD MODAL */}
<Modal 
    show={showDownloadModal} 
    onHide={() => setShowDownloadModal(false)} 
    centered
    // This attribute switches the modal's internal CSS variables
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
                { ext: '.qdoc', label: 'QDOC', icon: 'bi-file-text', color: 'text-primary' },
                { ext: '.txt', label: 'TXT', icon: 'bi-filetype-txt', color: 'text-primary' },
                { ext: '.odt', label: 'ODT', icon: 'bi-file-earmark', color: 'text-primary' },
                { ext: '.docx', label: 'DOCX', icon: 'bi-filetype-docx', color: 'text-primary' },
                { ext: '.csv', label: 'CSV', icon: 'bi-filetype-csv', color: 'text-primary' },
                { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-primary' },
                { ext: '.md', label: 'MD', icon: 'bi-markdown', color: 'text-primary' }
            ].map((file, index) => (
                <div className="col-6" key={index}>
                    <Button 
                        // Switches variant based on darkMode
                        variant={darkMode ? "outline-light" : "outline-dark"} 
                        className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
                        onClick={() => handleAction(file.ext, 'dl')}
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
    // This attribute switches the modal's internal CSS variables
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
                { ext: '.qdoc', label: 'QDOC', icon: 'bi-file-text', color: 'text-primary' },
                { ext: '.txt', label: 'TXT', icon: 'bi-filetype-txt', color: 'text-primary' },
                { ext: '.odt', label: 'ODT', icon: 'bi-file-earmark', color: 'text-primary' },
                { ext: '.docx', label: 'DOCX', icon: 'bi-filetype-docx', color: 'text-primary' },
                { ext: '.csv', label: 'CSV', icon: 'bi-filetype-csv', color: 'text-primary' },
                { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-primary' },
                { ext: '.md', label: 'MD', icon: 'bi-markdown', color: 'text-primary' }
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
                { ext: '.qdoc', label: 'QDOC', icon: 'bi-file-text', color: 'text-primary' },
                { ext: '.txt', label: 'TXT', icon: 'bi-filetype-txt', color: 'text-primary' },
                { ext: '.odt', label: 'ODT', icon: 'bi-file-earmark', color: 'text-primary' },
                { ext: '.docx', label: 'DOCX', icon: 'bi-filetype-docx', color: 'text-primary' },
                { ext: '.csv', label: 'CSV', icon: 'bi-filetype-csv', color: 'text-primary' },
                { ext: '.html', label: 'HTML', icon: 'bi-filetype-html', color: 'text-primary' },
                { ext: '.md', label: 'MD', icon: 'bi-markdown', color: 'text-primary' }
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
data-bs-theme={darkMode ? 'dark' : 'light'}
>
<Modal.Header closeButton>
<Modal.Title className="h5">
<i className="bi bi-upload me-2"></i>File Import
</Modal.Title>
</Modal.Header>
<Modal.Body>
<div className="row g-3">
{[
    { 
        label: 'Imp TXT', 
        icon: 'bi-filetype-txt', 
        color: 'text-success', 
        ref: fileInputRefTxt 
    },
    { 
        label: 'Imp ODT', 
        icon: 'bi-file-earmark', 
        color: 'text-primary', 
        ref: fileInputRefOdt 
    },
    { 
        label: 'Imp QDOC', 
        icon: 'bi-file-text', 
        color: 'text-primary', 
        ref: fileInputRefQDoc 
    },
].map((item, index) => (
    <div className="col-6" key={index}>
        <Button 
            variant={darkMode ? "outline-light" : "outline-dark"} 
            className={`w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary' : ''}`}
            onClick={() => item.ref.current.click()}
        >
            {/* Using bi-upload overlay or just the file icon */}
            <i className={`bi ${item.icon} ${item.color} fs-3 mb-2`}></i>
            <span className="small fw-bold">{item.label}</span>
        </Button>
    </div>
))}
</div>
</Modal.Body>
</Modal>

{/* EXPORT DOCUMENT SELECTOR MODAL */}
<Modal show={showExportModal} onHide={() => setShowExportModal(false)}>
    <Modal.Header closeButton><Modal.Title>Export Document</Modal.Title></Modal.Header>
    <Modal.Body>Do you want to export just the current document chunk, or the entire combined document?</Modal.Body>
    <Modal.Footer>
        <Button variant="secondary" onClick={() => { setShowExportModal(false); executeExport(exportConfig.ext, exportConfig.mode, 'single'); }}>Single Document</Button>
        <Button variant="primary" onClick={() => { setShowExportModal(false); executeExport(exportConfig.ext, exportConfig.mode, 'all'); }}>All Documents</Button>
    </Modal.Footer>
</Modal>

{/* PASSWORD UNLOCK MODAL */}
<Modal show={showUnlockModal} onHide={() => setShowUnlockModal(false)} centered size="sm" contentClassName="rounded-ui">
<Modal.Header closeButton>
    <Modal.Title className="fs-6"><i className="bi bi-key-fill text-warning"></i> Unlock QDOC</Modal.Title>
</Modal.Header>
<Form onSubmit={handleUnlock}>
    <Modal.Body>
        <Form.Control 
            type="password" 
            placeholder="Enter password..." 
            value={decryptionPass}
            onChange={(e) => setDecryptionPass(e.target.value)}
            className="rounded-ui"
            autoFocus
        />
    </Modal.Body>
    <Modal.Footer className="border-0 pt-0">
        <Button variant="secondary" size="sm" className="rounded-ui" onClick={() => setShowUnlockModal(false)}>Cancel</Button>
        <Button variant="primary" size="sm" className="qdoc-btn" type="submit">Unlock</Button>
    </Modal.Footer>
</Form>
</Modal>
        </div>
    );
};
export default QDoc;