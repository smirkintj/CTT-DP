'use client';
import React, { useState } from 'react';
import { Task, Status, Priority, TestStep, TargetSystem, CountryConfig } from '../types';
import { Badge } from '../components/Badge';
import { MOCK_USERS } from '../constants';
import { Edit2, Trash2, Plus, UploadCloud, Search, Filter, X, Save, Globe } from 'lucide-react';

interface AdminTaskManagementProps {
  tasks: Task[];
  onImport: () => void;
  onEdit: (task: Task) => void;
  onAddTask: (tasks: Task[]) => void;
  availableCountries: CountryConfig[];
  availableModules: string[];
}

export const AdminTaskManagement: React.FC<AdminTaskManagementProps> = ({ 
    tasks, 
    onImport, 
    onEdit, 
    onAddTask,
    availableCountries,
    availableModules 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New Task State
  const [newTask, setNewTask] = useState<Partial<Task>>({
     title: '',
     description: '',
     featureModule: 'Ordering',
     priority: Priority.MEDIUM,
     assigneeId: MOCK_USERS[0].id,
     dueDate: '',
     scope: 'Local',
     targetSystem: 'Ordering Portal',
     crNumber: '',
  });

  const [selectedCountries, setSelectedCountries] = useState<string[]>(['SG']);
  const [steps, setSteps] = useState<Partial<TestStep>[]>([
      { id: '1', description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }
  ]);

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.featureModule.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleCountry = (code: string) => {
      if (selectedCountries.includes(code)) {
          if (selectedCountries.length > 1) { // Prevent empty selection
              setSelectedCountries(selectedCountries.filter(c => c !== code));
          }
      } else {
          setSelectedCountries([...selectedCountries, code]);
      }
  };

  const handleCreate = () => {
     if (!newTask.title) return;
     
     const createdTasks: Task[] = [];
     
     // Generate one task per selected country
     selectedCountries.forEach(countryCode => {
         // Filter steps that are applicable to 'ALL' or specifically this country
         const applicableSteps = steps.filter(s => s.countryFilter === 'ALL' || s.countryFilter === countryCode);
         
         if (applicableSteps.length === 0) return; // Skip if no steps for this country

         const t: Task = {
             id: `t_${Date.now()}_${countryCode}`,
             title: newTask.title || 'Untitled',
             description: newTask.description || '',
             featureModule: newTask.featureModule || 'General',
             status: Status.PENDING,
             priority: newTask.priority || Priority.MEDIUM,
             countryCode: countryCode,
             assigneeId: newTask.assigneeId || 'u1',
             dueDate: newTask.dueDate || new Date().toISOString().split('T')[0],
             scope: newTask.scope || 'Local',
             targetSystem: newTask.targetSystem || 'Ordering Portal',
             crNumber: newTask.crNumber,
             steps: applicableSteps.map((s, i) => ({
                 id: `s_${Date.now()}_${countryCode}_${i}`,
                 description: s.description || '',
                 expectedResult: s.expectedResult || '',
                 testData: s.testData || '',
                 isPassed: null,
                 comments: []
             })),
             updatedAt: 'Just now'
         };
         createdTasks.push(t);
     });
     
     onAddTask(createdTasks);
     setIsModalOpen(false);
     
     // Reset form
     setNewTask({ featureModule: 'Ordering', priority: Priority.MEDIUM, targetSystem: 'Ordering Portal' });
     setSelectedCountries(['SG']);
     setSteps([{ id: '1', description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }]);
  };

  const addStepRow = () => {
      setSteps([...steps, { id: `${steps.length + 1}`, description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }]);
  };

  const removeStepRow = (idx: number) => {
      const newSteps = [...steps];
      newSteps.splice(idx, 1);
      setSteps(newSteps);
  };

  const updateStep = (idx: number, field: keyof TestStep, value: string) => {
      const newSteps = [...steps];
      newSteps[idx] = { ...newSteps[idx], [field]: value };
      setSteps(newSteps);
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-slate-900">Task Management</h1>
           <p className="text-slate-500">Create, edit, and organize UAT scenarios.</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={onImport}
             className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-2"
           >
             <UploadCloud size={16}/> Import Excel
           </button>
           <button 
             onClick={() => setIsModalOpen(true)}
             className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 shadow-sm flex items-center gap-2"
           >
             <Plus size={16}/> New Task
           </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         {/* Toolbar */}
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="relative max-w-sm w-full">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input 
                 type="text" 
                 className="w-full pl-9 pr-4 py-2 text-sm border-slate-300 rounded-lg focus:ring-slate-500 focus:border-slate-500" 
                 placeholder="Search tasks..."
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg">
               <Filter size={18} />
            </button>
         </div>

         {/* Table */}
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                     <th className="px-6 py-4">Task Title</th>
                     <th className="px-6 py-4">Module</th>
                     <th className="px-6 py-4">Country</th>
                     <th className="px-6 py-4">Status</th>
                     <th className="px-6 py-4">Priority</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {filteredTasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                       <td className="px-6 py-4 font-medium text-slate-900">{task.title}</td>
                       <td className="px-6 py-4">
                          <Badge type="module" value={task.featureModule} />
                       </td>
                       <td className="px-6 py-4">{task.countryCode}</td>
                       <td className="px-6 py-4">
                          <Badge type="status" value={task.status} />
                       </td>
                       <td className="px-6 py-4">
                          <Badge type="priority" value={task.priority} />
                       </td>
                       <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                             <button 
                               onClick={() => onEdit(task)}
                               className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded"
                             >
                                <Edit2 size={16} />
                             </button>
                             <button className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded">
                                <Trash2 size={16} />
                             </button>
                          </div>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
         <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
            Showing {filteredTasks.length} tasks
         </div>
      </div>

      {/* Create Task Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl animate-in zoom-in-95 my-8">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                   <h2 className="text-lg font-bold text-slate-900">Create New Task</h2>
                   <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={20} />
                   </button>
                </div>
                
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                   
                   {/* Main Info */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                          <input 
                             type="text" 
                             className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                             placeholder="e.g. Verify Cart Calculation"
                             value={newTask.title}
                             onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Target System</label>
                          <select 
                             className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                             value={newTask.targetSystem}
                             onChange={(e) => setNewTask({...newTask, targetSystem: e.target.value as TargetSystem})}
                          >
                             <option value="Ordering Portal">Ordering Portal</option>
                             <option value="Admin Portal">Admin Portal</option>
                          </select>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
                         <select 
                            className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                            value={newTask.featureModule}
                            onChange={(e) => setNewTask({...newTask, featureModule: e.target.value})}
                         >
                            {availableModules.map(m => <option key={m}>{m}</option>)}
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                         <select 
                            className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                            value={newTask.priority}
                            onChange={(e) => setNewTask({...newTask, priority: e.target.value as Priority})}
                         >
                            <option value={Priority.LOW}>Low</option>
                            <option value={Priority.MEDIUM}>Medium</option>
                            <option value={Priority.HIGH}>High</option>
                            <option value={Priority.CRITICAL}>Critical</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">CR No (Optional)</label>
                         <input 
                            type="text" 
                            className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                            placeholder="e.g. CR-123"
                            value={newTask.crNumber}
                            onChange={(e) => setNewTask({...newTask, crNumber: e.target.value})}
                         />
                      </div>
                   </div>

                   {/* Country Selection (Multi) */}
                   <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <Globe size={16}/> Assign Countries (Multi-select)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availableCountries.map(c => {
                                const isSelected = selectedCountries.includes(c.code);
                                return (
                                    <button 
                                        key={c.code}
                                        onClick={() => toggleCountry(c.code)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${isSelected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                                    >
                                        {c.name} {isSelected && '✓'}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">A separate task instance will be created for each selected country.</p>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                          <textarea 
                             className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm h-20"
                             placeholder="Description of the test case..."
                             value={newTask.description}
                             onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                          <input 
                             type="date"
                             className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500 text-sm"
                             value={newTask.dueDate}
                             onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                          />
                       </div>
                   </div>

                   {/* Step Builder */}
                   <div className="border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center mb-2">
                         <h3 className="font-semibold text-slate-900 text-sm">Test Steps</h3>
                         <button type="button" onClick={addStepRow} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                            <Plus size={12}/> Add Step
                         </button>
                      </div>
                      
                      <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-12 gap-0 text-xs font-semibold text-slate-500 bg-slate-100 border-b border-slate-200 p-2">
                            <div className="col-span-1 text-center">#</div>
                            <div className="col-span-3">Description</div>
                            <div className="col-span-3">Expected Result</div>
                            <div className="col-span-2">Test Data</div>
                            <div className="col-span-2">Applicable To</div>
                            <div className="col-span-1"></div>
                        </div>
                        <div className="divide-y divide-slate-200">
                             {steps.map((step, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-start hover:bg-white transition-colors">
                                   <div className="col-span-1 flex items-center justify-center pt-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                                   </div>
                                   <div className="col-span-3">
                                      <textarea 
                                         placeholder="Step Action"
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         rows={2}
                                         value={step.description}
                                         onChange={(e) => updateStep(idx, 'description', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-3">
                                      <textarea 
                                         placeholder="Expected Result"
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         rows={2}
                                         value={step.expectedResult}
                                         onChange={(e) => updateStep(idx, 'expectedResult', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <input 
                                         placeholder="Input data..."
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         value={step.testData}
                                         onChange={(e) => updateStep(idx, 'testData', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <select 
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         value={step.countryFilter || 'ALL'}
                                         onChange={(e) => updateStep(idx, 'countryFilter', e.target.value)}
                                      >
                                          <option value="ALL">All Selected</option>
                                          {selectedCountries.map(sc => (
                                              <option key={sc} value={sc}>{sc} Only</option>
                                          ))}
                                      </select>
                                   </div>
                                   <div className="col-span-1 flex justify-center pt-2">
                                      <button onClick={() => removeStepRow(idx)} className="text-slate-400 hover:text-red-500">
                                         <Trash2 size={14}/>
                                      </button>
                                   </div>
                                </div>
                             ))}
                        </div>
                      </div>
                   </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-xl flex justify-end gap-3">
                   <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium">Cancel</button>
                   <button onClick={handleCreate} className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium flex items-center gap-2">
                      <Save size={16}/> Create {selectedCountries.length} Tasks
                   </button>
                </div>
             </div>
          </div>
      )}
    </div>
  );
};
