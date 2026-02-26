'use client';

import React from 'react';
import { primaryButtonClass, subtleButtonClass } from './ui/formClasses';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600 mt-2">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className={subtleButtonClass}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              destructive
                ? 'px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors'
                : primaryButtonClass
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
