'use client';

import { useState, useRef, useEffect } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export function QuickCapture() {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!value.trim() || saving) return;

    setSaving(true);
    try {
      const res = await fetch('/api/personal-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value.trim(), isPinned: false }),
      });

      if (!res.ok) throw new Error('Failed to create note');

      setValue('');
      setFlash(true);
      toast.success('Anotado!');
      setTimeout(() => setFlash(false), 600);
    } catch {
      toast.error('Erro ao salvar nota.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card transition-all duration-300',
          flash
            ? 'border-green-400 bg-green-50 dark:bg-green-950/20 shadow-sm shadow-green-200 dark:shadow-green-900/20'
            : 'border-border hover:border-primary/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'
        )}
      >
        <Zap className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors',
          flash ? 'text-green-500' : 'text-amber-500'
        )} />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Anote algo rápido... (Enter para salvar)"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground"
          disabled={saving}
          maxLength={1000}
        />
        {saving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </form>
  );
}
