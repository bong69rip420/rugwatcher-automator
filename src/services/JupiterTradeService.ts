
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
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

  private constructor() {}

  static getInstance(): JupiterTradeService {
    if (!JupiterTradeService.instance) {
      JupiterTradeService.instance = new JupiterTradeService();
    }
    return JupiterTradeService.instance;
  }

  private async waitForRequestWindow() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
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
      if (this.isInitializing) {
        console.log('Already initializing, skipping redundant initialization');
        return;
      }

      this.isInitializing = true;
      console.log('Starting Jupiter initialization');
      
      if (this.jupiter) {
        console.log('Cleaning up existing Jupiter instance');
        this.jupiter = null;
        this.connection = null;
      }

      this.connection = connection;
      
      await this.waitForRequestWindow();
      this.jupiter = await Jupiter.load({
        connection,
        cluster: 'mainnet-beta'
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

  async getWalletBalance(): Promise<number> {
    if (!this.connection || !this.tradingWallet) {
      throw new Error('Connection or wallet not initialized');
    }

    try {
      await this.waitForRequestWindow();
      const balance = await this.connection.getBalance(this.tradingWallet.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      throw error;
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
          await this.waitForRequestWindow();
          
          const config = await configurationService.getTradeConfig();
          console.log('Using trade config:', config);

          const inputMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
          const outputMint = new PublicKey(tokenAddress);

          await this.waitForRequestWindow();
          const routes = await this.jupiter.computeRoutes({
            inputMint,
            outputMint,
            amount: JSBI.BigInt(amount * 1_000_000),
            slippageBps: 100,
            forceFetch: true
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

          await this.waitForRequestWindow();
          const { swapTransaction } = await this.jupiter.exchange({
            routeInfo: bestRoute,
            userPublicKey: this.tradingWallet.publicKey,
          });

          if (swapTransaction instanceof VersionedTransaction) {
            swapTransaction.sign([this.tradingWallet]);
            
            await this.waitForRequestWindow();
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
          // Add delay between retries
          await new Promise(resolve => setTimeout(resolve, 2000));
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
