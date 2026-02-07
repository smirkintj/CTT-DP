'use client';
import React, { useState } from 'react';
import { CountryConfig } from '../types';
import { Trash2, Plus, Globe, Package } from 'lucide-react';

interface AdminDatabaseProps {
  countries: CountryConfig[];
  modules: string[];
  onUpdateCountries: (countries: CountryConfig[]) => void;
  onUpdateModules: (modules: string[]) => void;
}

export const AdminDatabase: React.FC<AdminDatabaseProps> = ({ countries, modules, onUpdateCountries, onUpdateModules }) => {
  const [activeTab, setActiveTab] = useState<'countries' | 'modules'>('countries');
  
  // Country Input State
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');

  // Module Input State
  const [newModule, setNewModule] = useState('');

  const handleAddCountry = () => {
      if (newCountryName && newCountryCode) {
          const newC: CountryConfig = {
              name: newCountryName,
              code: newCountryCode.toUpperCase(),
              color: 'bg-slate-100 text-slate-600' // Default color
          };
          onUpdateCountries([...countries, newC]);
          setNewCountryName('');
          setNewCountryCode('');
      }
  };

  const handleDeleteCountry = (code: string) => {
      onUpdateCountries(countries.filter(c => c.code !== code));
  };

  const handleAddModule = () => {
      if (newModule && !modules.includes(newModule)) {
          onUpdateModules([...modules, newModule]);
          setNewModule('');
      }
  };

  const handleDeleteModule = (mod: string) => {
      onUpdateModules(modules.filter(m => m !== mod));
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">System Database</h1>
            <p className="text-slate-500">Manage Master Data and List of Values.</p>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('countries')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'countries' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Countries
            </button>
            <button 
              onClick={() => setActiveTab('modules')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'modules' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Modules
            </button>
        </div>

        {activeTab === 'countries' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Country Name</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm" 
                           placeholder="e.g. Indonesia"
                           value={newCountryName}
                           onChange={(e) => setNewCountryName(e.target.value)}
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Code</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm uppercase" 
                           placeholder="ID"
                           maxLength={2}
                           value={newCountryCode}
                           onChange={(e) => setNewCountryCode(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={handleAddCountry}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {countries.map(c => (
                        <div key={c.code} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                                    {c.code}
                                </div>
                                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                            </div>
                            <button onClick={() => handleDeleteCountry(c.code)} className="text-slate-400 hover:text-red-500 p-1">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'modules' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Module Name</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm" 
                           placeholder="e.g. Logistics"
                           value={newModule}
                           onChange={(e) => setNewModule(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={handleAddModule}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {modules.map(m => (
                        <div key={m} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Package size={18} className="text-slate-400" />
                                <span className="text-sm font-medium text-slate-900">{m}</span>
                            </div>
                            <button onClick={() => handleDeleteModule(m)} className="text-slate-400 hover:text-red-500 p-1">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

    </div>
  );
};
