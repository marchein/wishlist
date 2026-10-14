import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { AuthResponse, User } from './models';

const TOKEN_KEY = 'wishlist.token';
const USER_KEY = 'wishlist.user';
const GUEST_NAME_KEY = 'wishlist.guestName';

function readUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as User | null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<User | null>(readUser());
  readonly isLoggedIn = computed(() => !!this.token());

  async login(email: string, password: string): Promise<void> {
    this.setSession(await this.api.login(email, password));
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    this.setSession(await this.api.register(email, password, displayName));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  /** Name used when marking items as bought – the account name, or what a guest typed last time. */
  get buyerName(): string {
    return localStorage.getItem(GUEST_NAME_KEY) ?? this.user()?.displayName ?? '';
  }

  rememberBuyerName(name: string): void {
    localStorage.setItem(GUEST_NAME_KEY, name);
  }

  private setSession({ token, user }: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.token.set(token);
    this.user.set(user);
  }
}
