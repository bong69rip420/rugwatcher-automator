import { Connection, PublicKey } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import JSBI from 'jsbi';
import { configurationService } from './ConfigurationService';

export class JupiterTradeService {
  private static instance: JupiterTradeService;
  private connection: Connection | null = null;
  private jupiter: Jupiter | null = null;

  private constructor() {}

  static getInstance(): JupiterTradeService {
    if (!JupiterTradeService.instance) {
      JupiterTradeService.instance = new JupiterTradeService();
    }
    return JupiterTradeService.instance;
  }

  async initialize(connection: Connection) {
    this.connection = connection;
    
    // Initialize Jupiter instance
    this.jupiter = await Jupiter.load({
      connection,
      cluster: 'mainnet-beta',
    });
    
    console.log('Jupiter trade service initialized');
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection || !this.jupiter) {
      throw new Error('Trade service not initialized');
    }

    try {
      const config = await configurationService.getTradeConfig();
      console.log('Using trade config:', config);

      // USDC is commonly used as input token
      const inputMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
      const outputMint = new PublicKey(tokenAddress);

      // Get routes for the swap
      const routes = await this.jupiter.computeRoutes({
        inputMint,
        outputMint,
        amount: JSBI.BigInt(amount * 1_000_000), // Convert to USDC decimals
        slippageBps: 100,
        forceFetch: true
      });

      if (routes.routesInfos.length === 0) {
        throw new Error('No routes found for trade');
      }

      // Select best route
      const bestRoute = routes.routesInfos[0];
      console.log('Selected route:', {
        inAmount: bestRoute.inAmount,
        outAmount: bestRoute.outAmount,
        priceImpactPct: bestRoute.priceImpactPct,
      });

      // Execute the exchange
      const result = await this.jupiter.exchange({
        routeInfo: bestRoute
      });

      // Execute the transaction and extract just the txid
      const swapResult = await result.execute();
      console.log('Trade executed successfully:', swapResult);
      
      // Return just the transaction ID string
      return swapResult.txid;
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }
}

export const jupiterTradeService = JupiterTradeService.getInstance();
