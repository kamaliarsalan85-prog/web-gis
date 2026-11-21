import React, { useEffect } from 'react';
import { ArrowUturnLeftIcon, ArrowUturnRightIcon } from '@heroicons/react/24/solid';
import { toast } from 'react-toastify';

const UndoRedoButtons = ({ undo, redo, canUndo = false, canRedo = false, history = [] }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // جلوگیری از اعمال میانبر در ورودی‌های متنی
      const tag = e.target?.tagName?.toLowerCase() || '';
      const isEditable =
        tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (isEditable) return;

      const metaOrCtrl = e.ctrlKey || e.metaKey;
      const key = e.key?.toLowerCase() || '';

      if (metaOrCtrl && key === 'z' && canUndo) {
        e.preventDefault();
        if (typeof undo === 'function') {
          undo();
          toast.info('بازگشت انجام شد', { autoClose: 2000 });
        }
      } else if (metaOrCtrl && key === 'y' && canRedo) {
        e.preventDefault();
        if (typeof redo === 'function') {
          redo();
          toast.info('بازگردانی انجام شد', { autoClose: 2000 });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const lastDesc = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;

  return (
    <div className="hidden fixed left-111  top-42 md:ml-30 md:top-5 md:left-95 z-[1003] md:flex gap-3  p-2 rounded-xl font-vazir">
      <button
        onClick={undo}
        disabled={!canUndo}
        className={` w-22 flex items-center px-3 py-2 rounded-md text-sm font-medium transition ${
          canUndo
            ? 'bg-red-500 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
        title={lastDesc ? `بازگشت: ${lastDesc}` : 'هیچ تغییری برای بازگشت وجود ندارد'}
        aria-label={lastDesc ? `بازگشت به ${lastDesc}` : 'بازگشت (غیرفعال)'}
        aria-disabled={!canUndo}
      >
        <ArrowUturnLeftIcon className="w-4 h-4 ml-1" />
        بازگشت
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className={`flex mt-2 md:mt-0 items-center px-3 py-2 rounded-md text-sm font-medium transition ${
          canRedo
            ? 'bg-red-500  text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
        title={lastDesc ? `بازگردانی: ${lastDesc}` : 'هیچ تغییری برای بازگردانی وجود ندارد'}
        aria-label={lastDesc ? `بازگردانی ${lastDesc}` : 'بازگردانی (غیرفعال)'}
        aria-disabled={!canRedo}
      >
        <ArrowUturnRightIcon className="w-4 h-4 ml-1" />
        بازگردانی
      </button>
    </div>
  );
};

export default UndoRedoButtons;