// FileUploadSection.jsx
import React, { useState, useEffect } from 'react';

const FileUploadSection = () => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = new WebSocket('ws://your-server-url');

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'file_uploaded') {
        setFiles(prev => [...prev, data.filename]);
      } else if (data.type === 'file_deleted') {
        setFiles(prev => prev.filter(file => file !== data.filename));
      }
    };

    return () => socket.close();
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const filesArray = Array.from(e.dataTransfer.files);
    uploadFiles(filesArray);
  };

  const handleFileSelect = (e) => {
    const filesArray = Array.from(e.target.files);
    uploadFiles(filesArray);
  };

  const uploadFiles = (filesArray) => {
    const formData = new FormData();
    filesArray.forEach(file => {
      formData.append('file', file);
    });

    fetch('/upload', {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      return response.json();
    })
    .catch(error => {
      alert('Error uploading file: ' + error.message);
    });
  };

  const deleteFile = (filename) => {
    fetch(`/delete/${filename}`, { method: 'DELETE' })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setFiles(prev => prev.filter(file => file !== filename));
        } else {
          alert("Error deleting file: " + data.error);
        }
      });
  };

  return (
    <div className="upload-section">
      <div
        className={`upload-box ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('hidden-file-input').click()}
      >
        <p>Drag & Drop files here or click to upload your CSV files</p>
      </div>
      
      <input
        type="file"
        id="hidden-file-input"
        hidden
        onChange={handleFileSelect}
      />

      <ul className="file-list">
        {files.map((file, index) => (
          <li key={`${file}-${index}`}>
            <a href={`/download/${file}`} target="_blank" rel="noopener noreferrer">
              {file}
            </a>
            <button 
              className="delete-btn" 
              onClick={() => deleteFile(file)}
            >
              Delete
            </button>
          </li>
        ))}
        {files.length === 0 && (
          <li style={{ color: '#555' }}>No files available for download</li>
        )}
      </ul>
    </div>
  );
};

export default FileUploadSection;