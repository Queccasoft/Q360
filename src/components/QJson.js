import React, { useState, useEffect } from 'react';
import { Button, Form, Card, InputGroup, Container, Row, Col, Alert, ButtonGroup } from 'react-bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';

// --- Recursive Component for GUI Mode ---
const JsonNode = ({ value, onChange, name, onDelete, onRename, darkMode }) => {
  // 1. States for UI behavior
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(name);

  // 2. State for Adding New Fields (Inside Objects/Arrays)
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState("string");

  // 3. Determine current category
  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && value !== null && !isArray;
  const currentType = isArray ? 'array' : isObject ? 'object' : typeof value === 'boolean' ? 'boolean' : typeof value;

  const cardClass = darkMode ? "bg-dark text-light border-secondary" : "bg-light text-dark";
  const headerClass = darkMode ? "border-secondary" : "";

  const getDefaultValue = (type) => {
    switch (type) {
      case 'number': return 0;
      case 'boolean': return false;
      case 'object': return {};
      case 'array': return [];
      default: return "";
    }
  };

  const handleTypeChange = (type) => {
    if (type === currentType) return;
    onChange(getDefaultValue(type)); // Resets field to empty version of new type
  };

  const saveName = () => {
    if (onRename && editNameValue !== name) onRename(editNameValue);
    setIsEditingName(false);
  };

  return (
    <Card className={`mb-3 shadow-sm ${cardClass}`}>
      {/* HEADER: Contains Collapse, Icon, Name Edit, Category, and Delete */}
      <Card.Header className={`d-flex flex-wrap align-items-center gap-2 p-2 ${headerClass}`}>
        
        {/* Toggle Collapse */}
        <Button 
          variant="link" size="sm" 
          className={`p-0 text-decoration-none ${darkMode ? 'text-light' : 'text-dark'}`}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <i className={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`}></i>
        </Button>

        {/* Icon & Name */}
        <div className="d-flex align-items-center flex-grow-1">
          <i className={`bi me-2 ${isArray ? 'bi-brackets' : isObject ? 'bi-braces' : 'bi-dot'}`}></i>
          {isEditingName ? (
            <InputGroup size="sm">
              <Form.Control value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} autoFocus />
              <Button variant="success" onClick={saveName}><i className="bi bi-check"></i></Button>
            </InputGroup>
          ) : (
            <strong onDoubleClick={() => onRename && setIsEditingName(true)}>{name}</strong>
          )}
        </div>

        {/* Actions Group */}
        <div className="d-flex gap-1 align-items-center">
          {onRename && !isEditingName && (
            <Button variant="outline-secondary" size="sm" className="border-0" onClick={() => setIsEditingName(true)}>
              <i className="bi bi-pencil"></i>
            </Button>
          )}

          <Form.Select 
            size="sm" style={{ width: '100px' }} 
            value={currentType} 
            onChange={(e) => handleTypeChange(e.target.value)}
            className={darkMode ? 'bg-dark text-light border-secondary' : ''}
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Bool</option>
            <option value="object">Object</option>
            <option value="array">Array</option>
          </Form.Select>

          {onDelete && <Button variant="outline-danger" size="sm" className="border-0" onClick={onDelete}><i className="bi bi-trash"></i></Button>}
        </div>
      </Card.Header>

      {/* BODY: Contains the actual data/children (Visible only if not collapsed) */}
      {!isCollapsed && (
        <Card.Body className="p-2 p-md-3">
          
          {/* 1. RENDER ARRAY ITEMS */}
          {isArray && (
            <>
              {value.map((item, index) => (
                <JsonNode
                  key={index}
                  name={`Item [${index}]`}
                  value={item}
                  darkMode={darkMode}
                  onChange={(newVal) => {
                    const newArr = [...value];
                    newArr[index] = newVal;
                    onChange(newArr);
                  }}
                  onDelete={() => onChange(value.filter((_, i) => i !== index))}
                />
              ))}
              <InputGroup size="sm" className="mt-2">
                <Form.Select style={{ maxWidth: '100px' }} value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="object">Object</option>
                  <option value="array">Array</option>
                </Form.Select>
                <Button variant="outline-primary" onClick={() => onChange([...value, getDefaultValue(newType)])}>
                  <i className="bi bi-plus-circle"></i> Add Item
                </Button>
              </InputGroup>
            </>
          )}

          {/* 2. RENDER OBJECT FIELDS */}
          {isObject && (
            <>
              {Object.keys(value).map((key) => (
                <JsonNode
                  key={key}
                  name={key}
                  value={value[key]}
                  darkMode={darkMode}
                  onRename={(newName) => {
                    if (newName === key || !newName) return;
                    const newObj = { ...value };
                    const tempValue = newObj[key];
                    delete newObj[key];
                    newObj[newName] = tempValue;
                    onChange(newObj);
                  }}
                  onChange={(newVal) => onChange({ ...value, [key]: newVal })}
                  onDelete={() => {
                    const newObj = { ...value };
                    delete newObj[key];
                    onChange(newObj);
                  }}
                />
              ))}
              <InputGroup size="sm" className="mt-2">
                <Form.Control placeholder="New key..." value={newKey} onChange={e => setNewKey(e.target.value)} />
                <Form.Select style={{ maxWidth: '100px' }} value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Bool</option>
                  <option value="object">Object</option>
                  <option value="array">Array</option>
                </Form.Select>
                <Button variant="success" onClick={() => {
                  if (newKey && !value.hasOwnProperty(newKey)) {
                    onChange({ ...value, [newKey]: getDefaultValue(newType) });
                    setNewKey("");
                  }
                }}>Add Field</Button>
              </InputGroup>
            </>
          )}

          {/* 3. RENDER PRIMITIVE INPUTS */}
          {!isArray && !isObject && (
            <div className="p-1">
              {currentType === 'boolean' ? (
                <Form.Check type="switch" label={value ? "True" : "False"} checked={value} onChange={(e) => onChange(e.target.checked)} />
              ) : (
                <Form.Control
                  size="sm"
                  as={currentType === 'string' && value.length > 50 ? 'textarea' : 'input'}
                  type={currentType === 'number' ? 'number' : 'text'}
                  value={value}
                  className={darkMode ? 'bg-dark text-light border-secondary' : ''}
                  onChange={(e) => onChange(currentType === 'number' ? Number(e.target.value) : e.target.value)}
                />
              )}
            </div>
          )}
        </Card.Body>
      )}
    </Card>
  );
};


// --- Main QJson Component ---
const QJson = ({ fileHandle, onSave, onDownload, onShare, darkMode = false }) => {
  const [mode, setMode] = useState('gui'); // 'gui' or 'raw'
  const [jsonData, setJsonData] = useState([]);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState(null);
const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
    const readFile = async () => {
      if (!fileHandle) return;
      setIsLoading(true);
      setError(null);

      try {
        let textContent = "";

        // 1. Get the text content from the handle
        if (typeof fileHandle.getFile === 'function') {
          const file = await fileHandle.getFile();
          textContent = await file.text();
        } else if (fileHandle instanceof Blob) {
          textContent = await fileHandle.text();
        }

        if (textContent.trim()) {
          // 2. SANITIZATION STEP
          // Remove JS variable declarations if they exist (e.g., const SEARCH_DATA =)
          let sanitized = textContent.replace(/^(const|let|var)\s+\w+\s+=\s+/, '');
          // Remove trailing semicolon
          sanitized = sanitized.replace(/;$/, '');
          // REPLACE BACKTICKS WITH DOUBLE QUOTES (The critical fix)
          sanitized = sanitized.replace(/`/g, '"');

          const parsed = JSON.parse(sanitized);
          setJsonData(parsed);
          setRawText(JSON.stringify(parsed, null, 2));
        } else {
          setJsonData([]);
          setRawText("[]");
        }
      } catch (err) {
        console.error("Error reading file:", err);
        setError(`Failed to read file: ${err.message}. Ensure the file is valid JSON (use double quotes instead of backticks).`);
      } finally {
        setIsLoading(false);
      }
    };

    readFile();
  }, [fileHandle]);

  // Handle switching to GUI mode (parses raw text, validates it)
  const switchToGui = () => {
    try {
      const parsed = JSON.parse(rawText);
      setJsonData(parsed);
      setError(null);
      setMode('gui');
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`);
    }
  };

  // Handle switching to Raw mode (stringifies current GUI state)
  const switchToRaw = () => {
    setRawText(JSON.stringify(jsonData, null, 2));
    setError(null);
    setMode('raw');
  };

  // Generates Blob and fires parent callbacks
  const handleAction = (actionCallback) => {
    let finalString = "";
    
    if (mode === 'gui') {
      // GUI mode always produces valid JSON strings
      finalString = JSON.stringify(jsonData, null, 2);
    } else {
      // If user is in RAW mode, sanitize their input before saving
      try {
        const temp = rawText.replace(/`/g, '"');
        JSON.parse(temp); // Validate
        finalString = JSON.stringify(JSON.parse(temp), null, 2); 
      } catch (err) {
        setError(`Cannot save: Raw text has syntax errors: ${err.message}`);
        return;
      }
    }

    const blob = new Blob([finalString], { type: 'application/json' });
    const fileName = fileHandle?.name?.split('.')[0] || 'bot_config';
    actionCallback(blob, fileName, '.json');
  };

  return (
    <Container fluid className={`p-3 h-100 d-flex flex-column ${darkMode ? 'bg-dark text-light' : 'bg-white'}`} style={{ minHeight: '100vh' }}>
      
      {/* Toolbar */}
      <Row className="mb-3">
        <Col className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <ButtonGroup>
            <Button 
              variant={mode === 'gui' ? 'primary' : (darkMode ? 'outline-light' : 'outline-secondary')} 
              onClick={mode === 'raw' ? switchToGui : undefined}
            >
              <i className="bi bi-ui-checks-grid me-1"></i> GUI Mode
            </Button>
            <Button 
              variant={mode === 'raw' ? 'primary' : (darkMode ? 'outline-light' : 'outline-secondary')} 
              onClick={mode === 'gui' ? switchToRaw : undefined}
            >
              <i className="bi bi-code-slash me-1"></i> Raw JSON
            </Button>
          </ButtonGroup>

          <div className="d-flex gap-2">
            <Button variant="success" onClick={() => handleAction(onSave)}>
              <i className="bi bi-save me-1"></i> <span className="d-none d-sm-inline">Save</span>
            </Button>
            <Button variant="info" className="text-white" onClick={() => handleAction(onDownload)}>
              <i className="bi bi-download me-1"></i> <span className="d-none d-sm-inline">Download</span>
            </Button>
            <Button variant="primary" onClick={() => handleAction(onShare)}>
              <i className="bi bi-share me-1"></i> <span className="d-none d-sm-inline">Share</span>
            </Button>
          </div>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

{isLoading && (
  <div className="text-center p-5">
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
    <p className="mt-2">Reading JSON file...</p>
  </div>
)}
      {/* Editor Area */}
      {!isLoading && (
      <Row className="flex-grow-1 overflow-auto">
        <Col>
          {mode === 'gui' ? (
            <div className="gui-editor-container pb-5">
              <JsonNode 
                name="Root Search Data" 
                value={jsonData} 
                onChange={setJsonData} 
                darkMode={darkMode}
              />
            </div>
          ) : (
            <Form.Control
              as="textarea"
              className={`h-100 font-monospace ${darkMode ? 'bg-dark text-light border-secondary' : ''}`}
              style={{ minHeight: '60vh', resize: 'none' }}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setError(null);
              }}
              spellCheck={false}
            />
          )}
        </Col>
      </Row>
      )}
    </Container>
  );
};

export default QJson;