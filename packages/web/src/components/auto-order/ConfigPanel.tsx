
import React, { useState, useEffect } from 'react';
import { AutomationConfig } from './types';
import { Shield, Key, Link2, Server, CheckCircle } from 'lucide-react';

interface ConfigPanelProps {
  config: AutomationConfig;
  setConfig: (config: AutomationConfig) => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, setConfig }) => {
  const [localConfig, setLocalConfig] = useState<AutomationConfig>(config);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (
    section: 'feishu' | 'oa',
    field: string,
    value: string
  ) => {
    setLocalConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    setConfig(localConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Feishu Section */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
            <Shield size={20} />
          </div>
          <h3 className="text-lg font-semibold">Feishu Bitable API Configuration</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">App ID</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                value={localConfig.feishu.appId}
                onChange={(e) => handleChange('feishu', 'appId', e.target.value)}
                placeholder="cli_a1b2c3d4..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">App Secret</label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="password" 
                value={localConfig.feishu.appSecret}
                onChange={(e) => handleChange('feishu', 'appSecret', e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Base App Token</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                value={localConfig.feishu.appToken}
                onChange={(e) => handleChange('feishu', 'appToken', e.target.value)}
                placeholder="basc...12345"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Table ID</label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                value={localConfig.feishu.tableId}
                onChange={(e) => handleChange('feishu', 'tableId', e.target.value)}
                placeholder="tbl_...abcd"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      {/* OA System Section */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
            <Server size={20} />
          </div>
          <h3 className="text-lg font-semibold">Target OA System Settings</h3>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">OA Login URL</label>
            <input 
              type="text" 
              value={localConfig.oa.url}
              onChange={(e) => handleChange('oa', 'url', e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Username</label>
              <input 
                type="text" 
                value={localConfig.oa.username}
                onChange={(e) => handleChange('oa', 'username', e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Password</label>
              <input 
                type="password" 
                value={localConfig.oa.password}
                onChange={(e) => handleChange('oa', 'password', e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-4">
        <button 
          onClick={() => setLocalConfig(config)}
          className="px-6 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          Reset to Saved
        </button>
        <button 
          onClick={handleSave}
          className={`px-8 py-2.5 rounded-xl font-semibold transition-all shadow-lg active:scale-95 flex items-center gap-2 ${
            saved
              ? 'bg-green-600 shadow-green-500/20 text-white'
              : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 text-white'
          }`}
        >
          {saved ? <><CheckCircle size={16} /> Saved!</> : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default ConfigPanel;
