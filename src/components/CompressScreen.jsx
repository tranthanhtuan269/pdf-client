import React, { useState } from 'react';

const CompressScreen = ({ onBack, apiBase }) => {

    const [file, setFile] = useState(null);
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

    const handleCompress = async () => {
        if (!file) return;

        setIsProcessing(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${apiBase}/api/compress-pdf`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText);
            }

            const blob = await response.blob();

            // Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `compressed_${file.name}`;
            link.click();

            alert("File compressed and downloaded!");

        } catch (err) {
            console.error(err);
            alert("Compression failed: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10" >
            <div className="w-full max-w-xl bg-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
                        Compress PDF
                    </h2>
                    <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                        ✕ Close
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-gray-600 rounded-lg p-10 text-center hover:border-orange-500 hover:bg-gray-700/30 transition-all cursor-pointer relative">
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
                                    <p className="text-lg font-semibold text-orange-400">{file.name}</p>
                                    <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            ) : (
                                <div>
                                    <span className="text-4xl block mb-2">⬇️</span>
                                    <p className="text-xl font-semibold mb-2">Upload PDF to Compress</p>
                                    <p className="text-sm text-gray-400">Reduce file size efficiently</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleCompress}
                        disabled={!file || isProcessing}
                        className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg transform transition-all 
                            ${file && !isProcessing
                                ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:scale-[1.02] active:scale-[0.98] text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        {isProcessing ? (
                            <span className="flex items-center justify-center">
                                <span className="animate-spin h-5 w-5 border-t-2 border-white rounded-full mr-2"></span>
                                Optimizing...
                            </span>
                        ) : 'Compress PDF 🚀'}
                    </button>
                </div>
            </div>
        </div >
    );
};

export default CompressScreen;
