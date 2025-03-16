
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import JSBI from 'jsbi';
import { configurationService } from './ConfigurationService';
import bs58 from 'bs58';

export class JupiterTradeService {
  private static instance: JupiterTradeService;
  private connection: Connection | null = null;
  private tradingWallet: Keypair | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests for testnet
  private readonly JUPITER_TESTNET_API_URL = 'https://quote-api.jup.ag/v6';

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
      await this.initPromise;
      return;
    }

    if (this.connection === connection) {
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
      console.log('Starting initialization');
      this.connection = connection;
      console.log('Initialized successfully');
    } catch (error) {
      console.error('Error initializing:', error);
      this.connection = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  setTradingWallet(privateKeyString: string) {
    try {
      if (!privateKeyString || typeof privateKeyString !== 'string') {
        throw new Error('Private key must be a non-empty string');
      }

      // Clean up the private key string and handle different formats
      privateKeyString = privateKeyString.trim();
      
      // Try to decode the private key
      let secretKey: Uint8Array;
      try {
        // First try base58 decoding
        secretKey = bs58.decode(privateKeyString);
        console.log('Successfully decoded base58 private key, length:', secretKey.length);
      } catch (error) {
        console.error('Failed to decode private key as base58:', error);
        throw new Error('Invalid private key format. Must be a valid Base58 string.');
      }

      // Validate the key length
      if (secretKey.length !== 64) {
        throw new Error(`Invalid private key length: ${secretKey.length}. Expected 64 bytes.`);
      }

      // Create and validate the keypair
      try {
        const newKeypair = Keypair.fromSecretKey(secretKey);
        console.log('Successfully created Solana keypair!');
        const publicKey = newKeypair.publicKey.toString();
        console.log('Public key:', publicKey);
        
        this.tradingWallet = newKeypair;
        return publicKey;
      } catch (error) {
        console.error('Error creating keypair:', error);
        throw new Error('Invalid private key. Could not create Solana keypair.');
      }
    } catch (error) {
      console.error('Error in setTradingWallet:', error);
      throw error;
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

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection || !this.tradingWallet) {
      throw new Error('Trade service not initialized or wallet not set');
    }

    // For testnet simulation
    console.log(`Simulating purchase of ${amount} tokens at address ${tokenAddress} on testnet`);
    return `test-transaction-${Date.now()}`;
  }
}

export const jupiterTradeService = JupiterTradeService.getInstance();
