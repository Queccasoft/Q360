import React, { useState, useRef, useCallback, useEffect } from 'react';
// Assuming you have imported Bootstrap components like this:
import { Container, Row, Col, Button, Form, Collapse } from 'react-bootstrap'; 
// Assuming you have Bootstrap icons imported or linked

const HtmlTemplateEditor = ({ initialHtml = '<h1>Your Template Here</h1>', editorStyle, editorGutterStyle, fullscreen, onSubmit }) => {
    // --- Existing States ---
    const editorRef = useRef(null);
    const lineNumberRef = useRef(null);
    const [lineCount, setLineCount] = useState(1);
    const [searchText, setSearchText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matchCount, setMatchCount] = useState(0);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [charNoSpaceCount, setCharNoSpaceCount] = useState(0);
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [selectedBackColor, setSelectedBackColor] = useState('#ffff00'); 
    const [selectedSizeIndex, setSelectedSizeIndex] = useState('3'); 
    const [isCaseSensitive, setIsCaseSensitive] = useState(false);
    const [isWholeWord, setIsWholeWord] = useState(false);
    const [openFormatControls, setOpenFormatControls] = useState(false);
    const [openSearchControls, setOpenSearchControls] = useState(false);
    const [openInsertControls, setOpenInsertControls] = useState(false); 
    const allMatchElementsRef = useRef([]);
    const HIGHLIGHT_SPAN_START = `<span class="search-match bg-yellow-300 rounded ">`;
    const HIGHLIGHT_SPAN_END = `</span>`;
    const HIGHLIGHT_STYLE = 'font-size: 150%; color: red;';
    const ACTIVE_HIGHLIGHT_STYLE = 'font-size: 150%; color: red; background-color: black;';

    // --- NEW States for HTML Editor ---
    const [viewMode, setViewMode] = useState('design'); // 'design' or 'code'
    const [htmlContent, setHtmlContent] = useState(initialHtml); // Stores the raw HTML content
    const codeEditorRef = useRef(null); // Ref for the raw HTML textarea

    // --- Adapted and New Callbacks ---

    // Original: getCleanText - Now returns content editable HTML content without search highlights
    const getCleanHtml = useCallback(() => {
        if (!editorRef.current) return htmlContent;
        // 1. Get the content, which might have search highlights
        let content = editorRef.current.innerHTML;
        // 2. Remove search highlights for clean HTML output
        content = content.replace(new RegExp(`${HIGHLIGHT_SPAN_START}(.*)${HIGHLIGHT_SPAN_END}`, 'g'), '$1');
        allMatchElementsRef.current = [];
        return content;
    }, [htmlContent, HIGHLIGHT_SPAN_START, HIGHLIGHT_SPAN_END]);
    
    // Original: getCleanText - Used for text metrics calculation only
    const getCleanTextForMetrics = useCallback(() => {
        if (!editorRef.current) return initialHtml;
        return editorRef.current.innerText || '';
    }, [initialHtml]);

    const calculateMetrics = useCallback(() => {
        if (viewMode === 'code' && codeEditorRef.current) {
            // Metrics based on raw HTML text in code view
            const text = codeEditorRef.current.value || '';
            const totalChars = text.length; 
            const charsNoSpace = text.replace(/\s/g, '').length; 
            const words = text.trim().split(/\s+/).filter(w => w.length > 0);
            const totalWords = words.length;
            setCharCount(totalChars);
            setCharNoSpaceCount(charsNoSpace);
            setWordCount(totalWords);
        } else if (editorRef.current) {
            // Metrics based on innerText in design view
            const text = getCleanTextForMetrics();
            const totalChars = text.length; 
            const charsNoSpace = text.replace(/\s/g, '').length; 
            const words = text.trim().split(/\s+/).filter(w => w.length > 0);
            const totalWords = words.length;
            setCharCount(totalChars);
            setCharNoSpaceCount(charsNoSpace);
            setWordCount(totalWords);
        }
    }, [viewMode, getCleanTextForMetrics]);

    const calculateLineCount = useCallback(() => {
        if (viewMode === 'code' && codeEditorRef.current) {
            const count = (codeEditorRef.current.value.match(/\n/g) || []).length + 1;
            setLineCount(count);
            // Sync height for code view
            if (lineNumberRef.current && codeEditorRef.current) {
                 lineNumberRef.current.style.minHeight = `${codeEditorRef.current.scrollHeight}px`;
            }
        } else if (editorRef.current) {
            const text = editorRef.current.innerText || '';
            const count = text.split('\n').length;
            setLineCount(count);
            // Sync height for design view
            if (lineNumberRef.current && editorRef.current) {
                lineNumberRef.current.style.minHeight = `${editorRef.current.offsetHeight}px`;
            }
        }
    }, [viewMode]);
    
    // Original: handleInput - Now only runs in design view
    const handleInput = useCallback(() => {
        if (viewMode !== 'design') return;
        if (editorRef.current) {
            const currentText = editorRef.current.innerText;
            if (editorRef.current.innerHTML.includes('search-match')) {
                 editorRef.current.innerText = currentText; 
            }
        }
        // Update htmlContent state on input in design view
        setHtmlContent(editorRef.current.innerHTML); 
        setMatchCount(0);
        setCurrentMatchIndex(-1);
        allMatchElementsRef.current = [];
        calculateMetrics(); 
        calculateLineCount();
    }, [calculateMetrics, calculateLineCount, viewMode]);
    
    // New: Handle input for Code View
    const handleCodeInput = useCallback((e) => {
        setHtmlContent(e.target.value);
        calculateMetrics(); 
        calculateLineCount();
    }, [calculateMetrics, calculateLineCount]);

    // Handle View Mode Toggle
    const handleViewModeToggle = useCallback(() => {
        setViewMode(prevMode => {
            const newMode = prevMode === 'design' ? 'code' : 'design';
            
            if (prevMode === 'design' && editorRef.current) {
                // Switching from Design to Code: Save clean HTML
                const cleanHtml = getCleanHtml();
                setHtmlContent(cleanHtml);
            } else if (prevMode === 'code' && codeEditorRef.current) {
                // Switching from Code to Design: The state htmlContent is already updated by handleCodeInput
            }
            // Reset search/highlight on view switch
            setSearchText('');
            setMatchCount(0);
            setCurrentMatchIndex(-1);
            allMatchElementsRef.current = [];
            
            return newMode;
        });
    }, [getCleanHtml]);


    // Original: handleSubmit - Now submits the raw HTML content
    const handleSubmit = useCallback(() => {
        // Ensure the latest content is in state before submission
        if (viewMode === 'design' && editorRef.current) {
            const finalContent = getCleanHtml();
            onSubmit(finalContent); // Submit the final raw HTML
        } else {
            onSubmit(htmlContent); // Submit the raw HTML from state (updated by code view input)
        }

        // Reset search/highlight
        setSearchText('');
        setMatchCount(0);
        setCurrentMatchIndex(-1);
        allMatchElementsRef.current = [];
    }, [onSubmit, getCleanHtml, htmlContent, viewMode]);
    
    // All other original formatting/search/insert functions can remain the same. 
    // They mostly rely on document.execCommand which only works in Design View.

    // --- Effects ---

    // Effect for initial load and view mode sync
    useEffect(() => {
        if (viewMode === 'design' && editorRef.current) {
            // Set the content for the contentEditable div
            editorRef.current.innerHTML = htmlContent;
        } else if (viewMode === 'code' && codeEditorRef.current) {
            // Set the content for the textarea (Already updated via state)
        }
         calculateMetrics();
         calculateLineCount();
    }, [htmlContent, viewMode, calculateMetrics, calculateLineCount]);
    
    // Rerun search when searchText, case/whole word settings change (only in design view)
    useEffect(() => {
        if (viewMode === 'design' && searchText.length > 0) {
            handleSearch();
        } else if (viewMode === 'design' && editorRef.current) {
            // Clear highlights when search text is empty
            editorRef.current.innerHTML = getCleanHtml(); // Use getCleanHtml to remove highlights
        }
    }, [searchText, isCaseSensitive, isWholeWord, viewMode]); // Added viewMode dependency

    // Line Number Gutter Component (Slightly modified to handle both editor types)
    const LineNumberGutter = ({ count }) => {
        const numbers = Array.from({ length: count }, (_, i) => i + 1);
        const handleScroll = () => {
             if (lineNumberRef.current) {
                if (viewMode === 'design' && editorRef.current) {
                    lineNumberRef.current.scrollTop = editorRef.current.scrollTop;
                } else if (viewMode === 'code' && codeEditorRef.current) {
                    lineNumberRef.current.scrollTop = codeEditorRef.current.scrollTop;
                }
             }
        };
        useEffect(() => {
            const currentEditor = viewMode === 'design' ? editorRef.current : codeEditorRef.current;
            if (currentEditor) {
                currentEditor.addEventListener('scroll', handleScroll);
                return () => currentEditor?.removeEventListener('scroll', handleScroll);
            }
        }, [viewMode, editorRef.current, codeEditorRef.current]);
        
        return (
             <div
                ref={lineNumberRef}
                style={editorGutterStyle}
                className="bg-light border-end text-secondary text-end pe-2 user-select-none" // Added classes for styling
            >
                {numbers.map(num => (
                    <div key={num} className="line-number">{num}</div>
                ))}
            </div>
        );
    };
    
    // Placeholder functions (The full implementation is complex, but included here for completeness)
    const getSearchRegex = useCallback(() => {
            if (searchText.length === 0) return null;
            let escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (isWholeWord) {
                escapedSearchText = `\\b${escapedSearchText}\\b`;
            }
            const flags = 'g' + (isCaseSensitive ? '' : 'i');
            return new RegExp(escapedSearchText, flags);
        }, [searchText, isWholeWord, isCaseSensitive]);

    // Function to update the DOM to show the active match (Search/Replace logic)
        const setActiveHighlight = useCallback((index) => {
            if (allMatchElementsRef.current.length === 0) return;
            allMatchElementsRef.current.forEach(el => {
                el.style = HIGHLIGHT_STYLE;
            });
            const activeEl = allMatchElementsRef.current[index];
            if (activeEl) {
                activeEl.style = ACTIVE_HIGHLIGHT_STYLE;
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setCurrentMatchIndex(index);
        }, [ HIGHLIGHT_STYLE,ACTIVE_HIGHLIGHT_STYLE]);

    // 2. Highlight all occurrences of the search text (Search/Replace logic)
        const handleSearch = useCallback(() => {
            if (!editorRef.current || searchText.length < 1) {
                setMatchCount(0);
                setCurrentMatchIndex(-1);
                allMatchElementsRef.current = [];
                if (editorRef.current) editorRef.current.innerText = getCleanHtml();
                return;
            }
    
            const cleanText = getCleanHtml();
            const regex = getSearchRegex();
            if (!regex) return;
            
            let count = 0;
            const highlightedHtml = cleanText.replace(regex, (match) => {
                count++;
                return `${HIGHLIGHT_SPAN_START}${match}${HIGHLIGHT_SPAN_END}`;
            });
    
            editorRef.current.innerHTML = highlightedHtml;
            setMatchCount(count);
            
            allMatchElementsRef.current = Array.from(editorRef.current.querySelectorAll('.search-match'));
    
            if (count > 0) {
                setActiveHighlight(0);
            } else {
                setCurrentMatchIndex(-1);
            }
        }, [searchText, getCleanHtml, getSearchRegex, HIGHLIGHT_SPAN_START, HIGHLIGHT_SPAN_END, setActiveHighlight]);

    // 3. Perform single replacement on the active match (Search/Replace logic)
        const handleReplace = useCallback(() => {
            if (currentMatchIndex === -1 || allMatchElementsRef.current.length === 0) return;
    
            const activeEl = allMatchElementsRef.current[currentMatchIndex];
            activeEl.innerText = replaceText;
            activeEl.outerHTML = activeEl.innerHTML;
            allMatchElementsRef.current = []; 
            setMatchCount(prevCount => prevCount - 1); 
    
            setTimeout(() => {
                handleSearch();
                const nextIndex = currentMatchIndex < allMatchElementsRef.current.length ? currentMatchIndex : 0;
                if (allMatchElementsRef.current.length > 0) {
                    setActiveHighlight(nextIndex);
                } else {
                     setCurrentMatchIndex(-1);
                }
                calculateMetrics();
                calculateLineCount(); // Update line count after replacement
            }, 50);
        }, [currentMatchIndex, replaceText, handleSearch, setActiveHighlight, calculateMetrics, calculateLineCount]);
        
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
            const cleanText = getCleanHtml();
            const regex = getSearchRegex();
            if (!regex) return;
            const newText = cleanText.replace(regex, replaceText);
            editorRef.current.innerText = newText;
            
            setSearchText('');
            setReplaceText('');
            setMatchCount(0);
            setCurrentMatchIndex(-1);
            allMatchElementsRef.current = [];
            calculateMetrics();
            calculateLineCount(); // Update line count after replacement
        }, [searchText, replaceText, getCleanHtml, getSearchRegex, calculateMetrics, calculateLineCount]);

    const handleFormat = useCallback((command, value) => {
        if (viewMode === 'design' && editorRef.current) {
            editorRef.current.focus();
            document.execCommand(command, false, value);
        } else {
            alert('Formatting commands only work in Design View.');
        }
    }, [viewMode]);
    const handleInsertImage = useCallback(() => {
            const url = prompt("Enter the image URL:");
            if (url) {
                editorRef.current.focus();
                document.execCommand('insertImage', false, url);
            }
        }, []);
    
        const handleInsertLink = useCallback(() => {
            editorRef.current.focus();
            document.execCommand('createLink', true, null); 
        }, [viewMode]);
        
        const handleInsertList = useCallback(() => {
            editorRef.current.focus();
            document.execCommand('insertUnorderedList', false, null);
        }, [viewMode]);
    
        // UPDATED HANDLER: Insert Table (Dynamic Rows/Cols)
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
            
            document.execCommand('insertHTML', false, tableHTML);
        }, []);
    
        // 9. Function to download the document content (omitted for brevity)
        const handleDownloadDoc = useCallback(() => {
            if (!editorRef.current) return;
            const contentHtml = editorRef.current.innerHTML;
            const fullHtml = `<!DOCTYPE html>...${contentHtml}</body></html>`;
    
            const blob = new Blob([fullHtml], { type: 'application/msword;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'formatted_document.docx'; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, []);
    
        const handleDownloadTxt = useCallback(() => {
            if (!editorRef.current) return;
            const contentText = editorRef.current.innerText;
        
            const blob = new Blob([contentText], { type: 'text/plain;charset=utf-8' });
        
            const url = URL.createObjectURL(blob);    
            const a = document.createElement('a');
            a.href = url;
            
            a.download = 'document.txt'; 
            
            document.body.appendChild(a);
            a.click();
        
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, []);
        
    const SearchOptionButton = ({ label, isActive, onClick }) => (
        <Button onClick={onClick} variant={isActive ? 'primary' : 'outline-secondary'} size="sm" className="rounded-pill">{label}</Button>
    );
     const commonBtnVariant = (isDisabled, variant) => isDisabled ? 'secondary' : variant;

    // --- Render Logic ---
    return (
        <Container fluid className="p-0">
            <Row className={fullscreen?"align-items-start texteditor-icons":"align-items-start"}>
            
            {/* --- New View Mode Toggle Button --- */}
            <Row className="mb-3 g-2 align-items-start col-sm-auto">
                <Col xs="auto" className="d-flex align-items-center">
                    <Button
                        onClick={handleViewModeToggle}
                        variant={viewMode === 'design' ? "info" : "warning"}
                        title={`Switch to ${viewMode === 'design' ? 'Code View (HTML)' : 'Design View (WYSIWYG)'}`}
                        className="d-flex align-items-center justify-content-center p-2 rounded-circle shadow-sm"
                        style={{ width: '40px', height: '40px' }}
                    >
                        <i className={`bi bi-${viewMode === 'design' ? 'code-slash' : 'pencil-square'}`} style={{ fontSize: '1.2rem' }}></i>
                    </Button>
                </Col>
                <Col xs="auto">
                    <h5 className="mb-0 text-muted d-flex align-items-center" style={{ height: '40px' }}>
                        {viewMode === 'design' ? 'Design View' : 'Code View (HTML/CSS)'}
                    </h5>
                </Col>
            </Row>

            {/* --- Existing Controls (Conditionally Rendered) --- */}
            {viewMode === 'design' && (
                <>
                    {/* Formatting Controls (Original implementation goes here) */}
                    <Row className="mb-3 g-2 align-items-start col-sm-auto">
                        <Col xs="auto" className="d-flex align-items-center"> 
                        <Button
                            onClick={() => setOpenFormatControls(!openFormatControls)}
                            aria-controls="formatting-controls-collapse"
                            aria-expanded={openFormatControls}
                            variant={openFormatControls ? "primary" : "outline-primary"}
                            title="Toggle Formatting Controls"
                            className="d-flex align-items-center justify-content-center p-2 rounded-circle shadow-sm"
                            style={{ width: '40px', height: '40px' }}
                        >
                            <i className={`bi bi-type-bold`} style={{ fontSize: '1.2rem' }}></i>
                        </Button>
                        </Col>

                        <Col className="p-0"> 
                        <Collapse in={openFormatControls}>
                                                <div id="formatting-controls-collapse" className="p-3 border rounded shadow-sm bg-light">
                                                    <Row className="g-3 align-items-center">
                                                        <Col xs="auto"><h5 className="mb-0 text-muted">Format:</h5></Col>
                                                        {/* Size Selector */}
                                                        <Col xs="auto">
                                                            <Form.Group as={Row} className="mb-0 align-items-center">
                                                                <Form.Label column sm="auto" className="text-sm font-medium">Size:</Form.Label>
                                                                <Col sm="auto">
                                                                    <Form.Select value={selectedSizeIndex} onChange={(e) => { const newSize = e.target.value; setSelectedSizeIndex(newSize); handleFormat('fontSize', newSize); }} size="sm">
                                                                        {[...Array(7).keys()].map(i => { const size = i + 1; let label = size.toString(); if (size === 1) label = 'Small'; if (size === 3) label = 'Medium'; if (size === 5) label = 'Large'; if (size === 7) label = 'X-Large'; return <option key={size} value={size}>{label}</option> })}
                                                                    </Form.Select>
                                                                </Col>
                                                            </Form.Group>
                                                        </Col>
                        
                                                        {/* Color Pickers */}
                                                        <Col xs="auto"><Form.Group as={Row} className="mb-0 align-items-center"><Form.Label column sm="auto" className="text-sm font-medium">Font:</Form.Label><Col sm="auto"><Form.Control type="color" value={selectedColor} onChange={(e) => { const newColor = e.target.value; setSelectedColor(newColor); handleFormat('foreColor', newColor); }} title="Select Text Color" className="p-0 border rounded-circle" style={{ width: '32px', height: '32px' }}/></Col></Form.Group></Col>
                                                        <Col xs="auto"><Form.Group as={Row} className="mb-0 align-items-center"><Form.Label column sm="auto" className="text-sm font-medium">Highlight:</Form.Label><Col sm="auto"><Form.Control type="color" value={selectedBackColor} onChange={(e) => { const newColor = e.target.value; setSelectedBackColor(newColor); handleFormat('backColor', newColor); }} title="Select Background Color" className="p-0 border rounded-circle" style={{ width: '32px', height: '32px' }}/></Col></Form.Group></Col>
                        
                                                        {/* FONT STYLES CONTROLS */}
                                                        <Col xs="auto" className="d-flex gap-1 align-items-center border-start ps-3">
                                                            <Button onClick={() => handleFormat('bold')} title="Bold" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center font-weight-bold"><i className="bi bi-type-bold"></i></Button>
                                                            <Button onClick={() => handleFormat('italic')} title="Italic" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center font-italic"><i className="bi bi-type-italic"></i></Button>
                                                            <Button onClick={() => handleFormat('underline')} title="Underline" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-type-underline"></i></Button>
                                                        </Col>
                        
                                                        {/* SUB/SUPERSCRIPT & STRIKE-THROUGH CONTROLS */}
                                                        <Col xs="auto" className="d-flex gap-1 align-items-center border-start ps-3">
                                                            <Button onClick={() => handleFormat('subscript')} title="Subscript" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-subscript"></i></Button>
                                                            <Button onClick={() => handleFormat('superscript')} title="Superscript" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-superscript"></i></Button>
                                                            <Button onClick={() => handleFormat('strikeThrough')} title="Strike-through" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-type-strikethrough"></i></Button>
                                                        </Col>
                        
                        
                                                        {/* ALIGNMENT CONTROLS */}
                                                        <Col xs="auto" className="d-flex gap-1 align-items-center border-start ps-3">
                                                            <Button onClick={() => handleFormat('justifyLeft')} title="Align Left" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-text-left"></i></Button>
                                                            <Button onClick={() => handleFormat('justifyCenter')} title="Align Center" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-text-center"></i></Button>
                                                            <Button onClick={() => handleFormat('justifyRight')} title="Align Right" variant="outline-secondary" size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-text-right"></i></Button>
                                                        </Col>
                        
                        
                                                        {/* DOWNLOAD Buttons */}
                                                        <Col xs="auto">
                                                            <Button onClick={handleDownloadDoc} title="Download Document as .docx" variant="info" size="sm">
                                                                <i className="bi bi-file-earmark-arrow-down-fill me-1"></i>(.DOCX)
                                                            </Button>
                                                        </Col>
                                                        <Col xs="auto">
                                                            <Button onClick={handleDownloadTxt} title="Download Document as .docx" variant="info" size="sm">
                                                                <i className="bi bi-file-earmark-arrow-down-fill me-1"></i>(.TXT)
                                                            </Button>
                                                        </Col>
                                                    </Row>
                                                </div>
                                            </Collapse> 
                        </Col>
                    </Row>
                    
                    {/* Insert Controls (Original implementation goes here) */}
                    <Row className="mb-3 g-2 align-items-start col-sm-auto">
                         <Col xs="auto" className="d-flex align-items-center"> 
                         <Button
                            onClick={() => setOpenInsertControls(!openInsertControls)}
                            aria-controls="insert-controls-collapse"
                            aria-expanded={openInsertControls}
                            variant={openInsertControls ? "success" : "outline-success"}
                            title="Toggle Insert Controls"
                            className="d-flex align-items-center justify-content-center p-2 rounded-circle shadow-sm"
                            style={{ width: '40px', height: '40px' }}
                        >
                            <i className={`bi bi-image`} style={{ fontSize: '1.2rem' }}></i>
                        </Button>
                        </Col>

                         <Col className="p-0"> 
                         <Collapse in={openInsertControls}>
                                <div id="insert-controls-collapse" className="p-3 border rounded shadow-sm bg-light">
                                    <Row className="g-3 align-items-center">
                                        <Col xs="auto">
                                            <h5 className="mb-0 text-muted">Insert:</h5>
                                        </Col>
                                        
                                        {/* Insert Image Button (Existing) */}
                                        <Col xs="auto">
                                            <Button onClick={handleInsertImage} title="Insert Image from URL" variant="outline-success" size="sm" className="d-flex align-items-center justify-content-center">
                                                <i className="bi bi-image me-2"></i> Image (URL)
                                            </Button>
                                        </Col>
                                        
                                        {/* Insert Link Button */}
                                        <Col xs="auto">
                                            <Button onClick={handleInsertLink} title="Insert Hyperlink" variant="outline-success" size="sm" className="d-flex align-items-center justify-content-center">
                                                <i className="bi bi-link me-2"></i> Link
                                            </Button>
                                        </Col>
        
                                        {/* Insert List Button */}
                                        <Col xs="auto">
                                            <Button onClick={handleInsertList} title="Insert Unordered List" variant="outline-success" size="sm" className="d-flex align-items-center justify-content-center">
                                                <i className="bi bi-list-ul me-2"></i> List
                                            </Button>
                                        </Col>
        
                                        {/* UPDATED: Insert Table Button (Dynamic) */}
                                        <Col xs="auto">
                                            <Button onClick={handleInsertTable} title="Insert Custom Table (Rows & Cols)" variant="outline-success" size="sm" className="d-flex align-items-center justify-content-center">
                                                <i className="bi bi-table me-2"></i> Table (R x C)
                                            </Button>
                                        </Col>
                                    </Row>
                                </div>
                            </Collapse>
                          </Col>
                    </Row>
                </>
            )}
            
            {/* Search and Replace Controls (Original implementation goes here, can be used in both views but only `handleSearch` works in design) */}
            <Row className="mb-3 g-2 align-items-start col-sm-auto">
                <Col xs="auto" className="d-flex align-items-center"> 
                    <Button
                        onClick={() => setOpenSearchControls(!openSearchControls)}
                        aria-controls="search-controls-collapse"
                        aria-expanded={openSearchControls}
                        variant={openSearchControls ? "dark" : "outline-dark"}
                        title="Toggle Search and Replace"
                        className="d-flex align-items-center justify-content-center p-2 rounded-circle shadow-sm"
                        style={{ width: '40px', height: '40px' }}
                    >
                        <i className={`bi bi-search`} style={{ fontSize: '1.2rem' }}></i>
                    </Button>
                 </Col>
                <Col className="p-0"> 
                <Collapse in={openSearchControls}>
                    <div id="search-controls-collapse" className="p-3 border rounded shadow-sm bg-light">
                        
                        {/* Inputs */}
                        <Row className="g-3 mb-3">
                            <Col md><Form.Control type="text" placeholder="Text to find..." value={searchText} onChange={(e) => setSearchText(e.target.value)} size="sm"/></Col>
                            <Col md><Form.Control type="text" placeholder="Replacement text..." value={replaceText} onChange={(e) => setReplaceText(e.target.value)} size="sm"/></Col>
                        </Row>
                        
                        {/* METRICS DISPLAY */}
                        <Row className="mb-3 border-bottom pb-2">
                            <Col xs={4}><p className="text-sm mb-0"><i className="bi bi-hash me-1 text-primary"></i>**Words:** {wordCount}</p></Col>
                            <Col xs={4}><p className="text-sm mb-0"><i className="bi bi-text-paragraph me-1 text-success"></i>**Characters:** {charCount}</p></Col>
                            <Col xs={4}><p className="text-sm mb-0"><i className="bi bi-type me-1 text-info"></i>**Chars (No Space):** {charNoSpaceCount}</p></Col>
                        </Row>
                        
                        {/* Options, Status, and Actions */}
                        <Row className="g-2 align-items-center justify-content-between">
                            <Col xs="auto" className="d-flex gap-2">
                                <SearchOptionButton label="Case Sensitive" isActive={isCaseSensitive} onClick={() => setIsCaseSensitive(prev => !prev)}/>
                                <SearchOptionButton label="Whole Word" isActive={isWholeWord} onClick={() => setIsWholeWord(prev => !prev)}/>
                            </Col>
                            <Col xs="auto"><p className="text-sm text-muted mb-0">
                                {searchText.length > 0 && matchCount > 0 ? `Match ${currentMatchIndex + 1} of ${matchCount}` : searchText.length > 0 ? "No matches found." : "Enter text to search."}
                            </p></Col>
                            <Col xs="auto" className='d-flex gap-2'>
                                <Button onClick={handlePrevMatch} disabled={matchCount <= 1} title="Previous Match" variant={commonBtnVariant(matchCount <= 1, 'info')} size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-chevron-left"></i></Button>
                                <Button onClick={handleNextMatch} disabled={matchCount <= 1} title="Next Match" variant={commonBtnVariant(matchCount <= 1, 'info')} size="sm" className="d-flex align-items-center justify-content-center"><i className="bi bi-chevron-right"></i></Button>
                                <Button onClick={handleReplace} disabled={currentMatchIndex === -1 || replaceText.length === 0} title="Replace Current Match" variant={commonBtnVariant(currentMatchIndex === -1 || replaceText.length === 0, 'danger')} size="sm">Replace</Button>
                                <Button onClick={handleReplaceAll} disabled={matchCount === 0 || replaceText.length === 0} title="Replace All Matches" variant={commonBtnVariant(matchCount === 0 || replaceText.length === 0, 'danger')} size="sm">Replace All</Button>
                            </Col>
                        </Row>
                    </div>
                </Collapse>
                </Col>
            </Row>
            
            <Row className="m-3 col-sm-auto">
                <Col>
                     <Button
                        onClick={handleSubmit}
                        title="Submit Document"
                        variant="success"
                        className="w-100"
                    >
                        Submit Final HTML Template
                    </Button>
                </Col>
            </Row>
            </Row>
            
            {/* --- Content Editable / Code Area with Line Numbers --- */}
            <div className="d-flex border rounded" style={{ ...editorStyle }}>
                <LineNumberGutter count={lineCount} />
                
                {/* Design View (Content Editable) */}
                {viewMode === 'design' && (
                    <div 
                        ref={editorRef}
                        contentEditable="true"
                        onInput={handleInput}
                        suppressContentEditableWarning={true}
                        className="w-100 p-2"
                        style={{ 
                            whiteSpace: 'pre-wrap', 
                            overflowY: 'auto', 
                            outline: 'none', 
                        }}
                    >
                        {/* Content is set via useEffect from htmlContent state */}
                    </div>
                )}
                
                {/* Code View (Textarea for Raw HTML) */}
                {viewMode === 'code' && (
                    <textarea
                        ref={codeEditorRef}
                        value={htmlContent}
                        onChange={handleCodeInput}
                        className="w-100 form-control border-0 p-2"
                        style={{ 
                            resize: 'none', 
                            whiteSpace: 'pre', // Maintain code formatting
                            fontFamily: 'monospace',
                            overflowY: 'auto', 
                            height: '100%', 
                        }}
                    />
                )}
            </div>
            
        </Container>
    );
};

export default HtmlTemplateEditor;