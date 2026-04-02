/**
 * Utility for claiming anonymous games when a user signs up or logs in.
 *
 * When an anonymous user plays a game, it's stored in localStorage with an access token.
 * When they later sign up or log in, this function links that game to their account.
 *
 * Note: localStorage is NOT cleared after claiming - it's needed to enforce the daily limit.
 */

import { getTodaysGame } from '@/lib/game-limits';

export interface ClaimResult {
  claimed: boolean;
  alreadyClaimed?: boolean;
  error?: string;
}

/**
 * Claim an anonymous game from localStorage for a user.
 * This links the game to the user's account via the /api/game/claim endpoint.
 *
 * @param userId - The authenticated user's ID
 * @returns ClaimResult indicating success/failure
 */
export async function claimAnonymousGame(userId: string): Promise<ClaimResult> {
  const todaysGame = getTodaysGame();

  if (!todaysGame) {
    return { claimed: false };
  }

  try {
    const response = await fetch('/api/game/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: todaysGame.gameId,
        accessToken: todaysGame.accessToken,
        userId,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      // Don't clear localStorage - it's needed to enforce the daily game limit
      return { claimed: true };
    }

    if (result.message === 'Game already claimed') {
      return { claimed: false, alreadyClaimed: true };
    }

    return { claimed: false, error: result.message };
  } catch (error) {
    console.error('Failed to claim anonymous game:', error);
    return { claimed: false, error: 'Network error' };
  }
}
