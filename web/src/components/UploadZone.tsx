import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';

interface Props {
  label: string;
  accept?: string;
  onFile: (file: File) => void;
  file?: File | null;
  optional?: boolean;
}

export function UploadZone({ label, accept = '.xlsx,.xls', onFile, file, optional }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handle = (f: File | null | undefined) => {
    if (f) onFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      className={`cursor-pointer border-2 border-dashed rounded-xl p-5 transition-colors flex flex-col items-center gap-2 text-center
        ${drag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
        ${file ? 'border-green-400 bg-green-50' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {file ? (
        <>
          <FileSpreadsheet className="text-green-500" size={28} />
          <p className="text-sm font-medium text-green-700">{file.name}</p>
        </>
      ) : (
        <>
          <Upload className="text-gray-400" size={28} />
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          {optional && <p className="text-xs text-gray-400">Opcional</p>}
          <p className="text-xs text-gray-400">Clique ou arraste o arquivo aqui</p>
        </>
      )}
    </div>
  );
}
