import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';
import { Modal, Form, Button, ProgressBar, Row, Col, Badge } from 'react-bootstrap';

const OcrModal = ({ show, onHide, onInsert }) => {
  const [image, setImage] = useState(null);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // New State for Language
  const [language, setLanguage] = useState('eng');

  const languages = [
    { code: 'eng', name: 'English' },
    { code: 'ben', name: 'Bengali' },
    { code: 'spa', name: 'Spanish' },
    { code: 'fra', name: 'French' },
    { code: 'deu', name: 'German' },
    { code: 'chi_sim', name: 'Chinese (Simplified)' },
    { code: 'jpn', name: 'Japanese' },
    { code: 'hin', name: 'Hindi' },
    { code: 'ara', name: 'Arabic' },
    { code: 'rus', name: 'Russian' },
  ];

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImage(URL.createObjectURL(e.target.files[0]));
      setText("");
      setProgress(0);
    }
  };

  const performOCR = async () => {
    if (!image) return;
    setIsLoading(true);
    setText("");
    
    // The language code is passed directly to createWorker
    const worker = await createWorker(language, 1, {
      logger: m => {
        setStatus(m.status);
        if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
      }
    });

    try {
      const { data: { text } } = await worker.recognize(image);
      setText(text);
      setStatus("Done");
    } catch (error) {
      console.error("OCR Error:", error);
      setStatus("Error processing image");
    } finally {
      await worker.terminate();
      setIsLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton className="bg-primary text-white">
        <Modal.Title><i className="bi bi-translate me-2"></i>Multi-Language OCR</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row className="mb-3">
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-bold">1. Select Document Language</Form.Label>
              <Form.Select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isLoading}
              >
                {languages.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Choosing the correct language improves accuracy significantly.
              </Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-bold">2. Upload Image</Form.Label>
              <Form.Control type="file" accept="image/*" onChange={handleImageChange} disabled={isLoading} />
            </Form.Group>
          </Col>
        </Row>

        <hr />

        {image && (
          <div className="text-center mb-3 bg-light p-2 rounded">
             <img src={image} className="img-fluid rounded shadow-sm" style={{ maxHeight: '250px' }} alt="OCR Source" />
          </div>
        )}
        
        {isLoading && (
          <div className="mb-3">
            <div className="d-flex justify-content-between mb-1">
              <small className="text-primary fw-bold text-uppercase">{status}</small>
              <small>{progress}%</small>
            </div>
            <ProgressBar animated now={progress} variant="primary" />
          </div>
        )}
        
        {text && (
          <Form.Group>
            <Form.Label className="fw-bold">Extracted Text Preview:</Form.Label>
            <Form.Control 
              as="textarea" 
              rows={6} 
              value={text} 
              onChange={(e) => setText(e.target.value)} 
              className="font-monospace"
            />
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="secondary" onClick={onHide}>Close</Button>
        {!text ? (
          <Button 
            variant="primary" 
            onClick={performOCR} 
            disabled={isLoading || !image}
            className="px-4"
          >
            {isLoading ? 'Processing...' : 'Start Scan'}
          </Button>
        ) : (
          <Button 
            variant="success" 
            onClick={() => { onInsert(text); onHide(); }}
            className="px-4"
          >
            Insert into Document
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};
export default OcrModal;