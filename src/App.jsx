import React, { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import PdfEditor from './components/PdfEditor';

function App() {
  const [currentFile, setCurrentFile] = useState(null); // { url, type, name }
  const [isUploading, setIsUploading] = useState(false);

  const handleFilePayload = async (file) => {
    setIsUploading(true);

    // Upload to backend
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      // data.file has { url, type, ... }
      setCurrentFile(data.file);

    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleBack = () => {
    setCurrentFile(null);
  };

  if (isUploading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (currentFile) {
    return <PdfEditor file={currentFile} onBack={handleBack} />;
  }

  return <UploadScreen onFilePayload={handleFilePayload} />;
}

export default App;
