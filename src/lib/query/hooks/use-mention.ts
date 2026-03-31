/**
 * Hook for detecting and managing @mentions in text inputs.
 *
 * Tracks cursor position to detect when the user is typing a mention
 * (after an '@' character with no preceding space), provides filtered
 * user suggestions, and handles keyboard navigation.
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import type { User } from './use-users';

interface MentionState {
  /** Whether the mention dropdown should be visible */
  isOpen: boolean;
  /** The text typed after '@' (the search query) */
  query: string;
  /** Index of the currently highlighted item in the dropdown */
  activeIndex: number;
  /** The start position in the text where the '@' was typed */
  mentionStart: number;
}

interface UseMentionOptions {
  /** All users to search through for mentions */
  users: User[];
  /** Maximum number of suggestions to show */
  maxSuggestions?: number;
}

export function useMention({ users, maxSuggestions = 6 }: UseMentionOptions) {
  const [state, setState] = useState<MentionState>({
    isOpen: false,
    query: '',
    activeIndex: 0,
    mentionStart: -1,
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Filter users matching the current query */
  const suggestions = useMemo(() => {
    if (!state.isOpen || !state.query) {
      // When just '@' was typed with no query, show all users
      if (state.isOpen && state.query === '') {
        return users.slice(0, maxSuggestions);
      }
      return [];
    }
    const lowerQuery = state.query.toLowerCase();
    return users
      .filter((user) => {
        const name = (user.displayName || '').toLowerCase();
        return name.includes(lowerQuery);
      })
      .slice(0, maxSuggestions);
  }, [users, state.isOpen, state.query, maxSuggestions]);

  /**
   * Analyze text and cursor position to detect if we're inside a mention.
   * Called on every change and selection change.
   */
  const detectMention = useCallback(
    (text: string, cursorPosition: number) => {
      // Look backwards from cursor to find '@'
      if (cursorPosition <= 0) {
        setState((prev) => ({ ...prev, isOpen: false }));
        return;
      }

      let i = cursorPosition - 1;
      while (i >= 0 && text[i] !== ' ' && text[i] !== '\n') {
        if (text[i] === '@') {
          const query = text.slice(i + 1, cursorPosition);
          // Only trigger if @ is at start of text or preceded by space/newline
          const isAtStart = i === 0;
          const precededBySpace = text[i - 1] === ' ' || text[i - 1] === '\n';
          if (isAtStart || precededBySpace) {
            setState((prev) => ({
              ...prev,
              isOpen: true,
              query,
              mentionStart: i,
              activeIndex: 0,
            }));
            return;
          }
          break;
        }
        i--;
      }

      setState((prev) => ({ ...prev, isOpen: false }));
    },
    []
  );

  /**
   * Insert a mention into the text at the current position.
   * Replaces the '@query' portion with '@displayName '
   */
  const insertMention = useCallback(
    (user: User, currentText: string, cursorPosition: number) => {
      const mentionText = `@${user.displayName || 'Usuário'} `;
      const before = currentText.slice(0, state.mentionStart);
      const after = currentText.slice(cursorPosition);
      const newText = before + mentionText + after;
      const newCursorPos = state.mentionStart + mentionText.length;

      setState((prev) => ({ ...prev, isOpen: false, query: '' }));

      // Restore focus and set cursor
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });

      return { text: newText, cursorPosition: newCursorPos };
    },
    [state.mentionStart]
  );

  /** Move the active index up/down, wrapping around */
  const moveActiveIndex = useCallback((direction: 'up' | 'down') => {
    setState((prev) => {
      if (!prev.isOpen || suggestions.length === 0) return prev;
      const maxIndex = suggestions.length - 1;
      let next = prev.activeIndex + (direction === 'down' ? 1 : -1);
      if (next < 0) next = maxIndex;
      if (next > maxIndex) next = 0;
      return { ...prev, activeIndex: next };
    });
  }, [suggestions.length]);

  /** Close the mention dropdown */
  const closeMention = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  /** Select the currently active suggestion */
  const selectActive = useCallback(
    (currentText: string, cursorPosition: number) => {
      if (suggestions.length === 0) return null;
      const user = suggestions[state.activeIndex];
      return insertMention(user, currentText, cursorPosition);
    },
    [suggestions, state.activeIndex, insertMention]
  );

  return {
    isOpen: state.isOpen,
    query: state.query,
    activeIndex: state.activeIndex,
    suggestions,
    textareaRef,
    detectMention,
    insertMention,
    moveActiveIndex,
    closeMention,
    selectActive,
  };
}
