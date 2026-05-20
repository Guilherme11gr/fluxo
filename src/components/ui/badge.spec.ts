// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children with the badge slot', () => {
    render(createElement(Badge, null, 'Ready'));

    expect(screen.getByText('Ready')).toHaveAttribute('data-slot', 'badge');
  });
});
