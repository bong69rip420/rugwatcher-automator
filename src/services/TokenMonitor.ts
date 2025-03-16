import { blockchainService } from './BlockchainService';
import { Connection } from '@solana/web3.js';
import { Token } from '@/types/token';
import { SolanaTradeExecutor } from './SolanaTradeExecutor';
import { TokenAnalyzer } from './TokenAnalyzer';
import { supabaseService } from './SupabaseService';
import { PublicKey } from '@solana/web3.js';
import { sleep } from 'lodash';

export class TokenMonitor {
  private static instance: TokenMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private tokens: Token[] = [];
  private onNewToken: ((token: Token) => void) | null = null;
  private connection: Connection | null = null;
  private tokenAnalyzer: TokenAnalyzer | null = null;
  private tradeExecutor: SolanaTradeExecutor | null = null;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 3 * 60 * 1000; // 3 minutes

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

      // Start immediate check and set interval
      await this.checkNewTokens();
      this.intervalId = setInterval(() => {
        this.checkNewTokens();
      }, this.CHECK_INTERVAL);

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
      const now = Date.now();
      console.log('Checking new tokens, last check:', new Date(this.lastCheckTime).toISOString());

      // For testing purposes, create a mock new token with valid Solana address format
      const mockToken: Omit<Token, 'id'> = {
        address: new PublicKey(Buffer.from("TestToken123456789012", "utf8")).toString(),
        name: "Test Token " + new Date().toLocaleTimeString(),
        symbol: "TEST" + Math.floor(Math.random() * 1000),
        is_active: true,
        created_at: new Date().toISOString(),
      };

      try {
        const savedToken = await supabaseService.addToken({
          address: mockToken.address,
          name: mockToken.name,
          symbol: mockToken.symbol,
        });

        if (savedToken) {
          console.log('New token saved to database:', savedToken);
          this.tokens.push(savedToken);
          
          if (this.onNewToken) {
            this.onNewToken(savedToken);
          }

          await sleep(1000); // Add delay between operations to respect rate limits

          const analysis = await this.tokenAnalyzer.analyzeToken(savedToken);
          if (analysis.isSecure) {
            console.log('Token analysis shows token is secure, executing trade');
            const txHash = await this.tradeExecutor.executePurchase(savedToken.address, 0.1);
            console.log('Trade executed successfully:', txHash);

            await supabaseService.addTrade({
              token_address: savedToken.address,
              amount: 0.1,
              price: null,
              status: 'completed',
              transaction_hash: txHash,
            });
          } else {
            console.log('Token analysis shows token is not secure:', analysis.details);
          }
        }
      } catch (error) {
        console.error('Error saving token or executing trade:', error);
      }

      this.lastCheckTime = now;
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
