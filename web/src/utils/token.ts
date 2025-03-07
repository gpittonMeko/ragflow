// src/utils/token.ts
import { v4 as uuid } from 'uuid';

export const getGuestToken = (): string => {
  let token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (!token) {
    token = 'guest_' + uuid();
    // Scegli se salvarlo in localStorage o sessionStorage
    localStorage.setItem('access_token', token);
    console.log('[Token] Token guest generato:', token);
  } else {
    console.log('[Token] Token trovato:', token);
  }
  return token;
};
