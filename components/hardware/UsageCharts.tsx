'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DailyConversation {
  date: string
  count: number
}

interface LanguageBreakdown {
  language: string
  count: number
}

interface UsageChartsProps {
  dailyData: DailyConversation[]
  languageData: LanguageBreakdown[]
  avgDuration: number
  totalConversations: number
}

const LANG_COLORS = ['#0D9488', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#10B981']

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  si: 'Sinhala',
  ta: 'Tamil',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
}

export function UsageCharts({
  dailyData,
  languageData,
  avgDuration,
  totalConversations,
}: UsageChartsProps) {
  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  const formattedLanguageData = languageData.map((d) => ({
    ...d,
    name: LANG_LABELS[d.language] || d.language.toUpperCase(),
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
        <Card className="bg-[#1A1A1A] border-white/10">
          <CardContent className="pt-6">
            <p className="text-xs text-white/40 mb-1">Total Conversations</p>
            <p className="text-3xl font-bold text-white">{totalConversations}</p>
            <p className="text-xs text-white/40 mt-1">All time</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1A1A1A] border-white/10">
          <CardContent className="pt-6">
            <p className="text-xs text-white/40 mb-1">Avg Duration</p>
            <p className="text-3xl font-bold text-teal-400">{formatDuration(avgDuration)}</p>
            <p className="text-xs text-white/40 mt-1">Per session</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card className="bg-[#1A1A1A] border-white/10 lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70 font-medium">
            Conversations / Day (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-white/30 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" fill="#0D9488" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Donut Chart */}
      <Card className="bg-[#1A1A1A] border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70 font-medium">Language Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {formattedLanguageData.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-white/30 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={formattedLanguageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  dataKey="count"
                  nameKey="name"
                >
                  {formattedLanguageData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={LANG_COLORS[index % LANG_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
