import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import JSBI from 'jsbi';
import { configurationService } from './ConfigurationService';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// Jupiter types
type QuoteResponse = {
  inAmount: string;
  outAmount: string;
  outAmountWithSlippage: string;
  priceImpactPct: number;
  marketInfos: any[];
  swapTransaction: string;
};

export class JupiterTradeService {
  private static instance: JupiterTradeService;
  private connection: Connection | null = null;
  private tradingWallet: Keypair | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 1000; // 1 second between requests
  private readonly JUPITER_API_URL = 'https://quote-api.jup.ag/v6';

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
      console.log('Waiting for existing initialization to complete');
      await this.initPromise;
      return;
    }

    if (this.connection === connection) {
      console.log('Already initialized with the same connection');
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
      if (!privateKey || typeof privateKey !== 'string') {
        throw new Error('Private key must be a non-empty string');
      }

      // Validate base58 format
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(privateKey)) {
        throw new Error('Private key contains invalid characters. Must be base58 format.');
      }

      // Log key length for debugging
      console.log('Private key length:', privateKey.length);

      // Try to decode the private key
      let secretKey: Uint8Array;
      try {
        secretKey = bs58.decode(privateKey);
        console.log('Decoded key length:', secretKey.length);
        
        if (secretKey.length !== 64) {
          throw new Error(`Invalid decoded key length: ${secretKey.length}. Expected 64 bytes.`);
        }
      } catch (decodeError) {
        console.error('Error decoding private key:', decodeError);
        throw new Error('Failed to decode private key from base58 format');
      }

      // Try to create the keypair
      try {
        const secretKeyBuffer = Buffer.from(secretKey);
        this.tradingWallet = Keypair.fromSecretKey(secretKeyBuffer);
        console.log('Successfully created Keypair. Public key:', this.tradingWallet.publicKey.toString());
      } catch (keypairError) {
        console.error('Error creating Keypair:', keypairError);
        throw new Error('Invalid secret key format for Solana keypair');
      }
    } catch (error) {
      console.error('Error setting trading wallet:', error);
      throw new Error(
        'Invalid wallet private key format. The private key should be in base58 format ' +
        '(approximately 87-88 characters, containing only letters and numbers). ' +
        'Please check your private key value in Supabase secrets.'
      );
    }
  }

  private async fetchQuote(inputMint: string, outputMint: string, amount: number): Promise<QuoteResponse> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: (amount * 1_000_000).toString(),
      slippageBps: '100',
    });

    const response = await fetch(`${this.JUPITER_API_URL}/quote?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch quote from Jupiter');
    }
    return response.json();
  }

  async executePurchase(tokenAddress: string, amount: number): Promise<string> {
    if (!this.connection || !this.tradingWallet) {
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

          const inputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint
          const outputMint = tokenAddress;

          const quote = await this.fetchQuote(inputMint, outputMint, amount);
          console.log('Received quote:', quote);

          await this.waitForRequestWindow();
          const response = await fetch(`${this.JUPITER_API_URL}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quoteResponse: quote,
              userPublicKey: this.tradingWallet.publicKey.toString(),
              wrapUnwrapSOL: true,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to create swap transaction');
          }

          const { swapTransaction } = await response.json();
          const transaction = VersionedTransaction.deserialize(
            Buffer.from(swapTransaction, 'base64')
          );

          transaction.sign([this.tradingWallet]);
          
          await this.waitForRequestWindow();
          const signature = await this.connection.sendRawTransaction(
            transaction.serialize(),
            {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 3,
            }
          );
          
          console.log('Trade executed successfully:', signature);
          return signature;
        } catch (error) {
          console.error(`Attempt ${i + 1} failed:`, error);
          lastError = error;
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
