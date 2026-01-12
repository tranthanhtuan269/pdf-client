import React, { useState, useRef } from 'react';

const UploadScreen = ({ onFilePayload }) => {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const validateFile = (file) => {
        const validExtensions = [
            'pdf', 'doc', 'docx', 'ppt', 'pptx',
            'xls', 'xlsx', 'bmp', 'jpg', 'jpeg',
            'gif', 'png', 'txt'
        ];
        const ext = file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(ext)) {
            return 'File type not supported.';
        }

        const sizeMB = file.size / (1024 * 1024);
        if (ext === 'pdf') {
            if (sizeMB > 100) return 'PDF exceeds 100MB limit.';
        } else {
            if (sizeMB > 20) return 'File exceeds 20MB limit.';
        }

        return null; // Valid
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        setError(null);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            const validationError = validateFile(file);
            if (validationError) {
                setError(validationError);
            } else {
                onFilePayload(file);
            }
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        setError(null);
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validationError = validateFile(file);
            if (validationError) {
                setError(validationError);
            } else {
                onFilePayload(file);
            }
        }
    };

    const onButtonClick = () => {
        inputRef.current.click();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white p-4">
            <div className="max-w-xl w-full text-center space-y-8">
                <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-blue-500 drop-shadow-lg">
                    DocuMaster
                </h1>
                <p className="text-gray-300 text-lg">Upload your documents to view and annotate.</p>

                <div
                    className={`relative p-10 border-4 border-dashed rounded-3xl transition-all duration-300 ease-in-out cursor-pointer group
            ${dragActive ? 'border-blue-400 bg-white/10 scale-105' : 'border-gray-600 bg-white/5 hover:border-blue-400/50 hover:bg-white/10'}
          `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={onButtonClick}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        className="hidden"
                        onChange={handleChange}
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.bmp,.jpg,.jpeg,.gif,.png,.txt"
                    />

                    <div className="flex flex-col items-center space-y-4">
                        <div className="p-4 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full shadow-lg group-hover:shadow-blue-500/50 transition-shadow duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <p className="text-xl font-semibold">Drag & drop your file here</p>
                        <p className="text-sm text-gray-400">or click to browse</p>
                        <div className="mt-4 text-xs text-gray-500 space-y-1">
                            <p>Supported: PDF (100MB), DOC, PPT, IMG (20MB)</p>
                        </div>
                    </div>

                    {dragActive && (
                        <div className="absolute inset-0 bg-blue-500/20 rounded-3xl backdrop-blur-sm flex items-center justify-center">
                            <p className="text-2xl font-bold text-white mb-2">Drop it!</p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 animate-pulse">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UploadScreen;
