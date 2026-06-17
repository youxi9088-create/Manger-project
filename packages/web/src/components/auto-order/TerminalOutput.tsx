
import React, { useRef, useEffect } from 'react';
import { LogEntry } from './types';

interface TerminalOutputProps {
  logs: LogEntry[];
}

const TerminalOutput: React.FC<TerminalOutputProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div className="bg-[#0c0c0c] rounded-xl border border-slate-800 shadow-2xl flex flex-col h-[calc(100vh-12rem)] overflow-hidden">
      {/* Terminal Header */}
      <div className="bg-[#1e1e1e] px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
        </div>
        <div className="text-[10px] uppercase font-bold text-slate-600 tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          Worker Session: bcs-automation-runtime
        </div>
      </div>
      
      {/* Terminal Body */}
      <div 
        ref={scrollRef}
        className="flex-1 p-6 font-mono text-sm space-y-2 overflow-y-auto overflow-x-hidden selection:bg-blue-500/30"
      >
        <div className="text-slate-500 italic mb-4">Starting secure Shell execution environment...</div>
        
        {logs.length === 0 ? (
          <div className="text-slate-600">No output yet. System idling.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
              <span className="text-slate-700 shrink-0 font-medium">[{log.timestamp}]</span>
              <span className={`shrink-0 font-bold uppercase text-[10px] mt-1 ${
                log.type === 'info' ? 'text-blue-500' :
                log.type === 'success' ? 'text-emerald-500' :
                log.type === 'warning' ? 'text-amber-500' : 'text-rose-500'
              }`}>
                {log.type}
              </span>
              <span className={`${
                log.type === 'error' ? 'text-rose-400 font-bold' : 
                log.type === 'success' ? 'text-emerald-300' : 'text-slate-300'
              } break-words`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        
        <div className="pt-4 flex items-center gap-2 text-slate-600">
          <span className="animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
};

export default TerminalOutput;
