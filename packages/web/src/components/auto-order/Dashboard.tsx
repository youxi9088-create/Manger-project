
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Task, LogEntry, AutomationStatus } from './types';
import { CheckCircle2, Clock, AlertTriangle, PlayCircle } from 'lucide-react';

interface DashboardProps {
  tasks: Task[];
  logs: LogEntry[];
  status: AutomationStatus;
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, logs, status }) => {
  const completedCount = tasks.filter(t => t.fields['下单字段'] === '是').length;
  const pendingCount = tasks.filter(t => t.fields['下单字段'] === '否').length;

  const data = [
    { name: '已完成', value: completedCount, color: '#10b981' },
    { name: '待办', value: pendingCount, color: '#3b82f6' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
              <Clock size={24} />
            </div>
            <span className="text-sm font-medium text-emerald-500">+12%</span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{pendingCount}</div>
          <div className="text-slate-400 text-sm">待办</div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <CheckCircle2 size={24} />
            </div>
            <span className="text-sm font-medium text-emerald-500">+5%</span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{completedCount}</div>
          <div className="text-slate-400 text-sm">今日已完成</div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
              <AlertTriangle size={24} />
            </div>
            <span className="text-sm font-medium text-amber-500">0.2%</span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">0</div>
          <div className="text-slate-400 text-sm">失败的作业</div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500">
              <PlayCircle size={24} />
            </div>
            <span className="text-sm font-medium text-slate-500">Live</span>
          </div>
          <div className="text-lg font-bold text-white mb-1 break-all truncate">
            {status === AutomationStatus.IDLE ? 'System Idle' : status.replace('_', ' ')}
          </div>
          <div className="text-slate-400 text-sm">Current Process</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h3 className="text-lg font-semibold mb-6">Execution Analytics</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} />
                <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(51, 65, 85, 0.4)' }}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Logs */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Activity Monitor</h3>
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[300px] pr-2">
            {logs.slice(0, 5).map((log, i) => (
              <div key={i} className="flex gap-3">
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  log.type === 'success' ? 'bg-emerald-500' : 
                  log.type === 'error' ? 'bg-rose-500' : 
                  log.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">{log.timestamp}</div>
                  <div className="text-sm text-slate-300 leading-snug">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
