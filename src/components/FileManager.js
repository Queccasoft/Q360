import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, ListGroup, Card, Form, Modal, Alert, Stack, Dropdown } from 'react-bootstrap';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import indexedDBService from '../services/IndexedDBService';
import QSlide from './QSlide';
import ImageEditor from './ImageEditor';
import QDoc from './QDoc';
import QSheet from './QSheet';
import AudioEditor from './AudioEditor';
import VideoEditor from './VideoEditor';
import NoteEditor from './NotesApp';
import QMailEditor from './QMailEditor';
import QJson from './QJson';
import officeLogo from "../Assets/Header/q360/q360.png";
import qnoteLogo from "../Assets/Header/q360/qnote.png";
import qdocLogo from "../Assets/Header/q360/qdoc.png";
import qsheetLogo from "../Assets/Header/q360/qsheet.png";
import qslideLogo from "../Assets/Header/q360/qslide.png";
import qcanvaLogo from "../Assets/Header/q360/qcanva.png";
import qwaveLogo from "../Assets/Header/q360/qwave.png";
import qmailLogo from "../Assets/Header/q360/qmail.png";
import qjsonLogo from "../Assets/Header/q360/qjson.png";
import qvidLogo from "../Assets/Header/q360/qvid.png"
import { Bold } from 'lucide-react';

const DB_NAME = 'FolderManagerDB';
const DB_VERSION = 1;
const STORE_NAME = 'folders';

const FileManager = () => {
    const [workspaceHandle, setWorkspaceHandle] = useState(null);
    const [folders, setFolders] = useState([]);
    const [activeFolder, setActiveFolder] = useState(null);
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [showDocModal, setShowDocModal] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);
    const [showSheetModal, setShowSheetModal] = useState(false);
    const [showSlideModal, setShowSlideModal] = useState(false);
    const [showAudioModal, setShowAudioModal] = useState(false);    
    const [showEmailEditorModal, setShowEmailEditorModal] = useState(false);
    const [showVideoModal, setShowVideoModal] = useState(false);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showJsonEditorModal, setShowJsonEditorModal] = useState(false);
    const [openWithFile, setOpenWithFile] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    useEffect(() => {
        const init = async () => {
            await indexedDBService.createDatabaseWithObjectStores(DB_NAME, DB_VERSION, [STORE_NAME]);
            loadWorkspace();
        };
        init();
    }, []);

    // 1. Load the "Parent" Workspace from IndexedDB
    const loadWorkspace = async () => {
        const result = await indexedDBService.getObjectStore(DB_NAME, DB_VERSION, STORE_NAME);
        if (result.data && result.data.length > 0) {
            const savedWorkspace = result.data[0]; // Assuming one workspace for simplicity
            setWorkspaceHandle(savedWorkspace.handle);
            refreshFolderList(savedWorkspace.handle);
        }
    };

    // 2. Scan the Workspace for sub-folders only
    const refreshFolderList = async (parentHandle) => {
        try {
            const subFolders = [];
            for await (const entry of parentHandle.values()) {
                if (entry.kind === 'directory') {
                    subFolders.push(entry);
                }
            }
            setFolders(subFolders);
        } catch (err) {
            console.error("Could not sync folders:", err);
        }
    };

    const connectWorkspace = async () => {
        try {
            const handle = await window.showDirectoryPicker();
            await indexedDBService.addObjectInObjectStore(DB_NAME, DB_VERSION, STORE_NAME, { name: handle.name, handle: handle });
            setWorkspaceHandle(handle);
            refreshFolderList(handle);
        } catch (err) { console.error(err); }
    };

    const disconnectWorkspace = async () => {
    if (!window.confirm("Are you sure you want to disconnect this workspace?")) return;
    try {
        // Directly use your clearObjectStore method from your service file
        await indexedDBService.clearObjectStore(DB_NAME, DB_VERSION, STORE_NAME);

        // Reset all UI states back to initial values
        setWorkspaceHandle(null);
        setFolders([]);
        setActiveFolder(null);
        setFiles([]);
        
        alert("Workspace disconnected successfully.");
    } catch (err) {
        console.error("Disconnect failed:", err);
        alert("Failed to disconnect workspace from database.");
    }
    };

    // 1. Create a New Folder inside Root
    const createNewFolder = async () => {
        if (!workspaceHandle) return alert("Please connect a Root folder first.");
        const folderName = prompt("Enter new folder name:");
        if (!folderName) return;
        try {
            // This creates the physical directory on disk
            await workspaceHandle.getDirectoryHandle(folderName, { create: true });
            refreshFolderList(workspaceHandle);
        } catch (err) {
            console.error("Could not create folder:", err);
            alert("Error creating folder. Ensure the name is valid.");
        }
    };

    // 2. Rename an existing Folder
const renameFolder = async (e, oldName) => {
    e.stopPropagation();
    const newName = prompt("Enter new name for the folder:", oldName);
    if (!newName || newName === oldName) return;

    try {
        // 1. Get the handle of the old folder
        const oldFolderHandle = await workspaceHandle.getDirectoryHandle(oldName);
        
        // 2. Create the new folder
        const newFolderHandle = await workspaceHandle.getDirectoryHandle(newName, { create: true });

        // 3. Helper function to recursively copy contents from old to new
        const copyDirectoryContents = async (srcDir, destDir) => {
            for await (const entry of srcDir.values()) {
                if (entry.kind === 'file') {
                    const srcFileHandle = await srcDir.getFileHandle(entry.name);
                    const destFileHandle = await destDir.getFileHandle(entry.name, { create: true });
                    const file = await srcFileHandle.getFile();
                    const writable = await destFileHandle.createWritable();
                    await writable.write(file);
                    await writable.close();
                } else if (entry.kind === 'directory') {
                    const newSrcDir = await srcDir.getDirectoryHandle(entry.name);
                    const newDestDir = await destDir.getDirectoryHandle(entry.name, { create: true });
                    await copyDirectoryContents(newSrcDir, newDestDir);
                }
            }
        };

        // 4. Copy all files and subfolders into the new directory
        await copyDirectoryContents(oldFolderHandle, newFolderHandle);

        // 5. Delete the old directory
        await workspaceHandle.removeEntry(oldName, { recursive: true });

        // Sync UI states
        if (activeFolder?.name === oldName) setActiveFolder(null);
        refreshFolderList(workspaceHandle);
    } catch (err) {
        console.error("Rename failed:", err);
        alert("Rename failed. Ensure no files inside the folder are currently open in another program.");
    }
};

    // 3. Delete the actual sub-folder from disk using the parent handle
    const deleteFolderFromDisk = async (e, folderName) => {
        e.stopPropagation();
        if (!window.confirm(`PERMANENTLY delete the folder "${folderName}" and all contents?`)) return;
        try {
            // We call removeEntry on the WORKSPACE (the parent)
            await workspaceHandle.removeEntry(folderName, { recursive: true });
            if (activeFolder?.name === folderName) setActiveFolder(null);
            refreshFolderList(workspaceHandle);
            alert("Folder deleted from disk.");
        } catch (err) {
            console.error("Deletion failed", err);
            alert("Delete failed. Folder may be in use.");
        }
    };

    const openFolder = async (folderHandle) => {
        const options = { mode: 'readwrite' };
        if ((await folderHandle.queryPermission(options)) === 'granted' || 
            (await folderHandle.requestPermission(options)) === 'granted') {
            setSearchTerm('');
            setActiveFolder(folderHandle);
            refreshFileList(folderHandle);
        }
    };

    const refreshFileList = async (folderHandle) => {
  try {
    const entries = [];
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && (
        
        entry.name.endsWith('.txt') ||
        entry.name.endsWith('.odt') ||
        entry.name.endsWith('.qdoc') ||
        entry.name.endsWith('.docx') ||

        entry.name.endsWith('.pptx') ||
        entry.name.endsWith('.odp') ||
        entry.name.endsWith('.qslide') ||
        entry.name.endsWith('.pdf') ||
        entry.name.endsWith('.md') ||

        entry.name.endsWith('.png') || 
        entry.name.endsWith('.jpg') || 
        entry.name.endsWith('.jpeg') || 
        entry.name.endsWith('.svg') || 
        entry.name.endsWith('.qcanva') ||

        entry.name.endsWith('.ods') || 
        entry.name.endsWith('.qsheet') ||
        entry.name.endsWith('.csv') ||

        entry.name.endsWith('.mp3') ||
        entry.name.endsWith('.aac') ||
        entry.name.endsWith('.ogg') ||
        entry.name.endsWith('.wav') ||
        entry.name.endsWith('.qwave') ||

        entry.name.endsWith('.mp4') ||
        entry.name.endsWith('.mov') ||
        entry.name.endsWith('.qvid') ||

        entry.name.endsWith('.qnote') ||
        entry.name.endsWith('.html') ||
        entry.name.endsWith('.json')
      )) {
        entries.push(entry);
      }
    }
    setFiles(entries);
  } catch (err) { console.error(err); }
    };

    const renameFile = async (e, fileHandle) => {
        e.stopPropagation();
        const newName = prompt("Enter new filename (without .txt):", fileHandle.name.replace('.txt', ''));
        if (!newName) return;

        const finalName = newName.endsWith('.txt') ? newName : `${newName}.txt`;

        try {
            // 1. Check if we are in the active folder
            if (!activeFolder) return;

            // 2. Use move() - note that move() is supported in Chrome/Edge
            await fileHandle.move(finalName);
            
            // 3. IMPORTANT: Pass the handle explicitly back to refresh
            await refreshFileList(activeFolder);
        } catch (err) {
            console.error(err);
            alert("Rename failed. This happens if the file is open or the name already exists.");
        }
    };

    // --- Open File with Specific App ---
const openWithApp = async (fileHandle, appType) => {
    setOpenWithFile(null);
  try {
    if (appType === 'doc') {
      // QDoc expects the underlying File object rather than the FileSystemFileHandle
      const fileObject = await fileHandle.getFile();
      setSelectedFile(fileObject);
      setShowDocModal(true);
    } else {
      setSelectedFile(fileHandle);
      if (appType === 'slide') setShowSlideModal(true);
      else if (appType === 'image') setShowImageModal(true);
      else if (appType === 'sheet') setShowSheetModal(true);
      else if (appType === 'audio') setShowAudioModal(true);
      else if (appType === 'video') setShowVideoModal(true);
      else if (appType === 'note') setShowNoteModal(true);
      else if (appType === 'email') setShowEmailEditorModal(true);
      else if (appType === 'json') setShowJsonEditorModal(true);
    }
  } catch (err) {
    console.error("Failed to open file with selected app:", err);
    alert("Could not open file with this application.");
  }
};

    // --- File Operations ---
    const deleteFile = async (e, fileName) => {
        e.stopPropagation();
        if (!window.confirm(`Delete ${fileName}?`)) return;
        try {
            await activeFolder.removeEntry(fileName);
            refreshFileList(activeFolder);
        } catch (err) { alert("Delete failed."); }
    };

    const renderFileIcon = (f) => {
    if (f.name.endsWith('.pptx')) return 'bi bi-file-earmark-ppt-fill text-danger';
    else if (f.name.endsWith('.qslide')) return 'bi bi-file-slides-fill text-danger';
    else if (f.name.endsWith('.md')) return 'bi bi-markdown-fill text-danger';
    else if (f.name.endsWith('.pdf')) return 'bi bi-file-earmark-pdf-fill text-danger';
    else if (f.name.endsWith('.odp')) return 'bi bi-file-earmark-ppt-fill text-danger';
    
    else if (f.name.endsWith('.qcanva')) return 'bi bi-palette-fill text-danger';
    else if (f.name.endsWith('.svg')) return 'bi bi-filetype-svg text-danger';
    else if (f.name.endsWith('.png')) return 'bi bi-filetype-png text-danger';
    else if (f.name.endsWith('.jpg')) return 'bi bi-filetype-danger';
    else if (f.name.endsWith('.jpeg')) return 'bi bi-filetype-jpg text-danger';
    
    else if (f.name.endsWith('.txt')) return 'bi bi-filetype-txt text-primary';
    else if (f.name.endsWith('.docx')) return 'bi bi-filetype-docx text-primary';
    else if (f.name.endsWith('.odt')) return 'bi bi-filetype-txt text-primary';
    else if (f.name.endsWith('.qdoc')) return 'bi bi-filetype-doc text-primary';
    
    else if (f.name.endsWith('.ods')) return 'bi bi-file-earmark-spreadsheet-fill text-success';
    else if (f.name.endsWith('.qsheet')) return 'bi bi-file-earmark-excel-fill text-success';
    else if (f.name.endsWith('.csv')) return 'bi bi-filetype-csv text-success';
    
    else if (f.name.endsWith('.mp3')) return 'bi bi-filetype-mp3 text-info';
    else if (f.name.endsWith('.aac')) return 'bi bi-filetype-aac text-info';
    else if (f.name.endsWith('.ogg')) return 'bi bi-speaker-fill text-info';
    else if (f.name.endsWith('.wav')) return 'bi bi-file-earmark-music-fill text-info';
    else if (f.name.endsWith('.qwave')) return 'bi bi-soundwave text-info';

    else if (f.name.endsWith('.mp4')) return 'bi bi-filetype-mp4 text-dark';
    else if (f.name.endsWith('.mov')) return 'bi bi-filetype-mov text-dark';
    else if (f.name.endsWith('.qvid')) return 'bi bi-camera-video-fill text-dark';

    else if (f.name.endsWith('.qnote')) return 'bi bi-card-list text-warning';
    else if (f.name.endsWith('.html')) return 'bi bi-filetype-html text-warning';
    
    else if (f.name.endsWith('.json')) return 'bi bi-filetype-json text-success';

    else return ' '; // Standard Image
    };

    const handleNoteSave = async (blob, name, extension) => {
  if (!activeFolder) return;
  try {
    const fileHandle = await activeFolder.getFileHandle(`${name}${extension}`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    alert(`Saved ${name}${extension} to ${activeFolder.name}`);
    refreshFileList(activeFolder);
  } catch (err) {
    console.error("Save to folder failed", err);
    alert("Could not save to folder. Try downloading instead.");
  }
    };

    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // Strip the data:prefix
    reader.onerror = reject;
    reader.readAsDataURL(blob);
    });

    const handleShare = async (blob, name, extension) => {
        if (Capacitor.isNativePlatform()) {
    try {
        const base64Data = await blobToBase64(blob);
        const fileName = `${name}${extension}`;
        
        // Save to cache temporarily so we can share the file URI
        const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
        });

        await Share.share({
        title: 'Share File',
        url: savedFile.uri, 
        });
    } catch (err) {
        console.error("Share failed", err);
    }
    }
    else{
        alert("Sharing is not available for browsers / desktops!")
    }
    };

    const handleSave = async (blob, name, extension) => {
    if (Capacitor.isNativePlatform()) {
        return handleShare(blob, name, extension);
    }

    if (!activeFolder) return;
    try {
        const fileHandle = await activeFolder.getFileHandle(`${name}${extension}`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert(`Saved ${name}${extension} to ${activeFolder.name}`);
        refreshFileList(activeFolder);
    } catch (err) {
        console.error("Save to folder failed", err);
        alert("Could not save to folder. Try downloading instead.");
    }
    };

    const handleDownload = async (blob, name, extension) => {
    if (Capacitor.isNativePlatform()) {
        try {
        // Check/Request permissions
        const perm = await Filesystem.checkPermissions();
        if (perm.publicStorage !== 'granted') {
            await Filesystem.requestPermissions();
        }

        const base64Data = await blobToBase64(blob);
        await Filesystem.writeFile({
            path: `${name}${extension}`,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true
        });
        alert("File downloaded.");
        } catch (err) {
        console.warn("Download failed, falling back to share", err);
        handleShare(blob, name, extension);
        }
        return;
    }

    // Desktop Fallback (Original Logic)
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${name}${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
    };

// --- NEW: Recursive Deep Search (Obsidian-Style Vault Search) ---
const searchWorkspaceGlobally = async (dirHandle, fileName) => {
    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase() === fileName.toLowerCase()) {
                return entry;
            } else if (entry.kind === 'directory') {
                // Skip hidden folders (like .git or system folders) to speed up search
                if (entry.name.startsWith('.')) continue;
                const found = await searchWorkspaceGlobally(entry, fileName);
                if (found) return found;
            }
        }
    } catch (err) {
        // Silently skip folders we don't have permission to read
    }
    return null;
};

// --- UPDATED: Exact Path Search ---
const findFileByPath = async (dirHandle, pathParts) => {
    if (pathParts.length === 0) return null;
    const currentPart = pathParts[0].trim();
    
    try {
        for await (const entry of dirHandle.values()) {
            if (entry.name.toLowerCase() === currentPart.toLowerCase()) {
                if (entry.kind === 'file' && pathParts.length === 1) {
                    return entry;
                } else if (entry.kind === 'directory' && pathParts.length > 1) {
                    return await findFileByPath(entry, pathParts.slice(1));
                }
            }
        }
    } catch (err) {
        console.error("Error searching directory:", err);
    }
    return null;
};

// --- UPDATED: Global Link Handler for WASM & QDoc ---
useEffect(() => {
    window.handleDocumentLinkClick = async (url) => {
        // 1. Handle External Web Links
        if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank');
            return;
        }

        // 2. Clean internal link format 
        // Removes [[, ]], and any leading slashes or dot-slashes (/, \, ./)
        let cleanPath = decodeURIComponent(url).replace(/^\[\[|\]\]$/g, '').trim();
        cleanPath = cleanPath.replace(/^(\.\/|\/|\\)+/, ''); 
        
        const pathParts = cleanPath.split(/[/\\]/).filter(Boolean);
        const targetFileName = pathParts[pathParts.length - 1];

        if (workspaceHandle) {
            let fileHandle = null;

            // Strategy A: Try Exact Path Mapping First (if they provided folders)
            if (pathParts.length > 0) {
                fileHandle = await findFileByPath(workspaceHandle, pathParts);
            }

            // Strategy B: Global Vault Search (Obsidian Style)
            // If the exact path fails (or they just linked [[test1.qdoc]]), search the whole workspace
            if (!fileHandle && targetFileName) {
                fileHandle = await searchWorkspaceGlobally(workspaceHandle, targetFileName);
            }

            if (fileHandle) {
                // Trigger Save & Close for currently open apps
                setShowDocModal(false);
                setShowSlideModal(false);
                setShowSheetModal(false);
                setShowImageModal(false);
                setShowAudioModal(false);
                setShowVideoModal(false);
                setShowNoteModal(false);
                setShowEmailEditorModal(false);
                setShowJsonEditorModal(false);

                // Open the target file with the App Selector
                setOpenWithFile(fileHandle);
            } else {
                alert(`File not found in workspace: ${cleanPath}`);
            }
        } else {
            alert("Please connect a Root Folder to resolve local links.");
        }
    };

    return () => { delete window.handleDocumentLinkClick; };
}, [workspaceHandle]);

    return (
        <Container fluid className="py-5">
            <Row>
                <Col md={2}>
                    <Card className="shadow-sm" style={{overflowX: "scroll",
                                outline: 'none',
                                    scrollbarWidth: 'none',
                                    WebkitOverflowScrolling: 'touch'
                            }}>
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <strong>Folders</strong>
                            <Stack direction="horizontal" gap={1}>
                                <Button variant="outline-warning rounded-circle" size="sm" onClick={connectWorkspace} title="Connect Folder"><i className='bi-folder-symlink-fill'></i></Button>
                                {workspaceHandle &&
                                <><Button variant="outline-primary rounded-circle" size="sm" onClick={createNewFolder} title="New Folder"><i className='bi-folder-plus'></i></Button>
                                <Button variant="outline-danger rounded-circle" size="sm" onClick={disconnectWorkspace} title="Disconnect all Folders"><i className='bi-folder-minus'></i></Button>
                                </>}
                            </Stack>
                        </Card.Header>
                        <ListGroup variant="flush">
                            {folders.map(f => (
                                <ListGroup.Item 
                                    key={f.name} 
                                    action 
                                    active={activeFolder?.name === f.name}
                                    onClick={() => openFolder(f)}
                                    className="d-flex justify-content-between align-items-center"
                                >
                                    <span className="text-truncate" style={{ maxWidth: '150px' }}><i className="bi bi-folder text-warning"></i> {f.name}</span>
                                    <Stack direction="horizontal" gap={3}>
                                        <Button 
                                            variant="link" 
                                            size="sm" 
                                            className="p-0 text-success"
                                            title='Rename Folder'
                                            onClick={(e) => renameFolder(e, f.name)}
                                        >
                                            <i className="bi bi-pencil"></i>
                                        </Button>
                                        <Button 
                                            variant="link" 
                                            size="sm" 
                                            className="p-0 text-danger"
                                            title='Delete Folder from Disk'
                                            onClick={(e) => deleteFolderFromDisk(e, f.name)}
                                        >
                                            <i className="bi bi-trash"></i>
                                        </Button>
                                    </Stack>
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </Card>
                </Col>
                <Col md={10}>
                    {activeFolder ? (
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center" 
                            style={{overflowX: "scroll",
                                outline: 'none',
                                    scrollbarWidth: 'none',
                                    WebkitOverflowScrolling: 'touch'
                            }}>
                                {/* <strong>Files in {activeFolder.name}</strong> */}
                                <Stack direction="horizontal" gap={3}>
                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowDocModal(true); }} title="QDoc" >
                                    <img src={qdocLogo} alt="QDoc" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowSheetModal(true); }} title="QSheet" >
                                    <img src={qsheetLogo} alt="QSheet" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowImageModal(true); }} title="QCanva" >
                                    <img src={qcanvaLogo} alt="QCanva" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowSlideModal(true); }} title="QSlides" >
                                    <img src={qslideLogo} alt="QSlides" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowAudioModal(true); }} title="QWave">
                                    <img src={qwaveLogo} alt="QWave" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowVideoModal(true); }} title="QVid" >
                                    <img src={qvidLogo} alt="QVid" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowNoteModal(true); }} title="QNote" >
                                    <img src={qnoteLogo} alt="QNote" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowEmailEditorModal(true); }} title="Email" >
                                    <img src={qmailLogo} alt="Email" style={{ height: '5vh', width: 'auto' }} />
                                </Button>

                                <Button variant="light" size="sm" onClick={() => { setSelectedFile(null); setShowJsonEditorModal(true); }} title="JSON" >
                                    <img src={qjsonLogo} alt="JSON" style={{ height: '5vh', width: 'auto' }} />
                                </Button>
                                </Stack>
                            </Card.Header>
                            {/* ADD THIS NEW CARD.BODY BLOCK: */}
                            <Card.Body className="bg-light border-bottom">
                                <Form.Control
                                    type="text"
                                    placeholder="🔍 Search files..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </Card.Body>
                            <ListGroup variant="flush" style={{maxHeight:"70vh", overflowY: "scroll"}}>
                                {files
                                .filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(file => (
                                    <ListGroup.Item key={file.name} className="d-flex justify-content-between">
                                        <span 
                                            style={{cursor:'pointer'}} 
                                            onClick={async () => {
                                                if (file.name.endsWith('.qcanva') || /\.(png|jpe?g|svg)$/i.test(file.name)) {
                                                    setSelectedFile(file);
                                                    setShowImageModal(true);
                                                }
                                                else if (file.name.endsWith('.pptx') || file.name.endsWith('.odp') || file.name.endsWith('.qslide') || file.name.endsWith('.pdf') || file.name.endsWith('.md')) {
                                                    setSelectedFile(file); 
                                                    setShowSlideModal(true);
                                                } else if (file.name.endsWith('.txt') || file.name.endsWith('.odt') || file.name.endsWith('.qdoc') || file.name.endsWith('.docx')) {
                                                    const fileObject = await file.getFile();
                                                    setSelectedFile(fileObject)
                                                    setShowDocModal(true);
                                                } else if (file.name.endsWith('.ods') || file.name.endsWith('.qsheet') || file.name.endsWith('.csv')) {
                                                    setSelectedFile(file); 
                                                    setShowSheetModal(true);
                                                } else if (file.name.endsWith('.mp3') || file.name.endsWith('.aac') || file.name.endsWith('.ogg') || file.name.endsWith('.wav') || file.name.endsWith('.qwave')) {
                                                    setSelectedFile(file); 
                                                    setShowAudioModal(true);
                                                } else if (file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.qvid')) {
                                                    setSelectedFile(file); 
                                                    setShowVideoModal(true);
                                                } else if (file.name.endsWith('.qnote')) {
                                                    setSelectedFile(file); 
                                                    setShowNoteModal(true);
                                                } else if (file.name.endsWith('.html')) {
                                                    setSelectedFile(file); 
                                                    setShowEmailEditorModal(true);
                                                }
                                                else if (file.name.endsWith('.json')) {
                                                    setSelectedFile(file); 
                                                    setShowJsonEditorModal(true);
                                                }
                                            }}
                                        >
                                            <Stack direction="horizontal" gap={2}>
                                        <h3 className={renderFileIcon(file)}></h3>
                                         {file.name}
                                         </Stack>
                                        </span>
                                        <Stack direction="horizontal" gap={2}>
                                            <Button 
                                                variant="outline-secondary" 
                                                size="sm" 
                                                className="rounded-circle" 
                                                onClick={(e) => { e.stopPropagation(); setOpenWithFile(file); }}
                                                title="Open With..."
                                                >
                                                <i className="bi bi-box-arrow-up-right"></i>
                                                </Button>
                                            <Button 
                                                variant="outline-success" 
                                                size="sm" 
                                                onClick={(e) => renameFile(e, file)}
                                                className='rounded-circle'
                                            >
                                                <i className="bi bi-pencil"></i>
                                            </Button>
                                            <Button 
                                                variant="outline-danger" 
                                                size="sm" 
                                                onClick={(e) => deleteFile(e, file.name)}
                                                className='rounded-circle'
                                            >
                                                <i className="bi bi-trash"></i>
                                            </Button>
                                        </Stack>
                                    </ListGroup.Item>
                                ))}
                                {files.filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                    <ListGroup.Item className="text-center text-muted py-3">
                                        No matching files found.
                                    </ListGroup.Item>
                                )}
                            </ListGroup>
                        </Card>
                    ) : 
                    <Alert variant="info">
                        {workspaceHandle ? (<span className=""><strong>Root Folder {workspaceHandle.name} is connected successfully!</strong> Add a folder under this or click on existing sub folder.</span>) : "Connect a Root folder to see your sub-folders. NOTE: Files in subfolders are editable while files in root folder stay hidden."}
                        </Alert>
                    }
                </Col>
            </Row>
            {/* QSLIDES */}
            <Modal show={showSlideModal} onHide={() => setShowSlideModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qslideLogo} alt="QSlide" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0 col-sm-12">
                <QSlide 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}
                />
            </Modal.Body>
            </Modal>
            {/* QCANVAS */}
            <Modal show={showImageModal} onHide={() => setShowImageModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qcanvaLogo} alt="QCanva" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <ImageEditor 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}
                />
            </Modal.Body>
            </Modal>
            {/* QSHEETS */}
            <Modal show={showSheetModal} onHide={() => setShowSheetModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qsheetLogo} alt="QSheet" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <QSheet 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}
                />
            </Modal.Body>
            </Modal>
            {/* QDOCS */}
            <Modal show={showDocModal} onHide={() => setShowDocModal(false)} 
            centered 
            backdrop="static" 
            fullscreen 
            contentClassName="border-0 shadow-lg"
            >
            <Modal.Header closeButton>
                <Modal.Title><img src={qdocLogo} alt="QDoc" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0"
            >
                <QDoc 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}                
                />
            </Modal.Body>
            </Modal>
            {/* QWAVE */}
            <Modal show={showAudioModal} onHide={() => setShowAudioModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qwaveLogo} alt="QWave" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <AudioEditor 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}
                />
            </Modal.Body>
            </Modal>

            {/* QVID */}
            <Modal show={showVideoModal} onHide={() => setShowVideoModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qvidLogo} alt="QVid" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <VideoEditor 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}
                />
            </Modal.Body>
            </Modal>

            {/* QNOTE */}
            <Modal show={showNoteModal} onHide={() => setShowNoteModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qnoteLogo} alt="QNote" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <NoteEditor 
                fileHandle={selectedFile} 
                onSave={handleNoteSave}
                />
            </Modal.Body>
            </Modal>

            {/* EMAIL EDITOR */}
            <Modal show={showEmailEditorModal} onHide={() => setShowEmailEditorModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qmailLogo} alt="QMail" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <QMailEditor 
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}                
                />
            </Modal.Body>
            </Modal>
            
            {/* JSON EDITOR */}
            <Modal show={showJsonEditorModal} onHide={() => setShowJsonEditorModal(false)} fullscreen>
            <Modal.Header closeButton>
                <Modal.Title><img src={qjsonLogo} alt="QJson" style={{ height: '5vh', width: 'auto' }} /> {selectedFile?.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <QJson
                fileHandle={selectedFile} 
                onSave={handleSave}
                onDownload={handleDownload}
                onShare={handleShare}                
                />
            </Modal.Body>
            </Modal>

            {/* OPEN WITH APPLICATION LAUNCHER MODAL */}
<Modal show={openWithFile !== null} onHide={() => setOpenWithFile(null)} centered size="md">
  <Modal.Header closeButton>
    <Modal.Title>Open "{openWithFile?.name}" With...</Modal.Title>
  </Modal.Header>
  <Modal.Body className="bg-light">
    <Row className="g-3 text-center">
      
      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'doc')}>
          <img src={qdocLogo} alt="QDoc" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QDoc</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'sheet')}>
          <img src={qsheetLogo} alt="QSheet" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QSheet</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'image')}>
          <img src={qcanvaLogo} alt="QCanva" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QCanva</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'slide')}>
          <img src={qslideLogo} alt="QSlides" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QSlide</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'audio')}>
          <img src={qwaveLogo} alt="QWave" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QWave</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'video')}>
          <img src={qvidLogo} alt="QVid" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QVid</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'note')}>
          <img src={qnoteLogo} alt="QNote" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QNote</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'email')}>
          <img src={qmailLogo} alt="QMail" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QMail</small>
        </Button>
      </Col>

      <Col xs={4}>
        <Button variant="white" className="w-100 py-3 shadow-sm border border-muted" onClick={() => openWithApp(openWithFile, 'json')}>
          <img src={qjsonLogo} alt="QJson" style={{ height: '5vh', width: 'auto' }} className="d-block mx-auto mb-2" />
          <small className="text-dark fw-bold">QJson</small>
        </Button>
      </Col>

    </Row>
  </Modal.Body>
</Modal>

        </Container>
    );
};

export default FileManager;
