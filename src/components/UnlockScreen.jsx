import React, { useState } from 'react';

const UnlockScreen = ({ onBack, apiBase }) => {

    const [file, setFile] = useState(null);
    const [password, setPassword] = useState('');
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

    const handleUnlock = async () => {
        if (!file || !password) {
            alert("Please provide both a file and the current password.");
            return;
        }

        setIsProcessing(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('password', password);

        try {
            const response = await fetch(`${apiBase}/api/unlock-pdf`, {
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
            link.download = `unlocked_${file.name}`;
            link.click();

            alert("File unlocked successfully!");

        } catch (err) {
            console.error(err);
            alert("Unlock failed: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center py-10" >
            <div className="w-full max-w-xl bg-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                        Unlock PDF
                    </h2>
                    <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                        ✕ Close
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-gray-600 rounded-lg p-10 text-center hover:border-purple-500 hover:bg-gray-700/30 transition-all cursor-pointer relative">
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="text-gray-300">
                            {file ? (
                                <div>
                                    <span className="text-4xl block mb-2">🔒</span>
                                    <p className="text-lg font-semibold text-purple-400">{file.name}</p>
                                    <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            ) : (
                                <div>
                                    <span className="text-4xl block mb-2">⬇️</span>
                                    <p className="text-xl font-semibold mb-2">Upload Locked PDF</p>
                                    <p className="text-sm text-gray-400">Remove password protection</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Password Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Current Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="Enter the PDF password"
                        />
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleUnlock}
                        disabled={!file || !password || isProcessing}
                        className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg transform transition-all 
                            ${file && password && !isProcessing
                                ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:scale-[1.02] active:scale-[0.98] text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        {isProcessing ? (
                            <span className="flex items-center justify-center">
                                <span className="animate-spin h-5 w-5 border-t-2 border-white rounded-full mr-2"></span>
                                Unlocking...
                            </span>
                        ) : 'Unlock PDF 🔓'}
                    </button>
                </div>
            </div>
        </div >
    );
};

export default UnlockScreen;
