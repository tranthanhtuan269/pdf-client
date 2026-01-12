import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, rgb } from 'pdf-lib';

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfEditor = ({ file, onBack }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [tool, setTool] = useState('view'); // view, pen, highlight, text
    const [scale, setScale] = useState(1.0);

    // State for annotations: Map<pageNumber, Annotation[]>
    // Annotation: { type: 'path' | 'text', ...data }
    const [annotations, setAnnotations] = useState({});
    const [currentPath, setCurrentPath] = useState([]); // For drawing
    const [isDrawing, setIsDrawing] = useState(false);

    // Text Input State
    const [textInput, setTextInput] = useState(null); // { x, y, value, page }

    const canvasRef = useRef(null);
    const contextRef = useRef(null);

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
    }

    // --- Canvas & Drawing Logic ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (tool === 'view' || tool === 'text') {
            canvas.style.pointerEvents = (tool === 'text') ? 'auto' : 'none'; // Allow clicking for text
            return;
        } else {
            canvas.style.pointerEvents = 'auto'; // Drawing
        }

        const context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
        context.lineWidth = tool === 'highlight' ? 20 : 2;
        contextRef.current = context;
    }, [tool, pageNumber]);

    // Redraw annotations when page or annotations change
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
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
            }
        });

        // Draw current path if drawing
        if (isDrawing && currentPath.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
            ctx.lineWidth = tool === 'highlight' ? 20 : 2;
            ctx.moveTo(currentPath[0].x, currentPath[0].y);
            currentPath.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }

    }, [annotations, pageNumber, currentPath, isDrawing, tool]);


    // --- 1. STATE & CAPTURE LOGIC (Phần 1: Bắt sự kiện vẽ) ---
    // isDrawing: Cờ báo hiệu đang giữ chuột để vẽ
    // currentPath: Mảng chứa các toạ độ {x, y} của nét vẽ hiện tại
    const startDrawing = (e) => {
        if (tool !== 'pen' && tool !== 'highlight') return;
        const { offsetX, offsetY } = e.nativeEvent;
        setIsDrawing(true);
        setCurrentPath([{ x: offsetX, y: offsetY }]); // Bắt đầu điểm đầu tiên
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = e.nativeEvent;
        // Liên tục thêm điểm vào mảng khi di chuột
        setCurrentPath(prev => [...prev, { x: offsetX, y: offsetY }]);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        // Lưu nét vẽ hoàn chỉnh vào bộ nhớ (annotations state)
        const color = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
        const width = tool === 'highlight' ? 20 : 2;

        const newAnn = { type: 'path', points: currentPath, color, width };

        setAnnotations(prev => ({
            ...prev,
            [pageNumber]: [...(prev[pageNumber] || []), newAnn]
        }));
        setCurrentPath([]);
    };

    const handleCanvasClick = (e) => {
        if (tool === 'text') {
            const { offsetX, offsetY } = e.nativeEvent;
            setTextInput({ x: offsetX, y: offsetY, value: '', page: pageNumber });
        }
    };

    const confirmText = () => {
        if (textInput && textInput.value.trim() !== '') {
            const newAnn = {
                type: 'text',
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
        setTool('view'); // Return to view mode after typing
    };

    // --- 2. SAVE LOGIC (Phần 2: Lưu vào PDF) ---
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
            addLog("Error: File type is not PDF.");
            return;
        }

        try {
            // A. Tải file gốc
            addLog(`Fetching original file from: ${file.url}`);
            const existingPdfBytes = await fetch(file.url, { cache: 'no-store' }).then(res => {
                if (!res.ok && res.status !== 304) throw new Error(`Fetch error: ${res.status}`);
                return res.arrayBuffer();
            });
            addLog("File fetched successfully.");

            // B. Load PDF bằng pdf-lib
            addLog("Loading PDF into pdf-lib...");
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();
            addLog(`PDF loaded. Total pages: ${pages.length}`);

            // C. Vẽ lại các nét lên PDF (Replay Annotations)
            addLog("Applying annotations...");

            // DEBUG: Hardcode a test blue line on page 1
            if (pages.length > 0) {
                const p1 = pages[0];
                const { width: dw, height: dh } = p1.getSize();
                addLog(`DEBUG: Page 1 Dimensions: ${dw} x ${dh}`);
                try {
                    p1.drawLine({
                        start: { x: 0, y: 0 },
                        end: { x: dw, y: dh },
                        thickness: 5,
                        color: rgb(0, 0, 1), // Blue
                        opacity: 1,
                    });
                    addLog("DEBUG: Drew diagonal test line on Page 1 (Blue).");
                } catch (e) {
                    addLog("DEBUG: Failed to draw test line: " + e.message);
                }
            }

            Object.keys(annotations).forEach(pageNumStr => {
                const pageIndex = parseInt(pageNumStr) - 1; // 0-indexed
                if (pageIndex >= 0 && pageIndex < pages.length) {
                    const page = pages[pageIndex];
                    const { height } = page.getSize(); // Lấy chiều cao trang PDF
                    const pageAnns = annotations[pageNumStr];
                    addLog(`Processing page ${pageNumStr}: ${pageAnns.length} annotations.`);

                    pageAnns.forEach((ann, idx) => {
                        try {
                            if (ann.type === 'path') {
                                // C.1: Chuyển đổi màu sắc
                                // pdf-lib dùng hệ màu rgb(0-1), còn web dùng rgba/hex
                                let color = rgb(1, 0, 0); // Mặc định Đỏ
                                if (ann.color.includes('255, 255, 0')) color = rgb(1, 1, 0); // Vàng

                                // C.2: CHUYỂN ĐỔI TOẠ ĐỘ (QUAN TRỌNG)
                                // Canvas Web: Gốc (0,0) là Góc trên-trái. Y tăng dần xuống dưới.
                                // PDF Lib: Gốc (0,0) là Góc dưới-trái. Y tăng dần lên trên.
                                // => Công thức: PDF_Y = Chiều_cao_trang - Canvas_Y
                                const pathData = ann.points.map(p => {
                                    return { x: p.x, y: height - p.y };
                                });

                                if (pathData.length > 1) {
                                    // C.3: Xử lý độ trong suốt (Highlight vs Pen)
                                    const isHighlight = ann.color.includes('255, 255, 0') || ann.color.includes('0, 0.5');
                                    const opacityVal = isHighlight ? 0.3 : 1;

                                    // C.4: Thực hiện vẽ (Dùng drawLine nối các điểm)
                                    // DEBUG: Log để kiểm tra vòng lặp vẽ có chạy không
                                    if (idx === 0) addLog(`--> Start drawing path ${idx} with ${pathData.length} points.`);

                                    for (let i = 0; i < pathData.length - 1; i++) {
                                        const p1 = pathData[i];
                                        const p2 = pathData[i + 1];

                                        page.drawLine({
                                            start: { x: p1.x, y: p1.y },
                                            end: { x: p2.x, y: p2.y },
                                            thickness: ann.width,
                                            color: color,
                                            opacity: opacityVal,
                                            lineCap: 'round',
                                        });
                                    }
                                }
                            } else if (ann.type === 'text') {
                                page.drawText(ann.text, {
                                    x: ann.x,
                                    y: height - ann.y, // Flip Y
                                    size: ann.size,
                                    color: rgb(0, 0, 0),
                                });
                            }
                        } catch (innerErr) {
                            addLog(`Error processing annotation ${idx} on page ${pageNumStr}: ${innerErr.message}`);
                        }
                    });
                }
            });

            // D. Xuất file PDF mới
            addLog("Saving modified PDF...");
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            addLog("PDF saved to blob. Initiating download.");

            // 5. Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `edited_${file.filename}`;
            link.click();
            addLog("Download triggered.");

        } catch (err) {
            console.error("Save error:", err);
            addLog(`CRITICAL ERROR: ${err.message}`);
            addLog(`Stack: ${err.stack}`);

            // Auto-download log file on error
            const logBlob = new Blob([logs.join('\n')], { type: 'text/plain' });
            const logLink = document.createElement('a');
            logLink.href = URL.createObjectURL(logBlob);
            logLink.download = "save_error_log.txt";
            logLink.click();

            alert("Failed to save PDF. Error log downloaded.");
        }
    };

    const onPageLoadSuccess = (page) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = page.width;
            canvas.height = page.height;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
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
                        <ToolButton active={tool === 'highlight'} onClick={() => setTool('highlight')} icon="🖊 Highlight" />
                        <ToolButton active={tool === 'text'} onClick={() => setTool('text')} icon="T Text" />
                    </div>
                )}

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

                        {/* Text Input Overlay */}
                        {textInput && (
                            <div
                                className="absolute z-20 bg-white p-1 rounded shadow-lg border border-blue-500"
                                style={{ left: textInput.x, top: textInput.y }}
                            >
                                <input
                                    autoFocus
                                    className="text-black outline-none bg-transparent min-w-[100px]"
                                    value={textInput.value}
                                    onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmText()}
                                    onBlur={confirmText}
                                    placeholder="Type here..."
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
