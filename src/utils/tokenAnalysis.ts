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
          dataSize: 165,
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
      amount: Number(account.account.data.readBigInt64LE(64)),
    }));
  } catch (error) {
    console.error('Error fetching token holders:', error);
    return [];
  }
}

export function analyzeHolderDistribution(holders: TokenHolder[]): {
  uniqueHolders: number;
  maxHolderPercentage: number;
  concentration: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  if (!holders.length) return { uniqueHolders: 0, maxHolderPercentage: 0, concentration: 'HIGH' };

  const totalSupply = holders.reduce((sum, holder) => sum + holder.amount, 0);
  const maxAmount = Math.max(...holders.map(h => h.amount));
  const maxHolderPercentage = (maxAmount / totalSupply) * 100;

  // Calculate holder concentration
  const concentration = maxHolderPercentage > 50 ? 'HIGH' : 
                       maxHolderPercentage > 25 ? 'MEDIUM' : 'LOW';

  return {
    uniqueHolders: new Set(holders.map(h => h.address)).size,
    maxHolderPercentage,
    concentration
  };
}

export async function analyzeTokenContract(connection: Connection, tokenAddress: string) {
  try {
    const programAccount = await connection.getAccountInfo(new PublicKey(tokenAddress));
    if (!programAccount?.data) {
      throw new Error('Could not fetch program data');
    }

    const contractData = programAccount.data;
    const contractString = contractData.toString();
    
    // Enhanced token contract analysis
    const mintPatterns = [
      'mintTo', 'mint(', '_mint', 'createToken'
    ];
    
    const pausePatterns = [
      'pause', 'freeze', 'suspend', 'lock', 'blacklist', 'block'
    ];
    
    const ownershipPatterns = [
      'transferOwnership', 'setOwner', 'changeOwner', 'renounceOwnership'
    ];

    const hasUnlimitedMint = mintPatterns.some(pattern => 
      contractString.includes(pattern) && 
      !contractString.includes('maxSupply') &&
      !contractString.includes('MAX_SUPPLY')
    );
    
    const hasPausableTrading = pausePatterns.some(pattern => 
      contractString.includes(pattern)
    );
    
    const hasBlacklist = contractString.includes('blacklist') || 
                        contractString.includes('blocklist') ||
                        contractString.includes('denylist');

    const hasOwnershipTransfer = ownershipPatterns.some(pattern => 
      contractString.includes(pattern)
    );

    return {
      hasUnlimitedMint,
      hasPausableTrading,
      hasBlacklist,
      hasOwnershipTransfer,
      riskLevel: calculateRiskLevel(hasUnlimitedMint, hasPausableTrading, hasBlacklist, hasOwnershipTransfer)
    };
  } catch (error) {
    console.error('Error analyzing contract:', error);
    return {
      hasUnlimitedMint: true,
      hasPausableTrading: true,
      hasBlacklist: true,
      hasOwnershipTransfer: true,
      riskLevel: 'HIGH'
    };
  }
}

function calculateRiskLevel(
  hasUnlimitedMint: boolean,
  hasPausableTrading: boolean,
  hasBlacklist: boolean,
  hasOwnershipTransfer: boolean
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const riskFactors = [
    hasUnlimitedMint,
    hasPausableTrading,
    hasBlacklist,
    hasOwnershipTransfer
  ].filter(Boolean).length;

  if (riskFactors >= 3) return 'HIGH';
  if (riskFactors >= 1) return 'MEDIUM';
  return 'LOW';
}

export async function get24hVolume(connection: Connection, tokenAddress: string): Promise<number> {
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
      try {
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
      } catch (txError) {
        console.error('Error processing transaction:', sig.signature, txError);
        continue;
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
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
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
        is_safe: analysis.riskLevel === 'LOW'
      }]);

    if (error) throw error;
  } catch (error) {
    console.error('Error storing token analysis:', error);
  }
}

export async function analyzeToken(connection: Connection, tokenAddress: string) {
  try {
    console.log('Starting analysis for token:', tokenAddress);
    
    const holders = await getTokenHolders(connection, tokenAddress);
    console.log('Holder analysis complete. Total holders:', holders.length);
    
    const { uniqueHolders, maxHolderPercentage, concentration } = analyzeHolderDistribution(holders);
    console.log('Distribution analysis:', { uniqueHolders, maxHolderPercentage, concentration });
    
    const contractAnalysis = await analyzeTokenContract(connection, tokenAddress);
    console.log('Contract analysis complete:', contractAnalysis);
    
    const volume24h = await get24hVolume(connection, tokenAddress);
    console.log('24h volume calculated:', volume24h);

    const analysis = {
      totalHolders: uniqueHolders,
      maxHolderPercentage,
      hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
      hasPausableTrading: contractAnalysis.hasPausableTrading,
      hasBlacklist: contractAnalysis.hasBlacklist,
      volume24h,
      riskLevel: contractAnalysis.riskLevel
    };

    await storeTokenAnalysis(tokenAddress, analysis);
    console.log('Analysis stored in database');
    
    return analysis;
  } catch (error) {
    console.error('Error performing token analysis:', error);
    throw error;
  }
}
