import React, { useState, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  MapPinIcon,
  TrashIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';

export default function AttributeTable({
  layers,
  selectedFeature,
  onSelectFeature,
  onDeleteFeature,
  onClose
}) {
  const { isEditor } = useAuth();
  const [selectedLayerName, setSelectedLayerName] = useState(() => layers[0]?.name || '');
  const [filterText, setFilterText] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');

  const currentLayer = layers.find((l) => l.name === selectedLayerName) || layers[0];
  const features = currentLayer?.data?.features || [];

  const columns = useMemo(() => {
    if (!features.length) return [];
    const keys = new Set();
    features.forEach((f) => {
      if (f.properties) {
        Object.keys(f.properties).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [features]);

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (!filterText) return true;
      const text = JSON.stringify(f.properties || {}).toLowerCase();
      return text.includes(filterText.toLowerCase());
    }).sort((a, b) => {
      if (!sortColumn) return 0;
      const valA = a.properties?.[sortColumn];
      const valB = b.properties?.[sortColumn];
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [features, filterText, sortColumn, sortDirection]);

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const exportTableCSV = () => {
    if (!filteredFeatures.length || !columns.length) return;
    const headerRow = columns.join(',');
    const dataRows = filteredFeatures.map((f) =>
      columns.map((c) => JSON.stringify(f.properties?.[c] ?? '')).join(',')
    );
    const csvString = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentLayer.name}-attributes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 h-72 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
      {/* Table Header Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <select
            value={selectedLayerName}
            onChange={(e) => setSelectedLayerName(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500"
          >
            {layers.map((l, idx) => (
              <option key={l.id || `${l.name}-${idx}`} value={l.name}>
                {l.title || l.name} ({l.data?.features?.length || 0})
              </option>
            ))}
          </select>

          <div className="relative">
            <input
              type="text"
              placeholder="Filter attributes..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-56 bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          <span className="text-xs text-slate-400">
            Showing {filteredFeatures.length} of {features.length} records
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportTableCSV}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-lg transition-colors"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-800 text-slate-300 z-10">
            <tr>
              <th className="p-2.5 border-b border-slate-700 w-16 text-center font-medium">Action</th>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="p-2.5 border-b border-slate-700 font-semibold cursor-pointer hover:text-white select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span className="capitalize">{col.replace(/_/g, ' ')}</span>
                    {sortColumn === col && (
                      <span className="text-blue-400 text-[10px]">
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {filteredFeatures.map((feature, idx) => {
              const isSelected = selectedFeature?.id === feature.id;
              return (
                <tr
                  key={feature.id || idx}
                  className={`hover:bg-slate-800/60 transition-colors ${
                    isSelected ? 'bg-blue-900/30' : ''
                  }`}
                >
                  <td className="p-2 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onSelectFeature(feature)}
                        className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                        title="Zoom to feature"
                      >
                        <MapPinIcon className="w-3.5 h-3.5" />
                      </button>
                      {isEditor && (
                        <button
                          onClick={() => onDeleteFeature(currentLayer.name, feature.id)}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Delete feature"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="p-2 whitespace-nowrap text-slate-300">
                      {String(feature.properties?.[col] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!filteredFeatures.length && (
              <tr>
                <td colSpan={columns.length + 1} className="text-center p-8 text-slate-500">
                  No features found matching query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
