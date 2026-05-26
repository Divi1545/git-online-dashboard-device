'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createBrowserClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, Circle, MessageSquare } from 'lucide-react'

interface Inquiry {
  id: string
  name: string
  business: string
  business_type: string | null
  city: string | null
  product_interest: string | null
  message: string | null
  contacted: boolean
  created_at: string
}

export function InquiriesClient({ inquiries: initial }: { inquiries: Inquiry[] }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(initial)
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterCity, setFilterCity] = useState('all')
  const supabase = createBrowserClient()

  const products = ['all', ...Array.from(new Set(initial.map((i) => i.product_interest).filter(Boolean) as string[]))]
  const cities = ['all', ...Array.from(new Set(initial.map((i) => i.city).filter(Boolean) as string[]))]

  const filtered = inquiries.filter((i) => {
    if (filterProduct !== 'all' && i.product_interest !== filterProduct) return false
    if (filterCity !== 'all' && i.city !== filterCity) return false
    return true
  })

  async function toggleContacted(id: string, current: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('hardware_inquiries')
      .update({ contacted: !current })
      .eq('id', id)
      .select()
      .single()
    if (data) {
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, contacted: !current } : i)))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Hardware Inquiries</h1>
        <p className="text-white/50 text-sm mt-1">{inquiries.length} inquiries total</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterProduct} onValueChange={(v) => setFilterProduct(v ?? 'all')}>
          <SelectTrigger className="w-48 bg-[#1A1A1A] border-white/10 text-white text-sm">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1A] border-white/10">
            {products.map((p) => (
              <SelectItem key={p} value={p} className="text-white hover:bg-white/5">
                {p === 'all' ? 'All Products' : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCity} onValueChange={(v) => setFilterCity(v ?? 'all')}>
          <SelectTrigger className="w-40 bg-[#1A1A1A] border-white/10 text-white text-sm">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1A] border-white/10">
            {cities.map((c) => (
              <SelectItem key={c} value={c} className="text-white hover:bg-white/5">
                {c === 'all' ? 'All Cities' : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/50 text-xs">Name / Business</TableHead>
              <TableHead className="text-white/50 text-xs">Type</TableHead>
              <TableHead className="text-white/50 text-xs">City</TableHead>
              <TableHead className="text-white/50 text-xs">Product</TableHead>
              <TableHead className="text-white/50 text-xs">Message</TableHead>
              <TableHead className="text-white/50 text-xs">Date</TableHead>
              <TableHead className="text-white/50 text-xs">Contacted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-white/40 py-8">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No inquiries found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inquiry) => (
                <TableRow key={inquiry.id} className="border-white/5 hover:bg-white/5">
                  <TableCell>
                    <p className="text-white text-sm font-medium">{inquiry.name}</p>
                    <p className="text-white/50 text-xs">{inquiry.business}</p>
                  </TableCell>
                  <TableCell className="text-white/60 text-sm">
                    {inquiry.business_type || '—'}
                  </TableCell>
                  <TableCell className="text-white/60 text-sm">{inquiry.city || '—'}</TableCell>
                  <TableCell>
                    {inquiry.product_interest ? (
                      <Badge className="bg-teal-600/20 text-teal-400 border-teal-600/30 text-xs">
                        {inquiry.product_interest}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-white/60 text-xs max-w-xs">
                    <p className="truncate">{inquiry.message || '—'}</p>
                  </TableCell>
                  <TableCell className="text-white/50 text-xs">
                    {formatDateTime(inquiry.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleContacted(inquiry.id, inquiry.contacted)}
                      className={inquiry.contacted ? 'text-teal-400' : 'text-white/30'}
                    >
                      {inquiry.contacted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
