import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfEditor = ({ file, onBack }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [tool, setTool] = useState('view'); // view, pen, highlight
    const [scale, setScale] = useState(1.0);

    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const contextRef = useRef(null);

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
    }

    // Setup Canvas for drawing
    useEffect(() => {
        if (tool === 'view') return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // We need to match canvas size to the Page size, which is tricky in React-PDF without "onLoadSuccess" of Page
        // For now, we utilize the absolute positioning overlay.
        // The canvas logical size (width/height attributes) needs to match the rendered size.
        // We'll set it in the onPageLoadSuccess.

        const context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.strokeStyle = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
        context.lineWidth = tool === 'highlight' ? 20 : 2;
        contextRef.current = context;
    }, [tool, pageNumber]);

    const startDrawing = ({ nativeEvent }) => {
        if (tool === 'view') return;
        const { offsetX, offsetY } = nativeEvent;

        // Adjust for any scaling if necessary, but offsetX usually works relative to element
        contextRef.current.beginPath();
        contextRef.current.moveTo(offsetX, offsetY);
        setIsDrawing(true);
    };

    const draw = ({ nativeEvent }) => {
        if (!isDrawing || tool === 'view') return;
        const { offsetX, offsetY } = nativeEvent;
        contextRef.current.lineTo(offsetX, offsetY);
        contextRef.current.stroke();
    };

    const stopDrawing = () => {
        contextRef.current?.closePath();
        setIsDrawing(false);
    };

    // Clear canvas when changing pages
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [pageNumber]);

    const onPageLoadSuccess = (page) => {
        // Set canvas dimensions to match page
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = page.width;
            canvas.height = page.height;
            // Re-init context styles after resize
            const context = canvas.getContext('2d');
            context.lineCap = 'round';
            context.strokeStyle = tool === 'highlight' ? 'rgba(255, 255, 0, 0.5)' : 'red';
            context.lineWidth = tool === 'highlight' ? 20 : 2;
            contextRef.current = context;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 bg-gray-800 shadow-md z-1">
                <div className="flex items-center space-x-4">
                    <button onClick={onBack} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Back</button>
                    <h2 className="font-bold truncate max-w-xs">{file.originalname}</h2>
                </div>

                {file.type === 'pdf' && (
                    <div className="flex space-x-2 bg-gray-700 p-1 rounded-lg">
                        <ToolButton active={tool === 'view'} onClick={() => setTool('view')} icon="View" />
                        <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} icon="Pen" />
                        <ToolButton active={tool === 'highlight'} onClick={() => setTool('highlight')} icon="Highlight" />
                    </div>
                )}

                <div className="flex items-center space-x-4">
                    <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Prev</button>
                    <span>{pageNumber} / {numPages || '--'}</span>
                    <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50">Next</button>
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

                        {/* Drawing Overlay */}
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            className={`absolute inset-0 z-10 ${tool === 'view' ? 'pointer-events-none' : 'cursor-crosshair'}`}
                        />
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
