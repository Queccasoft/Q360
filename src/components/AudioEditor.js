import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'; 
import { Button, Container, Row, Col, ButtonGroup, Form, Spinner } from 'react-bootstrap';
import { bufferToWave, sliceAudioBuffer, mixAudioBuffers} from './audioUtils'; 
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import JSZip from "jszip";

const AudioEditor = ({ fileHandle, onSave, onDownload }) => {

    const [projectName, setProjectName] = useState("New Project");
    const [tracks, setTracks] = useState([]); // Array of { id, name, buffer, url }
const [activeTrackId, setActiveTrackId] = useState(null);
const wavesurferRefs = useRef({}); // Object to store multiple WS instances: { trackId: instance }
const regionsRefs = useRef({});    // Object to store regions for each track

    const waveformRef = useRef(null);
    const wavesurfer = useRef(null);
    const regionsWs = useRef(null);
    
    // The "Source of Truth" for our audio data
    const [audioContext, setAudioContext] = useState(null);
    const [originalBuffer, setOriginalBuffer] = useState(null); 
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [clipboard, setClipboard] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false);

    // --- Initialization ---
    useEffect(() => {
        // 1. Create AudioContext (needed for Math, not for playback anymore)
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);

        // 2. Init WaveSurfer (Standard Mode)
        if (waveformRef.current) {
            wavesurfer.current = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: '#4f4f4f',
                progressColor: '#007bff',
                height: 128,
                // In V7, do NOT specify backend: 'WebAudio'. Let it default to MediaElement.
            });

            // 3. Init Regions
            regionsWs.current = wavesurfer.current.registerPlugin(RegionsPlugin.create());
            regionsWs.current.enableDragSelection({
                color: 'rgba(0, 123, 255, 0.3)',
            });

            // 4. Events
            wavesurfer.current.on('finish', () => setIsPlaying(false));
            wavesurfer.current.on('play', () => setIsPlaying(true));
            wavesurfer.current.on('pause', () => setIsPlaying(false));
        }

        return () => {
            if (wavesurfer.current) wavesurfer.current.destroy();
            if (ctx) ctx.close();
        };
    }, []);

    // --- Load File on Open ---
    useEffect(() => {
        if (fileHandle && audioContext) {
            loadFile();
        }
    }, [fileHandle, audioContext]);
    // Update name when a file is initially loaded
useEffect(() => {
    if (fileHandle) {
        // Strip extension for the display name
        const nameWithoutExt = fileHandle.name.replace(/\.[^/.]+$/, "");
        setProjectName(nameWithoutExt);
    }
}, [fileHandle]);

    const createTrack = (buffer, name) => {
    const id = Math.random().toString(36).substr(2, 9);
    const wavBlob = bufferToWave(buffer, buffer.length);
    const url = URL.createObjectURL(wavBlob);
    
    const newTrack = { id, name, buffer, url ,muted: false};
    setTracks(prev => [...prev, newTrack]);
    if (!activeTrackId) setActiveTrackId(id);
};

//     const loadFile = async () => {
//     if (!fileHandle) return;
//     setIsLoading(true);
//     try {
//         const file = await fileHandle.getFile();
//         const arrayBuffer = await file.arrayBuffer();
//         const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
//         createTrack(decodedBuffer, file.name);
//     } catch (err) { console.error(err); }
//     setIsLoading(false);
// };

    // --- OPERATIONS ---
    
    const loadFile = async () => {
    if (!fileHandle) return;
    setIsLoading(true);
    try {
        const file = await fileHandle.getFile();
        
        // Check if the file name ends with .qwave
        if (file.name.toLowerCase().endsWith('.qwave')) {
            // Use your existing Deep Import logic
            await handleDeepImport(file);
        } else {
            // Standard audio file logic
            const arrayBuffer = await file.arrayBuffer();
            const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
            createTrack(decodedBuffer, file.name);
        }
    } catch (err) {
        console.error("Error loading file:", err);
        alert("Could not open file. It may be corrupt or an unsupported format.");
    }
    setIsLoading(false);
};
    
    const handleDuplicate = (track) => {
    // 1. Clone the AudioBuffer
    const oldBuffer = track.buffer;
    const newBuffer = audioContext.createBuffer(
        oldBuffer.numberOfChannels,
        oldBuffer.length,
        oldBuffer.sampleRate
    );

    for (let i = 0; i < oldBuffer.numberOfChannels; i++) {
        newBuffer.copyToChannel(oldBuffer.getChannelData(i), i);
    }

    // 2. Use existing createTrack logic to add it to the UI
    createTrack(newBuffer, `${track.name} (Copy)`);
};

    const handleCut = () => {
    // 1. Validation: Ensure a track is selected and exists
    if (!activeTrackId) return alert("Please click on a track to select it first.");
    
    const currentTrack = tracks.find(t => t.id === activeTrackId);
    const regionsPlugin = regionsRefs.current[activeTrackId];
    
    if (!currentTrack || !regionsPlugin) return;

    // 2. Get the selection from the active track's regions
    const regions = regionsPlugin.getRegions();
    if (regions.length === 0) return alert("Select a region on the active track to cut.");
    
    const sel = regions[regions.length - 1]; // Use the most recent selection
    const duration = sel.end - sel.start;
    
    if (duration < 0.01) return alert("Selection too short to cut.");

    // 3. Audio Math
    const buffer = currentTrack.buffer;
    const rate = buffer.sampleRate;
    const startFrame = Math.floor(sel.start * rate);
    const endFrame = Math.floor(sel.end * rate);
    const framesToRemove = endFrame - startFrame;
    const newLength = buffer.length - framesToRemove;

    if (newLength <= 0) {
        alert("Cannot cut the entire track. Use 'Remove' instead.");
        return;
    }

    // 4. Create the new buffer (The result of the cut)
    const newBuffer = audioContext.createBuffer(
        buffer.numberOfChannels,
        newLength,
        rate
    );

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const oldData = buffer.getChannelData(i);
        const newData = newBuffer.getChannelData(i);
        
        // Copy everything before the cut
        newData.set(oldData.subarray(0, startFrame), 0);
        
        // Copy everything after the cut
        newData.set(oldData.subarray(endFrame), startFrame);
    }

    // 5. Update State
    // We create a new URL for the new buffer so WaveSurfer can re-render
    const newWavBlob = bufferToWave(newBuffer, newBuffer.length);
    const newUrl = URL.createObjectURL(newWavBlob);

    const updatedTracks = tracks.map(t => {
        if (t.id === activeTrackId) {
            // Clean up the old URL to prevent memory leaks
            URL.revokeObjectURL(t.url);
            return { 
                ...t, 
                buffer: newBuffer, 
                url: newUrl 
            };
        }
        return t;
    });

    setTracks(updatedTracks);
    
    // 6. Optional: Copy the cut segment to clipboard automatically
    // This allows the "Cut" to behave like a standard "Cut" (Copy + Delete)
    const cutClip = sliceAudioBuffer(buffer, sel.start, sel.end, audioContext);
    setClipboard(cutClip);
};

    const handleCopy = () => {
    // 1. Validation
    if (!activeTrackId) return alert("Select a track first.");
    
    const currentTrack = tracks.find(t => t.id === activeTrackId);
    const regionsPlugin = regionsRefs.current[activeTrackId];
    
    if (!currentTrack || !regionsPlugin) return;

    // 2. Get Selection
    const regions = regionsPlugin.getRegions();
    if (regions.length === 0) return alert("Select a region to copy.");
    
    const sel = regions[regions.length - 1];
    
    try {
        // 3. Slice the buffer using the helper utility
        const clip = sliceAudioBuffer(currentTrack.buffer, sel.start, sel.end, audioContext);
        
        // 4. Store in clipboard state
        setClipboard(clip);
        console.log("Copied to clipboard:", clip.duration.toFixed(2), "seconds");
    } catch (err) {
        console.error("Copy failed:", err);
        alert("Copy failed. Ensure the selection is valid.");
    }
};

const handlePaste = () => {
    if (!clipboard || !activeTrackId) return alert("Clipboard empty or no track selected.");

    const currentTrack = tracks.find(t => t.id === activeTrackId);
    const activeWs = wavesurferRefs.current[activeTrackId];
    
    // Get cursor position in seconds, convert to frames
    const currentTime = activeWs.getCurrentTime();
    const rate = currentTrack.buffer.sampleRate;
    const insertFrame = Math.floor(currentTime * rate);
    
    const oldBuffer = currentTrack.buffer;
    const newLength = oldBuffer.length + clipboard.length;
    const newBuffer = audioContext.createBuffer(oldBuffer.numberOfChannels, newLength, rate);

    for (let i = 0; i < oldBuffer.numberOfChannels; i++) {
        const newData = newBuffer.getChannelData(i);
        const oldData = oldBuffer.getChannelData(i);
        const clipData = clipboard.getChannelData(i);

        // Part A: Before paste point
        newData.set(oldData.subarray(0, insertFrame), 0);
        // Part B: The Clip (Pasted data)
        newData.set(clipData, insertFrame);
        // Part C: After paste point
        newData.set(oldData.subarray(insertFrame), insertFrame + clipboard.length);
    }

    const newUrl = URL.createObjectURL(bufferToWave(newBuffer, newBuffer.length));
    
    setTracks(prev => prev.map(t => {
        if (t.id === activeTrackId) {
            URL.revokeObjectURL(t.url);
            return { ...t, buffer: newBuffer, url: newUrl };
        }
        return t;
    }));
};
    const handleImport = async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            // We must clone the buffer or decode it immediately because decodeAudioData detaches it
            const decoded = await audioContext.decodeAudioData(arrayBuffer);
            setClipboard(decoded);
            alert(`Imported "${file.name}" to Clipboard (${decoded.duration.toFixed(2)}s). Click Paste to insert.`);
        } catch (err) {
            console.error(err);
            alert("Failed to decode imported audio.");
        }
    };

    // --- Effects (Pitch/Volume) ---
    const handlePitchChange = () => {
    // 1. Validation: Check if a track is active and has a regions plugin
    if (!activeTrackId) return alert("Select a track first.");
    const regionsPlugin = regionsRefs.current[activeTrackId];
    const currentTrack = tracks.find(t => t.id === activeTrackId);
    
    if (!regionsPlugin || !currentTrack) return alert("Select a track first.");

    // 2. Get Selection
    const regions = regionsPlugin.getRegions();
    if (regions.length === 0) return alert("Select a region first.");
    const sel = regions[regions.length - 1];

    const pitchFactor = parseFloat(prompt("Speed Factor (0.5=Slow, 1.0=Normal, 2.0=Fast):", "1.5"));
    if (!pitchFactor || isNaN(pitchFactor)) return;

    // 3. Audio Math
    const buffer = currentTrack.buffer;
    const rate = buffer.sampleRate;
    const startFrame = Math.floor(sel.start * rate);
    const endFrame = Math.floor(sel.end * rate);
    const regionLen = endFrame - startFrame;
    const newRegionLen = Math.floor(regionLen / pitchFactor);
    
    const diff = newRegionLen - regionLen;
    const newTotalLen = buffer.length + diff;
    
    if (newTotalLen <= 0) return;

    const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, newTotalLen, rate);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const oldData = buffer.getChannelData(c);
        const newData = newBuffer.getChannelData(c);
        
        newData.set(oldData.subarray(0, startFrame), 0);

        // Simple Resample (Nearest Neighbor)
        for(let i=0; i < newRegionLen; i++) {
            const oldIndex = Math.floor(i * pitchFactor);
            if (startFrame + oldIndex < buffer.length) {
                newData[startFrame + i] = oldData[startFrame + oldIndex];
            }
        }
        
        if (endFrame < buffer.length) {
            newData.set(oldData.subarray(endFrame), startFrame + newRegionLen);
        }
    }

    // 4. Update Track State
    const newUrl = URL.createObjectURL(bufferToWave(newBuffer, newBuffer.length));
    URL.revokeObjectURL(currentTrack.url); // Clean memory

    setTracks(tracks.map(t => t.id === activeTrackId ? { ...t, buffer: newBuffer, url: newUrl } : t));
};

    const handleAmplitude = () => {
    // 1. Validation
    if (!activeTrackId) return alert("Select a track first.");
    const regionsPlugin = regionsRefs.current[activeTrackId];
    const currentTrack = tracks.find(t => t.id === activeTrackId);
    
    if (!regionsPlugin || !currentTrack) return alert("Select a track first.");

    // 2. Get Selection
    const regions = regionsPlugin.getRegions();
    if (regions.length === 0) return alert("Select a region first.");
    const sel = regions[regions.length - 1];

    const gain = parseFloat(prompt("Volume Factor (0.0=Mute, 1.0=Same, 2.0=Double):", "1.5"));
    if (isNaN(gain)) return;

    // 3. Audio Math
    const buffer = currentTrack.buffer;
    const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const oldData = buffer.getChannelData(i);
        const newData = newBuffer.getChannelData(i);
        newData.set(oldData); // Clone entire track first

        const startFrame = Math.floor(sel.start * buffer.sampleRate);
        const endFrame = Math.floor(sel.end * buffer.sampleRate);

        // Apply gain ONLY to the selected range
        for(let j = startFrame; j < endFrame; j++) {
            newData[j] = oldData[j] * gain;
        }
    }

    // 4. Update Track State
    const newUrl = URL.createObjectURL(bufferToWave(newBuffer, newBuffer.length));
    URL.revokeObjectURL(currentTrack.url);

    setTracks(tracks.map(t => t.id === activeTrackId ? { ...t, buffer: newBuffer, url: newUrl } : t));
};

    // --- Recording ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const decoded = await audioContext.decodeAudioData(arrayBuffer);
                setClipboard(decoded);
                handlePaste(); 
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;
            setIsRecording(true);
        } catch (err) {
            alert("Microphone access denied or not available.");
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    // --- Saving / Download ---
    const processExport = (ext) => {
    // Only include tracks that are NOT muted in the final mix
    const tracksToMix = tracks.filter(t => !t.muted);
    if (tracksToMix.length === 0) {
        alert("No audible tracks to export!");
        return null;
    }
    const mixedBuffer = mixAudioBuffers(tracksToMix.map(t => t.buffer), audioContext);
    // 2. Convert to WAV
    const wavBlob = bufferToWave(mixedBuffer, mixedBuffer.length);
    //const baseName = fileHandle?.name ? fileHandle.name.replace(/\.[^/.]+$/, "") : "mixdown";
    return { blob: wavBlob, name: projectName, ext: ext };
};

 const handleTogglePlay = () => {
    const isPlayingNow = Object.values(wavesurferRefs.current).some(ws => ws.isPlaying());
    Object.values(wavesurferRefs.current).forEach(ws => {
        if (isPlayingNow) ws.pause();
        else ws.play();
    });
    setIsPlaying(!isPlayingNow);
};

const handleDeselect = () => {
    if (!activeTrackId) return;
    const regionsPlugin = regionsRefs.current[activeTrackId];
    if (regionsPlugin) {
        regionsPlugin.clearRegions(); // Removes all selection boxes
    }
};

const handleMuteToggle = (trackId) => {
    setTracks(prev => prev.map(t => {
        if (t.id === trackId) {
            const newMutedStatus = !t.muted;
            // Access the specific WaveSurfer instance to silence it
            if (wavesurferRefs.current[trackId]) {
                wavesurferRefs.current[trackId].setMuted(newMutedStatus);
            }
            return { ...t, muted: newMutedStatus };
        }
        return t;
    }));
};

const handleDeepImport = async (file) => {
    try {
        const zip = await JSZip.loadAsync(file);
        const metaStr = await zip.file("project.json").async("string");
        const projectMeta = JSON.parse(metaStr);

        // Clear existing tracks and their URLs to prevent memory leaks
        tracks.forEach(t => URL.revokeObjectURL(t.url));
        
        const loadedTracks = [];
        for (const trackMeta of projectMeta) {
            const audioFile = zip.file(`assets/${trackMeta.id}.wav`);
            if (audioFile) {
                const arrayBuffer = await audioFile.async("arraybuffer");
                const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Generate UI-ready URL
                const wavBlob = bufferToWave(decodedBuffer, decodedBuffer.length);
                const url = URL.createObjectURL(wavBlob);

                loadedTracks.push({
                    ...trackMeta,
                    buffer: decodedBuffer,
                    url: url
                });
            }
        }

        setTracks(loadedTracks);
        if (loadedTracks.length > 0) setActiveTrackId(loadedTracks[0].id);
    } catch (err) {
        throw err; // Let loadFile catch and alert
    }
};

// A. The core generator
const generateQWaveBlob = async () => {
    if (tracks.length === 0) return null;
    const zip = new JSZip();
    const assets = zip.folder("assets");

    const projectMeta = {
    projectName: projectName,
    tracks: tracks.map(t => ({
        id: t.id,
        name: t.name,
        muted: t.muted || false
    }))
};
    
    // const projectMeta = tracks.map(t => ({
    //     id: t.id,
    //     name: t.name,
    //     muted: t.muted || false
    // }));

    zip.file("project.json", JSON.stringify(projectMeta, null, 2));

    tracks.forEach(t => {
        const wavBlob = bufferToWave(t.buffer, t.buffer.length);
        assets.file(`${t.id}.wav`, wavBlob);
    });

    return await zip.generateAsync({ type: "blob" });
};

// B. The UI Trigger for Saving (to FileManager)
const handleSaveProject = async () => {
    const blob = await generateQWaveBlob();
    if (!blob) return;
    //const baseName = fileHandle?.name ? fileHandle.name.replace(/\.[^/.]+$/, "") : "project";
    onSave(blob, projectName, ".qwave");
};

// C. The UI Trigger for Downloading (to Browser)
const handleDownloadProject = async () => {
    const blob = await generateQWaveBlob();
    if (!blob) return;
    //const baseName = fileHandle?.name ? fileHandle.name.replace(/\.[^/.]+$/, "") : "project";
    onDownload(blob, projectName, ".qwave");
};

    return (
        <Container fluid className="d-flex flex-column bg-dark text-light" style={{minHeight:'91.5vh', maxHeight: '92vh', scrollbarWidth: 'none'}}>
            <Row className="bg-dark border-bottom border-secondary p-2 d-flex flex-nowrap align-items-center gap-1" style={{overflowX: 'scroll', scrollbarWidth: 'none', maxHeight: '10vh'}}>
                <span className="small text-secondary fw-bold text-uppercase col-sm-auto">Project Name:</span>
    <Form.Control 
        type="text" 
        size="sm"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={{ 
            maxWidth: '50%',
            backgroundColor: '#2b2b2b', 
            color: '#fff', 
            border: '1px solid #444' 
        }}
    />
            </Row>
             <Row className="bg-dark p-2 shadow-sm align-items-center" style={{overflowX: 'scroll', scrollbarWidth: 'none'}}>
                <Col md={12} className="d-flex justify-content-between flex-nowrap gap-2" style={{minHeight: "1vh"}}>
                <ButtonGroup size="sm">
    <Button variant="primary" disabled={true}>
        QWAVE:
    </Button>
    <Form.Group controlId="importQwave" className="mb-0">
        <Form.Label className="btn btn-outline-primary btn-sm mb-0 rounded-0" style={{cursor:'pointer'}}>
            Import
        </Form.Label>
        <Form.Control 
            type="file" 
            style={{display:'none'}} 
            accept=".qwave" 
            onChange={(e) => {
                const file = e.target.files[0];
                if (file) handleDeepImport(file);
            }} 
        />
    </Form.Group>

    {/* Project Save (to Folder) */}
    <Button variant="outline-primary" onClick={handleSaveProject}>
        Save
    </Button>

    {/* Project Download (to PC) */}
    <Button variant="outline-primary" onClick={handleDownloadProject}>
        Download
    </Button>
</ButtonGroup>
                    <ButtonGroup size="sm" title='Save to folder'>
                        <Button variant="success" disabled={true}>SAVE:</Button>
                        <Button variant="outline-success" onClick={() => {
                             const d = processExport('.wav'); if(d) onSave(d.blob, d.name, d.ext);
                        }}>WAV</Button>
                        <Button variant="outline-success" onClick={() => {
                             const d = processExport('.mp3'); if(d) onSave(d.blob, d.name, d.ext);
                        }}>MP3</Button>
                        <Button variant="outline-success" onClick={() => {
                             const d = processExport('.aac'); if(d) onSave(d.blob, d.name, d.ext);
                        }}>AAC</Button>
                        <Button variant="outline-success" onClick={() => {
                             const d = processExport('.ogg'); if(d) onSave(d.blob, d.name, d.ext);
                        }}>OGG</Button>
                    </ButtonGroup>
                    
                    <ButtonGroup size="sm" title='Download'>
                        <Button variant="light" disabled={true}>DOWNLOAD:</Button>
                        <Button variant="outline-light" onClick={() => {
                             const d = processExport('.wav'); if(d) onDownload(d.blob, d.name, d.ext);
                        }}>WAV</Button>
                        <Button variant="outline-light" onClick={() => {
                             const d = processExport('.mp3'); if(d) onDownload(d.blob, d.name, d.ext);
                        }}>MP3</Button>
                    </ButtonGroup>

                    <label className="btn btn-light rounded-circle p-0 m-0 d-flex align-items-center justify-content-center" title='Import audio clip to clipboard (Click paste to insert)'
                        style={{ width: '2rem', padding: '0', border: 'none', height: '2rem', borderRadius: '50px', flexShrink: 0, border: '2px solid black' }} >
                            <i className="bi bi-music-note"></i>
                            <input 
                                type="file" 
                                hidden 
                                accept="audio/*"
                                onChange={handleImport}
                            />
                        </label>
                </Col>
            </Row>

            <Row className="flex-grow-1 align-items-center justify-content-center" >
                <Col md={12} style={{maxHeight:'45rem', overflowY: 'scroll'}}>
                    {isLoading && <div className="text-center"><Spinner animation="border" /> Loading...</div>}
                    {/* ID is crucial for Wavesurfer */}
                    {tracks.map((track) => (
                        <div 
                            key={track.id} 
                            onClick={() => setActiveTrackId(track.id)}
                            className={`p-2 mb-2 border rounded ${activeTrackId === track.id ? 'border-primary bg-dark' : 'border-secondary'}`}
                        >
                            <div className="d-flex justify-content-start gap-2 small mb-1">
                                <span>{track.name}</span>
                                <Button 
                                variant="outline-primary rounded-circle" 
                                size="sm" 
                                onClick={(e) => { e.stopPropagation(); handleDuplicate(track); }}
                                title='Duplicate Track'
                            >
                            <i className='bi bi-file-earmark-plus-fill'></i>
                            </Button>
                                {/* MUTE BUTTON */}
                                <Button 
                                    variant={track.muted ? "danger rounded-circle" : "outline-danger rounded-circle"} 
                                    size="sm" 
                                    onClick={(e) => { e.stopPropagation(); handleMuteToggle(track.id); }}
                                    title={track.muted ? "🔇 Muted" : "🔊 Click to Mute"}
                                >
                                <i className={track.muted ? 'bi-volume-mute-fill' : 'bi bi-megaphone-fill'}></i>
                                </Button>
                                <Button variant="outline-danger rounded-circle" size="sm" 
                                    onClick={() => setTracks(prev => prev.filter(t => t.id !== track.id))}>
                                    <i className='bi bi-trash'></i>
                                </Button>
                            </div>
                            <WaveformTrack 
                                track={track} 
                                onMount={(ws, regions) => {
                                    wavesurferRefs.current[track.id] = ws;
                                    regionsRefs.current[track.id] = regions;
                                }}
                            />
                        </div>
                    ))}
    <Button variant="outline-primary" className="w-10 mt-2" title='Add new empty track' onClick={() => {
        // Create a 1-second silent buffer as a "New Track"
        const silent = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
        createTrack(silent, "New Track");
    }}>+ Track</Button>
                </Col>
            </Row>

            <Row className="bg-dark border-top border-secondary p-3" style={{overflowX: 'scroll', scrollbarWidth: 'none'}}>
                <Col className="d-flex justify-content-center gap-3 flex-nowrap">
                    <ButtonGroup style={{ flexShrink: 0 }}>
                        <Button variant="outline-light" onClick={handleCut}><i className='bi bi-scissors'></i></Button>
                        <Button variant="outline-light" onClick={handleCopy}><i className='bi bi-copy'></i></Button>
                        <Button variant="outline-light" onClick={handlePaste}><i className='bi bi-clipboard'></i></Button>
                        <Button variant="outline-danger" onClick={handleDeselect} title="Clear Selection">✖</Button>
                    </ButtonGroup>
                    <div className="vr bg-primary"></div>
                    <Button variant={isPlaying ? "outline-primary rounded-circle" : "outline-danger rounded-circle"} onClick={() => handleTogglePlay()}>
                        <i className={isPlaying?'bi bi-play-fill':'bi bi-pause-fill'}></i>
                    </Button>
                    <div className="vr bg-primary"></div>
                    <ButtonGroup style={{ flexShrink: 0 }}>
                    <Button variant="outline-primary" onClick={handlePitchChange} title='Change Speed / Pitch'><i className='bi bi-speedometer'></i></Button>
                    <Button variant="outline-primary" onClick={handleAmplitude} title='Change Amplitude'><i className='bi bi-megaphone-fill'></i> Vol</Button>
                    <Button 
                        variant={isRecording ? "danger" : "outline-danger"} 
                        onClick={isRecording ? stopRecording : startRecording}
                        title={isRecording ? "🔴 Recording" : "Click to start recording"}
                    >
                        <i className={isRecording ? 'bi-mic-fill' : 'bi-mic-mute-fill'}></i>
                        {isRecording ? "Stop" : " Rec"}
                    </Button>
                    </ButtonGroup>                    
                </Col>
            </Row>
        </Container>
    );
};

const WaveformTrack = ({ track, onMount }) => {
    const containerRef = useRef();
    const timelineRef = useRef();

    useEffect(() => {
        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#4f4f4f',
            progressColor: '#007bff',
            cursorColor: '#ff5722', // Distinct color for the playhead
            cursorWidth: 2,
            height: 80,
            url: track.url,
            plugins: [
                // This creates the separate 'Playhead' interaction line at the top
                TimelinePlugin.create({
                    container: timelineRef.current,
                    primaryLabelInterval: 5,
                    secondaryLabelInterval: 1,
                    style: { fontSize: '10px', color: '#fff' }
                })
            ]
        });

        const regions = ws.registerPlugin(RegionsPlugin.create());
        
        // We set a small delay or check so clicking doesn't trigger a 0-length region
        regions.enableDragSelection({
            color: 'rgba(0, 123, 255, 0.3)',
            minLength: 0.1 
        });

        onMount(ws, regions);

        return () => ws.destroy();
    }, [track.url]);

    return (
        <div>
            <div ref={timelineRef} /> {/* The 'Marker Line' */}
            <div ref={containerRef} /> {/* The Waveform */}
        </div>
    );
};


export default AudioEditor;