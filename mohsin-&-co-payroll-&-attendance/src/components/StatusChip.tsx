import React from 'react';

export type StatusVariant = 'present' | 'late' | 'absent' | 'online' | 'offline' | 'navy' | 'teal' | 'neutral' | 'weekly_off' | 'leave';

interface StatusChipProps {
  status?: StatusVariant;
  label: string;
  time?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status = 'neutral',
  label,
  time,
  className = '',
  size = 'sm'
}) => {
  const getVariantStyles = () => {
    switch (status) {
      case 'present':
      case 'online':
        return {
          container: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
          dot: 'bg-emerald-500'
        };
      case 'late':
        return {
          container: 'bg-amber-50 text-amber-700 border-amber-200 font-semibold',
          dot: 'bg-amber-500'
        };
      case 'absent':
      case 'offline':
        return {
          container: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold',
          dot: 'bg-rose-500'
        };
      case 'weekly_off':
        return {
          container: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-medium',
          dot: 'bg-indigo-400'
        };
      case 'leave':
        return {
          container: 'bg-sky-50 text-sky-700 border-sky-200 font-semibold',
          dot: 'bg-sky-500'
        };
      case 'navy':
      case 'teal':
        return {
          container: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold',
          dot: 'bg-blue-600'
        };
      case 'neutral':
      default:
        return {
          container: 'bg-slate-100 text-slate-700 border-slate-200 font-medium',
          dot: 'bg-slate-400'
        };
    }
  };

  const variant = getVariantStyles();
  const padding = size === 'sm' 
    ? 'px-2 py-0.5 text-[11px]' 
    : size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-3.5 py-1.5 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-tight whitespace-nowrap transition-all tabular-nums capitalize ${padding} ${variant.container} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${variant.dot}`} />
      <span>{label}</span>
      {time && <span className="opacity-75 font-mono text-[10px] ml-0.5">({time})</span>}
    </span>
  );
};

