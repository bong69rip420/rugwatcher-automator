import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import JSBI from 'jsbi';
import { configurationService } from './ConfigurationService';

export class JupiterTradeService {
  private static instance: JupiterTradeService;
  private connection: Connection | null = null;
  private jupiter: Jupiter | null = null;
  private tradingWallet: Keypair | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): JupiterTradeService {
    if (!JupiterTradeService.instance) {
      JupiterTradeService.instance = new JupiterTradeService();
    }
    return JupiterTradeService.instance;
  }

  async initialize(connection: Connection) {
    if (this.initPromise) {
      console.log('Waiting for existing Jupiter initialization to complete');
      await this.initPromise;
      return;
    }

    if (this.jupiter && this.connection === connection) {
      console.log('Jupiter already initialized with the same connection');
      return;
    }

    this.initPromise = this._initialize(connection);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _initialize(connection: Connection) {
    try {
      this.isInitializing = true;
      console.log('Starting Jupiter initialization');
      
      this.connection = connection;
      
      this.jupiter = await Jupiter.load({
        connection,
        cluster: 'mainnet-beta',
        commitment: 'confirmed',
      });
      
      console.log('Jupiter trade service initialized successfully');
    } catch (error) {
      console.error('Error initializing Jupiter:', error);
      this.jupiter = null;
      this.connection = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  setTradingWallet(privateKey: string) {
    try {
      const decodedKey = new Uint8Array(Buffer.from(privateKey, 'base64'));
      this.tradingWallet = Keypair.fromSecretKey(decodedKey);
      console.log('Trading wallet set successfully');
    } catch (error) {
      console.error('Error setting trading wallet:', error);
      throw new Error('Invalid wallet private key format');
    }
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection || !this.jupiter || !this.tradingWallet) {
      throw new Error('Trade service not initialized or wallet not set');
    }

    try {
      const retryCount = 3;
      let lastError: Error | null = null;

      for (let i = 0; i < retryCount; i++) {
        try {
          const config = await configurationService.getTradeConfig();
          console.log('Using trade config:', config);

          const inputMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
          const outputMint = new PublicKey(tokenAddress);

          const routes = await this.jupiter.computeRoutes({
            inputMint,
            outputMint,
            amount: JSBI.BigInt(amount * 1_000_000),
            slippageBps: 100,
            forceFetch: true,
            commitment: 'confirmed'
          });

          if (routes.routesInfos.length === 0) {
            throw new Error('No routes found for trade');
          }

          const bestRoute = routes.routesInfos[0];
          console.log('Selected route:', {
            inAmount: bestRoute.inAmount,
            outAmount: bestRoute.outAmount,
            priceImpactPct: bestRoute.priceImpactPct,
          });

          const { swapTransaction } = await this.jupiter.exchange({
            routeInfo: bestRoute,
            userPublicKey: this.tradingWallet.publicKey,
          });

          if (swapTransaction instanceof VersionedTransaction) {
            swapTransaction.sign([this.tradingWallet]);
            const signature = await this.connection.sendRawTransaction(swapTransaction.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 3,
            });
            console.log('Trade executed successfully:', signature);
            return signature;
          } else {
            throw new Error('Expected VersionedTransaction but received different transaction type');
          }
        } catch (error) {
          console.error(`Attempt ${i + 1} failed:`, error);
          lastError = error;
          continue;
        }
      }

      if (lastError) {
        throw lastError;
      }

      throw new Error('Failed to execute trade after retries');
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }
}

export const jupiterTradeService = JupiterTradeService.getInstance();
