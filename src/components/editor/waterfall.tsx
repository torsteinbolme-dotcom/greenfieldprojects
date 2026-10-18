import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WaterfallStep } from '@/lib/bridges';

/** Floating-bar waterfall chart (segments, CAPEX, …) in the style of the EBITDA bridge. */
export function WaterfallChart({ steps, format, height = 'h-72' }: { steps: WaterfallStep[]; format: (v: number) => string; height?: string }) {
  const data = steps.map(s => ({ ...s, range: [s.from, s.to] }));
  return (
    <div className={`${height} min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
          <YAxis width={80} tick={{ fontSize: 11 }} tickFormatter={v => format(Number(v))} />
          <Tooltip formatter={(v, name, item) => [format((item.payload as WaterfallStep).value), String(name)]} />
          <Bar dataKey="range" isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
