import type { TranslationKey } from '../../core/i18n/i18n';
import type { SharedItem } from '../../core/models';

export type Sort = 'newest' | 'oldest' | 'priority' | 'priceAsc' | 'priceDesc' | 'title';

export const SORT_OPTIONS: { value: Sort; label: TranslationKey }[] = [
  { value: 'newest', label: 'shared.sort.newest' },
  { value: 'oldest', label: 'shared.sort.oldest' },
  { value: 'priority', label: 'shared.sort.priority' },
  { value: 'priceAsc', label: 'shared.sort.priceAsc' },
  { value: 'priceDesc', label: 'shared.sort.priceDesc' },
  { value: 'title', label: 'shared.sort.title' },
];

export const isFullyBought = (item: SharedItem) => (item.purchasedQuantity ?? 0) >= item.quantity;

const byNewest = (a: SharedItem, b: SharedItem) => b.createdAt.localeCompare(a.createdAt);

/** Items without a price always go last, regardless of direction. */
function byPrice(a: SharedItem, b: SharedItem, direction: 1 | -1): number {
  if (a.price === b.price) return 0;
  if (a.price === null) return 1;
  if (b.price === null) return -1;
  return (a.price - b.price) * direction;
}

function comparator(sort: Sort, locale: string): (a: SharedItem, b: SharedItem) => number {
  switch (sort) {
    case 'oldest':
      return (a, b) => byNewest(b, a);
    case 'priority':
      return (a, b) => b.priority - a.priority || byNewest(a, b);
    case 'priceAsc':
      return (a, b) => byPrice(a, b, 1) || byNewest(a, b);
    case 'priceDesc':
      return (a, b) => byPrice(a, b, -1) || byNewest(a, b);
    case 'title': {
      const collator = new Intl.Collator(locale);
      return (a, b) => collator.compare(a.title, b.title);
    }
    default:
      return byNewest;
  }
}

/** Sorts a copy; with `boughtLast`, fully bought wishes sink below everything still needed. */
export function sortItems(items: readonly SharedItem[], sort: Sort, locale: string, boughtLast: boolean): SharedItem[] {
  const compare = comparator(sort, locale);
  return [...items].sort((a, b) => {
    const bought = boughtLast ? Number(isFullyBought(a)) - Number(isFullyBought(b)) : 0;
    return bought || compare(a, b);
  });
}
