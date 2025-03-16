
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

      // Clean up the private key string
      privateKeyString = privateKeyString.trim();
      console.log('Processing private key...');

      // Try to decode from base58
      let secretKey: Uint8Array;
      try {
        secretKey = bs58.decode(privateKeyString);
        console.log(`Decoded private key length: ${secretKey.length} bytes`);
        
        if (secretKey.length !== 64) {
          throw new Error(`Invalid key length: ${secretKey.length}. Expected 64 bytes.`);
        }
      } catch (error) {
        console.error('Failed to decode base58 private key:', error);
        throw new Error('Invalid private key format. Must be a valid Base58 Solana private key.');
      }

      // Create the keypair
      try {
        const newKeypair = Keypair.fromSecretKey(secretKey);
        const publicKey = newKeypair.publicKey.toString();
        console.log('Successfully created Solana keypair with public key:', publicKey);
        
        this.tradingWallet = newKeypair;
        return publicKey;
      } catch (error) {
        console.error('Error creating Solana keypair:', error);
        if (error instanceof Error) {
          throw new Error(`Failed to create Solana keypair: ${error.message}`);
        } else {
          throw new Error('Failed to create Solana keypair from private key');
        }
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
      console.log('Retrieved wallet balance:', balance / 1e9, 'SOL');
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
