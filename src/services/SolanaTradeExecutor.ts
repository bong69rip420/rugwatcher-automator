
import { Connection } from '@solana/web3.js';
import { blockchainService } from './BlockchainService';
import { jupiterTradeService } from './JupiterTradeService';
import { configurationService } from './ConfigurationService';
import { supabase } from '@/integrations/supabase/client';

export class SolanaTradeExecutor {
  private static instance: SolanaTradeExecutor;
  private connection: Connection | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): SolanaTradeExecutor {
    if (!SolanaTradeExecutor.instance) {
      SolanaTradeExecutor.instance = new SolanaTradeExecutor();
    }
    return SolanaTradeExecutor.instance;
  }

  async initialize() {
    // If already initializing, wait for the existing initialization to complete
    if (this.initPromise) {
      console.log('Waiting for existing trade executor initialization to complete');
      await this.initPromise;
      return;
    }

    // If already initialized, skip
    if (this.connection) {
      console.log('Trade executor already initialized');
      return;
    }

    // Create a new initialization promise
    this.initPromise = this._initialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _initialize() {
    try {
      this.isInitializing = true;
      console.log('Starting trade executor initialization');
      
      const provider = await blockchainService.getProvider();
      this.connection = new Connection(provider.rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });

      // Get the private key from Supabase secrets
      const { data: { secret: privateKey } } = await supabase.functions.invoke('get-secret', {
        body: { name: 'TRADING_WALLET_PRIVATE_KEY' }
      });

      if (!privateKey) {
        throw new Error('Trading wallet private key not found');
      }

      // Initialize Jupiter with the connection and private key
      await jupiterTradeService.initialize(this.connection);
      jupiterTradeService.setTradingWallet(privateKey);
      
      // Get wallet configuration from the database
      const config = await configurationService.getTradeConfig();
      if (config?.wallet_address) {
        await configurationService.updateWalletAddress(config.wallet_address);
      }
      
      console.log('Trade executor initialized successfully');
    } catch (error) {
      console.error('Error initializing trade executor:', error);
      // Clear state on error
      this.connection = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async getWalletBalance(): Promise<number> {
    if (!this.connection) {
      await this.initialize();
    }
    return jupiterTradeService.getWalletBalance();
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection) {
      throw new Error('Trade executor not initialized');
    }

    return jupiterTradeService.executePurchase(tokenAddress, amount);
  }
}

export const solanaTradeExecutor = SolanaTradeExecutor.getInstance();
