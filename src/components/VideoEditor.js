import React, { useEffect, useRef, useState } from 'react';
import { Button, Container, Row, Col, Form, ProgressBar, Modal } from 'react-bootstrap';
import JSZip from 'jszip';

// --- Constants ---
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

const getProjectLength = (currentTracks) => {
    if (currentTracks.length === 0) return 10; // Default minimum
    const endTimes = currentTracks.map(t => t.timelineStart + t.duration);
    return Math.max(...endTimes);
};

const VideoEditor = ({ fileHandle, onSave, onDownload }) => {
    // --- Global State ---
    const [projectName, setProjectName] = useState("Untitled_Project");
    const [tracks, setTracks] = useState([]); 
    const [selectedClipId, setSelectedClipId] = useState(null);

    // --- New State for Library & Interaction ---
    const [layers, setLayers] = useState([
  { id: 0, name: "Layer 0", locked: false },
  { id: 1, name: "Layer 1", locked: false },
  { id: 2, name: "Layer 2", locked: false }
]);
const [activeLayerId, setActiveLayerId] = useState(0);

const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [library, setLibrary] = useState([]);
    const [libraryFilter, setLibraryFilter] = useState('all');
    const [clipboard, setClipboard] = useState(null);
    const [isResizingClipId, setIsResizingClipId] = useState(null);
    const [canvasDraggingId, setCanvasDraggingId] = useState(null);
    const imageElementsRef = useRef({});
    const [filter, setFilter] = useState("all");
    const [resizingDuration, setResizingDuration] = useState(null);
    const [canvasAction, setCanvasAction] = useState(null);
    const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
    const [keysPressed, setKeysPressed] = useState({ shift: false, ctrl: false });
    
    // --- Transport State ---
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(30);
    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(20); 

    // --- Settings State ---
    const [showSettings, setShowSettings] = useState(false);
    const [previewScale, setPreviewScale] = useState(0.5); 
    const [exportConfig, setExportConfig] = useState({
        width: 1920, height: 1080, fps: 30, bitrate: 5000000, mimeType: 'video/mp4'
    });
    
    // --- Export State ---
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // --- Dragging State ---
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [draggingClipId, setDraggingClipId] = useState(null);

    // --- Refs ---
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const playbackTimeRef = useRef(0);
    const audioCtxRef = useRef(null);
    const audioDestRef = useRef(null); 
    const gainNodesRef = useRef({}); 
    const videoElementsRef = useRef({}); 
    const inputRefs = { mp4: useRef(), mov: useRef(), webm: useRef(), qvid: useRef() };
    const timelineContainerRef = useRef(null);
    

    // --- Initialization ---
    useEffect(() => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        audioCtxRef.current = ctx;
        audioDestRef.current = dest;

        if (fileHandle) {
            const name = fileHandle.name.replace(/\.[^/.]+$/, "");
            setProjectName(name);
            loadFile(fileHandle);
        }

        return () => {
            ctx.close();
            cancelAnimationFrame(animationRef.current);
        };
    }, [fileHandle]);

    // --- 1. Core Engine: Sync & Render ---
inputRefs.img = useRef();
inputRefs.aud = useRef();
    const renderFrame = (time) => {
  const ctx = canvasRef.current?.getContext('2d', { alpha: false });
  if (!ctx) return;

  // Clear Canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

  // Set Scale
  const scaleX = canvasRef.current.width / BASE_WIDTH;
  const scaleY = canvasRef.current.height / BASE_HEIGHT;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  const activeClips = tracks
  .filter(clip => time >= clip.timelineStart && time < clip.timelineStart + clip.duration)
  .sort((a, b) => {
    // We want index 0 to have HIGHER z-index (drawn last)
    const indexA = layers.findIndex(l => l.id === a.layer);
    const indexB = layers.findIndex(l => l.id === b.layer);
    return indexB - indexA; // Changed from indexA - indexB
  });

  activeClips.forEach(clip => {
    if (clip.hidden || clip.type === 'audio') return; // Hidden = Audio Only

    const asset = clip.type === 'image' ? imageElementsRef.current[clip.id] : videoElementsRef.current[clip.id];

    if (asset) {
      // SAVE CONTEXT STATE
      ctx.save(); 

      // 1. Apply Opacity
      ctx.globalAlpha = clip.opacity !== undefined ? clip.opacity : 1;

      // Move to center of clip to rotate
      const centerX = clip.x + clip.w / 2;
      const centerY = clip.y + clip.h / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(((clip.rotation || 0) * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);

      // 2. Apply Brightness (Filter)
      if (clip.brightness !== undefined && clip.brightness !== 100) {
        ctx.filter = `brightness(${clip.brightness}%)`;
      }

      if (clip.type === 'image') {
        ctx.drawImage(asset, clip.x || 0, clip.y || 0, clip.w || 400, clip.h || 300);
        
        // Draw Selection Box (Only if selected)
        // if (selectedClipId === clip.id) {
        //   // Reset filters for the UI lines so they remain sharp/bright
        //   ctx.filter = 'none'; 
        //   ctx.globalAlpha = 1;
        //   ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 4;
        //   ctx.strokeRect(clip.x || 0, clip.y || 0, clip.w || 400, clip.h || 300);
        //   // Draw resize handle "knob" at bottom right
        //   ctx.fillStyle = '#eaeaea';
        //   ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 1;
        //   ctx.fillRect(clip.x + clip.w - 10, clip.y + clip.h - 10, 10, 10);
        //   // Draw rotate handle
        //   ctx.beginPath();
        //   ctx.moveTo(centerX, clip.y);
        //   ctx.lineTo(centerX, clip.y - 30);
        //   ctx.strokeStyle = '#0d6efd';
        //   ctx.stroke();
        //   ctx.fillStyle = '#0d6efd';
        //   ctx.arc(centerX, clip.y - 30, 5, 0, Math.PI * 2);
        //   ctx.fill();
        // }
      } else if (asset.readyState >= 2) {
        // Video Drawing
        ctx.drawImage(asset, clip.x || 0, clip.y || 0, clip.w || BASE_WIDTH, clip.h || BASE_HEIGHT);
         // Video Selection Box
        //  if (selectedClipId === clip.id) {
        //     ctx.filter = 'none'; ctx.globalAlpha = 1;
        //     ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 4;
        //     ctx.strokeRect(clip.x || 0, clip.y || 0, clip.w || BASE_WIDTH, clip.h || BASE_HEIGHT);
        //     // Draw resize handle "knob" at bottom right
        //     ctx.fillStyle = '#eaeaea';
        //     ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 1;
        //     ctx.fillRect(clip.x + clip.w - 10, clip.y + clip.h - 10, 10, 10);
        //   }
      }

      if (selectedClipId === clip.id) {
    ctx.filter = 'none'; 
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fd150d'; 
    ctx.lineWidth = 4;
    
    // Main Box
    ctx.strokeRect(clip.x, clip.y, clip.w, clip.h);
    
    // Resize Knob
    ctx.fillStyle = '#eaeaea';
    ctx.strokeStyle = '#fd0d0d'; 
    ctx.lineWidth = 1;
    ctx.fillRect(clip.x + clip.w - 10, clip.y + clip.h - 10, 10, 10);
    ctx.strokeRect(clip.x + clip.w - 10, clip.y + clip.h - 10, 10, 10);

    // Rotate Handle (Now visible for videos too)
    const centerX = clip.x + clip.w / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, clip.y);
    ctx.lineTo(centerX, clip.y - 30);
    ctx.strokeStyle = '#fd0d0d';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(centerX, clip.y - 30, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#fd0d0d';
    ctx.fill();
}
      // RESTORE CONTEXT (Clears opacity/filters for next clip)
      ctx.restore();
    }
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

    // Static Render Effect (Fixes Blank Canvas on Stop/Pause)
    useEffect(() => {
        if (!isPlaying) {
            renderFrame(currentTime);
            // Pause all videos when not playing
            Object.values(videoElementsRef.current).forEach(vid => vid.pause());
        }
    }, [currentTime, tracks, isPlaying]);

    // Playback Loop: Optimized with Refs
useEffect(() => {
    // Only run the loop if we are playing OR exporting
    if (!isPlaying) return;

    let lastTime = performance.now();

    const loop = () => {
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000;
        lastTime = now;

        // 1. Update the "Source of Truth" time
        playbackTimeRef.current += deltaTime;
        const nextTime = playbackTimeRef.current;

        // 2. Handle the End of Project
        if (nextTime >= totalDuration) {
            setIsPlaying(false);
            if (isExporting) setExportProgress(100); // Snap progress to 100%
            return;
        }

        // 3. UI UPDATES (The Fix for Progress Bar & Lag)
        if (isExporting) {
            // Update the progress percentage instead of the playhead to save CPU
            const progress = Math.min(Math.floor((nextTime / totalDuration) * 100), 100);
            setExportProgress(progress);
        } else {
            // Update the timeline playhead only during normal preview
            setCurrentTime(nextTime);
        }

        // 4. THE RENDER CALL (This draws the frame for the MediaRecorder)
        renderFrame(nextTime);

        // 5. Sync Videos & Audio
// Inside the loop function...
tracks.forEach(clip => {
  const vid = videoElementsRef.current[clip.id];
  const gain = gainNodesRef.current[clip.id];
  
  // Check if clip is active in timeline
  const isActive = nextTime >= clip.timelineStart && nextTime < clip.timelineStart + clip.duration;

  // 1. Handle Volume / Mute
  if (gain) {
    // Volume logic: If inactive OR muted -> 0. Else -> Volume % (converted to 0.0 - 1.0)
    const volumeValue = (clip.volume !== undefined ? clip.volume : 100) / 100;
    gain.gain.value = (isActive && !clip.muted) ? volumeValue : 0;
  }

  // 2. Handle Playback Sync
  if (vid) {
    if (isActive) {
      const targetTime = (nextTime - clip.timelineStart) + (clip.trimStart || 0);
      
      // SYNC LOGIC
      if (Math.abs(vid.currentTime - targetTime) > 0.25) {
        vid.currentTime = targetTime;
      }
      
      // Ensure it's playing
      if (vid.paused) {
        vid.play().catch(e => console.warn("Play failed", e));
      }
    } else {
      // Pause if not active
      if (!vid.paused) vid.pause();
    }
  }
});

        animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);

    // CRITICAL: Added isExporting to dependencies so the loop 
    // knows when to switch from "Timeline mode" to "Progress bar mode"
}, [isPlaying, isExporting, tracks, totalDuration]); 

    // --- 2. Track Management ---

const importAsset = async (file) => {
  const id = Math.random().toString(36).substr(2, 9);
  const url = URL.createObjectURL(file);
  const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
  const ext = file.name.split('.').pop().toLowerCase();

  const asset = { id, name: file.name, file, url, type, ext };

  if (type === 'video') {
    const vid = document.createElement('video');
    vid.src = url;
    await new Promise(r => vid.onloadedmetadata = r);
    videoElementsRef.current[id] = vid;
    asset.defaultDuration = vid.duration;
    asset.nativeWidth = vid.videoWidth;
    asset.nativeHeight = vid.videoHeight;
  } else if (type === 'image') {
    const img = new Image();
    img.src = url;
    await new Promise(r => img.onload = r);
    imageElementsRef.current[id] = img;
    asset.defaultDuration = 5; // Default 5s for images
    asset.nativeWidth = img.naturalWidth;
    asset.nativeHeight = img.naturalHeight;
  } else if (type === 'audio') {
    const aud = new Audio(url);
    await new Promise(r => aud.onloadedmetadata = r);
    asset.defaultDuration = aud.duration;
    videoElementsRef.current[id] = aud; // Reuse video ref for audio elements
  }

  setLibrary(prev => [...prev, asset]);
};

const addAssetToTimeline = (asset) => {
  const newClip = {
    ...asset,
    id: Math.random().toString(36).substr(2, 9),
    assetId: asset.id,
    timelineStart: currentTime,
    trimStart: 0,
    duration: asset.duration || asset.defaultDuration,
    layer: activeLayerId || 0,
    // NEW SETTINGS INITIALIZATION
    x: 0, y: 0, w: asset.nativeWidth || 400, rotation: asset.rotation,// Use native width, fallback to 400 if missing
    h: asset.nativeHeight || 300, // Use native height, fallback to 300 if missing 
    opacity: 1, brightness: 100, volume: 100,
    muted: false, hidden: false // hidden = Audio Only mode
  };

  if (asset.type === 'image') {
    if (imageElementsRef.current[asset.id]) {
      imageElementsRef.current[newClip.id] = imageElementsRef.current[asset.id];
    }
  } else {
    // AUDIO & VIDEO FIX
    const isAudio = asset.type === 'audio';
    const newEl = document.createElement(isAudio ? 'audio' : 'video');
    
    newEl.src = asset.url; 
    newEl.crossOrigin = "anonymous";
    newEl.preload = "auto";
    if(!isAudio) newEl.muted = false; // Video tracks shouldn't be muted by default
    
    // Force browser to acknowledge the element
    newEl.load();

    videoElementsRef.current[newClip.id] = newEl;
    
    // Connect to Audio Graph immediately
    const source = audioCtxRef.current.createMediaElementSource(newEl);
    const gain = audioCtxRef.current.createGain();
    
    source.connect(gain);
    gain.connect(audioCtxRef.current.destination); // Speaker output
    gain.connect(audioDestRef.current);            // Recorder output
    
    gainNodesRef.current[newClip.id] = gain;
  }

  setTracks(prev => {
    const next = [...prev, newClip];
    setTotalDuration(getProjectLength(next));
    return next;
  });
};

const deleteFromLibrary = (assetId) => {
  // 1. Find all timeline clips using this asset
  const clipsToRemove = tracks.filter(t => t.assetId === assetId);
  
  // 2. Cleanup resources
  clipsToRemove.forEach(clip => {
    if (videoElementsRef.current[clip.id]) {
       videoElementsRef.current[clip.id].pause();
       videoElementsRef.current[clip.id].src = "";
       delete videoElementsRef.current[clip.id];
    }
    if (gainNodesRef.current[clip.id]) {
       gainNodesRef.current[clip.id].disconnect();
       delete gainNodesRef.current[clip.id];
    }
  });

  // 3. Update State (Calculated in one pass to avoid race conditions)
  setTracks(prev => {
    const nextTracks = prev.filter(t => t.assetId !== assetId);
    
    // FIX: Recalculate duration immediately based on filtered tracks
    setTotalDuration(getProjectLength(nextTracks)); 
    
    return nextTracks;
  });

  setLibrary(prev => prev.filter(a => a.id !== assetId));
  
  if (clipsToRemove.some(c => c.id === selectedClipId)) {
    setSelectedClipId(null);
  }
};

const updateClip = (id, changes) => {
  setTracks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
};

    const handleSplit = () => {
    if (!selectedClipId) return;
    const original = tracks.find(t => t.id === selectedClipId);
    if (!original) return;

    // Prevent split if playhead is outside the clip
    if (currentTime <= original.timelineStart || currentTime >= original.timelineStart + original.duration) {
        return;
    }

    const splitPointInClip = currentTime - original.timelineStart;
    const newId = Math.random().toString(36).substr(2, 9);

    // Create a new video instance for the second half
    const newVid = document.createElement('video');
    newVid.src = original.url;
    newVid.crossOrigin = "anonymous";
    
    // Connect new video instance to audio graph
    const source = audioCtxRef.current.createMediaElementSource(newVid);
    const gain = audioCtxRef.current.createGain();
    source.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    gain.connect(audioDestRef.current);
    
    videoElementsRef.current[newId] = newVid;
    gainNodesRef.current[newId] = gain;

    const leftClip = { 
        ...original, 
        duration: splitPointInClip 
    };

    const rightClip = {
        ...original,
        id: newId,
        timelineStart: currentTime,
        trimStart: original.trimStart + splitPointInClip,
        duration: original.duration - splitPointInClip
    };

    setTracks(prev => {
        const next = prev.map(t => t.id === selectedClipId ? leftClip : t).concat(rightClip);
        // Duration recalculate for stability
        setTotalDuration(getProjectLength(next));
        return next;
    });
    setSelectedClipId(newId);
};

    const handleRemove = () => {
    if (!selectedClipId) return;
    delete videoElementsRef.current[selectedClipId];
    delete gainNodesRef.current[selectedClipId];
    
    setTracks(prev => {
        const next = prev.filter(t => t.id !== selectedClipId);
        setTotalDuration(getProjectLength(next));
        return next;
    });
    setSelectedClipId(null);
};

    // --- 3. Rendering / Export (Fixed) ---
    const handleExport = async (action, format) => {
    if (tracks.length === 0) return;

    // QVID Logic
    if (format === 'qvid') {
        const blob = await generateQvidBlob();
        action === 'save' ? onSave(blob, projectName, '.qvid') : onDownload(blob, projectName, '.qvid');
        return;
    }
    setIsExporting(true);
    setExportProgress(0);
    // 1. Reset Time for Export
    setCurrentTime(0);
    playbackTimeRef.current = 0; // CRITICAL: Reset engine time
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    // 2. Setup Recorder
    const canvasStream = canvasRef.current.captureStream(exportConfig.fps);
    const audioStream = audioDestRef.current.stream;
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
    const mimeMap = { 'mp4': 'video/mp4', 'webm': 'video/webm;codecs=vp9', 'mov': 'video/mp4' };
    const options = {
        mimeType: MediaRecorder.isTypeSupported(mimeMap[format]) ? mimeMap[format] : '',
        videoBitsPerSecond: exportConfig.bitrate
    };
    const recorder = new MediaRecorder(combinedStream, options);
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: options.mimeType });
        const ext = `.${format}`;
        try {
            if (action === 'save') await onSave(blob, projectName, ext);
            else await onDownload(blob, projectName, ext);
        } catch (e) { console.error(e); }
        
        // Reset States
        setIsExporting(false);
        setIsPlaying(false);
        setCurrentTime(0);
        playbackTimeRef.current = 0;
    };
    recorder.start();
    // 3. Start the Engine
    // The main useEffect loop will detect isPlaying=true and run.
    // When playbackTimeRef hits totalDuration, it sets isPlaying=false.
    setIsPlaying(true); 
    // 4. Watch for stop
    // We use a simple interval ONLY to stop the recorder when the ENGINE stops the playback.
    const checkStopInterval = setInterval(() => {
        if (!isPlaying && playbackTimeRef.current >= totalDuration) {
            clearInterval(checkStopInterval);
            if (recorder.state !== "inactive") recorder.stop();
        }
    }, 200);
    // Note: We rely on the loop finishing.
};

    // --- 4. File Helpers ---
    const loadFile = async (handle) => {
        const file = await handle.getFile();
        if (file.name.endsWith('.qvid')) handleDeepImport(file);
        else importAsset(file);
    };

    const generateQvidBlob = async () => {
  const zip = new JSZip();
  const assetsFolder = zip.folder("assets");
  
  // 1. Prepare Metadata with all new properties
const meta = {
  projectName,
  totalDuration,
  layers, // Ensure layers are being saved as discussed previously
  tracks: tracks.map(t => {
    // Find the original library asset to get the file name
    const libraryAsset = library.find(a => a.id === t.assetId);
    return {
      id: t.id,
      assetId: t.assetId || t.id,
      name: t.name,
      // FIX: Use libraryAsset name if t.file is missing (common after import)
      fileName: t.file ? t.file.name : (libraryAsset?.file?.name || libraryAsset?.name),
      type: t.type,
      timelineStart: t.timelineStart,
      trimStart: t.trimStart || 0,
      duration: t.duration,
      layer: t.layer,
      x: t.x, y: t.y, w: t.w, h: t.h,
      nativeWidth: t.nativeWidth,
      nativeHeight: t.nativeHeight,
      rotation: t.rotation || 0,
      opacity: t.opacity ?? 1,
      brightness: t.brightness ?? 100,
      volume: t.volume ?? 100,
      muted: t.muted,
      hidden: t.hidden
    };
  })
};

  // 2. Add the JSON metadata to the zip
  zip.file("project.json", JSON.stringify(meta));

  const savedFiles = new Set();
  tracks.forEach(t => {
    const libraryAsset = library.find(l => l.id === t.assetId);
    const fileToSave = t.file || libraryAsset?.file; 

    if (fileToSave && !savedFiles.has(fileToSave.name)) {
        assetsFolder.file(fileToSave.name, fileToSave);
        savedFiles.add(fileToSave.name);
    }
  });

  // 4. Generate the final Blob
  return await zip.generateAsync({ type: "blob" });
};

    const handleDeepImport = async (file) => {
  const zip = await JSZip.loadAsync(file);
  const meta = JSON.parse(await zip.file("project.json").async("string"));
  
  // 1. Reset state
  setTracks([]);
  setLibrary([]); 
  setLayers([]); 
  videoElementsRef.current = {};
  imageElementsRef.current = {};
  gainNodesRef.current = {};

  const newLibraryItems = [];

  // We loop through the assets identified in the meta tracks
  for (const tMeta of meta.tracks) {
    const assetFile = zip.file(`assets/${tMeta.fileName}`);
    if (assetFile) {
      const blob = await assetFile.async("blob");
      const url = URL.createObjectURL(blob);
      const ext = tMeta.fileName.split('.').pop().toLowerCase();
      
      // UNIQUE ASSET ID check to prevent library duplicates
      const assetId = tMeta.assetId || tMeta.id;

      if (!newLibraryItems.find(item => item.id === assetId)) {
        // Reconstruct the file object from the blob to keep metadata intact
        const reconstructedFile = new File([blob], tMeta.fileName, { type: `${tMeta.type}/${ext}` });

        const libraryAsset = {
          id: assetId,
          name: tMeta.name,
          url: url,
          type: tMeta.type,
          ext: ext,
          file: reconstructedFile, // Crucial for future saves
          nativeWidth: tMeta.nativeWidth || tMeta.w, 
          nativeHeight: tMeta.nativeHeight || tMeta.h,
          rotation: tMeta.rotation ?? 0,
          duration: tMeta.duration
        };

        // Hydrate the visual references so the library can "see" the media
        if (tMeta.type === 'image') {
          const img = new Image();
          img.src = url;
          await new Promise(r => img.onload = r);
          imageElementsRef.current[assetId] = img;
        } else {
          const el = document.createElement(tMeta.type === 'audio' ? 'audio' : 'video');
          el.src = url;
          el.preload = "auto";
          el.load();
          videoElementsRef.current[assetId] = el;
        }

        newLibraryItems.push(libraryAsset);
      }

      // 3. Reconstruct Media References specifically for the TIMELINE clip instances
      if (tMeta.type === 'image') {
        const img = new Image();
        img.src = url;
        await new Promise(r => img.onload = r);
        imageElementsRef.current[tMeta.id] = img;
      } else {
        const isAudio = tMeta.type === 'audio';
        const el = document.createElement(isAudio ? 'audio' : 'video');
        el.src = url;
        el.crossOrigin = "anonymous";
        el.load();

        const source = audioCtxRef.current.createMediaElementSource(el);
        const gain = audioCtxRef.current.createGain();
        source.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        gain.connect(audioDestRef.current);

        videoElementsRef.current[tMeta.id] = el;
        gainNodesRef.current[tMeta.id] = gain;
      }
    }
  }

  // 4. Final state updates
  setLibrary(newLibraryItems); // This populates the sidebar
  
  if (meta.layers) {
    setLayers(meta.layers);
  } else {
    const uniqueIds = [...new Set(meta.tracks.map(t => t.layer))];
    setLayers(uniqueIds.map(id => ({ id, name: `Layer ${id}`, locked: false })));
  }

  setTracks(meta.tracks.map(t => ({
    ...t,
    opacity: t.opacity ?? 1,
    brightness: t.brightness ?? 100,
    volume: t.volume ?? 100
  })));
  
  setTotalDuration(meta.totalDuration || 10);
};

    // --- 5. Timeline Interaction Logic (Fixed) ---
    const handleTimelineMouseDown = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
        const clickedTime = (x - 200) / zoom; 

        // If not clicking a clip (bubbled up), drag playhead
        if (!draggingClipId) {
            setIsDraggingPlayhead(true);
            const t = Math.max(0, clickedTime);
            setCurrentTime(t);
            playbackTimeRef.current = t;
        }
    };

    const handleTimelineMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
  const timeAtMouse = Math.max(0, (x - 200) / zoom);

let finalTime = timeAtMouse;

    if (isSnappingEnabled) {
        const snapThreshold = 0.2; // seconds
        const snapPoints = [currentTime, 0]; // Snap to playhead and start
        tracks.forEach(t => {
            snapPoints.push(t.timelineStart);
            snapPoints.push(t.timelineStart + t.duration);
        });

        const closest = snapPoints.reduce((prev, curr) => 
            Math.abs(curr - timeAtMouse) < Math.abs(prev - timeAtMouse) ? curr : prev
        );

        if (Math.abs(closest - timeAtMouse) < snapThreshold) {
            finalTime = closest;
        }
    }

    if (resizingDuration) {
        setTracks(prev => prev.map(t => {
            if (t.id !== resizingDuration.id) return t;
            return resizingDuration.side === 'end' 
                ? { ...t, duration: Math.max(0.1, finalTime - t.timelineStart) }
                : { ...t, timelineStart: finalTime, duration: t.duration + (t.timelineStart - finalTime) };
        }));
    } else if (draggingClipId) {
        setTracks(prev => prev.map(t => t.id === draggingClipId ? { ...t, timelineStart: finalTime } : t));
    } else if (isDraggingPlayhead) {
        setCurrentTime(timeAtMouse);
        playbackTimeRef.current = timeAtMouse;
    }
    };

    const handleTimelineMouseUp = () => {
        setIsDraggingPlayhead(false);
        setDraggingClipId(null);
    };

    // Add Canvas Dragging (for image positioning)
// const handleCanvasMouseDown = (e) => {
//   const rect = canvasRef.current.getBoundingClientRect();
  
//   // 1. Calculate coordinates immediately
//   const x = (e.clientX - rect.left) / previewScale;
//   const y = (e.clientY - rect.top) / previewScale;

//   // 2. Identify active clips at the current playhead time, sorted by layer (top-most first)
//   const activeClips = [...tracks]
//     .filter(c => currentTime >= c.timelineStart && currentTime < c.timelineStart + c.duration)
//     .sort((a, b) => {
//     // We find the index of the layer in the layers array. 
//     // Higher index in the array = drawn later = appears on top.
//     const indexA = layers.findIndex(l => l.id === a.layer);
//     const indexB = layers.findIndex(l => l.id === b.layer);
//     return indexA - indexB; 
//   });

//   // 3. Find if the user clicked inside a clip's boundaries
//   const clickedClip = activeClips.find(c => 
//     x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h
//   );

//   if (clickedClip) {
//   const layerDef = layers.find(l => l.id === clickedClip.layer);
//   if (layerDef?.locked) return; 

//   setSelectedClipId(clickedClip.id);
//   setCanvasDraggingId(clickedClip.id);

//   const rotationRad = ((clickedClip.rotation || 0) * Math.PI) / 180;

// // Calculate where the rotate handle circle is visually after rotation
// // The handle is 30px above the top (which is centerY - h/2 - 30)
// const centerX = clickedClip.x + clickedClip.w / 2;
//   const centerY = clickedClip.y + clickedClip.h / 2;
// const distToHandle = (clickedClip.h / 2) + 30;
// const handleX = centerX + Math.sin(rotationRad) * distToHandle;
// const handleY = centerY - Math.cos(rotationRad) * distToHandle;
// const distToRotate = Math.sqrt((x - handleX)**2 + (y - handleY)**2);
  
//   // 2. Check for Resize Handle (bottom-right corner)
//   const isInResizeZone = x > clickedClip.x + clickedClip.w - 20 && 
//                          y > clickedClip.y + clickedClip.h - 20;

//   if (distToRotate < 15) {
//     setCanvasAction('rotating');
//   } else if (isInResizeZone) {
//     setCanvasAction('resizing');
//   } else {
//     // 3. Default to Moving
//     setCanvasAction('moving');
//     setDragOffset({ x: x - clickedClip.x, y: y - clickedClip.y });
//   }
// } else {
//   // Clicked empty canvas space
//   setSelectedClipId(null);
//   setCanvasDraggingId(null);
//   setCanvasAction(null);
// } 
// };
const handleCanvasMouseDown = (e) => {
  const rect = canvasRef.current.getBoundingClientRect();
  const x = (e.clientX - rect.left) / previewScale;
  const y = (e.clientY - rect.top) / previewScale;

  const activeClips = [...tracks]
    .filter(c => currentTime >= c.timelineStart && currentTime < c.timelineStart + c.duration)
    .sort((a, b) => {
      const indexA = layers.findIndex(l => l.id === a.layer);
      const indexB = layers.findIndex(l => l.id === b.layer);
      return indexB - indexA; // Top-most layer first for interaction
    });

  let foundAction = false;

  for (const clip of activeClips) {
    const layerDef = layers.find(l => l.id === clip.layer);
    if (layerDef?.locked) continue;

    const centerX = clip.x + clip.w / 2;
    const centerY = clip.y + clip.h / 2;
    const rotationRad = ((clip.rotation || 0) * Math.PI) / 180;

    // --- ROTATION HANDLE DETECTION ---
    const distToHandle = (clip.h / 2) + 30;
    const handleX = centerX + Math.sin(rotationRad) * distToHandle;
    const handleY = centerY - Math.cos(rotationRad) * distToHandle;
    const dist = Math.sqrt((x - handleX) ** 2 + (y - handleY) ** 2);

    if (dist < 15) {
      setSelectedClipId(clip.id);
      setCanvasDraggingId(clip.id);
      setCanvasAction('rotating');
      foundAction = true;
      break;
    }

    // --- BOUNDARY CHECK (Move/Resize) ---
    // Note: Simple AABB check. For rotated clips, this is the "unrotated" area.
    if (x >= clip.x && x <= clip.x + clip.w && y >= clip.y && y <= clip.y + clip.h) {
      setSelectedClipId(clip.id);
      setCanvasDraggingId(clip.id);
      
      const isInResizeZone = x > clip.x + clip.w - 20 && y > clip.y + clip.h - 20;
      if (isInResizeZone) {
        setCanvasAction('resizing');
      } else {
        setCanvasAction('moving');
        setDragOffset({ x: x - clip.x, y: y - clip.y });
      }
      foundAction = true;
      break;
    }
  }

  if (!foundAction) {
    setSelectedClipId(null);
    setCanvasDraggingId(null);
    setCanvasAction(null);
  }
};

const handleCanvasMouseMove = (e) => {
    if (!canvasDraggingId || !canvasAction) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / previewScale;
    const y = (e.clientY - rect.top) / previewScale;

    setTracks(prev => prev.map(c => {
        if (c.id !== canvasDraggingId) return c;

        if (canvasAction === 'moving') {
            return { ...c, x: x - dragOffset.x, y: y - dragOffset.y };
        } 
        
        if (canvasAction === 'rotating') {
    const centerX = c.x + c.w / 2;
    const centerY = c.y + c.h / 2;
    
    // Calculate angle from center to mouse
    const radians = Math.atan2(y - centerY, x - centerX);
    // Add 90 degrees (Math.PI/2) because handle starts at the top
    let deg = (radians * 180 / Math.PI) + 90;

    if (keysPressed.shift) deg = Math.round(deg / 15) * 15;
    return { ...c, rotation: deg };
}

        if (canvasAction === 'resizing') {
            let newW = x - c.x;
            let newH = y - c.y;

            if (keysPressed.shift) {
                const ratio = (c.nativeWidth || 400) / (c.nativeHeight || 300);
                newH = newW / ratio;
            }

            if (keysPressed.ctrl) {
                const centerX = c.x + c.w / 2;
                const centerY = c.y + c.h / 2;
                newW = Math.abs(x - centerX) * 2;
                newH = Math.abs(y - centerY) * 2;
                return { ...c, w: newW, h: newH, x: centerX - newW / 2, y: centerY - newH / 2 };
            }

            return { ...c, w: Math.max(10, newW), h: Math.max(10, newH) };
        }
        return c;
    }));
};

    const togglePlayback = () => {
    const nextPlayingState = !isPlaying;
    
    if (nextPlayingState) {
        // STARTING
        if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
        setIsPlaying(true);
    } else {
        // STOPPING
        setIsPlaying(false);
        cancelAnimationFrame(animationRef.current); // Force kill the loop
        // Immediately pause all videos
        Object.values(videoElementsRef.current).forEach(vid => vid.pause());
    }
};

const handleImport = async (file, type) => {
  const id = Math.random().toString(36).substr(2, 9);
  const url = URL.createObjectURL(file);
  const ext = file.name.split('.').pop().toLowerCase();
  
  let duration = 0;

  if (type === 'image') {
    // 1. Image Processing
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    imageElementsRef.current[id] = img;
    duration = 5; // Default duration for images is 5 seconds
    var nativeWidth = img.naturalWidth;
    var nativeHeight = img.naturalHeight;
  } else {
    // 2. Audio/Video Processing
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.src = url;
    el.crossOrigin = "anonymous";
    el.preload = "auto";

    // Wait for metadata to capture the exact duration
    await new Promise((resolve) => {
      el.onloadedmetadata = () => resolve();
    });

    duration = el.duration;
    var nativeWidth = el.videoWidth;
    var nativeHeight = el.videoHeight;
    videoElementsRef.current[id] = el; // We use videoElementsRef for both media types

    // --- Audio Routing Logic ---
    // Ensure the AudioContext is resumed (browser security)
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    // Create the source from the media element
    const source = audioCtxRef.current.createMediaElementSource(el);
    const gain = audioCtxRef.current.createGain();

    // Route: Source -> Gain -> Destination (Speakers) 
    // AND Source -> Gain -> AudioDest (Recorder)
    source.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    gain.connect(audioDestRef.current);
    
    // Store the gain node for muting/volume control later
    gainNodesRef.current[id] = gain;
  }

  // 3. Update Library State
  const newAsset = {
    id,
    name: file.name,
    url,
    type,
    ext,
    duration,
    file,// Stored for .qvid packaging later
    nativeWidth,
    nativeHeight 
  };

  setLibrary((prev) => [...prev, newAsset]);
};

// LAYER LOGICS

const renameLayer = (id, newName) => {
  setLayers(prev => prev.map(l => l.id === id ? { ...l, name: newName } : l));
};

const addLayerRelative = (index, direction) => {
  const newId = Math.max(...layers.map(l => l.id), 0) + 1;
  const newLayer = { id: newId, name: `Layer ${newId}`, locked: false };
  
  setLayers(prev => {
    const next = [...prev];
    // direction -1 for Above (previous index), 1 for Below (next index)
    const insertAt = direction === -1 ? index : index + 1;
    next.splice(insertAt, 0, newLayer);
    return next;
  });
};

const toggleLayerLock = (id) => {
  setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
};

const moveLayerOrder = (index, direction) => {
  const newLayers = [...layers];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= newLayers.length) return;
  
  // Check if either layer is locked
  if (newLayers[index].locked || newLayers[targetIndex].locked) return;

  // Swap
  [newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]];
  
  // Update the 'layer' property on all clips to match the new visual index
  const updatedTracks = tracks.map(track => {
    const oldLayerId = layers[index].id;
    const newLayerId = newLayers[targetIndex].id;
    // Logical remapping of clip.layer values based on the new array order
    return track; 
  });

  setLayers(newLayers);
};

const deleteLayer = (id) => {
  if (layers.find(l => l.id === id)?.locked) return;
  if (!window.confirm("Delete layer and all its clips?")) return;

  setTracks(prev => {
    const next = prev.filter(t => t.layer !== id);
    setTotalDuration(getProjectLength(next));
    return next;
  });
  setLayers(prev => prev.filter(l => l.id !== id));
};

const addAssetToLayer = (asset) => {
  const newClip = {
    ...asset,
    id: Math.random().toString(36).substr(2, 9), // Unique instance ID
    assetId: asset.id, // Reference to the original media
    timelineStart: currentTime,
    duration: asset.duration || asset.defaultDuration,
    layer: activeLayerId,//tracks.length,
    x: 100, y: 100, w: asset.naturalWidth || 400, h: asset.naturalHeight || 300,
    type: asset.type,
    muted: false, hidden: false
  };

  // Clone media nodes for audio/video to allow multiple instances
  if (asset.type !== 'image') {
    const original = videoElementsRef.current[asset.id];
    const clone = original.cloneNode();
    videoElementsRef.current[newClip.id] = clone;
    
    const source = audioCtxRef.current.createMediaElementSource(clone);
    const gain = audioCtxRef.current.createGain();
    source.connect(gain); gain.connect(audioCtxRef.current.destination); gain.connect(audioDestRef.current);
    gainNodesRef.current[newClip.id] = gain;
  }

  setTracks(prev => {
    const next = [...prev, newClip];
    setTotalDuration(getProjectLength(next));
    return next;
  });
};

const handlePasteToTimeline = () => { if(clipboard) addAssetToLayer(clipboard); };

useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'c' && selectedClipId) {
      setClipboard(tracks.find(t => t.id === selectedClipId));
    }
    if (e.ctrlKey && e.key === 'v' && clipboard) {
      const pasted = { ...clipboard, id: Math.random().toString(36).substr(2, 9), timelineStart: currentTime };
      setTracks(prev => [...prev, pasted]);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedClipId, clipboard, currentTime, tracks]);

useEffect(() => {
    const handleDown = (e) => setKeysPressed({ shift: e.shiftKey, ctrl: e.ctrlKey });
    const handleUp = (e) => setKeysPressed({ shift: e.shiftKey, ctrl: e.ctrlKey });
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
}, []);

    // --- Renderers ---

    const renderTimeline = () => {
    // Note: We now use the 'layers' state array directly instead of calculating it from clips
    // This ensures empty layers still show up and respect the set order.
    
    return (
        <div 
            ref={timelineContainerRef}
            className="bg-dark border border-secondary" 
            style={{ overflowX: 'auto', minHeight: '200px', userSelect: 'none' }}
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseLeave={handleTimelineMouseUp}
            onMouseUp={() => {handleTimelineMouseUp(); setResizingDuration(null); setCanvasAction(null);}}
        >
            <div style={{ width: `${totalDuration * zoom + 200}px`, position: 'relative' }}>
                
                {/* Time Ruler */}
                <div className="bg-secondary text-white border-bottom border-dark sticky-top" style={{height:'25px', zIndex: 11}}>
                    {Array.from({length: Math.floor(totalDuration) + 1}).map((_, i) => (
                      <span key={i} style={{
                          position:'absolute', 
                          left: i * zoom + 200, // Offset updated to 200
                          fontSize:'10px', 
                          width: zoom, 
                          borderLeft:'1px solid #666',
                          height: '10px'
                      }}>
                          {i}s
                      </span>
                  ))}
                    {/* Playhead */}
                    <div style={{
                        position:'absolute', left: currentTime * zoom + 200, // Offset updated to 200
                        height:'100vh', width:'2px', backgroundColor:'red', zIndex:100, pointerEvents:'none'
                    }} />
                </div>

                {/* Layers Mapping */}
                {layers.map((layer, idx) => (
                    <div key={layer.id} className="d-flex position-relative border-bottom border-secondary" style={{height:'60px', backgroundColor: activeLayerId === layer.id ? '#3a3a3a' : '#222' }}>
                        {/* LAYER SETTINGS PANEL (LEFT SIDE) */}
                        <div className="position-absolute sticky-start bg-dark border-end border-secondary d-flex align-items-center px-2" 
                             onClick={() => setActiveLayerId(layer.id)} 
        style={{
            width:'200px', 
            height:'100%', 
            zIndex:10, 
            left:0, 
            cursor: 'pointer',
            // CHANGE: Match background to parent row
            backgroundColor: activeLayerId === layer.id ? '#3a3a3a' : '#222' 
        }}>
                            
                            <Button size="sm" variant="link rounded-circle" className="p-0 me-1" onClick={() => toggleLayerLock(layer.id)}>
                                <i className={layer.locked ? 'bi bi-lock text-danger' : 'bi bi-unlock text-success'}></i>
                            </Button>
                            
                            <Form.Control 
                                size="sm" 
                                className="bg-transparent text-white border-0 p-0 shadow-none flex-grow-1"
                                value={layer.name}
                                disabled={layer.locked}
                                onChange={(e) => renameLayer(layer.id, e.target.value)}
                                style={{fontSize: '11px', fontWeight: 'bold'}}
                            />

                            <div className="d-flex flex-column ms-1 border-start border-secondary ps-1">
                                <Button size="sm" variant="link" className="p-0 lh-1 text-info text-decoration-none" 
                                        title="Add layer above" onClick={() => addLayerRelative(idx, -1)}>+↑</Button>
                                <Button size="sm" variant="link" className="p-0 lh-1 text-info text-decoration-none" 
                                        title="Add layer below" onClick={() => addLayerRelative(idx, 1)}>+↓</Button>
                            </div>

                            <div className="d-flex flex-column ms-1">
                                <Button size="sm" variant="link" className="p-0 lh-1 text-white text-decoration-none" style={{fontSize: '10px'}} 
                                        onClick={() => moveLayerOrder(idx, -1)} disabled={layer.locked || idx === 0}>▲</Button>
                                <Button size="sm" variant="link" className="p-0 lh-1 text-white text-decoration-none" style={{fontSize: '10px'}} 
                                        onClick={() => moveLayerOrder(idx, 1)} disabled={layer.locked || idx === layers.length - 1}>▼</Button>
                            </div>
                            
                            <Button size="sm" variant="link" className="p-0 text-danger ms-2 text-decoration-none" 
                                    onClick={() => deleteLayer(layer.id)} disabled={layer.locked}>✕</Button>
                        </div>

                        {/* CLIPS AREA */}
                        {tracks.filter(t => t.layer === layer.id).map(clip => (
                            <div 
                                key={clip.id}
                                onClick={(e) => { 
                                    if (layer.locked) return;
                                    e.stopPropagation(); 
                                    setSelectedClipId(clip.id); 
                                }}
                                onMouseDown={(e) => { 
                                    if (layer.locked) return;
                                    e.stopPropagation(); 
                                    setDraggingClipId(clip.id); 
                                    setIsResizingClipId(clip.id);
                                }}                                    
                                style={{
                                    position: 'absolute',
                                    left: clip.timelineStart * zoom + 200, // Offset updated to 200
                                    width: clip.duration * zoom,
                                    height: '50px',
                                    top: '5px',
                                    backgroundColor: selectedClipId === clip.id ? '#0d6efd' : '#495057',
                                    border: '1px solid #fff',
                                    borderRadius: '4px',
                                    cursor: layer.locked ? 'not-allowed' : 'grab',
                                    overflow: 'hidden',
                                    opacity: layer.locked ? 0.6 : 1
                                }}
                            >
                                {/* START RESIZE HANDLE */}
                                <div 
                                    onMouseDown={(e) => { if(!layer.locked) { e.stopPropagation(); setResizingDuration({id: clip.id, side: 'start'}); } }}
                                    style={{ position: 'absolute', left: 0, width: '10px', height: '100%', cursor: 'ew-resize', zIndex: 20 }} 
                                />

                                <div className="p-1 text-truncate text-white small" style={{fontSize:'10px', pointerEvents: 'none'}}>
                                    <i className={clip.type === 'image' ? 'bi bi-image' : clip.type === 'audio' ? 'bi bi-music-note' : 'bi bi-camera-reels-fill'}> {clip.name}</i>
                                </div>

                                {/* END RESIZE HANDLE */}
                                <div 
                                    onMouseDown={(e) => { if(!layer.locked) { e.stopPropagation(); setResizingDuration({id: clip.id, side: 'end'}); } }}
                                    style={{ position: 'absolute', right: 0, width: '10px', height: '100%', cursor: 'ew-resize', zIndex: 20 }} 
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

    return (
        <Container fluid className="vh-100 d-flex flex-column bg-dark p-0 text-light">
            {Object.keys(inputRefs).map(k => (
                <>
                <input key={k} type="file" ref={inputRefs[k]} accept={k==='qvid'?'.qvid':`.${k}`} style={{display:'none'}} 
                       onChange={e => k==='qvid' ? handleDeepImport(e.target.files[0]) : importAsset(e.target.files[0])} />
                  <input type="file" ref={inputRefs.img} accept="image/*" style={{display:'none'}} onChange={e => handleImport(e.target.files[0], 'image')} />
                <input type="file" ref={inputRefs.aud} accept="audio/mp3,audio/wav,audio/aac,audio/ogg" style={{display:'none'}} onChange={e => handleImport(e.target.files[0], 'audio')} />
                </>  
            ))}
            <Row className="bg-secondary p-1 m-0 align-items-center justify-content-between border-bottom border-dark">
                <Col md={2}>
                    <Form.Control size="sm" value={projectName} onChange={e => setProjectName(e.target.value)} className="bg-dark text-white border-secondary" />
                </Col>
                <Col md={4} className="d-flex gap-2 justify-content-center">
                    <Button 
                        variant={isPlaying ? "warning rounded-circle" : "success rounded-circle"} 
                        size="sm" 
                        onClick={togglePlayback}
                    >
                        {isPlaying ? "⏸" : "▶"}
                    </Button>
                    <div className="vr bg-dark"></div>
                    <Button variant="danger rounded-circle" size="sm" onClick={handleSplit} disabled={!selectedClipId} title='Split'>✂</Button>
                    <Button variant="outline-light rounded-circle" size="sm" onClick={handleRemove} disabled={!selectedClipId} title='Delete'><i className='bi bi-trash'></i></Button>
                    <div className="vr bg-dark"></div>
                    <Button variant="secondary rounded-circle" size="sm" onClick={() => setShowSettings(true)}><i className='bi bi-gear-fill'></i></Button>
                    <Button 
    variant={isSnappingEnabled ? "success rounded-circle" : "danger rounded-circle"} 
    size="sm" 
    onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
    className="ms-2"
    title={isSnappingEnabled ? "Snapping Enabled" : "Snapping Disabled"}
>
    <i className='bi bi-magnet'></i>
</Button>
                </Col>
                <Col md={6} className="d-flex justify-content-end p-0">
                    <div className="d-flex gap-2 overflow-auto" style={{maxWidth:'100%'}}>
                        {/* Imports */}
                        <div className="border border-secondary p-1 rounded d-flex gap-1 bg-dark">
                            <small className="align-self-center mx-1" style={{fontSize:'9px'}}>IMPORT</small>
                            <Button variant="outline-secondary" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.img.current.click()}>IMG</Button>
                            <Button variant="outline-secondary" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.aud.current.click()}>AUD</Button>
                            <Button variant="outline-secondary" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.mp4.current.click()}>MP4</Button>
                            <Button variant="outline-secondary" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.mov.current.click()}>MOV</Button>
                            <Button variant="outline-secondary" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.webm.current.click()}>WEBM</Button>
                            <Button variant="outline-warning" size="sm" style={{fontSize:'10px'}} onClick={() => inputRefs.qvid.current.click()}>QVID</Button>
                        </div>
                        {/* Saves */}
                        <div className="border border-secondary p-1 rounded d-flex gap-1 bg-dark">
                            <small className="align-self-center mx-1" style={{fontSize:'9px'}}>SAVE</small>
                            <Button variant="success" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('save', 'mp4')}>MP4</Button>
                            <Button variant="success" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('save', 'mov')}>MOV</Button>
                            <Button variant="success" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('save', 'webm')}>WEBM</Button>
                            <Button variant="info" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('save', 'qvid')}>QVID</Button>
                        </div>
                        {/* Downloads */}
                        <div className="border border-secondary p-1 rounded d-flex gap-1 bg-dark">
                            <small className="align-self-center mx-1" style={{fontSize:'9px'}}>DOWNLOAD</small>
                            <Button variant="outline-light" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('dl', 'mp4')}>MP4</Button>
                            <Button variant="outline-light" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('dl', 'mov')}>MOV</Button>
                            <Button variant="outline-light" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('dl', 'webm')}>WEBM</Button>
                            <Button variant="outline-info" size="sm" style={{fontSize:'10px'}} onClick={() => handleExport('dl', 'qvid')}>QVID</Button>
                        </div>
                    </div>
                </Col>
            </Row>

            <Row className="flex-grow-1 m-0" style={{overflow:'hidden'}}>
                {/* Left Sidebar: Clips Window */}
                <Col md={2} className="bg-dark border-end border-secondary p-2 d-flex flex-column">
                    <h6>Clips Library</h6>
                    <Form.Select size="sm" className="mb-2" onChange={(e) => setLibraryFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="video">Videos</option>
                    <option value="image">Images</option>
                    <option value="audio">Audio</option>
                    </Form.Select>
                    <div className="flex-grow-1 overflow-auto">
                    {library.filter(item => libraryFilter === 'all' || item.type === libraryFilter).map(item => (
                        <div key={item.id} className="p-1 mb-1 bg-secondary rounded d-flex justify-content-between">
                        <span className="text-truncate" style={{maxWidth:'10vw'}}>{item.name}</span>
                        <div className="d-flex justify-content-end gap-2">
                        <Button size="xs" variant="outline-primary rounded-circle" className="flex-shrink-0" onClick={() => addAssetToTimeline(item)}>+</Button>
                        {/* Delete from Library Button */}
                        <Button size="sm" variant="outline-danger rounded-circle" className="flex-shrink-0"
                                onClick={() => { if(window.confirm('Remove from library and timeline?')) deleteFromLibrary(item.id) }}>
                            <i className='bi bi-x'></i>
                        </Button>
                        </div>
                        </div>
                    ))}
                    </div>
                </Col>
                {/* Main Canvas */}
                <Col md={8} className="d-flex flex-column p-0">
                    <div className="flex-grow-1 bg-black d-flex align-items-center justify-content-center position-relative">
                        {isExporting && (
                            <div className="position-absolute bg-dark p-3 rounded text-center shadow" style={{zIndex:200}}>
                                <h6>Rendering Export...</h6>
                                <ProgressBar animated now={exportProgress} label={`${exportProgress}%`} />
                            </div>
                        )}
                        <canvas 
                            ref={canvasRef} 
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={() => {setCanvasDraggingId(null);setResizingDuration(null); setCanvasAction(null);}}
                            width={exportConfig.width * previewScale} 
                            height={exportConfig.height * previewScale}
                            style={{ 
                                maxHeight: '100%', maxWidth: '100%', 
                                border: '1px solid #444', 
                                aspectRatio: `${exportConfig.width}/${exportConfig.height}` 
                            }}
                        />
                    </div>
                    
                    <div style={{height: '300px', overflowY:'auto'}}>
                         {renderTimeline()}
                    </div>
                </Col>
                {/* 3. RIGHT SIDEBAR: Clip Settings */}
  <Col md={2} className="bg-dark p-2 overflow-auto">
    <h6 className="border-bottom border-secondary pb-2 mb-3">Clip Settings</h6>
    
    {selectedClipId ? (() => {
      const clip = tracks.find(t => t.id === selectedClipId);
      if (!clip) return <div className="text-muted small">Clip not found</div>;

      return (
        <div className="d-flex flex-column gap-3 small">
          <div className="fw-bold text-info">{clip.name}</div>
          
          {/* 1. Visibility & Audio Toggles */}
          <div className="d-flex justify-content-between">
            <Form.Check type="switch" label="Mute" checked={clip.muted} onChange={e => updateClip(clip.id, { muted: e.target.checked })} />
            <Form.Check type="switch" label="Hide" checked={clip.hidden} onChange={e => updateClip(clip.id, { hidden: e.target.checked })} />
          </div>

          {/* 2. Opacity */}
          <div>
            <label>Opacity: {Math.round((clip.opacity||1)*100)}%</label>
            <input type="range" className="form-range" min="0" max="1" step="0.1" 
              value={clip.opacity !== undefined ? clip.opacity : 1} 
              onChange={e => updateClip(clip.id, { opacity: parseFloat(e.target.value) })} />
          </div>

          {/* 3. Volume (Gain) */}
          {clip.type !== 'image' && (
            <div>
              <label>Volume: {clip.volume||100}%</label>
              <input type="range" className="form-range" min="0" max="200" step="1" 
                value={clip.volume !== undefined ? clip.volume : 100} 
                onChange={e => updateClip(clip.id, { volume: parseInt(e.target.value) })} />
            </div>
          )}

          {/* 4. Brightness */}
          {clip.type !== 'audio' && (
            <>
            <div>
              <label>Brightness: {clip.brightness||100}%</label>
              <input type="range" className="form-range" min="0" max="200" step="10" 
                value={clip.brightness !== undefined ? clip.brightness : 100} 
                onChange={e => updateClip(clip.id, { brightness: parseInt(e.target.value) })} />
            </div>
            <div>
  <label>Rotation: {Math.round(clip.rotation || 0)}°</label>
  <input 
    type="range" 
    className="form-range" 
    min="-180" 
    max="180" 
    step="1" 
    value={clip.rotation !== undefined ? clip.rotation : 0} 
    onChange={e => updateClip(clip.id, { rotation: parseInt(e.target.value) })} 
  />
  <div className="d-flex justify-content-between mt-1">
     {/* Helper buttons for quick snapping */}
     <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => updateClip(clip.id, { rotation: 0 })}>Reset</button>
     <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => updateClip(clip.id, { rotation: (clip.rotation || 0) + 90 })}>+90°</button>
  </div>
</div>
            </>
          )}

          {/* 5. Dimensions */}
          {clip.type !== 'audio' && (
            <>
              <div className="border-top border-secondary pt-2">Dimensions</div>
              <Row className="g-1">
                <Col><Form.Control size="sm" type="number" placeholder="W" value={Math.round(clip.w)} onChange={e => updateClip(clip.id, { w: parseInt(e.target.value) })} /></Col>
                <Col><Form.Control size="sm" type="number" placeholder="H" value={Math.round(clip.h)} onChange={e => updateClip(clip.id, { h: parseInt(e.target.value) })} /></Col>
              </Row>
            </>
          )}

          {/* 6. Position */}
          {clip.type !== 'audio' && (
            <>
              <div className="mt-1">Position (X, Y)</div>
              <Row className="g-1">
                <Col><Form.Control size="sm" type="number" placeholder="X" value={Math.round(clip.x)} onChange={e => updateClip(clip.id, { x: parseInt(e.target.value) })} /></Col>
                <Col><Form.Control size="sm" type="number" placeholder="Y" value={Math.round(clip.y)} onChange={e => updateClip(clip.id, { y: parseInt(e.target.value) })} /></Col>
              </Row>
            </>
          )}

          <div className="text-muted mt-3" style={{fontSize:'10px'}}>
             ID: {clip.id.substr(0,4)}...
          </div>
        </div>
      );
    })() : (
      <div className="text-muted text-center mt-5" style={{fontSize:'12px'}}>
        Select a clip on the timeline to edit settings.
      </div>
    )}
  </Col>
            </Row>

            <Modal show={showSettings} onHide={() => setShowSettings(false)} centered className="text-dark">
                <Modal.Header closeButton>
                    <Modal.Title>Project Settings</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group className="mb-3">
                        <Form.Label>Preview Quality</Form.Label>
                        <Form.Select value={previewScale} onChange={e => setPreviewScale(parseFloat(e.target.value))}>
                            <option value="1">Full Res</option>
                            <option value="0.5">1/2 Res (Faster)</option>
                            <option value="0.25">1/4 Res (Fastest)</option>
                        </Form.Select>
                    </Form.Group>
                    <h6>Export Configuration</h6>
                    <Row>
                        <Col><Form.Control type="number" placeholder="Width" value={exportConfig.width} onChange={e => setExportConfig({...exportConfig, width: parseInt(e.target.value)})}/></Col>
                        <Col><Form.Control type="number" placeholder="Height" value={exportConfig.height} onChange={e => setExportConfig({...exportConfig, height: parseInt(e.target.value)})}/></Col>
                    </Row>
                    <Row className="mt-2">
                        <Col><Form.Control type="number" placeholder="FPS" value={exportConfig.fps} onChange={e => setExportConfig({...exportConfig, fps: parseInt(e.target.value)})}/></Col>
                        <Col><Form.Control type="number" placeholder="Bitrate" value={exportConfig.bitrate} onChange={e => setExportConfig({...exportConfig, bitrate: parseInt(e.target.value)})}/></Col>
                    </Row>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => setShowSettings(false)}>Close</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default VideoEditor;