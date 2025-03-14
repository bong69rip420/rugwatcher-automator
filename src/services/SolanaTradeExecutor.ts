
import { Connection } from '@solana/web3.js';
import { blockchainService } from './BlockchainService';
import { jupiterTradeService } from './JupiterTradeService';

export class SolanaTradeExecutor {
  private static instance: SolanaTradeExecutor;
  private connection: Connection | null = null;

  private constructor() {}

  static getInstance(): SolanaTradeExecutor {
    if (!SolanaTradeExecutor.instance) {
      SolanaTradeExecutor.instance = new SolanaTradeExecutor();
    }
    return SolanaTradeExecutor.instance;
  }

  async initialize() {
    const provider = await blockchainService.getProvider();
    this.connection = new Connection(provider.rpcUrl);
    
    if (this.connection) {
      await jupiterTradeService.initialize(this.connection);
    }
    
    console.log('Trade executor initialized with Solana connection');
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection) {
      throw new Error('Trade executor not initialized');
    }

    return jupiterTradeService.executePurchase(tokenAddress, amount);
  }
}
