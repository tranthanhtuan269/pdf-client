import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';

// Ensure worker is loaded (force specific version to match react-pdf requirement)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

const OrganizeScreen = ({ onBack }) => {
    const [file, setFile] = useState(null);
    const [pdfBytes, setPdfBytes] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null); // NEW: Use URL for stable rendering
    const [pageCount, setPageCount] = useState(0);
    const [selectedPages, setSelectedPages] = useState(new Set());
    const [cropMode, setCropMode] = useState(null); // pageIndex
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadError, setLoadError] = useState(null); // Track load errors

    // For visual cropping
    const [cropRect, setCropRect] = useState({ x: 10, y: 10, width: 80, height: 80 }); // Percentages
    const cropRef = useRef(null);

    // Cleanup URL on unmount or change
    useEffect(() => {
        return () => {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        };
    }, [pdfUrl]);

    const displayPdf = (bytes) => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setPdfBytes(bytes);
        setLoadError(null); // Clear errors on new data
    };

    const handleFileChange = async (e) => {
        try {
            if (e.target.files && e.target.files[0]) {
                const selected = e.target.files[0];
                if (selected.type !== 'application/pdf') {
                    alert("Only PDF files are supported.");
                    return;
                }
                setFile(selected);
                const buffer = await selected.arrayBuffer();
                displayPdf(buffer);
            }
        } catch (err) {
            console.error("File read error:", err);
            setLoadError("Failed to read file: " + err.message);
        }
    };

    const handleDocumentLoadSuccess = ({ numPages }) => {
        setPageCount(numPages);
        setLoadError(null);
    };

    const handleDocumentLoadError = (error) => {
        console.error("PDF Load Error:", error);
        setLoadError("Failed to load PDF: " + error.message);
    };

    const toggleSelection = (index) => {
        const newSet = new Set(selectedPages);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedPages(newSet);
    };

    // --- Sorting ---
    const [draggedIndex, setDraggedIndex] = useState(null);

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image transparency usually handled by browser, but we can style if needed
    };

    const handleDragOver = (e, index) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === dropIndex) return;

        // Visual feedback immediate update (optional, but skipping for simplicity, doing direct PDF update)
        // Reorder logic
        await updatePdf(async (pdfDoc) => {
            const pageCount = pdfDoc.getPageCount();
            const indices = Array.from({ length: pageCount }, (_, i) => i);

            // Move index in array
            const [movedItem] = indices.splice(draggedIndex, 1);
            indices.splice(dropIndex, 0, movedItem);

            // Create new PDF with reordered pages
            // We cannot just reorder in place easily, so easiest is verify efficient copy
            // Actually pdf-lib is mutable. ensuring we don't loose annotations.
            // Best way: Create new PDF, copy pages in new order.

            const newPdf = await PDFDocument.create();
            const copiedPages = await newPdf.copyPages(pdfDoc, indices);
            copiedPages.forEach(page => newPdf.addPage(page));

            // Replace current pdfBytes with new PDF
            const newBytes = await newPdf.save();
            return newBytes; // Special signal to updatePdf wrapper to use these bytes directly? 
            // My updatePdf wrapper expects callback to modify 'pdfDoc' in place. 
            // PROPOSE: Modify updatePdf to handle returning a NEW doc or bytes.
        });
    };

    // Modified updatePdf to handle full replacement if needed
    const updatePdf = async (callback) => {
        if (!pdfBytes) return;
        setIsProcessing(true);
        try {
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const result = await callback(pdfDoc);

            let newBytes;
            if (result instanceof Uint8Array) {
                newBytes = result; // Callback returned new bytes (reorder case)
            } else {
                newBytes = await pdfDoc.save(); // Callback modified doc in place
            }

            displayPdf(newBytes);
            setSelectedPages(new Set());
        } catch (error) {
            console.error(error);
            alert("Error modifying PDF: " + error.message);
        } finally {
            setIsProcessing(false);
            setDraggedIndex(null);
        }
    };

    const handleRotate = async (direction) => {
        const angle = direction === 'left' ? -90 : 90;
        await updatePdf((pdfDoc) => {
            const pages = pdfDoc.getPages();

            // If selection exists, rotate selected. Else rotate all? No, usually selection is better.
            // If no selection, warn user.
            if (selectedPages.size === 0) {
                alert("Please select pages to rotate.");
                return;
            }

            selectedPages.forEach(index => {
                if (index >= 0 && index < pages.length) {
                    const page = pages[index];
                    const currentRotation = page.getRotation().angle;
                    page.setRotation(degrees(currentRotation + angle));
                }
            });
        });
    };

    const handleDelete = async () => {
        if (selectedPages.size === 0) return;
        if (!confirm(`Delete ${selectedPages.size} pages?`)) return;

        await updatePdf((pdfDoc) => {
            // Sort descending to avoid index shift issues
            const sortedIndices = Array.from(selectedPages).sort((a, b) => b - a);
            sortedIndices.forEach(index => {
                pdfDoc.removePage(index);
            });
        });
    };

    const handleCropOpen = (index) => {
        setCropMode(index);
        setCropRect({ x: 10, y: 10, width: 80, height: 80 });
    };

    const handleCropApply = async () => {
        if (cropMode === null) return;

        await updatePdf((pdfDoc) => {
            const page = pdfDoc.getPages()[cropMode];
            const { width, height } = page.getSize();

            // Transform percentage to PDF points
            const cropX = (cropRect.x / 100) * width;
            // PDF Y is from bottom-up, but UI is top-down. 
            // setCropBox(x, y, width, height). y is typically bottom-left corner of box.
            // HTML UI: y is distance from top.
            // So PDF Y = Height - (UI_Y + UI_Height)
            const cropH = (cropRect.height / 100) * height;
            const cropY = height - ((cropRect.y / 100) * height) - cropH;
            const cropW = (cropRect.width / 100) * width;

            page.setCropBox(cropX, cropY, cropW, cropH);
        });

        setCropMode(null);
    };

    // --- Save ---
    const handleDownload = () => {
        if (!pdfBytes || !file) return;
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `organized_${file.name}`;
        link.click();
    };


    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-6">

            {/* Header */}
            <div className="w-full max-w-6xl px-4 flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-green-500">
                        Organize Pages
                    </h2>
                    <p className="text-gray-400 text-sm">Drag to Reorder, Rotate, Delete, Snipping Tool</p>
                </div>
                <div className="flex gap-4">
                    <button onClick={handleDownload} disabled={!pdfBytes} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold shadow-lg disabled:opacity-50">
                        Download Result
                    </button>
                    <button onClick={onBack} className="text-gray-400 hover:text-white px-4">
                        Close
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full max-w-6xl flex gap-6">

                {/* Sidebar Toolbar */}
                <div className="w-64 bg-gray-800 p-4 rounded-xl h-fit sticky top-6 space-y-4">
                    {!file ? (
                        <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer relative hover:border-emerald-500">
                            <input type="file" accept="application/pdf" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <span className="text-4xl">📂</span>
                            <p className="font-semibold mt-2">Upload PDF</p>
                        </div>
                    ) : (
                        <>
                            <div className="text-sm text-gray-400 mb-2">{file.name} ({pageCount} pages)</div>
                            <div className="text-xs text-gray-500 mb-4">{selectedPages.size} selected</div>

                            <button onClick={() => handleRotate('left')} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center gap-2">
                                <span>↺</span> Rotate Left
                            </button>
                            <button onClick={() => handleRotate('right')} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center gap-2">
                                <span>↻</span> Rotate Right
                            </button>
                            <button onClick={handleDelete} className="w-full py-2 bg-red-900/50 hover:bg-red-900/80 text-red-200 rounded flex items-center justify-center gap-2">
                                <span>🗑️</span> Delete Selected
                            </button>

                            <hr className="border-gray-700 my-4" />

                            <p className="text-xs text-gray-400">
                                <b>Drag & Drop</b> pages to reorder.<br />
                                Click ✂️ to crop.
                            </p>
                        </>
                    )}
                </div>

                {/* Grid View */}
                <div className="flex-1 bg-gray-800/50 p-6 rounded-xl min-h-[500px]">
                    {loadError ? (
                        <div className="h-full flex flex-col items-center justify-center text-red-400 p-8 text-center border-2 border-red-500/30 rounded-lg bg-red-900/10">
                            <span className="text-4xl mb-4">⚠️</span>
                            <p className="text-xl font-bold mb-2">Failed to Load PDF</p>
                            <p className="text-sm opacity-80">{loadError}</p>
                            <p className="text-xs mt-4 text-gray-500">Try reloading the page or uploading a simpler file.</p>
                        </div>
                    ) : pdfUrl ? (
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={handleDocumentLoadSuccess}
                            onLoadError={handleDocumentLoadError}
                            className="flex flex-wrap gap-6 justify-center"
                        >
                            {Array.from(new Array(pageCount), (el, index) => (
                                <div
                                    key={`page_${index}`}
                                    className={`relative group cursor-pointer transition-all 
                                        ${selectedPages.has(index) ? 'ring-4 ring-emerald-500 scale-105' : 'hover:scale-105'}
                                        ${draggedIndex === index ? 'opacity-50' : ''}
                                    `}
                                    onClick={() => toggleSelection(index)}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                >
                                    <Page
                                        pageNumber={index + 1}
                                        width={200}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        className="shadow-xl rounded overflow-hidden"
                                    />

                                    {/* Page Overlay Actions */}
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCropOpen(index); }}
                                            className="p-1.5 bg-gray-900/80 text-white rounded hover:bg-blue-600"
                                            title="Crop Page"
                                        >
                                            ✂️
                                        </button>
                                    </div>
                                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 rounded text-xs">
                                        Page {index + 1}
                                    </div>
                                </div>
                            ))}
                        </Document>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            Upload a PDF to start organizing
                        </div>
                    )}
                </div>
            </div>

            {/* Crop Modal */}
            {cropMode !== null && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-4 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                        <div className="flex justify-between mb-4">
                            <h3 className="text-xl font-bold">Crop Page {cropMode + 1}</h3>
                            <div className="space-x-2">
                                <button onClick={handleCropApply} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1 rounded">Apply Crop</button>
                                <button onClick={() => setCropMode(null)} className="bg-gray-600 hover:bg-gray-500 px-4 py-1 rounded">Cancel</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto flex justify-center bg-gray-900 relative p-4 select-none">
                            {/* We render the page large */}
                            <div className="relative inline-block border border-gray-600">
                                <Document file={pdfUrl}>
                                    <Page
                                        pageNumber={cropMode + 1}
                                        width={600}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                    />
                                </Document>

                                {/* Crop Box Overlay (Simplified simulator) 
                                    In a real production app, use 'react-rnd' or similar. 
                                    Here we use a simple localized slider control approach or just a static centered box for demonstration if no dragging lib.
                                    Let's try a simple Percentage Inputs for robustness if dragging is hard to build in one go.
                                */}
                                <div
                                    className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none"
                                    style={{
                                        left: `${cropRect.x}%`,
                                        top: `${cropRect.y}%`,
                                        width: `${cropRect.width}%`,
                                        height: `${cropRect.height}%`
                                    }}
                                >
                                    <div className="absolute top-0 left-0 bg-red-500 text-white text-xs px-1">Crop Area</div>
                                </div>
                            </div>
                        </div>

                        {/* Crop Controls */}
                        <div className="grid grid-cols-4 gap-4 mt-4">
                            <label>
                                X: <input type="number" value={cropRect.x} onChange={e => setCropRect({ ...cropRect, x: Number(e.target.value) })} className="bg-gray-700 w-16 px-1" /> %
                            </label>
                            <label>
                                Y: <input type="number" value={cropRect.y} onChange={e => setCropRect({ ...cropRect, y: Number(e.target.value) })} className="bg-gray-700 w-16 px-1" /> %
                            </label>
                            <label>
                                W: <input type="number" value={cropRect.width} onChange={e => setCropRect({ ...cropRect, width: Number(e.target.value) })} className="bg-gray-700 w-16 px-1" /> %
                            </label>
                            <label>
                                H: <input type="number" value={cropRect.height} onChange={e => setCropRect({ ...cropRect, height: Number(e.target.value) })} className="bg-gray-700 w-16 px-1" /> %
                            </label>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">Adjust percentages to define crop area.</p>
                    </div>
                </div>
            )}

            {isProcessing && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-500"></div>
                </div>
            )}
        </div>
    );
};

export default OrganizeScreen;
