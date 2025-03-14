
import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '@/integrations/supabase/client';

export interface TokenHolder {
  address: string;
  amount: number;
}

export async function getTokenHolders(connection: Connection, tokenAddress: string): Promise<TokenHolder[]> {
  try {
    const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const accounts = await connection.getProgramAccounts(tokenProgramId, {
      filters: [
        {
          dataSize: 165, // Size of token account data
        },
        {
          memcmp: {
            offset: 0,
            bytes: tokenAddress,
          },
        },
      ],
    });

    return accounts.map(account => ({
      address: account.pubkey.toString(),
      amount: Number(account.account.data.readBigInt64LE(64)), // Token amount stored at offset 64
    }));
  } catch (error) {
    console.error('Error fetching token holders:', error);
    return [];
  }
}

export function analyzeHolderDistribution(holders: TokenHolder[]): {
  uniqueHolders: number;
  maxHolderPercentage: number;
} {
  if (!holders.length) return { uniqueHolders: 0, maxHolderPercentage: 0 };

  const totalSupply = holders.reduce((sum, holder) => sum + holder.amount, 0);
  const maxAmount = Math.max(...holders.map(h => h.amount));
  const maxHolderPercentage = (maxAmount / totalSupply) * 100;

  return {
    uniqueHolders: new Set(holders.map(h => h.address)).size,
    maxHolderPercentage,
  };
}

export async function storeTokenAnalysis(tokenAddress: string, analysis: {
  totalHolders: number;
  maxHolderPercentage: number;
  hasUnlimitedMint: boolean;
  hasPausableTrading: boolean;
  hasBlacklist: boolean;
  volume24h: number;
  isSafe: boolean;
}) {
  try {
    const { error } = await supabase
      .from('token_analysis')
      .insert([{
        token_address: tokenAddress,
        total_holders: analysis.totalHolders,
        max_holder_percentage: analysis.maxHolderPercentage,
        has_unlimited_mint: analysis.hasUnlimitedMint,
        has_pausable_trading: analysis.hasPausableTrading,
        has_blacklist: analysis.hasBlacklist,
        volume_24h: analysis.volume24h,
        is_safe: analysis.isSafe
      }]);

    if (error) throw error;
  } catch (error) {
    console.error('Error storing token analysis:', error);
  }
}
