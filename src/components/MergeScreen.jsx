import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

const MergeScreen = ({ onBack }) => {
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileChange = (e) => {
        const newFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
        if (newFiles.length === 0 && e.target.files.length > 0) {
            alert("Only PDF files are allowed.");
        }
        setFiles(prev => [...prev, ...newFiles]);
        // Reset input
        e.target.value = '';
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleMerge = async () => {
        if (files.length < 2) {
            alert("Please select at least 2 PDF files to merge.");
            return;
        }

        setIsProcessing(true);
        try {
            const mergedPdf = await PDFDocument.create();

            for (const file of files) {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const mergedPdfBytes = await mergedPdf.save();
            const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });

            // Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `merged_${Date.now()}.pdf`;
            link.click();

            alert("Merge successful! Downloading file...");

        } catch (err) {
            console.error("Merge error:", err);
            alert("Failed to merge PDFs: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10">
            <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                        Merge PDFs
                    </h2>
                    <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                        ✕ Close
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-gray-700/30 transition-all cursor-pointer relative">
                        <input
                            type="file"
                            accept="application/pdf"
                            multiple
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="text-gray-300">
                            <p className="text-xl font-semibold mb-2">Drop PDFs here or Click</p>
                            <p className="text-sm text-gray-400">Select multiple files to combine</p>
                        </div>
                    </div>

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                            {files.map((file, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-700 p-3 rounded hover:bg-gray-650 transition-colors">
                                    <div className="flex items-center space-x-3 truncate">
                                        <span className="text-red-400 text-xl">📄</span>
                                        <span className="truncate max-w-xs">{file.name}</span>
                                        <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    </div>
                                    <button
                                        onClick={() => removeFile(idx)}
                                        className="text-red-400 hover:text-red-300 px-2 py-1"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action Button */}
                    <button
                        onClick={handleMerge}
                        disabled={files.length < 2 || isProcessing}
                        className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg transform transition-all 
                            ${files.length >= 2 && !isProcessing
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-[1.02] active:scale-[0.98] text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        {isProcessing ? (
                            <span className="flex items-center justify-center">
                                <span className="animate-spin h-5 w-5 border-t-2 border-white rounded-full mr-2"></span>
                                Merging...
                            </span>
                        ) : 'Merge Files Now ✨'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MergeScreen;
