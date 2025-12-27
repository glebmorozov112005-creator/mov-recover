import { Upload, FileVideo, CheckCircle, AlertCircle, Loader2, Download, HardDrive, Cpu, Video, Save, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

const App = () => {
  const [brokenPath, setBrokenPath] = useState('');
  const [referencePath, setReferencePath] = useState('');
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [fixedFilePath, setFixedFilePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('repair'); // repair, disk

  // Disk Recovery States
  const [drives, setDrives] = useState([]);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [imagingProgress, setImagingProgress] = useState(0);

  useEffect(() => {
    if (activeTab === 'disk') {
      loadDrives();
    }

    // Listen for disk imaging progress
    const removeListener = window.electronAPI.onDiskImageProgress((data) => {
      setImagingProgress(data.progress);
    });

    return () => removeListener && removeListener();
  }, [activeTab]);

  const loadDrives = async () => {
    try {
      const driveList = await window.electronAPI.listDrives();
      setDrives(driveList.filter(d => !d.isSystem)); // Only show non-system drives by default
    } catch (err) {
      console.error('Failed to load drives:', err);
    }
  };

  const handleCreateDiskImage = async () => {
    if (!selectedDrive) return;

    const outputPath = await window.electronAPI.selectSavePath({
      title: 'Save Disk Image',
      defaultPath: `disk_image_${Date.now()}.img`,
      filters: [{ name: 'Disk Images', extensions: ['img'] }]
    });

    if (!outputPath) return;

    setStatus('processing');
    setImagingProgress(0);

    try {
      await window.electronAPI.createDiskImage({
        drivePath: selectedDrive.device,
        outputPath
      });
      setFixedFilePath(outputPath);
      setStatus('success');
    } catch (err) {
      setErrorMessage(err || 'Failed to create disk image.');
      setStatus('error');
    }
  };

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
        <p className="subtitle">Restore your corrupted video files or create disk images locally.</p>

        <div className="flex gap-4 mb-4 border-b border-white/10 pb-2">
          <button
            onClick={() => { setStatus('idle'); setActiveTab('repair'); }}
            className={`pb-2 px-4 transition-all ${activeTab === 'repair' ? 'text-blue-400 border-b-2 border-blue-400 font-bold' : 'opacity-50 hover:opacity-100'}`}
          >
            Video Repair
          </button>
          <button
            onClick={() => { setStatus('idle'); setActiveTab('disk'); }}
            className={`pb-2 px-4 transition-all ${activeTab === 'disk' ? 'text-blue-400 border-b-2 border-blue-400 font-bold' : 'opacity-50 hover:opacity-100'}`}
          >
            Disk Imaging
          </button>
        </div>

        {activeTab === 'repair' ? (
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
        ) : (
          <div className="space-y-4 mb-8">
            <p className="text-xs text-dim text-center">Select a physical drive to create a raw bit-by-bit recovery image.</p>
            <div className="grid gap-2 max-h-[200px] overflow-auto pr-2">
              {drives.length === 0 ? (
                <p className="text-center text-dim py-4 italic text-sm">No external drives found</p>
              ) : (
                drives.map((drive, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedDrive(drive)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between
                      ${selectedDrive?.device === drive.device ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <HardDrive size={18} className={selectedDrive?.device === drive.device ? 'text-blue-400' : 'text-dim'} />
                      <div className="overflow-hidden">
                        <p className="text-xs font-medium truncate">{drive.description || drive.model}</p>
                        <p className="text-[10px] text-dim">{drive.device} • {(drive.size / 1024 / 1024 / 1024).toFixed(2)} GB</p>
                      </div>
                    </div>
                    {selectedDrive?.device === drive.device && <Check size={14} className="text-blue-400" />}
                  </div>
                ))
              )}
            </div>
            <button
              onClick={loadDrives}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-all block mx-auto underline"
            >
              Refresh Drives
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="btn-primary"
              onClick={activeTab === 'repair' ? handleRepair : handleCreateDiskImage}
              disabled={activeTab === 'repair' ? (!brokenPath || !referencePath) : !selectedDrive}
            >
              {activeTab === 'repair' ? 'Start Local Recovery' : 'Create Disk Image'}
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
                  animate={{ width: `${activeTab === 'repair' ? '100%' : imagingProgress + '%'}` }}
                  transition={activeTab === 'repair' ? { duration: 15, ease: "linear" } : { duration: 0.5 }}
                  className="progress-fill"
                />
              </div>
              <p className="status">
                <Loader2 className="animate-spin inline mr-2" />
                {activeTab === 'repair' ? 'Repairing video with FFmpeg...' : `Imaging Disk: ${imagingProgress}%`}
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
