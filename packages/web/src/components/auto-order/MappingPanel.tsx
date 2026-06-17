import React from 'react';
import { Save, Database, ArrowRight, Settings2, Info } from 'lucide-react';

interface MappingPanelProps {
  feishuTables: { id: string; name: string }[];
  availableFields: string[]; // 实时获取的列名
  currentTableId: string;
  mapping: Record<string, string>;
  onTableChange: (id: string) => void;
  onMappingChange: (mapping: Record<string, string>) => void;
  onSave: () => void;
}

const MappingPanel: React.FC<MappingPanelProps> = ({
  feishuTables,
  availableFields,
  currentTableId,
  mapping,
  onTableChange,
  onMappingChange,
  onSave
}) => {
  const targetFields = [
    { key: '需求名称', label: 'OA 需求名称' },
    { key: '所属项目', label: 'OA 所属项目' },
    { key: '工时', label: 'OA 预估工时' },
    { key: '负责人', label: 'OA 负责人' },
    { key: '下单字段', label: '下单状态校验' },
    { key: 'uuid', label: 'UUID 识别码' },
    { key: '完成时间', label: '完成时间' },
    { key: '更新时间', label: '更新时间' },
    { key: '任务详情', label: 'OA 任务详情' }
  ];

  const handleSelectChange = (key: string, value: string) => {
    onMappingChange({ ...mapping, [key]: value });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">字段映射配置</h2>
        <button onClick={onSave} className="bg-blue-600 px-6 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20">
          <Save size={18} /> 保存配置
        </button>
      </div>

      {/* 选择子表 */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3 mb-4 text-blue-400">
          <Database size={20} />
          <h3 className="text-lg font-semibold text-white">选择飞书数据源表</h3>
        </div>
        <select 
          value={currentTableId}
          onChange={(e) => onTableChange(e.target.value)}
          className="w-full md:w-1/2 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
        >
          <option value="">-- 请选择子表 --</option>
          {feishuTables.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* 映射关系表格 */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">OA 系统目标字段</th>
              <th className="px-6 py-4 text-center">方向</th>
              <th className="px-6 py-4">飞书原始列名 (实时读取)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {targetFields.map((field) => (
              <tr key={field.key} className="hover:bg-slate-800/20">
                <td className="px-6 py-4 font-semibold text-white text-sm">{field.label}</td>
                <td className="px-6 py-4 text-center text-slate-600"><ArrowRight size={14} className="mx-auto" /></td>
                <td className="px-6 py-4">
                  <select 
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleSelectChange(field.key, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200"
                  >
                    <option value="">选择飞书列...</option>
                    {availableFields.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20 flex gap-3 text-xs text-blue-300">
        <Info size={16} className="shrink-0" />
        <p>提示：如果你在下拉列表中没有看到飞书列名，请确保已经在“系统配置”中填写了正确的 App Token 并点击了首页的“立即运行”。</p>
      </div>
    </div>
  );
};

export default MappingPanel;