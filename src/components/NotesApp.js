import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Card, Alert, InputGroup, Modal, Stack, Image, Badge, ButtonGroup, Dropdown, CloseButton, Tabs, Collapse, Tab } from 'react-bootstrap';
import { jsPDF } from "jspdf";
import JSZip from 'jszip';
import indexedDBService from '../services/IndexedDBService';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Keyboard } from '@capacitor/keyboard';
import "./NotesTheme.css"
import CryptoJS from 'crypto-js';
import html2canvas from "html2canvas";
import OcrModal from './OcrModal';
import MindMapEditor from './MindMapEditor'; // Adjust path as needed
import qnoteImg from '../Assets/Header/logo2.png'
// --- Constants ---
const DB_NAME = 'qnote';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// --- Sub-component: Drawing Canvas ---
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

const NotesApp = ({ fileHandle, onSave}) => {
    // --- State ---
    const [notes, setNotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [noteColor, setNoteColor] = useState('');
    const [noteBgImage, setNoteBgImage] = useState();
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [darkMode, setDarkMode] = useState(false);
    const [showOcrModal, setShowOcrModal] = useState(false);
    const [showShadowModal, setShowShadowModal] = useState(false);
    const [shadowConfig, setShadowConfig] = useState({ color: '#ff8103', blur: 4, offset: 2 });
    const [savedRange, setSavedRange] = useState(null);

    // Encryption-Decryption State
    const [noteHeading, setNoteHeading] = useState(''); // New Heading State
    const [password, setPassword] = useState(''); // For setting/entering password
    const [isLocked, setIsLocked] = useState(false); // Toggle for "Protect this note"
    const [decryptionPass, setDecryptionPass] = useState(''); // Input for unlocking
    const [showUnlockModal, setShowUnlockModal] = useState(false); // Modal to ask for password
    const [selectedLockedNote, setSelectedLockedNote] = useState(null); // Temp storage for the note being unlocked
    const [activeTab, setActiveTab] = useState('editor');
    const [showSettings, setShowSettings] = useState(false);

    // Editor State
    const [currentNote, setCurrentNote] = useState('');
    const [isDataReady, setIsDataReady] = useState(false);
    const [mediaItems, setMediaItems] = useState([]); // { type, url, file, name }
    const [canvases, setCanvases] = useState([]); // { id, data }
    const [mindMapData, setMindMapData] = useState({ nodes: [], connectors: [] });
    const [isListening, setIsListening] = useState(false);
    const [reminderAt, setReminderAt] = useState('');
    const [highlightColor, setHighlightColor] = useState('#ffff00');
    const [fontColor, setFontColor] = useState('#ffff00');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
    const editorRef = useRef(null);

    // --- Recorder states ---
    const [recordingType, setRecordingType] = useState(null); // 'image', 'video', or 'audio'
    const [isRecording, setIsRecording] = useState(false);
    const [stream, setStream] = useState(null);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const videoPreviewRef = useRef(null);
    
    const canvasRefs = useRef({}); // Store refs to canvas save functions
    const fileInputRef = useRef(null); // For importing .qnote
    const [selectedTags, setSelectedTags] = useState([]);
    const [noteTags, setNoteTags] = useState([]);
    const [previewMedia, setPreviewMedia] = useState(null);
    const [tfap_ad, setTfap_ad] = useState("111111111111111111111111111111111111111111111");
    
    // --- Effects ---
    useEffect(() => {
    if ("Notification" in window) {
        Notification.requestPermission();
    }
}, []);
    useEffect(() => {
        const initDB = async () => {
            try {
                await indexedDBService.createDatabaseWithObjectStores(DB_NAME, DB_VERSION, [STORE_NAME]);
                fetchNotes();
            } catch (error) {
                showAlert('danger', 'Failed to initialize database.');
            }
        };
        initDB();
    }, []);
    useEffect(() => {
    if (showModal && editorRef.current) {
        // We manually set the HTML only when the modal opens.
        // This prevents React from re-rendering mid-typing.
        editorRef.current.innerHTML = currentNote;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showModal, editingId]);
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

useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Use capture phase (true) to catch the toggle event from child <details> tags
    const handleToggle = (e) => {
        if (e.target.tagName === 'DETAILS') {
            syncInteractiveElements();
            setCurrentNote(editor.innerHTML);
        }
    };

    editor.addEventListener('toggle', handleToggle, true);
    return () => editor.removeEventListener('toggle', handleToggle, true);
}, [setCurrentNote]);

const scheduleReminder = async (time, noteTitle) => {
    if (!time) return;
    const triggerDate = new Date(time);
    
    // Prevent past dates
    if (triggerDate < new Date()) {
        alert("Cannot set a reminder for a past time.");
        return;
    }

    // 1. CAPACITOR NATIVE LOGIC
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display === 'granted') {
            await LocalNotifications.schedule({
                notifications: [{
                    title: "QNote Reminder",
                    body: `Don't forget: ${noteTitle || 'Untitled Note'}`,
                    id: Math.floor(Math.random() * 10000),
                    schedule: { at: triggerDate },
                    sound: 'default'
                }]
            });
            alert(`Native reminder set for ${triggerDate.toLocaleString()}`);
        }
    } 
    // 2. DESKTOP / PWA LOGIC
    else if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            const delay = triggerDate.getTime() - new Date().getTime();
            // Note: Browser-based reminders only work while the tab is open.
            // For PWAs to work in the background, you'd need a Service Worker.
            setTimeout(() => {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
                audio.play().catch(e => console.log("Sound blocked by browser policy"));
                new Notification("QNote Reminder", {
                    body: noteTitle || "Your scheduled note is ready!",
                    icon: "/favicon.ico" // Change to your app icon path
                });
            }, delay);
            
            alert(`Web reminder set for ${triggerDate.toLocaleString()}`);
        }
    }
};

const encryptData = (data, pass) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), pass).toString();
};

const decryptData = (ciphertext, pass) => {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, pass);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        return decryptedData;
    } catch (e) {
        return null; // Wrong password
    }
};

    // --- NOTE TAGS ---
    const fetchNotes = async () => {
        try {
            const result = await indexedDBService.getObjectStore(DB_NAME, DB_VERSION, STORE_NAME);
            setNotes(result.data || []);
        } catch (error) {
            console.error("Error fetching notes:", error);
        }
    };
    const toggleTagFilter = (tag) => {
    setSelectedTags(prev => 
        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    };
const allUniqueTags = Array.from(new Set(notes.flatMap(n => n.tags || [])));
const handleSmartSuggest = () => {
    // 1. Convert HTML content to plain text
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentNote;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    
    // 2. Tokenize: Clean up words (lowercase, remove special characters)
    const words = plainText.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3); // Ignore tiny words like "the", "is", "and"

    // 3. Match against existing tags you've already created in other notes
    const existingTags = allUniqueTags; // Using the variable we defined earlier
    const suggested = words.filter(word => existingTags.includes(word));

    // 4. Add "frequent" long words (optional bonus logic)
    // Counts occurrences of words > 5 chars and takes the top ones
    const wordCounts = {};
    words.forEach(w => { if(w.length > 5) wordCounts[w] = (wordCounts[w] || 0) + 1; });
    const frequentWords = Object.keys(wordCounts)
        .sort((a, b) => wordCounts[b] - wordCounts[a])
        .slice(0, 3);

    // 5. Combine, remove duplicates, and merge with current input
    //const currentInputTags = noteTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    const currentInputTags = (Array.isArray(noteTags) ? noteTags : noteTags.split(','))
    .map(t => t.trim().toLowerCase())
    .filter(t => t);
    if (reminderAt) {
    suggested.push("Reminder");
    }
    const combined = Array.from(new Set([...currentInputTags, ...suggested, ...frequentWords]));
    
    // 6. Update the input field with a clean comma-separated string
    setNoteTags(combined.join(', '));
};
// --- Extract Hashtags from Note Text ---
const handleExtractHashtags = () => {
    // 1. Convert HTML content to plain text to avoid matching HTML attributes (like hex colors)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentNote;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    // 2. Regex: Find # followed by word characters (letters, numbers, underscores)
    // The (\w+) capture group grabs the text after the #
    const hashtagRegex = /#(\w+)/g;
    let match;
    const extractedTags = [];

    while ((match = hashtagRegex.exec(plainText)) !== null) {
        // match[1] contains the tag without the '#'
        extractedTags.push(match[1].toLowerCase());
    }

    // 3. Merge with current input tags to avoid overwriting what's already there
    //const currentInputTags = noteTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    const currentInputTags = (Array.isArray(noteTags) ? noteTags : noteTags.split(','))
    .map(t => t.trim().toLowerCase())
    .filter(t => t);
    if (reminderAt) {
    extractedTags.push("reminder");
    }

    // Set ensures all tags are unique
    const combined = Array.from(new Set([...currentInputTags, ...extractedTags]));

    // 4. Update the tag input field
    setNoteTags(combined.join(', '));
};

    // --- Helpers ---
    const showAlert = (type, msg) => {
        setStatus({ type, msg });
        setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    };

    const getContrastYIQ = (hexcolor) => {
        hexcolor = hexcolor.replace("#", "");
        const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
        return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
    };

const getNoteStyle = (color, image, darkMode) => {
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

    // --- Voice ---
    const toggleDictation = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        
        if (isListening) {
            setIsListening(false); // Logic handled by onend usually, but simple toggle here
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setCurrentNote(prev => prev + ' ' + transcript);
        };
        recognition.start();
    };
    const handleReadAloud = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Create a temporary element to strip HTML tags
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = currentNote;
        const plainText = tempDiv.textContent || tempDiv.innerText || "";
        
        const utterance = new SpeechSynthesisUtterance(plainText);
        window.speechSynthesis.speak(utterance);
    }
};

    const applyStyle = (command, value = null) => {
    document.execCommand(command, false, value);
    };

    const handleUndo = (e) => {
    e.preventDefault();
    document.execCommand('undo', false, null);
    // Sync the state with the new DOM content after undo
    setCurrentNote(editorRef.current.innerHTML);
    };

    const handleRedo = (e) => {
        e.preventDefault();
        document.execCommand('redo', false, null);
        // Sync the state with the new DOM content after redo
        setCurrentNote(editorRef.current.innerHTML);
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

    const applyTextShadow = () => {
    if (!savedRange) return;

    // 1. Check if selection is already inside a shadow-span
    let parentSpan = savedRange.commonAncestorContainer;
    if (parentSpan.nodeType === 3) parentSpan = parentSpan.parentNode;
    
    const existingSpan = parentSpan.closest('span[data-qshadow="true"]');
    const { color, blur, offset } = shadowConfig;
    const shadowStyle = `${offset}px ${offset}px ${blur}px ${color}`;

    if (existingSpan) {
        // UPDATE EXISTING: If already shadowed, just change the style
        existingSpan.style.textShadow = shadowStyle;
    } else {
        // CREATE NEW: Wrap the selection
        const span = document.createElement("span");
        span.setAttribute('data-qshadow', 'true');
        span.style.textShadow = shadowStyle;
        
        // The Trick: Add a zero-width space at the end so typing continues inside
        const zwsp = document.createTextNode('\u200B'); 
        
        try {
            const content = savedRange.extractContents();
            span.appendChild(content);
            span.appendChild(zwsp); 
            savedRange.insertNode(span);
        } catch (e) {
            // Fallback for messy selections
            document.execCommand('insertHTML', false, 
                `<span data-qshadow="true" style="text-shadow: ${shadowStyle}">${savedRange.toString()}\u200B</span>`
            );
        }
    }
    
    setSavedRange(null);
    setShowShadowModal(false);
    
    // Auto-focus back to editor
    setTimeout(() => {
        const editor = document.querySelector('.editor-box');
        if (editor) editor.focus();
    }, 10);
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

    const insertCheckbox = () => {
        // Focus the editor first to ensure we have a selection context
        editorRef.current.focus();
        const checkboxHtml = '<span><input type="checkbox" style="width: 1.2rem; height: 1.2rem; vertical-align: middle; margin-right: 0.5rem;">&nbsp;</span>';    
        document.execCommand('insertHTML', false, checkboxHtml);
        setCurrentNote(editorRef.current.innerHTML);
    };

    const insertToggleList = () => {
    const toggleHtml = `
        <details class="custom-toggle" style="border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 8px; margin: 8px 0; position: relative;">
            <summary style="cursor: pointer; font-weight: 600; padding: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>New Toggle List</span>
                <button 
                    onclick="this.closest('.custom-toggle').remove(); document.getElementById('editor-id').dispatchEvent(new Event('input', {bubbles:true}));" 
                    style="border: none; background: none; color: #dc3545; cursor: pointer; font-size: 1rem; margin-left: auto;"
                    contenteditable="false"
                >
                    <i class="bi bi-trash"></i>
                </button>
            </summary>
            <div style="padding: 10px; margin-top: 5px; border-top: 1px solid rgba(0,0,0,0.05);" contenteditable="true">
                Type your hidden content here...
            </div>
        </details><br>`;
    document.execCommand('insertHTML', false, toggleHtml);
};

const insertRadioButton = () => {
    const count = prompt("How many options do you want?", "2");
    const numOptions = parseInt(count);
    
    if (isNaN(numOptions) || numOptions <= 0) return;

    const groupId = `group_${Date.now()}`;
    let optionsHtml = '';

    for (let i = 1; i <= numOptions; i++) {
        optionsHtml += `
            <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
                <input type="radio" name="${groupId}" id="${groupId}_${i}" ${i === 1 ? 'checked' : ''} 
                    onclick="this.setAttribute('checked', 'checked'); 
                    document.getElementsByName('${groupId}').forEach(r => { if(r !== this) r.removeAttribute('checked') });">
                <label for="${groupId}_${i}" style="margin: 0; outline: none;" contenteditable="true">Option ${i}</label>
            </div>`;
    }

    const containerHtml = `
        <div class="radio-container" contenteditable="false" style="border: 1px solid rgba(0,0,0,0.1); padding: 10px; border-radius: 8px; margin: 8px 0; display: inline-block; min-width: 180px; position: relative; background: rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 4px;">
                <span style="font-size: 0.75rem; color: gray; font-weight: bold; text-transform: uppercase;">Radio Group</span>
                <button 
                    onclick="this.closest('.radio-container').remove(); document.getElementById('editor-id').dispatchEvent(new Event('input', {bubbles:true}));" 
                    style="border: none; background: none; color: #dc3545; cursor: pointer; padding: 0 4px; font-size: 1.1rem;"
                    title="Delete Group"
                >
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            </div>
            <div style="outline: none;">
                ${optionsHtml}
            </div>
        </div><br>`;
    
    document.execCommand('insertHTML', false, containerHtml);
};

const syncInteractiveElements = () => {
    if (!editorRef.current) return;
    
    // Find all radios and explicitly write the "checked" attribute into the DOM
    const radios = editorRef.current.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
        if (radio.checked) {
            radio.setAttribute('checked', 'true'); // This makes it stay in innerHTML
        } else {
            radio.removeAttribute('checked');
        }
    });

    const details = editorRef.current.querySelectorAll('details');
    details.forEach(detail => {
        detail.open ? detail.setAttribute('open', '') : detail.removeAttribute('open');
    });
};

    const insertTable = () => {
    const rows = window.prompt("Enter number of rows:", "3");
    const cols = window.prompt("Enter number of columns:", "3");
    if (!rows || !cols || isNaN(rows) || isNaN(cols)) return;
    let tableHtml = `<table border="1" style="width: 100%; border-collapse: collapse; margin-top: 10px; border-color: #ccc;"><tbody>`;
    for (let i = 0; i < rows; i++) {
        tableHtml += `<tr>`;
        for (let j = 0; j < cols; j++) {
            tableHtml += `<td style="padding: 8px; border: 1px solid #ccc; min-height: 20px;">&nbsp;</td>`;
        }
        tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p></p>`; // p tag added to ensure cursor can go below table
    document.execCommand('insertHTML', false, tableHtml);
};

    const handleInsertOcrText = useCallback((extractedText) => {
            editorRef.current.focus();
            // Using insertText maintains the undo stack and places text at cursor
            document.execCommand('insertText', false, extractedText);
    }, []);
    
    const insertLink = () => {
    const url = prompt("Enter the URL:", "https://");
    if (url && url !== "" && url !== "https://") {
        editorRef.current.focus();
        document.execCommand('createLink', false, url);
        setCurrentNote(editorRef.current.innerHTML);
    }
    };

    const handleFileUpload = (e, type) => {
        const file = e.target.files[0];
        if (file) addMediaItem(file, type);
    };

    const addMediaItem = (file, type) => {
        const url = URL.createObjectURL(file);
        setMediaItems(prev => [...prev, { 
            id: Date.now() + Math.random(), 
            type, 
            url, 
            file, 
            name: file.name 
        }]);
    };

    const removeMediaItem = (id) => {
        setMediaItems(prev => prev.filter(item => item.id !== id));
    };

    // --- Feature 3: Canvas Handling ---
    const addCanvas = () => {
        setCanvases(prev => [...prev, { id: Date.now(), data: null }]);
    };

    const removeCanvas = (id) => {
        setCanvases(prev => prev.filter(c => c.id !== id));
        delete canvasRefs.current[id];
    };

    // --- Export .qnote (Zip) ---
const generateQNoteBlob = async () => {
    const zip = new JSZip();
    const currentDrawings = canvases.map(c => {
        const getDataFn = canvasRefs.current[c.id];
        return { id: c.id, data: getDataFn ? getDataFn() : c.data };
    });
    
    // Prepare the metadata
    const noteData = {
        heading: noteHeading,
        color: noteColor,
        bgImage: noteBgImage,
        isLocked: isLocked,
        createdAt: new Date().toLocaleString(),
        mindMap: mindMapData,
        tags: noteTags,
        reminderAt: reminderAt,
        mediaRefs: [], 
        drawings: []
    };

    if (isLocked) {
        // --- ENCRYPTED SAVE PATH ---
        // 1. Collect all sensitive data into one object
        const sensitiveData = {
            content: currentNote,
            drawings: canvases.map(c => ({
                id: c.id,
                data: canvasRefs.current[c.id] ? canvasRefs.current[c.id]() : c.data
            })),
            media: await Promise.all(mediaItems.map(async (item) => {
                // Convert blobs to base64 for the encryption vault
                const reader = new FileReader();
                const base64 = await new Promise(res => {
                    reader.onloadend = () => res(reader.result);
                    reader.readAsDataURL(item.file);
                });
                return { ...item, base64, file: null, url: null };
            }))
        };

        // 2. Encrypt the whole package
        // Note: use 'password' (from your editor state) or 'decryptionPass'
        const encryptedString = encryptData(sensitiveData, password || decryptionPass);
        
        if (!encryptedString) throw new Error("Encryption failed. Check password.");

        noteData.content = encryptedString;
        // Assets folder remains empty for encrypted notes
    } else {
        // --- NORMAL SAVE PATH ---
        const assets = zip.folder("assets");
    const imagesFolder = assets.folder("images");
    const videosFolder = assets.folder("videos");
    const audiosFolder = assets.folder("audios");

    mediaItems.forEach((item, index) => {
        const ext = item.file?.name?.split('.').pop() || 'dat';
        const fileName = `media_${index}.${ext}`;
        let folder = item.type === 'image' ? imagesFolder : item.type === 'video' ? videosFolder : audiosFolder;
        folder.file(fileName, item.file);
        noteData.mediaRefs.push({ ...item, fileName, file: null, url: null });
    });

    currentDrawings.forEach((drawing, index) => {
        if (drawing.data) {
            const fileName = `drawing_${index}.png`;
            const base64Data = drawing.data.replace(/^data:image\/(png|jpg);base64,/, "");
            imagesFolder.file(fileName, base64Data, { base64: true });
            noteData.drawings.push({ ...drawing, fileName, data: null });
        }
    });
        noteData.content = currentNote;
    }

    zip.file("note.json", JSON.stringify(noteData));
    return await zip.generateAsync({ type: "blob" });
};
// const handleFileSystemSave = async () => {
//     if (!onSave) return;
//     try {
//         const blob = await generateQNoteBlob();
//         // Extract name from fileHandle or use heading
//         //const name = fileHandle?.name?.replace('.qnote', '') || noteHeading || "Untitled";
//         const name = noteHeading || "Untitled";
//         await onSave(blob, name, ".qnote");
//     } catch (err) {
//         console.error("FileSystem Save Error:", err);
//         alert("Failed to save to File Manager.");
//     }
// };
// const handleFileSystemSave = async () => {
//     if (!onSave) return;
    
//     try {
//         // 1. Final sync: If we are in the editor, grab the latest HTML directly from the Ref
//         if (activeTab === 'editor' && editorRef.current) {
//             const latestContent = editorRef.current.innerHTML;
//             setCurrentNote(latestContent);
            
//             // Optional: If you use syncInteractiveElements, call it here
//             syncInteractiveElements(); 
//         }

//         // 2. Generate the blob
//         const blob = await generateQNoteBlob();
        
//         // 3. Save
//         const name = noteHeading || "Untitled";
//         await onSave(blob, name, ".qnote");
        
//     } catch (err) {
//         console.error("FileSystem Save Error:", err);
//         alert("Critical Save Error: " + err.message);
//     }
// };
const handleFileSystemSave = async () => {
    if (!onSave) return;

    try {
        // 1. THE TAB-SWITCH GUARD
        // If there are canvases, we MUST be on the 'attachments' tab to capture their data
        if (canvases.length > 0 && activeTab !== 'attachments') {
            setActiveTab('attachments');
            
            // We need a short "breather" (delay) to allow the browser to 
            // actually render the canvases and populate the refs.
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        }

        // 2. TEXT EDITOR SYNC
        // If we were just on the editor, ensure the HTML is synced to state
        if (editorRef.current) {
            const latestHTML = editorRef.current.innerHTML;
            setCurrentNote(latestHTML);
            if (typeof syncInteractiveElements === 'function') syncInteractiveElements();
        }

        // 3. GENERATE THE BLOB
        // Now that the Media tab is active, generateQNoteBlob can find the canvas data
        const blob = await generateQNoteBlob();

        // 4. TRIGGER THE PARENT SAVE
        const name = noteHeading || "Untitled";
        await onSave(blob, name, ".qnote");

        alert("Saved successfully to File Manager!");

    } catch (err) {
        console.error("FileSystem Save Error:", err);
        alert("Failed to save to File Manager: " + err.message);
    }
};
useEffect(() => {
    const loadFileFromHandle = async () => {
        // If no file, we are in "Create Mode" - mark as ready immediately
        if (!fileHandle) {
            setIsDataReady(true);
            return;
        }
        else {
        setShowModal(true);
        }

        setIsDataReady(false); // Start loading for existing file
        try {
            const file = await fileHandle.getFile();
            const zip = await JSZip.loadAsync(file);
            const jsonFile = zip.file("note.json");
            if (!jsonFile) throw new Error("Invalid .qnote");
            
            const noteJson = await jsonFile.async("string");
            const noteData = JSON.parse(noteJson);

            // --- ENCRYPTION CHECK ---
            if (noteData.isLocked) {
                // Prepare the object for the unlock modal
                setSelectedLockedNote({
                    ...noteData,
                    heading: fileHandle.name.replace('.qnote', '')
                });
                setIsLocked(true);
                setDecryptionPass('');
                setShowUnlockModal(true); // Trigger your password modal
                return; // Stop here; wait for handleUnlock
            }

            // --- NORMAL LOAD (If not locked) ---
            // Reconstruct Assets (Images/Media)
            let restoredMedia = [];
            let restoredDrawings = [];

            if (!noteData.isLocked) {
                // Media Reconstruction
                if (noteData.mediaRefs) {
                    for (const ref of noteData.mediaRefs) {
                        const path = `assets/${ref.type === 'image' ? 'images' : ref.type === 'video' ? 'videos' : 'audios'}/${ref.fileName}`;
                        const fileInZip = zip.file(path);
                        if (fileInZip) {
                            const blob = await fileInZip.async("blob");
                            const restoredFile = new File([blob], ref.fileName, { type: blob.type });
                            restoredMedia.push({ ...ref, file: restoredFile, url: URL.createObjectURL(restoredFile) });
                        }
                    }
                }
                // Drawing Reconstruction
                if (noteData.drawings) {
                    for (const d of noteData.drawings) {
                        const fileInZip = zip.file("assets/images/" + d.fileName);
                        if (fileInZip) {
                            const base64 = await fileInZip.async("base64");
                            restoredDrawings.push({ ...d, data: "data:image/png;base64," + base64 });
                        }
                    }
                }
            }
            
            // Populate states
            setNoteHeading(fileHandle.name.replace('.qnote', ''));
            setCurrentNote(noteData.content || "");
            setNoteColor(noteData.color || "#ffffff");
            setNoteBgImage(noteData.bgImage || "");
            setMediaItems(restoredMedia);
            setCanvases(restoredDrawings);
            setMindMapData(noteData.mindMap || { nodes: [], connectors: [] });
            setIsDataReady(true);
            if (editorRef.current) {
                editorRef.current.innerHTML = noteData.content || "";
            }
        } catch (err) {
            console.error("File load error:", err);
            setIsDataReady(true); // Still set to true to show editor (even if empty)
        }
    };
    loadFileFromHandle();
}, [fileHandle]);

    const shareQNote = async () => {
        const zip = new JSZip();
        
        // 1. Gather current state (simulating a save)
        const currentDrawings = canvases.map(c => {
            const getDataFn = canvasRefs.current[c.id];
            return { id: c.id, data: getDataFn ? getDataFn() : c.data };
        });

        // 2. Prepare JSON structure
        const noteData = {
            content: currentNote,
            color: noteColor,
            bgImage: noteBgImage,
            createdAt: new Date().toLocaleString(),
            mediaRefs: [], // Will store filenames
            drawings: [],   // Will store filenames
            mindMap: mindMapData
        };

        const assets = zip.folder("assets");
        const imagesFolder = assets.folder("images");
        const videosFolder = assets.folder("videos");
        const audiosFolder = assets.folder("audios");

        // 3. Add Media Files
        mediaItems.forEach((item, index) => {
            const ext = item.file.name.split('.').pop() || 'dat';
            const fileName = `media_${index}.${ext}`;
            let folder;
            if(item.type === 'image') folder = imagesFolder;
            else if(item.type === 'video') folder = videosFolder;
            else folder = audiosFolder;

            folder.file(fileName, item.file);
            noteData.mediaRefs.push({ ...item, fileName, file: null, url: null }); // Store metadata
        });

        // 4. Add Drawings
        currentDrawings.forEach((drawing, index) => {
            if (drawing.data) {
                const fileName = `drawing_${index}.png`;
                const base64Data = drawing.data.replace(/^data:image\/(png|jpg);base64,/, "");
                imagesFolder.file(fileName, base64Data, {base64: true});
                noteData.drawings.push({ ...drawing, fileName, data: null });
            }
        });

        // 5. Add JSON
        zip.file("note.json", JSON.stringify(noteData));

        // 6. Generate and Download
        const base64Content = await zip.generateAsync({ type: "base64" });
        
        const fileName = `Note_${editingId || 'export'}.qnote`;
        
        // Use our helper to handle Native vs PWA
        await shareFile(fileName, base64Content, true);
    };

const downloadQNote = async () => {
        const zip = new JSZip();
        
        // 1. Gather current state (simulating a save)
        const currentDrawings = canvases.map(c => {
            const getDataFn = canvasRefs.current[c.id];
            return { id: c.id, data: getDataFn ? getDataFn() : c.data };
        });

        // 2. Prepare JSON structure
        const noteData = {
            content: currentNote,
            color: noteColor,
            bgImage: noteBgImage,
            createdAt: new Date().toLocaleString(),
            mediaRefs: [], // Will store filenames
            drawings: [],   // Will store filenames
            mindMap: mindMapData
        };

        const assets = zip.folder("assets");
        const imagesFolder = assets.folder("images");
        const videosFolder = assets.folder("videos");
        const audiosFolder = assets.folder("audios");

        // 3. Add Media Files
        mediaItems.forEach((item, index) => {
            const ext = item.file.name.split('.').pop() || 'dat';
            const fileName = `media_${index}.${ext}`;
            let folder;
            if(item.type === 'image') folder = imagesFolder;
            else if(item.type === 'video') folder = videosFolder;
            else folder = audiosFolder;

            folder.file(fileName, item.file);
            noteData.mediaRefs.push({ ...item, fileName, file: null, url: null }); // Store metadata
        });

        // 4. Add Drawings
        currentDrawings.forEach((drawing, index) => {
            if (drawing.data) {
                const fileName = `drawing_${index}.png`;
                const base64Data = drawing.data.replace(/^data:image\/(png|jpg);base64,/, "");
                imagesFolder.file(fileName, base64Data, {base64: true});
                noteData.drawings.push({ ...drawing, fileName, data: null });
            }
        });

        // 5. Add JSON
        zip.file("note.json", JSON.stringify(noteData));

        // 6. Generate and Download
        const base64Content = await zip.generateAsync({ type: "base64" });
        
        const fileName = `Note_${editingId || 'export'}.qnote`;
        
        // Use our helper to handle Native vs PWA
        await downloadSaveFile(fileName, base64Content, true);
    };
const downloadSingleNote = async (e, note) => {
    e.stopPropagation(); 
    
    const zip = new JSZip();
    
    // Create a deep copy of the note to modify for JSON without affecting the original
    const { id, ...noteData } = note; 

    // --- Handle Non-Encrypted Media & Drawing Archiving ---
    if (!note.isLocked) {
        const assets = zip.folder("assets");
        const imagesFolder = assets.folder("images");
        const videosFolder = assets.folder("videos");
        const audiosFolder = assets.folder("audios");

        // 1. Process Media (Images, Videos, Audios)
        const mediaRefs = [];
        if (noteData.media && Array.isArray(noteData.media)) {
            noteData.media.forEach((item, index) => {
                if (item.file instanceof Blob) {
                    let ext = 'dat'; 
                    if (item.file.name) {
                        ext = item.file.name.split('.').pop();
                    } else if (item.file.type) {
                        ext = item.file.type.split('/').pop(); 
                    }

                    const fileName = `media_${index}.${ext}`;
                    
                    let folder;
                    if (item.type === 'image') folder = imagesFolder;
                    else if (item.type === 'video') folder = videosFolder;
                    else folder = audiosFolder;
                    
                    folder.file(fileName, item.file);

                    mediaRefs.push({
                        ...item,
                        fileName: fileName,
                        file: null, 
                        url: null   
                    });
                } else {
                    mediaRefs.push(item);
                }
            });
        }
        noteData.mediaRefs = mediaRefs;
        delete noteData.media; 

        // --- Handle Drawing/Canvas Archiving ---
        // This ensures converted encrypted notes (which have raw base64 data) 
        // are properly packed into the .qnote assets folder for the importer to find.
        const exportedDrawings = [];
        if (noteData.drawings && Array.isArray(noteData.drawings)) {
            noteData.drawings.forEach((drawing, index) => {
                if (drawing.data && typeof drawing.data === 'string') {
                    const drawingFileName = `drawing_${index}.png`;
                    // Remove the Base64 header (e.g., "data:image/png;base64,")
                    const base64Data = drawing.data.replace(/^data:image\/(png|jpg);base64,/, "");
                    
                    // Add the drawing to the images asset folder
                    imagesFolder.file(drawingFileName, base64Data, { base64: true });
                    
                    // Update the JSON reference to point to the file instead of carrying the raw string
                    exportedDrawings.push({
                        ...drawing,
                        fileName: drawingFileName,
                        data: null // Clear raw data from JSON to keep it small
                    });
                } else {
                    exportedDrawings.push(drawing);
                }
            });
            noteData.drawings = exportedDrawings;
        }
    }

    // For Encrypted notes, everything is already inside noteData.content as a string.
    zip.file("note.json", JSON.stringify(noteData));
    
    const base64Content = await zip.generateAsync({ type: "base64" });
    
    const safeHeading = String(note.heading || 'Note')
        .replace(/[^a-z0-9]/gi, '_')
        .substring(0, 20);
    
    const fileName = `${safeHeading}.qnote`;

    // Use our helper
    await downloadSaveFile(fileName, base64Content, true);
};
const shareSingleNote = async (e, note) => {
    e.stopPropagation(); 
    
    const zip = new JSZip();
    
    // Create a deep copy of the note to modify for JSON without affecting the original
    const { id, ...noteData } = note; 

    // --- Handle Non-Encrypted Media & Drawing Archiving ---
    if (!note.isLocked) {
        const assets = zip.folder("assets");
        const imagesFolder = assets.folder("images");
        const videosFolder = assets.folder("videos");
        const audiosFolder = assets.folder("audios");

        // 1. Process Media (Images, Videos, Audios)
        const mediaRefs = [];
        if (noteData.media && Array.isArray(noteData.media)) {
            noteData.media.forEach((item, index) => {
                if (item.file instanceof Blob) {
                    let ext = 'dat'; 
                    if (item.file.name) {
                        ext = item.file.name.split('.').pop();
                    } else if (item.file.type) {
                        ext = item.file.type.split('/').pop(); 
                    }

                    const fileName = `media_${index}.${ext}`;
                    
                    let folder;
                    if (item.type === 'image') folder = imagesFolder;
                    else if (item.type === 'video') folder = videosFolder;
                    else folder = audiosFolder;
                    
                    folder.file(fileName, item.file);

                    mediaRefs.push({
                        ...item,
                        fileName: fileName,
                        file: null, 
                        url: null   
                    });
                } else {
                    mediaRefs.push(item);
                }
            });
        }
        noteData.mediaRefs = mediaRefs;
        delete noteData.media; 

        // --- Handle Drawing/Canvas Archiving ---
        // This ensures converted encrypted notes (which have raw base64 data) 
        // are properly packed into the .qnote assets folder for the importer to find.
        const exportedDrawings = [];
        if (noteData.drawings && Array.isArray(noteData.drawings)) {
            noteData.drawings.forEach((drawing, index) => {
                if (drawing.data && typeof drawing.data === 'string') {
                    const drawingFileName = `drawing_${index}.png`;
                    // Remove the Base64 header (e.g., "data:image/png;base64,")
                    const base64Data = drawing.data.replace(/^data:image\/(png|jpg);base64,/, "");
                    
                    // Add the drawing to the images asset folder
                    imagesFolder.file(drawingFileName, base64Data, { base64: true });
                    
                    // Update the JSON reference to point to the file instead of carrying the raw string
                    exportedDrawings.push({
                        ...drawing,
                        fileName: drawingFileName,
                        data: null // Clear raw data from JSON to keep it small
                    });
                } else {
                    exportedDrawings.push(drawing);
                }
            });
            noteData.drawings = exportedDrawings;
        }
    }

    // For Encrypted notes, everything is already inside noteData.content as a string.
    zip.file("note.json", JSON.stringify(noteData));
    
    const base64Content = await zip.generateAsync({ type: "base64" });
    
    const safeHeading = String(note.heading || 'Note')
        .replace(/[^a-z0-9]/gi, '_')
        .substring(0, 20);
    
    const fileName = `${safeHeading}.qnote`;

    // Use our helper
    await shareFile(fileName, base64Content, true);
};
const downloadMedia = async (url, type) => {
    let base64Data = "";
    const fileName = `QNote_Export_${Date.now()}.${url.startsWith('data:image/png') ? 'png' : (type === 'video' ? 'mp4' : 'jpg')}`;

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
        await saveFile(fileName, base64Data, true);
    } catch (err) {
        console.error("Media download failed", err);
        alert("Could not process download.");
    }
};

// --- Import .qnote ---
const importQNote = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const zip = await JSZip.loadAsync(file);
        
        // 1. Read JSON
        const noteJson = await zip.file("note.json").async("string");
        const noteData = JSON.parse(noteJson);
        
        let restoredMedia = [];
        let restoredDrawings = [];

        // --- Check if Locked ---
        if (noteData.isLocked) {
            // If locked, content is encrypted string. Media/Drawings are null.
            // We save exactly what we received.
            restoredMedia = []; 
            restoredDrawings = [];
        } else {
            // Only reconstruct media if NOT locked
            if (noteData.mediaRefs) {
                for (const ref of noteData.mediaRefs) {
                    let folderPath = "";
                    if (ref.type === 'image') folderPath = "assets/images/";
                    else if (ref.type === 'video') folderPath = "assets/videos/";
                    else folderPath = "assets/audios/";

                    // Check if file exists in zip before trying to read
                    const fileInZip = zip.file(folderPath + ref.fileName);
                    if(fileInZip) {
                        const fileData = await fileInZip.async("blob");
                        const restoredFile = new File([fileData], ref.fileName, { type: fileData.type });
                        restoredMedia.push({ 
                            ...ref, 
                            file: restoredFile, 
                            url: URL.createObjectURL(restoredFile) 
                        });
                    }
                }
            }

            if (noteData.drawings) {
                for (const d of noteData.drawings) {
                    const fileInZip = zip.file("assets/images/" + d.fileName);
                    if(fileInZip) {
                        const base64 = await fileInZip.async("base64");
                        restoredDrawings.push({ ...d, data: "data:image/png;base64," + base64 });
                    }
                }
            }
        }

        // 4. Save to DB
        const noteObj = {
            heading: noteData.heading || 'Imported Note', // Ensure heading exists
            content: noteData.content,
            isLocked: noteData.isLocked || false, // Preserve lock status
            color: noteData.color,
            bgImage: noteData.bgImage || '',
            createdAt: noteData.createdAt || new Date().toLocaleString(),
            media: restoredMedia,
            drawings: restoredDrawings,
            mindMap: noteData.mindMap || { nodes: [], connectors: [] },
            reminderAt: noteData.reminderAt || '',
            tags: noteData.tags || []
        };

        await indexedDBService.addObjectInObjectStore(DB_NAME, DB_VERSION, STORE_NAME, noteObj);
        fetchNotes();
        showAlert('success', noteData.isLocked ? 'Encrypted note imported!' : 'Note imported successfully!');
        
    } catch (err) {
        console.error(err);
        showAlert('danger', 'Failed to import .qnote file.');
    }
    e.target.value = null; 
};
    // --- Standard Handlers ---
// Convert Blob/File to Base64 string for encryption
const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
const handleSaveNote = async (e) => {
    e.preventDefault();

    // 1. Validation
    if (isLocked && !password) {
        return showAlert('danger', 'Please enter a password to lock this note.');
    }
    if (isLocked && reminderAt) {
        return showAlert('danger', 'Locked notes cannot have reminders.');
    }

    // 2. Prepare Data
    let contentToSave = currentNote;
    let mediaToSave = mediaItems;
    let drawingsToSave = canvases.map(c => ({
        id: c.id,
        data: canvasRefs.current[c.id] ? canvasRefs.current[c.id]() : c.data
    }));

    // 3. Encrypt if Locked
    if (isLocked) {
        // --- Convert Media to Base64 before encryption ---
        const mediaWithBase64 = await Promise.all(mediaToSave.map(async (item) => {
            if (item.file) {
                // Convert the file blob to a base64 string
                const base64Data = await blobToBase64(item.file);
                // Return clean object with data, removing raw File/URL references
                return { ...item, base64: base64Data, file: null, url: null };
            }
            return item; // Should handle existing items that might already be base64
        }));
        const sensitiveData = {
            content: contentToSave,
            media: mediaWithBase64, // Save the Base64 version
            drawings: drawingsToSave
        };
        contentToSave = encryptData(sensitiveData, password);
        // Clear these for the DB object so they aren't saved as plain text columns
        mediaToSave = []; 
        drawingsToSave = [];
    }

    const noteObj = {
        heading: noteHeading || 'Untitled Note', // Heading is always visible
        content: contentToSave,
        isLocked: isLocked,
        color: noteColor,
        bgImage: noteBgImage, 
        createdAt: new Date().toLocaleString(),
        media: mediaToSave, // Empty if locked
        drawings: drawingsToSave, // Empty if locked
        mindMap: mindMapData,
        reminderAt: reminderAt,
        tags: Array.isArray(noteTags) 
        ? noteTags.map(tag => tag.trim().toLowerCase()).filter(t => t !== "")
        : noteTags.split(',').map(tag => tag.trim().toLowerCase()).filter(t => t !== ""),
    };

    if (editingId) noteObj.id = editingId;

    // 4. Save
    try {
        await indexedDBService.addObjectInObjectStore(DB_NAME, DB_VERSION, STORE_NAME, noteObj);
        handleCloseModal();
        fetchNotes();
        showAlert('success', isLocked ? 'Note Encrypted & Saved!' : 'Saved successfully!');
    } catch (error) {
        showAlert('danger', 'Error saving to database.');
    }
};

    const handleDeleteSingle = async (e, id) => {
        e.stopPropagation();
        // Browser-native confirmation dialog
    if (!window.confirm("Are you sure you want to delete this note? This action cannot be undone.")) {
        return; // Exit the function if they click 'Cancel'
    }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            transaction.objectStore(STORE_NAME).delete(id);
            transaction.oncomplete = () => { db.close(); fetchNotes(); showAlert('info', 'Deleted.'); };
        };
    };
    const handleDuplicateNote = async (e, note) => {
    e.stopPropagation(); // Prevent opening the note
    
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Create a copy without the unique ID and modify the title
        const { id, ...noteToCopy } = note;
        const duplicate = {
            ...noteToCopy,
            title: `${note.title} (Copy)`,
            createdAt: new Date().toISOString()
        };

        store.add(duplicate);

        transaction.oncomplete = () => {
            db.close();
            fetchNotes(); // Refresh grid
            showAlert('success', 'Note duplicated!');
        };
    };
    };

const openNote = (note) => {
    if (note.isLocked) {
        setSelectedLockedNote(note);
        setDecryptionPass('');
        setShowUnlockModal(true); // Trigger the password prompt
    } else {
        loadNoteIntoEditor(note);
    }
};
const handleUnlock = async (e) => {
    e.preventDefault();
    const decryptedData = decryptData(selectedLockedNote.content, decryptionPass);

    if (decryptedData) {
        // --- Rehydrate Media from Base64 ---
        const hydratedMedia = await Promise.all((decryptedData.media || []).map(async (item) => {
             // If we have base64 data, convert it back to a Blob URL for display
             if (item.base64) {
                 const res = await fetch(item.base64);
                 const blob = await res.blob();
                 // Recreate the file object and URL
                 return { ...item, file: blob, url: URL.createObjectURL(blob) };
             }
             return item;
        }));
        // Success: Merge decrypted data with the visible note data
        const fullNote = {
            ...selectedLockedNote,
            content: decryptedData.content,
            media: hydratedMedia,
            drawings: decryptedData.drawings,
            password: decryptionPass 
        };
        setShowUnlockModal(false);
        loadNoteIntoEditor(fullNote);
    } else {
        alert("Incorrect Password!");
    }
};

// Extracted the actual loading logic to reuse it
const loadNoteIntoEditor = (note) => {
    setEditingId(note.id || null); // ID is null for external file handles
    setNoteHeading(note.heading || '');
    setCurrentNote(note.content || '');
    
    // 1. CRITICAL: Sync the contentEditable DOM directly
    if (editorRef.current) {
        editorRef.current.innerHTML = note.content || '';
    }

    setNoteColor(note.color || '#ffffff');
    setNoteBgImage(note.bgImage || '');
    setReminderAt(note.reminderAt || '');
    setIsLocked(note.isLocked || false);
    
    // 2. Pre-fill password so re-saving to disk doesn't require typing it again
    setPassword(note.password || ''); 
    
    // 3. Keep tags as an ARRAY in state (cleaner for your logic)
    // Your UI handles the join(', ') for display
    setNoteTags(Array.isArray(note.tags) ? note.tags : []); 

    // 4. Process Media (Re-verify Object URLs)
    const processedMedia = (note.media || []).map(item => {
        if (item.file instanceof Blob) {
            // Only create a new URL if one doesn't already exist to prevent leaks
            return { ...item, url: item.url || URL.createObjectURL(item.file) };
        }
        return item; 
    });
    
    setMediaItems(processedMedia);
    setCanvases(note.drawings || []);
    setMindMapData(note.mindMap || { nodes: [], connectors: [] });
    
    // Ensure the editor modal is visible
    setShowModal(true);
    setIsDataReady(true);
};
useEffect(() => {
    // If we have content in state AND the editor is finally in the DOM
    // AND the editor is currently empty (to prevent overwriting while typing)
    if (editorRef.current && currentNote && editorRef.current.innerHTML === "") {
        editorRef.current.innerHTML = currentNote;
    }
}, [currentNote, isDataReady]); // Runs when data is ready or content changes

    const resetModal = () => {
    setEditingId(null);
    setNoteHeading('');
    setCurrentNote('');
    setPassword('');
    setIsLocked(false);
    setNoteColor('#ffffff');
    setNoteBgImage('');
    setMediaItems([]);
    setCanvases([]);
    setMindMapData({ nodes: [], connectors: [] });
    setReminderAt('');
    setShowModal(true);
};

    const handleCloseModal = () => {
        stopMedia();
    // Revoke URLs to free up memory
    mediaItems.forEach(item => {
        if (item.url && item.url.startsWith('blob:')) {
            URL.revokeObjectURL(item.url);
        }
    });
    
    // Reset states
    setShowModal(false);
    setMediaItems([]);
    setCanvases([]);
    setEditingId(null);
    setCurrentNote('');
};

    const filteredNotes = useMemo(() => {
    return notes
        .filter(note => {
            // 1. Check if the content matches the search term
            // Added check to handle encrypted notes (where content is an encrypted string)
            const matchesSearch = note.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 (note.heading && note.heading.toLowerCase().includes(searchTerm.toLowerCase()));

            // 2. Check if the note contains ALL currently selected tag pills
            // --- Tag Filtering Logic ---
            const matchesTags = selectedTags.length === 0 || 
                               (note.tags && selectedTags.every(t => note.tags.includes(t)));

            return matchesSearch && matchesTags;
        })
        .reverse(); // Keep newest notes at the top
}, [notes, searchTerm, selectedTags]); 

    // --- Media Handlers ---
    // --- Start Camera/Mic ---
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
    const truncateText = (htmlContent) => {
    // Create a temporary DOM element to strip HTML tags safely
    const tempDivElement = document.createElement("div");
    tempDivElement.innerHTML = htmlContent;
    const plainText = tempDivElement.textContent || tempDivElement.innerText || "";
    
    if (plainText.length > 50) {
        return plainText.substring(0, 50) + '...';
    }
    return plainText;
};

    // --- Legacy Export Features ---
// Save file is only for PNG in android
const saveFile = async (fileName, data, isBase64 = false) => {
    // 1. NATIVE ANDROID/IOS LOGIC (Capacitor)
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            // This is the "JavaScriptInterface" equivalent
            await Filesystem.writeFile({
                path: fileName,
                data: data, // Must be raw Base64 (no "data:image/png..." prefix)
                directory: Directory.Documents,
                encoding: isBase64 ? undefined : Encoding.UTF8,
            });
            alert(`File saved to Documents: ${fileName}`);
        } catch (e) {
            console.error('Native save error', e);
            alert("Native save failed. Check permissions.");
        }
        return;
    }

    // 2. PWA / MOBILE BROWSER LOGIC
    // Browsers hate Blobs after the first time. 
    // We use a DataURL to "trick" the browser into treating it as a direct link.
    const finalHref = isBase64 
        ? `data:application/octet-stream;base64,${data}` 
        : `data:text/plain;charset=utf-8,${encodeURIComponent(data)}`;

    const link = document.createElement('a');
    link.href = finalHref;
    link.download = fileName;
    
    // Crucial for Mobile Browsers:
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100); 
};
// Shares file for Android
const shareFile = async (fileName, data, isBase64 = false) => {
    // --- 1. NATIVE ANDROID/IOS LOGIC ---
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            // Write to Cache (Safe for Scoped Storage)
            const result = await Filesystem.writeFile({
                path: fileName,
                data: data, // JSZip base64 is already clean
                directory: Directory.Cache
            });

            // Trigger Share Sheet (User can select "Save to Downloads" or "Save to Files")
            await Share.share({
                title: 'Export Note',
                url: result.uri,
                dialogTitle: 'Save or Share your Note'
            });
        } catch (e) {
            console.error('Native save error', e);
            alert("Export failed: Storage permission or Scoped Storage restriction.");
        }
        return;
    }

    // --- 2. PWA / MOBILE BROWSER LOGIC ---
    // Using Blobs is more stable than DataURLs for large .qnote or .pdf files
    const byteCharacters = isBase64 ? atob(data) : data;
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 1000);
};
// Donwloads file non-natively and refreshes 
const downloadSaveFile = async (fileName, data, isBase64 = false) => {
    // 1. Detect Platform via Capacitor
    const platform = window.Capacitor ? window.Capacitor.getPlatform() : 'web';
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

    // Note: This specific method is optimized for Browsers (Desktop/PWA).
    // For Native Android/iOS apps, the 'Share' method is still the standard.
    if (isNative) {
        console.warn("downloadSaveFile called on Native. Falling back to browser-style download.");
    }

    try {
        // 2. Prepare the Blob
        let blob;
        if (isBase64) {
            // Remove DataURL prefix if present
            const cleanBase64 = data.includes(',') ? data.split(',')[1] : data;
            const byteCharacters = atob(cleanBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: 'application/octet-stream' });
        } else {
            blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
        }

        // 3. Trigger Download using ObjectURL
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        
        // Append to DOM for mobile browser compatibility
        document.body.appendChild(link);
        link.click();

        // 4. Memory Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        // 5. Android/iOS Browser Specific: Refresh Prompt
        // We exclude 'web' (Desktop) and 'native' (Capacitor App) to target PWA/Mobile Browsers
        const isMobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !isNative;

        if (isMobileBrowser) {
            // Small delay to ensure the download starts before the alert blocks the thread
            setTimeout(() => {
                if (window.confirm("File Downloaded. Refreshing page to enable future downloads.")) {
                    window.location.reload();
                }
            }, 1000);
        }

    } catch (error) {
        console.error("Download Error:", error);
        alert("Download failed. Please try again.");
    }
};
const downloadToTXT = () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentNote;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    
    const finalString = `\nCREATED WITH QNOTE\nHEADING: ${noteHeading}\nCREATED: ${new Date().toLocaleString()}\nTAGS: ${noteTags || 'None'}\n----------------\n\n${plainText}`;
    
    // Use the helper
    downloadSaveFile(`${(noteHeading || 'Note')}.txt`, finalString);
};
const downloadToPDF = async () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    
    // 1. Create a hidden element with a footer
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 40px; background-color: ${noteColor}; min-height: 842px; font-family: Arial, sans-serif; position: relative; box-sizing: border-box;">
            <h1 style="margin-bottom: 20px;">${noteHeading || 'Untitled Note'}</h1>
            <div style="font-size: 12pt; line-height: 1.6; padding-bottom: 60px;">${currentNote}</div>
            
            <div style="position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; color: rgba(0,0,0,0.4); font-size: 10pt; font-style: italic;">
                Created with QNote
            </div>
        </div>
    `;
    element.style.width = '595px';

    await doc.html(element, {
        callback: function (doc) {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                const base64 = doc.output('datauristring').split(',')[1];
                downloadSaveFile(`Note_${noteHeading}.pdf`, base64, true);
            } else {
                doc.save(`Note_${noteHeading}.pdf`);
            }
        },
        x: 0,
        y: 0,
        width: 595,
        windowWidth: 595
    });
};
const shareToTXT = () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentNote;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    
    const finalString = `\nCREATED WITH QNOTE\nHEADING: ${noteHeading}\nCREATED: ${new Date().toLocaleString()}\nTAGS: ${noteTags || 'None'}\n----------------\n\n${plainText}`;
    
    // Use the helper
    shareFile(`${(noteHeading || 'Note')}.txt`, finalString);
};
const shareToPDF = async () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    
    // 1. Create a hidden element with a footer
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 40px; background-color: ${noteColor}; min-height: 842px; font-family: Arial, sans-serif; position: relative; box-sizing: border-box;">
            <h1 style="margin-bottom: 20px;">${noteHeading || 'Untitled Note'}</h1>
            <div style="font-size: 12pt; line-height: 1.6; padding-bottom: 60px;">${currentNote}</div>
            
            <div style="position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; color: rgba(0,0,0,0.4); font-size: 10pt; font-style: italic;">
                Created with QNote
            </div>
        </div>
    `;
    element.style.width = '595px';

    await doc.html(element, {
        callback: function (doc) {
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                const base64 = doc.output('datauristring').split(',')[1];
                shareFile(`Note_${noteHeading}.pdf`, base64, true);
            } else {
                doc.save(`Note_${noteHeading}.pdf`);
            }
        },
        x: 0,
        y: 0,
        width: 595,
        windowWidth: 595
    });
};

const exportToPNG = async () => {
    const editorBox = editorRef.current.closest('.editor-box');
    const toolbar = editorBox.querySelector('[data-export-ignore="true"]');

    try {
        // 1. Hide toolbar and expand editor height for full capture
        if (toolbar) toolbar.style.display = 'none';
        const originalMaxHeight = editorRef.current.style.maxHeight;
        const originalOverflow = editorRef.current.style.overflowY;
        // --- CHANGE: Capture original background styles to restore later ---
        const originalBgImage = editorBox.style.backgroundImage;
        const originalBgSize = editorBox.style.backgroundSize;
        const originalBlend = editorBox.style.backgroundBlendMode;

        // --- CHANGE: Apply the note's background settings to the capture box ---
        if (noteBgImage) {
            editorBox.style.backgroundImage = `url('${noteBgImage}')`;
            editorBox.style.backgroundSize = 'cover';
            editorBox.style.backgroundBlendMode = 'overlay';
        }
        editorRef.current.style.maxHeight = 'none';
        editorRef.current.style.overflowY = 'visible';

        // Create a footer element specifically for the PNG capture
        const footer = document.createElement('div');
        footer.id = 'temp-png-footer';
        footer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            margin-top: 1rem;
            border-top: 1px solid rgba(0,0,0,0.1);
            font-size: 0.75rem;
            color: rgba(0,0,0,0.5);
            font-family: sans-serif;
        `;
        
        const timestamp = new Date().toLocaleString();
        footer.innerHTML = `
            <span>Created with <strong>Q Notes</strong></span>
            <span>Exported: ${timestamp}</span>
        `;
        
        // Append to the box so it gets captured
        editorBox.appendChild(footer);
        const canvas = await html2canvas(editorBox, {
            backgroundColor: noteColor,
            scale: 2,
            useCORS: true,
            ignoreElements: (element) => element.getAttribute('data-export-ignore') === 'true'
        });

        // Remove the temporary footer so it doesn't stay in the UI
        const tempFooter = editorBox.querySelector('#temp-png-footer');
        if (tempFooter) editorBox.removeChild(tempFooter);
        
        if (toolbar) toolbar.style.display = 'flex';
        editorRef.current.style.maxHeight = originalMaxHeight;
        editorRef.current.style.overflowY = originalOverflow;

        // --- Restore original background styles ---
        editorBox.style.backgroundImage = originalBgImage;
        editorBox.style.backgroundSize = originalBgSize;
        editorBox.style.backgroundBlendMode = originalBlend;

        
        // 2. THE NEW PART: Convert and Save
        const image = canvas.toDataURL("image/png");
        
        // Remove the prefix (e.g., "data:image/png;base64,") so saveFile gets raw data
        const rawBase64 = image.split(',')[1]; 
        
        await saveFile(`Note_${Date.now()}.png`, rawBase64, true);

    } catch (error) {
        console.error("PNG Export failed:", error);
        // Fallback cleanup
        const tempFooter = editorBox.querySelector('#temp-png-footer');
        if (tempFooter) editorBox.removeChild(tempFooter);
        if (toolbar) toolbar.style.display = 'flex';
    }
};

const getPlainText = () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentNote;
    return tempDiv.textContent || tempDiv.innerText || "";
};

// 1. Email (mailto)
const shareViaEmail = () => {
    const subject = encodeURIComponent(noteHeading || "Shared Note");
    const body = encodeURIComponent(getPlainText());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

// 2. WhatsApp (Text-based)
const shareViaWhatsApp = () => {
    const text = encodeURIComponent(`*${noteHeading}*\n\n${getPlainText()}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
};

// 3. Telegram (Text-based)
const shareViaTelegram = () => {
    const text = encodeURIComponent(`**${noteHeading}**\n\n${getPlainText()}`);
    window.open(`https://t.me/share/url?url=&text=${text}`, '_blank');
};

// 4 & 5. Share as PNG (Native Share Sheet - Handles Instagram, Files, etc.)
const shareAsPNG = async () => {
    const editorBox = editorRef.current.closest('.editor-box');
    const toolbar = editorBox.querySelector('[data-export-ignore="true"]');

    try {
        // --- 1. Preparation (Same as before) ---
        if (toolbar) toolbar.style.display = 'none';
        const originalMaxHeight = editorRef.current.style.maxHeight;
        const originalOverflow = editorRef.current.style.overflowY;
        const originalBgImage = editorBox.style.backgroundImage;
        const originalBgSize = editorBox.style.backgroundSize;
        const originalBlend = editorBox.style.backgroundBlendMode;

        if (noteBgImage) {
            editorBox.style.backgroundImage = `url('${noteBgImage}')`;
            editorBox.style.backgroundSize = 'cover';
            editorBox.style.backgroundBlendMode = 'overlay';
        }
        editorRef.current.style.maxHeight = 'none';
        editorRef.current.style.overflowY = 'visible';

        const footer = document.createElement('div');
        footer.id = 'temp-png-footer-share';
        footer.style.cssText = `display:flex;justify-content:space-between;padding:1rem;margin-top:1rem;border-top:1px solid rgba(0,0,0,0.1);font-size:0.75rem;color:gray;font-family:sans-serif;`;
        footer.innerHTML = `<span>Created with <strong>QNote</strong></span><span>${new Date().toLocaleString()}</span>`;
        editorBox.appendChild(footer);

        // --- 2. Capture Canvas ---
        const canvas = await html2canvas(editorBox, { 
            backgroundColor: noteColor, 
            scale: 2, 
            useCORS: true, 
            ignoreElements: (element) => element.getAttribute('data-export-ignore') === 'true' 
        });

        // --- 3. Cleanup UI ---
        const tempFooter = editorBox.querySelector('#temp-png-footer-share');
        if (tempFooter) editorBox.removeChild(tempFooter);
        if (toolbar) toolbar.style.display = 'flex';
        editorRef.current.style.maxHeight = originalMaxHeight;
        editorRef.current.style.overflowY = originalOverflow;
        editorBox.style.backgroundImage = originalBgImage;
        editorBox.style.backgroundSize = originalBgSize;
        editorBox.style.backgroundBlendMode = originalBlend;

        const dataUrl = canvas.toDataURL("image/png");
        const base64Data = dataUrl.split(',')[1];
        const fileName = `Shared_Note_${Date.now()}.png`;

        // --- 4. Sharing Logic ---
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            // NATIVE CAPACITOR LOGIC
            // Step A: Save to cache/temp directory so the OS can find the file
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache // Cache is better for sharing as it gets cleaned up by OS
            });

            // Step B: Share the file URI
            await Share.share({
                title: noteHeading || 'Shared Note',
                text: 'Check out my note from QNote!',
                url: savedFile.uri, // Use the internal native URI
                dialogTitle: 'Share Note',
            });
        } else if (navigator.share) {
            // WEB SHARE API LOGIC (PWA / Chrome Mobile)
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], fileName, { type: "image/png" });
            
            try {
                await navigator.share({
                    files: [file],
                    title: noteHeading || 'Shared Note',
                });
            } catch (err) {
                // If user cancels or browser rejects file sharing, fallback to download
                console.log("Share cancelled or failed, falling back to download.");
                await saveFile(fileName, base64Data, true);
            }
        } else {
            // FALLBACK: Just download the file
            await saveFile(fileName, base64Data, true);
        }

    } catch (error) {
        console.error("Share process failed", error);
        alert("Unable to share at this time.");
    }
};

    return (
        <div className={`app-wrapper ${darkMode ? 'dark-mode border' : ''}`}>
    <Container>
        {/* Hidden Import Input */}
        <input type="file" accept=".qnote" ref={fileInputRef} style={{ display: 'none' }} onChange={importQNote} />

        {/* --- Header Section --- */}
        <a onClick={resetModal} class="floating-plus-btn d-flex align-items-center justify-content-center"><i class="bi bi-plus-lg"></i></a>
<div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
    {/* Logo Container: stays centered on mobile, left-aligned on desktop */}
    <div className="d-flex align-items-center justify-content-between w-100 w-md-auto">
        <h2 className="fw-bold m-0 fs-3">
            <a href='https://queccasoft.in/'><img src={qnoteImg} style={{color: '#ff8103', width: '2rem', height: '2rem'}}></img></a> QNote
        </h2>
    </div>
    
    {/* Button Group: Row layout even on mobile */}
    <div className="d-flex align-items-center gap-2">
        {/* Dark Mode Toggle */}
        <Button title='Toggle Dark Mode' variant="link" onClick={() => setDarkMode(!darkMode)} className="text-decoration-none p-2" style={{color: darkMode ? '#ff8103' : '#333'}}>
            <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'} fs-5`}></i>
        </Button>
        
        <Button title='Import .qnote' className="saffron-btn rounded-ui" onClick={() => fileInputRef.current.click()}>
            <i className="bi bi-box-arrow-in-down"></i> 
        </Button>
        
        <Button title='Create new qnote' className="saffron-btn rounded-ui" onClick={resetModal}>
            <i className="bi bi-plus-lg"></i>
        </Button>
    </div>
</div>

        {/* --- Search Bar --- */}
<div className="search-container mb-4">
    <i className="bi bi-search search-icon-inside"></i>
    <Form.Control 
        className="qnote-search-bar" 
        placeholder="Search notes..." 
        value={searchTerm} 
        onChange={(e) => setSearchTerm(e.target.value)} 
    />
</div>
        {/* --- Responsive Tag Filter Bar --- */}
<div className="tag-filter-container mb-3 p-3"
style={{
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.5rem',
    scrollbarWidth: 'none', // Hide scrollbar for clean look
    msOverflowStyle: 'none'
}}>
    {allUniqueTags.map(tag => (
        <Badge
            key={tag}
            pill
            bg={`q-tag-pill ${selectedTags.includes(tag) ? 'active' : 'q-tag-pill'}`}
            // Apply the 'active' class if selected
            className={`q-tag-pill ${selectedTags.includes(tag) ? 'active' : 'q-tag-pill'}`}
            onClick={() => toggleTagFilter(tag)}
        >
            #{tag}
        </Badge>
    ))}
</div>

        {status.msg && <Alert variant={status.type} className="rounded-4">{status.msg}</Alert>}

        {/* --- Notes Grid --- */}
<Row style={{maxHeight: '70vh', overflowY: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
    {filteredNotes.map((note) => (
        <Col
        xs={6}      // 2 columns on mobile (extra small)
            md={4}      // 3 columns on tablets
            lg={2}      // 6 columns on desktops/large screens 
         key={note.id} className="mb-3">
            <Card 
                onClick={() => openNote(note)}
                className="note-item-card h-100 shadow-sm"
                //style={{ backgroundColor: note.color || '#ffffff', color: getContrastYIQ(note.color || '#ffffff') }}
                style={getNoteStyle(note.color, note.bgImage, darkMode)}
            >
                <Card.Body className="d-flex flex-column p-4 position-relative">
                    
                    {/* Lock Overlay */}
                    {note.isLocked && (
                        <div className="lock-overlay d-flex flex-column align-items-center justify-content-center">
                            <i className="bi bi-shield-lock-fill display-6 text-warning"></i>
                            <small className="text-muted fw-bold">Encrypted</small>
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-start">
                        {/* Heading & Content Preview */}
                        <div className="text-break flex-grow-1 me-2" style={{ maxHeight: '100px', overflow: 'hidden' }}>
                            <h6 className="fw-bold mb-1">{note.heading || "Untitled Note"}</h6>
                            <div className={note.isLocked ? "locked-blur" : "small opacity-75"}>
                                {note.isLocked ? "••••••••••••••••" : truncateText(note.content)}
                            </div>
                        </div>
                        
                        {/* Action Buttons (Download & Delete) - Visible for ALL notes now */}
                        <div className="d-flex flex-column gap-1" style={{ zIndex: 10 }}>
                            {/* Download Button */}
                            <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 text-decoration-none" 
                                title="Download .qnote"
                                onClick={(e) => shareSingleNote(e, note)}
                            >
                                { window.Capacitor && window.Capacitor.isNativePlatform() && <i className="bi bi-share text-secondary"></i>}
                                { window.Capacitor && !window.Capacitor.isNativePlatform() && <i className="bi bi-download text-secondary"></i>}
                            </Button>

                            <Button 
                                variant="link" 
                                className="p-0 text-decoration-none" 
                                onClick={(e) => handleDuplicateNote(e, note)}
                            >
                                <i className="bi bi-file-earmark-plus-fill text-success"></i>
                            </Button>

                            {/* Delete Button */}
                            <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 text-decoration-none" 
                                title="Delete"
                                onClick={(e) => handleDeleteSingle(e, note.id)}
                            >
                                <i className="bi bi-trash3-fill text-danger"></i>
                            </Button>
                        </div>
                    </div>

                    {/* Metadata Badges */}
                    <div className="mt-3 d-flex gap-2">
                        {note.media?.length > 0 && <span className="badge bg-light text-dark border"><i className="bi bi-paperclip"></i> {note.media.length}</span>}
                        {note.drawings?.length > 0 && <span className="badge bg-light text-dark border"><i className="bi bi-pencil"></i> {note.drawings.length}</span>}
                    </div>
                    <small className="mt-auto pt-3 opacity-50 d-block"><i className="bi bi-clock"></i> {note.createdAt}</small>
                </Card.Body>
            </Card>
        </Col>
    ))}
</Row>
    </Container>

    {/* --- Note Modal --- */}
    <Modal 
    show={showModal} 
    onHide={handleCloseModal} 
    size="lg" 
    centered 
    backdrop="static" 
    fullscreen 
    contentClassName="border-0 shadow-lg"
    style={{scrollbarWidth: 'none',   /* Firefox */
            WebkitOverflowScrolling: 'touch', /* Smooth scrolling for iOS */
            margin: '0px'}}
>
    {/* --- 1. COMPACT HEADER WITH HEADING INPUT --- */}
    <Modal.Header style={getNoteStyle(noteColor, noteBgImage, darkMode)}>
        <div className="d-flex align-items-center w-100 gap-1">
            <i className={`bi ${editingId ? 'bi-pencil-square' : 'bi-plus-circle'} fs-4`} style={{ color: getContrastYIQ(noteColor) }}></i>
            
            <input 
                type="text" 
                className="flex-grow-1 bg-transparent border-0 fw-bold fs-5" 
                placeholder={editingId ? "Edit Note..." : "New Note Title..."}
                value={noteHeading}
                onChange={(e) => setNoteHeading(e.target.value)}
                style={{ 
                    color: getContrastYIQ(noteColor), 
                    outline: 'none',
                    caretColor: getContrastYIQ(noteColor)
                }}
            />

            {/* Tags Toggle Icon */}
            <Button 
                //variant="link" 
                onClick={() => setShowSettings(!showSettings)}
                //style={{ ...getNoteStyle(noteColor,noteBgImage,darkMode) }}
                title="Toggle Setting"
                className='saffron-btn rounded-ui btn-rounded'
            >
                <i className={`bi ${showSettings ? 'bi-three-dots-vertical' : 'bi-three-dots-vertical'}`} ></i>
            </Button>
            
            <CloseButton 
                onClick={handleCloseModal} 
                //variant={getContrastYIQ(noteColor)}
                className='saffron-btn rounded-ui me-0' 
            />
        </div>
    </Modal.Header>
    
    <Form onSubmit={handleSaveNote} style={{ height: '100%' }}>
        <Modal.Body className="p-0" //style={{ backgroundColor: noteColor }}
        style={getNoteStyle(noteColor, noteBgImage, darkMode)}>
            {!isDataReady && fileHandle ? (
        <div className="d-flex justify-content-center align-items-center" style={{height: '50vh'}}>
            <div className="spinner-border text-warning"></div>
        </div>
    ) : (
            <Tabs
                activeKey={activeTab}
                onSelect={(k) => setActiveTab(k)}
                className='bg-transparent'
                mountOnEnter={false} 
                unmountOnExit={false}
                justify
            >
                {/* --- TAB 1: NOTE EDITOR --- */}
                <Tab eventKey="editor" title={<span><i className="bi bi-type"></i> Editor</span>}>
                    <div className="p-3" style={{ overflowX: 'hidden' }}>
                        {/* 2. COLLAPSIBLE SETTINGS BAR */}
                        <Collapse in={showSettings}>
                        <div>
                            <div className="mb-3">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <small className="fw-bold">TAGS</small>
                                    <div className="d-flex gap-2">
                                        <span className="saffron-outline-btn py-0 px-2 small" onClick={handleSmartSuggest} style={{ fontSize: '0.7rem' }}>
                                            <i className='bi bi-magic'></i> Suggest
                                        </span>
                                        <span className="saffron-outline-btn py-0 px-2 small" onClick={handleExtractHashtags} style={{ fontSize: '0.7rem' }}>
                                            <i className='bi bi-hash'></i> Extract
                                        </span>
                                    </div>
                                </div>
                                <Form.Control 
                                    type="text" 
                                    placeholder="Tags: e.g. work, ideas, personal" 
                                    className='rounded-ui shadow-sm sm'
                                    value={Array.isArray(noteTags) ? noteTags.join(', ') : noteTags} 
                                    onChange={(e) => setNoteTags(e.target.value.split(',').map(t => t.trim()))}
                                />
                            </div>
                            {/* Theme & Reminder */}
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
                                <h3>Color:</h3>
                                <Form.Control 
                                            type="color" 
                                            size="sm" 
                                            value={noteColor}
                                            onChange={(e) => setNoteColor(e.target.value)} 
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
                                                reader.onloadend = () => setNoteBgImage(reader.result); // Base64 string
                                                reader.readAsDataURL(file);
                                            }
                                        }} 
                                    />
                                </label>
                                {noteBgImage && (
                                    <Button variant="danger" size="sm" className="rounded-circle p-0 m-0" style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50px', flexShrink: 0 }} onClick={() => setNoteBgImage('')}>
                                        <i className="bi bi-x"></i>
                                    </Button>
                                )}
                                <h4>Reminder: </h4>
                                <Form.Control 
                                    type="datetime-local" size="sm" className="rounded-ui" style={{maxWidth:'10rem',border: '2px solid black'}} 
                                    value={reminderAt} onChange={(e) => {
                                        const newTime = e.target.value;
                                        setReminderAt(newTime);
                                        
                                        // Logical Guard: No reminders for locked/encrypted notes
                                        if (isLocked) {
                                            alert("Reminders cannot be set for locked or encrypted notes.");
                                            setReminderAt(""); // Reset
                                            return;
                                        }

                                        if (newTime) {
                                            scheduleReminder(newTime, noteHeading);
                                        }
                                    }} 
                                    disabled={isLocked}
                                />
                            </div>
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
                        </Collapse>

                        {/* Rich Text Editor Container */}
                        <div className="editor-box mb-3 d-flex flex-column border-0 shadow-sm"
                            //style={getNoteStyle(noteColor, noteBgImage, darkMode)}
                            style={{background:'transparent'}}
                        >
                            {/* Sticky Toolbar */}
                            <div data-export-ignore="true" className={ `sticky-toolbar d-flex gap-2 p-2 border-bottom flex-nowrap ${isMobile && isKeyboardOpen ? 'fixed-bottom bg-white shadow-lg' : 'sticky-top'}`} 
                            onMouseDown={(e) => e.preventDefault()}
                            style={{ 
                                position: isMobile && isKeyboardOpen ? 'fixed' : 'sticky', 
                                top: isMobile && isKeyboardOpen ? 'auto' : 0,
                                bottom: isMobile && isKeyboardOpen ? 0 : 'auto', 
                                zIndex: 1060,
                                backgroundColor:'transparent',
                                backdropFilter: 'blur(10px)', // Adds a nice modern touch
                                // --- Horizontal scrolling and hidden scrollbar logic ---
                                overflowX: 'auto', 
                                whiteSpace: 'nowrap',
                                msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                                scrollbarWidth: 'none',   /* Firefox */
                                WebkitOverflowScrolling: 'touch' /* Smooth scrolling for iOS */
                            }}>
                                {/* --- CSS STYLE BLOCK (Add this if not using external CSS) --- */}
                            <style>{`
                                .sticky-toolbar::-webkit-scrollbar {
                                    display: none; /* Chrome, Safari and Opera */
                                }
                            `}</style>
                                        {/* UNDO REDO Buttons */}
                                        <ButtonGroup className='saffron-btn gap-3' style={{ flexShrink: 0 }}>
                                        <Button variant="saffron-btn" title='Undo' className='saffron-btn' size="sm" onClick={handleUndo}><i className='bi bi-arrow-left-circle-fill'></i></Button>
                                        <Button variant="saffron-btn" title='Redo' className='saffron-btn' size="sm" onClick={handleRedo}><i className='bi bi-arrow-right-circle-fill'></i></Button>
                                        </ButtonGroup>
                                
                                        {/* BUI Buttons */}
                                        <ButtonGroup className='saffron-btn gap-3' style={{ flexShrink: 0 }}>
                                        <Button variant="saffron-btn" title='Bold' className='saffron-btn' size="sm" onClick={() => applyStyle('bold')}><b>B</b></Button>
                                        <Button variant="saffron-btn" title='Italics' className='saffron-btn' size="sm" onClick={() => applyStyle('italic')}><i>I</i></Button>
                                        <Button variant="saffron-btn" title='Underline' className='saffron-btn' size="sm" onClick={() => applyStyle('underline')}><i>U</i></Button>
                                        <Button variant="saffron-btn" title='Subscript' className='saffron-btn' size="sm" onClick={() => applyStyle('subscript')}>X<sub>2</sub></Button>
                                        <Button variant="saffron-btn" title="Remove Format" className="saffron-btn" onClick={(e) => {document.execCommand('removeFormat');}}><i className="bi bi-text-paragraph"></i></Button>
                                        <Button variant="saffron-btn" title='Superscript' className='saffron-btn' size="sm" onClick={() => applyStyle('superscript')}>X<sup>2</sup></Button>
                                        <Button variant="saffron-btn" title='Font Shadow' className='saffron-btn' size="sm" onClick={openShadowModal}><i className='bi bi-lightbulb-fill'></i></Button>
                                        </ButtonGroup>

                                        <label 
                                            className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
                                            title='Highlight Color'
                                            style={{ 
                                                width: '2.6rem', 
                                                height: '2.6rem', 
                                                borderRadius: '50px', 
                                                border: '2px solid black',
                                                backgroundColor: highlightColor, // Now it correctly shows the color!
                                                position: 'relative',
                                                cursor: 'pointer'
                                            }} 
                                        >
                                            <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(highlightColor) }}></i>
                                            
                                            <input 
                                                type="color"
                                                hidden 
                                                value={highlightColor}
                                                onChange={(e) => {setHighlightColor(e.target.value); applyStyle('backColor', e.target.value);}}
                                            />
                                        </label>
                            
                                        <label 
                                            className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
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
                                                onChange={(e) => {setFontColor(e.target.value); applyStyle('foreColor', e.target.value);}}
                                            />
                                        </label>
                                        
                                        {/* List Buttons */}
                                        <ButtonGroup className='saffron-btn gap-3' style={{ flexShrink: 0 }}>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={() => applyStyle('insertUnorderedList')} title="Bullet List">
                                            <i className="bi bi-list-ul"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={() => applyStyle('insertOrderedList')} title="Numbered List">
                                            <i className="bi bi-list-ol"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={insertLink} title="Insert Link">
                                            <i className="bi bi-link"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={insertCheckbox} title="Insert Checkbox">
                                            <i className="bi bi-check2-square"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={insertToggleList} title="Insert Toggle List">
                                            <i className="bi bi-toggle-on"></i>
                                        </Button>
                                        
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={insertRadioButton} title="Insert Radio Button">
                                            <i className="bi bi-circle-fill"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' title='Insert Table' size="sm" onClick={insertTable}><i className="bi bi-table"></i></Button>
                                        </ButtonGroup>
                                        {/* Alignment Buttons */}
                                        <ButtonGroup className='saffron-btn gap-3' style={{ flexShrink: 0 }}>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={() => applyStyle('justifyLeft')} title="Align Left">
                                        <i className="bi bi-justify-left"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={() => applyStyle('justifyCenter')} title="Align Center">
                                            <i className="bi bi-text-center"></i>
                                        </Button>
                                        <Button variant="saffron-btn" className='saffron-btn' size="sm" onClick={() => applyStyle('justifyRight')} title="Align Right">
                                            <i className="bi bi-justify-right"></i>
                                        </Button>
                                        </ButtonGroup>
                                        <ButtonGroup className='saffron-btn gap-3' style={{ flexShrink: 0 }}>
                                        <Button variant="saffron-btn" title='Dictate' className='saffron-btn' size="sm" onClick={toggleDictation}><i className={`bi ${isListening ? 'bi-stop-circle' : 'bi-mic-fill'}`}></i> {isListening ? '' : ''}</Button>
                                        <Button variant="saffron-btn" title='Read out' className='saffron-btn' size="sm" onClick={handleReadAloud}><i className='bi bi-volume-up-fill'></i></Button>
                                        </ButtonGroup>
                                        <Button 
                                            onClick={() => setShowOcrModal(true)} 
                                            title="Extract text from image" 
                                            variant="saffron-btn" 
                                            size="sm" 
                                            className="d-flex align-items-center justify-content-center saffron-btn"
                                            style={{ flexShrink: 0 }}
                                        >
                                            <i className="bi bi-camera me-2"></i> OCR
                                        </Button>
                                
                                        <ButtonGroup variant="saffron-btn" className='saffron-btn gap-3' size="sm" style={{ flexWrap: 'nowrap' }}>
                                            {[1, 2, 3, 4, 5, 6].map((num) => (
                                                <Button 
                                                    key={num}
                                                    variant="outline-saffron" 
                                                    className="saffron-btn px-2" 
                                                    style={{ fontSize: '0.7rem', fontWeight: 'bold' }}
                                                    onClick={() => {
                                                        // We use formatBlock for H1-H6 to ensure proper semantics
                                                        document.execCommand('formatBlock', false, `<H${num}>`);
                                                    }}
                                                >
                                                    H{num}
                                                </Button>
                                            ))}
                                            <Button variant="saffron-btn" className="saffron-btn" title="Remove Heading" onClick={(e) => {document.execCommand('formatBlock', false, 'p');}}><i className="bi bi-text-paragraph"></i></Button>
                                        </ButtonGroup>

                                        <ButtonGroup variant="saffron-btn" className='saffron-btn gap-3' size="sm" style={{ flexShrink: 0 }}>
                                            {[
                                                { label: 'F1', size: '1', title: 'Small' },
                                                { label: 'F3', size: '3', title: 'Normal' },
                                                { label: 'F5', size: '5', title: 'Large' },
                                                { label: 'F7', size: '7', title: 'Huge' }
                                            ].map((item) => (
                                                <Button 
                                                    key={item.label}
                                                    variant="saffron-btn" 
                                                    className="saffron-btn" 
                                                    style={{ fontSize: '0.75rem' }}
                                                    title={item.title}
                                                    onClick={() => document.execCommand('fontSize', false, item.size)}
                                                >
                                                    {item.label}
                                                </Button>
                                            ))}
                                        </ButtonGroup>
                            </div>

                            <div
                                ref={editorRef}
                                contentEditable
                                id="editor-id"
                                className="p-3"
                                style={{
                                    background:'transparent', 
                                    minHeight: '68vh',
                                    maxHeight: '68vh',
                                    overflowY: 'scroll', 
                                    outline: 'none',
                                    scrollbarWidth: 'none',
                                    WebkitOverflowScrolling: 'touch' 
                                }}
                                onInput={(e) => {
                                    // Force the "checked" and "open" attributes into the HTML string
                                    syncInteractiveElements();
                                    setCurrentNote(e.currentTarget.innerHTML);
                                }}
                                onClick={(e) => {
                                    // 1. Handle Deletion
                                    const deleteBtn = e.target.closest('.delete-element-btn');
                                    if (deleteBtn) {
                                        const container = deleteBtn.closest('.radio-container') || deleteBtn.closest('.custom-toggle');
                                        if (container) {
                                            container.remove();
                                            // Manually trigger the state update
                                            setCurrentNote(editorRef.current.innerHTML);
                                            return; // Exit early
                                        }
                                    }

                                    // 2. Handle standard state sync (for radios/toggles)
                                    syncInteractiveElements();
                                    setCurrentNote(editorRef.current.innerHTML);
                                }}
                                suppressContentEditableWarning={true}
                            />
                        </div>

                    </div>
                </Tab>

                {/* --- TAB 2: ATTACHMENTS --- */}
                <Tab eventKey="attachments" title={<span><i className="bi bi-paperclip"></i> Media ({mediaItems.length})</span>} >
                    <div className="p-3" style={{...getNoteStyle(noteColor, noteBgImage, darkMode),minHeight: "81.8vh",overflowY:'scroll'}}>
                        {/* Attachments Toolbar moved here */}
                        <div className="toolbar-container mb-3 d-flex align-items-center flex-nowrap overflow-auto py-2" style={{ scrollbarWidth: 'none' }}>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" title='Attach Image'>
                            <i className="bi bi-image"></i> Image <input type="file" hidden accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                        </label>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" title='Attach Video'>
                            <i className="bi bi-camera-video"></i> Video <input type="file" hidden accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} />
                        </label>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" title='Attach Audio'>
                            <i className="bi bi-music-note"></i> Audio <input type="file" hidden accept="audio/*" onChange={(e) => handleFileUpload(e, 'audio')} />
                        </label>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" title='Attach Canvas' onClick={addCanvas}>
                            <i className="bi bi-palette"></i> Canvas
                        </label>
                        {/* Recording Buttons */}
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('image')} title="Take Photo">
                            <i className="bi bi-camera"></i> Camera
                        </label>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('video')} title="Record Video">
                            <i className="bi bi-camera-reels"></i> Rec Video
                        </label>
                        <label className="saffron-outline-btn rounded-ui flex-shrink-0" onClick={() => startMedia('audio')} title="Record Audio">
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

                {/* --- TAB 3: MIND MAP --- */}
                <Tab eventKey="mindmap" title={<span><i className="bi bi-diagram-3"></i> Mind Map</span>}>
                    <div style={{ height: '82vh', width: '100%', overflow: 'hidden', ...getNoteStyle(noteColor, noteBgImage, darkMode) }}>
                        <MindMapEditor 
                        key={fileHandle ? fileHandle.name : 'new-session'}
                            //key={fileHandle?.name || 'new-mindmap'}
                            initialData={mindMapData} 
                            onUpdate={(data) => setMindMapData(data)} 
                            darkMode={darkMode}
                        />
                    </div>
                </Tab>
            </Tabs>)}
        </Modal.Body>
        
        {/* --- STICKY FOOTER --- */}
        <Modal.Footer className={`fixed-bottom border-top p-3 justify-content-between shadow-lg ${isMobile && isKeyboardOpen ? 'd-none' : 'd-flex'}`}
        style={getNoteStyle(noteColor, noteBgImage, darkMode)}>
            {window.Capacitor && !window.Capacitor.isNativePlatform() &&
            <div className="d-flex gap-1 overflow-auto" style={{ maxWidth: '70%', scrollbarWidth: 'none' }}>
                <Button variant="link" size="sm" title='Download as .qnote' onClick={downloadQNote}><h5 className="bi bi-file-text text-warning"></h5></Button>
                <Button variant="link" size="sm" title='Download as PDF' onClick={downloadToPDF}><h5 className="bi bi-file-earmark-pdf text-danger"></h5></Button>
                <Button variant="link" size="sm" title='Download as Text' onClick={downloadToTXT}><h5 className="bi bi-filetype-txt text-success"></h5></Button>
                <Button variant="link" size="sm" title='Download as PNG' onClick={exportToPNG}><h5 className="bi bi-filetype-png text-danger"></h5></Button>
            </div>}
            {window.Capacitor && window.Capacitor.isNativePlatform() &&
            <div className="d-flex gap-1 overflow-auto" style={{ maxWidth: '70%', scrollbarWidth: 'none' }}>
                <Button variant="link" size="sm" title='Download as PNG' onClick={exportToPNG}><h5 className="bi bi-filetype-png text-danger"></h5></Button>
            </div>}
            <div className="d-flex gap-2">
                <Dropdown drop="up">
                    <Dropdown.Toggle className="saffron-btn rounded-pill px-3"><i className="bi bi-share"></i></Dropdown.Toggle>
                    <Dropdown.Menu className={darkMode ? 'dropdown-menu-dark' : ''}>
                                <Dropdown.Item onClick={shareAsPNG}>
                                    <i className="bi bi-filetype-png text-danger me-2"></i> <strong>Share As PNG Image</strong>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item onClick={shareToTXT}>
                                    <i className="bi bi-filetype-txt text-success me-2"></i> <strong>Share As .TXT</strong>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item onClick={shareToPDF}>
                                    <i className="bi bi-file-earmark-pdf text-danger me-2"></i> <strong>Share As PDF</strong>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item onClick={shareQNote}>
                                    <i className="bi bi-file-text text-warning me-2"></i> <strong>Share As QNote Format</strong>
                                </Dropdown.Item>
                                <Dropdown.Divider />
                                <Dropdown.Item onClick={shareViaWhatsApp}>
                                    <i className="bi bi-whatsapp me-2 text-success"></i> WhatsApp
                                </Dropdown.Item>
                                <Dropdown.Item onClick={shareViaTelegram}>
                                    <i className="bi bi-telegram me-2 text-info"></i> Telegram
                                </Dropdown.Item>
                                <Dropdown.Item onClick={shareViaEmail}>
                                    <i className="bi bi-envelope me-2 text-danger"></i> Email
                                </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
                <Button className="saffron-btn rounded-ui" type="submit" title='Save temporarily in browser memory'><i className="bi bi-check"></i></Button>
                <Button className="saffron-btn rounded-ui" onClick={handleFileSystemSave} title='Save directly to system folder'><i className="bi bi-folder"></i></Button>
            </div>
        </Modal.Footer>
    </Form>
</Modal>

{/* PASSWORD UNLOCK MODAL */}
<Modal show={showUnlockModal} onHide={() => setShowUnlockModal(false)} centered size="sm" contentClassName="rounded-ui">
<Modal.Header closeButton>
    <Modal.Title className="fs-6"><i className="bi bi-key-fill text-warning"></i> Unlock Note</Modal.Title>
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
        <Button variant="primary" size="sm" className="saffron-btn" type="submit">Unlock</Button>
    </Modal.Footer>
</Form>
</Modal>

{/* OCR MODAL */}
<OcrModal 
    show={showOcrModal} 
    onHide={() => setShowOcrModal(false)} 
    onInsert={handleInsertOcrText} 
/>

{/* --- Media Fullscreen Preview Modal --- */}
<Modal 
    show={!!previewMedia} 
    onHide={() => setPreviewMedia(null)} 
    centered 
    size="lg"
    contentClassName={darkMode ? "bg-dark border-secondary" : ""}
>
    <Modal.Header closeButton closeVariant={darkMode ? "white" : undefined} className="border-0">
        <Modal.Title className="small">{noteHeading || 'Image Preview'}</Modal.Title>
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
        <Button className="saffron-btn" size="sm" onClick={() => setPreviewMedia(null)}>
            Close
        </Button>
        <Button 
            className="saffron-btn" 
            size="sm" 
            onClick={() => downloadMedia(previewMedia.url, previewMedia.type)}
        >
            <i className="bi bi-download me-2"></i> Download Media
        </Button>
    </Modal.Footer>
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
</div>
    );
};
export default NotesApp;