import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileJson, Mountain, X } from 'lucide-react';

interface FileUploadProps {
  label: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
  icon?: 'geojson' | 'geotiff';
  disabled?: boolean;
}

export function FileUpload({
  label,
  accept,
  multiple = false,
  files,
  onFilesChange,
  icon = 'geojson',
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      const newFiles = Array.from(incoming);
      if (multiple) {
        onFilesChange([...files, ...newFiles]);
      } else {
        onFilesChange(newFiles.slice(0, 1));
      }
    },
    [files, multiple, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!disabled) handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const Icon = icon === 'geotiff' ? Mountain : FileJson;

  return (
    <div className="space-y-2">
      <div
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer
          ${isDragging ? 'border-sky-400 bg-sky-950/40' : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Icon size={18} />
            <Upload size={14} />
          </div>
          <p className="text-sm text-slate-300 font-medium">{label}</p>
          <p className="text-xs text-slate-500">
            {multiple ? 'Drop files or click to browse' : 'Drop file or click to browse'}
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon size={13} className="text-sky-400 shrink-0" />
                <span className="text-xs text-slate-300 truncate">{file.name}</span>
                <span className="text-xs text-slate-500 shrink-0">
                  ({(file.size / 1024 / 1024).toFixed(1)}MB)
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="text-slate-500 hover:text-red-400 transition-colors ml-2 shrink-0"
                disabled={disabled}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
