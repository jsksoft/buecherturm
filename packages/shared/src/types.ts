// Branded primitives for compile-time ID safety
export type UserId = string & { readonly __brand: 'UserId' };
export type BookId = string & { readonly __brand: 'BookId' };
export type BookClubId = string & { readonly __brand: 'BookClubId' };
export type ISBN = string & { readonly __brand: 'ISBN' };

export const asUserId = (id: string): UserId => id as UserId;
export const asBookId = (id: string): BookId => id as BookId;
export const asBookClubId = (id: string): BookClubId => id as BookClubId;
export const asISBN = (isbn: string): ISBN => isbn as ISBN;

export type ReadingStatus = 'reading' | 'read' | 'want_to_read' | 'abandoned';

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'Lese ich gerade',
  read: 'Gelesen',
  want_to_read: 'Möchte ich lesen',
  abandoned: 'Abgebrochen',
};
