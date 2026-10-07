import { Check, X } from 'lucide-react';
import { useState } from 'react';
import ImageCropper from './ImageCropper';
import ThreeDots from './ThreeDots';

export const NONE = '__none__';

const AvatarPickerModal = ({ selectedFile, previewUrl, onClose, onSave, saving }) => {
  const [crop, setCrop] = useState(null);
  const [error, setError] = useState('');

  return (
    <div className='fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-4'>
      <div
        className='absolute inset-0 bg-black/60 backdrop-blur-sm'
        onClick={onClose}
      />
      <div className='relative bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md overflow-hidden'>
        <div className='bg-gray-900 px-5 py-4 flex items-center justify-between'>
          <div>
            <h2 className='text-white font-bold text-base'>Adjust Profile Picture</h2>
            <p className='text-gray-400 text-xs mt-0.5'>
              Crop your image before saving
            </p>
          </div>
          <button
            onClick={onClose}
            className='w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center'
          >
            <X size={16} className='text-white' />
          </button>
        </div>

        <div className='p-6 space-y-5'>
          {previewUrl && (
            <ImageCropper
              src={previewUrl}
              onCropChange={setCrop}
              onError={() => setError('Could not load the selected image.')}
            />
          )}
          {error && <p className='text-sm text-center text-red-600'>{error}</p>}
        </div>

        <div className='px-6 py-4 border-t border-gray-100 flex items-center justify-between'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl'
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedFile, crop)}
            disabled={!selectedFile || !crop || saving}
            className='flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-40'
          >
            {saving ? (
              <ThreeDots size='sm' className='text-white' />
            ) : (
              <Check size={14} />
            )}
            {saving ? 'Uploading...' : 'Save picture'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarPickerModal;
