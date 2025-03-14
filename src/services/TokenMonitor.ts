
import { blockchainService } from './BlockchainService';
import { Connection } from '@solana/web3.js';
import { Token } from '@/types/token';
import { SolanaTradeExecutor } from './SolanaTradeExecutor';
import { TokenAnalyzer } from './TokenAnalyzer';

export class TokenMonitor {
  private static instance: TokenMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private tokens: Token[] = [];
  private onNewToken: ((token: Token) => void) | null = null;
  private connection: Connection | null = null;
  private tokenAnalyzer: TokenAnalyzer | null = null;
  private tradeExecutor: SolanaTradeExecutor | null = null;

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

      if (this.connection) {
        this.tokenAnalyzer = TokenAnalyzer.getInstance(this.connection);
        this.tradeExecutor = SolanaTradeExecutor.getInstance();
        await this.tradeExecutor.initialize();
      }

      const tokenProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      console.log('Monitoring token program:', tokenProgramId);

      this.intervalId = setInterval(() => {
        this.checkNewTokens();
      }, 3 * 60 * 1000); // 3 minutes

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
      this.tokenAnalyzer = null;
      this.tradeExecutor = null;
      console.log('Token monitoring stopped');
    }
  }

  private async checkNewTokens() {
    if (!this.connection || !this.tokenAnalyzer || !this.tradeExecutor) {
      console.error('Required services not initialized');
      return;
    }

    try {
      const signature = await this.connection.getRecentBlockhash();
      console.log('Checking new tokens in block:', signature.blockhash);

      // Mock token for testing - will be replaced with real token detection
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

      // Analyze token and execute trade if safe
      const analysis = await this.tokenAnalyzer.analyzeToken(mockNewToken);
      if (analysis.isSecure) {
        const txHash = await this.tradeExecutor.executePurchase(mockNewToken.address, 0.1);
        console.log('Trade executed successfully:', txHash);
      }
    } catch (error) {
      console.error("Error checking new tokens:", error);
    }
  }

  getTokens(): Token[] {
    return this.tokens;
  }

  async analyzeToken(token: Token) {
    if (!this.tokenAnalyzer) {
      throw new Error('Token analyzer not initialized');
    }
    return this.tokenAnalyzer.analyzeToken(token);
  }
}
