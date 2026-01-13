import React, { useState } from 'react';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

const WatermarkScreen = ({ onBack }) => {
    const [file, setFile] = useState(null);
    const [text, setText] = useState('CONFIDENTIAL');
    const [color, setColor] = useState('#FF0000');
    const [opacity, setOpacity] = useState(0.5);
    const [size, setSize] = useState(50);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            if (selected.type !== 'application/pdf') {
                alert("Only PDF files are supported.");
                return;
            }
            setFile(selected);
        }
    };

    const handleApplyWatermark = async () => {
        if (!file) return;

        setIsProcessing(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const pages = pdfDoc.getPages();

            // Convert hex color to rgb
            const r = parseInt(color.slice(1, 3), 16) / 255;
            const g = parseInt(color.slice(3, 5), 16) / 255;
            const b = parseInt(color.slice(5, 7), 16) / 255;
            const rgbColor = rgb(r, g, b);

            for (const page of pages) {
                const { width, height } = page.getSize();
                page.drawText(text, {
                    x: width / 2 - (size * text.length) / 4, // Rough centering
                    y: height / 2,
                    size: Number(size),
                    color: rgbColor,
                    opacity: Number(opacity),
                    rotate: degrees(45),
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            // Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `watermarked_${file.name}`;
            link.click();

            alert("Watermark applied successfully!");

        } catch (err) {
            console.error(err);
            alert("Failed to apply watermark: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10">
            <div className="w-full max-w-xl bg-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                        Add Watermark
                    </h2>
                    <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                        ✕ Close
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-cyan-500 hover:bg-gray-700/30 transition-all cursor-pointer relative">
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="text-gray-300">
                            {file ? (
                                <div>
                                    <span className="text-4xl block mb-2">📄</span>
                                    <p className="text-lg font-semibold text-cyan-400">{file.name}</p>
                                </div>
                            ) : (
                                <div>
                                    <span className="text-4xl block mb-2">⬇️</span>
                                    <p className="text-xl font-semibold">Upload PDF</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Settings */}
                    <div className="bg-gray-700 p-4 rounded-lg space-y-4">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Watermark Text</label>
                            <input
                                type="text"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Color</label>
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-full h-10 bg-transparent cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Size (px)</label>
                                <input
                                    type="number"
                                    value={size}
                                    onChange={(e) => setSize(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-300 mb-1">Opacity: {opacity}</label>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.1"
                                value={opacity}
                                onChange={(e) => setOpacity(e.target.value)}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleApplyWatermark}
                        disabled={!file || !text || isProcessing}
                        className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg transform transition-all 
                            ${file && !isProcessing
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-[1.02] active:scale-[0.98] text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        {isProcessing ? 'Processing...' : 'Apply Watermark ✨'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WatermarkScreen;
