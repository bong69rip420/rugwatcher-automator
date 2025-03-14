import { blockchainService } from './BlockchainService';
import { Connection } from '@solana/web3.js';
import { getTokenHolders, analyzeHolderDistribution, storeTokenAnalysis } from '@/utils/tokenAnalysis';

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
      const analysis = await analyzeToken(this.connection, token.address);
      
      const details = [];
      if (analysis.totalHolders < 100) details.push(`Only ${analysis.totalHolders} holders`);
      if (analysis.maxHolderPercentage > 20) details.push(`Max holder owns ${analysis.maxHolderPercentage.toFixed(2)}%`);
      if (analysis.hasUnlimitedMint) details.push('Unlimited mint function detected');
      if (analysis.hasPausableTrading) details.push('Pausable trading function detected');
      if (analysis.hasBlacklist) details.push('Blacklist function detected');
      if (analysis.volume24h < 2000) details.push(`Low 24h volume: $${analysis.volume24h.toFixed(2)}`);

      return {
        isRugPull: !analysis.isSafe,
        maxHolderPercentage: analysis.maxHolderPercentage,
        isSecure: analysis.isSafe,
        details,
        totalHolders: analysis.totalHolders,
        hasUnlimitedMint: analysis.hasUnlimitedMint,
        hasPausableTrading: analysis.hasPausableTrading,
        hasBlacklist: analysis.hasBlacklist,
        volume24h: analysis.volume24h
      };
    } catch (error) {
      console.error('Error analyzing token:', error);
      throw error;
    }
  }

  getTokens(): Token[] {
    return this.tokens;
  }
}
