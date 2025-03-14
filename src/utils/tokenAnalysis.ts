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

async function analyzeTokenContract(connection: Connection, tokenAddress: string) {
  try {
    const programAccount = await connection.getAccountInfo(new PublicKey(tokenAddress));
    if (!programAccount?.data) {
      throw new Error('Could not fetch program data');
    }

    const contractData = programAccount.data.toString();
    
    const hasUnlimitedMint = contractData.includes('mintTo') && 
                            !contractData.includes('maxSupply') && 
                            !contractData.includes('MAX_SUPPLY');
    
    const hasPausableTrading = contractData.includes('pause') || 
                              contractData.includes('freeze') ||
                              contractData.includes('suspend');
    
    const hasBlacklist = contractData.includes('blacklist') || 
                        contractData.includes('blocklist') ||
                        contractData.includes('excludeAccount');

    return {
      hasUnlimitedMint,
      hasPausableTrading,
      hasBlacklist
    };
  } catch (error) {
    console.error('Error analyzing contract:', error);
    return {
      hasUnlimitedMint: true,
      hasPausableTrading: true,
      hasBlacklist: true
    };
  }
}

async function get24hVolume(connection: Connection, tokenAddress: string): Promise<number> {
  try {
    const signature = await connection.getSignaturesForAddress(
      new PublicKey(tokenAddress),
      { limit: 1000 }
    );

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentSignatures = signature.filter(sig => 
      sig.blockTime && (new Date(sig.blockTime * 1000) > oneDayAgo)
    );

    let volume = 0;
    for (const sig of recentSignatures) {
      const tx = await connection.getTransaction(sig.signature);
      if (tx?.meta?.postTokenBalances && tx.meta.preTokenBalances) {
        const tokenBalanceChanges = tx.meta.postTokenBalances
          .filter(post => post.mint === tokenAddress)
          .map((post, i) => {
            const pre = tx.meta?.preTokenBalances?.[i];
            return Math.abs((post.uiTokenAmount.uiAmount || 0) - 
                          (pre?.uiTokenAmount.uiAmount || 0));
          });
        
        volume += tokenBalanceChanges.reduce((sum, change) => sum + change, 0);
      }
    }

    return volume;
  } catch (error) {
    console.error('Error calculating 24h volume:', error);
    return 0;
  }
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

export async function analyzeToken(connection: Connection, tokenAddress: string) {
  try {
    const holders = await getTokenHolders(connection, tokenAddress);
    const { uniqueHolders, maxHolderPercentage } = analyzeHolderDistribution(holders);

    const contractAnalysis = await analyzeTokenContract(connection, tokenAddress);

    const volume24h = await get24hVolume(connection, tokenAddress);

    const isSafe = uniqueHolders >= 100 &&
      maxHolderPercentage <= 20 &&
      !contractAnalysis.hasUnlimitedMint &&
      !contractAnalysis.hasPausableTrading &&
      !contractAnalysis.hasBlacklist &&
      volume24h >= 2000;

    const analysis = {
      totalHolders: uniqueHolders,
      maxHolderPercentage,
      hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
      hasPausableTrading: contractAnalysis.hasPausableTrading,
      hasBlacklist: contractAnalysis.hasBlacklist,
      volume24h,
      isSafe
    };

    await storeTokenAnalysis(tokenAddress, analysis);
    return analysis;
  } catch (error) {
    console.error('Error performing token analysis:', error);
    throw error;
  }
}
