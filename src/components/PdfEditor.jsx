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
            }

            const pages = pdfDoc.getPages();

            addLog("Applying annotations...");

            // Need to process pages sequentially for async images
            const pageNumStrs = Object.keys(annotations);

            for (const pageNumStr of pageNumStrs) {
                const pageNum = parseInt(pageNumStr);
                const pageIndex = pageNum - 1;

                if (pageIndex >= 0 && pageIndex < pages.length) {
                    const page = pages[pageIndex];
                    const { width: pdfPageWidth, height: pdfPageHeight } = page.getSize();

                    const renderedDim = pageDims[pageNum] || { width: pdfPageWidth, height: pdfPageHeight };
                    const scaleX = pdfPageWidth / renderedDim.width;
                    const scaleY = pdfPageHeight / renderedDim.height;

                    const pageAnns = annotations[pageNumStr];

                    for (const ann of pageAnns) {
                        try {
                            if (ann.type === 'path') {
                                // ... Existing Path Logic ...
                                let color = rgb(1, 0, 0);
                                if (ann.color.includes('255, 255, 0')) {
                                    color = rgb(1, 1, 0);
                                    addLog("DEBUG: Detected Highlight Path.");
                                } else {
                                    addLog("DEBUG: Detected Pen Path.");
                                }

                                const pathData = ann.points.map(p => ({ x: p.x * scaleX, y: pdfPageHeight - (p.y * scaleY) }));
                                if (pathData.length > 1) {
                                    const isHighlight = ann.color.includes('255, 255, 0') || ann.color.includes('0, 0.5');
                                    const opacityVal = isHighlight ? 0.5 : 1; // Increased opacity from 0.3 to 0.5
                                    const scaledWidth = ann.width * scaleX;

                                    addLog(`Drawing path: highlight=${isHighlight}, opacity=${opacityVal}, width=${scaledWidth}`);

                                    for (let i = 0; i < pathData.length - 1; i++) {
                                        page.drawLine({
                                            start: pathData[i], end: pathData[i + 1],
                                            thickness: scaledWidth, color, opacity: opacityVal, lineCap: LineCapStyle.Round,
                                        });
                                    }
                                }

                            } else if (ann.type === 'text') {
                                // ... Existing Text Logic ...
                                page.drawText(ann.text, {
                                    x: ann.x * scaleX, y: pdfPageHeight - (ann.y * scaleY),
                                    size: ann.size * scaleY, color: rgb(0, 0, 0),
                                });

                            } else if (ann.type === 'rect') {
                                // Shape: Rectangle
                                const rectX = ann.x * scaleX;
                                // For rect height, if drawn upwards, height is negative. pdf-lib handles signs, but Y position needs care.
                                // Canvas Draw: x, y, w, h. (y is top-left).
                                // PDF Draw: x, y, w, h. (y is bottom-left).
                                // Correct Y for PDF = PageHeight - (CanvasY + CanvasHeight) IF height is positive (downwards). 
                                // Actually simplistic mapping:
                                // Canvas P1(x,y). PDF P1(x, H-y). 
                                // We draw rect from P1 with width/height.
                                // If height is positive (down), bottom is y+h. PDF Y should be H - (y+h)?
                                // Let's keep it simple: Calculate Bottom-Left corner in PDF space.

                                // Normalized Canvas Coords (Top-Left of rect)
                                let cX = ann.x;
                                let cY = ann.y;
                                let cW = ann.width;
                                let cH = ann.height;

                                // Handle negative visual width/height
                                if (cW < 0) { cX += cW; cW = Math.abs(cW); }
                                if (cH < 0) { cY += cH; cH = Math.abs(cH); }

                                const pdfX = cX * scaleX;
                                const pdfY = pdfPageHeight - ((cY + cH) * scaleY); // Bottom-Left in PDF
                                const pdfW = cW * scaleX;
                                const pdfH = cH * scaleY;

                                page.drawRectangle({
                                    x: pdfX, y: pdfY, width: pdfW, height: pdfH,
                                    borderColor: rgb(0, 0, 1), borderWidth: 3 * scaleX,
                                });

                            } else if (ann.type === 'image') {
                                // Image Embedding
                                const imageBytes = await ann.file.arrayBuffer();
                                let pdfImage;
                                if (ann.file.type === 'image/jpeg' || ann.file.type === 'image/jpg') {
                                    pdfImage = await pdfDoc.embedJpg(imageBytes);
                                } else {
                                    pdfImage = await pdfDoc.embedPng(imageBytes);
                                }

                                const pdfX = ann.x * scaleX;
                                const pdfW = ann.width * scaleX;
                                const pdfH = ann.height * scaleY;
                                const pdfY = pdfPageHeight - (ann.y * scaleY) - pdfH; // Bottom-Left

                                page.drawImage(pdfImage, {
                                    x: pdfX, y: pdfY, width: pdfW, height: pdfH
                                });

                            } else if (ann.type === 'note') {
                                // Sticky Note
                                const noteW = 150 * scaleX;
                                const noteH = 100 * scaleY;
                                const pdfX = ann.x * scaleX;
                                const pdfY = pdfPageHeight - (ann.y * scaleY) - noteH;

                                // 1. Yellow Background
                                page.drawRectangle({
                                    x: pdfX, y: pdfY, width: noteW, height: noteH,
                                    color: rgb(1, 0.92, 0.23) // Yellow #ffeb3b
                                });
                                // 2. Text
                                page.drawText(ann.text, {
                                    x: pdfX + (10 * scaleX),
                                    y: pdfY + noteH - (20 * scaleY), // Approximate text positioning
                                    size: 14 * scaleY,
                                    color: rgb(0, 0, 0)
                                });
                            }

                        } catch (innerErr) {
                            addLog(`Error processing annotation: ${innerErr.message}`);
                        }
                    }
                }
            }

            addLog("Saving modified PDF...");
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `edited_${file.filename}`;
            link.click();

        } catch (err) {
            console.error("Save error:", err);
            addLog(`CRITICAL ERROR: ${err.message}`);
            // ... download log ...
            const logBlob = new Blob([logs.join('\n')], { type: 'text/plain' });
            const logLink = document.createElement('a');
            logLink.href = URL.createObjectURL(logBlob);
            logLink.download = "save_error_log.txt";
            logLink.click();
            alert("Failed to save. Check logs.");
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
