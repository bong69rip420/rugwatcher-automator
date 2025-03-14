
import { Connection } from '@solana/web3.js';
import { Token, TokenAnalysis } from '@/types/token';
import { getTokenHolders, analyzeHolderDistribution, analyzeTokenContract, get24hVolume, storeTokenAnalysis } from '@/utils/tokenAnalysis';

export class TokenAnalyzer {
  private static instance: TokenAnalyzer;
  private connection: Connection;

  private constructor(connection: Connection) {
    this.connection = connection;
  }

  static getInstance(connection: Connection): TokenAnalyzer {
    if (!TokenAnalyzer.instance) {
      TokenAnalyzer.instance = new TokenAnalyzer(connection);
    }
    return TokenAnalyzer.instance;
  }

  async analyzeToken(token: Token): Promise<TokenAnalysis> {
    try {
      const holders = await getTokenHolders(this.connection, token.address);
      const { uniqueHolders, maxHolderPercentage } = analyzeHolderDistribution(holders);
      
      const contractAnalysis = await analyzeTokenContract(this.connection, token.address);
      const volume24h = await get24hVolume(this.connection, token.address);

      const isSafe = uniqueHolders >= 100 &&
        maxHolderPercentage <= 20 &&
        !contractAnalysis.hasUnlimitedMint &&
        !contractAnalysis.hasPausableTrading &&
        !contractAnalysis.hasBlacklist &&
        volume24h >= 2000;

      const details = [];
      if (uniqueHolders < 100) details.push(`Only ${uniqueHolders} holders`);
      if (maxHolderPercentage > 20) details.push(`Max holder owns ${maxHolderPercentage.toFixed(2)}%`);
      if (contractAnalysis.hasUnlimitedMint) details.push('Unlimited mint function detected');
      if (contractAnalysis.hasPausableTrading) details.push('Pausable trading function detected');
      if (contractAnalysis.hasBlacklist) details.push('Blacklist function detected');
      if (volume24h < 2000) details.push(`Low 24h volume: $${volume24h.toFixed(2)}`);

      const analysis: TokenAnalysis = {
        isRugPull: !isSafe,
        maxHolderPercentage,
        isSecure: isSafe,
        details,
        totalHolders: uniqueHolders,
        hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
        hasPausableTrading: contractAnalysis.hasPausableTrading,
        hasBlacklist: contractAnalysis.hasBlacklist,
        volume24h,
        riskLevel: contractAnalysis.riskLevel
      };

      await storeTokenAnalysis(token.address, {
        totalHolders: uniqueHolders,
        maxHolderPercentage,
        hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
        hasPausableTrading: contractAnalysis.hasPausableTrading,
        hasBlacklist: contractAnalysis.hasBlacklist,
        volume24h,
        riskLevel: contractAnalysis.riskLevel
      });

      return analysis;
    } catch (error) {
      console.error('Error analyzing token:', error);
      throw error;
    }
  }
}
