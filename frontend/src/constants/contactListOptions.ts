/**
 * Contact list sort orders. The desktop toolbar's select and the phone
 * sort & filter sheet both render from this list. `value` is the ?sort= param.
 */
export const SORT_OPTIONS = [
  { value: 'name-asc', label: 'A → Z' },
  { value: 'name-desc', label: 'Z → A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'last-contacted', label: 'Last contacted' },
] as const;

export const DEFAULT_SORT = 'name-asc';
