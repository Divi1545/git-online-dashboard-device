'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, truncateId } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'

interface Conversation {
  id: string
  session_id: string
  language: string
  duration_s: number
  message_count: number
  created_at: string
}

interface ConversationTableProps {
  conversations: Conversation[]
  total: number
  page: number
  onPageChange: (page: number) => void
  onLanguageFilter: (language: string) => void
  selectedLanguage: string
}

const LANGUAGES = ['all', 'en', 'si', 'ta', 'ar', 'fr', 'de', 'zh']

const langLabels: Record<string, string> = {
  en: 'English',
  si: 'Sinhala',
  ta: 'Tamil',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
}

export function ConversationTable({
  conversations,
  total,
  page,
  onPageChange,
  onLanguageFilter,
  selectedLanguage,
}: ConversationTableProps) {
  const totalPages = Math.ceil(total / 20)

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">{total} conversations total</p>
        <Select value={selectedLanguage} onValueChange={(v) => onLanguageFilter(v ?? 'all')}>
          <SelectTrigger className="w-40 bg-[#111111] border-white/10 text-white text-sm">
            <SelectValue placeholder="All Languages" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1A] border-white/10">
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang} className="text-white hover:bg-white/5">
                {lang === 'all' ? 'All Languages' : langLabels[lang] || lang.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/50 text-xs">Session ID</TableHead>
              <TableHead className="text-white/50 text-xs">Language</TableHead>
              <TableHead className="text-white/50 text-xs">Duration</TableHead>
              <TableHead className="text-white/50 text-xs">Messages</TableHead>
              <TableHead className="text-white/50 text-xs">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-white/40 py-8">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No conversations found
                </TableCell>
              </TableRow>
            ) : (
              conversations.map((conv) => (
                <TableRow key={conv.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-mono text-xs text-white/60">
                    {truncateId(conv.session_id)}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-teal-600/20 text-teal-400 border-teal-600/30 text-xs">
                      {langLabels[conv.language] || conv.language.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white/70 text-sm">
                    {formatDuration(conv.duration_s)}
                  </TableCell>
                  <TableCell className="text-white/70 text-sm">{conv.message_count}</TableCell>
                  <TableCell className="text-white/50 text-xs">
                    {formatDateTime(conv.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="border-white/10 text-white/50 hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="border-white/10 text-white/50 hover:bg-white/5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
