'use client';
import React, { useState } from 'react';
import { UploadCloud, FileText, Check, AlertCircle, ArrowRight } from 'lucide-react';

export const ImportWizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Tasks</h1>
        <p className="text-slate-500">Bulk upload UAT scenarios via Excel template.</p>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-between mb-10 relative">
        <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-200 -z-10"></div>
        {[1, 2, 3].map((s) => (
          <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= s ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
            {step > s ? <Check size={14} /> : s}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in">
             <div 
               className={`w-full max-w-md h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
               onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
               onDragLeave={() => setIsDragOver(false)}
               onDrop={(e) => { e.preventDefault(); setIsDragOver(false); setStep(2); }}
               onClick={() => setStep(2)}
             >
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mb-4">
                  <UploadCloud size={24} />
                </div>
                <p className="text-slate-900 font-medium">Click to upload or drag and drop</p>
                <p className="text-slate-400 text-sm mt-1">XLSX or CSV (Max 5MB)</p>
             </div>
             <div className="mt-8 flex gap-2 text-sm text-blue-600 hover:underline cursor-pointer">
                <FileText size={16} /> Download Template
             </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 p-6 animate-fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-900">Preview & Validate</h3>
                <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-100">45 Valid Rows</span>
             </div>
             <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                         <th className="p-3 font-medium">Title</th>
                         <th className="p-3 font-medium">Module</th>
                         <th className="p-3 font-medium">Priority</th>
                         <th className="p-3 font-medium">Country</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-slate-700">
                      <tr>
                         <td className="p-3">Verify Login Flow</td>
                         <td className="p-3">Auth</td>
                         <td className="p-3">High</td>
                         <td className="p-3">SG</td>
                      </tr>
                      <tr>
                         <td className="p-3">Checkout as Guest</td>
                         <td className="p-3">Ordering</td>
                         <td className="p-3">Medium</td>
                         <td className="p-3">SG</td>
                      </tr>
                      <tr>
                         <td className="p-3">Download PDF</td>
                         <td className="p-3">Report</td>
                         <td className="p-3">Low</td>
                         <td className="p-3">SG</td>
                      </tr>
                      <tr className="bg-red-50/50">
                         <td className="p-3 flex items-center gap-2"><AlertCircle size={14} className="text-red-500"/> Invalid Date Format</td>
                         <td className="p-3">Admin</td>
                         <td className="p-3">-</td>
                         <td className="p-3">SG</td>
                      </tr>
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {step === 3 && (
           <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                 <Check size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Import Successful!</h2>
              <p className="text-slate-500 mt-2 max-w-sm">45 tasks have been created and assigned to stakeholders in Singapore.</p>
           </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
           {step > 1 && step < 3 && (
             <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium text-sm">Cancel</button>
           )}
           {step < 3 && (
             <button 
               onClick={() => setStep(step + 1)} 
               className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm flex items-center gap-2"
             >
               {step === 2 ? 'Confirm Import' : 'Next'} <ArrowRight size={16} />
             </button>
           )}
        </div>
      </div>
    </div>
  );
};
