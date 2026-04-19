'use client'
import { useDropzone } from 'react-dropzone'
import { useCallback } from 'react'
import { Upload } from 'lucide-react'
import { clsx } from 'clsx'

interface FileUploadProps {
  label?: string
  file: File | null
  onChange: (file: File) => void
  accept?: Record<string, string[]>
}

export function FileUpload({
  label = 'Drop file here or click to select',
  file,
  onChange,
  accept,
}: FileUploadProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onChange(accepted[0])
    },
    [onChange],
  )

  const defaultAccept = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept ?? defaultAccept,
    maxFiles: 1,
  })

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
        isDragActive
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 bg-gray-50',
      )}
    >
      <input {...getInputProps()} />
      <Upload className="h-8 w-8 text-gray-400 mb-3" />
      {file ? (
        <p className="text-sm font-medium text-gray-700">{file.name}</p>
      ) : (
        <p className="text-sm text-gray-500">{label}</p>
      )}
    </div>
  )
}
