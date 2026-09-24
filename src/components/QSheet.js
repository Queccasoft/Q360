import React, { useState, useRef, useEffect } from 'react';
import { Container, Button, ButtonGroup, Table, Form, Dropdown, DropdownButton, Tab, Tabs, Modal, Row, Collapse, Col } from 'react-bootstrap';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Keyboard } from '@capacitor/keyboard';
import autoTable from 'jspdf-autotable';
import MultiChartGenSheet from './MultiChartGenSheet';
import TextEditorEngine from "./TextEditorEngine";
import './QSheetTheme.css';

// --- COMPONENT ---
const QSheet = ({ fileHandle, onSave, onShare, onDownload }) => {
  // --- CONFIG ---
  const [projectName, setProjectName] = useState("New Project");
  const fontFaces = ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana", "Roboto", "Tahoma"];
  const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 36, 48];

  // Constants for default scaling
  const DEFAULT_COL_WIDTH = 2.5; 
  const DEFAULT_ROW_HEIGHT = 0.6;
  
  // --- FACTORY ---
  const createEmptySheet = (name) => ({
    name,
    grid: Array.from({ length: 15 }, () => Array(8).fill('')), // Stores HTML strings now
    hiddenRows: [],
    conditionalRules: [],
    styleGrid: Array.from({ length: 15 }, () => Array(8).fill({
      fontWeight: 'normal', fontStyle: 'normal', textDecoration: '', 
      textAlign: 'left', verticalAlign: 'middle', fontSize: 10, fontFamily: 'Arial',
      color: '#000000', backgroundColor: '#ffffff', 
      borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6',
      borderLeft: '1px solid #dee2e6', borderRight: '1px solid #dee2e6'
    })),
    charts: [],
    colWidths: Array(8).fill(DEFAULT_COL_WIDTH),
    rowHeights: Array(15).fill(DEFAULT_ROW_HEIGHT),
    merges: {}, 
    images: {},  // format: "r_c" : base64String
    formulas: {},
  });
  const [newRule, setNewRule] = useState({ col: 'A', operator: '>', value: '', color: '#ff0000' });
  const [findParams, setFindParams] = useState({ find: '', replace: '', scope: 'sheet',matchCase: false, matchWhole: false });
  const [highlightedCell, setHighlightedCell] = useState(null); // {r, c}
  
  // PLATFORM TRACKING STATE
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);

  // NEW STATES
  const [darkMode, setDarkMode] = useState(false);
  const [sheetColor, setSheetColor] = useState('#ffffff');
  const [sheetBgImage, setSheetBgImage] = useState();
  const [cellHighlightColor, setCellHighlightColor] = useState('#009500');
  const [cellFontColor, setCellFontColor] = useState('#00c800');
  const [selectedSizeIndex, setSelectedSizeIndex] = useState('3'); 
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showFindModal, setShowFindModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCellMarginModal, setShowCellMarginModal] = useState(false);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showCellInsertModal, setShowCellInsertModal] = useState(false);
  const [showRowInsertModal, setShowRowInsertModal] = useState(false);
  const [showColumnInsertModal, setShowColumnInsertModal] = useState(false);
  const [showRowSortModal, setShowRowSortModal] = useState(false);
  const [showColumnSortModal, setShowColumnSortModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showSearchSortMenu, setShowSearchSortMenu] = useState(false);

    // --- STATE ---
  const [sheets, setSheets] = useState([createEmptySheet("Sheet1")]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [clipboard, setClipboard] = useState(null); // { data: [][], styles: [][], formulas: {}, isCut: boolean }
  const [pdfOrientation, setPdfOrientation] = useState('l'); // 'l' for landscape, 'p' for portrait

  // Selection
  const [selection, setSelection] = useState({ start: {r:0, c:0}, end: {r:0, c:0}, isSelecting: false });
  // Border Selection State
  const [borderMode, setBorderMode] = useState('all'); // all, left, right, top, bottom, outer, none
  const [borderColorPicker, setBorderColorPicker] = useState('#000000');
  // Helper to check if a range is selected (more than just one active cell)
  const isRangeSelected = selection.start.r !== selection.end.r || selection.start.c !== selection.end.c;

  const multiChartGenRef = useRef(null);

  // TRACKING STATE
  const [dragState, setDragState] = useState(null); // { type: 'move'|'resize', id: 123, startX: 0, startY: 0, initial: {} }

  // 1. MOUSE DOWN HANDLER (Attached to Chart Header or Resize Handle)
  const handleChartMouseDown = (e, chartId, type) => {
    e.stopPropagation(); // Prevent grid selection
    const chart = sheets[activeSheetIdx].charts.find(c => c.id === chartId);
    setDragState({
      type, 
      id: chartId,
      startX: e.clientX,
      startY: e.clientY,
      initial: { ...chart } // Snapshot of x, y, width, height
    });
  };

  // 2. MOUSE MOVE HANDLER (Attached to the Main Container)
  const handleGlobalMouseMove = (e) => {
    if (!dragState) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    setSheets(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      const chart = ns[activeSheetIdx].charts.find(c => c.id === dragState.id);
      if (!chart) return prev;

      if (dragState.type === 'move') {
        chart.x = Math.max(0, dragState.initial.x + dx);
        chart.y = Math.max(0, dragState.initial.y + dy);
      } else if (dragState.type === 'resize') {
        chart.width = Math.max(200, dragState.initial.width + dx); // Min width 200
        chart.height = Math.max(150, dragState.initial.height + dy); // Min height 150
      }
      return ns;
    });
  };

  // 3. MOUSE UP HANDLER (Attached to the Main Container)
  const handleGlobalMouseUp = () => {
    setDragState(null);
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

  const getContrastYIQ = (hexcolor) => {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128) ? 'black' : 'white';
};

const getSheetStyle = (color, image, darkMode) => {
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

// Your provided initial structure
const initialChartData = [
  { 
      title: "Example State Voting (Pie)",
      type: "pie",
      data: [
          { label: "A", value: 2, color: "rgba(255, 99, 132, 0.8)", gradient:"none" },
          { label: "B", value: 5, color: "rgba(75, 192, 192, 0.8)", gradient:"none" },
          { label: "C", value: 8, color: "rgba(255, 205, 86, 0.8)", gradient:"none" }
      ] 
  }
];

const [multipleDynamicDatas, setMultipleDynamicDatas] = useState(initialChartData);
const [showChartModal, setShowChartModal] = useState(false);
const [chartType, setChartType] = useState('bar');
const [chartTitle, setChartTitle] = useState('My New Chart');

  useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'c') {
        handleCopy(false);
      }
      if (e.key === 'x') {
        handleCopy(true);
      }
      if (e.key === 'v') {
        // If we have internal clipboard data, we prevent the default 
        // browser paste to avoid double entries.
        if (clipboard) {
          e.preventDefault(); 
          executePaste('all');
        }
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, clipboard, activeSheetIdx]);

  const evaluateFormula = (formula, currentGrid) => {
  if (!formula || typeof formula !== 'string') return formula;

  let cleanFormula = formula.replace(/^=+/, '').trim();
  if (cleanFormula === "") return "";

  // Helper to get values from the grid
  const getValues = (rangeStr) => {
  const values = [];
  const isRange = rangeStr.includes(':');
  
  try {
    if (isRange) {
      // 1. Split "A1:B3" into "A1" and "B3"
      const [start, end] = rangeStr.split(':');
      
      // 2. Convert Column letters to numbers (A=0, B=1) and Row strings to indices
      const startCol = start.match(/[A-Z]+/)[0].charCodeAt(0) - 65;
      const startRow = parseInt(start.match(/[0-9]+/)[0]) - 1;
      const endCol = end.match(/[A-Z]+/)[0].charCodeAt(0) - 65;
      const endRow = parseInt(end.match(/[0-9]+/)[0]) - 1;

      // 3. Define the boundaries (handles if user typed B3:A1)
      const rMin = Math.min(startRow, endRow);
      const rMax = Math.max(startRow, endRow);
      const cMin = Math.min(startCol, endCol);
      const cMax = Math.max(startCol, endCol);

      // 4. Loop through the grid and collect data
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          // SAFETY GUARD: Check if the row and cell exist on the current sheet
          if (currentGrid[r] && currentGrid[r][c] !== undefined) {
            const raw = currentGrid[r][c];
            // Remove HTML tags (like <b>) and trim whitespace
            const clean = String(raw).replace(/<[^>]*>/g, '').trim();
            const num = parseFloat(clean);
            
            // If it's a number, use the number; otherwise, use the string
            values.push(isNaN(num) ? clean : num);
          } else {
            // If cell is out of bounds (common during sheet swaps), use 0
            values.push(0);
          }
        }
      }
      return values; // Returns an array [10, 20, "Apple", 5]
      
    } else {
      // SINGLE CELL CASE (e.g., "A1")
      const col = rangeStr.match(/[A-Z]+/)[0].charCodeAt(0) - 65;
      const row = parseInt(rangeStr.match(/[0-9]+/)[0]) - 1;

      // SAFETY GUARD
      if (currentGrid[row] && currentGrid[row][col] !== undefined) {
        const raw = currentGrid[row][col];
        const clean = String(raw).replace(/<[^>]*>/g, '').trim();
        const num = parseFloat(clean);
        return isNaN(num) ? clean : num;
      }
      return 0; // Return 0 for empty or invalid cells
    }
  } catch (e) {
    console.error("Error parsing range:", rangeStr, e);
    return isRange ? [] : 0;
  }
};

  const spreadsheetFunctions = {
    SUM: (...args) => args.flat().reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0),
    AVERAGE: (...args) => {
      const nums = args.flat().map(n => parseFloat(n) || 0);
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    },
    COUNT: (...args) => args.flat().filter(v => v !== "" && v !== null).length,
    MAX: (...args) => Math.max(...args.flat().map(n => parseFloat(n) || 0)),
    MIN: (...args) => Math.min(...args.flat().map(n => parseFloat(n) || 0)),
    ADD: (a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0),
    PRODUCT: (...args) => args.flat().reduce((a, b) => (parseFloat(a) || 1) * (parseFloat(b) || 1), 1),
    FILTER: (range, criteria) => {
      const flatRange = Array.isArray(range) ? range : [range];
      const flatCriteria = Array.isArray(criteria) ? criteria : [criteria];
      return flatRange.filter((_, i) => 
        flatCriteria[i] === true || 
        flatCriteria[i] === 1 || 
        String(flatCriteria[i]).toUpperCase() === 'TRUE'
      );
    }
  };

  try {
    // 1. Process comparisons first (e.g., A1:A10="Value")
    let processed = cleanFormula.replace(/([A-Z]+[0-9]+:[A-Z]+[0-9]+)\s*([<>=!]+)\s*"?([^",)]+)"?/g, (match, range, op, val) => {
      const vals = getValues(range);
      const compareTo = isNaN(val) ? val.trim() : parseFloat(val);
      const results = vals.map(v => {
        if (op === '=') return v == compareTo;
        if (op === '>') return v > compareTo;
        if (op === '<') return v < compareTo;
        return false;
      });
      return JSON.stringify(results);
    });

    // 2. Replace remaining ranges and single cells
    processed = processed.replace(/([A-Z]+[0-9]+:[A-Z]+[0-9]+)/g, (match) => JSON.stringify(getValues(match)));
    processed = processed.replace(/([A-Z]+[0-9]+)/g, (match) => JSON.stringify(getValues(match)));

    // 3. Execute logic
    const keys = Object.keys(spreadsheetFunctions);
    const vals = Object.values(spreadsheetFunctions);
    const result = new Function(...keys, `return ${processed}`)(...vals);

    // 4. DISPLAY FIX: If the result is an array (from FILTER), join it so it's a string
    return Array.isArray(result) ? result.join(", ") : result;

  } catch (e) {
    console.error("Formula Error:", e);
    return "#VALUE!";
  }
  };

  const parseCoordinate = (coord) => {
  const match = coord.match(/([A-Z]+)(\d+)/i);
  if (!match) return null;
  const colStr = match[1].toUpperCase();
  const rowNum = parseInt(match[2], 10) - 1;
  
  // Convert Column letters (A, B, AA) to index
  let colIdx = 0;
  for (let i = 0; i < colStr.length; i++) {
    colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { r: rowNum, c: colIdx - 1 };
  };

  const insertFormula = (funcName) => {
  // Define the fallback style inside the function
  const defaultCellStyle = {
    backgroundColor: '#ffffff',
    color: '#000000',
    textAlign: 'left',
    fontSize: '10',
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    verticalAlign: 'center',
    borderTop: '1px solid #e0e0e0',
    borderBottom: '1px solid #e0e0e0',
    borderLeft: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0'
  };

  const { rMin, rMax, cMin, cMax } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    rMax: Math.max(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
    cMax: Math.max(selection.start.c, selection.end.c),
  };

  const startRef = `${String.fromCharCode(65 + cMin)}${rMin + 1}`;
  const endRef = `${String.fromCharCode(65 + cMax)}${rMax + 1}`;
  const rangeRef = (rMin === rMax && cMin === cMax) ? startRef : `${startRef}:${endRef}`;

  const userRange = window.prompt(`Insert ${funcName} for range:`, rangeRef);
  if (userRange === null) return;

  const defaultTargetStr = `${String.fromCharCode(65 + cMin)}${rMax + 2}`;
  const userTarget = window.prompt(`Where should the result be placed? (Leave blank for ${defaultTargetStr})`, "");

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    
    // Parse target coordinates
    let targetCoords = userTarget ? parseCoordinate(userTarget) : null;
    const tR = targetCoords ? targetCoords.r : rMax + 1;
    const tC = targetCoords ? targetCoords.c : cMin;

    // 1. Expand Rows if target is below current grid
    while (tR >= sheet.grid.length) {
      const colWidth = sheet.grid[0].length;
      sheet.grid.push(Array(colWidth).fill(""));
      sheet.styleGrid.push(Array(colWidth).fill(null).map(() => ({ ...defaultCellStyle })));
      sheet.rowHeights.push(0.6);
    }

    // 2. Expand Columns if target is to the right of current grid
    while (tC >= sheet.grid[0].length) {
      sheet.grid.forEach((row, i) => {
        row.push("");
        sheet.styleGrid[i].push({ ...defaultCellStyle });
      });
      sheet.colWidths.push(2.5);
    }

    // 3. Inject Formula
    sheet.formulas[`${tR}_${tC}`] = `=${funcName}(${userRange})`;
    
    // 4. Update Selection to the new formula cell
    setSelection({ 
      start: { r: tR, c: tC }, 
      end: { r: tR, c: tC }, 
      active: false 
    });

    return recalculateSheet(ns, activeSheetIdx);
  });
  };

  const fileInputRef = useRef(null);
  const importODSInputRef = useRef(null);
  const importQSHEETInputRef = useRef(null);
  const currentSheet = sheets[activeSheetIdx];

  // --- HISTORY ---
  const pushHistory = (newState) => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(sheets))].slice(-20));
    setRedoStack([]);
    setSheets(newState);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(sheets))]);
    setHistory(prev => prev.slice(0, -1));
    setSheets(previous);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(sheets))]);
    setRedoStack(prev => prev.slice(0, -1));
    setSheets(next);
  };

  // --- SELECTION UTILS ---
  const getRange = () => {
    const rMin = Math.min(selection.start.r, selection.end.r);
    const rMax = Math.max(selection.start.r, selection.end.r);
    const cMin = Math.min(selection.start.c, selection.end.c);
    const cMax = Math.max(selection.start.c, selection.end.c);
    return { rMin, rMax, cMin, cMax };
  };

  const isInSelection = (r, c) => {
    const { rMin, rMax, cMin, cMax } = getRange();
    return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
  };

  const handleMouseDown = (r, c) => setSelection({ start: {r,c}, end: {r,c}, isSelecting: true });
  const handleMouseEnter = (r, c) => { if (selection.isSelecting) setSelection(prev => ({ ...prev, end: {r,c} })); };
  const handleMouseUp = () => setSelection(prev => ({ ...prev, isSelecting: false }));

  // --- SHEET MGMT ---
  const addNewSheet = () => {
    const name = prompt("Enter Sheet Name:", `Sheet${sheets.length + 1}`);
    if (name) {
      const newState = [...sheets, createEmptySheet(name)];
      pushHistory(newState);
      setActiveSheetIdx(newState.length - 1);
    }
  };

  const recalculateSheet = (allSheets, sheetIdx) => {
  const ns = [...allSheets];
  const sheet = ns[sheetIdx];
  
  // We perform multiple passes (e.g., 3-5) to allow chained dependencies to resolve.
  // For a more professional version, you'd use a Directed Acyclic Graph (DAG),
  // but for a React component, 3 passes handles most common chains (A->B->C).
  for (let pass = 0; pass < 3; pass++) {
    Object.keys(sheet.formulas).forEach(key => {
      const [r, c] = key.split('_').map(Number);
      const formula = sheet.formulas[key];
      
      // Calculate the result based on the current state of the grid
      const result = evaluateFormula(formula, sheet.grid);
      
      if (Array.isArray(result)) {
      // Fill the cell where the formula is with the first result
      sheet.grid[r][c] = String(result[0] || "");
      // Fill subsequent cells below
      result.slice(1).forEach((val, i) => {
        if (sheet.grid[r + i + 1]) {
          sheet.grid[r + i + 1][c] = String(val);
        }
      });
    } else {
      sheet.grid[r][c] = String(result);
    }

    });
  }
  return ns;
  };

  const handleCellShift = (action) => {
  const defaultCellStyle = {
    backgroundColor: '#ffffff',
    color: '#000000',
    textAlign: 'left',
    fontSize: '10',
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    verticalAlign: 'center',
    borderTop: '1px solid #e0e0e0',
    borderBottom: '1px solid #e0e0e0',
    borderLeft: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0'
  };

  // Helper to safely move formulas
  const moveFormula = (sheet, oldR, oldC, newR, newC) => {
    const oldKey = `${oldR}_${oldC}`;
    const newKey = `${newR}_${newC}`;
    if (sheet.formulas[oldKey]) {
      sheet.formulas[newKey] = sheet.formulas[oldKey];
      delete sheet.formulas[oldKey];
    } else {
      delete sheet.formulas[newKey];
    }
  };

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    const { r, c } = selection.start;
    
    // 1. INSERT CELL AND SHIFT RIGHT
    if (action === 'insert-right') {
      let colCount = sheet.grid[0].length;
      
      // CHECK: Is there data in the last column of this row?
      const lastVal = sheet.grid[r][colCount - 1];
      const lastFormula = sheet.formulas[`${r}_${colCount - 1}`];
      
      if (lastVal !== "" || lastFormula) {
        // EXPAND: Add a new column at the end (logic adapted from modifyStructure)
        const refIdx = colCount - 1;
        const widthSource = sheet.colWidths[refIdx];
        
        sheet.grid.forEach((row, i) => {
          row.push(""); // Add empty cell
          // Copy style from the previous last column to maintain formatting consistency
          sheet.styleGrid[i].push({ ...sheet.styleGrid[i][refIdx] }); 
        });
        sheet.colWidths.push(widthSource);
        
        // Update count because grid is now bigger
        colCount++;
      }

      // SHIFT: Move cells to the right
      for (let col = colCount - 1; col > c; col--) {
        sheet.grid[r][col] = sheet.grid[r][col - 1];
        sheet.styleGrid[r][col] = sheet.styleGrid[r][col - 1];
        moveFormula(sheet, r, col - 1, r, col);
      }
      
      // Clear the insertion point
      sheet.grid[r][c] = "";
      sheet.styleGrid[r][c] = { ...defaultCellStyle };
    } 
    
    // 2. INSERT CELL AND SHIFT DOWN
    else if (action === 'insert-down') {
      let rowCount = sheet.grid.length;
      
      // CHECK: Is there data in the last row of this column?
      const lastVal = sheet.grid[rowCount - 1][c];
      const lastFormula = sheet.formulas[`${rowCount - 1}_${c}`];
      
      if (lastVal !== "" || lastFormula) {
        // EXPAND: Add a new row at the end (logic adapted from modifyStructure)
        const refIdx = rowCount - 1;
        const heightSource = sheet.rowHeights[refIdx];
        const emptyRow = Array(sheet.grid[0].length).fill("");
        
        // Create style row based on the last row
        const styleSource = sheet.styleGrid[refIdx].map(st => ({ ...st }));
        
        sheet.grid.push(emptyRow);
        sheet.styleGrid.push(styleSource);
        sheet.rowHeights.push(heightSource);
        
        // Update count because grid is now bigger
        rowCount++;
      }

      // SHIFT: Move cells down
      for (let row = rowCount - 1; row > r; row--) {
        sheet.grid[row][c] = sheet.grid[row - 1][c];
        sheet.styleGrid[row][c] = sheet.styleGrid[row - 1][c];
        moveFormula(sheet, row - 1, c, row, c);
      }
      
      // Clear the insertion point
      sheet.grid[r][c] = "";
      sheet.styleGrid[r][c] = { ...defaultCellStyle };
    }

    // 3. DELETE (No expansion needed, just shift)
    else if (action === 'delete-left') {
      const colCount = sheet.grid[0].length;
      for (let col = c; col < colCount - 1; col++) {
        sheet.grid[r][col] = sheet.grid[r][col + 1];
        sheet.styleGrid[r][col] = sheet.styleGrid[r][col + 1];
        moveFormula(sheet, r, col + 1, r, col);
      }
      sheet.grid[r][colCount - 1] = "";
      sheet.styleGrid[r][colCount - 1] = { ...defaultCellStyle };
    }

    else if (action === 'delete-up') {
      const rowCount = sheet.grid.length;
      for (let row = r; row < rowCount - 1; row++) {
        sheet.grid[row][c] = sheet.grid[row + 1][c];
        sheet.styleGrid[row][c] = sheet.styleGrid[row + 1][c];
        moveFormula(sheet, row + 1, c, row, c);
      }
      sheet.grid[rowCount - 1][c] = "";
      sheet.styleGrid[rowCount - 1][c] = { ...defaultCellStyle };
    }

    return recalculateSheet(ns, activeSheetIdx);
  });
};

  const applyQuickFilter = () => {
  const columnLetter = window.prompt("Which column to filter by? (e.g., A)");
  const query = window.prompt("Show rows where value equals (Leave blank to clear):");
  
  if (!columnLetter) return;
  const colIdx = columnLetter.toUpperCase().charCodeAt(0) - 65;

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    
    if (query === "" || query === null) {
      sheet.hiddenRows = [];
      sheet.activeFilterCol = null; // Clear the icon
    } else {
      const newHiddenRows = [];
      sheet.grid.forEach((row, idx) => {
        const cellVal = row[colIdx].replace(/<[^>]*>/g, '').trim();
        if (cellVal !== query) {
          newHiddenRows.push(idx);
        }
      });
      sheet.hiddenRows = newHiddenRows;
      sheet.activeFilterCol = colIdx; // Set the icon location
    }
    return ns;
  });
  };

  const getConditionalStyle = (rIdx, cIdx, baseValue, rules) => {
  // Safety check: if rules is undefined or null, stop here
  if (!rules || !Array.isArray(rules) || rules.length === 0) return {};
  
  const textVal = String(baseValue || "").replace(/<[^>]*>/g, '').trim();
  const val = parseFloat(textVal);

  // Find rules for this specific column
  const activeRules = rules.filter(rule => rule.col === cIdx);
  
  let finalStyle = {};
  activeRules.forEach(rule => {
    let match = false;
    const target = isNaN(rule.value) ? rule.value : parseFloat(rule.value);

    switch (rule.operator) {
      case '>': match = val > target; break;
      case '<': match = val < target; break;
      case '=': match = (textVal === String(target)); break;
      case 'contains': match = textVal.includes(String(target)); break;
    }

    if (match) {
      finalStyle = { ...finalStyle, ...rule.style };
    }
  });

  return finalStyle;
  };

  const handleSaveRule = () => {
  const colIdx = newRule.col.toUpperCase().charCodeAt(0) - 65;
  if (isNaN(colIdx) || colIdx < 0) return alert("Invalid Column");

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    if (!sheet.conditionalRules) sheet.conditionalRules = [];
    
    sheet.conditionalRules.push({
      col: colIdx,
      operator: newRule.operator,
      value: newRule.value,
      style: { color: newRule.color, fontWeight: 'bold' }
    });
    return ns;
  });
  // Reset form
  setNewRule({ col: 'A', operator: '>', value: '', color: '#ff0000' });
  };

  const processReplacement = (scope = 'sheet', isSingular = false) => {
  const { find, replace, matchCase, matchWhole } = findParams;
  if (!find) return;

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    
    // Define bounds based on scope
    const rowStart = scope === 'selection' ? Math.min(selection.start.r, selection.end.r) : 0;
    const rowEnd = scope === 'selection' ? Math.max(selection.start.r, selection.end.r) : sheet.grid.length - 1;
    const colStart = scope === 'selection' ? Math.min(selection.start.c, selection.end.c) : 0;
    const colEnd = scope === 'selection' ? Math.max(selection.start.c, selection.end.c) : sheet.grid[0].length - 1;

    let matchCount = 0;

    // Create Regex for precise matching
    // \b represents word boundaries for "Whole Word"
    const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
    const pattern = matchWhole ? `\\b${escapedFind}\\b` : escapedFind;
    const regex = new RegExp(pattern, matchCase ? 'g' : 'gi');

    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        // If singular replace, only process the highlighted cell
        if (isSingular && (highlightedCell?.r !== r || highlightedCell?.c !== c)) continue;

        const key = `${r}_${c}`;
        const formula = sheet.formulas[key];
        const cellVal = String(sheet.grid[r][c] || "");

        if (formula && regex.test(formula)) {
          sheet.formulas[key] = formula.replace(regex, replace);
          matchCount++;
          if (isSingular) break;
        } else if (cellVal && regex.test(cellVal)) {
          sheet.grid[r][c] = cellVal.replace(regex, replace);
          matchCount++;
          if (isSingular) break;
        }
      }
    }

    if (!isSingular) alert(`Replaced ${matchCount} occurrences.`);
    return recalculateSheet(ns, activeSheetIdx);
  });

  if (isSingular) setTimeout(() => executeFind('next'), 10);
  };

  const executeFind = (direction = 'next') => {
  const sheet = sheets[activeSheetIdx];
  const { find, matchCase } = findParams;
  if (!find) return;

  let matches = [];
  sheet.grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      let val = String(cell);
      let formula = sheet.formulas[`${r}_${c}`] || "";
      let search = find;

      // If Match Case is OFF, convert everything to lowercase for comparison
      if (!matchCase) {
        val = val.toLowerCase();
        formula = formula.toLowerCase();
        search = search.toLowerCase();
      }

      if (val.includes(search) || formula.includes(search)) {
        matches.push({ r, c });
      }
    });
  });

  if (matches.length > 0) {
    let targetMatch;

    if (!highlightedCell) {
      // First time finding: start at beginning or end depending on direction
      targetMatch = direction === 'next' ? matches[0] : matches[matches.length - 1];
    } else {
      if (direction === 'next') {
        // Find first match after current highlight
        targetMatch = matches.find(m => m.r > highlightedCell.r || (m.r === highlightedCell.r && m.c > highlightedCell.c));
        if (!targetMatch) targetMatch = matches[0]; // Wrap to start
      } else {
        // Find last match before current highlight
        targetMatch = [...matches].reverse().find(m => m.r < highlightedCell.r || (m.r === highlightedCell.r && m.c < highlightedCell.c));
        if (!targetMatch) targetMatch = matches[matches.length - 1]; // Wrap to end
      }
    }

    setHighlightedCell(targetMatch);
    
    // Smooth scroll to the result
    const cellEl = document.querySelector(`[data-r="${targetMatch.r}"][data-c="${targetMatch.c}"]`);
    if (cellEl) cellEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    alert("No matches found.");
    setHighlightedCell(null);
  }
  };

  const handleCopy = (isCut = false) => {
    setClipboard(null); // Clear previous internal state immediately
  const { rMin, rMax, cMin, cMax } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    rMax: Math.max(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
    cMax: Math.max(selection.start.c, selection.end.c),
  };

  const sheet = sheets[activeSheetIdx];
  const copyData = [];
  const copyStyles = [];
  const copyFormulas = {};

  for (let r = rMin; r <= rMax; r++) {
    const rowData = [];
    const rowStyles = [];
    for (let c = cMin; c <= cMax; c++) {
      rowData.push(sheet.grid[r][c]);
      rowStyles.push({ ...sheet.styleGrid[r][c] });
      if (sheet.formulas[`${r}_${c}`]) {
        copyFormulas[`${r - rMin}_${c - cMin}`] = sheet.formulas[`${r}_${c}`];
      }
    }
    copyData.push(rowData);
    copyStyles.push(rowStyles);
  }

  setClipboard({
    data: copyData,
    styles: copyStyles,
    formulas: copyFormulas,
    isCut,
    sourceSheetIdx: activeSheetIdx, // Track origin for Cut
    sourceRange: { rMin, rMax, cMin, cMax }
  });
  };

  const executePaste = (mode = 'all') => {
  if (!clipboard) return;

  setSheets(prev => {
    let ns = JSON.parse(JSON.stringify(prev));
    const targetSheet = ns[activeSheetIdx];
    const { r: startR, c: startC } = selection.start;

    // 1. Apply Clipboard to Target
    clipboard.data.forEach((row, rOff) => {
      row.forEach((cellVal, cOff) => {
        const tR = startR + rOff;
        const tC = startC + cOff;

        if (tR < targetSheet.grid.length && tC < targetSheet.grid[0].length) {
          if (mode === 'all' || mode === 'values') {
            targetSheet.grid[tR][tC] = cellVal;
            const fKey = `${rOff}_${cOff}`;
            if (clipboard.formulas[fKey]) {
              targetSheet.formulas[`${tR}_${tC}`] = clipboard.formulas[fKey];
            } else {
              delete targetSheet.formulas[`${tR}_${tC}`];
            }
          }
          if (mode === 'all' || mode === 'format') {
            targetSheet.styleGrid[tR][tC] = { ...clipboard.styles[rOff][cOff] };
          }
        }
      });
    });

    // 2. Clear Source if it was a CUT operation
    if (clipboard.isCut) {
      const srcSheet = ns[clipboard.sourceSheetIdx];
      const { rMin, rMax, cMin, cMax } = clipboard.sourceRange;
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          srcSheet.grid[r][c] = "";
          delete srcSheet.formulas[`${r}_${c}`];
          // Optional: reset styles to default on cut
          // srcSheet.styleGrid[r][c] = {...defaultCellStyle}; 
        }
      }
      setClipboard(null); // Clear clipboard after cut-paste is finished
    }

    return recalculateSheet(ns, activeSheetIdx);
  });
  setShowPasteModal(false);
  };

  const handleClearAll = () => {
  const { rMin, rMax, cMin, cMax } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    rMax: Math.max(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
    cMax: Math.max(selection.start.c, selection.end.c),
  };

  const defaultStyle = {
    backgroundColor: '#ffffff',
    color: '#000000',
    textAlign: 'left',
    fontSize: '10',
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    verticalAlign: 'center',
    borderTop: '1px solid #e0e0e0',
    borderBottom: '1px solid #e0e0e0',
    borderLeft: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0'
  };

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        sheet.grid[r][c] = "";
        sheet.styleGrid[r][c] = { ...defaultStyle };
        delete sheet.formulas[`${r}_${c}`];
      }
    }
    return ns;
  });
  };

  const calculateNextValue = (val1, val2, stepIndex) => {
    const n1 = parseFloat(val1), n2 = parseFloat(val2);
    
    // 1. NUMBER LOGIC
    if (!isNaN(n1) && !isNaN(n2)) {
      const nextNum = n1 + (n2 - n1) * stepIndex;
      // Fix: Return as String to prevent .replace error
      return String(Number.isInteger(nextNum) ? nextNum : nextNum.toFixed(2));
    }

    // 2. DATE LOGIC
    const d1 = new Date(val1), d2 = new Date(val2);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const diff = d2.getTime() - d1.getTime();
      const nextDate = new Date(d1.getTime() + diff * stepIndex);
      
      // Check if original was ISO-like or just a date
      if (val1.includes('T') || val1.includes(':')) {
        return nextDate.toISOString(); // Return full DateTime string
      } else {
        return nextDate.toISOString().split('T')[0]; // Return just YYYY-MM-DD
      }
    }

    // 3. FALLBACK
    return stepIndex % 2 === 0 ? val1 : val2;
  };

  const handleAutoFill = (direction) => {
  const { rMin, rMax, cMin, cMax } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    rMax: Math.max(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
    cMax: Math.max(selection.start.c, selection.end.c)
  };

  const count = window.prompt("How many cells to fill?");
  if (!count || isNaN(count)) return;
  const numToFill = parseInt(count);

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];

    for (let i = 1; i <= numToFill; i++) {
      for (let c = cMin; c <= cMax; c++) {
        for (let r = rMin; r <= rMax; r++) {
          // Compare current cell with the one before it to get the step
          const val1 = sheet.grid[r][c];
          const val2 = (direction === 'down') 
            ? (r > 0 ? sheet.grid[r-1][c] : val1)
            : (c > 0 ? sheet.grid[r][c-1] : val1);

          const nextVal = calculateNextValue(val2, val1, i + 1);
          
          const targetR = (direction === 'down') ? rMax + i : r;
          const targetC = (direction === 'right') ? cMax + i : c;

          if (targetR < sheet.grid.length && targetC < sheet.grid[0].length) {
            sheet.grid[targetR][targetC] = String(nextVal);
            // Copy style from the last cell in selection
            sheet.styleGrid[targetR][targetC] = { ...sheet.styleGrid[rMax][cMax] };
          }
        }
      }
    }
    return ns;
  });
  };

  const renameSheet = () => {
    const name = prompt("Rename Sheet:", currentSheet.name);
    if(name) {
      const newSheets = JSON.parse(JSON.stringify(sheets));
      newSheets[activeSheetIdx].name = name;
      pushHistory(newSheets);
    }
  };

  const deleteSheet = () => {
    if(sheets.length <= 1) return;
    if(!window.confirm("Delete this sheet?")) return;
    const newSheets = sheets.filter((_, i) => i !== activeSheetIdx);
    pushHistory(newSheets);
    setActiveSheetIdx(0);
  };

  const resizeDimension = (type, delta) => {
    const newSheets = JSON.parse(JSON.stringify(sheets));
    const s = newSheets[activeSheetIdx];
    const { rMin, rMax, cMin, cMax } = getRange();

    if (type === 'row') {
      for(let i = rMin; i <= rMax; i++) {
        s.rowHeights[i] = Math.max(0.2, s.rowHeights[i] + delta);
      }
    } else {
      for(let i = cMin; i <= cMax; i++) {
        s.colWidths[i] = Math.max(0.5, s.colWidths[i] + delta);
      }
    }
    pushHistory(newSheets);
  };

  // --- STRUCTURE ---
  const modifyStructure = (type, action, position) => {
    const newSheets = JSON.parse(JSON.stringify(sheets));
    const s = newSheets[activeSheetIdx];
    const { rMin, cMin } = getRange(); 

    if (type === 'row') {
      if (action === 'add') {
        const refIdx = position === 'end' ? s.grid.length - 1 : rMin;
        const styleSource = s.styleGrid[refIdx].map(st => ({...st}));
        const heightSource = s.rowHeights[refIdx];
        const emptyRow = Array(s.grid[0].length).fill('');

        if (position === 'end') {
          s.grid.push(emptyRow); s.styleGrid.push(styleSource); s.rowHeights.push(heightSource);
        } else {
          const insertIdx = position === 'below' ? rMin + 1 : rMin;
          s.grid.splice(insertIdx, 0, emptyRow); s.styleGrid.splice(insertIdx, 0, styleSource); s.rowHeights.splice(insertIdx, 0, heightSource);
        }
      } else { 
        if (s.grid.length <= 1) return;
        const targetIdx = position === 'end' ? s.grid.length - 1 : rMin;
        s.grid.splice(targetIdx, 1); s.styleGrid.splice(targetIdx, 1); s.rowHeights.splice(targetIdx, 1);
      }
    } else { 
      if (action === 'add') {
        const refIdx = position === 'end' ? s.grid[0].length - 1 : cMin;
        const widthSource = s.colWidths[refIdx];
        if (position === 'end') {
          s.grid.forEach((row, i) => { row.push(''); s.styleGrid[i].push({...s.styleGrid[i][refIdx]}); });
          s.colWidths.push(widthSource);
        } else {
          const insertIdx = position === 'right' ? cMin + 1 : cMin;
          s.grid.forEach((row, i) => { row.splice(insertIdx, 0, ''); s.styleGrid[i].splice(insertIdx, 0, {...s.styleGrid[i][refIdx]}); });
          s.colWidths.splice(insertIdx, 0, widthSource);
        }
      } else { 
        if (s.grid[0].length <= 1) return;
        const targetIdx = position === 'end' ? s.grid[0].length - 1 : cMin;
        s.grid.forEach(row => row.splice(targetIdx, 1)); s.styleGrid.forEach(row => row.splice(targetIdx, 1)); s.colWidths.splice(targetIdx, 1);
      }
    }
    pushHistory(newSheets);
  };

  const duplicateStructure = (type) => {
  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    const { r, c } = selection.start;

    if (type === 'row') {
      // 1. Insert new row data structures
      const newRow = [...sheet.grid[r]];
      const newStyleRow = [...sheet.styleGrid[r]];
      
      sheet.grid.splice(r + 1, 0, newRow);
      sheet.styleGrid.splice(r + 1, 0, newStyleRow);
      sheet.rowHeights.splice(r + 1, 0, sheet.rowHeights[r]);

      // 2. Shift and Duplicate Formulas
      const newFormulas = {};
      Object.keys(sheet.formulas).forEach(key => {
        const [row, col] = key.split('_').map(Number);
        // If it's the row we are duplicating, create a copy for the new row
        if (row === r) {
          const originalFormula = sheet.formulas[key];
          // Simple logic: update row numbers in formula (e.g., A1 -> A2)
          const shiftedFormula = originalFormula.replace(/([A-Z]+)([0-9]+)/g, (m, colPart, rowPart) => {
             return colPart + (parseInt(rowPart) + 1);
          });
          newFormulas[`${row + 1}_${col}`] = shiftedFormula;
        }
        // Shift existing formulas that were below the insertion point
        if (row > r) {
           newFormulas[`${row + 1}_${col}`] = sheet.formulas[key];
        } else {
           newFormulas[key] = sheet.formulas[key];
        }
      });
      sheet.formulas = newFormulas;

    } else {
      // DUPLICATE COLUMN
      sheet.grid.forEach(row => row.splice(c + 1, 0, row[c]));
      sheet.styleGrid.forEach(row => row.splice(c + 1, 0, row[c]));
      sheet.colWidths.splice(c + 1, 0, sheet.colWidths[c]);

      // Shift and Duplicate Formulas for Column
      const newFormulas = {};
      Object.keys(sheet.formulas).forEach(key => {
        const [row, col] = key.split('_').map(Number);
        if (col === c) {
          const originalFormula = sheet.formulas[key];
          // Update column letters (e.g., A1 -> B1)
          const shiftedFormula = originalFormula.replace(/([A-Z]+)([0-9]+)/g, (m, colPart, rowPart) => {
             const nextChar = String.fromCharCode(colPart.charCodeAt(0) + 1);
             return nextChar + rowPart;
          });
          newFormulas[`${row}_${col + 1}`] = shiftedFormula;
        }
        if (col > c) {
           newFormulas[`${row}_${col + 1}`] = sheet.formulas[key];
        } else {
           newFormulas[key] = sheet.formulas[key];
        }
      });
      sheet.formulas = newFormulas;
    }

    const updated = recalculateSheet(ns, activeSheetIdx);
    pushHistory(updated);
    return updated;
  });
  };

  const swapRows = () => {
  const r1Raw = window.prompt("Enter the first row number to swap (e.g., 1):");
  const r2Raw = window.prompt("Enter the second row number to swap (e.g., 2):");
  
  const r1 = parseInt(r1Raw) - 1;
  const r2 = parseInt(r2Raw) - 1;

  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];

    // Validation
    if (isNaN(r1) || isNaN(r2) || r1 < 0 || r2 < 0 || r1 >= sheet.grid.length || r2 >= sheet.grid.length) {
      alert("Invalid row numbers.");
      return prev;
    }

    // 1. Swap Grid Data & Styles
    [sheet.grid[r1], sheet.grid[r2]] = [sheet.grid[r2], sheet.grid[r1]];
    [sheet.styleGrid[r1], sheet.styleGrid[r2]] = [sheet.styleGrid[r2], sheet.styleGrid[r1]];
    [sheet.rowHeights[r1], sheet.rowHeights[r2]] = [sheet.rowHeights[r2], sheet.rowHeights[r1]];

    // 2. Swap Formulas
    const newFormulas = { ...sheet.formulas };
    // Find all keys belonging to r1 or r2
    Object.keys(sheet.formulas).forEach(key => {
      const [r, c] = key.split('_').map(Number);
      if (r === r1) {
        newFormulas[`${r2}_${c}`] = sheet.formulas[key];
        delete newFormulas[key];
      } else if (r === r2) {
        newFormulas[`${r1}_${c}`] = sheet.formulas[key];
        delete newFormulas[key];
      }
    });
    sheet.formulas = newFormulas;

    return recalculateSheet(ns, activeSheetIdx);
  });
  };

  const swapCols = () => {
    const c1Raw = window.prompt("Enter the first column letter to swap (e.g., A):")?.toUpperCase();
    const c2Raw = window.prompt("Enter the second column letter to swap (e.g., B):")?.toUpperCase();

    // Convert A -> 0, B -> 1
    const c1 = c1Raw ? c1Raw.charCodeAt(0) - 65 : -1;
    const c2 = c2Raw ? c2Raw.charCodeAt(0) - 65 : -1;

    setSheets(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      const sheet = ns[activeSheetIdx];

      if (c1 < 0 || c2 < 0 || c1 >= sheet.colWidths.length || c2 >= sheet.colWidths.length) {
        alert("Invalid column letters.");
        return prev;
      }

      // 1. Swap Data & Styles in every row
      sheet.grid.forEach(row => {
        [row[c1], row[c2]] = [row[c2], row[c1]];
      });
      sheet.styleGrid.forEach(row => {
        [row[c1], row[c2]] = [row[c2], row[c1]];
      });
      
      // 2. Swap Column Widths
      [sheet.colWidths[c1], sheet.colWidths[c2]] = [sheet.colWidths[c2], sheet.colWidths[c1]];

      // 3. Swap Formulas
      const newFormulas = { ...sheet.formulas };
      Object.keys(sheet.formulas).forEach(key => {
        const [r, c] = key.split('_').map(Number);
        if (c === c1) {
          newFormulas[`${r}_${c2}`] = sheet.formulas[key];
          delete newFormulas[key];
        } else if (c === c2) {
          newFormulas[`${r}_${c1}`] = sheet.formulas[key];
          delete newFormulas[key];
        }
      });
      sheet.formulas = newFormulas;

      return recalculateSheet(ns, activeSheetIdx);
    });
  };

  const sortStructure = (dimension, criteria) => {
  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    const { r, c } = selection.start;

    // Helper to get raw data for comparison
    const getSortValue = (rIdx, cIdx) => {
      const cell = (sheet.grid[rIdx][cIdx] || "").replace(/<[^>]*>/g, '').trim();
      const style = sheet.styleGrid[rIdx][cIdx];
      
      if (criteria === 'bg') return style.backgroundColor || '#ffffff';
      if (criteria === 'text') return style.color || '#000000';
      return cell; 
    };

    // The logic to handle blanks and direction
    const compareValues = (a, b) => {
      let valA = a;
      let valB = b;

      // For A-Z / Z-A, we handle blank prioritization
      if (criteria === 'az' || criteria === 'za') {
        const isEmptyA = valA === "";
        const isEmptyB = valB === "";

        if (isEmptyA && isEmptyB) return 0;
        if (isEmptyA) return 1;  // A is empty, move it to the end
        if (isEmptyB) return -1; // B is empty, move it to the end

        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (criteria === 'za') {
        return valB.localeCompare(valA);
      }
      return valA.localeCompare(valB);
    };

    if (dimension === 'col') {
      const rowIndices = sheet.grid.map((_, i) => i);
      
      rowIndices.sort((idxA, idxB) => {
        const valA = getSortValue(idxA, c);
        const valB = getSortValue(idxB, c);
        return compareValues(valA, valB);
      });

      // Map sorted indices back to sheet data
      sheet.grid = rowIndices.map(i => sheet.grid[i]);
      sheet.styleGrid = rowIndices.map(i => sheet.styleGrid[i]);
      sheet.rowHeights = rowIndices.map(i => sheet.rowHeights[i]);
      
      // Update Formulas mapping
      const newFormulas = {};
      Object.keys(sheet.formulas).forEach(key => {
        const [oldR, oldC] = key.split('_').map(Number);
        const newR = rowIndices.indexOf(oldR);
        newFormulas[`${newR}_${oldC}`] = sheet.formulas[key];
      });
      sheet.formulas = newFormulas;

    } else {
      const colIndices = sheet.grid[0].map((_, i) => i);

      colIndices.sort((idxA, idxB) => {
        const valA = getSortValue(r, idxA);
        const valB = getSortValue(r, idxB);
        return compareValues(valA, valB);
      });

      sheet.grid = sheet.grid.map(row => colIndices.map(i => row[i]));
      sheet.styleGrid = sheet.styleGrid.map(row => colIndices.map(i => row[i]));
      sheet.colWidths = colIndices.map(i => sheet.colWidths[i]);

      const newFormulas = {};
      Object.keys(sheet.formulas).forEach(key => {
        const [oldR, oldC] = key.split('_').map(Number);
        const newC = colIndices.indexOf(oldC);
        newFormulas[`${oldR}_${newC}`] = sheet.formulas[key];
      });
      sheet.formulas = newFormulas;
    }

    return recalculateSheet(ns, activeSheetIdx);
  });
  };

  // --- STYLING (PARTIAL & CELL) ---
  const applyStyle = (command, val = null) => {
    // 1. Try Partial Selection (Rich Text)
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
       // Check if selection is inside our table
       let node = sel.anchorNode;
       while(node && node.nodeName !== 'TD') node = node.parentNode;
       if (node) {
         //document.execCommand(command, false, val);
         TextEditorEngine.execute(command, val, sel);
         // Update state with new HTML
         const r = parseInt(node.dataset.r);
         const c = parseInt(node.dataset.c);
         if (!isNaN(r) && !isNaN(c)) {
           const newSheets = JSON.parse(JSON.stringify(sheets));
           newSheets[activeSheetIdx].grid[r][c] = node.querySelector('.cell-content').innerHTML;
           pushHistory(newSheets);
           return; 
         }
       }
    }

    // 2. Fallback: Cell-Level Styles
    const newSheets = JSON.parse(JSON.stringify(sheets));
    const s = newSheets[activeSheetIdx];
    const { rMin, rMax, cMin, cMax } = getRange();

    for(let r=rMin; r<=rMax; r++){
      for(let c=cMin; c<=cMax; c++){
        const st = s.styleGrid[r][c];
        
        // Map commands to style props
        if(command === 'bold') st.fontWeight = st.fontWeight === 'bold' ? 'normal' : 'bold';
        if(command === 'italic') st.fontStyle = st.fontStyle === 'italic' ? 'normal' : 'italic';
        if(command === 'underline' || command === 'strikethrough') {
           const type = command === 'underline' ? 'underline' : 'line-through';
           let parts = st.textDecoration.split(' ').filter(p=>p);
           parts.includes(type) ? parts=parts.filter(p=>p!==type) : parts.push(type);
           st.textDecoration = parts.join(' ');
        }
        if(command === 'foreColor') st.color = val;
        if(command === 'hiliteColor') st.backgroundColor = val;
        if(command === 'fontName') st.fontFamily = val;
        if(command === 'fontSize') st.fontSize = val;
        if(command === 'justifyLeft') st.textAlign = 'left';
        if(command === 'justifyCenter') st.textAlign = 'center';
        if(command === 'justifyRight') st.textAlign = 'right';
        if(command === 'justifyFull') st.textAlign = 'justify';
        
        // Vertical Align
        if(command === 'verticalAlign') st.verticalAlign = val;
      }
    }
    pushHistory(newSheets);
  };

  // --- BORDERS ---
  const applyBorder = () => {
    const newSheets = JSON.parse(JSON.stringify(sheets));
    const s = newSheets[activeSheetIdx];
    const { rMin, rMax, cMin, cMax } = getRange();
    const borderStr = `1px solid ${borderColorPicker}`;

    for(let r=rMin; r<=rMax; r++){
      for(let c=cMin; c<=cMax; c++){
        const st = s.styleGrid[r][c];
        const isTop = r === rMin;
        const isBottom = r === rMax;
        const isLeft = c === cMin;
        const isRight = c === cMax;

        if (borderMode === 'none') {
           st.borderTop = st.borderBottom = st.borderLeft = st.borderRight = '';
        } else if (borderMode === 'all') {
           st.borderTop = st.borderBottom = st.borderLeft = st.borderRight = borderStr;
        } else if (borderMode === 'outer') {
           if(isTop) st.borderTop = borderStr;
           if(isBottom) st.borderBottom = borderStr;
           if(isLeft) st.borderLeft = borderStr;
           if(isRight) st.borderRight = borderStr;
        } else if (borderMode === 'left') st.borderLeft = borderStr;
        else if (borderMode === 'right') st.borderRight = borderStr;
        else if (borderMode === 'top') st.borderTop = borderStr;
        else if (borderMode === 'bottom') st.borderBottom = borderStr;
      }
    }
    pushHistory(newSheets);
  };

  // --- IMAGES & MERGE ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const newSheets = JSON.parse(JSON.stringify(sheets));
      const key = `${selection.start.r}_${selection.start.c}`;
      newSheets[activeSheetIdx].images[key] = evt.target.result;
      pushHistory(newSheets);
    };
    reader.readAsDataURL(file);
  };

  const toggleMerge = () => {
    const { rMin, rMax, cMin, cMax } = getRange();
    if (rMin === rMax && cMin === cMax) return; 
    const newSheets = JSON.parse(JSON.stringify(sheets));
    const s = newSheets[activeSheetIdx];
    const key = `${rMin}_${cMin}`;
    if (s.merges[key]) delete s.merges[key];
    else {
      s.merges[key] = { rSpan: rMax - rMin + 1, cSpan: cMax - cMin + 1 };
      for(let r=rMin; r<=rMax; r++){
        for(let c=cMin; c<=cMax; c++){
          if(r!==rMin || c!==cMin) s.grid[r][c] = '';
        }
      }
    }
    pushHistory(newSheets);
  };

  const handleImport = (e, manualFile = null) => {
  //const file = e.target.files[0];
  const file = manualFile || (e.target && e.target.files[0]);
  if (!file) return;
  const reader = new FileReader();

  reader.onload = async (evt) => {
    try {
      const zip = await JSZip.loadAsync(evt.target.result);
      const content = await zip.file("content.xml").async("text");
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");

      const styleMap = {};
      const colWidthMap = {};
      const rowHeightMap = {};
      const cmToPx = 37.795;
      
      const DEFAULT_STYLE = { 
          fontWeight: 'normal', fontSize: 10, textAlign: 'left', 
          backgroundColor: '#ffffff', color: '#000000', 
          borderTop: '1px solid #dee2e6', verticalAlign: 'middle', 
          textDecoration: '' 
      };

      const getAlign = (val) => {
        if (val === 'end' || val === 'right') return 'right';
        if (val === 'center') return 'center';
        if (val === 'justify') return 'justify';
        return 'left';
      };

      const autoStyles = xmlDoc.getElementsByTagName("office:automatic-styles")[0];
      if (autoStyles) {
        Array.from(autoStyles.getElementsByTagName("style:style")).forEach(s => {
          const name = s.getAttribute("style:name");
          const family = s.getAttribute("style:family");
          const tp = s.getElementsByTagName("style:text-properties")[0];
          const cp = s.getElementsByTagName("style:table-cell-properties")[0];
          const pp = s.getElementsByTagName("style:paragraph-properties")[0];

          if (family === "table-column") {
            const val = s.getElementsByTagName("style:table-column-properties")[0]?.getAttribute("style:column-width");
            colWidthMap[name] = val ? parseFloat(val) : 2.5;
          } else if (family === "table-row") {
            const val = s.getElementsByTagName("style:table-row-properties")[0]?.getAttribute("style:row-height");
            rowHeightMap[name] = val ? parseFloat(val) : 0.5;
          }

          styleMap[name] = {
            color: tp?.getAttribute("fo:color") || "#000000",
            fontFamily: tp?.getAttribute("style:font-name") || "Arial",
            fontWeight: tp?.getAttribute("fo:font-weight") || "normal",
            fontStyle: tp?.getAttribute("fo:font-style") || "normal",
            fontSize: parseInt(tp?.getAttribute("fo:font-size")) || 10,
            backgroundColor: cp?.getAttribute("fo:background-color") || "#ffffff",
            verticalAlign: cp?.getAttribute("style:vertical-align") || "middle",
            textAlign: getAlign(pp?.getAttribute("fo:text-align")),
            borderTop: cp?.getAttribute("fo:border") || cp?.getAttribute("fo:border-top")?.replace('0.06pt', '1px') || "1px solid #dee2e6",
            textDecoration: [
              tp?.getAttribute("style:text-underline-style") === "solid" ? "underline" : "",
              tp?.getAttribute("style:text-line-through-style") === "solid" ? "line-through" : ""
            ].filter(Boolean).join(" ")
          };
        });
      }

      const tables = xmlDoc.getElementsByTagName("table:table");
      const importedSheets = [];

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const rows = Array.from(table.getElementsByTagName("table:table-row"));
        let maxReachedCol = 0;
        const newMerges = {}, newImages = {}, newFormulas = {}, occupied = new Set();
        const tempGrid = [];
        const tempStyleGrid = [];
        const rowHeights = [];

        for (let r = 0; r < rows.length; r++) {
          rowHeights.push(rowHeightMap[rows[r].getAttribute("table:style-name")] || 0.5);
          const cells = rows[r].getElementsByTagName("table:table-cell");
          let cIdx = 0, xmlIdx = 0;
          tempGrid[r] = [];
          tempStyleGrid[r] = [];

          while (xmlIdx < cells.length) {
            if (occupied.has(`${r}_${cIdx}`)) { cIdx++; continue; }
            const cell = cells[xmlIdx];
            const rSpan = parseInt(cell.getAttribute("table:number-rows-spanned") || "1");
            const cSpan = parseInt(cell.getAttribute("table:number-columns-spanned") || "1");
            const sName = cell.getAttribute("table:style-name");

            const formulaAttr = cell.getAttribute("table:formula");
            if (formulaAttr) {
              let clean = formulaAttr.replace(/^of:=/, '').replace(/\[\.?/g, '').replace(/\]/g, '').replace(/:\./g, ':');
              newFormulas[`${r}_${cIdx}`] = "=" + clean;
            }

            const val = cell.getElementsByTagName("text:p")[0]?.textContent || "";
            const drawImg = cell.getElementsByTagName("draw:image")[0];

            if (val || drawImg || formulaAttr) maxReachedCol = Math.max(maxReachedCol, cIdx + cSpan);

            if (drawImg) {
              const imgPath = drawImg.getAttribute("xlink:href").replace(/^\.\//, "");
              const b64 = await zip.file(imgPath)?.async("base64");
              if (b64) newImages[`${r}_${cIdx}`] = `data:image/png;base64,${b64}`;
            }

            tempGrid[r][cIdx] = val;
            tempStyleGrid[r][cIdx] = styleMap[sName] || { ...DEFAULT_STYLE };

            if (rSpan > 1 || cSpan > 1) {
              newMerges[`${r}_${cIdx}`] = { rSpan, cSpan };
              for (let mr = 0; mr < rSpan; mr++) for (let mc = 0; mc < cSpan; mc++) if (mr !== 0 || mc !== 0) occupied.add(`${r + mr}_${cIdx + mc}`);
            }
            cIdx += cSpan; xmlIdx++;
          }
        }

        const importedCharts = [];
        const shapes = table.getElementsByTagName("table:shapes")[0];
        if (shapes) {
          const frames = Array.from(shapes.getElementsByTagName("draw:frame"));
          for (const frame of frames) {
            const drawImg = frame.getElementsByTagName("draw:image")[0];
            const imgPath = drawImg?.getAttribute("xlink:href")?.replace(/^\.\//, "");
            if (imgPath) {
              const b64 = await zip.file(imgPath)?.async("base64");
              importedCharts.push({
                id: `imported_${Date.now()}_${Math.random()}`,
                x: parseFloat(frame.getAttribute("svg:x") || "0") * cmToPx,
                y: parseFloat(frame.getAttribute("svg:y") || "0") * cmToPx,
                width: parseFloat(frame.getAttribute("svg:width") || "10") * cmToPx,
                height: parseFloat(frame.getAttribute("svg:height") || "7") * cmToPx,
                base64Image: b64 ? `data:image/png;base64,${b64}` : null,
                isImported: true,
                config: null
              });
            }
          }
        }

        const finalCLen = Math.max(maxReachedCol, 1); 
        const finalGrid = tempGrid.map(row => {
          const r = [...row];
          while (r.length < finalCLen) r.push("");
          return r.slice(0, finalCLen);
        });
        const finalStyleGrid = tempStyleGrid.map(row => {
          const r = [...row];
          while (r.length < finalCLen) r.push({ ...DEFAULT_STYLE });
          return r.slice(0, finalCLen);
        });

        importedSheets.push({
          name: table.getAttribute("table:name") || `Sheet${i + 1}`,
          grid: finalGrid, styleGrid: finalStyleGrid,
          colWidths: Array(finalCLen).fill(2.5),
          rowHeights: rowHeights,
          merges: newMerges, images: newImages, formulas: newFormulas, charts: importedCharts 
        });
      }
      setSheets(importedSheets);
      setActiveSheetIdx(0);
      setProjectName(file.name.replace(/\.[^/.]+$/, ""));
    } catch (err) { console.error(err); }
  };
  reader.readAsArrayBuffer(file);
};

  const exportToOds = async (mode = 'download') => {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet", { compression: "STORE" });

  const ns = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"`;

  const mapAlign = (a) => a === 'right' ? 'end' : a === 'center' ? 'center' : 'start';
  const sanitizeBorder = (b) => (!b || b.includes('none') || b.includes('transparent')) ? '0.06pt solid #dee2e6' : b.replace('1px', '0.06pt');

  // SAFEGUARD: Default style to prevent crashes on sparse grids
  const SAFE_STYLE = {
    backgroundColor: "#ffffff", color: "#000000", fontSize: 10,
    fontWeight: "normal", fontStyle: "normal", textAlign: "left",
    verticalAlign: "middle", borderTop: "1px solid #dee2e6", textDecoration: ""
  };

  // --- 1. GENERATE STYLES ---
  let autoStylesXml = `<office:automatic-styles>`;
  autoStylesXml += `<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="middle"/></style:style>`;

  sheets.forEach((sh, sIdx) => {
    // We use a regular for loop to handle sparse arrays safely
    for(let rIdx = 0; rIdx < sh.styleGrid.length; rIdx++) {
       const row = sh.styleGrid[rIdx] || [];
       for(let cIdx = 0; cIdx < row.length; cIdx++) {
          // KEY FIX: Fallback to SAFE_STYLE if the cell style is null/undefined
          const s = row[cIdx] || SAFE_STYLE; 
          
          autoStylesXml += `
          <style:style style:name="ce_${sIdx}_${rIdx}_${cIdx}" style:family="table-cell">
            <style:table-cell-properties fo:background-color="${s.backgroundColor || '#ffffff'}" fo:border="${sanitizeBorder(s.borderTop)}" style:vertical-align="${s.verticalAlign || 'middle'}"/>
            <style:paragraph-properties fo:text-align="${mapAlign(s.textAlign)}"/>
            <style:text-properties fo:color="${s.color || '#000000'}" fo:font-size="${s.fontSize || 10}pt" fo:font-weight="${s.fontWeight}" fo:font-style="${s.fontStyle}" 
              ${s.textDecoration?.includes('underline') ? 'style:text-underline-style="solid"' : ''} 
              ${s.textDecoration?.includes('line-through') ? 'style:text-line-through-style="solid"' : ''} 
            />
          </style:style>`;
       }
    }

    sh.colWidths.forEach((w, i) => autoStylesXml += `<style:style style:name="co_${sIdx}_${i}" style:family="table-column"><style:table-column-properties style:column-width="${w}cm"/></style:style>`);
    sh.rowHeights.forEach((h, i) => autoStylesXml += `<style:style style:name="ro_${sIdx}_${i}" style:family="table-row"><style:table-row-properties style:row-height="${h}cm"/></style:style>`);
  });
  autoStylesXml += `</office:automatic-styles>`;

  // --- 2. GENERATE BODY ---
  let bodyXml = `<office:body><office:spreadsheet>`;
  const pics = zip.folder("Pictures");
  let manifest = `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`;

  sheets.forEach((sh, sIdx) => {
    bodyXml += `<table:table table:name="${sh.name}">`;
    sh.colWidths.forEach((_, cIdx) => bodyXml += `<table:table-column table:style-name="co_${sIdx}_${cIdx}"/>`);
    
    const occupied = new Set();
    sh.grid.forEach((row, rIdx) => {
      bodyXml += `<table:table-row table:style-name="ro_${sIdx}_${rIdx}">`;
      row.forEach((val, cIdx) => {
        if (occupied.has(`${rIdx}_${cIdx}`)) {
          bodyXml += `<table:covered-table-cell/>`;
          return;
        }

        const key = `${rIdx}_${cIdx}`;
        const merge = sh.merges[key];
        const formula = sh.formulas[key];
        
        if (merge) {
          for (let mr = 0; mr < merge.rSpan; mr++) 
            for (let mc = 0; mc < merge.cSpan; mc++) 
              if (mr !== 0 || mc !== 0) occupied.add(`${rIdx + mr}_${cIdx + mc}`);
        }

        let typeAttr = "";
        let valAttr = "";

        if (formula) {
           let math = formula.replace(/^=/, '').trim();
           math = math.replace(/([A-Z]+[0-9]+):([A-Z]+[0-9]+)/g, '[.$1:.$2]');
           math = math.replace(/(?<![:\.])([A-Z]+[0-9]+)(?![:\.])/g, '[.$1]');
           typeAttr = `table:formula="of:=${math}" office:value-type="float" office:value="0"`;
        } else {
           // --- KEY FIX: Detect Numbers ---
           const isNum = !isNaN(Number(val)) && val !== "" && String(val).trim() !== "";
           if (isNum) {
             typeAttr = `office:value-type="float" office:value="${val}"`;
           } else {
             typeAttr = `office:value-type="string"`;
           }
        }

        bodyXml += `<table:table-cell table:style-name="ce_${sIdx}_${rIdx}_${cIdx}" 
          ${merge ? `table:number-columns-spanned="${merge.cSpan}" table:number-rows-spanned="${merge.rSpan}"` : ''} 
          ${typeAttr}>`;

        if (sh.images[key]) {
          const iname = `img_${sIdx}_${rIdx}_${cIdx}.png`;
          pics.file(iname, base64ToArrayBuffer(sh.images[key]));
          manifest += `<manifest:file-entry manifest:full-path="Pictures/${iname}" manifest:media-type="image/png"/>`;
          bodyXml += `<draw:frame draw:style-name="gr1" svg:width="2cm" svg:height="1cm" table:anchor-type="cell"><draw:image xlink:href="Pictures/${iname}" xlink:type="simple"/></draw:frame>`;
        }

        bodyXml += `<text:p>${val}</text:p></table:table-cell>`;
      });
      bodyXml += `</table:table-row>`;
    });

    if (sh.charts?.length > 0) {
      bodyXml += `<table:shapes>`;
      sh.charts.forEach((chart, cIdx) => {
        const imgName = `chart_${sIdx}_${cIdx}.png`;
        pics.file(imgName, base64ToArrayBuffer(chart.base64Image));
        manifest += `<manifest:file-entry manifest:full-path="Pictures/${imgName}" manifest:media-type="image/png"/>`;
        const pxToCm = 0.026458;
        bodyXml += `<draw:frame draw:name="Chart" draw:style-name="gr1" svg:width="${(chart.width * pxToCm).toFixed(2)}cm" svg:height="${(chart.height * pxToCm).toFixed(2)}cm" svg:x="${(chart.x * pxToCm).toFixed(2)}cm" svg:y="${(chart.y * pxToCm).toFixed(2)}cm" table:anchor-type="paragraph"><draw:image xlink:href="Pictures/${imgName}" xlink:type="simple"/></draw:frame>`;
      });
      bodyXml += `</table:shapes>`;
    }

    bodyXml += `</table:table>`;
  });

  bodyXml += `</office:spreadsheet></office:body>`;
  zip.file("content.xml", `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}>${autoStylesXml}${bodyXml}</office:document-content>`);
  zip.folder("META-INF").file("manifest.xml", `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">${manifest}</manifest:manifest>`);
  
  return await zip.generateAsync({ type: "blob" });
};

// --- HELPER FOR IMAGE EXPORT ---
const base64ToArrayBuffer = (base64) => {
    // Safety check: if it's not a string or doesn't contain the data header, return empty
    if (typeof base64 !== 'string' || !base64.includes(',')) {
        console.error("Invalid base64 string provided to exporter:", base64);
        return new ArrayBuffer(0);
    }
    
    const parts = base64.split(',');
    const binaryString = window.atob(parts[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const exportToPDF = () => {
  const sheet = sheets[activeSheetIdx];
  
  // Use the state variable for orientation
  // 'p' = Portrait (8.5x11), 'l' = Landscape (11x8.5)
  const doc = new jsPDF(pdfOrientation, 'pt', 'a4');

  const isRangeSelected = selection.start.r !== selection.end.r || selection.start.c !== selection.end.c;
  
  const rMin = isRangeSelected ? Math.min(selection.start.r, selection.end.r) : 0;
  const rMax = isRangeSelected ? Math.max(selection.start.r, selection.end.r) : sheet.grid.length - 1;
  const cMin = isRangeSelected ? Math.min(selection.start.c, selection.end.c) : 0;
  const cMax = isRangeSelected ? Math.max(selection.start.c, selection.end.c) : sheet.grid[0].length - 1;

  const headers = [['', ...Array.from({ length: cMax - cMin + 1 }, (_, i) => String.fromCharCode(65 + cMin + i))]];

  const bodyData = [];
  for (let r = rMin; r <= rMax; r++) {
    const rowData = [r + 1];
    for (let c = cMin; c <= cMax; c++) {
      rowData.push(sheet.grid[r][c]);
    }
    bodyData.push(rowData);
  }

  autoTable(doc, {
    head: headers,
    body: bodyData,
    startY: 50,
    styles: { 
      fontSize: pdfOrientation === 'p' ? 7 : 9, // Auto-shrink font slightly for Portrait
      cellPadding: 2 
    },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index > 0) {
        const gridR = rMin + data.row.index;
        const gridC = cMin + data.column.index - 1;
        const style = sheet.styleGrid[gridR][gridC];
        if (style) {
          if (style.backgroundColor && style.backgroundColor !== '#ffffff') {
            data.cell.styles.fillColor = style.backgroundColor;
          }
          data.cell.styles.textColor = style.color || '#000000';
          data.cell.styles.halign = style.textAlign || 'left';
          if (style.fontWeight === 'bold') data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      doc.setFontSize(12);
      doc.text(`Sheet: ${sheet.name}${isRangeSelected ? ' (Selection)' : ''}`, 40, 35);
    }
  });

  //doc.save(`${sheet.name}_${pdfOrientation === 'p' ? 'portrait' : 'landscape'}.pdf`);
  return doc.output('blob');
};

const exportToCSV = () => {
  // We export the active sheet
  const activeSheet = sheets[activeSheetIdx];
  if (!activeSheet || !activeSheet.grid) return null;

  const csvRows = activeSheet.grid.map(row => {
    return row.map(cellValue => {
      if (!cellValue) return '""';
      
      // A. Strip raw HTML formatting tags/spans back to standard plain-text strings
      const doc = new DOMParser().parseFromString(cellValue, 'text/html');
      let cleanText = doc.body.textContent || doc.body.innerText || cellValue;
      
      // B. Escape internal quotes and wrap value inside absolute quotes
      cleanText = cleanText.replace(/"/g, '""');
      return `"${cleanText}"`;
    }).join(',');
  });

  const csvContent = csvRows.join('\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
};

const clearAllFilters = () => {
  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    ns[activeSheetIdx].hiddenRows = [];
    ns[activeSheetIdx].activeFilterCol = null;
    return ns;
  });
};

const generateChartJsonFromSelection = () => {
  const sheet = sheets[activeSheetIdx];
  const { rMin, rMax, cMin, cMax } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    rMax: Math.max(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
    cMax: Math.max(selection.start.c, selection.end.c),
  };

  const numCols = cMax - cMin + 1;
  const numRows = rMax - rMin + 1;

  // Helper for Colors
  const getColor = (index, alpha = 0.6) => {
    const colors = [
      `rgba(54, 162, 235, ${alpha})`, // Blue
      `rgba(255, 99, 132, ${alpha})`, // Red
      `rgba(255, 206, 86, ${alpha})`, // Yellow
      `rgba(75, 192, 192, ${alpha})`, // Green
      `rgba(153, 102, 255, ${alpha})`, // Purple
      `rgba(255, 159, 64, ${alpha})`  // Orange
    ];
    return colors[index % colors.length];
  };

  // SMART HEADER DETECTION
  // Check the cell in the first row, second column of selection (or first col if only 1 col selected)
  // If it is NOT a number, we assume the user selected a Header Row.
  const sampleValueCell = sheet.grid[rMin][Math.min(cMin + 1, cMax)];
  const isHeaderRow = isNaN(parseFloat(sampleValueCell));

  // If header exists, start data loop from rMin + 1. If not, start from rMin.
  const startRow = isHeaderRow ? rMin + 1 : rMin;

  // --- CASE 1: 2 COLUMNS (Label | Value) ---
  // e.g. | Product | Sales | 
  //      | Apple   | 10    |
  if (numCols === 2) {
    const dataArray = [];
    
    // Determine Series Name
    // If header exists, use the text in top right cell (e.g. "Sales"). Else "Data".
    const seriesLabel = isHeaderRow ? sheet.grid[rMin][cMin + 1] : "Series 1";

    for (let r = startRow; r <= rMax; r++) {
      const label = sheet.grid[r][cMin] || `Row ${r + 1}`;
      const value = parseFloat(sheet.grid[r][cMin + 1]) || 0;
      
      dataArray.push({
        label: label,
        value: value,
        color: getColor(r - startRow), // Vary colors for Pie/Doughnut
        gradient: "linear"
      });
    }

    // Return Structure for Single Dataset
    return {
      title: chartTitle || seriesLabel,
      type: chartType, 
      data: dataArray 
    };
  }

  // --- CASE 2: MULTI-COLUMN (Grouped Bar / Line) ---
  // e.g. | Region | 2023 | 2024 |
  //      | North  | 100  | 150  |
  else {
    const labels = [];
    const series = [];

    // 1. GENERATE SERIES DEFINITIONS
    for (let c = cMin + 1; c <= cMax; c++) {
      // If header exists, use the top cell as name (e.g. "2023"). Else "Series X".
      const sName = isHeaderRow 
        ? (sheet.grid[rMin][c] || `Series ${c - cMin}`)
        : `Series ${c - cMin}`;

      series.push({
        label: sName,
        values: [],
        color: getColor(c - cMin - 1),
        gradient: "linear"
      });
    }

    // 2. FILL DATA
    for (let r = startRow; r <= rMax; r++) {
      // Capture X-Axis Label (First Column of selection)
      labels.push(sheet.grid[r][cMin] || `Row ${r + 1}`);
      
      // Capture Values for each series
      series.forEach((s, idx) => {
        const val = parseFloat(sheet.grid[r][cMin + 1 + idx]) || 0;
        s.values.push(val);
      });
    }

    return {
      title: chartTitle,
      type: chartType === 'pie' ? 'bar' : chartType, // Pie doesn't work well with multi-series, fallback to bar
      labels: labels,
      series: series
    };
  }
};

const handleCreateChart = () => {
  // Call the new method to get the JSON config
  const newChartConfig = generateChartJsonFromSelection(); 

  const sheet = sheets[activeSheetIdx];
  const { rMin, cMin } = {
    rMin: Math.min(selection.start.r, selection.end.r),
    cMin: Math.min(selection.start.c, selection.end.c),
  };

  // Calculate pixel placement (Assuming 40px height and 100px width defaults)
  const top = sheet.rowHeights.slice(0, rMin).reduce((a, b) => a + (b * 40), 0);
  const left = sheet.colWidths.slice(0, cMin).reduce((a, b) => a + (b * 40), 0);

  const chartObject = {
    id: Date.now(),
    x: left,
    y: top,
    width: 450,
    height: 300,
    config: newChartConfig
  };

  setSheets(prev => {
    const ns = [...prev];
    ns[activeSheetIdx].charts = [...(ns[activeSheetIdx].charts || []), chartObject];
    return ns;
  });
  
  setShowChartModal(false);
};

const handleDeleteChart = (chartId) => {
  setSheets(prev => {
    const ns = JSON.parse(JSON.stringify(prev));
    const sheet = ns[activeSheetIdx];
    // Filter out the chart with the matching ID
    sheet.charts = sheet.charts.filter(c => c.id !== chartId);
    return ns;
  });
};

const handleChartImageCapture = (chartTitle, base64) => {
  setSheets(prev => {
    const newSheets = [...prev];
    const currentSheet = newSheets[activeSheetIdx];
    // Use ?. to safely access title, or check if config exists
    const chart = currentSheet.charts.find(c => c.config?.title === chartTitle);
    
    if (chart) {
      chart.base64Image = base64; 
    }
    return newSheets;
  });
};

const exportToQSheet = async (mode = 'save') => {
  const zip = new JSZip();
  
  // 1. Process Sheets and Extract Assets
  const sheetsData = sheets.map((sh, sIdx) => {
    const sheetCopy = { ...sh };
    sheetCopy.images = { ...sh.images };
    sheetCopy.charts = sh.charts.map(c => ({ ...c }));

    // Extract Cell Images
    Object.keys(sheetCopy.images).forEach(key => {
      const b64 = sheetCopy.images[key];
      if (b64 && b64.startsWith('data:')) {
        const fileName = `cell_s${sIdx}_${key}.png`;
        zip.folder("assets").file(fileName, base64ToArrayBuffer(b64));
        sheetCopy.images[key] = `assets/${fileName}`;
      }
    });

    // Extract Chart Images
    sheetCopy.charts.forEach((chart, cIdx) => {
      if (chart.base64Image && chart.base64Image.startsWith('data:')) {
        const fileName = `chart_s${sIdx}_c${cIdx}.png`;
        zip.folder("assets").file(fileName, base64ToArrayBuffer(chart.base64Image));
        sheetCopy.charts[cIdx].base64Image = `assets/${fileName}`;
      }
    });

    return sheetCopy;
  });

  // 2. Add manifest and internal structure
  zip.file("data.json", JSON.stringify({
    version: "1.0",
    projectName: projectName,
    timestamp: new Date().toISOString(),
    sheets: sheetsData
  }));

  // 3. Generate the ZIP as a Blob
  try {
    return await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    // 4. Force download with .qsheet extension
    // if (mode === 'save' && onSave) {
    //   onSave(content, projectName, '.qsheet');
    // } else if (onDownload) {
    //   onDownload(content, projectName, '.qsheet');
    // }
  } catch (err) {
    console.error("Export failed", err);
  }
};

const handleQSheetImport = async (e, manualFile = null) => {
  //const file = e.target.files[0];
  const file = manualFile || (e.target && e.target.files[0]);
  if (!file) return;

  try {
    const zip = await JSZip.loadAsync(file);
    const jsonStr = await zip.file("data.json").async("text");
    const container = JSON.parse(jsonStr);
    
    // Support both old direct arrays and new container format
    const importedSheets = container.sheets || container;
    if (container.projectName) setProjectName(container.projectName);

    for (let sIdx = 0; sIdx < importedSheets.length; sIdx++) {
      const sh = importedSheets[sIdx];

      // Restore Cell Images
      for (const key of Object.keys(sh.images)) {
        if (sh.images[key]?.startsWith("assets/")) {
          const b64 = await zip.file(sh.images[key]).async("base64");
          sh.images[key] = `data:image/png;base64,${b64}`;
        }
      }

      // Restore Chart Images
      for (let cIdx = 0; cIdx < sh.charts.length; cIdx++) {
        const chart = sh.charts[cIdx];
        if (chart.base64Image?.startsWith("assets/")) {
          const b64 = await zip.file(chart.base64Image).async("base64");
          chart.base64Image = `data:image/png;base64,${b64}`;
        }
      }
    }

    setSheets(importedSheets);
    setActiveSheetIdx(0);
  } catch (err) {
    console.error("Import failed", err);
    alert("Invalid .qsheet file");
  }
};

const handleCSVImport = async (e, manualFile = null) => {
  const file = manualFile || (e.target && e.target.files[0]);
  if (!file) return;

  try {
    const textContent = await file.text();
    
    // Quick CSV tokenizer regex matching items inside/outside absolute quotes safely
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'; // Escaped quote
            i++;
          } else {
            inQuotes = !inQuotes; // Toggle quote block
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };

    const lines = textContent.split(/\r?\n/);
    const grid = [];
    let maxCols = 1;

    lines.forEach(line => {
      if (!line.trim()) return; // Skip trailing lines
      const rowCells = parseCSVLine(line);
      if (rowCells.length > maxCols) maxCols = rowCells.length;
      grid.push(rowCells);
    });

    // Match your workspace architecture configuration defaults
    const DEFAULT_STYLE = { 
      fontWeight: 'normal', fontSize: 10, textAlign: 'left', 
      backgroundColor: '#ffffff', color: '#000000', 
      borderTop: '1px solid #dee2e6', verticalAlign: 'middle', 
      textDecoration: '' 
    };

    const styleGrid = grid.map(row => Array(maxCols).fill(null).map(() => ({ ...DEFAULT_STYLE })));
    
    // Normalize row widths across the whole grid object matrix
    const normalizedGrid = grid.map(row => {
      const r = [...row];
      while (r.length < maxCols) r.push("");
      return r;
    });

    const newSheet = {
      name: file.name.replace(/\.[^/.]+$/, ""),
      grid: normalizedGrid,
      styleGrid: styleGrid,
      colWidths: Array(maxCols).fill(2.5),
      rowHeights: Array(normalizedGrid.length).fill(0.5),
      merges: {},
      images: {},
      formulas: {},
      charts: []
    };

    setSheets([newSheet]);
    setActiveSheetIdx(0);
    setProjectName(newSheet.name);
  } catch (err) {
    console.error("CSV Import failed", err);
    alert("Invalid or corrupt CSV layout file.");
  }
};

// FOR IMPORTING ODS/QSHEET LOGIC
useEffect(() => {
  if (fileHandle) {
    const loadFile = async () => {
      const file = await fileHandle.getFile();
      setProjectName(file.name.replace(/\.[^/.]+$/, "")); // Update name input
      
      if (file.name.endsWith('.ods')) {
        handleImport(null, file);
      } else if (file.name.endsWith('.qsheet')) {
        handleQSheetImport(null, file);
      } else if (file.name.endsWith('.csv')) {
        handleCSVImport(null, file);
      }
    };
    loadFile();
  }
}, [fileHandle]);

const handleNewProject = () => {
  if (window.confirm("Start a new project? Any unsaved changes will be lost.")) {
    const DEFAULT_STYLE = { 
        fontWeight: 'normal', fontSize: 10, textAlign: 'left', 
        backgroundColor: '#ffffff', color: '#000000', 
        borderTop: '1px solid #dee2e6', verticalAlign: 'middle', 
        textDecoration: '' 
    };
    
    // Define a fresh 20x10 grid (or your preferred default size)
    const freshSheet = {
      name: "Sheet1",
      grid: Array(20).fill("").map(() => Array(10).fill("")),
      styleGrid: Array(20).fill(null).map(() => Array(10).fill({ ...DEFAULT_STYLE })),
      colWidths: Array(10).fill(2.5),
      rowHeights: Array(20).fill(0.5),
      merges: {},
      images: {},
      formulas: {},
      charts: []
    };

    setSheets([freshSheet]);
    setActiveSheetIdx(0);
    setProjectName("New Project");
  }
};

const handleAction = async (ext, mode) => {
        //if (!editorRef.current) return;
        let blob = null;

        // 1. Generate Blob based on extension
        if (ext === '.pdf') blob = exportToPDF();
        else if (ext === '.qsheet') blob = await exportToQSheet();
        else if (ext === '.ods') blob = await exportToOds();
        else if (ext === '.csv') blob = exportToCSV();

        if (!blob) return;

        // Ensure we don't accidentally double-extension (e.g., "file.txt.txt")
        const cleanName = projectName.replace(/\.[^/.]+$/, "");

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

return (
          <Container className={`app-wrapper p-0 ${darkMode ? 'dark-mode border' : ''}`} style={{...getSheetStyle(sheetColor, sheetBgImage, darkMode), maxHeight: '100vh', maxWidth: '100vw', display: 'flex', flexDirection: 'column' }} onMouseUp={handleMouseUp}>
      {/* TOOLBAR */}
      <div className="p-2 border-bottom d-flex align-items-center gap-2">
      <input 
      type="text" 
      className="form-control" 
      value={projectName} 
      onChange={(e) => setProjectName(e.target.value)}
      placeholder="Project Name"
    />
    {/* <Button onClick={() => setShowSettings(!showSettings)} title="Toggle Dark Mode" variant="qsheet-outline-btn" className='qsheet-outline-btn me-3' size="sm" style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  position: 'relative',
                  flexShrink: 0
        }}>
          <i className="bi bi-gear"></i>
      </Button> */}
      <Button onClick={handleNewProject} title="Create New Project" variant="qsheet-outline-btn" className='qsheet-outline-btn' size="sm" style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  position: 'relative',
                  flexShrink: 0
        }}>
          <i className="bi bi-plus-lg"></i>
      </Button>
      {/* Dark Mode Toggle */}
        <Button onClick={() => setDarkMode(!darkMode)} title="Toggle Dark Mode" variant="qsheet-outline-btn" className='qsheet-outline-btn me-3' size="sm" style={{ 
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
                                                              No settings for now
                                                          </div>
                          </div>
                      </Collapse>
      
      {/* MOBILE NATIVE RICH TEXT TOOLBAR */}
      <div className='editor-box d-flex flex-column border-0'>
      <div className={ `sticky-toolbar d-flex gap-2 p-2 border-bottom flex-nowrap ${isMobile && isKeyboardOpen ? 'fixed-bottom bg-white shadow-lg' : 'sticky-top'}`} 
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
      {/* EDIT MENU TOGGLE */}
      <Button onClick={() => setShowEditMenu(!showEditMenu)} title="Edit Menu" variant="qsheet-outline-btn" className='qsheet-outline-btn' size="sm" style={{ 
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
              animationDuration: '1s'
            }}>
              {/* UNDO REDO GROUP */}
              <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
                <Button onClick={() => undo()} title="Undo" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-arrow-left-circle-fill"></i></Button>
                <Button onClick={() => redo()} title="Redo" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-arrow-right-circle-fill"></i></Button>
              </ButtonGroup>

              {/* CUT COPY PASTE CLEAR */}
              <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
                <Button onClick={() => handleCopy(true)} title="Cut" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-scissors"></i></Button>
                <Button onClick={() => handleCopy(false)} title="Copy" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-files"></i></Button>
                <Button onClick={() => executePaste('all')} disabled={!clipboard} title="Paste" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-clipboard-fill"></i></Button>
                <Button onClick={() => setShowPasteModal(true)} disabled={!clipboard} title="Paste Special" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-clipboard2-pulse-fill"></i></Button>
                <Button onClick={handleClearAll} title="Clear" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-trash-fill"></i></Button>
              </ButtonGroup>

              </div>
            </div>
          </Collapse>
      
      {/* FORMAT MENU TOGGLE */}
      <Button onClick={() => setShowFormatMenu(!showFormatMenu)} title="Format Menu" variant="qsheet-outline-btn" className='qsheet-outline-btn' size="sm" style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  position: 'relative',
                  flexShrink: 0
              }}><i className="bi bi-palette-fill"></i></Button>
          {/* FORMAT MENU */}
          <Collapse in={showFormatMenu}>
          <div>
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              alignItems: 'center', 
              animationName: 'fadeInLeft',
              animationDuration: '1s'
            }}>
        
        {/* BUIS GROUP */}
        <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
          <Button onClick={() => applyStyle('bold')} title="Bold" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-type-bold"></i></Button>
          <Button onClick={() => applyStyle('italic')} title="Italic" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-type-italic"></i></Button>
          <Button onClick={() => applyStyle('underline')} title="Underline" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-type-underline"></i></Button>
          <Button onClick={() => applyStyle('strikeThrough')} title="Strike-through" variant="qsheet-btn" className='qsheet-btn' size="sm"><i className="bi bi-type-strikethrough"></i></Button>
        </ButtonGroup>

        {/* ALIGNMENT GROUP */}
        <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('justifyLeft')} title="Align Left"><i className="bi bi-justify-left"></i></Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('justifyCenter')} title="Align Center"><i className="bi bi-text-center"></i></Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('justifyRight')} title="Align Right"><i className="bi bi-justify-right"></i></Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('verticalAlign', 'top')} title="Align Top"><i className="bi bi-align-top"></i></Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('verticalAlign', 'middle')} title="Align Middle"><i className="bi bi-align-middle"></i></Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => applyStyle('verticalAlign', 'bottom')} title="Align Bottom"><i className="bi bi-align-bottom"></i></Button>
        </ButtonGroup>

        <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowCellMarginModal(true)} title='Margin' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-border-all"></i></Button>

        {/* COLORS GROUP */}
          <label 
              className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
              title='Cell Highlight Color'
              style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  border: '2px solid black',
                  backgroundColor: cellHighlightColor, // Now it correctly shows the color!
                  position: 'relative',
                  cursor: 'pointer'
              }} 
          >
              <i className="bi bi-bucket-fill" style={{ color: getContrastYIQ(cellHighlightColor) }}></i>
              
              <input 
                  type="color"
                  hidden 
                  value={cellHighlightColor}
                  onChange={(e) => {setCellHighlightColor(e.target.value); applyStyle('backColor', e.target.value);}}
              />
          </label>
          <label 
              className="btn btn-light rounded-circle m-1 d-flex align-items-center justify-content-center"
              title='Cell Text Color'
              style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  border: '2px solid black',
                  backgroundColor: cellFontColor, // Now it correctly shows the color!
                  position: 'relative',
                  cursor: 'pointer'
              }} 
          >
              <i className="bi bi-pencil-fill" style={{ color: getContrastYIQ(cellFontColor) }}></i>
              
              <input 
                  type="color"
                  hidden 
                  value={cellFontColor}
                  onChange={(e) => {setCellFontColor(e.target.value); applyStyle('foreColor', e.target.value);}}
              />
          </label>

          {/* SIZE SELECTOR */}
          <Col xs="auto">
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
                            applyStyle('fontSize', newSize);
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
                            applyStyle('fontSize', newSize);
                        }}
                    >
                        <i className="bi bi-plus-lg"></i>
                    </Button>
                </div>
            </Form.Group>
          </Col>
        
          {/* MERGE */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={toggleMerge} title='Merge selection' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-layout-split"></i></Button>

          {/* CELL WIDTH HEIGHT */}
          <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => resizeDimension('col', -0.5)} title="Increase Selection Width">W-</Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => resizeDimension('col', 0.5)} title="Decrease Selection Width">W+</Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => resizeDimension('row', -0.2)} title="Increase Selection Height">H-</Button>
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => resizeDimension('row', 0.2)} title="Decrease Selection Height">H+</Button>
          </ButtonGroup>
          </div>
          </div>
          </Collapse>
      
      {/* INSERT MENU TOGGLE */}
      <Button onClick={() => setShowInsertMenu(!showInsertMenu)} title="Insert Menu" variant="qsheet-outline-btn" className='qsheet-outline-btn' size="sm" style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  position: 'relative',
                  flexShrink: 0
              }}><i className="bi bi-table"></i></Button>
          {/* INSERT MENU */}
          <Collapse in={showInsertMenu}>
          <div>
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              alignItems: 'center', 
              animationName: 'fadeInLeft',
              animationDuration: '1s'
            }}>

          {/* FORMULA */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowFormulaModal(true)} title='Insert Formula' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-calculator-fill"></i></Button>
        
        {/* CELL ROW COL INSERT GROUP */}
        <ButtonGroup className='qsheet-btn gap-3' style={{ flexShrink: 0 }}>
          <Button onClick={() => setShowCellInsertModal(true)} title="Insert Cells" variant="qsheet-btn" className='qsheet-btn' size="sm">Cell</Button>
          <Button onClick={() => setShowRowInsertModal(true)} title="Insert Rows" variant="qsheet-btn" className='qsheet-btn' size="sm">Row</Button>
          <Button onClick={() => setShowColumnInsertModal(true)} title="Insert Columns" variant="qsheet-btn" className='qsheet-btn' size="sm">Col</Button>
        </ButtonGroup>

        {/* IMAGE INSERT */}
        <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => fileInputRef.current.click()} title='Insert Image' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-image-fill"></i></Button>
                <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
        <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowChartModal(true)} title='Insert Chart' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-pie-chart-fill"></i></Button>
        <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => handleAutoFill('down')} title='AutoFill Down' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-magic"><i className='bi bi-box-arrow-down'></i></i></Button>
        <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => handleAutoFill('right')} title='AutoFill Right' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-magic"><i className='bi bi-box-arrow-right'></i></i></Button>
          </div>
          </div>
          </Collapse>

      {/* INSERT MENU TOGGLE */}
      <Button onClick={() => setShowSearchSortMenu(!showSearchSortMenu)} title="Search & Sort Menu" variant="qsheet-outline-btn" className='qsheet-outline-btn' size="sm" style={{ 
                  width: '2.6rem', 
                  height: '2.6rem', 
                  borderRadius: '50px', 
                  position: 'relative',
                  flexShrink: 0
              }}><i className="bi bi-search"></i></Button>
          {/* INSERT MENU */}
          <Collapse in={showSearchSortMenu}>
          <div>
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              alignItems: 'center', 
              animationName: 'fadeInLeft',
              animationDuration: '1s'
            }}>

          {/* SEARCH & REPLACE */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowFindModal(true)} title='Search & Replace in Selection' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-search"></i></Button>
          {/* CONDITIONAL FILTER */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowRuleModal(true)} title='Apply Filters' style={{width: '2.6rem', height: '2.6rem'}}><i className="bi bi-filter-circle-fill"></i></Button>
          {/* ROW SORT MODAL */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowRowSortModal(true)} title='Sort Rows' style={{width: '2.6rem', height: '2.6rem'}}>R</Button>
          {/* COLUMN SORT MODAL */}
          <Button variant="qsheet-btn" className='qsheet-btn' size="sm" onClick={() => setShowColumnSortModal(true)} title='Sort Columns' style={{width: '2.6rem', height: '2.6rem'}}>C</Button>

          </div>
          </div>
        </Collapse>

        
        
          {/* Add all other buttons from your original modal here */}
      </div>

      {/* FORMULA BAR */}
      <div className="d-flex align-items-center bg-light border-bottom p-1" style={{ height: '40px' }}>
        {/* Cell Address Box (e.g., A1) */}
        <div className="bg-white border text-center px-2 py-1 me-1" style={{ minWidth: '60px', fontWeight: 'bold', fontSize: '14px' }}>
          {String.fromCharCode(65 + selection.start.c)}{selection.start.r + 1}
        </div>
        
        {/* Formula Icon */}
        <div className="px-2 text-secondary" style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '18px' }}>
          fx
        </div>

        {/* Input Field */}
        <input
          type="text"
          className="form-control form-control-sm bg-white"
          // Priority: Formula > Grid Value
          value={
            (() => {
              const { r, c } = selection.start;
              // Check if the selected row/col actually exists in the current sheet
              const row = currentSheet?.grid?.[r];
              const cellValue = row ? row[c] : "";
              const formula = currentSheet?.formulas?.[`${r}_${c}`];

              return formula || (cellValue || "").replace(/<[^>]*>/g, '');
            })()
          }
          onChange={(e) => {
            const val = e.target.value;
            const { r, c } = selection.start;
            const key = `${r}_${c}`;
            
            setSheets(prev => {
              const ns = JSON.parse(JSON.stringify(prev));
              const sheet = ns[activeSheetIdx];
              
              if (val.startsWith('=')) {
                sheet.formulas[key] = val;
                sheet.grid[r][c] = String(evaluateFormula(val, sheet.grid));
              } else {
                delete sheet.formulas[key];
                sheet.grid[r][c] = val;
              }
              // Re-run the chain for the live preview
              return recalculateSheet(ns, activeSheetIdx);
            });
          }}
        />
      </div>

      <div className="bg-white border-bottom d-flex align-items-center px-2">
        <Tabs 
        activeKey={activeSheetIdx} 
        onSelect={(k) => {
          setActiveSheetIdx(Number(k));
          // RESET SELECTION to avoid out-of-bounds errors on the new sheet
          setSelection({
            start: { r: 0, c: 0 },
            end: { r: 0, c: 0 },
            active: false
          });
        }} 
        className="border-0 flex-grow-1"
      >
        {sheets.map((s, i) => <Tab key={i} eventKey={i} title={s.name} />)}
      </Tabs>
        <ButtonGroup size="sm" className="ms-2">
          <Button variant="outline-success" onClick={addNewSheet}>+ Sheet</Button>
          <Button variant="outline-dark" onClick={renameSheet}>Rename</Button>
          <Button variant="outline-danger" onClick={deleteSheet}>Delete</Button>
        </ButtonGroup>
      </div>

      {/* EDITABLE GRID */}
      <div className="flex-grow-1 overflow-auto" 
      style={{ ...getSheetStyle(sheetColor, sheetBgImage, darkMode),
                            whiteSpace: 'pre-wrap', 
                                    minHeight: '68vh',
                                    maxHeight: '68vh',
                                    overflowY: 'scroll',
                                    outline: 'none', // Remove default focus outline
                                    //lineHeight: '1.5', // Important: Set explicit line height for better alignment
                                    paddingLeft: '0.5%', // Ensure padding on editor side
                                    scrollbarWidth: 'none',
                                    WebkitOverflowScrolling: 'touch',
                                    userSelect: 'none'
                         }}>
        
        {/* 1. CONTAINER: Relative Positioning Root */}
        <div className="spreadsheet-container" style={{ position: 'relative', overflow: 'auto', height: '100%' }}>
          
          {/* 2. THE MAIN DATA TABLE */}
          <Table 
            bordered 
            size="sm" 
            className="m-0" 
            style={{ 
              tableLayout: 'fixed', 
              width: 'max-content', 
              borderCollapse: 'separate', // Required for sticky headers to play nice with borders
              borderSpacing: 0 
            }}
          >
            <thead>
              <tr style={{ height: '30px' }}> {/* FIXED HEIGHT FOR ALIGNMENT */}
                
                {/* Row Header (Empty Corner) */}
                <th 
                  className="bg-light border" 
                  style={{ 
                    width: 40, 
                    position: 'sticky', 
                    left: 0, 
                    top: 0,
                    zIndex: 10, 
                    cursor: 'pointer' 
                  }}
                  onClick={() => {
                    setSelection({
                      start: { r: 0, c: 0 },
                      end: { r: currentSheet.grid.length - 1, c: currentSheet.grid[0].length - 1 },
                      active: false
                    });
                  }}
                ></th>

                {/* Column Headers (A, B, C...) */}
                {currentSheet.colWidths.map((w, i) => (
                  <th
                    key={i}
                    className="bg-light text-center border position-relative"
                    style={{ 
                      width: `${w * 40}px`, 
                      position: 'sticky', 
                      top: 0, 
                      zIndex: 5, 
                      cursor: 'pointer',
                      verticalAlign: 'middle' // Center text nicely
                    }}
                    onClick={() => {
                      setSelection({
                        start: { r: 0, c: i },
                        end: { r: currentSheet.grid.length - 1, c: i },
                        active: false
                      });
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                    
                    {/* FILTER ICON */}
                    {currentSheet.activeFilterCol === i && (
                      <span
                        style={{
                          position: 'absolute',
                          right: '2px',
                          top: '6px', // Adjusted for new height
                          fontSize: '10px',
                          color: '#0d6efd'
                        }}
                        title="Filter applied to this column"
                      >
                        ▼
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.grid.map((row, rIdx) => {
                if (currentSheet.hiddenRows?.includes(rIdx)) return null;
                return (
                  <tr key={rIdx}>
                    {/* Row Number Header (1, 2, 3...) */}
                    <td 
                      className="bg-light text-center border" 
                      style={{ 
                        position: 'sticky', 
                        left: 0, 
                        zIndex: 5, 
                        cursor: 'pointer',
                        verticalAlign: 'middle'
                      }}
                      onClick={() => {
                        setSelection({
                          start: { r: rIdx, c: 0 },
                          end: { r: rIdx, c: currentSheet.grid[0].length - 1 },
                          active: false
                        });
                      }}
                    >
                      {rIdx + 1}
                    </td>

                    {/* Data Cells */}
                    {row.map((_, cIdx) => {
                      const mergeKey = `${rIdx}_${cIdx}`;
                      const isHighlighted = highlightedCell?.r === rIdx && highlightedCell?.c === cIdx;
                      
                      // Merge Visibility Logic
                      let isHidden = false;
                      for (let k in currentSheet.merges) {
                        const [mr, mc] = k.split('_').map(Number);
                        const { rSpan, cSpan } = currentSheet.merges[k];
                        if (rIdx >= mr && rIdx < mr + rSpan && cIdx >= mc && cIdx < mc + cSpan) {
                          if (rIdx !== mr || cIdx !== mc) isHidden = true;
                        }
                      }
                      if (isHidden) return null;

                      const isMergedStart = currentSheet.merges[mergeKey];
                      const s = currentSheet.styleGrid[rIdx][cIdx];
                      const img = currentSheet.images[mergeKey];
                      const selected = isInSelection(rIdx, cIdx);

                      const formulaMap = currentSheet.formulas || {};
                      const cellFormula = formulaMap[mergeKey];

                      const displayValue = (cellFormula && !selected)
                        ? evaluateFormula(cellFormula, currentSheet.grid)
                        : currentSheet.grid[rIdx][cIdx];

                      return (
                        <td
                          key={cIdx}
                          data-r={rIdx} data-c={cIdx}
                          rowSpan={isMergedStart?.rSpan}
                          colSpan={isMergedStart?.cSpan}
                          onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                          onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                          className="p-0 position-relative"
                          style={{
                            backgroundColor: selected ? '#d3e3fd' : s.backgroundColor,
                            height: `${currentSheet.rowHeights[rIdx] * 40}px`,
                            minWidth: `${currentSheet.colWidths[cIdx] * 40}px`,
                            borderTop: s.borderTop, borderBottom: s.borderBottom,
                            borderLeft: s.borderLeft, borderRight: s.borderRight
                          }}
                        >
                          {img && <img src={img} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 0, opacity: 0.5 }} />}
                          
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="cell-content w-100 h-100"
                            style={{
                              overflow: 'hidden',
                              textAlign: s.textAlign,
                              fontFamily: s.fontFamily,
                              fontSize: `${s.fontSize}pt`,
                              fontWeight: s.fontWeight,
                              fontStyle: s.fontStyle,
                              textDecoration: s.textDecoration,
                              color: s.color,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                              minHeight: '100%',
                              position: 'relative',
                              padding: '0 4px',
                              outline: isHighlighted ? '3px solid #ffc107' : (selected ? '2px solid #0d6efd' : 'none'),
                              outlineOffset: '-3px',
                              zIndex: isHighlighted ? 10 : (selected ? 5 : 1),
                              transition: 'outline 0.2s ease',
                              ...getConditionalStyle(
                                rIdx,
                                cIdx,
                                currentSheet.formulas[mergeKey]
                                  ? evaluateFormula(currentSheet.formulas[mergeKey], currentSheet.grid)
                                  : currentSheet.grid[rIdx][cIdx],
                                currentSheet.conditionalRules
                              ),
                            }}
                            onFocus={(e) => {
                              const key = `${rIdx}_${cIdx}`;
                              const existingFormula = currentSheet.formulas[key];
                              if (existingFormula) {
                                e.target.innerText = existingFormula;
                              }
                            }}
                            onBlur={(e) => {
                              // Capture the raw HTML markup containing your text engine's tags/spans
                              const rawHtml = e.target.innerHTML;
                              // Keep innerText only for testing formulas or checking emptiness
                              const text = e.target.innerText.trim();
                              const key = `${rIdx}_${cIdx}`;

                              setSheets(prev => {
                                const ns = JSON.parse(JSON.stringify(prev));
                                const sheet = ns[activeSheetIdx];
                                const oldFormula = sheet.formulas[key];
                                
                                if (oldFormula) {
                                  const calculatedVal = String(evaluateFormula(oldFormula, sheet.grid));
                                  if (text === calculatedVal) return prev;
                                }
                                
                                if (text.startsWith('=')) {
                                  sheet.formulas[key] = text;
                                  sheet.grid[rIdx][cIdx] = String(evaluateFormula(text, sheet.grid));
                                } else {
                                  delete sheet.formulas[key];
                                  // Save the rich HTML markup directly to the grid cell
                                  sheet.grid[rIdx][cIdx] = rawHtml; 
                                }
                                return recalculateSheet(ns, activeSheetIdx);
                              });
                            }}
                            dangerouslySetInnerHTML={{
                              __html: (selected && currentSheet.formulas[mergeKey])
                                ? currentSheet.formulas[mergeKey]
                                : (currentSheet.formulas[mergeKey]
                                  ? evaluateFormula(currentSheet.formulas[mergeKey], currentSheet.grid)
                                  : currentSheet.grid[rIdx][cIdx])
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )
              })}
            </tbody>
          </Table>

          {/* THE FLOATING CHART LAYER */}
<div 
  className="chart-layer"
  onMouseMove={handleGlobalMouseMove} // Global listener for smooth dragging
  onMouseUp={handleGlobalMouseUp}
  onMouseLeave={handleGlobalMouseUp}
  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
>
  {(sheets[activeSheetIdx].charts || []).map((chart) => (
    <div
      key={chart.id}
      style={{
        position: 'absolute',
        left: chart.x + 40, // Offset for Row Headers
        top: chart.y + 30,  // Offset for Col Headers
        width: chart.width,
        height: chart.height,
        zIndex: 100,
        backgroundColor: 'white',
        border: '1px solid #999',
        boxShadow: dragState?.id === chart.id ? '0 10px 20px rgba(0,0,0,0.3)' : '0 2px 5px rgba(0,0,0,0.2)',
        padding: '0',
        pointerEvents: 'all', // Re-enable events
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* 1. DRAG HANDLE (Header) */}
      <div 
        className="chart-header bg-light border-bottom d-flex justify-content-between align-items-center px-2"
        style={{ height: '24px', cursor: 'grab', userSelect: 'none' }}
        onMouseDown={(e) => handleChartMouseDown(e, chart.id, 'move')}
      >
        <small className="text-muted" style={{fontSize:'10px'}}>Chart</small>
        <button 
          className="btn-close" 
          style={{ width: '0.5em', height: '0.5em' }}
          onClick={() => handleDeleteChart(chart.id)}
        ></button>
      </div>

      {/* 2. CHART CONTENT */}
      {/* Content Area */}
    <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
      {chart.isImported ? (
        /* Render as a plain image window for imported ODS charts */
        <img 
          src={chart.base64Image} 
          alt="Imported Chart" 
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
        />
      ) : (
        /* Render as interactive component for native charts */
        <MultiChartGenSheet
          chartsDataArray={[chart.config]}
          onChartImageCapture={handleChartImageCapture}
        />
      )}
    </div>

      {/* 3. RESIZE HANDLE (Bottom Right Corner) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '15px',
          height: '15px',
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, #666 50%)',
          zIndex: 101
        }}
        onMouseDown={(e) => handleChartMouseDown(e, chart.id, 'resize')}
      />
    </div>
  ))}
</div>

        </div>
      </div>
      </div>

      {/* --- FOOTER SAVE BUTTONS --- */}
        <div className="p-3 border-top d-flex justify-content-between align-items-center sticky-bottom"
        style={getSheetStyle(sheetColor, sheetBgImage, darkMode)}>
            <div className="d-flex gap-2">
                <Button title="Import Menu" variant="qsheet-btn rounded-ui" className='qsheet-btn rounded-ui' onClick={() => setShowImportModal(true)}>
                    <i className="bi bi-upload"></i>
                </Button>
                <Button title="Download Menu" variant="qsheet-btn rounded-ui" className='qsheet-btn rounded-ui' onClick={() => setShowDownloadModal(true)}>
                    <i className="bi bi-download"></i>
                </Button>
            </div>
            <div className="d-flex gap-2">
                <Button title="Share Menu" variant="primary" onClick={() => setShowShareModal(true)} className="qsheet-btn">
                    <i className="bi bi-share"></i>
                </Button>
                <Button title="Save Menu" variant="primary" onClick={() => setShowSaveModal(true)} className="qsheet-btn">
                    <i className="bi bi-hdd"></i>
                </Button>
            </div>
        </div>

{/* RULES MODAL */}
<Modal show={showRuleModal} onHide={() => setShowRuleModal(false)} size="lg">
  <Modal.Header closeButton>
    <Modal.Title>Conditional Formatting Manager</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    {/* --- ADD NEW RULE FORM --- */}
    <h6 className="mb-3">Add New Rule</h6>
    <div className="d-flex gap-2 mb-4 align-items-end border p-3 rounded bg-light">
      <Form.Group>
        <Form.Label small>Column (A, B...)</Form.Label>
        <Form.Control 
          size="sm" type="text" value={newRule.col} 
          onChange={e => setNewRule({...newRule, col: e.target.value.toUpperCase()})} 
        />
      </Form.Group>
      <Form.Group>
        <Form.Label small>Condition</Form.Label>
        <Form.Select 
          size="sm" value={newRule.operator} 
          onChange={e => setNewRule({...newRule, operator: e.target.value})}
        >
          <option value=">">{'>'}</option>
          <option value="<">{'<'}</option>
          <option value="=">{'='}</option>
          <option value="contains">contains</option>
        </Form.Select>
      </Form.Group>
      <Form.Group>
        <Form.Label small>Value</Form.Label>
        <Form.Control 
          size="sm" type="text" placeholder="Value..." value={newRule.value} 
          onChange={e => setNewRule({...newRule, value: e.target.value})} 
        />
      </Form.Group>
      <Form.Group>
        <Form.Label small>Color</Form.Label>
        <Form.Control 
          size="sm" type="color" value={newRule.color} 
          onChange={e => setNewRule({...newRule, color: e.target.value})} 
          title="Choose text color"
        />
      </Form.Group>
      <Button variant="success" size="sm" onClick={handleSaveRule}>Add Rule</Button>
    </div>

    {/* --- EXISTING RULES TABLE --- */}
    <h6>Existing Rules</h6>
    <Table striped bordered hover size="sm">
      <thead>
        <tr>
          <th>Column</th>
          <th>Logic</th>
          <th>Preview</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {(!currentSheet.conditionalRules || currentSheet.conditionalRules.length === 0) ? (
          <tr><td colSpan="4" className="text-center text-muted">No rules defined.</td></tr>
        ) : (
          currentSheet.conditionalRules.map((rule, idx) => (
            <tr key={idx}>
              <td>{String.fromCharCode(65 + rule.col)}</td>
              <td>{rule.operator} {rule.value}</td>
              <td style={{ color: rule.style.color, fontWeight: 'bold' }}>Sample Text</td>
              <td>
                <Button 
                  variant="outline-danger" size="sm" 
                  onClick={() => {
                    setSheets(prev => {
                      const ns = JSON.parse(JSON.stringify(prev));
                      ns[activeSheetIdx].conditionalRules.splice(idx, 1);
                      return ns;
                    });
                  }}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  </Modal.Body>
</Modal>

{/* SEARCH & REPLACE MODAL */}
<Modal show={showFindModal} onHide={() => { setShowFindModal(false); setHighlightedCell(null); }}>
  <Modal.Header closeButton>
    <Modal.Title>Find and Replace</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    <Form>
      <Form.Group className="mb-3">
        <Form.Label>Find</Form.Label>
        <Form.Control 
          type="text" 
          value={findParams.find} 
          onChange={(e) => setFindParams({...findParams, find: e.target.value})}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Replace with</Form.Label>
        <Form.Control 
          type="text" 
          value={findParams.replace} 
          onChange={(e) => setFindParams({...findParams, replace: e.target.value})}
        />
      </Form.Group>
      
      <div className="d-flex gap-4 mb-3">
        <Form.Check 
          type="checkbox" label="Match case" checked={findParams.matchCase}
          onChange={(e) => setFindParams({...findParams, matchCase: e.target.checked})}
        />
        <Form.Check 
          type="checkbox" label="Whole word only" checked={findParams.matchWhole}
          onChange={(e) => setFindParams({...findParams, matchWhole: e.target.checked})}
        />
      </div>

      {isRangeSelected && (
        <div className="p-2 bg-light border rounded mb-3">
          <small className="text-muted d-block mb-2">Selection detected:</small>
          <div className="d-flex gap-2">
            <Button variant="outline-dark" size="sm" onClick={() => processReplacement('selection', true)}>
              Replace in Selection
            </Button>
            <Button variant="outline-dark" size="sm" onClick={() => processReplacement('selection', false)}>
              Replace All in Selection
            </Button>
          </div>
        </div>
      )}
    </Form>
  </Modal.Body>
  <Modal.Footer className="justify-content-between">
    <div className="d-flex gap-2">
      <Button variant="outline-primary" onClick={() => executeFind('prev')}>Find Prev</Button>
      <Button variant="outline-primary" onClick={() => executeFind('next')}>Find Next</Button>
    </div>
    <div className="d-flex gap-2">
      <Button variant="outline-success" onClick={() => processReplacement('sheet', true)}>Replace</Button>
      <Button variant="primary" onClick={() => processReplacement('sheet', false)}>Replace All</Button>
    </div>
  </Modal.Footer>
</Modal>

{/* PASTE MODAL */}
<Modal show={showPasteModal} onHide={() => setShowPasteModal(false)} size="sm">
  <Modal.Header closeButton>
    <Modal.Title>Paste Special</Modal.Title>
  </Modal.Header>
  <Modal.Body className="d-grid gap-2">
    <Button variant="outline-primary" onClick={() => executePaste('all')}>
      Everything (Values & Format)
    </Button>
    <Button variant="outline-primary" onClick={() => executePaste('values')}>
      Values Only
    </Button>
    <Button variant="outline-primary" onClick={() => executePaste('format')}>
      Formatting Only
    </Button>
  </Modal.Body>
</Modal>

{/* CHART INSERT MODAL */}
<Modal show={showChartModal} onHide={() => setShowChartModal(false)}>
  <Modal.Header closeButton>
    <Modal.Title>Insert Chart</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    <div className="mb-3">
      <label className="form-label">Chart Title</label>
      <input 
        type="text" 
        className="form-control" 
        value={chartTitle} 
        onChange={(e) => setChartTitle(e.target.value)} 
      />
    </div>
    <div className="mb-3">
      <label className="form-label">Chart Type</label>
      <select 
        className="form-select" 
        value={chartType} 
        onChange={(e) => setChartType(e.target.value)}
      >
        <option value="bar">Bar Chart</option>
        <option value="pie">Pie Chart</option>
        <option value="line">Line Chart</option>
        <option value="doughnut">Doughnut Chart</option>
      </select>
    </div>
    <div className="alert alert-info small">
      <strong>Tip:</strong> Select 2 columns for simple charts (Label, Value). Select 3+ columns for grouped comparisons.
    </div>
  </Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={() => setShowChartModal(false)}>Cancel</Button>
    <Button variant="primary" onClick={handleCreateChart}>Create Chart</Button>
  </Modal.Footer>
</Modal>

{/* FORMULA INSERT MODAL */}
<Modal 
    show={showFormulaModal} 
    onHide={() => setShowFormulaModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-functions me-2 text-success"></i>Insert Formula
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {[
            {
                category: "Common",
                items: [
                    { name: 'SUM', label: 'Total', icon: 'bi-plus-circle' },
                    { name: 'AVERAGE', label: 'Mean', icon: 'bi-graph-up' },
                    { name: 'COUNT', label: 'Numbers', icon: 'bi-123' }
                ]
            },
            {
                category: "Math & Stats",
                items: [
                    { name: 'MIN', label: 'Smallest', icon: 'bi-dash-square' },
                    { name: 'MAX', label: 'Largest', icon: 'bi-plus-square' },
                    { name: 'PRODUCT', label: 'Multiply', icon: 'bi-x-lg' }
                ]
            },
            {
                category: "Text",
                items: [
                    { name: 'UPPER', label: 'Uppercase', icon: 'bi-type-h1' },
                    { name: 'LOWER', label: 'Lowercase', icon: 'bi-type-h3' },
                    { name: 'CONCAT', label: 'Join', icon: 'bi-link-45deg' }
                ]
            }
        ].map((group, gIndex) => (
            <div key={gIndex} className={gIndex > 0 ? "mt-4" : ""}>
                <h6 className="text-muted small fw-bold mb-3 text-uppercase">{group.category}</h6>
                <div className="row g-2">
                    {group.items.map((formula, iIndex) => (
                        <div className="col-4" key={iIndex}>
                            <Button 
                                variant="qsheet-btn" 
                                className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary text-light' : ''}`}
                                size="sm"
                                onClick={() => {
                                    insertFormula(formula.name);
                                    setShowFormulaModal(false);
                                }}
                            >
                                <i className={`bi ${formula.icon} fs-5 mb-1`}></i>
                                <span className="fw-bold" style={{fontSize: '0.75rem'}}>{formula.name}</span>
                                <span className="text-muted" style={{fontSize: '0.65rem'}}>{formula.label}</span>
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </Modal.Body>
</Modal>

{/* CELL INSERT MODAL */}
<Modal 
    show={showCellInsertModal} 
    onHide={() => setShowCellInsertModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-grid-3x3-gap me-2 text-primary"></i>Cell Actions
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        <div className="row g-3">
            {[
                { 
                    id: 'insert-right', 
                    label: 'Add & Shift Right', 
                    icon: 'bi-arrow-right-square-fill', 
                    color: 'text-success', 
                    desc: 'Inserts cell' 
                },
                { 
                    id: 'insert-down', 
                    label: 'Add & Shift Down', 
                    icon: 'bi-arrow-down-square-fill', 
                    color: 'text-success', 
                    desc: 'Inserts cell' 
                },
                { 
                    id: 'delete-left', 
                    label: 'Delete & Shift Left', 
                    icon: 'bi-arrow-left-square', 
                    color: 'text-danger', 
                    desc: 'Removes cell' 
                },
                { 
                    id: 'delete-up', 
                    label: 'Delete & Shift Up', 
                    icon: 'bi-arrow-up-square', 
                    color: 'text-danger', 
                    desc: 'Removes cell' 
                }
            ].map((action, index) => (
                <div className="col-6" key={index}>
                    <Button 
                        variant="qsheet-btn" 
                        className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center shadow-sm ${darkMode ? 'border-secondary text-light' : ''}`}
                        onClick={() => {
                            handleCellShift(action.id);
                            setShowCellInsertModal(false);
                        }}
                    >
                        <i className={`bi ${action.icon} ${action.color} fs-3 mb-2`}></i>
                        <span className="fw-bold" style={{fontSize: '0.8rem'}}>{action.label}</span>
                        <span className="text-muted" style={{fontSize: '0.65rem'}}>{action.desc}</span>
                    </Button>
                </div>
            ))}
        </div>
    </Modal.Body>
</Modal>

{/* ROW INSERT/MODIFY MODAL */}
<Modal 
    show={showRowInsertModal} 
    onHide={() => setShowRowInsertModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-list-columns-reverse me-2 text-primary"></i>Row Management
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {/* SECTION: INSERTION */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Insert New</h6>
        <div className="row g-2 mb-4">
            {[
                { type: 'above', label: 'Above', icon: 'bi-arrow-up-circle' },
                { type: 'below', label: 'Below', icon: 'bi-arrow-down-circle' },
                { type: 'end', label: 'To End', icon: 'bi-plus-square-dotted' }
            ].map((item, idx) => (
                <div className="col-4" key={idx}>
                    <Button 
                        variant="qsheet-btn" 
                        className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                        onClick={() => {
                            modifyStructure('row', 'add', item.type);
                            setShowRowInsertModal(false);
                        }}
                    >
                        <i className={`bi ${item.icon} text-success fs-4 mb-1`}></i>
                        <span style={{fontSize: '0.75rem'}}>{item.label}</span>
                    </Button>
                </div>
            ))}
        </div>

        {/* SECTION: ACTIONS */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Actions</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        duplicateStructure('row');
                        setShowRowInsertModal(false);
                    }}
                >
                    <i className="bi bi-layers text-primary fs-4 mb-1"></i>
                    <span style={{fontSize: '0.75rem'}}>Duplicate Selected</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        swapRows();
                        setShowRowInsertModal(false);
                    }}
                >
                    <i className="bi bi-arrow-down-up text-info fs-4 mb-1"></i>
                    <span style={{fontSize: '0.75rem'}}>Swap Rows...</span>
                </Button>
            </div>
        </div>

        {/* SECTION: DELETION */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase text-danger">Delete</h6>
        <div className="row g-2">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-danger text-danger' : 'text-danger'}`}
                    onClick={() => {
                        modifyStructure('row', 'del', 'at');
                        setShowRowInsertModal(false);
                    }}
                >
                    <i className="bi bi-trash me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Delete Selected</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-danger text-danger' : 'text-danger'}`}
                    onClick={() => {
                        modifyStructure('row', 'del', 'end');
                        setShowRowInsertModal(false);
                    }}
                >
                    <i className="bi bi-eraser me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Delete Last</span>
                </Button>
            </div>
        </div>
    </Modal.Body>
</Modal>

{/* COLUMN INSERT/MODIFY MODAL */}
<Modal 
    show={showColumnInsertModal} 
    onHide={() => setShowColumnInsertModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-layout-three-columns me-2 text-primary"></i>Column Management
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {/* SECTION: INSERTION */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Insert New</h6>
        <div className="row g-2 mb-4">
            {[
                { type: 'left', label: 'Left', icon: 'bi-arrow-left-circle' },
                { type: 'right', label: 'Right', icon: 'bi-arrow-right-circle' },
                { type: 'end', label: 'To End', icon: 'bi-plus-square-dotted' }
            ].map((item, idx) => (
                <div className="col-4" key={idx}>
                    <Button 
                        variant="qsheet-btn" 
                        className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                        onClick={() => {
                            modifyStructure('col', 'add', item.type);
                            setShowColumnInsertModal(false);
                        }}
                    >
                        <i className={`bi ${item.icon} text-success fs-4 mb-1`}></i>
                        <span style={{fontSize: '0.75rem'}}>{item.label}</span>
                    </Button>
                </div>
            ))}
        </div>

        {/* SECTION: ACTIONS */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Actions</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        duplicateStructure('col');
                        setShowColumnInsertModal(false);
                    }}
                >
                    <i className="bi bi-copy text-primary fs-4 mb-1"></i>
                    <span style={{fontSize: '0.75rem'}}>Duplicate Selected</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        swapCols();
                        setShowColumnInsertModal(false);
                    }}
                >
                    <i className="bi bi-arrow-left-right text-info fs-4 mb-1"></i>
                    <span style={{fontSize: '0.75rem'}}>Swap Columns...</span>
                </Button>
            </div>
        </div>

        {/* SECTION: DELETION */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase text-danger">Danger Zone</h6>
        <div className="row g-2">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-danger text-danger' : 'text-danger'}`}
                    onClick={() => {
                        modifyStructure('col', 'del', 'at');
                        setShowColumnInsertModal(false);
                    }}
                >
                    <i className="bi bi-trash me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Delete Selected</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-danger text-danger' : 'text-danger'}`}
                    onClick={() => {
                        modifyStructure('col', 'del', 'end');
                        setShowColumnInsertModal(false);
                    }}
                >
                    <i className="bi bi-eraser me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Delete Last</span>
                </Button>
            </div>
        </div>
    </Modal.Body>
</Modal>

{/* CELL BORDERS MODAL */}
<Modal 
    show={showCellMarginModal} 
    onHide={() => setShowCellMarginModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-border-all me-2 text-primary"></i>Cell Borders
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {/* SECTION: BORDER SELECTION */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Select Border Placement</h6>
        <div className="row g-2 mb-4">
            {[
                { id: 'all', label: 'All', icon: 'bi-grid-3x3' },
                { id: 'outer', label: 'Outer', icon: 'bi-box' },
                { id: 'none', label: 'None', icon: 'bi-border-none' },
                { id: 'top', label: 'Top', icon: 'bi-border-top' },
                { id: 'bottom', label: 'Bottom', icon: 'bi-border-bottom' },
                { id: 'left', label: 'Left', icon: 'bi-border-left' },
                { id: 'right', label: 'Right', icon: 'bi-border-right' },
            ].map((mode) => (
                <div className={mode.id === 'all' || mode.id === 'outer' || mode.id === 'none' ? "col-4" : "col-3"} key={mode.id}>
                    <Button 
                        variant={borderMode === mode.id ? "primary" : "qsheet-btn"} 
                        className={`qsheet-btn w-100 py-2 d-flex flex-column align-items-center ${darkMode && borderMode !== mode.id ? 'border-secondary text-light' : ''}`}
                        onClick={() => setBorderMode(mode.id)}
                    >
                        <i className={`bi ${mode.icon} fs-5 mb-1`}></i>
                        <span style={{fontSize: '0.7rem'}}>{mode.label}</span>
                    </Button>
                </div>
            ))}
        </div>

        {/* SECTION: COLOR PICKER */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Border Color</h6>
        <div className="d-flex align-items-center p-3 rounded border shadow-sm mb-4" 
             style={{ backgroundColor: darkMode ? '#2b3035' : '#f8f9fa' }}>
            <Form.Control 
                type="color" 
                id="borderColorInput"
                value={borderColorPicker} 
                onChange={(e) => setBorderColorPicker(e.target.value)} 
                title="Choose border color"
                className="me-3"
                style={{ width: '50px', height: '40px', cursor: 'pointer' }}
            />
            <div>
                <div className="small fw-bold">{borderColorPicker.toUpperCase()}</div>
                <div className="text-muted" style={{fontSize: '0.7rem'}}>Hex Color Code</div>
            </div>
        </div>

        {/* ACTION BUTTON */}
        <Button 
            variant="primary" 
            className="w-100 py-2 fw-bold"
            onClick={() => {
                applyBorder();
                setShowCellMarginModal(false);
            }}
        >
            Apply Border Settings
        </Button>
    </Modal.Body>
</Modal>

{/* ROW SORT MODAL */}
<Modal 
    show={showRowSortModal} 
    onHide={() => setShowRowSortModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-sort-down me-2 text-primary"></i>Sort Rows
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {/* SECTION: ALPHANUMERIC */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Standard Sort</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('row', 'az');
                        setShowRowSortModal(false);
                    }}
                >
                    <i className="bi bi-sort-alpha-down fs-3 mb-1 text-primary"></i>
                    <span className="fw-bold" style={{fontSize: '0.8rem'}}>A → Z</span>
                    <span className="text-muted" style={{fontSize: '0.65rem'}}>Ascending</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('row', 'za');
                        setShowRowSortModal(false);
                    }}
                >
                    <i className="bi bi-sort-alpha-up-alt fs-3 mb-1 text-primary"></i>
                    <span className="fw-bold" style={{fontSize: '0.8rem'}}>Z → A</span>
                    <span className="text-muted" style={{fontSize: '0.65rem'}}>Descending</span>
                </Button>
            </div>
        </div>

        {/* SECTION: STYLE BASED */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Sort by Appearance</h6>
        <div className="row g-2">
            <div className="col-12">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-start px-3 mb-2 ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('row', 'bg');
                        setShowRowSortModal(false);
                    }}
                >
                    <i className="bi bi-paint-bucket me-3 fs-5 text-success"></i>
                    <div className="text-start">
                        <div className="fw-bold" style={{fontSize: '0.8rem'}}>By Background Color</div>
                        <div className="text-muted" style={{fontSize: '0.65rem'}}>Group cells with similar fills</div>
                    </div>
                </Button>
            </div>
            <div className="col-12">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-start px-3 ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('row', 'text');
                        setShowRowSortModal(false);
                    }}
                >
                    <i className="bi bi-palette me-3 fs-5 text-info"></i>
                    <div className="text-start">
                        <div className="fw-bold" style={{fontSize: '0.8rem'}}>By Text Color</div>
                        <div className="text-muted" style={{fontSize: '0.65rem'}}>Group cells with similar font colors</div>
                    </div>
                </Button>
            </div>
        </div>
    </Modal.Body>
</Modal>

{/* COLUMN SORT & FILTER MODAL */}
<Modal 
    show={showColumnSortModal} 
    onHide={() => setShowColumnSortModal(false)} 
    centered
    data-bs-theme={darkMode ? 'dark' : 'light'}
>
    <Modal.Header closeButton>
        <Modal.Title className="h5">
            <i className="bi bi-filter-square me-2 text-primary"></i>Sort & Filter Columns
        </Modal.Title>
    </Modal.Header>
    <Modal.Body>
        {/* SECTION: ALPHANUMERIC */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Standard Sort</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('col', 'az');
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-sort-alpha-down fs-3 mb-1 text-primary"></i>
                    <span className="fw-bold" style={{fontSize: '0.8rem'}}>A → Z</span>
                    <span className="text-muted" style={{fontSize: '0.65rem'}}>Ascending</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-3 d-flex flex-column align-items-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('col', 'za');
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-sort-alpha-up-alt fs-3 mb-1 text-primary"></i>
                    <span className="fw-bold" style={{fontSize: '0.8rem'}}>Z → A</span>
                    <span className="text-muted" style={{fontSize: '0.65rem'}}>Descending</span>
                </Button>
            </div>
        </div>

        {/* SECTION: STYLE BASED */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase">Sort by Appearance</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('col', 'bg');
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-paint-bucket me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Background</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        sortStructure('col', 'text');
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-palette me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Text Color</span>
                </Button>
            </div>
        </div>

        {/* SECTION: QUICK FILTER */}
        <h6 className="text-muted small fw-bold mb-3 text-uppercase text-warning">Advanced</h6>
        <div className="row g-2 mb-4">
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        applyQuickFilter();
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-funnel-fill me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Apply Quick Filter</span>
                </Button>
            </div>
            <div className="col-6">
                <Button 
                    variant="qsheet-btn" 
                    className={`qsheet-btn w-100 py-2 d-flex align-items-center justify-content-center ${darkMode ? 'border-secondary text-light' : ''}`}
                    onClick={() => {
                        clearAllFilters();
                        setShowColumnSortModal(false);
                    }}
                >
                    <i className="bi bi-eye-slash me-2"></i>
                    <span style={{fontSize: '0.75rem'}}>Clear Filters</span>
                </Button>
            </div>
        </div>
        
    </Modal.Body>
</Modal>

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
                { ext: '.qsheet', label: 'QSHEET', icon: 'bi-file-spreadsheet-fill', color: 'text-success' },
                { ext: '.pdf', label: 'PDF', icon: 'bi-filetype-pdf', color: 'text-success' },
                { ext: '.ods', label: 'ODS', icon: 'bi-file-earmark-spreadsheet-fill', color: 'text-success' },
                { ext: '.csv', label: 'CSV (Plain Data)', icon: 'bi-filetype-csv', color: 'text-success' }
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
            {/* <DropdownButton size="sm" variant="outline-danger" title="PDF Size" className='ml-1'>
<Dropdown.Item onClick={() => setPdfOrientation('p')} title="Portrait (Better for many rows)">Potrait</Dropdown.Item>
<Dropdown.Item onClick={() => setPdfOrientation('l')} title="Landscape (Better for many columns)">Landscape</Dropdown.Item>
</DropdownButton> */}
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
                { ext: '.qsheet', label: 'QSHEET', icon: 'bi-file-spreadsheet-fill', color: 'text-success' },
                { ext: '.pdf', label: 'PDF', icon: 'bi-filetype-pdf', color: 'text-success' },
                { ext: '.ods', label: 'ODS', icon: 'bi-file-earmark-spreadsheet-fill', color: 'text-success' },
                { ext: '.csv', label: 'CSV (Plain Data)', icon: 'bi-filetype-csv', color: 'text-success' }
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
                { ext: '.qsheet', label: 'QSHEET', icon: 'bi-file-spreadsheet-fill', color: 'text-success' },
                { ext: '.pdf', label: 'PDF', icon: 'bi-filetype-pdf', color: 'text-success' },
                { ext: '.ods', label: 'ODS', icon: 'bi-file-earmark-spreadsheet-fill', color: 'text-success' },
                { ext: '.csv', label: 'CSV (Plain Data)', icon: 'bi-filetype-csv', color: 'text-success' }
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
        label: 'Imp ODS', 
        icon: 'bi-file-earmark', 
        color: 'text-primary', 
        ref: importODSInputRef 
    },
    { 
        label: 'Imp QSHEET', 
        icon: 'bi-file-text', 
        color: 'text-primary', 
        ref: importQSHEETInputRef 
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
    </Container>
  );
};

export default QSheet;