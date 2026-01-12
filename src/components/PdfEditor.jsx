import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfEditor = ({ file, onBack }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [tool, setTool] = useState('view'); // view, pen, highlight, text, rect, image, note
    const [scale, setScale] = useState(1.0);

    // State for annotations: Map<pageNumber, Annotation[]>
    // Annotation: { type: 'path' | 'text', ...data }
    const [annotations, setAnnotations] = useState({});

    // Drawing State
    const [currentPath, setCurrentPath] = useState([]); // For pen/highlight path
    const [currentRect, setCurrentRect] = useState(null); // { x, y, width, height } for rect drawing
    const [isDrawing, setIsDrawing] = useState(false);

    // Text/Note Input State
    const [textInput, setTextInput] = useState(null); // { x, y, value, page, type: 'text'|'note' }

    // Image State
    const [pendingImage, setPendingImage] = useState(null); // { file, url, width, height }
    const fileInputRef = useRef(null);

    // State for page dimensions (from react-pdf)
    const [pageDims, setPageDims] = useState({}); // { [pageNum]: { width, height } }

    // Password State
    const [pdfPassword, setPdfPassword] = useState('');

    const canvasRef = useRef(null);
    const contextRef = useRef(null);

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
    }

    const onPageLoadSuccess = (page) => {
        // react-pdf onPageLoadSuccess passes the page object which has width/height
        setPageDims(prev => ({
            ...prev,
            [page.pageNumber]: { width: page.width, height: page.height }
        }));

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = page.width;
            canvas.height = page.height;
        }
    };

    // --- Image Handling ---
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            // Default max size 200px
            const scaleFactor = Math.min(200 / img.width, 200 / img.height, 1);
            setPendingImage({
                file,
                url,
                width: img.width * scaleFactor,
                height: img.height * scaleFactor,
                imgElement: img // Keep ref to render on canvas
            });
        };
        img.src = url;
        e.target.value = null; // Reset input
    };

    const triggerImageUpload = () => {
        fileInputRef.current?.click();
        setTool('image');
    };

    // Password Handler
    const handleSetPassword = () => {
        const newPass = prompt("Enter a password to protect this PDF (Leave empty to remove):", pdfPassword);
        if (newPass !== null) {
            setPdfPassword(newPass);
        }
    };


    // --- Canvas Rendering Logic ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Pointer events logic
        if (['view', 'text', 'image', 'note'].includes(tool)) {
            canvas.style.pointerEvents = 'auto'; // Need clicks for all these
        } else {
            canvas.style.pointerEvents = 'auto'; // Drawing/Shapes
        }

        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        contextRef.current = ctx;

        // --- Render Loop ---
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pageAnnotations = annotations[pageNumber] || [];

        pageAnnotations.forEach(ann => {
            if (ann.type === 'path') {
                ctx.beginPath();
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = ann.width;
                if (ann.points.length > 0) {
                    ctx.moveTo(ann.points[0].x, ann.points[0].y);
                    ann.points.forEach(p => ctx.lineTo(p.x, p.y));
                }
                ctx.stroke();
            } else if (ann.type === 'text') {
                ctx.font = '16px Arial';
                ctx.fillStyle = 'black';
                ctx.fillText(ann.text, ann.x, ann.y);
            } else if (ann.type === 'rect') {
                ctx.beginPath();
                ctx.strokeStyle = 'blue';
                ctx.lineWidth = 3;
                ctx.rect(ann.x, ann.y, ann.width, ann.height);
                ctx.stroke();
            } else if (ann.type === 'image') {
                if (ann.imgElement) {
                    ctx.drawImage(ann.imgElement, ann.x, ann.y, ann.width, ann.height);
                }
            } else if (ann.type === 'note') {
                // Draw Sticky Note
                ctx.fillStyle = '#ffeb3b'; // Yellow
                ctx.fillRect(ann.x, ann.y, 150, 100); // Fixed size for note
                ctx.font = '14px Arial';
                ctx.fillStyle = 'black';
                // Simple wrapping or just draw text
                ctx.fillText(ann.text, ann.x + 10, ann.y + 30);
            }
        });

        // Draw current path (Pen/Highlight)
        if (isDrawing && currentPath.length > 0 && (tool === 'pen' || tool === 'highlight')) {
            ctx.beginPath();
            ctx.strokeStyle = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
            ctx.lineWidth = tool === 'highlight' ? 20 : 2;
            ctx.moveTo(currentPath[0].x, currentPath[0].y);
            currentPath.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }

        // Draw current Rect
        if (isDrawing && currentRect && tool === 'rect') {
            ctx.beginPath();
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 3;
            ctx.rect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
            ctx.stroke();
        }

    }, [annotations, pageNumber, currentPath, currentRect, isDrawing, tool]);


    // --- Interaction Handlers ---
    const startDrawing = (e) => {
        if (['pen', 'highlight', 'rect'].indexOf(tool) === -1) return;

        setIsDrawing(true);
        const { offsetX, offsetY } = e.nativeEvent;

        if (tool === 'rect') {
            setCurrentRect({ x: offsetX, y: offsetY, width: 0, height: 0, startX: offsetX, startY: offsetY });
        } else {
            setCurrentPath([{ x: offsetX, y: offsetY }]);
        }
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = e.nativeEvent;

        if (tool === 'rect') {
            setCurrentRect(prev => ({
                ...prev,
                width: offsetX - prev.startX,
                height: offsetY - prev.startY
            }));
        } else {
            setCurrentPath(prev => [...prev, { x: offsetX, y: offsetY }]);
        }
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (tool === 'rect') {
            if (currentRect && (Math.abs(currentRect.width) > 5 || Math.abs(currentRect.height) > 5)) {
                const newAnn = {
                    type: 'rect',
                    x: currentRect.x,
                    y: currentRect.y,
                    width: currentRect.width,
                    height: currentRect.height,
                    color: 'blue'
                };
                setAnnotations(prev => ({
                    ...prev,
                    [pageNumber]: [...(prev[pageNumber] || []), newAnn]
                }));
            }
            setCurrentRect(null);
        } else {
            // Path logic
            const color = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
            const width = tool === 'highlight' ? 20 : 2;
            const newAnn = { type: 'path', points: currentPath, color, width };
            setAnnotations(prev => ({
                ...prev,
                [pageNumber]: [...(prev[pageNumber] || []), newAnn]
            }));
            setCurrentPath([]);
        }
    };

    const handleCanvasClick = (e) => {
        const { offsetX, offsetY } = e.nativeEvent;

        if (tool === 'text' || tool === 'note') {
            setTextInput({
                x: offsetX,
                y: offsetY,
                value: '',
                page: pageNumber,
                type: tool // 'text' or 'note'
            });
        }
        else if (tool === 'image' && pendingImage) {
            // Place Image
            const newAnn = {
                type: 'image',
                x: offsetX,
                y: offsetY,
                width: pendingImage.width,
                height: pendingImage.height,
                file: pendingImage.file,
                url: pendingImage.url,
                imgElement: pendingImage.imgElement
            };
            setAnnotations(prev => ({
                ...prev,
                [pageNumber]: [...(prev[pageNumber] || []), newAnn]
            }));
            setPendingImage(null); // Clear pending
            setTool('view');
        }
    };

    const confirmText = () => {
        if (textInput && textInput.value.trim() !== '') {
            const newAnn = {
                type: textInput.type, // 'text' or 'note'
                text: textInput.value,
                x: textInput.x,
                y: textInput.y,
                size: 16
            };
            setAnnotations(prev => ({
                ...prev,
                [textInput.page]: [...(prev[textInput.page] || []), newAnn]
            }));
        }
        setTextInput(null);
        setTool('view');
    };

    // --- PDF Saving Logic ---
    const handleSave = async () => {
        const logs = [];
        const addLog = (msg) => {
            const entry = `${new Date().toISOString()}: ${msg}`;
            console.log(entry);
            logs.push(entry);
        };
        addLog("Starting save process...");

        if (file.type !== 'pdf') {
            alert("Saving is only supported for PDF files.");
            return;
        }

        try {
            addLog(`Fetching original file from: ${file.url}`);
            const existingPdfBytes = await fetch(file.url, { cache: 'no-store' }).then(res => res.arrayBuffer());

            addLog("Loading PDF into pdf-lib...");
            const pdfDoc = await PDFDocument.load(existingPdfBytes);

            // --- Encryption Step ---
            if (pdfPassword) {
                if (typeof pdfDoc.encrypt === 'function') {
                    addLog("Encrypting PDF with password...");
                    pdfDoc.encrypt({
                        userPassword: pdfPassword,
                        ownerPassword: pdfPassword,
                        permissions: {
                            printing: 'highResolution',
                            modifying: false,
                            copying: false,
                            annotating: false,
                            fillingForms: false,
                            contentAccessibility: false,
                            documentAssembly: false,
                        },
                    });
                } else {
                    addLog("WARNING: pdfDoc.encrypt is not a function. Skipping encryption.");
                    alert("Encryption not supported by this PDF library version.");
                }
            }

            const pages = pdfDoc.getPages();
            // ... (rest of function) ...
        } catch (err) {
            console.error("Save error:", err);
            addLog(`CRITICAL ERROR: ${err.message}`);
            // ... download log ...
            const logBlob = new Blob([logs.join('\n')], { type: 'text/plain' });
            const logLink = document.createElement('a');
            logLink.href = URL.createObjectURL(logBlob);
            logLink.download = "save_error_log.txt";
            logLink.click();

            // SHOW ERROR TO USER
            alert(`Failed to save: ${err.message}`);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 bg-gray-800 shadow-md z-20">
                <div className="flex items-center space-x-4">
                    <button onClick={onBack} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Back</button>
                    <h2 className="font-bold truncate max-w-xs">{file.originalname}</h2>
                </div>

                {file.type === 'pdf' && (
                    <div className="flex space-x-2 bg-gray-700 p-1 rounded-lg">
                        <ToolButton active={tool === 'view'} onClick={() => setTool('view')} icon="👁 View" />
                        <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} icon="✎ Pen" />
                        <ToolButton active={tool === 'highlight'} onClick={() => setTool('highlight')} icon="🖊 Marker" />
                        <ToolButton active={tool === 'text'} onClick={() => setTool('text')} icon="T Text" />
                        <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')} icon="⬜ Rect" />
                        <ToolButton active={tool === 'image'} onClick={triggerImageUpload} icon="🖼 Image" />
                        <ToolButton active={tool === 'note'} onClick={() => setTool('note')} icon="📝 Note" />

                        <div className="w-[1px] h-8 bg-gray-500 mx-2"></div>
                        <ToolButton
                            active={!!pdfPassword}
                            onClick={handleSetPassword}
                            icon={pdfPassword ? "🔒 Locked" : "🔓 Unlock"}
                        />
                    </div>
                )}

                {/* ... Navigation & Save Buttons ... */}
                <div className="flex items-center space-x-4">
                    <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Prev</button>
                    <span>{pageNumber} / {numPages || '--'}</span>
                    <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Next</button>
                    <button onClick={handleSave} className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-500 rounded font-bold shadow-lg transition-transform active:scale-95">
                        💾 SAVE
                    </button>
                </div>
            </div>

            {/* Main View Area */}
            <div className="flex-1 overflow-auto flex justify-center p-8 bg-gray-900 relative">
                {file.type === 'pdf' ? (
                    <div className="relative border shadow-2xl">
                        <Document
                            file={file.url}
                            onLoadSuccess={onDocumentLoadSuccess}
                            loading={<div className="text-white">Loading PDF...</div>}
                        >
                            <Page
                                pageNumber={pageNumber}
                                scale={scale}
                                onLoadSuccess={onPageLoadSuccess}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                            />
                        </Document>

                        {/* Drawing & Interaction Overlay */}
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onClick={handleCanvasClick}
                            className={`absolute inset-0 z-10 ${tool === 'view' ? '' : 'cursor-crosshair'}`}
                        />

                        {/* Pending Image Preview (Follow Mouse or Fixed Message?) */}
                        {tool === 'image' && pendingImage && (
                            <div className="absolute z-20 bg-black/70 text-white p-2 text-sm rounded pointer-events-none" style={{ top: 10, left: 10 }}>
                                Click on canvas to place image
                            </div>
                        )}

                        {/* Text/Note Input Overlay */}
                        {textInput && (
                            <div
                                className={`absolute z-20 p-1 rounded shadow-lg border border-blue-500 ${textInput.type === 'note' ? 'bg-yellow-300' : 'bg-white'}`}
                                style={{ left: textInput.x, top: textInput.y }}
                            >
                                <textarea
                                    autoFocus
                                    className={`outline-none bg-transparent min-w-[150px] min-h-[50px] ${textInput.type === 'note' ? 'text-black' : 'text-black'}`}
                                    value={textInput.value}
                                    onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                                    onBlur={confirmText}
                                    placeholder={textInput.type === 'note' ? "Sticky Note Content" : "Type text..."}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white p-4 rounded shadow-lg">
                        <p className="text-black mb-4">Preview for non-PDF files: <a href={file.url} target="_blank" className="text-blue-600 underline">Open File</a></p>
                        <img src={file.url} alt="Uploaded" className="max-w-full max-h-[80vh]" />
                    </div>
                )}
            </div>
        </div>
    );
};

const ToolButton = ({ active, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 rounded transition-colors ${active ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
    >
        {icon}
    </button>
);

export default PdfEditor;
