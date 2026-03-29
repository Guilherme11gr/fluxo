import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface UseTaskStreamingOptions {
  title?: string;
  featureId?: string;
  currentDescription?: string;
  type?: 'TASK' | 'BUG';
  priority?: string;
  docIds?: string[];
  projectId?: string;
}

interface UseTaskStreamingReturn {
  description: string;
  isLoading: boolean;
  isStreaming: boolean;
  generateDescription: (options: UseTaskStreamingOptions) => Promise<void>;
  stopGeneration: () => void;
}

/**
 * JKILL-224: Hook for streaming AI task description generation
 *
 * Similar to useFeatureStreaming but for task descriptions.
 * Handles streaming from /api/ai/generate-description with stream=true.
 *
 * The stream includes reasoning content from DeepSeek Reasoner formatted as blockquotes.
 *
 * @example
 * const { description, isStreaming, isLoading, generateDescription, stopGeneration } = useTaskStreaming();
 *
 * <Button onClick={() => generateDescription({ title, featureId })}>
 *   Gerar Descrição
 * </Button>
 * <Button onClick={stopGeneration} disabled={!isStreaming}>
 *   Parar
 * </Button>
 * <MarkdownViewer value={description} />
 */
export function useTaskStreaming(): UseTaskStreamingReturn {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  const generateDescription = useCallback(async (options: UseTaskStreamingOptions) => {
    // CRITICAL: Abort any existing stream before starting a new one
    // This prevents memory leaks and overlapping streams
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    try {
      setDescription('');
      setIsLoading(true);
      setIsStreaming(true);

      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...options,
          stream: true, // Enable streaming
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || 'Erro ao gerar descrição');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      setIsLoading(false); // Initial load done, now streaming

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setDescription((prev) => prev + chunk);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.info('Geração interrompida.');
      } else {
        console.error('Streaming error:', error);
        toast.error('Erro ao gerar descrição.');
      }
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopGeneration();
    };
  }, [stopGeneration]);

  return {
    description,
    isLoading,
    isStreaming,
    generateDescription,
    stopGeneration,
  };
}
