import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';
import { Container, Card, Form, Button, ProgressBar, Alert, Row, Col } from 'react-bootstrap';

const OcrBootstrapComponent = () => {
  const [image, setImage] = useState(null);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(""); // e.g., "loading worker", "recognizing"
  const [isLoading, setIsLoading] = useState(false);

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImage(URL.createObjectURL(e.target.files[0]));
      setText("");
      setProgress(0);
      setStatus("");
    }
  };

  const performOCR = async () => {
    if (!image) return;
    
    setIsLoading(true);
    setText("");
    
    // Create worker with a logger to track progress
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        setStatus(m.status);
        if (m.status === 'recognizing text') {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });

    try {
      const { data: { text } } = await worker.recognize(image);
      setText(text);
      setProgress(100);
      setStatus("Completed");
    } catch (error) {
      console.error("OCR Error:", error);
      setStatus("Error processing image");
    } finally {
      await worker.terminate();
      setIsLoading(false);
    }
  };

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="shadow-sm">
            <Card.Header as="h5" className="bg-primary text-white">
              Document OCR Scanner
            </Card.Header>
            <Card.Body>
              <Form.Group controlId="formFile" className="mb-3">
                <Form.Label>Upload an image (JPG, PNG)</Form.Label>
                <Form.Control type="file" accept="image/*" onChange={handleImageChange} />
              </Form.Group>

              {image && (
                <div className="text-center mb-4">
                  <img 
                    src={image} 
                    alt="Preview" 
                    className="img-fluid rounded border" 
                    style={{ maxHeight: '300px' }} 
                  />
                </div>
              )}

              <div className="d-grid gap-2">
                <Button 
                  variant="primary" 
                  onClick={performOCR} 
                  disabled={isLoading || !image}
                >
                  {isLoading ? 'Processing...' : 'Extract Text'}
                </Button>
              </div>

              {isLoading && (
                <div className="mt-4">
                  <div className="d-flex justify-content-between mb-1">
                    <small className="text-muted text-capitalize">{status}...</small>
                    <small className="text-muted">{progress}%</small>
                  </div>
                  <ProgressBar animated now={progress} label={`${progress}%`} />
                </div>
              )}
            </Card.Body>
          </Card>

          {text && (
            <Card className="mt-4 shadow-sm border-success">
              <Card.Header className="bg-success text-white">Extracted Results</Card.Header>
              <Card.Body>
                <Form.Control 
                  as="textarea" 
                  rows={8} 
                  value={text} 
                  readOnly 
                  className="bg-light"
                />
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => navigator.clipboard.writeText(text)}
                >
                  Copy to Clipboard
                </Button>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default OcrBootstrapComponent;