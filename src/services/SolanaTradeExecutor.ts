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
    if (this.initPromise) {
      console.log('Waiting for existing trade executor initialization to complete');
      await this.initPromise;
      return;
    }

    if (this.connection) {
      console.log('Trade executor already initialized');
      return;
    }

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
      console.log('Got blockchain provider:', provider);
      
      this.connection = new Connection(provider.rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
      console.log('Created Solana connection');

      const { data: { secret: privateKey } } = await supabase.functions.invoke('get-secret', {
        body: { name: 'TRADING_WALLET_PRIVATE_KEY' }
      });
      console.log('Retrieved private key from secrets');

      if (!privateKey) {
        throw new Error('Trading wallet private key not found');
      }

      await jupiterTradeService.initialize(this.connection);
      console.log('Initialized Jupiter trade service');
      
      jupiterTradeService.setTradingWallet(privateKey);
      console.log('Set trading wallet');
      
      const config = await configurationService.getTradeConfig();
      if (config?.wallet_address) {
        await configurationService.updateWalletAddress(config.wallet_address);
        console.log('Updated wallet address:', config.wallet_address);
      } else {
        console.log('No wallet address found in config');
      }
      
      console.log('Trade executor initialized successfully');
    } catch (error) {
      console.error('Error initializing trade executor:', error);
      this.connection = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async getWalletBalance(): Promise<number> {
    if (!this.connection) {
      console.log('Connection not initialized, initializing now...');
      await this.initialize();
    }
    const balance = await jupiterTradeService.getWalletBalance();
    console.log('Retrieved wallet balance:', balance);
    return balance;
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection) {
      throw new Error('Trade executor not initialized');
    }

    return jupiterTradeService.executePurchase(tokenAddress, amount);
  }
}

export const solanaTradeExecutor = SolanaTradeExecutor.getInstance();
