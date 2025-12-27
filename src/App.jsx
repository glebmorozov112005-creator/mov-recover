import React, { useState } from 'react';
import { Upload, FileVideo, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [brokenPath, setBrokenPath] = useState('');
  const [referencePath, setReferencePath] = useState('');
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [fixedFilePath, setFixedFilePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSelectFile = async (type) => {
    try {
      const path = await window.electronAPI.selectFile();
      if (path) {
        if (type === 'broken') setBrokenPath(path);
        else setReferencePath(path);
      }
    } catch (err) {
      console.error('File selection error:', err);
    }
  };

  const handleRepair = async () => {
    if (!brokenPath || !referencePath) return;

    setStatus('processing');
    setErrorMessage('');

    try {
      const result = await window.electronAPI.repairVideo({ brokenPath, referencePath });
      setFixedFilePath(result.outputPath);
      setStatus('success');
    } catch (err) {
      console.error('Repair error:', err);
      setStatus('error');
      setErrorMessage(err || 'An error occurred during recovery.');
    }
  };

  const handleDownload = async () => {
    if (!fixedFilePath) return;
    try {
      await window.electronAPI.saveFile(fixedFilePath);
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  return (
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
      >
        <h1 className="title">MOV Recovery Desktop</h1>
        <p className="subtitle">Restore your corrupted video files locally with high precision.</p>

        <div className="upload-grid">
          <div
            className={`upload-box ${brokenPath ? 'active' : ''}`}
            onClick={() => handleSelectFile('broken')}
          >
            <Upload className="icon" />
            <h3>Corrupted File</h3>
            <p className="file-info">{brokenPath ? brokenPath.split(/[\\/]/).pop() : 'Click to select broken .mov'}</p>
          </div>

          <div
            className={`upload-box ${referencePath ? 'active' : ''}`}
            onClick={() => handleSelectFile('reference')}
          >
            <FileVideo className="icon" />
            <h3>Reference File</h3>
            <p className="file-info">{referencePath ? referencePath.split(/[\\/]/).pop() : 'Select a healthy .mov'}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="btn-primary"
              onClick={handleRepair}
              disabled={!brokenPath || !referencePath}
            >
              Start Local Recovery
            </motion.button>
          )}

          {status === 'processing' && (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="progress-container"
            >
              <div className="progress-bar">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 15, ease: "linear" }}
                  className="progress-fill"
                />
              </div>
              <p className="status">
                <Loader2 className="animate-spin inline mr-2" />
                Repairing video with FFmpeg...
              </p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="download-section"
            >
              <div className="flex items-center justify-center gap-2 text-green-400 mb-4">
                <CheckCircle />
                <span>Recovery Complete!</span>
              </div>
              <button
                onClick={handleDownload}
                className="btn-download"
              >
                <Download />
                Save Repaired File
              </button>
              <button
                onClick={() => setStatus('idle')}
                className="mt-4 block w-full text-dim hover:text-white"
              >
                Fix another file
              </button>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mt-4"
            >
              <div className="flex items-center justify-center gap-2 text-red-400 mb-2">
                <AlertCircle />
                <span>Error: Repair Failed</span>
              </div>
              <div className="bg-red-900/20 border border-red-900/50 rounded p-3 mb-4 max-h-32 overflow-auto">
                <p className="text-xs text-red-300 font-mono text-left break-all">{errorMessage}</p>
              </div>
              <button
                onClick={() => setStatus('idle')}
                className="btn-primary"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default App;
