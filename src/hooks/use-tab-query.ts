'use client';

import { useEffect } from 'react';

/**
 * Hook to manage tab state synchronized with URL query parameters
 * Uses `nuqs` for URL state management if available, otherwise falls back to standard next/navigation
 * 
 * Note: Since we might not have `nuqs` installed yet, I'll write a standard implementation first 
 * using next/navigation `useSearchParams`, `usePathname`, and `useRouter`.
 */

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useTabQuery<T extends string>(defaultTab: T, validTabs: T[]) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const tabParam = searchParams.get('tab');

    // Validate the tab param, fallback to default if invalid
    const activeTab = (validTabs.includes(tabParam as T) ? tabParam : defaultTab) as T;

    const setActiveTab = useCallback((tab: T) => {
        const params = new URLSearchParams(searchParams.toString());

        if (tab === defaultTab) {
            params.delete('tab');
        } else {
            params.set('tab', tab);
        }

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [searchParams, pathname, router, defaultTab]);

    return {
        activeTab,
        setActiveTab
    };
}
