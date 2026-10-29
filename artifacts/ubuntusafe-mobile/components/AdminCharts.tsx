import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import type { AdminAnalytics } from "@workspace/api-client-react";
import { useApp } from "@/context/AppContext";

export const TOOL_CODES = ["message", "voice", "email", "link", "job", "screen"] as const;
export const TOOL_LABELS: Record<string, string> = {
  message: "Message", voice: "Voice", email: "Email", link: "Link", job: "Job", screen: "Screenshot",
};
export const toolLabel = (t: string) => TOOL_LABELS[t] ?? t;

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return v;
}

type Col = { label: string; value: number };
export function ColumnChart({ title, data, testID }: { title: string; data: Col[]; testID?: string }) {
  const { colors } = useApp();
  const [w, setW] = useState(320);
  const h = 190, left = 32, bottom = 26, top = 18;
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const plotW = Math.max(0, w - left - 6), plotH = h - top - bottom;
  const slot = data.length ? plotW / data.length : plotW;
  const bw = Math.min(36, slot * 0.6);
  const ticks = [0, max / 2, max];
  const summary = data.map(d => `${d.label} ${d.value}`).join(", ");
  return (
    <View testID={testID} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[s.title, { color: colors.foreground }]}>{title}</Text>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${title}: ${summary}`}>
        <Svg width={w} height={h}>
          {ticks.map(t => {
            const y = top + plotH - (t / max) * plotH;
            return [
              <Line key={`l${t}`} x1={left} x2={w} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />,
              <SvgText key={`t${t}`} x={left - 6} y={y + 4} fontSize={10} fill={colors.mutedForeground} textAnchor="end">{String(Math.round(t * 10) / 10)}</SvgText>,
            ];
          })}
          {data.map((d, i) => {
            const bh = (d.value / max) * plotH;
            const cx = left + slot * i + slot / 2;
            return [
              <Rect key={`r${i}`} x={cx - bw / 2} y={top + plotH - bh} width={bw} height={bh} rx={3} fill={colors.primary} />,
              <SvgText key={`v${i}`} x={cx} y={top + plotH - bh - 4} fontSize={10} fontWeight="700" fill={colors.foreground} textAnchor="middle">{String(d.value)}</SvgText>,
              <SvgText key={`x${i}`} x={cx} y={h - 8} fontSize={slot < 52 ? 9 : 10} fill={colors.mutedForeground} textAnchor="middle">{slot < 52 && d.label.length > 6 ? d.label.slice(0, 5) + "." : d.label}</SvgText>,
            ];
          })}
        </Svg>
      </View>
      <Text style={[s.small, { color: colors.mutedForeground }]}>{summary}</Text>
    </View>
  );
}

/** Bipartite diagram: top users (left) linked to tools (right); line weight = uses. */
export function UsageDiagram({ rows }: { rows: AdminAnalytics["userTools"] }) {
  const { colors } = useApp();
  const [w, setW] = useState(320);
  const totals = new Map<string, { name: string; total: number }>();
  rows.forEach(r => {
    const cur = totals.get(r.userId) ?? { name: `${r.fullName} ${r.surname}`.trim() || r.email, total: 0 };
    cur.total += r.count; totals.set(r.userId, cur);
  });
  const users = [...totals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  const rowH = 30, h = Math.max(users.length, TOOL_CODES.length) * rowH + 10;
  const maxC = Math.max(1, ...rows.map(r => r.count));
  const lx = Math.min(130, w * 0.4), rx = w - 82;
  const uy = (i: number) => 20 + i * rowH;
  const ty = (i: number) => 20 + i * rowH;
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[s.title, { color: colors.foreground }]}>Who used which tool</Text>
      {users.length === 0 ? <Text style={{ color: colors.mutedForeground }}>No tool use recorded this week.</Text> :
        <View onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel="User to tool usage diagram. Full counts listed below.">
          <Svg width={w} height={h}>
            {rows.filter(r => users.some(u => u[0] === r.userId)).map((r, k) => {
              const ui = users.findIndex(u => u[0] === r.userId);
              const ti = TOOL_CODES.indexOf(r.tool as typeof TOOL_CODES[number]);
              if (ti < 0) return null;
              return <Line key={k} x1={lx} y1={uy(ui)} x2={rx} y2={ty(ti)} stroke={colors.primary} strokeOpacity={0.55} strokeWidth={1 + (r.count / maxC) * 6} />;
            })}
            {users.map(([id, u], i) => [
              <Circle key={`c${id}`} cx={lx} cy={uy(i)} r={5} fill={colors.primary} />,
              <SvgText key={`n${id}`} x={lx - 9} y={uy(i) + 4} fontSize={10} fill={colors.foreground} textAnchor="end">{u.name.length > 16 ? u.name.slice(0, 15) + "." : u.name}</SvgText>,
            ])}
            {TOOL_CODES.map((t, i) => [
              <Circle key={`tc${t}`} cx={rx} cy={ty(i)} r={5} fill={colors.secondaryForeground} />,
              <SvgText key={`tl${t}`} x={rx + 9} y={ty(i) + 4} fontSize={10} fill={colors.foreground}>{toolLabel(t)}</SvgText>,
            ])}
          </Svg>
        </View>}
      {totals.size > 6 ? <Text style={[s.small, { color: colors.mutedForeground }]}>Top 6 of {totals.size} users shown.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  title: { fontSize: 16, fontWeight: "800" },
  small: { fontSize: 12, lineHeight: 17 },
});
