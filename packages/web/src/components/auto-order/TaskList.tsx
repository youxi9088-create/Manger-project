import React, { useState, useMemo, useEffect } from 'react';
import { Task } from './types';
import { User, Clock, Briefcase, PlayCircle, Fingerprint, Loader2, Filter, Database, RefreshCw } from 'lucide-react';
import './auto-order.css';

interface TaskListProps {
  tasks: Task[];
  onExecute: (taskId: string) => void;
  selectedTasks: string[];
  onSelectTask: (taskId: string) => void;
  onSelectAll: () => void;
  onBatchExecute: () => void;
  isBatchProcessing: boolean;
  feishuTables: { id: string; name: string }[];
  currentTableId: string;
  onTableChange: (tableId: string) => void;
  onRefresh: () => void;
  filterStatus: 'all' | 'completed' | 'pending';
  onFilterStatusChange: (status: 'all' | 'completed' | 'pending') => void;
  filterProject: string;
  onFilterProjectChange: (project: string) => void;
  filterPerson: string;
  onFilterPersonChange: (person: string) => void;
}

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onExecute,
  selectedTasks,
  onSelectTask,
  onSelectAll,
  onBatchExecute,
  isBatchProcessing,
  feishuTables,
  currentTableId,
  onTableChange,
  onRefresh,
  filterStatus,
  onFilterStatusChange,
  filterProject,
  onFilterProjectChange,
  filterPerson,
  onFilterPersonChange
}) => {
  const [columnWidths, setColumnWidths] = useState<number[]>([50, 200, 160, 130, 100, 70, 100, 100, 100, 100]);
  const [showFilters, setShowFilters] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isResizing]);

  const projects = useMemo(() => {
    const set = new Set(tasks.map(t => t.fields['所属项目']).filter(Boolean));
    return Array.from(set).sort();
  }, [tasks]);

  const persons = useMemo(() => {
    const set = new Set(tasks.map(t => t.fields['负责人']).filter(Boolean));
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterStatus === 'completed' && task.fields['下单字段'] !== '是') return false;
      if (filterStatus === 'pending' && task.fields['下单字段'] === '是') return false;
      if (filterProject && !task.fields['所属项目'].includes(filterProject)) return false;
      if (filterPerson && !task.fields['负责人'].includes(filterPerson)) return false;
      return true;
    });
  }, [tasks, filterStatus, filterProject, filterPerson]);

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    const startX = e.pageX;
    const startWidth = columnWidths[index];

    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.pageX - startX);
      if (currentWidth > 40) {
        setColumnWidths((prev) => {
          const next = [...prev];
          next[index] = currentWidth;
          return next;
        });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const headers = ["选择", "需求名称", "UUID", "所属项目", "负责人", "工时", "完成时间", "下单链接", "状态", "操作"];
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  const pendingTasks = filteredTasks.filter(t => t.fields['下单字段'] !== '是');
  const allSelected = pendingTasks.length > 0 && pendingTasks.every(t => selectedTasks.includes(t.id));
  const hasSelection = selectedTasks.length > 0;

  const hasActiveFilters = filterStatus !== 'all' || filterProject || filterPerson;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database size={16} className="text-blue-400" />
            <select
              value={currentTableId}
              onChange={(e) => onTableChange(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">选择数据源表...</option>
              {feishuTables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={onRefresh}
              disabled={!currentTableId}
              className={`p-2 rounded-lg transition-all ${!currentTableId ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 text-blue-400'}`}
              title="刷新当前表数据"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${hasActiveFilters ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <Filter size={14} />
              过滤
              {hasActiveFilters && <span className="bg-white text-blue-600 rounded-full w-4 h-4 text-xs flex items-center justify-center">{[filterStatus !== 'all' ? 1 : 0, filterProject ? 1 : 0, filterPerson ? 1 : 0].reduce((a, b) => a + b, 0)}</span>}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">状态:</span>
              <select
                value={filterStatus}
                onChange={(e) => onFilterStatusChange(e.target.value as 'all' | 'completed' | 'pending')}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
              >
                <option value="all">全部</option>
                <option value="completed">已完成</option>
                <option value="pending">待执行</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">项目:</span>
              <select
                value={filterProject}
                onChange={(e) => onFilterProjectChange(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white min-w-[120px]"
              >
                <option value="">全部</option>
                {projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">负责人:</span>
              <select
                value={filterPerson}
                onChange={(e) => onFilterPersonChange(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white min-w-[100px]"
              >
                <option value="">全部</option>
                {persons.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {(filterStatus !== 'all' || filterProject || filterPerson) && (
              <button
                onClick={() => {
                  onFilterStatusChange('all');
                  onFilterProjectChange('');
                  onFilterPersonChange('');
                }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                清除过滤
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                disabled={pendingTasks.length === 0}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-600 disabled:opacity-50"
              />
              <span className="text-sm text-slate-300">全选待执行</span>
            </label>
            <span className="text-xs text-slate-500">
              已选择 {selectedTasks.length} 项 / 当前 {filteredTasks.length} 条
            </span>
          </div>
          <button
            onClick={onBatchExecute}
            disabled={!hasSelection || isBatchProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all
              ${!hasSelection || isBatchProcessing
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
              }`}
          >
            {isBatchProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                批量执行中...
              </>
            ) : (
              <>
                <PlayCircle size={16} />
                批量执行 ({selectedTasks.length})
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table
            className="resizable-table"
            style={{ '--table-total-width': `${totalWidth}px` } as React.CSSProperties}
          >
            <thead>
              <tr className="bg-slate-800/30 text-slate-400 text-xs uppercase tracking-wider">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="px-4 py-4 font-medium resizable-header-cell border-r border-slate-800/20 last:border-r-0"
                    style={{ '--col-width': `${columnWidths[idx]}px` } as React.CSSProperties}
                  >
                    <span className="cell-truncate block">{header}</span>
                    <div
                      onMouseDown={(e) => handleMouseDown(idx, e)}
                      className="resize-handle"
                      title={`调整 ${header} 宽度`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredTasks.map((task) => {
                const isCompleted = task.fields['下单字段'] === '是';
                const isSelected = selectedTasks.includes(task.id);
                const uuid = task.fields['uuid'] || 'N/A';

                return (
                  <tr key={task.id} className="hover:bg-slate-800/50 transition-colors group">
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectTask(task.id)}
                        disabled={isCompleted}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-4 cell-truncate">
                      <div className="text-sm font-semibold text-white cell-truncate">{task.fields['需求名称']}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono opacity-50">Task ID: {task.id.slice(-6)}</div>
                    </td>
                    <td className="px-4 py-4 cell-truncate">
                      <div className="flex items-center gap-2">
                        <Fingerprint size={12} className="text-blue-500 shrink-0" />
                        <span
                          className="text-[11px] font-mono text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 truncate cursor-help"
                          title={uuid}
                        >
                          {uuid}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 cell-truncate">
                      <div className="flex items-center gap-2 text-slate-300 cell-truncate">
                        <Briefcase size={14} className="text-slate-500 shrink-0" />
                        <span className="text-sm cell-truncate">{task.fields['所属项目']}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 cell-truncate">
                      <div className="flex items-center gap-2 text-slate-300 cell-truncate">
                        <User size={14} className="text-slate-500 shrink-0" />
                        <span className="text-sm cell-truncate">{task.fields['负责人']}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-mono text-slate-300">{task.fields['工时']}h</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-mono text-slate-300">{task.fields['完成时间']}</span>
                    </td>
                    <td className="px-4 py-4 cell-truncate">
                      {task.fields['下单链接'] ? (
                        <a
                          href={task.fields['下单链接']}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 truncate block hover:text-blue-300 hover:bg-blue-500/10"
                          title={task.fields['下单链接']}
                        >
                          链接
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isCompleted ? (
                        <span className="text-emerald-500 text-xs font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Completed</span>
                      ) : (
                        <span className="text-blue-500 text-xs font-medium bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => onExecute(task.id)}
                        disabled={isCompleted}
                        className={`flex items-center justify-center gap-2 w-full py-1.5 rounded-lg text-xs font-bold transition-all
                          ${isCompleted
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95'
                          }`}
                        title={isCompleted ? "该任务已执行下单" : "点击启动自动化下单"}
                      >
                        <PlayCircle size={14} />
                        执行
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredTasks.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            {tasks.length === 0 ? '请先选择数据源表并同步数据' : '没有符合过滤条件的任务'}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskList;
