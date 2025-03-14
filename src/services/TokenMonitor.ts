import { blockchainService } from './BlockchainService';
import { Connection } from '@solana/web3.js';
import { getTokenHolders, analyzeHolderDistribution, analyzeTokenContract, get24hVolume, storeTokenAnalysis } from '@/utils/tokenAnalysis';

interface Token {
  address: string;
  name: string;
  symbol: string;
  timestamp: number;
}

interface TokenAnalysis {
  isRugPull: boolean;
  maxHolderPercentage: number;
  isSecure: boolean;
  details: string[];
  totalHolders: number;
  hasUnlimitedMint: boolean;
  hasPausableTrading: boolean;
  hasBlacklist: boolean;
  volume24h: number;
}

export class TokenMonitor {
  private static instance: TokenMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private tokens: Token[] = [];
  private onNewToken: ((token: Token) => void) | null = null;
  private connection: Connection | null = null;

  private constructor() {}

  static getInstance(): TokenMonitor {
    if (!TokenMonitor.instance) {
      TokenMonitor.instance = new TokenMonitor();
    }
    return TokenMonitor.instance;
  }

  setOnNewToken(callback: (token: Token) => void) {
    this.onNewToken = callback;
  }

  async start() {
    if (this.intervalId) return;
    
    try {
      const provider = await blockchainService.getProvider();
      console.log('Starting token monitoring with provider:', provider);
      
      this.connection = new Connection(provider.rpcUrl);
      console.log('Connected to Solana network:', provider.network);

      // Subscribe to program accounts that create new tokens
      const tokenProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      console.log('Monitoring token program:', tokenProgramId);

      this.intervalId = setInterval(() => {
        this.checkNewTokens();
      }, 3 * 60 * 1000); // 3 minutes

      // Initial check
      this.checkNewTokens();
    } catch (error) {
      console.error('Error starting token monitor:', error);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.connection = null;
      console.log('Token monitoring stopped');
    }
  }

  private async checkNewTokens() {
    if (!this.connection) {
      console.error('No connection available');
      return;
    }

    try {
      // Get recent token mint accounts
      const signature = await this.connection.getRecentBlockhash();
      console.log('Checking new tokens in block:', signature.blockhash);

      // For now, just creating a mock token to test the flow
      // This will be replaced with real token detection logic
      const mockNewToken: Token = {
        address: "0x" + Math.random().toString(16).slice(2, 42),
        name: "New Token " + Date.now(),
        symbol: "NT" + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
      };

      this.tokens.push(mockNewToken);
      console.log('New token detected:', mockNewToken);
      
      if (this.onNewToken) {
        this.onNewToken(mockNewToken);
      }
    } catch (error) {
      console.error("Error checking new tokens:", error);
    }
  }

  async analyzeToken(token: Token): Promise<TokenAnalysis> {
    if (!this.connection) {
      throw new Error('No connection available');
    }

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

      const analysis = {
        isRugPull: !isSafe,
        maxHolderPercentage,
        isSecure: isSafe,
        details,
        totalHolders: uniqueHolders,
        hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
        hasPausableTrading: contractAnalysis.hasPausableTrading,
        hasBlacklist: contractAnalysis.hasBlacklist,
        volume24h
      };

      await storeTokenAnalysis(token.address, {
        totalHolders: uniqueHolders,
        maxHolderPercentage,
        hasUnlimitedMint: contractAnalysis.hasUnlimitedMint,
        hasPausableTrading: contractAnalysis.hasPausableTrading,
        hasBlacklist: contractAnalysis.hasBlacklist,
        volume24h,
        isSafe
      });

      return analysis;
    } catch (error) {
      console.error('Error analyzing token:', error);
      throw error;
    }
  }

  getTokens(): Token[] {
    return this.tokens;
  }
}
