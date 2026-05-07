'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TagBadge } from '@/components/features/tags/tag-badge';
import type { PersonalBoardTagInfo } from './types';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
];

interface PersonalTagSelectorProps {
  selectedTags: PersonalBoardTagInfo[];
  onTagsChange: (tags: PersonalBoardTagInfo[]) => void;
  availableTags: PersonalBoardTagInfo[];
  onCreateTag: (input: { name: string; color: string }) => Promise<PersonalBoardTagInfo>;
  disabled?: boolean;
  placeholder?: string;
}

export function PersonalTagSelector({
  selectedTags,
  onTagsChange,
  availableTags,
  onCreateTag,
  disabled = false,
  placeholder = 'Tags pessoais',
}: PersonalTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[6]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selectedTags.map((t) => t.id)),
    [selectedTags]
  );

  const toggleTag = useCallback(
    (tag: PersonalBoardTagInfo) => {
      if (selectedIds.has(tag.id)) {
        onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
      } else {
        onTagsChange([...selectedTags, tag]);
      }
    },
    [selectedTags, selectedIds, onTagsChange]
  );

  const handleCreateTag = async () => {
    if (!newTagName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const newTag = await onCreateTag({
        name: newTagName.trim(),
        color: selectedColor,
      });
      onTagsChange([...selectedTags, newTag]);
      setNewTagName('');
      setShowCreateForm(false);
    } catch {
      // Error handled by caller
    } finally {
      setIsCreating(false);
    }
  };

  const removeTag = (tagId: string) => {
    onTagsChange(selectedTags.filter((t) => t.id !== tagId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-auto min-h-[32px] py-1 px-2 justify-start font-normal"
        >
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedTags.slice(0, 3).map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  size="sm"
                  onRemove={() => removeTag(tag.id)}
                />
              ))}
              {selectedTags.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{selectedTags.length - 3}
                </span>
              )}
            </div>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2 z-[100]" align="start">
        <div className="space-y-2">
          <ScrollArea className="max-h-48">
            {availableTags.length === 0 && !showCreateForm ? (
              <div className="text-sm text-muted-foreground p-2">
                Nenhuma tag criada ainda
              </div>
            ) : (
              <div className="space-y-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors',
                      selectedIds.has(tag.id) && 'bg-accent'
                    )}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center"
                      style={{ backgroundColor: tag.color }}
                    >
                      {selectedIds.has(tag.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <span className="flex-1 text-left">{tag.name}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {showCreateForm ? (
            <div className="space-y-2 pt-2 border-t">
              <Input
                placeholder="Nome da tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag();
                  if (e.key === 'Escape') setShowCreateForm(false);
                }}
                autoFocus
              />
              <div className="flex flex-wrap gap-1">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={cn(
                      'w-6 h-6 rounded transition-transform',
                      selectedColor === color && 'ring-2 ring-primary ring-offset-1'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Selecionar cor ${color}`}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || isCreating}
                  className="flex-1"
                >
                  {isCreating ? 'Criando...' : 'Criar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewTagName('');
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova tag
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
