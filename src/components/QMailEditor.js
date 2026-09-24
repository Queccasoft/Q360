import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Container, Row, Col, Button, Dropdown, ButtonGroup, Form, Collapse } from 'react-bootstrap';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Keyboard } from '@capacitor/keyboard';
import TextEditorEngine from "./TextEditorEngine";
import "./QMailTheme.css";
const QMailEditor = ({ fileHandle, onSave, onDownload, onShare }) => {
    const [darkMode, setDarkMode] = useState(false);
    const [fileName, setFileName] = useState(fileHandle?.name ? fileHandle.name.split('.')[0] : 'Untitled Template');
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [showCode, setShowCode] = useState(false);
    const [rawHTML, setRawHTML] = useState('');
    const [emailBgColor, setEmailBgColor] = useState('#ffffff');
    const [emailBgImage, setEmailBgImage] = useState('');
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [fontColor, setFontColor] = useState('#00c800');
    const [fontHighlightColor, setFontHighlightColor] = useState('#00c800');
    const [selectedSizeIndex, setSelectedSizeIndex] = useState('3'); 
    const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
    const [selectedElement, setSelectedElement] = useState(null);
    const [showSidebar, setShowSidebar] = useState(false);
    const isResizing = useRef(false);
    const [sidebarState, setSidebarState] = useState({
        paddingTop: '', paddingRight: '', paddingBottom: '', paddingLeft: '',
        marginTop: '', marginRight: '', marginBottom: '', marginLeft: '',
        backgroundColor: '#ffffff', borderRadius: '0px', borderWeight: '0',
        href: ''
    });
    const [showEditMenu, setShowEditMenu] = useState(false);
    const [showInsertMenu, setShowInsertMenu] = useState(false);
    const editorRef = useRef(null);
    const codeEditorRef = useRef(null);

    // Load initial file content
    useEffect(() => {
        const loadFile = async () => {
            if (fileHandle && fileHandle.getFile) {
                try {
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    if (editorRef.current) {
                        editorRef.current.innerHTML = text;
                        saveState(text);
                    }
                } catch (err) {
                    console.error("Failed to read file contents", err);
                }
            } else {
                // Default empty state
                saveState("<p>Start building your email template here...</p>");
            }
        };
        loadFile();
    }, [fileHandle]);

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

    // History & Undo/Redo Engine
    const saveState = useCallback((explicitContent = null) => {
        if (!editorRef.current && !explicitContent) return;
        const currentContent = explicitContent || editorRef.current.innerHTML;
        
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(currentContent);
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
    }, [historyIndex]);

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            if (editorRef.current) editorRef.current.innerHTML = history[newIndex];
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            if (editorRef.current) editorRef.current.innerHTML = history[newIndex];
        }
    };

    const getContrastYIQ = (hexcolor) => {
    if (!hexcolor) return 'black';
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16), 
          g = parseInt(hexcolor.substr(2, 2), 16), 
          b = parseInt(hexcolor.substr(4, 2), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
};

const getEmailEditorStyle = (color, image, darkMode) => {
    const bgColor = color && color !== '#ffffff' && color !== '' 
        ? color 
        : (darkMode ? '#1e1e1e' : '#ffffff');

    const overlay = darkMode && (!color || color === '#ffffff')
        ? 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6))'
        : 'linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2))';

    return {
        backgroundColor: bgColor,
        backgroundImage: image ? `${overlay}, url(${image})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        color: getContrastYIQ(bgColor),
        transition: 'all 0.3s ease'
    };
};

const applyToCurrentCell = (styleProp, value) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    let node = selection.anchorNode;
    const cell = node.nodeType === 3 ? node.parentNode.closest('td') : node.closest('td');
    
    if (cell) {
        if (styleProp === 'border') {
            cell.style.border = `${value}px solid #000000`; // Default black border
        } else {
            cell.style[styleProp] = value;
        }
        // Also apply bgcolor attribute for legacy email client support
        if (styleProp === 'backgroundColor') cell.setAttribute('bgcolor', value);
        
        saveState();
    } else {
        alert("Please click inside a layout cell first!");
    }
};

// Sync sidebar inputs whenever a new element is selected
useEffect(() => {
    if (selectedElement) {
        const s = selectedElement.style;
        let bgColor = '#ffffff';
        // If it's a link, try to get the color from the parent TD first
        if (selectedElement.tagName === 'A') {
            const parentTd = selectedElement.closest('td');
            bgColor = parentTd ? (parentTd.getAttribute('bgcolor') || parentTd.style.backgroundColor) : s.backgroundColor;
        } else {
            bgColor = selectedElement.getAttribute('bgcolor') || s.backgroundColor;
        }
        setSidebarState({
            paddingTop: s.paddingTop || '',
            paddingRight: s.paddingRight || '',
            paddingBottom: s.paddingBottom || '',
            paddingLeft: s.paddingLeft || '',
            marginTop: s.marginTop || '',
            marginRight: s.marginRight || '',
            marginBottom: s.marginBottom || '',
            marginLeft: s.marginLeft || '',
            backgroundColor: bgColor || '#ffffff',
            color: s.color || '#ffffff',
            borderRadius: s.borderRadius || '0px',
            borderWeight: parseInt(s.borderWidth) || '0',
            href: selectedElement.tagName === 'A' ? selectedElement.getAttribute('href') : '',
            text: selectedElement.innerText || ''
        });
    }
}, [selectedElement]);

    // Custom Formatting Engine Wrapper (as requested)
    const handleFormat = useCallback((method, value = null, customRange = null) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const selection = window.getSelection();
        if (customRange) {
            selection.removeAllRanges();
            selection.addRange(customRange);
        }
        TextEditorEngine.execute(method, value, selection);
        
        saveState(); 
    }, [saveState]);

    // Layout/Grid Injector for Email Templates (Emails require <table> structures)
    const insertLayout = (columns) => {
    let html = `<table width="100%" border="0" cellpadding="10" cellspacing="0" style="width: 100%; max-width: 600px; margin: auto; border-collapse: collapse; margin-bottom: 15px;"><tr>`;
    
    const width = Math.floor(100 / columns);
    for (let i = 0; i < columns; i++) {
        // Removed the dashed border here
        html += `<td width="${width}%" valign="top" style="border: none; padding: 15px; text-align: left;">
            <p>Column ${i + 1}</p>
        </td>`;
    }
    
    html += `</tr></table><br/>`;
    handleFormat('insertHTML', html);
};

    // Export Helpers
    const generateBlob = async () => {
        const content = showCode 
        ? (codeEditorRef.current?.value || rawHTML) 
        : (editorRef.current?.innerHTML || '');

    const emailStyle = getEmailEditorStyle(emailBgColor, emailBgImage, false);
        // Wrap in basic HTML email boilerplate
        const fullEmailContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            .email-body { 
                background-color: ${emailStyle.backgroundColor}; 
                background-image: url('${emailBgImage}'); 
                background-size: cover;
                background-position: center;
            }
        </style>
    </head>
    <body class="email-body" style="margin: 0; padding: 0; background-color: ${emailStyle.backgroundColor};">
        <center>
            ${content}
        </center>
    </body>
    </html>
`;
        return new Blob([fullEmailContent], { type: 'text/html' });
    };

    const handleAction = async (ext, mode) => {
        if (!editorRef.current) return;
        let blob = null;

        // 1. Generate Blob based on extension
        if (ext === '.html') blob = await generateBlob();
        if (!blob) return;
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
    };

const toggleCodeView = () => {
    if (showCode) {
        // Switching FROM HTML TO VISUAL
        const htmlFromCodeView = codeEditorRef.current?.value || '';
        setRawHTML(htmlFromCodeView); // Update state for saving/exporting
        
        // Use a tiny timeout to ensure the DOM div is rendered before setting innerHTML
        setTimeout(() => {
            if (editorRef.current) {
                editorRef.current.innerHTML = htmlFromCodeView;
            }
        }, 0);
    } else {
        // Switching FROM VISUAL TO HTML
        const htmlFromVisual = editorRef.current?.innerHTML || '';
        setRawHTML(htmlFromVisual);
    }
    setShowCode(!showCode);
};
    return (
        <div className={`app-wrapper ${darkMode ? 'dark-mode' : ''}`}>
            <Container fluid className="d-flex flex-column h-100">
                {/* Header Section */}
                <Row className="mb-3 align-items-center">
                    <Col xs={12} md={6} className="d-flex align-items-center gap-3 mb-2 mb-md-0">
                        <input 
                            type="text" 
                            className="heading-input m-0" 
                            value={fileName} 
                            onChange={(e) => setFileName(e.target.value)}
                            placeholder="Template Name"
                            style={{ maxWidth: '300px' }}
                        />
                        <Button variant="link" onClick={() => setDarkMode(!darkMode)} className="text-muted p-0">
                            <i className={`bi bi-${darkMode ? 'sun' : 'moon-stars'} fs-4`}></i>
                        </Button>
                    </Col>
                    <Col xs={12} md={6} className="d-flex justify-content-md-end gap-2">
                        <Button className="qmaileditor-outline-btn" onClick={toggleCodeView}>
                            <i className="bi bi-code-slash me-1"></i> {showCode ? 'Visual' : 'HTML'}
                        </Button>
                        <Button className="qmaileditor-outline-btn" onClick={() => handleAction('.html','share')}>
                            <i className="bi bi-share"></i>
                        </Button>
                        <Button className="qmaileditor-outline-btn" onClick={() => handleAction('.html','download')}>
                            <i className="bi bi-download"></i>
                        </Button>
                        <Button className="qmaileditor-outline-btn" onClick={() => handleAction('.html','save')}>
                            <i className="bi bi-cloud-arrow-up me-1"></i> Save
                        </Button>
                    </Col>
                </Row>

                {/* Editor Toolbar */}
                {!showCode && (
                    <div className="editor-box d-flex flex-column border-0">
                        <div className={ `sticky-toolbar d-flex gap-2 p-2 border-bottom flex-nowrap ${isMobile && isKeyboardOpen ? 'fixed-bottom bg-white shadow-lg' : 'sticky-top'}`}
                        style={{ 
                                position: isMobile && isKeyboardOpen ? 'fixed' : 'sticky', 
                                top: isMobile && isKeyboardOpen ? 'auto' : 0,
                                bottom: isMobile && isKeyboardOpen ? 0 : 'auto', 
                                zIndex: 1060,
                                backdropFilter: 'blur(10px)',
                                // --- Horizontal scrolling and hidden scrollbar logic ---
                                overflowX: 'scroll', 
                                whiteSpace: 'nowrap',
                                msOverflowStyle: 'none',  /* Internet Explorer 10+ */
                                scrollbarWidth: 'none',   /* Firefox */
                                WebkitOverflowScrolling: 'touch' /* Smooth scrolling for iOS */
                            }}>
                                {/* EDIT MENU TOGGLE */}
                                <Button onClick={() => setShowEditMenu(!showEditMenu)} title="Edit Menu" variant="qmaileditor-outline-btn" className='qmaileditor-outline-btn' size="sm" style={{ 
                                            width: '2.6rem', 
                                            height: '2.6rem', 
                                            borderRadius: '50px', 
                                            position: 'relative',
                                            flexShrink: 0
                                        }}><i className="bi bi-pencil-fill"></i></Button>
                                    
                                {/* EDIT MENU */}
                                <Collapse in={showEditMenu}>
                                <div>
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '1rem', 
                                    alignItems: 'center', 
                                    animationName: 'fadeInLeft',
                                    animationDuration: '1s',
                                }}>
                                    {/* UNDO REDO GROUP */}
                                    <ButtonGroup className='qmaileditor-btn gap-1 mb-0' style={{ flexShrink: 0 }}>
                                    <Button onClick={() => handleUndo()} disabled={historyIndex <= 0} title="Undo" variant="qmaileditor-btn" className='qmaileditor-btn' ><i className="bi bi-arrow-left-circle-fill"></i></Button>
                                    <Button onClick={() => handleRedo()} disabled={historyIndex >= history.length - 1} title="Redo" variant="qmaileditor-btn" className='qmaileditor-btn' ><i className="bi bi-arrow-right-circle-fill"></i></Button>
                                    </ButtonGroup>

                                    <ButtonGroup className='qmaileditor-btn gap-3' style={{ flexShrink: 0 }}>
                                    <Button onClick={() => handleFormat('bold')} title="Bold" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-type-bold"></i></Button>
                                    <Button onClick={() => handleFormat('italic')} title="Italic" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-type-italic"></i></Button>
                                    <Button onClick={() => handleFormat('underline')} title="Underline" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-type-underline"></i></Button>
                                    <Button onClick={() => handleFormat('strikeThrough')} title="Strike-through" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-type-strikethrough"></i></Button>
                                </ButtonGroup>

                                    <ButtonGroup className='qmaileditor-btn gap-3' style={{ flexShrink: 0 }}>
                                    <Button onClick={() => handleFormat('subscript')} title="Subscript" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i>X<sub>2</sub></i></Button>
                                    <Button onClick={() => handleFormat('removeFormat')} title="Remove Formating" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i>X</i></Button>
                                    <Button onClick={() => handleFormat('superscript')} title="Superscript" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i>X<sup>2</sup></i></Button>
                                </ButtonGroup>

                                <ButtonGroup className='qmaileditor-btn gap-3' style={{ flexShrink: 0 }}>
                                    <Button onClick={() => handleFormat('justifyLeft')} title="Align Left" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-text-left"></i></Button>
                                    <Button onClick={() => handleFormat('justifyCenter')} title="Align Center" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-text-center"></i></Button>
                                    <Button onClick={() => handleFormat('justifyRight')} title="Align Right" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm"><i className="bi bi-text-right"></i></Button>
                                </ButtonGroup>

                                <ButtonGroup className='qmaileditor-btn gap-3' style={{ flexShrink: 0 }}>
                                    {/* Decrease Indent Button */}
                                    <Button 
                                        onClick={() => handleFormat('outdent')} 
                                        title="Decrease Indent" 
                                        variant="qmaileditor-btn" 
                                        className='qmaileditor-btn' 
                                        size="sm"
                                    >
                                        <i className="bi bi-text-indent-left"></i>
                                    </Button>

                                    {/* Increase Indent Button */}
                                    <Button onClick={() => handleFormat('indent')} title="Increase Indent" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm">
                                        <i className="bi bi-text-indent-right"></i>
                                    </Button>
                                    {/* Character Spacing (Letter Spacing) */}
                                    <Button onClick={() => handleFormat('letterspacing', 2)} title="Character Spacing" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm">
                                        <i className="bi bi-arrows-expand"></i>
                                    </Button>

                                    {/* Word Spacing */}
                                    <Button onClick={() => handleFormat('wordspacing', 10)} title="Word Spacing" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm">
                                        <i className="bi bi-distribute-horizontal"></i>
                                    </Button>

                                    {/* Line Height (Block Level) */}
                                    <Button onClick={() => handleFormat('lineheight', '2')} title="Line Spacing" variant="qmaileditor-btn" className='qmaileditor-btn' size="sm">
                                        <i className="bi bi-text-paragraph"></i>
                                    </Button>
                                </ButtonGroup>

                                <Form.Group className="mb-0 d-flex align-items-center">
                                    <Form.Label className={`text-sm font-medium me-2 mb-0 ${darkMode ? 'text-light' : 'text-dark'}`}>
                                        Size:
                                    </Form.Label>
                                    
                                    <div className="d-flex align-items-center bg-body-tertiary rounded border border-secondary-subtle p-1" 
                                        style={{ backgroundColor: darkMode ? '#2b3035' : '#f8f9fa' }}>
                                        
                                        {/* Minus Button */}
                                        <Button 
                                            variant={darkMode ? "outline-light" : "outline-dark"} 
                                            size="sm" 
                                            className="border-0 px-2"
                                            onClick={() => {
                                                const newSize = Math.max(1, parseInt(selectedSizeIndex) - 1);
                                                setSelectedSizeIndex(newSize);
                                                handleFormat('fontSize', newSize);
                                            }}
                                        >
                                            <i className="bi bi-dash-lg"></i>
                                        </Button>

                                        {/* Size Display */}
                                        <span 
                                            className={`mx-2 fw-bold text-center ${darkMode ? 'text-light' : 'text-dark'}`} 
                                            style={{ minWidth: '35px', fontSize: '0.9rem' }}
                                        >
                                            {selectedSizeIndex}
                                        </span>

                                        {/* Plus Button */}
                                        <Button 
                                            variant={darkMode ? "outline-light" : "outline-dark"} 
                                            size="sm" 
                                            className="border-0 px-2"
                                            onClick={() => {
                                                const newSize = Math.min(400, parseInt(selectedSizeIndex) + 1);
                                                setSelectedSizeIndex(newSize);
                                                handleFormat('fontSize', newSize);
                                            }}
                                        >
                                            <i className="bi bi-plus-lg"></i>
                                        </Button>
                                    </div>
                                </Form.Group>

                                    <ButtonGroup className="qmailEditor-btn gap-3" style={{ flexShrink: 0 }}>
                                    <Button variant="qmaileditor-btn" className="qmaileditor-btn"
                                        onClick={() => {
                                            const url = prompt("Enter Background Image URL:", emailBgImage);
                                            setEmailBgImage(url || '');
                                        }}>
                                        <i className="bi bi-image-fill"></i>
                                    </Button>
                                    {emailBgImage && (
                                        <Button variant="danger" size="sm" className="rounded-circle p-0 m-0" style={{ width: '2.6rem', height: '2.6rem', borderRadius: '50px', flexShrink: 0 }} onClick={() => setEmailBgImage('')}>
                                            <i className="bi bi-x"></i>
                                        </Button>
                                    )}
                                    </ButtonGroup>

                                    <label 
                                    className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
                                    title='Text Color'
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

                                    <label 
                                    className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
                                    title='Text Highlight Color'
                                    style={{ 
                                        width: '2.6rem', 
                                        height: '2.6rem', 
                                        borderRadius: '50px', 
                                        border: '2px solid black',
                                        backgroundColor: fontHighlightColor,
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }} 
                                >
                                    <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(fontHighlightColor) }}></i>
                                    <input 
                                        type="color"
                                        hidden 
                                        value={fontHighlightColor}
                                        onChange={(e) => {setFontHighlightColor(e.target.value); handleFormat('backcolor', e.target.value);}}
                                    />
                                    </label>

                                    <label 
                                    className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
                                    title='Email BG Color'
                                    style={{ 
                                        width: '2.6rem', 
                                        height: '2.6rem', 
                                        borderRadius: '50px', 
                                        border: '2px solid black',
                                        backgroundColor: emailBgColor,
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }} 
                                >
                                    <i className="bi bi-envelope-fill" style={{ color: getContrastYIQ(emailBgColor) }}></i>
                                    <input 
                                        type="color"
                                        hidden 
                                        value={emailBgColor}
                                        onChange={(e) => setEmailBgColor(e.target.value)}
                                    />
                                    </label>

                                    </div>
                                </div>
                                </Collapse>

                                {/* INSERT MENU TOGGLE */}
                                <Button onClick={() => setShowInsertMenu(!showInsertMenu)} title="Insert Menu" variant="qmaileditor-outline-btn" className='qmaileditor-outline-btn' size="sm" style={{ 
                                            width: '2.6rem', 
                                            height: '2.6rem', 
                                            borderRadius: '50px', 
                                            position: 'relative',
                                            flexShrink: 0
                                        }}><i className="bi bi-plus-lg"></i></Button>
                                    
                                {/* INSERT MENU */}
                                <Collapse in={showInsertMenu}>
                                <div>
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '1rem', 
                                    alignItems: 'center', 
                                    animationName: 'fadeInLeft',
                                    animationDuration: '1s',
                                }}>
                                    {/* UNDO REDO GROUP */}
                                    <ButtonGroup className='qmaileditor-btn gap-1 mb-0' style={{ flexShrink: 0 }}>
                                    <Button variant="qmaileditor-btn" className='qmaileditor-btn' onClick={() => handleFormat('insertunorderedlist')} title="Bullet List"><i className="bi bi-list-ul"></i></Button>
                                    <Button variant="qmaileditor-btn" className='qmaileditor-btn' onClick={() => handleFormat('insertorderedlist')} title="Numbered List"><i className="bi bi-list-ol"></i></Button>
                                    </ButtonGroup>      

                                    <ButtonGroup className='qmaileditor-btn gap-1 mb-0' style={{ flexShrink: 0 }}>
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' disabled={true}>Columns:</Button>
                                    <Button onClick={() => insertLayout(1)} title="Add Single Column" variant="qmaileditor-btn" className='qmaileditor-btn' >1</Button>
                                    <Button onClick={() => insertLayout(2)} title="Add 2 Columns" variant="qmaileditor-btn" className='qmaileditor-btn' >2</Button>
                                    <Button onClick={() => insertLayout(3)} title="Add 3 Columns" variant="qmaileditor-btn" className='qmaileditor-btn' >3</Button>
                                    </ButtonGroup>

                                    <ButtonGroup className='qmaileditor-btn gap-1 mb-0' style={{ flexShrink: 0 }}>
                                    <Button onClick={() => {
                                    const btnText = prompt('Button Text:', 'Click Here');
                                    const btnUrl = prompt('Button Link URL:', 'https://');
                                    const btnRadius = prompt('Border Radius (e.g., 5px, 50px for pill):', '5px');
                                    const btnColor = prompt('Button Color (Hex):', '#6500fc');
                                    
                                    if (btnText && btnUrl) {
                                        // Standard email-safe button using a table structure to ensure padding and border-radius work in Outlook/Gmail
                                        const buttonHTML = `
                                        <table border="0" cellspacing="0" cellpadding="0" style="margin: 10px 0;">
                                            <tr>
                                                <td align="center" bgcolor="${btnColor}" style="border-radius: ${btnRadius};">
                                                    <a href="${btnUrl}" target="_blank" style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: ${btnRadius}; padding: 12px 24px; border: 1px solid ${btnColor}; display: inline-block; font-weight: bold;">
                                                        ${btnText}
                                                    </a>
                                                </td>
                                            </tr>
                                        </table><br/>`;
                                        handleFormat('inserthtml', buttonHTML);
                                    }
                                }} title="Add Button" variant="qmaileditor-btn" className='qmaileditor-btn' >Button</Button>
                                    </ButtonGroup>

                                    {/* Links and Horizontal Rule */}
                                    <ButtonGroup className='qmaileditor-btn gap-1 mb-0' style={{ flexShrink: 0 }}>
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' title="Insert Link" onClick={() => {
                                            const url = prompt('Enter URL:');
                                            if (url) handleFormat('createlink', url);
                                        }}>
                                            <i className="bi bi-link-45deg"></i>
                                        </Button>
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' title="Remove Link" onClick={() => handleFormat('unlink')}>
                                            <i className="bi bi-link-45deg text-danger" style={{ textDecoration: 'line-through' }}></i>
                                        </Button>
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' title="Insert Image" onClick={() => {
                                const url = prompt('Enter Image URL');
                                if (url) handleFormat('insertImage', url);
                            }}>
                                            <i className="bi bi-image"></i>
                                        </Button>
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' title="Insert Divider Line" onClick={() => handleFormat('inserthorizontalrule')}>
                                            <i className="bi bi-dash-lg"></i>
                                        </Button>
                                    </ButtonGroup>

                                    <ButtonGroup variant="qmaileditor-btn" className='qmaileditor-btn gap-1' style={{ flexWrap: 'nowrap' }}>
                                        {[1, 2, 3, 4, 5, 6].map((num) => (
                                            <Button 
                                                key={num}
                                                variant="qmaileditor-btn" 
                                                className="qmaileditor-btn px-2" 
                                                style={{ fontSize: '0.7rem', fontWeight: 'bold' }}
                                                onClick={() => {
                                                    // We use formatBlock for H1-H6 to ensure proper semantics
                                                    handleFormat('formatBlock', `H${num}`)
                                                }}
                                            >
                                                H{num}
                                            </Button>
                                        ))}
                                        <Button variant="qmaileditor-btn" className='qmaileditor-btn' title="Remove Heading" onClick={(e) => handleFormat('removeFormat')}><i className="bi bi-text-paragraph"></i></Button>
                                    </ButtonGroup>

                                    </div>
                                </div>
                                </Collapse>
                        </div>
                    </div>
                )}

                {/* Editor Container */}
                <Row className="flex-grow-1 overflow-hidden">
                    {/* Collapsible Sidebar */}
                    <Collapse in={showSidebar} dimension="width">
    <Col xs={10} md={3} className="border-end bg-light p-3 overflow-auto sidebar-left">
        <div className="d-flex justify-content-left gap-2 mb-3">
            <h5 className="m-0">Settings</h5>
            {/* Delete Button */}
        <Button variant="danger" className='rounded-ui' size="sm" onClick={() => {
            if(window.confirm("Delete this component?")) {
                selectedElement.remove();
                setSelectedElement(null);
                setShowSidebar(false);
                saveState();
            }
        }}>
            <i className="bi bi-trash"></i>
        </Button>
            <Button variant="success" className='rounded-ui' size="sm" onClick={() => {
                // APPLY CHANGES TO DOM
                if (!selectedElement) return;
                const s = selectedElement.style;
                const st = sidebarState;
                
                // Spacing
                s.padding = `${st.paddingTop} ${st.paddingRight} ${st.paddingBottom} ${st.paddingLeft}`;
                s.margin = `${st.marginTop} ${st.marginRight} ${st.marginBottom} ${st.marginLeft}`;
                
                // Cell/Component specific
                if (selectedElement.tagName === 'TD') {
                    selectedElement.setAttribute('bgcolor', st.backgroundColor);
                    s.backgroundColor = st.backgroundColor;
                    s.border = `${st.borderWeight}px solid #000000`;
                    s.borderRadius = st.borderRadius;
                }
                
                // Link specific
                if (selectedElement.tagName === 'A') {
                    const parentTd = selectedElement.closest('td');
                    const st = sidebarState;
                    const s = selectedElement.style;

                    // 1. Update the Link (<a>)
                    selectedElement.setAttribute('href', st.href);
                    selectedElement.innerText = st.text;
                    s.backgroundColor = st.backgroundColor;
                    s.color = st.color;
                    s.borderRadius = st.borderRadius;
                    s.border = `1px solid ${st.backgroundColor}`; 

                    // 2. Sync the Parent Cell (<td>) - This fixes the "ghosting" issue
                    if (parentTd) {
                        parentTd.setAttribute('bgcolor', st.backgroundColor);
                        parentTd.style.backgroundColor = st.backgroundColor;
                        parentTd.style.borderRadius = st.borderRadius;
                    }
                }

                saveState(); // Record to history
            }}>
                <i className="bi bi-check-lg"></i>
            </Button>
        </div>

        <hr/>

        {selectedElement && (
            <>
                {/* 1. LINK SETTINGS (If Link) */}
                {selectedElement.tagName === 'A' && (
                    <div className="bg-white p-3 rounded border mb-3">
                        <Form.Label className="small fw-bold text-primary mb-2">Button Styles</Form.Label>
                        
                        <Form.Group className="mb-2">
                            <Form.Label className="x-small">Display Text</Form.Label>
                            <Form.Control size="sm" value={sidebarState.text} onChange={(e) => setSidebarState({...sidebarState, text: e.target.value})} />
                        </Form.Group>

                        <Form.Group className="mb-2">
                            <Form.Label className="x-small">Link URL</Form.Label>
                            <Form.Control size="sm" value={sidebarState.href} onChange={(e) => setSidebarState({...sidebarState, href: e.target.value})} />
                        </Form.Group>

                        <div className="d-flex gap-2 mb-2">
                            <div className="flex-grow-1">
                                <Form.Label className="x-small">Btn Color</Form.Label>
                                <Form.Control type="color" size="sm" value={sidebarState.backgroundColor} onChange={(e) => setSidebarState({...sidebarState, backgroundColor: e.target.value})} />
                            </div>
                            <div className="flex-grow-1">
                                <Form.Label className="x-small">Text Color</Form.Label>
                                <Form.Control type="color" size="sm" value={sidebarState.color} onChange={(e) => setSidebarState({...sidebarState, color: e.target.value})} />
                            </div>
                        </div>

                        <Form.Group>
                            <Form.Label className="x-small">Corner Radius (px)</Form.Label>
                            <Form.Control size="sm" placeholder="e.g. 5px" value={sidebarState.borderRadius} onChange={(e) => setSidebarState({...sidebarState, borderRadius: e.target.value})} />
                        </Form.Group>
                    </div>
                )}

                {/* 2. CELL SETTINGS (If Table Cell) */}
                {selectedElement.tagName === 'TD' && (
                    <div className="bg-white p-2 rounded border mb-3">
                        <Form.Label className="small fw-bold">Cell Appearance</Form.Label>
                        <div className="mb-2">
                            <label className="x-small d-block">Background</label>
                            <Form.Control type="color" size="sm" value={sidebarState.backgroundColor} onChange={(e) => setSidebarState({...sidebarState, backgroundColor: e.target.value})} />
                        </div>
                        <div className="mb-2">
                            <label className="x-small d-block">Border Thickness ({sidebarState.borderWeight}px)</label>
                            <input type="range" min="0" max="10" className="form-range" value={sidebarState.borderWeight} onChange={(e) => setSidebarState({...sidebarState, borderWeight: e.target.value})} />
                        </div>
                        <div className="mb-2">
                            <label className="x-small d-block">Corner Radius</label>
                            <Form.Control size="sm" placeholder="e.g. 10px" value={sidebarState.borderRadius} onChange={(e) => setSidebarState({...sidebarState, borderRadius: e.target.value})} />
                        </div>
                    </div>
                )}

                {/* 3. PADDING & MARGIN (Universal) */}
                {['padding', 'margin'].map(type => (
                    <div key={type} className="mb-3">
                        <h6 className="text-uppercase small fw-bold">{type}</h6>
                        <div className="d-flex gap-1 flex-wrap">
                            {['Top', 'Right', 'Bottom', 'Left'].map(dir => (
                                <div key={dir} style={{width: '46%'}}>
                                    <label className="x-small text-muted">{dir}</label>
                                    <Form.Control 
                                        size="sm" 
                                        value={sidebarState[`${type}${dir}`]} 
                                        placeholder="0px"
                                        onChange={(e) => setSidebarState({...sidebarState, [`${type}${dir}`]: e.target.value})}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </>
        )}
    </Col>
</Collapse>
                    <Col className="h-100 position-relative">
                        {showCode ? (
                            <Form.Control
                                as="textarea"
                                ref={codeEditorRef}
                                defaultValue={rawHTML} // Use defaultValue to prevent cursor jumping
                                className={`w-100 h-100 editor-box font-monospace p-3 ${darkMode ? 'text-light bg-dark border-secondary' : 'bg-white'}`}
                                style={{ minHeight: '60vh', resize: 'none' }}
                                onBlur={(e) => setRawHTML(e.target.value)}
                            />
                        ) : (
                            <div 
                                id="editor-id"
                                ref={editorRef}
                                style={getEmailEditorStyle(emailBgColor, emailBgImage, darkMode)}
                                    className={`editor-box h-100 p-4`}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onInput={(e) => {
                                        setRawHTML(e.target.innerHTML);
                                        // Debounce or call saveState on blur/keyup based on performance preference
                                    }}
                                    onBlur={() => saveState()}
                            onPointerMove={(e) => {
        if (isResizing.current) return;
        const cell = e.target.closest('td');
        if (!cell) {
            e.currentTarget.style.cursor = 'text';
            return;
        }
        const rect = cell.getBoundingClientRect();
        const isRight = Math.abs(e.clientX - rect.right) < 10;
        const isBottom = Math.abs(e.clientY - rect.bottom) < 10;

        if (isRight && isBottom) e.currentTarget.style.cursor = 'nwse-resize';
        else if (isRight) e.currentTarget.style.cursor = 'col-resize';
        else if (isBottom) e.currentTarget.style.cursor = 'row-resize';
        else e.currentTarget.style.cursor = 'text';
    }}
    onClick={(e) => {
        const target = e.target.closest('td, a, img');
        if (target) {
            setSelectedElement(target);
            setShowSidebar(true);
        } else {
            setShowSidebar(false);
            setSelectedElement(null);
        }
    }}
                            onPointerDown={(e) => {
                                const cell = e.target.closest('td');
                                if (!cell) return;

                                const rect = cell.getBoundingClientRect();
                                const borderThreshold = 10; // pixels from edge to trigger resize

                                // Check if pointer is near edges
                                const isRight = Math.abs(e.clientX - rect.right) < borderThreshold;
                                const isBottom = Math.abs(e.clientY - rect.bottom) < borderThreshold;

                                if (isRight || isBottom) {
                                e.preventDefault();
                                isResizing.current = true;
                                
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const startWidth = cell.offsetWidth;
                                const startHeight = cell.offsetHeight;

                                const onMove = (moveEvent) => {
                                    if (!isResizing.current) return;
                                    if (isRight) cell.style.width = `${startWidth + (moveEvent.clientX - startX)}px`;
                                    if (isBottom) cell.style.height = `${startHeight + (moveEvent.clientY - startY)}px`;
                                };

                                const onUp = () => {
                                    isResizing.current = false;
                                    document.removeEventListener('pointermove', onMove);
                                    document.removeEventListener('pointerup', onUp);
                                    saveState();
                                };

                                document.addEventListener('pointermove', onMove);
                                document.addEventListener('pointerup', onUp);
                                }
                            }}
                            />
                        )}
                    </Col>
                </Row>
            </Container>
            
            {/* Floating button (if needed for bottom UI consistency) */}
            <button className="floating-plus-btn qMailEditor-btn border-0 d-flex justify-content-center align-items-center shadow-lg" onClick={() => handleFormat('insertHorizontalRule')} title="Insert Divider">
                <i className="bi bi-dash-lg text-white"></i>
            </button>
        </div>
    );
};

export default QMailEditor;