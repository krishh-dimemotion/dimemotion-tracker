import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

export function MonthlyRevenueChart({
  data,
  weighted,
}: {
  data: { month: string; label: string; value: number; weighted: number }[];
  weighted: boolean;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => money(v).replace(/\.00$/, "")} />
          <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12 }} />
          <Bar dataKey={weighted ? "weighted" : "value"} fill="var(--color-info, #3b82f6)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
