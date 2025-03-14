
import { Connection } from '@solana/web3.js';
import { blockchainService } from './BlockchainService';
import { jupiterTradeService } from './JupiterTradeService';
import { configurationService } from './ConfigurationService';

export class SolanaTradeExecutor {
  private static instance: SolanaTradeExecutor;
  private connection: Connection | null = null;
  private isInitializing = false;

  private constructor() {}

  static getInstance(): SolanaTradeExecutor {
    if (!SolanaTradeExecutor.instance) {
      SolanaTradeExecutor.instance = new SolanaTradeExecutor();
    }
    return SolanaTradeExecutor.instance;
  }

  async initialize() {
    if (this.isInitializing) {
      console.log('Trade executor initialization already in progress');
      return;
    }

    if (this.connection) {
      console.log('Trade executor already initialized');
      return;
    }

    try {
      this.isInitializing = true;
      const provider = await blockchainService.getProvider();
      this.connection = new Connection(provider.rpcUrl);
      
      await jupiterTradeService.initialize(this.connection);
      
      // Get wallet configuration from the database
      const config = await configurationService.getTradeConfig();
      if (config?.wallet_private_key) {
        jupiterTradeService.setTradingWallet(config.wallet_private_key);
      } else {
        console.warn('No trading wallet configured');
      }
      
      console.log('Trade executor initialized successfully');
    } catch (error) {
      console.error('Error initializing trade executor:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection) {
      throw new Error('Trade executor not initialized');
    }

    return jupiterTradeService.executePurchase(tokenAddress, amount);
  }
}

export const solanaTradeExecutor = SolanaTradeExecutor.getInstance();
