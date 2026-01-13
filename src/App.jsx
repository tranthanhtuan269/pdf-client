import React, { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import PdfEditor from './components/PdfEditor';
import MergeScreen from './components/MergeScreen';
import CompressScreen from './components/CompressScreen';
import UnlockScreen from './components/UnlockScreen';
import WatermarkScreen from './components/WatermarkScreen';
import OrganizeScreen from './components/OrganizeScreen';

function App() {
  const [currentFile, setCurrentFile] = useState(null); // { url, type, name }
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState('home'); // 'home', 'editor', 'merge', 'compress'

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
      setMode('editor');

    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleBack = () => {
    setCurrentFile(null);
    setMode('home');
  };

  if (isUploading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (mode === 'editor' && currentFile) {
    return <PdfEditor file={currentFile} onBack={handleBack} />;
  }

  if (mode === 'merge') {
    return <MergeScreen onBack={() => setMode('home')} />;
  }

  if (mode === 'compress') {
    return <CompressScreen onBack={() => setMode('home')} />;
  }

  if (mode === 'unlock') {
    return <UnlockScreen onBack={() => setMode('home')} />;
  }

  if (mode === 'watermark') {
    return <WatermarkScreen onBack={() => setMode('home')} />;
  }

  if (mode === 'organize') {
    return <OrganizeScreen onBack={() => setMode('home')} />;
  }

  // Pass setMode options to UploadScreen
  return (
    <UploadScreen
      onFilePayload={handleFilePayload}
      onMergeClick={() => setMode('merge')}
      onCompressClick={() => setMode('compress')}
      onUnlockClick={() => setMode('unlock')}
      onWatermarkClick={() => setMode('watermark')}
      onOrganizeClick={() => setMode('organize')}
    />
  );
}

export default App;
