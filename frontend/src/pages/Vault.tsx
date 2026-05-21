import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Copy,
  Check,
  Key,
  MapPin,
  Link2,
  Plus,
  Lock,
  ExternalLink,
  Wifi,
  Home,
  Camera,
  FileText,
  MoreVertical,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  ACTIVE_GROUP_STORAGE_KEY,
  VAULT_CATEGORIES,
  apiJson,
  type GroupDto,
  type VaultItemDto,
} from '@/lib/api'

type CardType = 'code' | 'location' | 'link'

const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'code', label: 'Access code' },
  { value: 'location', label: 'Location' },
  { value: 'link', label: 'Link' },
]

const categories = ['All', ...VAULT_CATEGORIES] as const

function normalizeType(t: string): CardType {
  const x = t.toLowerCase()
  if (x === 'code' || x === 'location' || x === 'link') return x
  return 'link'
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export default function VaultPage() {
  const [groupsList, setGroupsList] = useState<GroupDto[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [items, setItems] = useState<VaultItemDto[]>([])
  const [loadingVault, setLoadingVault] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formType, setFormType] = useState<CardType>('code')
  const [formCategory, setFormCategory] = useState<string>('Access Codes')
  const [formTitle, setFormTitle] = useState('')
  const [formSubtitle, setFormSubtitle] = useState('')
  const [formValue, setFormValue] = useState('')

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const data = await apiJson<GroupDto[]>('/groups')
      setGroupsList(data)
      const stored = localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
      const pick =
        (stored && data.some((g) => g.id === stored) && stored) ||
        (data[0]?.id ?? null)
      setGroupId(pick)
      if (pick && pick !== stored) {
        localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, pick)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load groups')
      setGroupId(null)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  const loadVault = useCallback(async () => {
    if (!groupId) {
      setItems([])
      setLoadingVault(false)
      return
    }
    setLoadingVault(true)
    try {
      const data = await apiJson<VaultItemDto[]>(`/groups/${groupId}/vault`)
      setItems(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load vault')
      setItems([])
    } finally {
      setLoadingVault(false)
    }
  }, [groupId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    void loadVault()
  }, [loadVault])

  const openCreate = () => {
    setDialogMode('create')
    setEditingId(null)
    setFormType('code')
    setFormCategory('Access Codes')
    setFormTitle('')
    setFormSubtitle('')
    setFormValue('')
    setDialogOpen(true)
  }

  const openEdit = (item: VaultItemDto) => {
    setDialogMode('edit')
    setEditingId(item.id)
    setFormType(normalizeType(item.item_type))
    setFormCategory(item.category)
    setFormTitle(item.title)
    setFormSubtitle(item.subtitle ?? '')
    setFormValue(item.value)
    setDialogOpen(true)
  }

  const saveItem = async () => {
    if (!groupId) return
    const title = formTitle.trim()
    const value = formValue.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }
    if (!value) {
      toast.error('Value is required')
      return
    }
    if (!VAULT_CATEGORIES.includes(formCategory as (typeof VAULT_CATEGORIES)[number])) {
      toast.error('Pick a category')
      return
    }
    setSaving(true)
    try {
      if (dialogMode === 'create') {
        await apiJson<VaultItemDto>(`/groups/${groupId}/vault`, {
          method: 'POST',
          body: JSON.stringify({
            item_type: formType,
            title,
            subtitle: formSubtitle.trim() || null,
            value,
            category: formCategory,
          }),
        })
        toast.success('Saved to vault')
      } else if (editingId) {
        await apiJson<VaultItemDto>(`/groups/${groupId}/vault/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            item_type: formType,
            title,
            subtitle: formSubtitle.trim() || null,
            value,
            category: formCategory,
          }),
        })
        toast.success('Updated')
      }
      setDialogOpen(false)
      await loadVault()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (id: string) => {
    if (!groupId) return
    if (!window.confirm('Delete this vault item?')) return
    try {
      await apiJson<void>(`/groups/${groupId}/vault/${id}`, { method: 'DELETE' })
      toast.success('Deleted')
      await loadVault()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Could not copy')
    }
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.subtitle?.toLowerCase().includes(q) ?? false) ||
        item.value.toLowerCase().includes(q)
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [items, searchQuery, selectedCategory])

  const getCardStyle = (type: CardType) => {
    switch (type) {
      case 'code':
        return 'border-amber-500/20 hover:border-amber-500/40'
      case 'location':
        return 'border-emerald-500/20 hover:border-emerald-500/40'
      case 'link':
        return 'border-blue-500/20 hover:border-blue-500/40'
      default:
        return ''
    }
  }

  const getIconStyle = (type: CardType) => {
    switch (type) {
      case 'code':
        return 'bg-amber-500/10 text-amber-500'
      case 'location':
        return 'bg-emerald-500/10 text-emerald-500'
      case 'link':
        return 'bg-blue-500/10 text-blue-500'
      default:
        return ''
    }
  }

  const pickDisplayIcon = (type: CardType, title: string) => {
    const t = title.toLowerCase()
    if (type === 'code') {
      if (t.includes('wifi') || t.includes('wi-fi')) return Wifi
      if (t.includes('garage') || t.includes('door')) return Lock
      return Key
    }
    if (type === 'location') {
      if (t.includes('cabin') || t.includes('house') || t.includes('home')) return Home
      return MapPin
    }
    if (t.includes('photo')) return Camera
    if (t.includes('doc') || t.includes('rules')) return FileText
    return Link2
  }

  return (
    <>
      <div className="space-y-6 py-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Group</CardTitle>
            <CardDescription>Codes, addresses, and links are shared only with this group.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingGroups ? (
              <p className="text-sm text-muted-foreground">Loading groups…</p>
            ) : groupsList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Join a group first —{' '}
                <Link to="/groups" className="text-primary underline-offset-4 hover:underline">
                  open Groups
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label className="w-24 shrink-0 text-muted-foreground">Active group</Label>
                <Select
                  value={groupId ?? undefined}
                  onValueChange={(v) => {
                    setGroupId(v)
                    localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, v)
                  }}
                >
                  <SelectTrigger className="w-full sm:max-w-md">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupsList.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.member_count} members)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 border-b border-border pb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="shrink-0"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {!groupId ? null : loadingVault && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading vault…</p>
        ) : (
          <div className="pt-4">
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
              {filteredItems.map((item) => {
                const type = normalizeType(item.item_type)
                const Icon = pickDisplayIcon(type, item.title)
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'mb-4 break-inside-avoid transition-all duration-200 group',
                      getCardStyle(type),
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            getIconStyle(type),
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium">{item.title}</h3>
                              {item.subtitle ? (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {item.subtitle}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {item.category.split(' ')[0]}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground"
                                    aria-label="Item actions"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(item)}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => void deleteItem(item.id)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-3">
                            {type === 'code' ? (
                              <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-2">
                                <code className="text-lg font-mono font-semibold tracking-wider">
                                  {item.value}
                                </code>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => void handleCopy(item.id, item.value)}
                                >
                                  {copiedId === item.id ? (
                                    <Check className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            ) : type === 'location' ? (
                              <div className="space-y-2">
                                <p className="line-clamp-2 text-xs text-muted-foreground">{item.value}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-full text-xs"
                                  onClick={() => window.open(mapsUrl(item.value), '_blank')}
                                >
                                  <MapPin className="mr-1 h-3 w-3" />
                                  Open in Maps
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-full text-xs"
                                onClick={() => window.open(item.value, '_blank')}
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                Open Link
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {filteredItems.length === 0 && !loadingVault ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No items found</p>
                <Button className="mt-4" size="sm" variant="outline" onClick={openCreate}>
                  Add your first item
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <Button
          type="button"
          className="glow-primary fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg lg:bottom-6 lg:right-6"
          size="icon"
          onClick={openCreate}
          disabled={!groupId}
          aria-label="Add vault item"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Add vault item' : 'Edit vault item'}</DialogTitle>
            <DialogDescription>
              Only members of this group can see these entries.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={formType}
                onValueChange={(v) => setFormType(v as CardType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAULT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vault-title">Title</Label>
              <Input
                id="vault-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. WiFi password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vault-subtitle">Subtitle (optional)</Label>
              <Input
                id="vault-subtitle"
                value={formSubtitle}
                onChange={(e) => setFormSubtitle(e.target.value)}
                placeholder="e.g. Lake house"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vault-value">
                {formType === 'code'
                  ? 'Code or secret'
                  : formType === 'location'
                    ? 'Address'
                    : 'URL'}
              </Label>
              <Input
                id="vault-value"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder={
                  formType === 'link' ? 'https://…' : formType === 'location' ? '123 Main St…' : '••••'
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveItem()} disabled={saving || !groupId}>
              {saving ? 'Saving…' : dialogMode === 'create' ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
